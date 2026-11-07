#ifndef FAIRWAY_OTA_UPDATE_H
#define FAIRWAY_OTA_UPDATE_H

#include "ota_update_policy.h"

struct fairway_ota_status {
	enum fairway_ota_state state;
	int last_error;
	size_t bytes_received;
	size_t image_size;
	struct fairway_ota_version version;
};

int ota_update_init(bool service_mode);
int ota_update_begin(const struct fairway_ota_descriptor *descriptor);
int ota_update_write(const void *data, size_t length);
int ota_update_finish(void);
int ota_update_schedule_activation(void);
int ota_update_cancel(void);
int ota_update_confirm_healthy(bool mandatory_init_ready,
			       bool modem_bootstrap_ready);
void ota_update_request_trial_revert(int error);
void ota_update_get_status(struct fairway_ota_status *status);

#endif
