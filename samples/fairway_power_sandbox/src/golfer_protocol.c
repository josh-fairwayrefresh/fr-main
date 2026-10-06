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
	const char *request_id;
};

static const struct json_obj_descr button_response_descr[] = {
	JSON_OBJ_DESCR_PRIM(struct button_response_json, request_id, JSON_TOK_STRING),
};

static bool copy_id(char *destination, size_t destination_len, const char *source)
{
	if (source == NULL || source[0] == '\0' || strlen(source) >= destination_len) {
		return false;
	}

	strcpy(destination, source);
	return true;
}

static bool fairway_parse_button_response(char *body, size_t body_len,
					  char *request_id, size_t request_id_len)
{
	struct button_response_json response = {0};

	if (body == NULL || body_len == 0 || request_id == NULL || request_id_len == 0 ||
	    json_obj_parse(body, body_len, button_response_descr,
			   ARRAY_SIZE(button_response_descr), &response) < 0) {
		return false;
	}

	return copy_id(request_id, request_id_len, response.request_id);
}

static int send_button_press(int64_t attempt_deadline_ms,
			     char *request_id, size_t request_id_len)
{
	static char request_body[128];
	int request_body_len;

	request_body_len = snprintk(request_body, sizeof(request_body),
		"{\"device_id\":\"%s\",\"event_type\":\"button_press\"}",
		FAIRWAY_DEVICE_ID);

	if (request_body_len < 0 || request_body_len >= sizeof(request_body)) {
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

	if (request_len < 0 || request_len >= sizeof(request)) {
		LOG_ERR("HTTPS request buffer too small");
		return -ENOMEM;
	}

	struct http_transport_response response;
	int ret = http_transport_send(request, request_len, attempt_deadline_ms, false,
				      &response);

	if (ret != 0) {
		return ret;
	}

	if (!fairway_parse_button_response(response.body, response.body_len,
					   request_id, request_id_len)) {
		return -EPROTO;
	}

	return 0;
}

int golfer_protocol_run_transaction(int64_t txn_deadline_ms,
				    char *request_id, size_t request_id_len)
{
	int ret = -ETIMEDOUT;

	request_id[0] = '\0';

	for (int attempt = 0; attempt < GOLFER_MAX_ATTEMPTS; attempt++) {
		int64_t now_ms = k_uptime_get();
		int64_t remaining_ms = txn_deadline_ms - now_ms;

		if (remaining_ms <= 0) {
			break;
		}
		if (attempt > 0 && remaining_ms < GOLFER_MIN_RETRY_RESERVE_MS) {
			break;
		}

		ret = send_button_press(txn_deadline_ms, request_id, request_id_len);
		if (ret == 0 || ret == -EACCES) {
			break;
		}
	}

	return ret;
}
