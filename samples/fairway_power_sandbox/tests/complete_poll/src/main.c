#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <zephyr/data/json.h>
#include <zephyr/kernel.h>
#include <zephyr/ztest.h>

#include "complete_poll.h"
#include "demand_window.h"
#include "golfer_protocol.h"
#include "golfer_txn.h"
#include "http_transport.h"

#define T0 1000000
#define TEST_POLICY_MS 123456
#define POLL_TEST_DEADLINE (T0 + TEST_POLICY_MS)

static K_SEM_DEFINE(test_wake_sem, 0, 1);
int64_t fairway_host_uptime_ms;
static char captured_request[1024];
static char test_response_body[] =
	"{\"status\":\"accepted\",\"event_type\":\"button_press\","
	"\"request_id\":\"request-new\","
	"\"golfer_demand_window_ms\":123456,\"duplicate\":false}";

int http_transport_send(const char *request, int request_len,
			int64_t attempt_deadline_ms, bool yieldable,
			struct http_transport_response *response)
{
	ARG_UNUSED(attempt_deadline_ms);
	ARG_UNUSED(yieldable);
	if (request_len <= 0 || (size_t)request_len >= sizeof(captured_request)) {
		return -EINVAL;
	}
	memcpy(captured_request, request, request_len);
	captured_request[request_len] = '\0';
	response->http_status = 200;
	response->body = test_response_body;
	response->body_len = strlen(test_response_body);
	return 0;
}

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

static struct golfer_acceptance acceptance_for(const char *request_id,
						       int64_t press_ms,
						       int64_t received_ms,
						       uint32_t policy_ms,
						       uint32_t remaining_ms,
						       bool duplicate)
{
	struct golfer_acceptance acceptance = {
		.golfer_demand_window_ms = policy_ms,
		.demand_window_remaining_ms = remaining_ms,
		.duplicate = duplicate,
		.press_time_ms = press_ms,
		.response_received_ms = received_ms,
	};
	strcpy(acceptance.request_id, request_id);
	return acceptance;
}

ZTEST(complete_poll, test_01_activation_schedules_first_target)
{
	zassert_true(complete_poll_start(1, "request-a", T0, POLL_TEST_DEADLINE));
	struct complete_poll_snapshot snapshot = complete_poll_get_snapshot(T0);

	zassert_equal(snapshot.state, COMPLETE_POLL_WAIT);
	zassert_equal(snapshot.next_target_ms, T0 + 15000);
}

ZTEST(complete_poll, test_02_fast_empty_polls_preserve_targets)
{
	complete_poll_start(1, "request-a", T0, POLL_TEST_DEADLINE);
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
	complete_poll_start(1, "request-a", T0, POLL_TEST_DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + 27000, 0, NULL);
	zassert_true(complete_poll_next_action(T0 + 30000, true, &action));
}

ZTEST(complete_poll, test_04_overrun_coalesces_missed_target)
{
	complete_poll_start(1, "request-a", T0, POLL_TEST_DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + 33000, 0, NULL);
	zassert_true(complete_poll_next_action(T0 + 33000, true, &action));
	zassert_equal(complete_poll_get_snapshot(T0 + 33000).next_target_ms, T0 + 45000);
}

ZTEST(complete_poll, test_05_no_catch_up_burst)
{
	complete_poll_start(1, "request-a", T0, POLL_TEST_DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + 61000, 0, NULL);
	action = take_poll(T0 + 61000);
	complete_poll_poll_finished(action.generation, T0 + 62000, 0, NULL);
	zassert_false(complete_poll_next_action(T0 + 62000, true, &action));
	zassert_equal(complete_poll_get_snapshot(T0 + 62000).next_target_ms, T0 + 75000);
}

ZTEST(complete_poll, test_06_http_and_transport_failures_preserve_lifecycle)
{
	complete_poll_start(1, "request-a", T0, POLL_TEST_DEADLINE);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + 16000, -ETIMEDOUT, NULL);
	action = take_poll(T0 + 30000);
	complete_poll_poll_finished(action.generation, T0 + 31000, -EIO, NULL);
	zassert_equal(complete_poll_get_snapshot(T0 + 31000).state, COMPLETE_POLL_WAIT);
	zassert_true(complete_poll_next_action(T0 + 45000, true, &action));
}

ZTEST(complete_poll, test_07_lte_loss_retains_one_need_and_recovers)
{
	complete_poll_start(1, "request-a", T0, POLL_TEST_DEADLINE);
	struct complete_poll_action action;

	zassert_false(complete_poll_next_action(T0 + 15000, false, &action));
	zassert_true(complete_poll_next_action(T0 + 20000, true, &action));
	zassert_false(complete_poll_next_action(T0 + 20000, true, &action));

	const int64_t second_timeline = T0 + 60000;
	const int64_t second_deadline = second_timeline + TEST_POLICY_MS;

	complete_poll_start(2, "request-b", second_timeline, second_deadline);
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
	complete_poll_start(7, "request-a", T0, POLL_TEST_DEADLINE);
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
	complete_poll_start(1, "request-a", T0, POLL_TEST_DEADLINE);
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
	complete_poll_start(1, "request-a", T0, POLL_TEST_DEADLINE);
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
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0, T0,
							     TEST_POLICY_MS, 0, false);
	demand_window_start(4, &acceptance, T0);
	zassert_false(demand_window_clear_if_matches(3, "request-a", T0 + 1000));
	zassert_false(demand_window_clear_if_matches(4, "request-b", T0 + 1000));
	zassert_true(demand_window_clear_if_matches(4, "request-a", T0 + 1000));
	zassert_false(demand_window_get_snapshot(T0 + 1000).active);
}

ZTEST(complete_poll, test_12_immutable_window_expiry)
{
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0, T0,
							     TEST_POLICY_MS, 0, false);
	demand_window_start(1, &acceptance, T0);
	complete_poll_start(1, "request-a", T0, T0 + TEST_POLICY_MS);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + TEST_POLICY_MS + 1, -ETIMEDOUT, NULL);
	zassert_equal(complete_poll_get_snapshot(T0 + TEST_POLICY_MS + 1).deadline_ms,
		      T0 + TEST_POLICY_MS);
	zassert_equal(complete_poll_get_snapshot(T0 + TEST_POLICY_MS + 1).state,
		      COMPLETE_POLL_EXPIRED);
	zassert_false(demand_window_get_snapshot(T0 + TEST_POLICY_MS + 1).active);
}

ZTEST(complete_poll, test_13_exact_deadline_expiry_wins)
{
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0, T0,
							     TEST_POLICY_MS, 0, false);
	demand_window_start(1, &acceptance, T0);
	complete_poll_start(1, "request-a", T0, T0 + TEST_POLICY_MS);
	struct complete_poll_action action = take_poll(T0 + 15000);
	struct fairway_complete_command command = command_for("request-a");

	complete_poll_poll_finished(action.generation, T0 + 16000, 0, &command);
	complete_poll_next_action(T0 + 16000, true, &action);
	zassert_false(complete_poll_ack_finished(action.generation, T0 + TEST_POLICY_MS, 0));
	zassert_false(demand_window_clear_if_matches(1, "request-a", T0 + TEST_POLICY_MS));
}

ZTEST(complete_poll, test_14_stale_generation_result_is_rejected)
{
	complete_poll_start(1, "request-a", T0, POLL_TEST_DEADLINE);
	struct complete_poll_action stale = take_poll(T0 + 15000);
	complete_poll_start(2, "request-b", T0 + 20000, POLL_TEST_DEADLINE + 20000);
	struct fairway_complete_command command = command_for("request-a");

	complete_poll_poll_finished(stale.generation, T0 + 21000, 0, &command);
	struct complete_poll_snapshot snapshot = complete_poll_get_snapshot(T0 + 21000);
	zassert_equal(snapshot.generation, 2);
	zassert_equal(snapshot.state, COMPLETE_POLL_WAIT);
	zassert_equal(strcmp(snapshot.request_id, "request-b"), 0);
}

ZTEST(complete_poll, test_15_successive_request_lifecycles)
{
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0, T0,
							     TEST_POLICY_MS, 0, false);
	demand_window_start(1, &acceptance, T0);
	complete_poll_start(1, "request-a", T0, T0 + TEST_POLICY_MS);
	zassert_true(demand_window_clear_if_matches(1, "request-a", T0 + 20000));
	acceptance = acceptance_for("request-b", T0 + 20000, T0 + 20000,
					    TEST_POLICY_MS, 0, false);
	demand_window_start(2, &acceptance, T0 + 20000);
	complete_poll_start(2, "request-b", T0 + 20000,
			    T0 + 20000 + TEST_POLICY_MS);

	struct demand_window_snapshot window = demand_window_get_snapshot(T0 + 20000);
	struct complete_poll_snapshot poll = complete_poll_get_snapshot(T0 + 20000);
	zassert_true(window.active);
	zassert_equal(window.generation, 2);
	zassert_equal(poll.generation, 2);
	zassert_equal(poll.next_target_ms, T0 + 35000);
}

ZTEST(complete_poll, test_16_poll_faults_do_not_affect_local_repeat_decision)
{
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0, T0,
							     TEST_POLICY_MS, 0, false);
	demand_window_start(1, &acceptance, T0);
	complete_poll_start(1, "request-a", T0, T0 + TEST_POLICY_MS);
	struct complete_poll_action action = take_poll(T0 + 15000);

	complete_poll_poll_finished(action.generation, T0 + 16000, -EIO, NULL);
	uint32_t repeat_count;
	zassert_true(demand_window_repeat_press(T0 + 17000, &repeat_count));
	zassert_equal(repeat_count, 1);
	zassert_true(demand_window_get_snapshot(T0 + 17000).active);
}

ZTEST(complete_poll, test_17_duplicate_uses_remaining_window_not_full_policy)
{
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0, T0 + 1000,
							     TEST_POLICY_MS, 5000, true);
	zassert_true(demand_window_start(1, &acceptance, T0 + 1000));
	struct demand_window_snapshot snapshot = demand_window_get_snapshot(T0 + 1000);

	zassert_true(snapshot.active);
	zassert_true(snapshot.duplicate);
	zassert_equal(snapshot.golfer_demand_window_ms, TEST_POLICY_MS);
	zassert_equal(snapshot.deadline_ms, T0 + 6000);
	zassert_false(demand_window_get_snapshot(T0 + 6000).active);
}

ZTEST(complete_poll, test_18_local_deadline_expires_without_complete_or_button_poll)
{
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0, T0,
							     TEST_POLICY_MS, 0, false);

	zassert_true(demand_window_start(1, &acceptance, T0));
	zassert_true(demand_window_get_snapshot(T0 + TEST_POLICY_MS - 1).active);
	zassert_false(demand_window_get_snapshot(T0 + TEST_POLICY_MS).active);
	zassert_false(demand_window_repeat_press(T0 + TEST_POLICY_MS, NULL));
	acceptance = acceptance_for("request-b", T0 + TEST_POLICY_MS,
				    T0 + TEST_POLICY_MS, TEST_POLICY_MS, 0, false);
	zassert_true(demand_window_start(2, &acceptance, T0 + TEST_POLICY_MS));
	zassert_true(demand_window_get_snapshot(T0 + TEST_POLICY_MS).active);
}

ZTEST(complete_poll, test_19_window_rejects_invalid_acceptance_contract)
{
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0, T0,
							     0, 0, false);
	zassert_false(demand_window_start(1, &acceptance, T0));
	acceptance = acceptance_for("request-a", T0, T0, TEST_POLICY_MS,
					    TEST_POLICY_MS + 1, true);
	zassert_false(demand_window_start(1, &acceptance, T0));
	acceptance = acceptance_for("request-a", T0, T0, 0, 0, false);
	zassert_false(demand_window_start(1, &acceptance, T0));
}

ZTEST(complete_poll, test_20_transaction_handoff_preserves_acceptance_contract)
{
	struct golfer_acceptance accepted = acceptance_for("request-a", T0, T0 + 123,
							    TEST_POLICY_MS, 54321, true);
	struct golfer_acceptance received = {0};
	bool success = false;
	uint32_t generation = golfer_txn_accept(T0 + 15000, T0);
	uint32_t picked_generation;
	int64_t deadline_ms;
	int64_t press_time_ms;

	zassert_true(golfer_txn_pickup(&picked_generation, &deadline_ms, &press_time_ms));
	zassert_equal(picked_generation, generation);
	zassert_equal(deadline_ms, T0 + 15000);
	zassert_equal(press_time_ms, T0);
	golfer_txn_complete(generation, true, &accepted);
	zassert_true(golfer_txn_check_done(generation, &success, &received));
	zassert_true(success);
	zassert_equal(strcmp(received.request_id, accepted.request_id), 0);
	zassert_equal(received.golfer_demand_window_ms, accepted.golfer_demand_window_ms);
	zassert_equal(received.demand_window_remaining_ms, accepted.demand_window_remaining_ms);
	zassert_true(received.duplicate);
	zassert_equal(received.press_time_ms, accepted.press_time_ms);
	zassert_equal(received.response_received_ms, accepted.response_received_ms);
}

static bool parse_acceptance(const char *json, struct golfer_acceptance *acceptance)
{
	char body[512];
	size_t length = strlen(json);

	zassert_true(length < sizeof(body));
	memcpy(body, json, length + 1);
	return golfer_protocol_parse_acceptance(body, length, acceptance);
}

ZTEST(complete_poll, test_21_new_protocol_response_parses)
{
	struct golfer_acceptance acceptance = {0};

	zassert_true(parse_acceptance("{\"status\":\"accepted\",\"event_type\":\"button_press\","
		"\"request_id\":\"request-a\",\"golfer_demand_window_ms\":123456,\"duplicate\":false}",
		&acceptance));
	zassert_equal(strcmp(acceptance.request_id, "request-a"), 0);
	zassert_equal(acceptance.golfer_demand_window_ms, TEST_POLICY_MS);
	zassert_false(acceptance.duplicate);
}

ZTEST(complete_poll, test_22_duplicate_zero_remaining_parses)
{
	struct golfer_acceptance acceptance = {0};

	zassert_true(parse_acceptance("{\"status\":\"accepted\",\"event_type\":\"button_press\","
		"\"request_id\":\"request-a\",\"golfer_demand_window_ms\":123456,"
		"\"demand_window_remaining_ms\":5,\"duplicate\":true}", &acceptance));
	zassert_true(acceptance.duplicate);
	zassert_equal(acceptance.demand_window_remaining_ms, 5);
	memset(&acceptance, 0, sizeof(acceptance));
	zassert_true(parse_acceptance("{\"status\":\"accepted\",\"event_type\":\"button_press\","
		"\"request_id\":\"request-a\",\"golfer_demand_window_ms\":123456,"
		"\"demand_window_remaining_ms\":0,\"duplicate\":true}", &acceptance));
	zassert_true(acceptance.duplicate);
	zassert_equal(acceptance.demand_window_remaining_ms, 0);
}

ZTEST(complete_poll, test_23_invalid_protocol_responses_fail)
{
	struct golfer_acceptance acceptance = {0};
	const char *invalid[] = {
		"not-json",
		"{\"request_id\":\"request-a\"}",
		"{\"status\":\"accepted\",\"event_type\":\"button_press\",\"request_id\":\"request-a\",\"golfer_demand_window_ms\":1}",
		"{\"status\":\"accepted\",\"event_type\":\"button_press\",\"request_id\":\"request-a\",\"golfer_demand_window_ms\":\"123456\",\"duplicate\":false}",
		"{\"status\":\"accepted\",\"event_type\":\"button_press\",\"request_id\":\"request-a\",\"golfer_demand_window_ms\":4294967296,\"duplicate\":false}",
		"{\"status\":\"accepted\",\"event_type\":\"button_press\",\"request_id\":\"request-a\",\"golfer_demand_window_ms\":123456,\"duplicate\":true}",
		"{\"status\":\"accepted\",\"event_type\":\"button_press\",\"request_id\":\"request-a\",\"golfer_demand_window_ms\":123456,\"demand_window_remaining_ms\":4294967296,\"duplicate\":true}",
	};

	for (size_t index = 0; index < ARRAY_SIZE(invalid); index++) {
		zassert_false(parse_acceptance(invalid[index], &acceptance));
	}
}

ZTEST(complete_poll, test_24_legacy_parser_ignores_additive_fields)
{
	struct legacy_response { const char *request_id; } response = {0};
	const struct json_obj_descr descr[] = {
		JSON_OBJ_DESCR_PRIM(struct legacy_response, request_id, JSON_TOK_STRING),
	};
	char body[] = "{\"status\":\"accepted\",\"event_type\":\"button_press\","
		"\"request_id\":\"request-a\",\"golfer_demand_window_ms\":123456,\"duplicate\":false}";

	zassert_true(json_obj_parse(body, strlen(body), descr, ARRAY_SIZE(descr), &response) >= 0);
	zassert_equal(strcmp(response.request_id, "request-a"), 0);
}

ZTEST(complete_poll, test_25_request_omits_physical_press_age)
{
	struct golfer_acceptance acceptance = {0};

	fairway_host_uptime_ms = T0 + 425;
	zassert_equal(golfer_protocol_run_transaction(T0 + 15000, T0, &acceptance), 0);
	zassert_true(strstr(captured_request, "golfer_request_age_ms") == NULL);
	zassert_true(strstr(captured_request, "\"event_type\":\"button_press\"}") != NULL);
	zassert_equal(acceptance.press_time_ms, T0);
	zassert_equal(acceptance.response_received_ms, T0 + 425);
}

ZTEST(complete_poll, test_26_new_window_uses_original_press_and_poll_phase)
{
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0, T0 + 425,
							     TEST_POLICY_MS, 0, false);
	struct demand_window_snapshot window;
	struct complete_poll_snapshot poll;

	zassert_true(demand_window_start(1, &acceptance, T0 + 425));
	window = demand_window_get_snapshot(T0 + 425);
	zassert_true(window.active);
	zassert_equal(window.timeline_start_ms, T0);
	zassert_equal(window.deadline_ms, T0 + TEST_POLICY_MS);
	zassert_true(complete_poll_start(1, acceptance.request_id,
					window.timeline_start_ms, window.deadline_ms));
	poll = complete_poll_get_snapshot(T0);
	zassert_equal(poll.next_target_ms, T0 + COMPLETE_POLL_INTERVAL_MS);
}

ZTEST(complete_poll, test_27_late_new_acceptance_is_success_without_window)
{
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0,
							     T0 + TEST_POLICY_MS + 1,
							     TEST_POLICY_MS, 0, false);

	zassert_true(demand_window_start(1, &acceptance, T0 + TEST_POLICY_MS + 1));
	zassert_false(demand_window_get_snapshot(T0 + TEST_POLICY_MS + 1).active);
}

ZTEST(complete_poll, test_28_duplicate_deadline_uses_response_plus_remaining)
{
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0,
							     T0 + 1000,
							     TEST_POLICY_MS, 5000, true);
	struct demand_window_snapshot window;

	zassert_true(demand_window_start(1, &acceptance, T0 + 1000));
	window = demand_window_get_snapshot(T0 + 1000);
	zassert_true(window.active);
	zassert_equal(window.timeline_start_ms, T0 + 1000);
	zassert_equal(window.deadline_ms, T0 + 6000);
}

ZTEST(complete_poll, test_29_expired_duplicate_is_success_without_window)
{
	struct golfer_acceptance acceptance = acceptance_for("request-a", T0,
							     T0 + 1000,
							     TEST_POLICY_MS, 0, true);

	zassert_true(demand_window_start(1, &acceptance, T0 + 1000));
	zassert_false(demand_window_get_snapshot(T0 + 1000).active);
}

ZTEST_SUITE(complete_poll, NULL, NULL, reset_modules, NULL, NULL);