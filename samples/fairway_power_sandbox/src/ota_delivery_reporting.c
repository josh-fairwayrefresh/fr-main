#include "ota_delivery.h"

#include <errno.h>
#include <string.h>

#include <zephyr/logging/log.h>

#include "ota_update.h"
#include "ota_update_reporting.h"
#include "ota_update_scheduler.h"

LOG_MODULE_REGISTER(ota_delivery_reporting);

int fairway_ota_delivery_initialize_and_report_boot(
	int64_t first_boot_utc_ms, const char *running_version,
	enum fairway_ota_schedule_mode desired_mode)
{
	int ret = fairway_ota_scheduler_initialize(first_boot_utc_ms,
						   running_version, desired_mode);

	fairway_ota_delivery_report_pending_boot();
	return ret;
}

void fairway_ota_delivery_report_pending_boot(void)
{
	struct fairway_ota_schedule_state state;
	struct fairway_ota_status ota_status;
	int ret = fairway_ota_scheduler_get(&state);

	if (ret != 0 || state.deployment_id[0] == '\0' ||
	    state.deployment_terminal_reported) {
		return;
	}
	ota_update_get_status(&ota_status);
	if (ota_status.state == FAIRWAY_OTA_TRIAL_BOOT) {
		ret = fairway_ota_report(state.deployment_id, "trial_boot", 0);
	} else if (strcmp(state.target_version,
			  CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION) == 0) {
		ret = fairway_ota_report(state.deployment_id, "confirmed", 0);
		if (ret == 0) {
			ret = fairway_ota_scheduler_mark_deployment_terminal();
		}
	} else if (state.activation_pending) {
		ret = fairway_ota_report(state.deployment_id, "rolled_back", 0);
		if (ret == 0) {
			ret = fairway_ota_scheduler_mark_deployment_terminal();
		}
	} else {
		ret = fairway_ota_report(state.deployment_id, "failed", -ECANCELED);
		if (ret == 0) {
			ret = fairway_ota_scheduler_mark_deployment_terminal();
		}
	}
	if (ret != 0) {
		LOG_ERR("OTA boot lifecycle report failed: %d", ret);
	}
	memset(&state, 0, sizeof(state));
}
