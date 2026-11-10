#include <zephyr/ztest.h>

#include <errno.h>

#include "ota_update_policy.h"
#include "ota_update_staging.h"

#define TEST_HARDWARE_ID "circuitdojo_feather_nrf9151@1/nrf9151/ns"

static struct fairway_ota_descriptor valid_descriptor(void)
{
	struct fairway_ota_descriptor descriptor = {
		.hardware_id = TEST_HARDWARE_ID,
		.image_size = 4096,
		.version = {
			.major = 1,
			.minor = 2,
			.revision = 3,
			.build = 4,
		},
	};

	return descriptor;
}

ZTEST(fairway_ota_update_policy, test_valid_descriptor)
{
	struct fairway_ota_descriptor descriptor = valid_descriptor();

	zassert_equal(fairway_ota_validate_descriptor(&descriptor, TEST_HARDWARE_ID,
						     8192), 0);
}

ZTEST(fairway_ota_update_policy, test_rejects_malformed_or_wrong_target)
{
	struct fairway_ota_descriptor descriptor = valid_descriptor();

	zassert_equal(fairway_ota_validate_descriptor(NULL, TEST_HARDWARE_ID, 8192),
		      -EINVAL);
	descriptor.hardware_id[0] = '\0';
	zassert_equal(fairway_ota_validate_descriptor(&descriptor, TEST_HARDWARE_ID,
						     8192), -EINVAL);
	descriptor = valid_descriptor();
	zassert_equal(fairway_ota_validate_descriptor(&descriptor, "other-board", 8192),
		      -EXDEV);
}

ZTEST(fairway_ota_update_policy, test_rejects_invalid_image_size)
{
	struct fairway_ota_descriptor descriptor = valid_descriptor();

	descriptor.image_size = 31;
	zassert_equal(fairway_ota_validate_descriptor(&descriptor, TEST_HARDWARE_ID,
						     8192), -EFBIG);
	descriptor.image_size = 8193;
	zassert_equal(fairway_ota_validate_descriptor(&descriptor, TEST_HARDWARE_ID,
						     8192), -EFBIG);
}

ZTEST(fairway_ota_update_policy, test_mcuboot_image_header_magic)
{
	const uint8_t valid_prefix[] = { 0x3d, 0xb8, 0xf3, 0x96 };
	const uint8_t invalid_prefix[] = { 0x00, 0x00, 0x00, 0x00 };

	zassert_true(fairway_ota_has_mcuboot_magic(valid_prefix, sizeof(valid_prefix)));
	zassert_false(fairway_ota_has_mcuboot_magic(invalid_prefix, sizeof(invalid_prefix)));
	zassert_false(fairway_ota_has_mcuboot_magic(valid_prefix, 3));
}

ZTEST(fairway_ota_update_policy, test_effective_move_swap_image_limit)
{
	struct fairway_ota_descriptor descriptor = valid_descriptor();

	descriptor.image_size = FAIRWAY_OTA_MAX_IMAGE_SIZE;
	zassert_equal(fairway_ota_validate_descriptor(&descriptor, TEST_HARDWARE_ID,
						     442368), 0);
	descriptor.image_size++;
	zassert_equal(fairway_ota_validate_descriptor(&descriptor, TEST_HARDWARE_ID,
						     442368), -EFBIG);
	descriptor.image_size = 442368;
	zassert_equal(fairway_ota_validate_descriptor(&descriptor, TEST_HARDWARE_ID,
						     442368), -EFBIG);
}

ZTEST(fairway_ota_update_policy, test_complete_test_boot_lifecycle)
{
	enum fairway_ota_state state = FAIRWAY_OTA_IDLE;

	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_START, &state));
	zassert_equal(state, FAIRWAY_OTA_DOWNLOADING);
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_STAGED, &state));
	zassert_equal(state, FAIRWAY_OTA_STAGED);
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_ACTIVATE, &state));
	zassert_equal(state, FAIRWAY_OTA_ACTIVATION_PENDING);
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_TRIAL_BOOT, &state));
	zassert_equal(state, FAIRWAY_OTA_TRIAL_BOOT);
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_CONFIRM, &state));
	zassert_equal(state, FAIRWAY_OTA_CONFIRMED);
}

ZTEST(fairway_ota_update_policy, test_confirmed_image_can_start_next_update)
{
	enum fairway_ota_state state = FAIRWAY_OTA_IDLE;

	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_CONFIRMED_BOOT,
					    &state));
	zassert_equal(state, FAIRWAY_OTA_CONFIRMED);
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_START, &state));
	zassert_equal(state, FAIRWAY_OTA_DOWNLOADING);
}

ZTEST(fairway_ota_update_policy, test_failure_and_cancel_transitions)
{
	enum fairway_ota_state state = FAIRWAY_OTA_IDLE;
	enum fairway_ota_state next;

	zassert_false(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_STAGED, &next));
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_START, &state));
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_FAIL, &state));
	zassert_equal(state, FAIRWAY_OTA_FAILED);
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_START_FAIL, &state));
	zassert_equal(state, FAIRWAY_OTA_FAILED);
	zassert_false(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_STAGED, &state));
	zassert_false(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_ACTIVATE, &state));
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_START, &state));
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_CANCEL, &state));
	zassert_equal(state, FAIRWAY_OTA_IDLE);
}

struct staging_fake {
	size_t offset;
	size_t expected_image_size;
	int init_calls;
	int reset_calls;
	int offset_calls;
	int fail_init_call;
	int fail_reset_call;
	int offset_error;
	bool keep_offset_after_reset;
};

static int staging_fake_init(size_t image_size, void *context)
{
	struct staging_fake *fake = context;

	fake->init_calls++;
	if (image_size != fake->expected_image_size) {
		return -EINVAL;
	}
	return fake->init_calls == fake->fail_init_call ? -EIO : 0;
}

static int staging_fake_reset(void *context)
{
	struct staging_fake *fake = context;

	fake->reset_calls++;
	if (fake->reset_calls == fake->fail_reset_call) {
		return -EIO;
	}
	if (!fake->keep_offset_after_reset) {
		fake->offset = 0;
	}
	return 0;
}

static int staging_fake_offset_get(size_t *offset, void *context)
{
	struct staging_fake *fake = context;

	fake->offset_calls++;
	if (fake->offset_error != 0) {
		return fake->offset_error;
	}
	*offset = fake->offset;
	return 0;
}

static struct fairway_ota_staging_ops staging_fake_ops(struct staging_fake *fake)
{
	return (struct fairway_ota_staging_ops) {
		.init = staging_fake_init,
		.reset = staging_fake_reset,
		.offset_get = staging_fake_offset_get,
		.context = fake,
	};
}

ZTEST(fairway_ota_update_policy, test_clean_start_discards_retained_progress)
{
	struct staging_fake fake = {
		.offset = 2048,
		.expected_image_size = 4096,
	};
	struct fairway_ota_staging_ops ops = staging_fake_ops(&fake);

	zassert_equal(fairway_ota_staging_start_clean(&ops, 4096), 0);
	zassert_equal(fake.init_calls, 2);
	zassert_equal(fake.reset_calls, 1);
	zassert_equal(fake.offset_calls, 1);
	zassert_equal(fake.offset, 0);
}

ZTEST(fairway_ota_update_policy, test_clean_retry_can_reach_staged_state)
{
	struct staging_fake fake = {
		.offset = 2048,
		.expected_image_size = 4096,
	};
	struct fairway_ota_staging_ops ops = staging_fake_ops(&fake);
	enum fairway_ota_state state = FAIRWAY_OTA_FAILED;

	zassert_equal(fairway_ota_staging_start_clean(&ops, 4096), 0);
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_START, &state));
	zassert_equal(state, FAIRWAY_OTA_DOWNLOADING);
	zassert_true(fairway_ota_transition(state, FAIRWAY_OTA_EVENT_STAGED, &state));
	zassert_equal(state, FAIRWAY_OTA_STAGED);
}

ZTEST(fairway_ota_update_policy, test_clean_start_fails_closed_on_init_errors)
{
	struct staging_fake first_init_failure = {
		.offset = 128,
		.expected_image_size = 4096,
		.fail_init_call = 1,
	};
	struct fairway_ota_staging_ops ops = staging_fake_ops(&first_init_failure);

	zassert_equal(fairway_ota_staging_start_clean(&ops, 4096), -EIO);
	zassert_equal(first_init_failure.reset_calls, 1);
	zassert_equal(first_init_failure.offset_calls, 0);

	struct staging_fake second_init_failure = {
		.offset = 128,
		.expected_image_size = 4096,
		.fail_init_call = 2,
	};
	ops = staging_fake_ops(&second_init_failure);
	zassert_equal(fairway_ota_staging_start_clean(&ops, 4096), -EIO);
	zassert_equal(second_init_failure.reset_calls, 2);
	zassert_equal(second_init_failure.offset_calls, 0);
}

ZTEST(fairway_ota_update_policy, test_clean_start_fails_closed_on_reset_errors)
{
	struct staging_fake fake = {
		.offset = 128,
		.expected_image_size = 4096,
		.fail_reset_call = 1,
	};
	struct fairway_ota_staging_ops ops = staging_fake_ops(&fake);

	zassert_equal(fairway_ota_staging_start_clean(&ops, 4096), -EIO);
	zassert_equal(fake.init_calls, 1);
	zassert_equal(fake.offset_calls, 0);
}

ZTEST(fairway_ota_update_policy, test_clean_start_rejects_nonzero_or_unavailable_offset)
{
	struct staging_fake nonzero_offset = {
		.offset = 77,
		.expected_image_size = 4096,
		.keep_offset_after_reset = true,
	};
	struct fairway_ota_staging_ops ops = staging_fake_ops(&nonzero_offset);

	zassert_equal(fairway_ota_staging_start_clean(&ops, 4096), -EIO);
	zassert_equal(nonzero_offset.reset_calls, 2);

	struct staging_fake offset_failure = {
		.expected_image_size = 4096,
		.offset_error = -EACCES,
	};
	ops = staging_fake_ops(&offset_failure);
	zassert_equal(fairway_ota_staging_start_clean(&ops, 4096), -EACCES);
	zassert_equal(offset_failure.reset_calls, 2);
}

ZTEST(fairway_ota_update_policy, test_trial_deadline_excludes_service_mode)
{
	zassert_true(fairway_ota_trial_deadline_required(true, false));
	zassert_false(fairway_ota_trial_deadline_required(true, true));
	zassert_false(fairway_ota_trial_deadline_required(false, false));
}

ZTEST(fairway_ota_update_policy, test_confirmation_requires_all_normal_boot_gates)
{
	zassert_true(fairway_ota_confirmation_allowed(FAIRWAY_OTA_TRIAL_BOOT,
						      false, true, true));
	zassert_false(fairway_ota_confirmation_allowed(FAIRWAY_OTA_TRIAL_BOOT,
						       true, true, true));
	zassert_false(fairway_ota_confirmation_allowed(FAIRWAY_OTA_TRIAL_BOOT,
						       false, false, true));
	zassert_false(fairway_ota_confirmation_allowed(FAIRWAY_OTA_TRIAL_BOOT,
						       false, true, false));
	zassert_false(fairway_ota_confirmation_allowed(FAIRWAY_OTA_CONFIRMED,
						       false, true, true));
}

ZTEST_SUITE(fairway_ota_update_policy, NULL, NULL, NULL, NULL, NULL);
