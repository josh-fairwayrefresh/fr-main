#ifndef FAIRWAY_OTA_DELIVERY_H
#define FAIRWAY_OTA_DELIVERY_H

#include <stdint.h>

#include "ota_update_scheduler.h"

int fairway_ota_delivery_init(int64_t boot_started_uptime_ms);
void fairway_ota_delivery_report_boot(void);
void fairway_ota_delivery_report_healthy(void);
int fairway_ota_delivery_initialize_and_report_boot(
	int64_t first_boot_utc_ms, const char *running_version,
	enum fairway_ota_schedule_mode desired_mode);
void fairway_ota_delivery_report_pending_boot(void);
void fairway_ota_delivery_confirmation_init(void);
void fairway_ota_delivery_confirmation_healthy(void);
int fairway_ota_delivery_confirm_running(void);

#endif
