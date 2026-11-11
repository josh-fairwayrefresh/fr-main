#include "command_protocol.h"

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <zephyr/data/json.h>
#include <zephyr/sys/printk.h>
#include <zephyr/sys/util.h>

#include "device_identity.h"
#include "http_transport.h"

static char http_response_buffer[4096];

struct complete_command_json {
	const char *command_id;
	const char *device_id;
	const char *type;
	const char *request_id;
};

static const struct json_obj_descr complete_command_descr[] = {
	JSON_OBJ_DESCR_PRIM(struct complete_command_json, command_id, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct complete_command_json, device_id, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct complete_command_json, type, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct complete_command_json, request_id, JSON_TOK_STRING),
};

struct command_poll_response_json {
	struct complete_command_json command;
};

static const struct json_obj_descr command_poll_response_descr[] = {
	JSON_OBJ_DESCR_OBJECT(struct command_poll_response_json, command,
			      complete_command_descr),
};

static bool copy_id(char *destination, size_t destination_len, const char *source)
{
	if (source == NULL || source[0] == '\0' || strlen(source) >= destination_len) {
		return false;
	}

	strcpy(destination, source);
	return true;
}

bool fairway_parse_complete_command(char *body, size_t body_len,
				    const char *active_device_id,
				    const char *active_request_id,
				    struct fairway_complete_command *command)
{
	struct command_poll_response_json response = {0};

	if (body == NULL || body_len == 0 || active_device_id == NULL ||
	    active_request_id == NULL || command == NULL ||
	    json_obj_parse(body, body_len, command_poll_response_descr,
			   ARRAY_SIZE(command_poll_response_descr), &response) < 0 ||
	    response.command.device_id == NULL ||
	    strcmp(response.command.device_id, active_device_id) != 0 ||
	    response.command.type == NULL || strcmp(response.command.type, "complete") != 0 ||
	    response.command.request_id == NULL ||
	    strcmp(response.command.request_id, active_request_id) != 0) {
		return false;
	}

	return copy_id(command->command_id, sizeof(command->command_id),
		       response.command.command_id) &&
	       copy_id(command->request_id, sizeof(command->request_id),
		       response.command.request_id);
}

int command_protocol_send_poll(const char *active_request_id,
			       struct fairway_complete_command *command,
			       int64_t attempt_deadline_ms)
{
	char body[256];
	char request[768];
	struct fairway_device_identity identity;
	int ret = fairway_device_identity_load(&identity);

	if (ret != 0) {
		return ret;
	}

	int body_len = snprintk(body, sizeof(body),
		"{\"device_id\":\"%s\",\"active_request_id\":\"%s\"}",
		identity.device_id, active_request_id);

	if (body_len < 0 || body_len >= sizeof(body)) {
		memset(&identity, 0, sizeof(identity));
		return -ENOMEM;
	}

	int request_len = snprintk(request, sizeof(request),
		"POST /api/v1/device-commands/poll HTTP/1.1\r\n"
		"Host: " FAIRWAY_HOST "\r\n"
		"Content-Type: application/json\r\n"
		"X-Fairway-Device-Key: %s\r\n"
		"Content-Length: %d\r\nConnection: close\r\n\r\n%s",
		identity.device_key, body_len, body);

	if (request_len < 0 || request_len >= sizeof(request)) {
		memset(&identity, 0, sizeof(identity));
		memset(body, 0, sizeof(body));
		return -ENOMEM;
	}

	command->command_id[0] = '\0';

	struct http_transport_response response = {
		.storage = http_response_buffer,
		.storage_capacity = sizeof(http_response_buffer),
	};
	ret = http_transport_send(request, request_len, attempt_deadline_ms, true, &response);
	memset(request, 0, sizeof(request));
	memset(body, 0, sizeof(body));

	if (ret != 0) {
		memset(http_response_buffer, 0, sizeof(http_response_buffer));
		memset(&identity, 0, sizeof(identity));
		return ret;
	}

	(void)fairway_parse_complete_command(response.body, response.body_len,
					     identity.device_id, active_request_id, command);
	memset(http_response_buffer, 0, sizeof(http_response_buffer));
	memset(&identity, 0, sizeof(identity));
	return 0;
}

int command_protocol_send_ack(const struct fairway_complete_command *command,
			      int64_t attempt_deadline_ms)
{
	char body[256];
	char request[768];
	struct fairway_device_identity identity;

	int ret = fairway_device_identity_load(&identity);

	if (ret != 0) {
		return ret;
	}

	int body_len = snprintk(body, sizeof(body),
		"{\"device_id\":\"%s\",\"request_id\":\"%s\"}",
		identity.device_id, command->request_id);

	if (body_len < 0 || body_len >= sizeof(body)) {
		memset(&identity, 0, sizeof(identity));
		return -ENOMEM;
	}

	int request_len = snprintk(request, sizeof(request),
		"POST /api/v1/device-commands/%s/ack HTTP/1.1\r\n"
		"Host: " FAIRWAY_HOST "\r\n"
		"Content-Type: application/json\r\n"
		"X-Fairway-Device-Key: %s\r\n"
		"Content-Length: %d\r\nConnection: close\r\n\r\n%s",
		command->command_id, identity.device_key, body_len, body);

	if (request_len < 0 || request_len >= sizeof(request)) {
		memset(&identity, 0, sizeof(identity));
		memset(body, 0, sizeof(body));
		return -ENOMEM;
	}

	struct http_transport_response response = {
		.storage = http_response_buffer,
		.storage_capacity = sizeof(http_response_buffer),
	};

	ret = http_transport_send(request, request_len, attempt_deadline_ms, true, &response);
	memset(request, 0, sizeof(request));
	memset(body, 0, sizeof(body));
	memset(&identity, 0, sizeof(identity));
	memset(http_response_buffer, 0, sizeof(http_response_buffer));
	return ret;
}
