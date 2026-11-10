#include "ota_update_policy.h"

#include <errno.h>
#include <string.h>

int fairway_ota_validate_descriptor(const struct fairway_ota_descriptor *descriptor,
				    const char *hardware_id, size_t slot_capacity)
{
	if (descriptor == NULL || hardware_id == NULL ||
	    memchr(descriptor->hardware_id, '\0', sizeof(descriptor->hardware_id)) == NULL ||
	    descriptor->hardware_id[0] == '\0') {
		return -EINVAL;
	}
	if (strcmp(descriptor->hardware_id, hardware_id) != 0) {
		return -EXDEV;
	}
	if (descriptor->image_size < 32 || descriptor->image_size > slot_capacity ||
	    descriptor->image_size > FAIRWAY_OTA_MAX_IMAGE_SIZE) {
		return -EFBIG;
	}
	return 0;
}

bool fairway_ota_has_mcuboot_magic(const uint8_t *prefix, size_t length)
{
	static const uint8_t magic[] = { 0x3d, 0xb8, 0xf3, 0x96 };

	return prefix != NULL && length >= sizeof(magic) &&
	       memcmp(prefix, magic, sizeof(magic)) == 0;
}

bool fairway_ota_transition(enum fairway_ota_state current,
			    enum fairway_ota_event event,
			    enum fairway_ota_state *next)
{
	if (next == NULL) {
		return false;
	}

	switch (event) {
	case FAIRWAY_OTA_EVENT_START:
		if (current == FAIRWAY_OTA_IDLE || current == FAIRWAY_OTA_CONFIRMED ||
		    current == FAIRWAY_OTA_FAILED) {
			*next = FAIRWAY_OTA_DOWNLOADING;
			return true;
		}
		break;
	case FAIRWAY_OTA_EVENT_STAGED:
		if (current == FAIRWAY_OTA_DOWNLOADING) {
			*next = FAIRWAY_OTA_STAGED;
			return true;
		}
		break;
	case FAIRWAY_OTA_EVENT_ACTIVATE:
		if (current == FAIRWAY_OTA_STAGED) {
			*next = FAIRWAY_OTA_ACTIVATION_PENDING;
			return true;
		}
		break;
	case FAIRWAY_OTA_EVENT_TRIAL_BOOT:
		if (current == FAIRWAY_OTA_IDLE ||
		    current == FAIRWAY_OTA_ACTIVATION_PENDING) {
			*next = FAIRWAY_OTA_TRIAL_BOOT;
			return true;
		}
		break;
	case FAIRWAY_OTA_EVENT_CONFIRM:
		if (current == FAIRWAY_OTA_TRIAL_BOOT) {
			*next = FAIRWAY_OTA_CONFIRMED;
			return true;
		}
		break;
	case FAIRWAY_OTA_EVENT_CONFIRMED_BOOT:
		if (current == FAIRWAY_OTA_IDLE) {
			*next = FAIRWAY_OTA_CONFIRMED;
			return true;
		}
		break;
	case FAIRWAY_OTA_EVENT_FAIL:
		if (current == FAIRWAY_OTA_DOWNLOADING || current == FAIRWAY_OTA_STAGED ||
		    current == FAIRWAY_OTA_ACTIVATION_PENDING ||
		    current == FAIRWAY_OTA_TRIAL_BOOT) {
			*next = FAIRWAY_OTA_FAILED;
			return true;
		}
		break;
	case FAIRWAY_OTA_EVENT_CANCEL:
		if (current == FAIRWAY_OTA_DOWNLOADING || current == FAIRWAY_OTA_STAGED) {
			*next = FAIRWAY_OTA_IDLE;
			return true;
		}
		break;
	case FAIRWAY_OTA_EVENT_START_FAIL:
		if (current == FAIRWAY_OTA_IDLE || current == FAIRWAY_OTA_CONFIRMED ||
		    current == FAIRWAY_OTA_FAILED) {
			*next = FAIRWAY_OTA_FAILED;
			return true;
		}
		break;
	}

	return false;
}

bool fairway_ota_trial_deadline_required(bool trial_boot, bool service_mode)
{
	return trial_boot && !service_mode;
}

bool fairway_ota_confirmation_allowed(enum fairway_ota_state state,
				      bool service_mode,
				      bool mandatory_init_ready,
				      bool modem_bootstrap_ready)
{
	return state == FAIRWAY_OTA_TRIAL_BOOT && !service_mode &&
	       mandatory_init_ready && modem_bootstrap_ready;
}
