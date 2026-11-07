#include "ota_test_fakes.h"

#include <errno.h>
#include <string.h>

#include "dfu/dfu_target.h"
#include "dfu/dfu_target_mcuboot.h"
#include "psa/crypto.h"
#include "zephyr/sys/reboot.h"

struct ota_test_fakes ota_test;
struct k_work_delayable *ota_test_scheduled_work;

void ota_test_digest(const uint8_t *bytes, size_t length, uint8_t digest[32])
{
	uint32_t value = 2166136261u;

	for (size_t i = 0; i < length; i++) {
		value = (value ^ bytes[i]) * 16777619u;
	}
	for (size_t i = 0; i < 32; i++) {
		value = (value ^ (uint32_t)i) * 16777619u;
		digest[i] = (uint8_t)(value >> ((i % 4) * 8));
	}
}

void ota_test_reset_fakes(void)
{
	memset(&ota_test, 0, sizeof(ota_test));
	ota_test_scheduled_work = NULL;
	ota_test.image_confirmed = true;
	ota_test.image_header.mcuboot_version = 1;
	ota_test.image_header.h.v1.sem_ver.major = 1;
	ota_test.image_header.h.v1.sem_ver.minor = 2;
	ota_test.image_header.h.v1.sem_ver.revision = 3;
	ota_test.image_header.h.v1.sem_ver.build_num = 4;
}

void ota_test_fire_trial_deadline(void)
{
	struct k_work_delayable *work = ota_test_scheduled_work;

	if (work == NULL || !work->scheduled || work->work.handler == NULL) {
		return;
	}
	work->scheduled = false;
	work->work.handler(&work->work);
}

bool boot_is_img_confirmed(void)
{
	return ota_test.image_confirmed;
}

int boot_write_img_confirmed(void)
{
	ota_test.confirm_calls++;
	if (ota_test.confirm_error != 0) {
		return ota_test.confirm_error;
	}
	ota_test.image_confirmed = true;
	return 0;
}

int boot_read_bank_header(uint8_t bank_id, struct mcuboot_img_header *header,
			  size_t header_size)
{
	(void)bank_id;
	if (ota_test.header_error != 0) {
		return ota_test.header_error;
	}
	if (header_size != sizeof(ota_test.image_header)) {
		return -EINVAL;
	}
	*header = ota_test.image_header;
	return 0;
}

int dfu_target_mcuboot_set_buf(void *buffer, size_t size)
{
	ota_test.dfu_set_buf_calls++;
	if (buffer == NULL || size == 0) {
		return -EINVAL;
	}
	return ota_test.dfu_set_buf_error;
}

int dfu_target_init(int image_type, size_t offset, size_t image_size,
		    void *callback)
{
	(void)callback;
	ota_test.dfu_init_calls++;
	if (image_type != DFU_TARGET_IMAGE_TYPE_MCUBOOT || offset != 0) {
		return -EINVAL;
	}
	if (ota_test.dfu_init_calls == ota_test.dfu_init_error_call) {
		return -EIO;
	}
	ota_test.dfu_active = 1;
	ota_test.dfu_image_size = image_size;
	return 0;
}

int dfu_target_write(const void *data, size_t length)
{
	ota_test.dfu_write_calls++;
	if (ota_test.dfu_write_calls == ota_test.dfu_write_error_call) {
		return -EIO;
	}
	if (!ota_test.dfu_active || length > sizeof(ota_test.staged_bytes) -
					       ota_test.dfu_offset) {
		return -EINVAL;
	}
	memcpy(&ota_test.staged_bytes[ota_test.dfu_offset], data, length);
	ota_test.dfu_offset += length;
	if (ota_test.dfu_offset > ota_test.staged_length) {
		ota_test.staged_length = ota_test.dfu_offset;
	}
	return 0;
}

int dfu_target_done(bool successful)
{
	if (successful) {
		ota_test.dfu_done_success_calls++;
		return ota_test.dfu_done_success_error;
	}
	ota_test.dfu_done_abort_calls++;
	return ota_test.dfu_done_abort_error;
}

int dfu_target_reset(void)
{
	ota_test.dfu_reset_calls++;
	if (ota_test.dfu_reset_calls == ota_test.dfu_reset_error_call) {
		return -EIO;
	}
	ota_test.dfu_offset = 0;
	ota_test.staged_length = 0;
	ota_test.dfu_active = 0;
	return 0;
}

int dfu_target_offset_get(size_t *offset)
{
	if (ota_test.dfu_offset_error != 0) {
		return ota_test.dfu_offset_error;
	}
	*offset = ota_test.dfu_offset;
	return 0;
}

int dfu_target_schedule_update(int image_type)
{
	ota_test.dfu_schedule_calls++;
	if (image_type != 0) {
		return -EINVAL;
	}
	return ota_test.dfu_schedule_error;
}

psa_status_t psa_crypto_init(void)
{
	return ota_test.crypto_init_error ? PSA_ERROR_GENERIC_ERROR : PSA_SUCCESS;
}

psa_status_t psa_hash_abort(psa_hash_operation_t *operation)
{
	memset(operation, 0, sizeof(*operation));
	return PSA_SUCCESS;
}

psa_status_t psa_hash_setup(psa_hash_operation_t *operation, int algorithm)
{
	if (ota_test.hash_setup_error || algorithm != PSA_ALG_SHA_256) {
		return PSA_ERROR_GENERIC_ERROR;
	}
	memset(operation, 0, sizeof(*operation));
	operation->active = true;
	return PSA_SUCCESS;
}

psa_status_t psa_hash_update(psa_hash_operation_t *operation,
			     const uint8_t *input, size_t input_length)
{
	if (ota_test.hash_update_error || !operation->active ||
	    input_length > sizeof(operation->bytes) - operation->length) {
		return PSA_ERROR_GENERIC_ERROR;
	}
	memcpy(&operation->bytes[operation->length], input, input_length);
	operation->length += input_length;
	return PSA_SUCCESS;
}

psa_status_t psa_hash_finish(psa_hash_operation_t *operation, uint8_t *hash,
			     size_t hash_size, size_t *hash_length)
{
	if (ota_test.hash_finish_error || !operation->active || hash_size < 32) {
		return PSA_ERROR_GENERIC_ERROR;
	}
	ota_test_digest(operation->bytes, operation->length, hash);
	*hash_length = 32;
	operation->active = false;
	return PSA_SUCCESS;
}

void sys_reboot(int type)
{
	(void)type;
	ota_test.reboot_calls++;
}
