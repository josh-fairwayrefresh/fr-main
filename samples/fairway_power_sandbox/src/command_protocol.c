#include "command_protocol.h"

#include <string.h>

#include <zephyr/data/json.h>
#include <zephyr/sys/util.h>

struct button_response_json {
	const char *request_id;
};

static const struct json_obj_descr button_response_descr[] = {
	JSON_OBJ_DESCR_PRIM(struct button_response_json, request_id, JSON_TOK_STRING),
};

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

bool fairway_parse_button_response(char *body, size_t body_len,
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