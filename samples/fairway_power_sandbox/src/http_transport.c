#include "http_transport.h"

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/time.h>

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/net/socket.h>
#include <zephyr/net/tls_credentials.h>

#include "golfer_txn.h"
#include "thread_priorities.h"

LOG_MODULE_REGISTER(http_transport);

#define TRANSPORT_DNS_READINESS_TIMEOUT_MS        3000
#define TRANSPORT_YIELD_DNS_READINESS_TIMEOUT_MS  2000
#define TRANSPORT_YIELD_CONNECT_TIMEOUT_MS        3000
#define TRANSPORT_YIELD_IO_TIMEOUT_MS             2000
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

/* nRF Modem Library documents SO_SNDTIMEO as bounding connect(), send(),
 * and sendto(). In particular, connect() on a TLS socket completes the TLS
 * handshake before returning. Keep the connect blocking so the modem owns
 * the handshake lifecycle, while bounding it to the transaction deadline.
 */
static int socket_set_timeout(int fd, int option, int64_t deadline_ms)
{
	int64_t remaining_ms = deadline_ms - k_uptime_get();
	struct timeval timeout;

	if (remaining_ms <= 0) {
		return -ETIMEDOUT;
	}

	timeout.tv_sec = remaining_ms / 1000;
	timeout.tv_usec = (remaining_ms % 1000) * 1000;
	if (zsock_setsockopt(fd, SOL_SOCKET, option, &timeout, sizeof(timeout)) < 0) {
		return -errno;
	}
	return 0;
}

static int socket_connect_bounded(int fd, const struct sockaddr *addr, socklen_t len,
				  int64_t deadline_ms, bool yieldable)
{
	int64_t connect_deadline = deadline_ms;

	if (yieldable) {
		connect_deadline = MIN(deadline_ms,
				       k_uptime_get() + TRANSPORT_YIELD_CONNECT_TIMEOUT_MS);
	}
	int ret = socket_set_timeout(fd, SO_SNDTIMEO, connect_deadline);

	if (ret != 0) {
		return ret;
	}
	if (zsock_connect(fd, addr, len) < 0) {
		return -errno;
	}
	return 0;
}

static int socket_send_all(int fd, const char *data, size_t length,
			   int64_t deadline_ms, bool yieldable)
{
	size_t sent = 0;

	while (sent < length) {
		int64_t io_deadline = deadline_ms;

		if (yieldable) {
			if (golfer_txn_is_pending()) {
				return -ECANCELED;
			}
			io_deadline = MIN(deadline_ms,
					  k_uptime_get() + TRANSPORT_YIELD_IO_TIMEOUT_MS);
		}
		int ret = socket_set_timeout(fd, SO_SNDTIMEO, io_deadline);

		if (ret != 0) {
			return ret;
		}

		ret = zsock_send(fd, data + sent, length - sent, 0);
		if (yieldable && golfer_txn_is_pending()) {
			return -ECANCELED;
		}
		if (ret < 0) {
			return -errno;
		}
		if (ret == 0) {
			return -EPIPE;
		}
		sent += ret;
	}
	return 0;
}

enum http_response_body_state {
	HTTP_RESPONSE_HEADERS_INCOMPLETE = -1,
	HTTP_RESPONSE_CLOSE_DELIMITED,
	HTTP_RESPONSE_CONTENT_INCOMPLETE,
	HTTP_RESPONSE_CONTENT_COMPLETE,
};

static enum http_response_body_state http_response_get_body_state(const char *data,
								   size_t length)
{
	const char *header_end = strstr(data, "\r\n\r\n");
	const char *line;

	if (header_end == NULL) {
		return HTTP_RESPONSE_HEADERS_INCOMPLETE;
	}

	line = strstr(data, "\r\n");
	if (line == NULL || line >= header_end) {
		return HTTP_RESPONSE_HEADERS_INCOMPLETE;
	}
	line += 2;
	while (line < header_end) {
		const char *line_end = strstr(line, "\r\n");

		if (line_end == NULL || line_end > header_end) {
			line_end = header_end;
		}
		if ((size_t)(line_end - line) >= sizeof("Content-Length:") - 1 &&
		    strncasecmp(line, "Content-Length:",
				sizeof("Content-Length:") - 1) == 0) {
			const char *value = line + sizeof("Content-Length:") - 1;
			char *end;
			unsigned long content_length;

			while (value < line_end && (*value == ' ' || *value == '\t')) {
				value++;
			}
			if (value == line_end || *value < '0' || *value > '9') {
				return HTTP_RESPONSE_HEADERS_INCOMPLETE;
			}
			errno = 0;
			content_length = strtoul(value, &end, 10);
			if (errno == ERANGE) {
				return HTTP_RESPONSE_HEADERS_INCOMPLETE;
			}
			while (end < line_end && (*end == ' ' || *end == '\t')) {
				end++;
			}
			if (end != line_end) {
				return HTTP_RESPONSE_HEADERS_INCOMPLETE;
			}
			return length - (size_t)(header_end + 4 - data) >= content_length
				       ? HTTP_RESPONSE_CONTENT_COMPLETE
				       : HTTP_RESPONSE_CONTENT_INCOMPLETE;
		}
		line = line_end + 2;
	}
	return HTTP_RESPONSE_CLOSE_DELIMITED;
}

static int socket_receive_response(int fd, char *buffer, size_t capacity,
				   size_t *received, int64_t deadline_ms, bool yieldable)
{
	*received = 0;
	buffer[0] = '\0';

	while (*received < capacity - 1) {
		int64_t io_deadline = deadline_ms;

		if (yieldable) {
			if (golfer_txn_is_pending()) {
				return -ECANCELED;
			}
			io_deadline = MIN(deadline_ms,
					  k_uptime_get() + TRANSPORT_YIELD_IO_TIMEOUT_MS);
		}
		int ret = socket_set_timeout(fd, SO_RCVTIMEO, io_deadline);

		if (ret != 0) {
			return ret;
		}

		ret = zsock_recv(fd, buffer + *received, capacity - 1 - *received, 0);
		if (yieldable && golfer_txn_is_pending()) {
			return -ECANCELED;
		}
		if (ret < 0) {
			return -errno;
		}
		if (ret == 0) {
			enum http_response_body_state body_state;

			if (*received == 0) {
				return -ECONNRESET;
			}
			body_state = http_response_get_body_state(buffer, *received);
			return (body_state == HTTP_RESPONSE_HEADERS_INCOMPLETE ||
				body_state == HTTP_RESPONSE_CONTENT_INCOMPLETE)
				       ? -EPROTO
				       : 0;
		}
		*received += ret;
		buffer[*received] = '\0';
		if (http_response_get_body_state(buffer, *received) ==
		    HTTP_RESPONSE_CONTENT_COMPLETE) {
			return 0;
		}
	}
	return -EMSGSIZE;
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
	size_t recv_len;

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

	if (addr.ss_family == AF_INET) {
		char address_text[INET_ADDRSTRLEN];
		const struct sockaddr_in *ipv4 = (const struct sockaddr_in *)&addr;

		if (zsock_inet_ntop(AF_INET, &ipv4->sin_addr, address_text,
				    sizeof(address_text)) != NULL) {
			LOG_INF("Connecting to %s (%s):443", FAIRWAY_HOST, address_text);
		} else {
			LOG_INF("Connecting to %s:443", FAIRWAY_HOST);
		}
	} else {
		LOG_INF("Connecting to %s:443", FAIRWAY_HOST);
	}
	ret = socket_connect_bounded(fd, (struct sockaddr *)&addr, addr_len,
				    attempt_deadline_ms, yieldable);
	if (yieldable && golfer_txn_is_pending()) {
		ret = -ECANCELED;
		goto out;
	}
	if (ret != 0) {
		LOG_ERR("HTTPS TLS connect/handshake failed: %d", ret);
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

	ret = socket_send_all(fd, request, request_len, attempt_deadline_ms, yieldable);
	if (ret != 0) {
		LOG_ERR("HTTPS request send failed: %d", ret);
		goto out;
	}

	LOG_INF("HTTPS request sent: %d bytes", request_len);

	if (yieldable && golfer_txn_is_pending()) {
		ret = -ECANCELED;
		goto out;
	}

	ret = socket_receive_response(fd, recv_buf, sizeof(recv_buf),
				     &recv_len, attempt_deadline_ms, yieldable);
	if (ret != 0) {
		LOG_ERR("HTTPS response receive failed: %d", ret);
		goto out;
	}

	LOG_INF("HTTPS response received: %u bytes", (unsigned int)recv_len);
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
			response->body_len = recv_len - (size_t)(body - recv_buf);
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
