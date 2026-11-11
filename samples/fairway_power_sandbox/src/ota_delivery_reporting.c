#include "ota_delivery.h"

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <pm_config.h>
#include <zephyr/dfu/mcuboot.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/util.h>

#include "modem_service.h"
#include "ota_update.h"
#include "ota_update_reporting.h"
#include "ota_update_scheduler.h"

LOG_MODULE_REGISTER(ota_delivery_reporting);

static K_SEM_DEFINE(confirmation_healthy_sem, 0, 1);
static struct k_thread confirmation_thread;
static K_THREAD_STACK_DEFINE(confirmation_stack, 4096);
static atomic_t mandatory_health_ready;
static atomic_t running_confirmation_ready;

int fairway_ota_delivery_confirm_running(void)
{
	struct mcuboot_img_header header;
	struct fairway_ota_confirmation confirmation;
	struct fairway_ota_schedule_state schedule;
	const char *deployment_id = NULL;
	char version[FAIRWAY_OTA_VERSION_STRING_MAX];
	int ret;

	if (!atomic_get(&mandatory_health_ready) || !boot_is_img_confirmed()) {
		return -EAGAIN;
	}
	ret = boot_read_bank_header(PM_MCUBOOT_PRIMARY_ID, &header, sizeof(header));
	if (ret != 0) {
		return ret;
	}
	if (header.mcuboot_version != 1) {
		return -EPROTO;
	}
	ret = snprintf(version, sizeof(version), "%u.%u.%u+%u",
		header.h.v1.sem_ver.major, header.h.v1.sem_ver.minor,
		header.h.v1.sem_ver.revision, header.h.v1.sem_ver.build_num);
	if (ret < 0 || (size_t)ret >= sizeof(version) ||
	    strcmp(version, CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION) != 0) {
		return -EPROTO;
	}
	ret = fairway_ota_confirmation_prepare(version, &confirmation);
	if (ret != 0) {
		return ret;
	}
	if (confirmation.acknowledged) {
		atomic_set(&running_confirmation_ready, 1);
		return 0;
	}
	ret = fairway_ota_scheduler_get(&schedule);
	if (ret != 0 && ret != -ENOENT) {
		return ret;
	}
	if (ret == 0 && schedule.activation_pending &&
	    !schedule.deployment_terminal_reported &&
	    strcmp(schedule.target_version, version) == 0) {
		deployment_id = schedule.deployment_id;
	}
	ret = fairway_ota_report_confirmation(&confirmation, deployment_id);
	if (ret == 0) {
		ret = fairway_ota_confirmation_acknowledge(&confirmation);
	}
	if (ret == 0) {
		atomic_set(&running_confirmation_ready, 1);
	}
	return ret;
}

static void confirmation_thread_entry(void *arg1, void *arg2, void *arg3)
{
	ARG_UNUSED(arg1);
	ARG_UNUSED(arg2);
	ARG_UNUSED(arg3);

	/* Only main's successful mandatory health/MCUboot confirmation releases
	 * this worker. It never waits on or changes the OTA discovery schedule.
	 */
	k_sem_take(&confirmation_healthy_sem, K_FOREVER);
	modem_service_wait_for_lte_registration();
	while (1) {
		int ret = fairway_ota_delivery_confirm_running();

		if (ret == 0) {
			fairway_ota_delivery_report_pending_boot();
			return;
		}
		LOG_ERR("Running firmware confirmation pending: %d", ret);
		k_sleep(K_SECONDS(300));
	}
}

void fairway_ota_delivery_confirmation_init(void)
{
	atomic_clear(&mandatory_health_ready);
	atomic_clear(&running_confirmation_ready);
	k_thread_create(&confirmation_thread, confirmation_stack,
		K_THREAD_STACK_SIZEOF(confirmation_stack), confirmation_thread_entry,
		NULL, NULL, NULL, 8, 0, K_NO_WAIT);
	k_thread_name_set(&confirmation_thread, "fairway_ota_confirm");
}

void fairway_ota_delivery_confirmation_healthy(void)
{
	atomic_set(&mandatory_health_ready, 1);
	k_sem_give(&confirmation_healthy_sem);
}

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
		if (!atomic_get(&mandatory_health_ready) ||
		    !atomic_get(&running_confirmation_ready)) {
			return;
		}
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
