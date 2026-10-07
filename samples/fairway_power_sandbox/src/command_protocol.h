#ifndef COMMAND_PROTOCOL_H
#define COMMAND_PROTOCOL_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "golfer_acceptance.h"

#define FAIRWAY_COMMAND_ID_MAX 128

struct fairway_complete_command {
	char command_id[FAIRWAY_COMMAND_ID_MAX];
	char request_id[FAIRWAY_REQUEST_ID_MAX];
};

bool fairway_parse_complete_command(char *body, size_t body_len,
				    const char *active_device_id,
				    const char *active_request_id,
				    struct fairway_complete_command *command);

/* COMPLETE wire-protocol senders: build the request and parse the
 * response via the shared transport. Return value convention matches
 * http_transport_send().
 */
int command_protocol_send_poll(const char *active_request_id,
			       struct fairway_complete_command *command,
			       int64_t attempt_deadline_ms);
int command_protocol_send_ack(const struct fairway_complete_command *command,
			      int64_t attempt_deadline_ms);

#endif /* COMMAND_PROTOCOL_H */