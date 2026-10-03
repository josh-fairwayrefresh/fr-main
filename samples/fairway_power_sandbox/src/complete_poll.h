#ifndef COMPLETE_POLL_H
#define COMPLETE_POLL_H

#include <stdbool.h>
#include <stdint.h>

#include <zephyr/kernel.h>

#include "command_protocol.h"

#define COMPLETE_POLL_INTERVAL_MS 15000

enum complete_poll_state {
	COMPLETE_POLL_INACTIVE = 0,
	COMPLETE_POLL_WAIT,
	COMPLETE_POLL_IN_FLIGHT,
	COMPLETE_ACK_WAIT,
	COMPLETE_ACK_IN_FLIGHT,
	COMPLETE_LTE_WAIT_POLL,
	COMPLETE_LTE_WAIT_ACK,
	COMPLETE_POLL_COMPLETE,
	COMPLETE_POLL_EXPIRED,
};

enum complete_poll_action_type {
	COMPLETE_ACTION_POLL = 0,
	COMPLETE_ACTION_ACK,
};

struct complete_poll_action {
	enum complete_poll_action_type type;
	uint32_t generation;
	int64_t deadline_ms;
	char request_id[FAIRWAY_REQUEST_ID_MAX];
	struct fairway_complete_command command;
};

struct complete_poll_snapshot {
	enum complete_poll_state state;
	uint32_t generation;
	int64_t deadline_ms;
	int64_t next_target_ms;
	int64_t next_action_ms;
	char request_id[FAIRWAY_REQUEST_ID_MAX];
	struct fairway_complete_command command;
};

void complete_poll_init(struct k_sem *wake_sem);
bool complete_poll_start(uint32_t generation, const char *request_id,
			 int64_t timeline_start_ms, int64_t deadline_ms);
bool complete_poll_next_action(int64_t now_ms, bool lte_registered,
			       struct complete_poll_action *action);
void complete_poll_poll_finished(uint32_t generation, int64_t now_ms, int result,
				 const struct fairway_complete_command *command);
bool complete_poll_ack_finished(uint32_t generation, int64_t now_ms, int result);
void complete_poll_signal(void);
struct complete_poll_snapshot complete_poll_get_snapshot(int64_t now_ms);

#endif /* COMPLETE_POLL_H */