#include "golfer_protocol.h"

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <zephyr/data/json.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/util.h>

#include "http_transport.h"
#include "secrets/fairway_device_key.h"

LOG_MODULE_REGISTER(golfer_protocol);

#define GOLFER_MAX_ATTEMPTS               2
#define GOLFER_MIN_RETRY_RESERVE_MS       3000

struct button_response_json {
	const char *status;
	const char *event_type;
	const char *request_id;
	uint64_t golfer_demand_window_ms;
	uint64_t demand_window_remaining_ms;
	bool duplicate;
};

static const struct json_obj_descr button_response_descr[] = {
	JSON_OBJ_DESCR_PRIM(struct button_response_json, status, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct button_response_json, event_type, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct button_response_json, request_id, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct button_response_json, golfer_demand_window_ms, JSON_TOK_UINT64),
	JSON_OBJ_DESCR_PRIM(struct button_response_json, demand_window_remaining_ms, JSON_TOK_UINT64),
	JSON_OBJ_DESCR_PRIM(struct button_response_json, duplicate, JSON_TOK_TRUE),
};

static bool copy_id(char *destination, size_t destination_len, const char *source)
{
	if (source == NULL || source[0] == '\0' || strlen(source) >= destination_len) {
		return false;
	}

	strcpy(destination, source);
	return true;
}

bool golfer_protocol_parse_acceptance(char *body, size_t body_len,
				      struct golfer_acceptance *acceptance)
{
	struct button_response_json response = {0};
	const int64_t required_fields = (INT64_C(1) << 0) | (INT64_C(1) << 1) |
		(INT64_C(1) << 2) | (INT64_C(1) << 3) | (INT64_C(1) << 5);
	const int64_t remaining_field = INT64_C(1) << 4;
	int64_t parsed_fields;

	if (body == NULL || body_len == 0 || acceptance == NULL ||
	    (parsed_fields = json_obj_parse(body, body_len, button_response_descr,
					    ARRAY_SIZE(button_response_descr), &response)) < 0 ||
	    (parsed_fields & required_fields) != required_fields ||
	    strcmp(response.status, "accepted") != 0 ||
	    strcmp(response.event_type, "button_press") != 0 ||
	    response.golfer_demand_window_ms == 0 ||
	    response.golfer_demand_window_ms > UINT32_MAX ||
	    (response.duplicate && !(parsed_fields & remaining_field)) ||
	    (!response.duplicate && (parsed_fields & remaining_field)) ||
	    (response.duplicate &&
	     (response.demand_window_remaining_ms > UINT32_MAX ||
	      response.demand_window_remaining_ms > response.golfer_demand_window_ms))) {
		return false;
	}

	if (!copy_id(acceptance->request_id, sizeof(acceptance->request_id), response.request_id)) {
		return false;
	}
	acceptance->golfer_demand_window_ms =
		(uint32_t)response.golfer_demand_window_ms;
	acceptance->demand_window_remaining_ms = response.duplicate
		? (uint32_t)response.demand_window_remaining_ms : 0;
	acceptance->duplicate = response.duplicate;
	return true;
}

static int send_button_press(int64_t attempt_deadline_ms,
			     struct golfer_acceptance *acceptance)
{
	static char request_body[192];
	int request_body_len;
	int64_t send_time_ms = k_uptime_get();

	if (send_time_ms >= attempt_deadline_ms) {
		return -ETIMEDOUT;
	}

	request_body_len = snprintk(request_body, sizeof(request_body),
		"{\"device_id\":\"%s\",\"event_type\":\"button_press\"}",
		FAIRWAY_DEVICE_ID);

	if (request_body_len < 0 || (size_t)request_body_len >= sizeof(request_body)) {
		LOG_ERR("HTTPS request body buffer too small");
		return -ENOMEM;
	}

	static char request[512];
	int request_len;

	request_len = snprintk(request, sizeof(request),
		"POST / HTTP/1.1\r\n"
		"Host: " FAIRWAY_HOST "\r\n"
		"Content-Type: application/json\r\n"
		"X-Fairway-Device-Key: " FAIRWAY_DEVICE_KEY "\r\n"
		"Content-Length: %d\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		request_body_len,
		request_body);

	if (request_len < 0 || (size_t)request_len >= sizeof(request)) {
		LOG_ERR("HTTPS request buffer too small");
		return -ENOMEM;
	}

	struct http_transport_response response;
	int ret = http_transport_send(request, request_len, attempt_deadline_ms, false,
				      &response);

	if (ret != 0) {
		return ret;
	}

	acceptance->response_received_ms = k_uptime_get();
	if (!golfer_protocol_parse_acceptance(response.body, response.body_len, acceptance)) {
		return -EPROTO;
	}

	return 0;
}

int golfer_protocol_run_transaction(int64_t txn_deadline_ms,
				    int64_t press_time_ms,
				    struct golfer_acceptance *acceptance)
{
	int ret = -ETIMEDOUT;

	if (acceptance == NULL || press_time_ms < 0 || txn_deadline_ms <= press_time_ms) {
		return -EINVAL;
	}
	memset(acceptance, 0, sizeof(*acceptance));
	acceptance->press_time_ms = press_time_ms;

	for (int attempt = 0; attempt < GOLFER_MAX_ATTEMPTS; attempt++) {
		int64_t now_ms = k_uptime_get();
		int64_t remaining_ms = txn_deadline_ms - now_ms;

		if (remaining_ms <= 0) {
			break;
		}
		if (attempt > 0 && remaining_ms < GOLFER_MIN_RETRY_RESERVE_MS) {
			break;
		}

		ret = send_button_press(txn_deadline_ms, acceptance);
		if (ret == 0 || ret == -EACCES) {
			break;
		}
	}

	return ret;
}
