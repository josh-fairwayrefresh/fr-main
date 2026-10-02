#include "runtime_reliability.h"

#include <string.h>

static bool state_is_active(enum fairway_command_state state)
{
	return state >= FAIRWAY_COMMAND_STATE_POLL_WAIT &&
	       state <= FAIRWAY_COMMAND_STATE_LTE_WAIT_ACK;
}

static void set_state(struct fairway_demand_window *window,
		      enum fairway_command_state state)
{
	window->telemetry.state = state;
}

static void expire(struct fairway_demand_window *window)
{
	set_state(window, FAIRWAY_COMMAND_STATE_EXPIRED);
	window->telemetry.stop_reason = FAIRWAY_COMMAND_STOP_LOCAL_EXPIRY;
}

static bool expire_if_needed(struct fairway_demand_window *window, int64_t now_ms)
{
	if (state_is_active(window->telemetry.state) && now_ms >= window->expires_at_ms) {
		expire(window);
	}

	return state_is_active(window->telemetry.state);
}

static void copy_string(char *destination, size_t destination_len, const char *source)
{
	strncpy(destination, source, destination_len - 1);
	destination[destination_len - 1] = '\0';
}

uint32_t fairway_demand_window_start(struct fairway_demand_window *window,
				     const char *request_id, int64_t now_ms,
				     int64_t expires_at_ms, int64_t poll_interval_ms)
{
	uint32_t generation = window->generation + 1U;

	memset(window, 0, sizeof(*window));
	window->generation = generation;
	window->expires_at_ms = expires_at_ms;
	window->next_action_at_ms = now_ms + poll_interval_ms;
	copy_string(window->request_id, sizeof(window->request_id), request_id);
	window->telemetry.stop_reason = FAIRWAY_COMMAND_STOP_ACTIVE;
	set_state(window, FAIRWAY_COMMAND_STATE_POLL_WAIT);
	return generation;
}

bool fairway_demand_window_is_active(const struct fairway_demand_window *window)
{
	return state_is_active(window->telemetry.state);
}

bool fairway_demand_window_repeat_press(struct fairway_demand_window *window,
					int64_t now_ms, uint32_t *repeat_count)
{
	if (!expire_if_needed(window, now_ms)) {
		return false;
	}

	window->repeat_press_count++;
	*repeat_count = window->repeat_press_count;
	return true;
}

static void sync_registration(struct fairway_demand_window *window,
			      bool registration_valid, bool registered,
			      int registration_state)
{
	window->telemetry.registration_valid = registration_valid;
	window->telemetry.registration_state = registration_state;
	if (!registration_valid) {
		return;
	}
	if (!window->lte_registered_valid || window->lte_registered != registered) {
		if (registered && window->lte_registered_valid && !window->lte_registered) {
			window->telemetry.lte_recoveries++;
		} else if (!registered) {
			window->telemetry.lte_not_registered++;
		}
		window->lte_registered_valid = true;
		window->lte_registered = registered;
	}
}

static void prepare_action(const struct fairway_demand_window *window,
			   enum fairway_command_action_type type,
			   int64_t now_ms, int64_t action_timeout_ms,
			   struct fairway_command_action *action)
{
	action->type = type;
	action->generation = window->generation;
	action->deadline_ms = now_ms + action_timeout_ms;
	if (action->deadline_ms > window->expires_at_ms) {
		action->deadline_ms = window->expires_at_ms;
	}
	copy_string(action->request_id, sizeof(action->request_id), window->request_id);
	copy_string(action->command_id, sizeof(action->command_id), window->command_id);
}

bool fairway_demand_window_evaluate(struct fairway_demand_window *window,
				    int64_t now_ms, int64_t poll_interval_ms,
				    int64_t action_timeout_ms,
				    bool registration_valid, bool registered,
				    int registration_state,
				    struct fairway_command_action *action,
				    int64_t *next_wake_at_ms)
{
	(void)poll_interval_ms;
	memset(action, 0, sizeof(*action));
	*next_wake_at_ms = -1;
	window->telemetry.scheduler_runs++;
	sync_registration(window, registration_valid, registered, registration_state);
	if (!expire_if_needed(window, now_ms)) {
		return false;
	}

	switch (window->telemetry.state) {
	case FAIRWAY_COMMAND_STATE_POLL_WAIT:
	case FAIRWAY_COMMAND_STATE_ACK_WAIT:
		if (now_ms < window->next_action_at_ms) {
			*next_wake_at_ms = window->next_action_at_ms;
			break;
		}
		if (!registration_valid || !registered) {
			set_state(window, window->telemetry.state == FAIRWAY_COMMAND_STATE_POLL_WAIT ?
				  FAIRWAY_COMMAND_STATE_LTE_WAIT_POLL :
				  FAIRWAY_COMMAND_STATE_LTE_WAIT_ACK);
			*next_wake_at_ms = window->expires_at_ms;
			break;
		}
		if (window->telemetry.state == FAIRWAY_COMMAND_STATE_POLL_WAIT) {
			set_state(window, FAIRWAY_COMMAND_STATE_POLL_IN_FLIGHT);
			prepare_action(window, FAIRWAY_COMMAND_ACTION_POLL, now_ms,
				       action_timeout_ms, action);
		} else {
			set_state(window, FAIRWAY_COMMAND_STATE_ACK_IN_FLIGHT);
			prepare_action(window, FAIRWAY_COMMAND_ACTION_ACK, now_ms,
				       action_timeout_ms, action);
		}
		return true;
	case FAIRWAY_COMMAND_STATE_LTE_WAIT_POLL:
	case FAIRWAY_COMMAND_STATE_LTE_WAIT_ACK:
		if (!registration_valid || !registered) {
			*next_wake_at_ms = window->expires_at_ms;
			break;
		}
		if (window->telemetry.state == FAIRWAY_COMMAND_STATE_LTE_WAIT_POLL) {
			set_state(window, FAIRWAY_COMMAND_STATE_POLL_IN_FLIGHT);
			prepare_action(window, FAIRWAY_COMMAND_ACTION_POLL, now_ms,
				       action_timeout_ms, action);
		} else {
			set_state(window, FAIRWAY_COMMAND_STATE_ACK_IN_FLIGHT);
			prepare_action(window, FAIRWAY_COMMAND_ACTION_ACK, now_ms,
				       action_timeout_ms, action);
		}
		return true;
	case FAIRWAY_COMMAND_STATE_POLL_IN_FLIGHT:
	case FAIRWAY_COMMAND_STATE_ACK_IN_FLIGHT:
		break;
	default:
		return false;
	}

	if (*next_wake_at_ms > window->expires_at_ms) {
		*next_wake_at_ms = window->expires_at_ms;
	}
	return false;
}

static bool result_is_stale(struct fairway_demand_window *window,
			    uint32_t generation,
			    enum fairway_command_state expected_state)
{
	if (window->generation == generation && window->telemetry.state == expected_state) {
		return false;
	}
	window->telemetry.stale_results++;
	return true;
}

void fairway_demand_window_poll_finished(struct fairway_demand_window *window,
					 uint32_t generation, int64_t now_ms,
					 int64_t poll_interval_ms,
					 enum fairway_command_result result,
					 const struct fairway_complete_command *command)
{
	if (result_is_stale(window, generation, FAIRWAY_COMMAND_STATE_POLL_IN_FLIGHT)) {
		return;
	}
	window->telemetry.poll_attempts++;
	window->telemetry.last_result = result;
	if (result == FAIRWAY_COMMAND_RESULT_POLL_TRANSPORT_FAILURE) {
		window->telemetry.poll_transport_failures++;
	} else if (result == FAIRWAY_COMMAND_RESULT_POLL_HTTP_FAILURE) {
		window->telemetry.poll_http_failures++;
	} else if (result == FAIRWAY_COMMAND_RESULT_POLL_EMPTY) {
		window->telemetry.empty_responses++;
	} else if (result == FAIRWAY_COMMAND_RESULT_COMPLETE_RECEIVED && command != NULL) {
		window->telemetry.complete_received++;
		copy_string(window->command_id, sizeof(window->command_id), command->command_id);
		set_state(window, FAIRWAY_COMMAND_STATE_ACK_WAIT);
		window->next_action_at_ms = now_ms;
		if (now_ms >= window->expires_at_ms) {
			expire(window);
		}
		return;
	}
	set_state(window, FAIRWAY_COMMAND_STATE_POLL_WAIT);
	window->next_action_at_ms = now_ms + poll_interval_ms;
	expire_if_needed(window, now_ms);
}

void fairway_demand_window_ack_finished(struct fairway_demand_window *window,
					uint32_t generation, int64_t now_ms,
					int64_t poll_interval_ms,
					enum fairway_command_result result)
{
	if (result_is_stale(window, generation, FAIRWAY_COMMAND_STATE_ACK_IN_FLIGHT)) {
		return;
	}
	window->telemetry.ack_attempts++;
	window->telemetry.last_result = result;
	if (result == FAIRWAY_COMMAND_RESULT_COMPLETE_ACKED) {
		window->telemetry.ack_successes++;
		if (now_ms >= window->expires_at_ms) {
			expire(window);
		} else {
			set_state(window, FAIRWAY_COMMAND_STATE_COMPLETE);
			window->telemetry.stop_reason = FAIRWAY_COMMAND_STOP_COMPLETE;
		}
		return;
	}
	if (result == FAIRWAY_COMMAND_RESULT_ACK_TRANSPORT_FAILURE ||
	    result == FAIRWAY_COMMAND_RESULT_ACK_HTTP_FAILURE) {
		window->telemetry.ack_failures++;
	}
	set_state(window, FAIRWAY_COMMAND_STATE_ACK_WAIT);
	window->next_action_at_ms = now_ms + poll_interval_ms;
	expire_if_needed(window, now_ms);
}

void fairway_demand_window_note_timer_fire(struct fairway_demand_window *window)
{
	window->telemetry.timer_fires++;
}

void fairway_demand_window_invalidate(struct fairway_demand_window *window)
{
	set_state(window, FAIRWAY_COMMAND_STATE_INVALIDATED);
	window->telemetry.stop_reason = FAIRWAY_COMMAND_STOP_INVALIDATED;
}

void fairway_demand_window_telemetry(const struct fairway_demand_window *window,
				     struct fairway_command_telemetry *telemetry)
{
	*telemetry = window->telemetry;
}

void fairway_button_latch_init(struct fairway_button_latch *latch,
			       int64_t now_ms, int64_t debounce_ms)
{
	memset(latch, 0, sizeof(*latch));
	latch->release_seen = true;
	latch->last_release_ms = now_ms - debounce_ms;
}

bool fairway_button_latch_edge(struct fairway_button_latch *latch,
			       bool pressed, int64_t now_ms,
			       int64_t debounce_ms)
{
	if (!pressed) {
		if (latch->down) {
			latch->down = false;
			latch->release_seen = true;
			latch->last_release_ms = now_ms;
		}
		return false;
	}

	if (latch->down) {
		return false;
	}

	latch->down = true;
	if (!latch->release_seen || now_ms - latch->last_release_ms < debounce_ms ||
	    latch->pending) {
		return false;
	}

	latch->release_seen = false;
	latch->pending = true;
	latch->pending_at_ms = now_ms;
	return true;
}

bool fairway_button_latch_take(struct fairway_button_latch *latch,
			       int64_t *press_time_ms)
{
	if (!latch->pending) {
		return false;
	}

	*press_time_ms = latch->pending_at_ms;
	latch->pending = false;
	return true;
}

bool fairway_button_latch_pending(const struct fairway_button_latch *latch)
{
	return latch->pending;
}

void fairway_button_latch_discard(struct fairway_button_latch *latch)
{
	latch->pending = false;
}