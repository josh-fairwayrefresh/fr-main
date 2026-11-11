#ifndef FAIRWAY_OTA_UPDATE_POLICY_H
#define FAIRWAY_OTA_UPDATE_POLICY_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define FAIRWAY_OTA_HARDWARE_ID_MAX 64
#define FAIRWAY_OTA_SHA256_SIZE 32
/* Equal 432 KiB slots minus one trailer sector and one move-swap sector. */
#define FAIRWAY_OTA_MAX_IMAGE_SIZE 434176U

struct fairway_ota_version {
	uint8_t major;
	uint8_t minor;
	uint16_t revision;
	uint32_t build;
};

struct fairway_ota_descriptor {
	char hardware_id[FAIRWAY_OTA_HARDWARE_ID_MAX];
	size_t image_size;
	struct fairway_ota_version version;
	uint8_t sha256[FAIRWAY_OTA_SHA256_SIZE];
};

enum fairway_ota_state {
	FAIRWAY_OTA_IDLE,
	FAIRWAY_OTA_DOWNLOADING,
	FAIRWAY_OTA_STAGED,
	FAIRWAY_OTA_ACTIVATION_PENDING,
	FAIRWAY_OTA_TRIAL_BOOT,
	FAIRWAY_OTA_CONFIRMED,
	FAIRWAY_OTA_FAILED,
};

enum fairway_ota_event {
	FAIRWAY_OTA_EVENT_START,
	FAIRWAY_OTA_EVENT_STAGED,
	FAIRWAY_OTA_EVENT_ACTIVATE,
	FAIRWAY_OTA_EVENT_TRIAL_BOOT,
	FAIRWAY_OTA_EVENT_CONFIRM,
	FAIRWAY_OTA_EVENT_CONFIRMED_BOOT,
	FAIRWAY_OTA_EVENT_FAIL,
	FAIRWAY_OTA_EVENT_CANCEL,
	FAIRWAY_OTA_EVENT_START_FAIL,
};

int fairway_ota_validate_descriptor(const struct fairway_ota_descriptor *descriptor,
				    const char *hardware_id, size_t slot_capacity);
bool fairway_ota_has_mcuboot_magic(const uint8_t *prefix, size_t length);
bool fairway_ota_transition(enum fairway_ota_state current,
			    enum fairway_ota_event event,
			    enum fairway_ota_state *next);
bool fairway_ota_trial_deadline_required(bool trial_boot, bool service_mode);
bool fairway_ota_confirmation_allowed(enum fairway_ota_state state,
				      bool service_mode,
				      bool mandatory_init_ready,
				      bool modem_bootstrap_ready);

#endif
