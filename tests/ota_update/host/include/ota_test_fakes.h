#ifndef FAIRWAY_OTA_TEST_FAKES_H
#define FAIRWAY_OTA_TEST_FAKES_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "zephyr/dfu/mcuboot.h"
#include "zephyr/kernel.h"
#include "psa/protected_storage.h"

struct ota_test_fakes {
	bool image_confirmed;
	struct mcuboot_img_header image_header;
	int header_error;
	uint8_t last_header_area_id;
	int confirm_error;
	int confirm_calls;
	int reboot_calls;
	int dfu_init_calls;
	int dfu_init_error_call;
	int dfu_reset_calls;
	int dfu_reset_error_call;
	int dfu_write_calls;
	int dfu_write_error_call;
	int dfu_done_success_calls;
	int dfu_done_abort_calls;
	int dfu_done_success_error;
	int dfu_done_abort_error;
	int dfu_offset_error;
	int dfu_schedule_calls;
	int dfu_schedule_error;
	int dfu_set_buf_calls;
	int dfu_set_buf_error;
	int dfu_active;
	size_t dfu_offset;
	size_t dfu_image_size;
	uint8_t staged_bytes[8192];
	size_t staged_length;
	bool crypto_init_error;
	bool hash_setup_error;
	bool hash_update_error;
	bool hash_finish_error;
	char last_report_deployment_id[64];
	char last_report_state[32];
	int last_report_error_code;
	int report_calls;
	int confirmation_calls;
	int confirmation_error;
	uint32_t confirmation_sequence;
	char confirmation_deployment_id[64];
};

extern struct ota_test_fakes ota_test;
extern struct k_work_delayable *ota_test_scheduled_work;

void ota_test_reset_fakes(void);
void ota_test_fire_trial_deadline(void);
void ota_test_digest(const uint8_t *bytes, size_t length, uint8_t digest[32]);
void ota_test_ps_reset(void);
void ota_test_ps_put(psa_storage_uid_t uid, const void *data, size_t length);
void ota_test_ps_fail_next_set(void);

#endif
