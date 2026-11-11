#include <errno.h>
#include <string.h>
#include <pm_config.h>

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

ZTEST(fairway_ota_scheduler, test_actual_confirmation_retries_survive_restart_and_stop_after_ack)
{
	struct fairway_ota_confirmation confirmation;
	ota_test_reset_fakes();
	fairway_ota_delivery_confirmation_init();
	ota_test.image_header.h.v1.sem_ver.major = 0;
	ota_test.image_header.h.v1.sem_ver.minor = 1;
	ota_test.image_header.h.v1.sem_ver.revision = 0;
	ota_test.image_header.h.v1.sem_ver.build_num = 1;
	zassert_equal(fairway_ota_delivery_confirm_running(), -EAGAIN);
	zassert_equal(ota_test.confirmation_calls, 0);
	fairway_ota_delivery_confirmation_healthy();
	ota_test.confirmation_error = -EIO;
	zassert_equal(fairway_ota_delivery_confirm_running(), -EIO);
	zassert_equal(ota_test.last_header_area_id, PM_MCUBOOT_PRIMARY_ID);
	zassert_equal(ota_test.confirmation_calls, 1);
	zassert_equal(fairway_ota_confirmation_prepare("0.1.0+1", &confirmation), 0);
	zassert_equal(confirmation.sequence, 1);
	zassert_false(confirmation.acknowledged);
	reset_manager();
	fairway_ota_delivery_confirmation_init();
	zassert_equal(fairway_ota_delivery_confirm_running(), -EAGAIN);
	fairway_ota_delivery_confirmation_healthy();
	ota_test.confirmation_error = 0;
	zassert_equal(fairway_ota_delivery_confirm_running(), 0);
	zassert_equal(ota_test.confirmation_calls, 2);
	zassert_equal(ota_test.confirmation_sequence, 1);
	zassert_equal(fairway_ota_delivery_confirm_running(), 0);
	zassert_equal(ota_test.confirmation_calls, 2);
}

ZTEST(fairway_ota_scheduler, test_actual_confirmation_requires_confirmed_matching_primary_header)
{
	ota_test_reset_fakes();
	fairway_ota_delivery_confirmation_init();
	fairway_ota_delivery_confirmation_healthy();
	ota_test.image_confirmed = false;
	zassert_equal(fairway_ota_delivery_confirm_running(), -EAGAIN);
	ota_test.image_confirmed = true;
	zassert_equal(fairway_ota_delivery_confirm_running(), -EPROTO);
	ota_test.header_error = -EIO;
	zassert_equal(fairway_ota_delivery_confirm_running(), -EIO);
	zassert_equal(ota_test.confirmation_calls, 0);
}

ZTEST(fairway_ota_scheduler, test_actual_confirmation_binds_only_matching_pending_activation)
{
	for (int scenario = 0; scenario < 4; scenario++) {
		ota_test_reset_fakes();
		fairway_ota_delivery_confirmation_init();
		fairway_ota_delivery_confirmation_healthy();
		ota_test.image_header.h.v1.sem_ver.major = 0;
		ota_test.image_header.h.v1.sem_ver.minor = 1;
		ota_test.image_header.h.v1.sem_ver.revision = 0;
		ota_test.image_header.h.v1.sem_ver.build_num = 1;
		zassert_equal(fairway_ota_scheduler_initialize(1000,
			CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION, FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), 0);
		zassert_equal(fairway_ota_scheduler_set_deployment("bound-deployment",
			scenario == 1 ? "99.0.0+1" : CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION), 0);
		if (scenario != 2) {
			zassert_equal(fairway_ota_scheduler_mark_activation_pending(), 0);
		}
		if (scenario == 3) {
			zassert_equal(fairway_ota_scheduler_mark_deployment_terminal(), 0);
		}
		ota_test.confirmation_error = -EIO;
		zassert_equal(fairway_ota_delivery_confirm_running(), -EIO);
		zassert_equal(strcmp(ota_test.confirmation_deployment_id,
			scenario == 0 ? "bound-deployment" : ""), 0);
		fairway_ota_delivery_confirmation_init();
		fairway_ota_delivery_confirmation_healthy();
		ota_test.confirmation_error = 0;
		zassert_equal(fairway_ota_delivery_confirm_running(), 0);
		zassert_equal(ota_test.confirmation_calls, 2);
		zassert_equal(ota_test.confirmation_sequence, 1);
		zassert_equal(strcmp(ota_test.confirmation_deployment_id,
			scenario == 0 ? "bound-deployment" : ""), 0);
	}
}

ZTEST(fairway_ota_scheduler, test_corrupt_deployment_binding_is_not_acknowledged_or_reset)
{
	static const uint8_t corrupt[] = {1, 2};
	ota_test_reset_fakes();
	fairway_ota_delivery_confirmation_init();
	fairway_ota_delivery_confirmation_healthy();
	ota_test.image_header.h.v1.sem_ver.major = 0;
	ota_test.image_header.h.v1.sem_ver.minor = 1;
	ota_test.image_header.h.v1.sem_ver.revision = 0;
	ota_test.image_header.h.v1.sem_ver.build_num = 1;
	ota_test_ps_put(SCHEDULE_UID, corrupt, sizeof(corrupt));
	zassert_equal(fairway_ota_delivery_confirm_running(), -EBADMSG);
	zassert_equal(ota_test.confirmation_calls, 0);
}

ZTEST(fairway_ota_scheduler, test_deployment_confirmation_also_waits_for_current_boot_health)
{
	ota_test_reset_fakes();
	reset_manager();
	fairway_ota_delivery_confirmation_init();
	zassert_equal(fairway_ota_scheduler_initialize(1000,
		CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION, FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), 0);
	zassert_equal(fairway_ota_scheduler_set_deployment("health-gate",
		CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION), 0);
	fairway_ota_delivery_report_pending_boot();
	zassert_equal(ota_test.report_calls, 0);
	fairway_ota_delivery_confirmation_healthy();
	fairway_ota_delivery_report_pending_boot();
	zassert_equal(ota_test.report_calls, 0);
	ota_test.image_header.h.v1.sem_ver.major = 0;
	ota_test.image_header.h.v1.sem_ver.minor = 1;
	ota_test.image_header.h.v1.sem_ver.revision = 0;
	ota_test.image_header.h.v1.sem_ver.build_num = 1;
	ota_test.confirmation_error = -EIO;
	zassert_equal(fairway_ota_delivery_confirm_running(), -EIO);
	fairway_ota_delivery_report_pending_boot();
	zassert_equal(ota_test.report_calls, 0);
	ota_test.confirmation_error = 0;
	zassert_equal(fairway_ota_delivery_confirm_running(), 0);
	fairway_ota_delivery_report_pending_boot();
	zassert_equal(ota_test.report_calls, 1);
	zassert_equal(strcmp(ota_test.last_report_state, "confirmed"), 0);
}

ZTEST(fairway_ota_scheduler, test_confirmation_changes_increment_sequence_including_return_to_prior_version)
{
	struct fairway_ota_confirmation initial, successor, rollback, restored;
	ota_test_reset_fakes();
	zassert_equal(fairway_ota_confirmation_prepare("0.1.0+4", &initial), 0);
	zassert_equal(fairway_ota_confirmation_acknowledge(&initial), 0);
	zassert_equal(fairway_ota_confirmation_prepare("0.1.0+4", &restored), 0);
	zassert_true(restored.acknowledged);
	zassert_equal(restored.sequence, initial.sequence);
	zassert_equal(fairway_ota_confirmation_prepare("0.1.0+5", &successor), 0);
	zassert_equal(successor.sequence, 2);
	zassert_false(successor.acknowledged);
	zassert_equal(fairway_ota_confirmation_acknowledge(&initial), -ESTALE);
	zassert_equal(fairway_ota_confirmation_prepare("0.1.0+4", &rollback), 0);
	zassert_equal(rollback.sequence, 3);
	zassert_false(rollback.acknowledged);
}

ZTEST(fairway_ota_scheduler, test_confirmation_storage_errors_do_not_acknowledge_or_rearm_schedule)
{
	struct fairway_ota_confirmation confirmation;
	struct fairway_ota_schedule_state schedule;
	static const uint8_t corrupt[] = {1, 2};
	ota_test_reset_fakes();
	zassert_equal(fairway_ota_scheduler_initialize(1000, "0.1.0+4",
		FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), 0);
	zassert_equal(fairway_ota_scheduler_mark_check_complete(), 0);
	ota_test_ps_fail_next_set();
	zassert_equal(fairway_ota_confirmation_prepare("0.1.0+4", &confirmation), -EIO);
	zassert_equal(fairway_ota_confirmation_prepare("0.1.0+4", &confirmation), 0);
	ota_test_ps_fail_next_set();
	zassert_equal(fairway_ota_confirmation_acknowledge(&confirmation), -EIO);
	zassert_equal(fairway_ota_confirmation_prepare("0.1.0+4", &confirmation), 0);
	zassert_false(confirmation.acknowledged);
	zassert_equal(fairway_ota_scheduler_get(&schedule), 0);
	zassert_true(schedule.one_time_complete);
	zassert_false(schedule.check_due);
	ota_test_ps_put(0x46520004u, corrupt, sizeof(corrupt));
	zassert_equal(fairway_ota_confirmation_prepare("0.1.0+4", &confirmation), -EBADMSG);
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
