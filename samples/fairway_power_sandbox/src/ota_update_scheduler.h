#ifndef FAIRWAY_OTA_UPDATE_SCHEDULER_H
#define FAIRWAY_OTA_UPDATE_SCHEDULER_H

#include <stdbool.h>
#include <stdint.h>

#define FAIRWAY_OTA_DEPLOYMENT_ID_MAX 64
#define FAIRWAY_OTA_VERSION_STRING_MAX 32

enum fairway_ota_schedule_mode {
	FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME = 1,
	FAIRWAY_OTA_SCHEDULE_MODE_NIGHTLY = 2,
};

struct fairway_ota_schedule_state {
	int64_t next_check_utc_ms;
	bool check_due;
	bool one_time_complete;
	enum fairway_ota_schedule_mode mode;
	char deployment_id[FAIRWAY_OTA_DEPLOYMENT_ID_MAX];
	char target_version[FAIRWAY_OTA_VERSION_STRING_MAX];
	bool activation_pending;
	bool deployment_terminal_reported;
};

int fairway_ota_scheduler_initialize(int64_t first_boot_utc_ms,
				     const char *running_version,
				     enum fairway_ota_schedule_mode desired_mode);
int fairway_ota_scheduler_get(struct fairway_ota_schedule_state *state);
int fairway_ota_scheduler_set_next_check(int64_t utc_ms);
int fairway_ota_scheduler_mark_check_complete(void);
int fairway_ota_scheduler_set_deployment(const char *deployment_id,
					 const char *target_version);
int fairway_ota_scheduler_mark_activation_pending(void);
int fairway_ota_scheduler_mark_deployment_terminal(void);

#endif
