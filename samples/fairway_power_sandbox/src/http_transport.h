#ifndef HTTP_TRANSPORT_H
#define HTTP_TRANSPORT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define FAIRWAY_TLS_SEC_TAG 42

/* Single authoritative owner of the Cloud Run host name; golfer_protocol
 * and command_protocol build their Host: header from this, never their
 * own literal, so there is exactly one place this value can drift.
 */
#define FAIRWAY_HOST "fairway-button-receiver-936892386735.us-central1.run.app"

/*
 * Shared authenticated HTTPS transport primitive for golfer and COMPLETE.
 *
 * This module owns DNS (a shared, spinlock-protected cache for the fixed
 * Cloud Run host, served by an isolated resolver thread -- zsock_getaddrinfo()
 * itself only ever executes there, since NCS 3.1.1 exposes no
 * application-level bound for that call) and the bounded nonblocking
 * socket/TLS mechanics. It deliberately knows nothing about golfer or
 * COMPLETE wire-protocol shapes: it hands back the raw successful response
 * body, and golfer_protocol/command_protocol each parse it themselves. That
 * keeps this module a one-way dependency for every caller, with no
 * backward reach into domain-specific parsing.
 */

struct http_transport_response {
	int http_status;
	/* Points into an internal static buffer, valid only until the next
	 * http_transport_send() call on this thread. Non-const because
	 * Zephyr's JSON parser tokenizes in place. Single-caller model
	 * (transaction_scheduler is the sole user of the shared transport),
	 * matching the original design.
	 */
	char *body;
	size_t body_len;
};

/* Returns true and kicks off the resolver thread if no resolution is
 * already in flight. Never blocks. Exposed so modem_service can trigger a
 * registration-triggered prewarm without waiting on it.
 */
bool http_transport_dns_prewarm(void);

/*
 * Return value convention:
 *   0           HTTP 2xx (response populated).
 *   -EACCES     HTTP 400/401/403/404 (terminal; caller does not retry).
 *   -EPROTO     Any other received-but-unsuccessful or malformed response.
 *   -ECANCELED  Yielded to an accepted golfer press (yieldable only).
 *   -errno/-ETIMEDOUT  No response could be obtained at all.
 *
 * When yieldable is true (COMPLETE only), golfer_txn_is_pending() is
 * checked before/after every stage; a pending golfer press aborts this
 * call immediately with -ECANCELED so COMPLETE never holds the shared
 * transport once a golfer transaction has been accepted. The golfer's own
 * flow (yieldable=false) never checks this and is never itself aborted.
 */
int http_transport_send(const char *request, int request_len,
			 int64_t attempt_deadline_ms, bool yieldable,
			 struct http_transport_response *response);

#endif /* HTTP_TRANSPORT_H */
