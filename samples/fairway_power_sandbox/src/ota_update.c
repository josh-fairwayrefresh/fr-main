#include "ota_update.h"

#include <errno.h>
#include <string.h>

#include <pm_config.h>
#include <psa/crypto.h>
#include <zephyr/dfu/mcuboot.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/reboot.h>

#include <dfu/dfu_target.h>
#include <dfu/dfu_target_mcuboot.h>

#include "ota_update_staging.h"

LOG_MODULE_REGISTER(ota_update);

#define MCUBOOT_HEADER_PREFIX_SIZE 4
#define DFU_FLASH_BUFFER_SIZE 512

static struct fairway_ota_status update_status;
static struct fairway_ota_descriptor update_descriptor;
static psa_hash_operation_t image_hash = PSA_HASH_OPERATION_INIT;
static uint8_t dfu_flash_buffer[DFU_FLASH_BUFFER_SIZE] __aligned(4);
static uint8_t image_prefix[MCUBOOT_HEADER_PREFIX_SIZE];
static size_t image_prefix_length;
static bool dfu_target_active;
static bool image_hash_active;
static bool initialized;
static bool boot_service_mode;
static struct k_work_delayable trial_timeout_work;

K_MUTEX_DEFINE(update_mutex);

static int transition_locked(enum fairway_ota_event event, int error)
{
	enum fairway_ota_state next;

	if (!fairway_ota_transition(update_status.state, event, &next)) {
		return -EINVAL;
	}
	update_status.state = next;
	update_status.last_error = error;
	LOG_INF("OTA state=%d error=%d", next, error);
	return 0;
}

static int reset_hash(void)
{
	if (image_hash_active) {
		psa_status_t status = psa_hash_abort(&image_hash);

		if (status != PSA_SUCCESS) {
			return -EIO;
		}
		image_hash_active = false;
	}
	image_hash = (psa_hash_operation_t)PSA_HASH_OPERATION_INIT;
	return 0;
}

static int fail_locked(int error)
{
	if (image_hash_active) {
		psa_status_t hash_ret = psa_hash_abort(&image_hash);

		if (hash_ret != PSA_SUCCESS) {
			LOG_ERR("OTA hash cleanup failed: %d", hash_ret);
		}
		image_hash_active = false;
		image_hash = (psa_hash_operation_t)PSA_HASH_OPERATION_INIT;
	}
	if (dfu_target_active) {
		int done_ret = dfu_target_done(false);

		if (done_ret != 0) {
			LOG_ERR("OTA DFU abort completion failed: %d", done_ret);
		}

		int reset_ret = dfu_target_reset();

		if (reset_ret != 0) {
			LOG_ERR("OTA DFU staging reset failed: %d", reset_ret);
		} else {
			dfu_target_active = false;
		}
	}
	(void)transition_locked(FAIRWAY_OTA_EVENT_FAIL, error);
	return error;
}

static int staging_target_init(size_t image_size, void *context)
{
	ARG_UNUSED(context);
	return dfu_target_init(DFU_TARGET_IMAGE_TYPE_MCUBOOT, 0, image_size, NULL);
}

static int staging_target_reset(void *context)
{
	ARG_UNUSED(context);
	return dfu_target_reset();
}

static int staging_target_offset_get(size_t *offset, void *context)
{
	ARG_UNUSED(context);
	return dfu_target_offset_get(offset);
}

static int discard_staging_locked(void)
{
	int ret = dfu_target_reset();

	if (ret != 0) {
		LOG_ERR("OTA DFU staging reset failed: %d", ret);
		return ret;
	}

	dfu_target_active = false;
	return 0;
}

static int write_image_data(const void *data, size_t length)
{
	int ret = dfu_target_write(data, length);

	if (ret != 0) {
		return ret;
	}
	if (psa_hash_update(&image_hash, data, length) != PSA_SUCCESS) {
		return -EIO;
	}
	return 0;
}

static bool image_version_matches(const struct mcuboot_img_header *header)
{
	const struct fairway_ota_version *expected = &update_descriptor.version;
	const struct mcuboot_img_sem_ver *actual;

	if (header->mcuboot_version != 1) {
		return false;
	}
	actual = &header->h.v1.sem_ver;
	return actual->major == expected->major &&
	       actual->minor == expected->minor &&
	       actual->revision == expected->revision &&
	       actual->build_num == expected->build;
}

static void trial_timeout_handler(struct k_work *work)
{
	ARG_UNUSED(work);
	k_mutex_lock(&update_mutex, K_FOREVER);
	if (update_status.state == FAIRWAY_OTA_TRIAL_BOOT) {
		(void)transition_locked(FAIRWAY_OTA_EVENT_FAIL, -ETIMEDOUT);
		k_mutex_unlock(&update_mutex);
		LOG_ERR("OTA trial health check timed out; rebooting for MCUboot revert");
		sys_reboot(SYS_REBOOT_COLD);
		return;
	}
	k_mutex_unlock(&update_mutex);
}

int ota_update_init(bool service_mode)
{
	int ret;

	k_mutex_lock(&update_mutex, K_FOREVER);
	if (initialized) {
		k_mutex_unlock(&update_mutex);
		return 0;
	}

	memset(&update_status, 0, sizeof(update_status));
	update_status.state = FAIRWAY_OTA_IDLE;
	boot_service_mode = service_mode;
	k_work_init_delayable(&trial_timeout_work, trial_timeout_handler);
	initialized = true;

	if (!boot_is_img_confirmed()) {
		ret = transition_locked(FAIRWAY_OTA_EVENT_TRIAL_BOOT, 0);
		if (ret == 0 && fairway_ota_trial_deadline_required(true, service_mode)) {
			ret = k_work_schedule(&trial_timeout_work,
				K_SECONDS(CONFIG_FAIRWAY_OTA_TRIAL_TIMEOUT_SECONDS));
			if (ret < 0) {
				update_status.last_error = ret;
				k_mutex_unlock(&update_mutex);
				ota_update_request_trial_revert(ret);
				return ret;
			}
		}
	} else {
		ret = transition_locked(FAIRWAY_OTA_EVENT_CONFIRMED_BOOT, 0);
	}
	ret = dfu_target_mcuboot_set_buf(dfu_flash_buffer, sizeof(dfu_flash_buffer));
	k_mutex_unlock(&update_mutex);
	if (ret != 0) {
		LOG_ERR("MCUboot DFU buffer initialization failed: %d", ret);
	}
	return ret;
}

int ota_update_begin(const struct fairway_ota_descriptor *descriptor)
{
	psa_status_t crypto_ret;
	enum fairway_ota_state next_state;
	static const struct fairway_ota_staging_ops staging_ops = {
		.init = staging_target_init,
		.reset = staging_target_reset,
		.offset_get = staging_target_offset_get,
	};
	int ret;

	if (!initialized) {
		return -EACCES;
	}
	k_mutex_lock(&update_mutex, K_FOREVER);
	ret = fairway_ota_validate_descriptor(descriptor, CONFIG_FAIRWAY_OTA_HARDWARE_ID,
					      PM_MCUBOOT_SECONDARY_SIZE);
	if (ret != 0) {
		update_status.last_error = ret;
		k_mutex_unlock(&update_mutex);
		return ret;
	}
	if (!fairway_ota_transition(update_status.state, FAIRWAY_OTA_EVENT_START,
				    &next_state)) {
		k_mutex_unlock(&update_mutex);
		return -EINVAL;
	}
	crypto_ret = psa_crypto_init();
	if (crypto_ret != PSA_SUCCESS) {
		update_status.last_error = -EIO;
		k_mutex_unlock(&update_mutex);
		LOG_ERR("PSA crypto initialization failed: %d", crypto_ret);
		return -EIO;
	}

	ret = fairway_ota_staging_start_clean(&staging_ops, descriptor->image_size);
	if (ret != 0) {
		LOG_ERR("OTA clean staging start failed: %d", ret);
		update_status.last_error = ret;
		(void)transition_locked(FAIRWAY_OTA_EVENT_START_FAIL, ret);
		k_mutex_unlock(&update_mutex);
		return ret;
	}

	dfu_target_active = true;
	update_descriptor = *descriptor;
	update_status.bytes_received = 0;
	update_status.image_size = descriptor->image_size;
	update_status.version = descriptor->version;
	image_prefix_length = 0;

	ret = reset_hash();
	if (ret == 0) {
		crypto_ret = psa_hash_setup(&image_hash, PSA_ALG_SHA_256);
		if (crypto_ret != PSA_SUCCESS) {
			ret = -EIO;
		} else {
			image_hash_active = true;
		}
	}
	if (ret != 0) {
		(void)reset_hash();
		int reset_ret = discard_staging_locked();

		if (reset_ret != 0) {
			LOG_ERR("OTA staging cleanup after hash setup failure failed: %d",
				reset_ret);
		}
		update_status.last_error = ret;
		(void)transition_locked(FAIRWAY_OTA_EVENT_START_FAIL, ret);
		k_mutex_unlock(&update_mutex);
		return ret;
	}

	ret = transition_locked(FAIRWAY_OTA_EVENT_START, 0);
	if (ret != 0) {
		(void)reset_hash();
		int reset_ret = discard_staging_locked();

		if (reset_ret != 0) {
			LOG_ERR("OTA staging cleanup after state transition failure failed: %d",
				reset_ret);
		}
		update_status.last_error = ret;
		(void)transition_locked(FAIRWAY_OTA_EVENT_START_FAIL, ret);
		k_mutex_unlock(&update_mutex);
		return ret;
	}

	k_mutex_unlock(&update_mutex);
	return 0;
}

int ota_update_write(const void *data, size_t length)
{
	const uint8_t *bytes = data;
	size_t remaining = length;
	int ret = 0;

	if (data == NULL || length == 0 || !initialized) {
		return -EINVAL;
	}
	k_mutex_lock(&update_mutex, K_FOREVER);
	if (update_status.state != FAIRWAY_OTA_DOWNLOADING) {
		k_mutex_unlock(&update_mutex);
		return -EINVAL;
	}
	if (length > update_status.image_size - update_status.bytes_received) {
		ret = fail_locked(-EINVAL);
		k_mutex_unlock(&update_mutex);
		return ret;
	}

	if (image_prefix_length < sizeof(image_prefix)) {
		size_t prefix_needed = sizeof(image_prefix) - image_prefix_length;
		size_t prefix_count = MIN(prefix_needed, remaining);

		memcpy(&image_prefix[image_prefix_length], bytes, prefix_count);
		image_prefix_length += prefix_count;
		update_status.bytes_received += prefix_count;
		bytes += prefix_count;
		remaining -= prefix_count;
		if (image_prefix_length < sizeof(image_prefix)) {
			k_mutex_unlock(&update_mutex);
			return 0;
		}
		if (!fairway_ota_has_mcuboot_magic(image_prefix, sizeof(image_prefix))) {
			ret = fail_locked(-EBADMSG);
			k_mutex_unlock(&update_mutex);
			return ret;
		}
		ret = write_image_data(image_prefix, sizeof(image_prefix));
		if (ret != 0) {
			ret = fail_locked(ret);
			k_mutex_unlock(&update_mutex);
			return ret;
		}
	}

	if (remaining > 0) {
		ret = write_image_data(bytes, remaining);
		if (ret != 0) {
			ret = fail_locked(ret);
			k_mutex_unlock(&update_mutex);
			return ret;
		}
		update_status.bytes_received += remaining;
	}
	k_mutex_unlock(&update_mutex);
	return 0;
}

int ota_update_finish(void)
{
	uint8_t digest[FAIRWAY_OTA_SHA256_SIZE];
	size_t digest_length = 0;
	struct mcuboot_img_header header;
	int ret;

	if (!initialized) {
		return -EACCES;
	}
	k_mutex_lock(&update_mutex, K_FOREVER);
	if (update_status.state != FAIRWAY_OTA_DOWNLOADING) {
		k_mutex_unlock(&update_mutex);
		return -EINVAL;
	}
	if (update_status.bytes_received != update_status.image_size ||
	    image_prefix_length != sizeof(image_prefix)) {
		ret = fail_locked(-EINVAL);
		k_mutex_unlock(&update_mutex);
		return ret;
	}
	psa_status_t hash_ret = psa_hash_finish(&image_hash, digest, sizeof(digest),
					       &digest_length);
	image_hash_active = false;
	if (hash_ret != PSA_SUCCESS || digest_length != sizeof(digest) ||
	    memcmp(digest, update_descriptor.sha256, sizeof(digest)) != 0) {
		ret = fail_locked(hash_ret == PSA_SUCCESS ? -EBADMSG : -EIO);
		k_mutex_unlock(&update_mutex);
		return ret;
	}

	ret = dfu_target_done(true);
	if (ret != 0) {
		ret = fail_locked(ret);
		k_mutex_unlock(&update_mutex);
		return ret;
	}
	dfu_target_active = false;

	ret = boot_read_bank_header(PM_MCUBOOT_SECONDARY_ID, &header, sizeof(header));
	if (ret != 0 || !image_version_matches(&header)) {
		int cleanup_ret = dfu_target_reset();

		if (cleanup_ret != 0 && cleanup_ret != -EACCES) {
			LOG_ERR("Rejected OTA image cleanup failed: %d", cleanup_ret);
		}
		ret = fail_locked(ret != 0 ? ret : -EPROTO);
		k_mutex_unlock(&update_mutex);
		return ret;
	}
	ret = transition_locked(FAIRWAY_OTA_EVENT_STAGED, 0);
	k_mutex_unlock(&update_mutex);
	return ret;
}

int ota_update_schedule_activation(void)
{
	int ret;

	if (!initialized) {
		return -EACCES;
	}
	k_mutex_lock(&update_mutex, K_FOREVER);
	if (update_status.state != FAIRWAY_OTA_STAGED) {
		k_mutex_unlock(&update_mutex);
		return -EINVAL;
	}
	ret = dfu_target_schedule_update(0);
	if (ret == 0) {
		ret = transition_locked(FAIRWAY_OTA_EVENT_ACTIVATE, 0);
	} else {
		ret = fail_locked(ret);
	}
	k_mutex_unlock(&update_mutex);
	return ret;
}

int ota_update_cancel(void)
{
	int ret;

	if (!initialized) {
		return -EACCES;
	}
	k_mutex_lock(&update_mutex, K_FOREVER);
	if (update_status.state != FAIRWAY_OTA_DOWNLOADING &&
	    update_status.state != FAIRWAY_OTA_STAGED) {
		k_mutex_unlock(&update_mutex);
		return -EINVAL;
	}
	ret = dfu_target_reset();
	if (ret != 0) {
		ret = fail_locked(ret);
		k_mutex_unlock(&update_mutex);
		return ret;
	}
	dfu_target_active = false;
	ret = reset_hash();
	if (ret != 0) {
		ret = fail_locked(ret);
		k_mutex_unlock(&update_mutex);
		return ret;
	}
	ret = transition_locked(FAIRWAY_OTA_EVENT_CANCEL, 0);
	k_mutex_unlock(&update_mutex);
	return ret;
}

int ota_update_confirm_healthy(bool mandatory_init_ready,
			       bool modem_bootstrap_ready)
{
	int ret = 0;

	if (!initialized) {
		return -EACCES;
	}
	k_mutex_lock(&update_mutex, K_FOREVER);
	if (update_status.state == FAIRWAY_OTA_CONFIRMED) {
		k_mutex_unlock(&update_mutex);
		return 0;
	}
	if (!fairway_ota_confirmation_allowed(update_status.state, boot_service_mode,
					      mandatory_init_ready,
					      modem_bootstrap_ready)) {
		k_mutex_unlock(&update_mutex);
		return -EAGAIN;
	}

	ret = boot_write_img_confirmed();
	if (ret == 0) {
		k_work_cancel_delayable(&trial_timeout_work);
		ret = transition_locked(FAIRWAY_OTA_EVENT_CONFIRM, 0);
	} else {
		update_status.last_error = ret;
		LOG_ERR("MCUboot trial confirmation failed: %d; image remains unconfirmed",
			ret);
	}
	k_mutex_unlock(&update_mutex);
	return ret;
}

void ota_update_request_trial_revert(int error)
{
	bool trial_boot;

	if (!initialized) {
		return;
	}
	k_mutex_lock(&update_mutex, K_FOREVER);
	trial_boot = update_status.state == FAIRWAY_OTA_TRIAL_BOOT;
	if (trial_boot) {
		(void)transition_locked(FAIRWAY_OTA_EVENT_FAIL, error);
	}
	k_mutex_unlock(&update_mutex);

	if (trial_boot) {
		k_work_cancel_delayable(&trial_timeout_work);
		LOG_ERR("Service-mode initialization failed; rebooting for MCUboot revert: %d",
			error);
		sys_reboot(SYS_REBOOT_COLD);
	}
}

void ota_update_get_status(struct fairway_ota_status *status)
{
	if (status == NULL) {
		return;
	}
	k_mutex_lock(&update_mutex, K_FOREVER);
	*status = update_status;
	k_mutex_unlock(&update_mutex);
}

#if defined(FAIRWAY_OTA_TEST)
void ota_update_test_reset(void)
{
	memset(&update_status, 0, sizeof(update_status));
	memset(&update_descriptor, 0, sizeof(update_descriptor));
	image_hash = (psa_hash_operation_t)PSA_HASH_OPERATION_INIT;
	memset(dfu_flash_buffer, 0, sizeof(dfu_flash_buffer));
	memset(image_prefix, 0, sizeof(image_prefix));
	image_prefix_length = 0;
	dfu_target_active = false;
	image_hash_active = false;
	initialized = false;
	boot_service_mode = false;
	memset(&trial_timeout_work, 0, sizeof(trial_timeout_work));
}
#endif
