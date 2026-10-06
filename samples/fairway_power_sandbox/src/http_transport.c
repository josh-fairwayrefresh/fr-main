#include "http_transport.h"

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/net/socket.h>
#include <zephyr/net/tls_credentials.h>
#include <zephyr/posix/fcntl.h>

#include "golfer_txn.h"
#include "thread_priorities.h"

LOG_MODULE_REGISTER(http_transport);

#define TRANSPORT_DNS_READINESS_TIMEOUT_MS        3000
#define TRANSPORT_YIELD_DNS_READINESS_TIMEOUT_MS  2000
#define TRANSPORT_YIELD_CONNECT_POLL_MS           3000
#define TRANSPORT_YIELD_IO_POLL_MS                2000
#define DNS_CACHE_MAX_AGE_MS                      300000

/* Owned deliberately rather than inherited from CONFIG_MAIN_STACK_SIZE
 * (a main-thread sizing concern unrelated to this thread's own needs):
 * zsock_getaddrinfo() resolution involves its own socket/record-parsing
 * buffers on top of normal call depth.
 */
#define DNS_RESOLVER_THREAD_STACK_SIZE 2048

static K_SEM_DEFINE(dns_request_wake_sem, 0, 1);
static K_SEM_DEFINE(dns_result_sem, 0, 1);

/* A resolved address is not assumed valid forever (Cloud Run/GFE addresses
 * are not permanent): entries expire after DNS_CACHE_MAX_AGE_MS and are
 * invalidated outright on a connect failure using the cached address,
 * forcing a fresh resolution next time.
 */
struct dns_cache_entry {
	bool valid;
	int64_t resolved_at_ms;
	struct sockaddr_storage addr;
};
static struct dns_cache_entry dns_cache;
static struct k_spinlock dns_cache_lock;
static bool dns_resolver_busy;

static bool dns_cache_get(struct sockaddr_storage *out, bool *out_stale)
{
	k_spinlock_key_t key = k_spin_lock(&dns_cache_lock);
	bool valid = dns_cache.valid;
	bool stale = valid && (k_uptime_get() - dns_cache.resolved_at_ms > DNS_CACHE_MAX_AGE_MS);

	if (valid) {
		*out = dns_cache.addr;
	}
	k_spin_unlock(&dns_cache_lock, key);
	if (out_stale) {
		*out_stale = stale;
	}
	return valid;
}

static void dns_cache_set(const struct sockaddr_storage *addr)
{
	k_spinlock_key_t key = k_spin_lock(&dns_cache_lock);

	dns_cache.valid = true;
	dns_cache.resolved_at_ms = k_uptime_get();
	dns_cache.addr = *addr;
	k_spin_unlock(&dns_cache_lock, key);
}

static void dns_cache_invalidate(void)
{
	k_spinlock_key_t key = k_spin_lock(&dns_cache_lock);

	dns_cache.valid = false;
	k_spin_unlock(&dns_cache_lock, key);
}

bool http_transport_dns_prewarm(void)
{
	k_spinlock_key_t key = k_spin_lock(&dns_cache_lock);
	bool kicked = false;

	if (!dns_resolver_busy) {
		dns_resolver_busy = true;
		kicked = true;
	}
	k_spin_unlock(&dns_cache_lock, key);
	if (kicked) {
		k_sem_reset(&dns_result_sem);
		k_sem_give(&dns_request_wake_sem);
	}
	return kicked;
}

static void dns_resolver_thread_entry(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);

	while (1) {
		k_sem_take(&dns_request_wake_sem, K_FOREVER);

		struct zsock_addrinfo hints = { .ai_family = AF_INET, .ai_socktype = SOCK_STREAM };
		struct zsock_addrinfo *res = NULL;
		/* NCS 3.1.1 exposes no application-level bound for this call.
		 * Isolation prevents it from stranding the transaction scheduler.
		 */
		int ret = zsock_getaddrinfo(FAIRWAY_HOST, "443", &hints, &res);

		if (ret == 0) {
			struct sockaddr_storage addr = {0};

			memcpy(&addr, res->ai_addr, res->ai_addrlen);
			dns_cache_set(&addr);
			zsock_freeaddrinfo(res);
		}

		k_spinlock_key_t key = k_spin_lock(&dns_cache_lock);

		dns_resolver_busy = false;
		k_spin_unlock(&dns_cache_lock, key);
		k_sem_give(&dns_result_sem);
	}
}
K_THREAD_DEFINE(dns_resolver_thread, DNS_RESOLVER_THREAD_STACK_SIZE,
		dns_resolver_thread_entry, NULL, NULL, NULL,
		DNS_RESOLVER_THREAD_PRIORITY, 0, 0);

/* Bounded accessor: never returns later than bound_ms. A cache hit (fresh
 * or stale) returns immediately at zero wait; a stale hit also triggers a
 * background refresh for next time.
 */
static int dns_get_address_bounded(struct sockaddr_storage *out, int64_t bound_ms)
{
	bool stale = false;

	if (dns_cache_get(out, &stale)) {
		if (stale) {
			http_transport_dns_prewarm();
		}
		return 0;
	}

	http_transport_dns_prewarm();
	if (bound_ms <= 0) {
		return -ETIMEDOUT;
	}
	k_sem_take(&dns_result_sem, K_MSEC(bound_ms));
	if (dns_cache_get(out, NULL)) {
		return 0;
	}
	return -ETIMEDOUT;
}

/* Bounded poll-based stage wait: never blocks longer than remaining_ms,
 * regardless of NCS socket-timeout-option semantics.
 */
static int socket_stage_deadline(int fd, short events, int64_t remaining_ms)
{
	if (remaining_ms <= 0) {
		return -ETIMEDOUT;
	}

	struct zsock_pollfd pfd = { .fd = fd, .events = events };
	int ret = zsock_poll(&pfd, 1, (int)remaining_ms);

	if (ret <= 0) {
		return -ETIMEDOUT;
	}
	if (pfd.revents & (ZSOCK_POLLERR | ZSOCK_POLLHUP)) {
		return -ECONNRESET;
	}
	return 0;
}

/* NCS 3.1.1 does not document SO_SNDTIMEO/SO_RCVTIMEO as bounding
 * zsock_connect() on this offloaded socket stack (only send/recv, per
 * POSIX convention); a nonblocking connect plus zsock_poll()'s own
 * timeout parameter is the only verified way to enforce a hard connect
 * deadline.
 */
static int socket_connect_bounded(int fd, const struct sockaddr *addr, socklen_t len,
				   int64_t remaining_ms)
{
	int flags = zsock_fcntl(fd, F_GETFL, 0);
	int ret;

	zsock_fcntl(fd, F_SETFL, flags | O_NONBLOCK);

	ret = zsock_connect(fd, addr, len);
	if (ret == 0) {
		return 0;
	}
	if (errno != EINPROGRESS) {
		return -errno;
	}
	if (socket_stage_deadline(fd, ZSOCK_POLLOUT, remaining_ms) != 0) {
		return -ETIMEDOUT;
	}

	int so_error = 0;
	socklen_t elen = sizeof(so_error);

	zsock_getsockopt(fd, SOL_SOCKET, SO_ERROR, &so_error, &elen);
	return so_error ? -so_error : 0;
}

int http_transport_send(const char *request, int request_len,
			 int64_t attempt_deadline_ms, bool yieldable,
			 struct http_transport_response *response)
{
	int fd = -1;
	int ret;
	int64_t remaining_ms;
	struct sockaddr_storage addr;
	socklen_t addr_len;

	static char recv_buf[4096];

	int verify = TLS_PEER_VERIFY_REQUIRED;
	sec_tag_t sec_tag_list[] = { FAIRWAY_TLS_SEC_TAG };

	LOG_INF("Sending HTTPS request to Cloud Run");

	if (yieldable && golfer_txn_is_pending()) {
		return -ECANCELED;
	}

	remaining_ms = attempt_deadline_ms - k_uptime_get();
	ret = dns_get_address_bounded(&addr,
		yieldable ? MIN(remaining_ms, (int64_t)TRANSPORT_YIELD_DNS_READINESS_TIMEOUT_MS)
			  : MIN(remaining_ms, (int64_t)TRANSPORT_DNS_READINESS_TIMEOUT_MS));
	if (ret != 0) {
		LOG_WRN("HTTPS DNS not ready within bound: %d", ret);
		return ret;
	}
	if (yieldable && golfer_txn_is_pending()) {
		return -ECANCELED;
	}

	addr_len = (addr.ss_family == AF_INET) ? sizeof(struct sockaddr_in)
						: sizeof(struct sockaddr_in6);

	fd = zsock_socket(addr.ss_family, SOCK_STREAM, IPPROTO_TLS_1_2);
	if (fd < 0) {
		ret = -errno;
		LOG_ERR("HTTPS zsock_socket failed: errno %d", errno);
		goto out;
	}

	ret = zsock_setsockopt(fd, SOL_TLS, TLS_PEER_VERIFY,
			       &verify, sizeof(verify));
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS TLS_PEER_VERIFY failed: errno %d", errno);
		goto out;
	}

	ret = zsock_setsockopt(fd, SOL_TLS, TLS_SEC_TAG_LIST,
			       sec_tag_list, sizeof(sec_tag_list));
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS TLS_SEC_TAG_LIST failed: errno %d", errno);
		goto out;
	}

	ret = zsock_setsockopt(fd, SOL_TLS, TLS_HOSTNAME,
			       FAIRWAY_HOST, strlen(FAIRWAY_HOST));
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS TLS_HOSTNAME failed: errno %d", errno);
		goto out;
	}

	if (yieldable && golfer_txn_is_pending()) {
		ret = -ECANCELED;
		goto out;
	}

	remaining_ms = attempt_deadline_ms - k_uptime_get();
	LOG_INF("Connecting to %s:443", FAIRWAY_HOST);
	ret = socket_connect_bounded(fd, (struct sockaddr *)&addr, addr_len,
		yieldable ? MIN(remaining_ms, (int64_t)TRANSPORT_YIELD_CONNECT_POLL_MS)
			  : remaining_ms);
	if (ret != 0) {
		LOG_ERR("HTTPS connect failed: %d", ret);
		if (ret == -ECONNREFUSED || ret == -ETIMEDOUT) {
			dns_cache_invalidate();
		}
		goto out;
	}

	LOG_INF("HTTPS socket connected");

	if (yieldable && golfer_txn_is_pending()) {
		ret = -ECANCELED;
		goto out;
	}

	remaining_ms = attempt_deadline_ms - k_uptime_get();
	ret = socket_stage_deadline(fd, ZSOCK_POLLOUT,
		yieldable ? MIN(remaining_ms, (int64_t)TRANSPORT_YIELD_IO_POLL_MS) : remaining_ms);
	if (ret != 0) {
		goto out;
	}

	ret = zsock_send(fd, request, request_len, 0);
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS zsock_send failed: errno %d", errno);
		goto out;
	}

	LOG_INF("HTTPS request sent: %d bytes", ret);

	if (yieldable && golfer_txn_is_pending()) {
		ret = -ECANCELED;
		goto out;
	}

	remaining_ms = attempt_deadline_ms - k_uptime_get();
	ret = socket_stage_deadline(fd, ZSOCK_POLLIN,
		yieldable ? MIN(remaining_ms, (int64_t)TRANSPORT_YIELD_IO_POLL_MS) : remaining_ms);
	if (ret != 0) {
		goto out;
	}

	ret = zsock_recv(fd, recv_buf, sizeof(recv_buf) - 1, 0);
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS zsock_recv failed: errno %d", errno);
		goto out;
	}

	recv_buf[ret] = '\0';
	LOG_INF("HTTPS response received: %d bytes", ret);
	LOG_INF("HTTPS response preview: %.80s", recv_buf);

	if (yieldable && golfer_txn_is_pending()) {
		ret = -ECANCELED;
		goto out;
	}

	{
		int http_status = 0;
		bool http_status_valid;

		http_status_valid = sscanf(recv_buf, "HTTP/%*u.%*u %d", &http_status) == 1;

		if (!http_status_valid || http_status < 200 || http_status >= 300) {
			ret = (http_status == 400 || http_status == 401 ||
			       http_status == 403 || http_status == 404) ? -EACCES : -EPROTO;
			goto out;
		}

		char *body = strstr(recv_buf, "\r\n\r\n");

		response->http_status = http_status;
		response->body = NULL;
		response->body_len = 0;
		if (body != NULL) {
			body += 4;
			response->body = body;
			response->body_len = (size_t)ret - (size_t)(body - recv_buf);
		}
	}

	LOG_INF("Cloud Run HTTPS request succeeded");
	ret = 0;

out:
	if (fd >= 0) {
		zsock_close(fd);
	}
	return ret;
}
