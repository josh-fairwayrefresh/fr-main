#include <assert.h>
#include <stdio.h>
#include <string.h>

#include "runtime_reliability.h"

#define POLL_INTERVAL_MS 15000
#define ACTION_TIMEOUT_MS 12000
#define WINDOW_EXPIRY_MS 300000

static bool evaluate(struct fairway_demand_window *window, int64_t now_ms,
		     bool registered, struct fairway_command_action *action,
		     int64_t *next_wake_at_ms)
{
	return fairway_demand_window_evaluate(window, now_ms, POLL_INTERVAL_MS,
		ACTION_TIMEOUT_MS, true, registered, registered ? 5 : 2,
		action, next_wake_at_ms);
}

static void empty_then_complete_with_ack_retry(void)
{
	struct fairway_demand_window window = {0};
	struct fairway_command_action action;
	struct fairway_complete_command command = {
		.command_id = "complete__request-a",
		.request_id = "request-a",
	};
	int64_t next_wake;
	uint32_t generation = fairway_demand_window_start(&window, "request-a", 0,
		WINDOW_EXPIRY_MS, POLL_INTERVAL_MS);

	assert(!evaluate(&window, 0, true, &action, &next_wake));
	assert(next_wake == POLL_INTERVAL_MS);
	assert(evaluate(&window, 15000, true, &action, &next_wake));
	assert(action.type == FAIRWAY_COMMAND_ACTION_POLL);
	assert(action.generation == generation);
	fairway_demand_window_poll_finished(&window, generation, 15100,
		POLL_INTERVAL_MS, FAIRWAY_COMMAND_RESULT_POLL_EMPTY, NULL);
	assert(window.telemetry.empty_responses == 1);

	assert(evaluate(&window, 30100, true, &action, &next_wake));
	fairway_demand_window_poll_finished(&window, generation, 30200,
		POLL_INTERVAL_MS, FAIRWAY_COMMAND_RESULT_COMPLETE_RECEIVED, &command);
	assert(window.telemetry.complete_received == 1);
	assert(evaluate(&window, 30200, true, &action, &next_wake));
	assert(action.type == FAIRWAY_COMMAND_ACTION_ACK);
	assert(strcmp(action.command_id, command.command_id) == 0);
	fairway_demand_window_ack_finished(&window, generation, 30300,
		POLL_INTERVAL_MS, FAIRWAY_COMMAND_RESULT_ACK_TRANSPORT_FAILURE);
	assert(window.telemetry.ack_failures == 1);

	assert(!evaluate(&window, 40000, true, &action, &next_wake));
	assert(next_wake == 45300);
	assert(evaluate(&window, 45300, true, &action, &next_wake));
	assert(action.type == FAIRWAY_COMMAND_ACTION_ACK);
	assert(strcmp(action.command_id, command.command_id) == 0);
	fairway_demand_window_ack_finished(&window, generation, 45400,
		POLL_INTERVAL_MS, FAIRWAY_COMMAND_RESULT_COMPLETE_ACKED);
	assert(!fairway_demand_window_is_active(&window));
	assert(window.telemetry.ack_attempts == 2);
	assert(window.telemetry.ack_successes == 1);
	assert(window.telemetry.stop_reason == FAIRWAY_COMMAND_STOP_COMPLETE);
}

static void failures_lte_recovery_and_coalesced_wakes(void)
{
	struct fairway_demand_window window = {0};
	struct fairway_command_action action;
	int64_t next_wake;
	uint32_t generation = fairway_demand_window_start(&window, "request-b", 0,
		WINDOW_EXPIRY_MS, POLL_INTERVAL_MS);

	assert(!evaluate(&window, 15000, false, &action, &next_wake));
	assert(window.telemetry.state == FAIRWAY_COMMAND_STATE_LTE_WAIT_POLL);
	assert(next_wake == WINDOW_EXPIRY_MS);
	assert(window.telemetry.lte_not_registered == 1);
	fairway_demand_window_note_timer_fire(&window);
	assert(evaluate(&window, 20000, true, &action, &next_wake));
	assert(action.type == FAIRWAY_COMMAND_ACTION_POLL);
	assert(!evaluate(&window, 20000, true, &action, &next_wake));
	assert(window.telemetry.lte_recoveries == 1);
	fairway_demand_window_poll_finished(&window, generation, 20100,
		POLL_INTERVAL_MS, FAIRWAY_COMMAND_RESULT_POLL_TRANSPORT_FAILURE, NULL);
	assert(window.telemetry.poll_transport_failures == 1);

	assert(evaluate(&window, 35100, true, &action, &next_wake));
	fairway_demand_window_poll_finished(&window, generation, 35200,
		POLL_INTERVAL_MS, FAIRWAY_COMMAND_RESULT_POLL_HTTP_FAILURE, NULL);
	assert(window.telemetry.poll_http_failures == 1);
}

static void repeated_empty_polls_expire_locally(void)
{
	struct fairway_demand_window window = {0};
	struct fairway_command_action action;
	int64_t next_wake;
	uint32_t generation = fairway_demand_window_start(&window, "request-c", 0,
		WINDOW_EXPIRY_MS, POLL_INTERVAL_MS);
	int64_t now_ms = POLL_INTERVAL_MS;

	while (now_ms < WINDOW_EXPIRY_MS) {
		assert(evaluate(&window, now_ms, true, &action, &next_wake));
		fairway_demand_window_poll_finished(&window, generation, now_ms,
			POLL_INTERVAL_MS, FAIRWAY_COMMAND_RESULT_POLL_EMPTY, NULL);
		now_ms += POLL_INTERVAL_MS;
	}

	assert(!evaluate(&window, WINDOW_EXPIRY_MS, true, &action, &next_wake));
	assert(window.telemetry.empty_responses == 19);
	assert(window.telemetry.stop_reason == FAIRWAY_COMMAND_STOP_LOCAL_EXPIRY);
}

static void expiry_wins_boundary_and_stale_generations_are_ignored(void)
{
	struct fairway_demand_window window = {0};
	struct fairway_command_action action;
	struct fairway_complete_command command = {
		.command_id = "complete__request-d",
		.request_id = "request-d",
	};
	int64_t next_wake;
	uint32_t old_generation = fairway_demand_window_start(&window, "old", 0,
		WINDOW_EXPIRY_MS, POLL_INTERVAL_MS);
	uint32_t generation = fairway_demand_window_start(&window, "request-d", 0,
		WINDOW_EXPIRY_MS, POLL_INTERVAL_MS);

	assert(evaluate(&window, 15000, true, &action, &next_wake));
	fairway_demand_window_poll_finished(&window, old_generation, 15100,
		POLL_INTERVAL_MS, FAIRWAY_COMMAND_RESULT_POLL_EMPTY, NULL);
	assert(window.telemetry.stale_results == 1);
	fairway_demand_window_poll_finished(&window, generation, 299900,
		POLL_INTERVAL_MS, FAIRWAY_COMMAND_RESULT_COMPLETE_RECEIVED, &command);
	assert(evaluate(&window, 299900, true, &action, &next_wake));
	assert(action.deadline_ms == WINDOW_EXPIRY_MS);
	fairway_demand_window_ack_finished(&window, generation, WINDOW_EXPIRY_MS,
		POLL_INTERVAL_MS, FAIRWAY_COMMAND_RESULT_COMPLETE_ACKED);
	assert(window.telemetry.ack_successes == 1);
	assert(window.telemetry.stop_reason == FAIRWAY_COMMAND_STOP_LOCAL_EXPIRY);
}

static void reboot_has_no_phantom_active_window(void)
{
	struct fairway_demand_window rebooted = {0};
	struct fairway_command_action action;
	int64_t next_wake;

	assert(!evaluate(&rebooted, 0, true, &action, &next_wake));
	assert(!fairway_demand_window_is_active(&rebooted));
	assert(rebooted.telemetry.state == FAIRWAY_COMMAND_STATE_INACTIVE);
	assert(rebooted.telemetry.stop_reason == FAIRWAY_COMMAND_STOP_NONE);
}

static void button_edges_retain_one_event_at_a_time(void)
{
	struct fairway_button_latch latch;
	int64_t press_time;

	fairway_button_latch_init(&latch, 0, 75);
	assert(fairway_button_latch_edge(&latch, true, 0, 75));
	assert(!fairway_button_latch_edge(&latch, true, 5, 75));
	assert(fairway_button_latch_take(&latch, &press_time));
	assert(press_time == 0);
	assert(!fairway_button_latch_edge(&latch, false, 20, 75));
	assert(!fairway_button_latch_edge(&latch, true, 30, 75));
	assert(!fairway_button_latch_edge(&latch, false, 35, 75));
	assert(fairway_button_latch_edge(&latch, true, 200, 75));
	assert(!fairway_button_latch_edge(&latch, false, 230, 75));
	assert(!fairway_button_latch_edge(&latch, true, 400, 75));
	assert(!fairway_button_latch_edge(&latch, false, 410, 75));
	assert(fairway_button_latch_take(&latch, &press_time));
	assert(press_time == 200);
	assert(fairway_button_latch_edge(&latch, true, 486, 75));
	assert(fairway_button_latch_take(&latch, &press_time));
	assert(press_time == 486);
}

int main(void)
{
	empty_then_complete_with_ack_retry();
	failures_lte_recovery_and_coalesced_wakes();
	repeated_empty_polls_expire_locally();
	expiry_wins_boundary_and_stale_generations_are_ignored();
	reboot_has_no_phantom_active_window();
	button_edges_retain_one_event_at_a_time();
	puts("runtime reliability tests passed");
	return 0;
}