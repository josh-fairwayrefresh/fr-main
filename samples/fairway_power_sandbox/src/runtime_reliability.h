#ifndef FAIRWAY_RUNTIME_RELIABILITY_H
#define FAIRWAY_RUNTIME_RELIABILITY_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "command_protocol.h"

enum fairway_command_result {
	FAIRWAY_COMMAND_RESULT_NEVER = 0,
	FAIRWAY_COMMAND_RESULT_POLL_EMPTY,
	FAIRWAY_COMMAND_RESULT_POLL_TRANSPORT_FAILURE,
	FAIRWAY_COMMAND_RESULT_POLL_HTTP_FAILURE,
	FAIRWAY_COMMAND_RESULT_COMPLETE_RECEIVED,
	FAIRWAY_COMMAND_RESULT_ACK_TRANSPORT_FAILURE,
	FAIRWAY_COMMAND_RESULT_ACK_HTTP_FAILURE,
	FAIRWAY_COMMAND_RESULT_COMPLETE_ACKED,
	FAIRWAY_COMMAND_RESULT_POLL_YIELDED,
	FAIRWAY_COMMAND_RESULT_ACK_YIELDED,
};

enum fairway_command_stop_reason {
	FAIRWAY_COMMAND_STOP_NONE = 0,
	FAIRWAY_COMMAND_STOP_ACTIVE,
	FAIRWAY_COMMAND_STOP_COMPLETE,
	FAIRWAY_COMMAND_STOP_LOCAL_EXPIRY,
	FAIRWAY_COMMAND_STOP_INVALIDATED,
};

enum fairway_command_state {
	FAIRWAY_COMMAND_STATE_INACTIVE = 0,
	FAIRWAY_COMMAND_STATE_POLL_WAIT,
	FAIRWAY_COMMAND_STATE_POLL_IN_FLIGHT,
	FAIRWAY_COMMAND_STATE_ACK_WAIT,
	FAIRWAY_COMMAND_STATE_ACK_IN_FLIGHT,
	FAIRWAY_COMMAND_STATE_LTE_WAIT_POLL,
	FAIRWAY_COMMAND_STATE_LTE_WAIT_ACK,
	FAIRWAY_COMMAND_STATE_COMPLETE,
	FAIRWAY_COMMAND_STATE_EXPIRED,
	FAIRWAY_COMMAND_STATE_INVALIDATED,
};

enum fairway_command_action_type {
	FAIRWAY_COMMAND_ACTION_NONE = 0,
	FAIRWAY_COMMAND_ACTION_POLL,
	FAIRWAY_COMMAND_ACTION_ACK,
};

struct fairway_command_action {
	enum fairway_command_action_type type;
	uint32_t generation;
	int64_t deadline_ms;
	char request_id[FAIRWAY_REQUEST_ID_MAX];
	char command_id[FAIRWAY_COMMAND_ID_MAX];
};

struct fairway_command_telemetry {
	uint32_t scheduler_runs;
	uint32_t timer_fires;
	uint32_t poll_attempts;
	uint32_t poll_transport_failures;
	uint32_t poll_http_failures;
	uint32_t empty_responses;
	uint32_t complete_received;
	uint32_t ack_attempts;
	uint32_t ack_failures;
	uint32_t ack_successes;
	uint32_t lte_not_registered;
	uint32_t lte_recoveries;
	uint32_t stale_results;
	enum fairway_command_result last_result;
	enum fairway_command_stop_reason stop_reason;
	enum fairway_command_state state;
	bool registration_valid;
	int registration_state;
};

struct fairway_demand_window {
	uint32_t generation;
	int64_t expires_at_ms;
	int64_t next_action_at_ms;
	uint32_t repeat_press_count;
	char request_id[FAIRWAY_REQUEST_ID_MAX];
	char command_id[FAIRWAY_COMMAND_ID_MAX];
	bool lte_registered_valid;
	bool lte_registered;
	struct fairway_command_telemetry telemetry;
};

uint32_t fairway_demand_window_start(struct fairway_demand_window *window,
				     const char *request_id, int64_t now_ms,
				     int64_t expires_at_ms, int64_t poll_interval_ms);
bool fairway_demand_window_is_active(const struct fairway_demand_window *window);
bool fairway_demand_window_repeat_press(struct fairway_demand_window *window,
					int64_t now_ms, uint32_t *repeat_count);
bool fairway_demand_window_evaluate(struct fairway_demand_window *window,
				    int64_t now_ms, int64_t poll_interval_ms,
				    int64_t action_timeout_ms,
				    bool registration_valid, bool registered,
				    int registration_state,
				    struct fairway_command_action *action,
				    int64_t *next_wake_at_ms);
void fairway_demand_window_poll_finished(struct fairway_demand_window *window,
					 uint32_t generation, int64_t now_ms,
					 int64_t poll_interval_ms,
					 enum fairway_command_result result,
					 const struct fairway_complete_command *command);
void fairway_demand_window_ack_finished(struct fairway_demand_window *window,
					uint32_t generation, int64_t now_ms,
					int64_t poll_interval_ms,
					enum fairway_command_result result);
void fairway_demand_window_note_timer_fire(struct fairway_demand_window *window);
void fairway_demand_window_invalidate(struct fairway_demand_window *window);
void fairway_demand_window_telemetry(const struct fairway_demand_window *window,
				     struct fairway_command_telemetry *telemetry);

struct fairway_button_latch {
	bool down;
	bool pending;
	bool release_seen;
	int64_t last_release_ms;
	int64_t pending_at_ms;
};

void fairway_button_latch_init(struct fairway_button_latch *latch,
			       int64_t now_ms, int64_t debounce_ms);
bool fairway_button_latch_edge(struct fairway_button_latch *latch,
			       bool pressed, int64_t now_ms,
			       int64_t debounce_ms);
bool fairway_button_latch_take(struct fairway_button_latch *latch,
			       int64_t *press_time_ms);
bool fairway_button_latch_pending(const struct fairway_button_latch *latch);
void fairway_button_latch_discard(struct fairway_button_latch *latch);

#endif