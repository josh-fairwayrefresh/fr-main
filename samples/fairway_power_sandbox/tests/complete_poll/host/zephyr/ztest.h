#ifndef FAIRWAY_HOST_ZEPHYR_ZTEST_H
#define FAIRWAY_HOST_ZEPHYR_ZTEST_H

#include <assert.h>
#include <stdio.h>

#define zassert_true(condition) assert(condition)
#define zassert_false(condition) assert(!(condition))
#define zassert_equal(actual, expected) assert((actual) == (expected))

#define ZTEST(suite, name) static void name(void)

#define RUN_TEST(name) do { \
	reset_modules(NULL); \
	name(); \
	puts("PASS " #name); \
} while (0)

#define ZTEST_SUITE(suite, predicate, setup, before, after, teardown) \
	int main(void) \
	{ \
		RUN_TEST(test_01_activation_schedules_first_target); \
		RUN_TEST(test_02_fast_empty_polls_preserve_targets); \
		RUN_TEST(test_03_twelve_second_poll_preserves_t30); \
		RUN_TEST(test_04_overrun_coalesces_missed_target); \
		RUN_TEST(test_05_no_catch_up_burst); \
		RUN_TEST(test_06_http_and_transport_failures_preserve_lifecycle); \
		RUN_TEST(test_07_lte_loss_retains_one_need_and_recovers); \
		RUN_TEST(test_08_complete_identity_is_retained); \
		RUN_TEST(test_09_uncertain_ack_retries_same_identity); \
		RUN_TEST(test_10_confirmed_ack_emits_once); \
		RUN_TEST(test_11_local_clear_requires_generation_and_request); \
		RUN_TEST(test_12_immutable_window_expiry); \
		RUN_TEST(test_13_exact_deadline_expiry_wins); \
		RUN_TEST(test_14_stale_generation_result_is_rejected); \
		RUN_TEST(test_15_successive_request_lifecycles); \
		RUN_TEST(test_16_poll_faults_do_not_affect_local_repeat_decision); \
		RUN_TEST(test_17_duplicate_uses_remaining_window_not_full_policy); \
		RUN_TEST(test_18_local_deadline_expires_without_complete_or_button_poll); \
		RUN_TEST(test_19_window_rejects_invalid_acceptance_contract); \
		RUN_TEST(test_20_transaction_handoff_preserves_acceptance_contract); \
		RUN_TEST(test_21_new_protocol_response_parses); \
		RUN_TEST(test_22_duplicate_zero_remaining_parses); \
		RUN_TEST(test_23_invalid_protocol_responses_fail); \
		RUN_TEST(test_24_legacy_parser_ignores_additive_fields); \
		RUN_TEST(test_25_request_omits_physical_press_age); \
		RUN_TEST(test_26_new_window_uses_original_press_and_poll_phase); \
		RUN_TEST(test_27_late_new_acceptance_is_success_without_window); \
		RUN_TEST(test_28_duplicate_deadline_uses_response_plus_remaining); \
		RUN_TEST(test_29_expired_duplicate_is_success_without_window); \
		puts("29/29 tests passed"); \
		return 0; \
	}

#endif