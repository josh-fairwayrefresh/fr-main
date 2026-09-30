#ifndef COMMAND_PROTOCOL_H
#define COMMAND_PROTOCOL_H

#include <stdbool.h>
#include <stddef.h>

#define FAIRWAY_REQUEST_ID_MAX 96
#define FAIRWAY_COMMAND_ID_MAX 128

struct fairway_complete_command {
	char command_id[FAIRWAY_COMMAND_ID_MAX];
	char request_id[FAIRWAY_REQUEST_ID_MAX];
};

bool fairway_parse_button_response(char *body, size_t body_len,
				   char *request_id, size_t request_id_len);

bool fairway_parse_complete_command(char *body, size_t body_len,
				    const char *active_device_id,
				    const char *active_request_id,
				    struct fairway_complete_command *command);

#endif /* COMMAND_PROTOCOL_H */