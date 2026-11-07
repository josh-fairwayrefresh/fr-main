#include <errno.h>
#include <string.h>

#include <zephyr/ztest.h>

#include "ota_test_fakes.h"
#include "ota_update.h"

void ota_update_test_reset(void);

static void reset_environment(void)
{
	ota_update_test_reset();
	ota_test_reset_fakes();
}

static struct fairway_ota_descriptor descriptor_for(const uint8_t *image,
						    size_t image_size)
{
	struct fairway_ota_descriptor descriptor = {
		.hardware_id = CONFIG_FAIRWAY_OTA_HARDWARE_ID,
		.image_size = image_size,
		.version = {
			.major = 1,
			.minor = 2,
			.revision = 3,
			.build = 4,
		},
	};

	ota_test_digest(image, image_size, descriptor.sha256);
	return descriptor;
}

static void init_manager(bool trial, bool service_mode)
{
	ota_test.image_confirmed = !trial;
	zassert_equal(ota_update_init(service_mode), 0);
	zassert_equal(ota_test.dfu_set_buf_calls, 1);
}

static void begin_image(const uint8_t *image, size_t image_size)
{
	struct fairway_ota_descriptor descriptor = descriptor_for(image, image_size);

	zassert_equal(ota_update_begin(&descriptor), 0);
}

static void assert_failed_and_not_installable(void)
{
	struct fairway_ota_status status;

	ota_update_get_status(&status);
	zassert_equal(status.state, FAIRWAY_OTA_FAILED);
	zassert_equal(ota_update_schedule_activation(), -EINVAL);
	zassert_equal(ota_test.dfu_schedule_calls, 0);
}

ZTEST(fairway_ota_update_policy, test_manager_successful_multichunk_transfer_and_activation)
{
	static const uint8_t image[32] = {
		0x3d, 0xb8, 0xf3, 0x96, 0x10, 0x21, 0x32, 0x43, 0x54, 0x65, 0x76, 0x87,
	};
	struct fairway_ota_status status;

	reset_environment();
	init_manager(false, false);
	begin_image(image, sizeof(image));
	zassert_equal(ota_update_write(image, 2), 0);
	ota_update_get_status(&status);
	zassert_equal(status.bytes_received, 2);
	zassert_equal(status.state, FAIRWAY_OTA_DOWNLOADING);
	zassert_equal(ota_update_write(image + 2, 3), 0);
	zassert_equal(ota_update_write(image + 5, sizeof(image) - 5), 0);
	zassert_equal(ota_update_finish(), 0);
	ota_update_get_status(&status);
	zassert_equal(status.bytes_received, sizeof(image));
	zassert_equal(status.image_size, sizeof(image));
	zassert_equal(status.state, FAIRWAY_OTA_STAGED);
	zassert_equal(ota_test.dfu_done_success_calls, 1);
	zassert_equal(ota_test.dfu_done_abort_calls, 0);
	zassert_equal(ota_test.staged_length, sizeof(image));
	zassert_equal(memcmp(ota_test.staged_bytes, image, sizeof(image)), 0);
	zassert_equal(ota_update_schedule_activation(), 0);
	ota_update_get_status(&status);
	zassert_equal(status.state, FAIRWAY_OTA_ACTIVATION_PENDING);
	zassert_equal(ota_test.dfu_schedule_calls, 1);
}

ZTEST(fairway_ota_update_policy, test_manager_short_transfer_cannot_stage)
{
	static const uint8_t image[32] = {
		0x3d, 0xb8, 0xf3, 0x96, 0x10, 0x21, 0x32, 0x43,
	};

	reset_environment();
	init_manager(false, false);
	begin_image(image, sizeof(image));
	zassert_equal(ota_update_write(image, 4), 0);
	zassert_equal(ota_update_finish(), -EINVAL);
	assert_failed_and_not_installable();
	zassert_equal(ota_test.dfu_done_abort_calls, 1);
	zassert_equal(ota_test.dfu_reset_calls, 2);
}

ZTEST(fairway_ota_update_policy, test_manager_rejects_digest_and_header_mismatches)
{
	static const uint8_t image[32] = {
		0x3d, 0xb8, 0xf3, 0x96, 0x10, 0x21, 0x32, 0x43,
	};
	struct fairway_ota_descriptor descriptor;

	reset_environment();
	init_manager(false, false);
	descriptor = descriptor_for(image, sizeof(image));
	descriptor.sha256[0] ^= 0x80;
	zassert_equal(ota_update_begin(&descriptor), 0);
	zassert_equal(ota_update_write(image, sizeof(image)), 0);
	zassert_equal(ota_update_finish(), -EBADMSG);
	assert_failed_and_not_installable();

	reset_environment();
	init_manager(false, false);
	begin_image(image, sizeof(image));
	zassert_equal(ota_update_write(image, sizeof(image)), 0);
	ota_test.image_header.h.v1.sem_ver.minor++;
	zassert_equal(ota_update_finish(), -EPROTO);
	assert_failed_and_not_installable();
	zassert_equal(ota_test.dfu_done_success_calls, 1);
}

ZTEST(fairway_ota_update_policy, test_manager_rejects_bad_magic_and_dfu_failures)
{
	static const uint8_t bad_magic[32] = { 0, 0, 0, 0, 0x10, 0x21, 0x32, 0x43 };
	static const uint8_t image[32] = { 0x3d, 0xb8, 0xf3, 0x96, 0x10, 0x21, 0x32, 0x43 };

	reset_environment();
	init_manager(false, false);
	begin_image(bad_magic, sizeof(bad_magic));
	zassert_equal(ota_update_write(bad_magic, sizeof(bad_magic)), -EBADMSG);
	assert_failed_and_not_installable();

	reset_environment();
	init_manager(false, false);
	begin_image(image, sizeof(image));
	ota_test.dfu_write_error_call = 1;
	zassert_equal(ota_update_write(image, sizeof(image)), -EIO);
	assert_failed_and_not_installable();

	reset_environment();
	init_manager(false, false);
	begin_image(image, sizeof(image));
	zassert_equal(ota_update_write(image, sizeof(image)), 0);
	ota_test.dfu_done_success_error = -EIO;
	zassert_equal(ota_update_finish(), -EIO);
	assert_failed_and_not_installable();
	zassert_equal(ota_test.dfu_done_abort_calls, 1);
}

ZTEST(fairway_ota_update_policy, test_manager_failed_transfer_retries_from_zero_with_fresh_hash)
{
	static const uint8_t old_image[32] = {
		0x3d, 0xb8, 0xf3, 0x96, 0x10, 0x20, 0x30, 0x40,
	};
	static const uint8_t new_image[32] = {
		0x3d, 0xb8, 0xf3, 0x96, 0xaa, 0xbb, 0xcc, 0xdd,
	};
	struct fairway_ota_status status;

	reset_environment();
	init_manager(false, false);
	begin_image(old_image, sizeof(old_image));
	ota_test.dfu_write_error_call = 1;
	zassert_equal(ota_update_write(old_image, sizeof(old_image)), -EIO);
	zassert_equal(ota_test.dfu_done_abort_calls, 1);
	zassert_equal(ota_test.dfu_offset, 0);

	ota_test.dfu_write_error_call = 0;
	begin_image(new_image, sizeof(new_image));
	ota_update_get_status(&status);
	zassert_equal(status.state, FAIRWAY_OTA_DOWNLOADING);
	zassert_equal(status.bytes_received, 0);
	zassert_equal(status.image_size, sizeof(new_image));
	zassert_equal(ota_test.dfu_offset, 0);
	zassert_equal(ota_update_write(new_image, sizeof(new_image)), 0);
	zassert_equal(ota_update_finish(), 0);
	ota_update_get_status(&status);
	zassert_equal(status.state, FAIRWAY_OTA_STAGED);
	zassert_equal(status.bytes_received, sizeof(new_image));
	zassert_equal(ota_test.staged_length, sizeof(new_image));
	zassert_equal(memcmp(ota_test.staged_bytes, new_image, sizeof(new_image)), 0);
}

ZTEST(fairway_ota_update_policy, test_manager_clean_start_errors_fail_closed)
{
	static const uint8_t image[32] = {
		0x3d, 0xb8, 0xf3, 0x96, 0x10, 0x21, 0x32, 0x43,
	};

	reset_environment();
	init_manager(false, false);
	ota_test.dfu_init_error_call = 1;
	zassert_equal(ota_update_begin(&(struct fairway_ota_descriptor) {
		.hardware_id = CONFIG_FAIRWAY_OTA_HARDWARE_ID,
		.image_size = sizeof(image),
	}), -EIO);
	zassert_equal(ota_update_write(image, sizeof(image)), -EINVAL);
	assert_failed_and_not_installable();

	reset_environment();
	init_manager(false, false);
	ota_test.dfu_reset_error_call = 1;
	struct fairway_ota_descriptor descriptor = descriptor_for(image, sizeof(image));
	zassert_equal(ota_update_begin(&descriptor), -EIO);
	assert_failed_and_not_installable();
	zassert_equal(ota_update_write(image, sizeof(image)), -EINVAL);
}

ZTEST(fairway_ota_update_policy, test_manager_confirmation_requires_both_readiness_gates_once)
{
	struct fairway_ota_status status;

	reset_environment();
	init_manager(true, false);
	zassert_equal(ota_test_scheduled_work->delay,
		      CONFIG_FAIRWAY_OTA_TRIAL_TIMEOUT_SECONDS);
	zassert_equal(ota_update_confirm_healthy(false, true), -EAGAIN);
	zassert_equal(ota_update_confirm_healthy(true, false), -EAGAIN);
	zassert_equal(ota_test.confirm_calls, 0);
	zassert_equal(ota_update_confirm_healthy(true, true), 0);
	zassert_equal(ota_update_confirm_healthy(true, true), 0);
	zassert_equal(ota_test.confirm_calls, 1);
	zassert_equal(ota_test_scheduled_work, NULL);
	ota_update_get_status(&status);
	zassert_equal(status.state, FAIRWAY_OTA_CONFIRMED);
}

ZTEST(fairway_ota_update_policy, test_manager_trial_deadline_reboots_unconfirmed_image)
{
	struct fairway_ota_status status;

	reset_environment();
	init_manager(true, false);
	zassert_equal(ota_update_confirm_healthy(false, false), -EAGAIN);
	zassert_equal(ota_test.confirm_calls, 0);
	ota_test_fire_trial_deadline();
	zassert_equal(ota_test.reboot_calls, 1);
	zassert_equal(ota_test.confirm_calls, 0);
	zassert_false(ota_test.image_confirmed);
	ota_update_get_status(&status);
	zassert_equal(status.state, FAIRWAY_OTA_FAILED);
	zassert_equal(status.last_error, -ETIMEDOUT);
}

ZTEST(fairway_ota_update_policy, test_manager_service_mode_never_confirms_or_arms_deadline)
{
	struct fairway_ota_status status;

	reset_environment();
	init_manager(true, true);
	zassert_equal(ota_test_scheduled_work, NULL);
	zassert_equal(ota_update_confirm_healthy(true, true), -EAGAIN);
	zassert_equal(ota_test.confirm_calls, 0);
	ota_test_fire_trial_deadline();
	zassert_equal(ota_test.reboot_calls, 0);
	zassert_false(ota_test.image_confirmed);
	ota_update_get_status(&status);
	zassert_equal(status.state, FAIRWAY_OTA_TRIAL_BOOT);
}
