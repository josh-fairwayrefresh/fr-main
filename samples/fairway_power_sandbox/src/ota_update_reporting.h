#ifndef FAIRWAY_OTA_UPDATE_REPORTING_H
#define FAIRWAY_OTA_UPDATE_REPORTING_H

#include "ota_update_scheduler.h"

int fairway_ota_report(const char *deployment_id, const char *state, int error_code);
int fairway_ota_report_confirmation(const struct fairway_ota_confirmation *confirmation,
				    const char *deployment_id);

#endif
