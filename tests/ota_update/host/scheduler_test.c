#include <errno.h>
#include <string.h>

#include <zephyr/ztest.h>

#include "ota_delivery.h"
#include "ota_test_fakes.h"
#include "ota_update.h"
#include "ota_update_scheduler.h"

void ota_update_test_reset(void);

#define DEVICE_ID_UID 0x46520001u
#define DEVICE_KEY_UID 0x46520002u
#define SCHEDULE_UID 0x46520003u

static const char stored_device_id[] = "FRB-0005";
static const char stored_device_key[] = "credential-sentinel";

static void reset_manager(void)
{
	ota_update_test_reset();
	zassert_equal(ota_update_init(false), 0);
}

static void seed_identity(void)
{
	ota_test_ps_put(DEVICE_ID_UID, stored_device_id, sizeof(stored_device_id));
	ota_test_ps_put(DEVICE_KEY_UID, stored_device_key, sizeof(stored_device_key));
}

static void assert_identity_unchanged(void)
{
	char device_id[sizeof(stored_device_id)] = {0};
	char device_key[sizeof(stored_device_key)] = {0};
	size_t length = 0;

	zassert_equal(psa_ps_get(DEVICE_ID_UID, 0, sizeof(device_id),
				 device_id, &length), PSA_SUCCESS);
	zassert_equal(length, sizeof(stored_device_id));
	zassert_equal(memcmp(device_id, stored_device_id, sizeof(device_id)), 0);
	zassert_equal(psa_ps_get(DEVICE_KEY_UID, 0, sizeof(device_key),
				 device_key, &length), PSA_SUCCESS);
	zassert_equal(length, sizeof(stored_device_key));
	zassert_equal(memcmp(device_key, stored_device_key, sizeof(device_key)), 0);
}

static void prepare_pending_nightly_activation(void)
{
	zassert_equal(fairway_ota_scheduler_initialize(
			      1000, "0.1.0+1",
			      FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), 0);
	zassert_equal(fairway_ota_scheduler_mark_check_complete(), 0);
	zassert_equal(fairway_ota_scheduler_set_deployment(
			      "ota-alt-deployment", "0.1.0+2"), 0);
	zassert_equal(fairway_ota_scheduler_mark_activation_pending(), 0);
	zassert_equal(fairway_ota_scheduler_initialize(
			      0, "0.1.0+2",
			      FAIRWAY_OTA_SCHEDULE_MODE_NIGHTLY), 0);
}

ZTEST(fairway_ota_scheduler, test_initial_check_transition_trial_rollback_and_recovery)
{
	struct fairway_ota_schedule_state schedule;

	ota_update_test_reset();
	ota_test_reset_fakes();
	seed_identity();
	reset_manager();

	zassert_equal(fairway_ota_delivery_initialize_and_report_boot(
			      1000, "0.1.0+1",
			      FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), 0);
	zassert_equal(fairway_ota_scheduler_get(&schedule), 0);
	zassert_equal(schedule.mode, FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME);
	zassert_equal(schedule.next_check_utc_ms, 901000);
	zassert_true(schedule.check_due);
	zassert_false(schedule.one_time_complete);
	zassert_equal(ota_test.report_calls, 0);

	zassert_equal(fairway_ota_scheduler_mark_check_complete(), 0);
	zassert_equal(fairway_ota_scheduler_set_deployment(
			      "ota-alt-deployment", "0.1.0+2"), 0);
	zassert_equal(fairway_ota_scheduler_mark_activation_pending(), 0);
	ota_update_test_reset();
	ota_test.image_confirmed = false;
	zassert_equal(ota_update_init(false), 0);
	zassert_equal(fairway_ota_delivery_initialize_and_report_boot(
			      0, "0.1.0+2",
			      FAIRWAY_OTA_SCHEDULE_MODE_NIGHTLY), 0);
	zassert_equal(ota_test.report_calls, 1);
	zassert_equal(strcmp(ota_test.last_report_state, "trial_boot"), 0);
	zassert_equal(fairway_ota_scheduler_set_next_check(2000000), 0);
	zassert_equal(fairway_ota_scheduler_get(&schedule), 0);
	zassert_equal(schedule.mode, FAIRWAY_OTA_SCHEDULE_MODE_NIGHTLY);
	zassert_equal(schedule.next_check_utc_ms, 2000000);

	ota_update_test_reset();
	ota_test.image_confirmed = true;
	zassert_equal(ota_update_init(false), 0);
	zassert_equal(fairway_ota_delivery_initialize_and_report_boot(
			      0, "0.1.0+1",
			      FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), 0);
	zassert_equal(ota_test.report_calls, 2);
	zassert_equal(strcmp(ota_test.last_report_state, "rolled_back"), 0);
	zassert_equal(strcmp(ota_test.last_report_deployment_id,
			     "ota-alt-deployment"), 0);
	zassert_equal(fairway_ota_scheduler_get(&schedule), 0);
	zassert_equal(schedule.mode, FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME);
	zassert_equal(schedule.next_check_utc_ms, 0);
	zassert_false(schedule.check_due);
	zassert_true(schedule.one_time_complete);
	zassert_true(schedule.activation_pending);
	zassert_true(schedule.deployment_terminal_reported);
	zassert_equal(strcmp(schedule.target_version, "0.1.0+2"), 0);
	assert_identity_unchanged();

	zassert_equal(fairway_ota_delivery_initialize_and_report_boot(
			      0, "0.1.0+1",
			      FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), 0);
	zassert_equal(ota_test.report_calls, 2);
	zassert_equal(fairway_ota_scheduler_set_next_check(3000000), -EINVAL);
	zassert_equal(fairway_ota_scheduler_get(&schedule), 0);
	zassert_equal(schedule.mode, FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME);
	zassert_false(schedule.check_due);
	assert_identity_unchanged();
}

ZTEST(fairway_ota_scheduler, test_rollback_report_is_attempted_when_schedule_recovery_fails)
{
	ota_update_test_reset();
	ota_test_reset_fakes();
	prepare_pending_nightly_activation();
	ota_test_ps_fail_next_set();
	reset_manager();

	zassert_equal(fairway_ota_delivery_initialize_and_report_boot(
			      0, "0.1.0+1",
			      FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), -EIO);
	zassert_equal(ota_test.report_calls, 1);
	zassert_equal(strcmp(ota_test.last_report_state, "rolled_back"), 0);

	zassert_equal(fairway_ota_delivery_initialize_and_report_boot(
			      0, "0.1.0+1",
			      FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), 0);
	zassert_equal(ota_test.report_calls, 1);
}

ZTEST(fairway_ota_scheduler, test_unrecognized_schedule_mismatch_fails_closed)
{
	struct fairway_ota_schedule_state schedule;

	ota_update_test_reset();
	ota_test_reset_fakes();
	zassert_equal(fairway_ota_scheduler_initialize(
			      1000, "1.0.0+1",
			      FAIRWAY_OTA_SCHEDULE_MODE_NIGHTLY), 0);
	zassert_equal(fairway_ota_scheduler_initialize(
			      1000, "0.1.0+1",
			      FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), -EPERM);
	zassert_equal(fairway_ota_scheduler_get(&schedule), 0);
	zassert_equal(schedule.mode, FAIRWAY_OTA_SCHEDULE_MODE_NIGHTLY);
}

ZTEST(fairway_ota_scheduler, test_corrupt_schedule_fails_closed_without_reporting)
{
	static const uint8_t corrupt_state[] = {0x01, 0x02, 0x03};
	ota_update_test_reset();
	ota_test_reset_fakes();
	ota_test_ps_put(SCHEDULE_UID, corrupt_state, sizeof(corrupt_state));
	reset_manager();

	zassert_equal(fairway_ota_delivery_initialize_and_report_boot(
			      1000, "0.1.0+1",
			      FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), -EBADMSG);
	zassert_equal(ota_test.report_calls, 0);
}
