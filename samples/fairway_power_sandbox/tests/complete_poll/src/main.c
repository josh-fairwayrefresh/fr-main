#include <errno.h>
#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/ztest.h>

#include "complete_poll.h"
#include "demand_window.h"

#define T0 1000000
#define DEADLINE (T0 + 300000)

static K_SEM_DEFINE(test_wake_sem, 0, 1);

static void reset_modules(void *fixture)
{
	ARG_UNUSED(fixture);
	k_sem_reset(&test_wake_sem);
	complete_poll_init(&test_wake_sem);
	demand_window_init();
}

static struct complete_poll_action take_poll(int64_t now_ms)
{
	struct complete_poll_action action;

	zassert_true(complete_poll_next_action(now_ms, true, &action));
	zassert_equal(action.type, COMPLETE_ACTION_POLL);
	return action;
}

static struct fairway_complete_command command_for(const char *request_id)
{
	struct fairway_complete_command command = {0};

	strcpy(command.command_id, "command-a");
	strcpy(command.request_id, request_id);
	return command;
}

ZTEST(complete_poll, test_01_activation_schedules_first_target)
{
	zassert_true(complete_poll_start(1, "request-a", T0, DEADLINE));
	struct complete_poll_snapshot snapshot = complete_poll_get_snapshot(T0);

	zassert_equal(snapshot.state, COMPLETE_POLL_WAIT);
	zassert_equal(snapshot.next_target_ms, T0 + 15000);
}

ZTEST(complete_poll, test_02_fast_empty_polls_preserve_targets)
{
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + 17000, 0, NULL);
	zassert_false(complete_poll_next_action(T0 + 29999, true, &action));
	action = take_poll(T0 + 30000);
	complete_poll_poll_finished(action.generation, T0 + 32000, 0, NULL);
	action = take_poll(T0 + 45000);
	zassert_equal(action.type, COMPLETE_ACTION_POLL);
}

ZTEST(complete_poll, test_03_twelve_second_poll_preserves_t30)
{
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + 27000, 0, NULL);
	zassert_true(complete_poll_next_action(T0 + 30000, true, &action));
}

ZTEST(complete_poll, test_04_overrun_coalesces_missed_target)
{
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + 33000, 0, NULL);
	zassert_true(complete_poll_next_action(T0 + 33000, true, &action));
	zassert_equal(complete_poll_get_snapshot(T0 + 33000).next_target_ms, T0 + 45000);
}

ZTEST(complete_poll, test_05_no_catch_up_burst)
{
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + 61000, 0, NULL);
	action = take_poll(T0 + 61000);
	complete_poll_poll_finished(action.generation, T0 + 62000, 0, NULL);
	zassert_false(complete_poll_next_action(T0 + 62000, true, &action));
	zassert_equal(complete_poll_get_snapshot(T0 + 62000).next_target_ms, T0 + 75000);
}

ZTEST(complete_poll, test_06_http_and_transport_failures_preserve_lifecycle)
{
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + 16000, -ETIMEDOUT, NULL);
	action = take_poll(T0 + 30000);
	complete_poll_poll_finished(action.generation, T0 + 31000, -EIO, NULL);
	zassert_equal(complete_poll_get_snapshot(T0 + 31000).state, COMPLETE_POLL_WAIT);
	zassert_true(complete_poll_next_action(T0 + 45000, true, &action));
}

ZTEST(complete_poll, test_07_lte_loss_retains_one_need_and_recovers)
{
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action action;

	zassert_false(complete_poll_next_action(T0 + 15000, false, &action));
	zassert_true(complete_poll_next_action(T0 + 20000, true, &action));
	zassert_false(complete_poll_next_action(T0 + 20000, true, &action));

	const int64_t second_timeline = T0 + 60000;

	complete_poll_start(2, "request-b", second_timeline, DEADLINE);
	zassert_false(complete_poll_next_action(second_timeline + 15000, false, &action));
	zassert_false(complete_poll_next_action(second_timeline + 30000, false, &action));
	zassert_equal(complete_poll_get_snapshot(second_timeline + 30000).state,
		      COMPLETE_LTE_WAIT_POLL);
	zassert_equal(complete_poll_get_snapshot(second_timeline + 30000).next_target_ms,
		      second_timeline + 45000);
	zassert_true(complete_poll_next_action(second_timeline + 45000, true, &action));
	zassert_false(complete_poll_next_action(second_timeline + 45000, true, &action));

	struct fairway_complete_command command = command_for("request-b");

	complete_poll_poll_finished(action.generation, second_timeline + 46000, 0, &command);
	zassert_false(complete_poll_next_action(second_timeline + 46000, false, &action));
	zassert_false(complete_poll_next_action(second_timeline + 60000, false, &action));
	zassert_equal(complete_poll_get_snapshot(second_timeline + 60000).state,
		      COMPLETE_LTE_WAIT_ACK);
	zassert_true(complete_poll_next_action(second_timeline + 75000, true, &action));
	zassert_equal(action.type, COMPLETE_ACTION_ACK);
	zassert_equal(strcmp(action.command.command_id, "command-a"), 0);
	zassert_equal(strcmp(action.command.request_id, "request-b"), 0);
	zassert_false(complete_poll_next_action(second_timeline + 75000, true, &action));
}

ZTEST(complete_poll, test_08_complete_identity_is_retained)
{
	complete_poll_start(7, "request-a", T0, DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);
	struct fairway_complete_command command = command_for("request-a");

	complete_poll_poll_finished(action.generation, T0 + 16000, 0, &command);
	zassert_true(complete_poll_next_action(T0 + 16000, true, &action));
	zassert_equal(action.type, COMPLETE_ACTION_ACK);
	zassert_equal(action.generation, 7);
	zassert_equal(strcmp(action.command.command_id, "command-a"), 0);
	zassert_equal(strcmp(action.command.request_id, "request-a"), 0);
}

ZTEST(complete_poll, test_09_uncertain_ack_retries_same_identity)
{
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);
	struct fairway_complete_command command = command_for("request-a");

	complete_poll_poll_finished(action.generation, T0 + 16000, 0, &command);
	zassert_true(complete_poll_next_action(T0 + 16000, true, &action));
	complete_poll_ack_finished(action.generation, T0 + 17000, -ETIMEDOUT);
	zassert_false(complete_poll_next_action(T0 + 29999, true, &action));
	zassert_true(complete_poll_next_action(T0 + 30000, true, &action));
	zassert_equal(action.type, COMPLETE_ACTION_ACK);
	zassert_equal(strcmp(action.command.command_id, "command-a"), 0);
}

ZTEST(complete_poll, test_10_confirmed_ack_emits_once)
{
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);
	struct fairway_complete_command command = command_for("request-a");

	complete_poll_poll_finished(action.generation, T0 + 16000, 0, &command);
	complete_poll_next_action(T0 + 16000, true, &action);
	zassert_true(complete_poll_ack_finished(action.generation, T0 + 17000, 0));
	zassert_false(complete_poll_ack_finished(action.generation, T0 + 17001, 0));
	zassert_equal(complete_poll_get_snapshot(T0 + 17001).state,
		      COMPLETE_POLL_COMPLETE);
}

ZTEST(complete_poll, test_11_local_clear_requires_generation_and_request)
{
	demand_window_start(4, "request-a", DEADLINE);
	zassert_false(demand_window_clear_if_matches(3, "request-a", T0 + 1000));
	zassert_false(demand_window_clear_if_matches(4, "request-b", T0 + 1000));
	zassert_true(demand_window_clear_if_matches(4, "request-a", T0 + 1000));
	zassert_false(demand_window_get_snapshot(T0 + 1000).active);
}

ZTEST(complete_poll, test_12_immutable_five_minute_expiry)
{
	demand_window_start(1, "request-a", DEADLINE);
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, DEADLINE + 1, -ETIMEDOUT, NULL);
	zassert_equal(complete_poll_get_snapshot(DEADLINE + 1).deadline_ms, DEADLINE);
	zassert_equal(complete_poll_get_snapshot(DEADLINE + 1).state, COMPLETE_POLL_EXPIRED);
	zassert_false(demand_window_get_snapshot(DEADLINE + 1).active);
}

ZTEST(complete_poll, test_13_exact_deadline_expiry_wins)
{
	demand_window_start(1, "request-a", DEADLINE);
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);
	struct fairway_complete_command command = command_for("request-a");

	complete_poll_poll_finished(action.generation, T0 + 16000, 0, &command);
	complete_poll_next_action(T0 + 16000, true, &action);
	zassert_false(complete_poll_ack_finished(action.generation, DEADLINE, 0));
	zassert_false(demand_window_clear_if_matches(1, "request-a", DEADLINE));
}

ZTEST(complete_poll, test_14_stale_generation_result_is_rejected)
{
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action stale = take_poll(T0 + 15000);
	complete_poll_start(2, "request-b", T0 + 20000, DEADLINE + 20000);
	struct fairway_complete_command command = command_for("request-a");

	complete_poll_poll_finished(stale.generation, T0 + 21000, 0, &command);
	struct complete_poll_snapshot snapshot = complete_poll_get_snapshot(T0 + 21000);
	zassert_equal(snapshot.generation, 2);
	zassert_equal(snapshot.state, COMPLETE_POLL_WAIT);
	zassert_equal(strcmp(snapshot.request_id, "request-b"), 0);
}

ZTEST(complete_poll, test_15_successive_request_lifecycles)
{
	demand_window_start(1, "request-a", DEADLINE);
	complete_poll_start(1, "request-a", T0, DEADLINE);
	zassert_true(demand_window_clear_if_matches(1, "request-a", T0 + 20000));
	demand_window_start(2, "request-b", DEADLINE + 20000);
	complete_poll_start(2, "request-b", T0 + 20000, DEADLINE + 20000);

	struct demand_window_snapshot window = demand_window_get_snapshot(T0 + 20000);
	struct complete_poll_snapshot poll = complete_poll_get_snapshot(T0 + 20000);
	zassert_true(window.active);
	zassert_equal(window.generation, 2);
	zassert_equal(poll.generation, 2);
	zassert_equal(poll.next_target_ms, T0 + 35000);
}

ZTEST(complete_poll, test_16_poll_faults_do_not_affect_local_repeat_decision)
{
	demand_window_start(1, "request-a", DEADLINE);
	complete_poll_start(1, "request-a", T0, DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + 16000, -EIO, NULL);
	uint32_t repeat_count;
	zassert_true(demand_window_repeat_press(T0 + 17000, &repeat_count));
	zassert_equal(repeat_count, 1);
	zassert_true(demand_window_get_snapshot(T0 + 17000).active);
}

ZTEST_SUITE(complete_poll, NULL, NULL, reset_modules, NULL, NULL);