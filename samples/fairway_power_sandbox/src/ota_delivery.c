#include "ota_delivery.h"

#include <errno.h>
#include <string.h>

#include <date_time.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/reboot.h>
#include <zephyr/sys/util.h>

#include "modem_service.h"
#include "ota_update.h"
#include "ota_update_discovery.h"
#include "ota_update_download.h"
#include "ota_update_reporting.h"
#include "ota_update_scheduler.h"

LOG_MODULE_REGISTER(ota_delivery);

#define OTA_DELIVERY_STACK_SIZE 4096
#define OTA_DELIVERY_PRIORITY 8

static K_SEM_DEFINE(ota_delivery_start_sem, 0, 1);
static K_SEM_DEFINE(ota_delivery_time_sem, 0, 1);
static struct k_thread ota_delivery_thread;
static K_THREAD_STACK_DEFINE(ota_delivery_stack, OTA_DELIVERY_STACK_SIZE);
static int64_t first_boot_uptime_ms;
static bool delivery_started;
static const enum fairway_ota_schedule_mode configured_schedule_mode =
	IS_ENABLED(CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY)
		? FAIRWAY_OTA_SCHEDULE_MODE_NIGHTLY
		: FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME;

static void date_time_handler(const struct date_time_evt *event)
{
	if (event->type == DATE_TIME_OBTAINED_MODEM ||
	    event->type == DATE_TIME_OBTAINED_NTP ||
	    event->type == DATE_TIME_OBTAINED_EXT) {
		k_sem_give(&ota_delivery_time_sem);
	}
}

static int wait_for_utc_time(int64_t *now_utc_ms)
{
	int64_t boot_utc_ms = first_boot_uptime_ms;

	date_time_register_handler(date_time_handler);
	while (!date_time_is_valid()) {
		date_time_update_async(NULL);
		(void)k_sem_take(&ota_delivery_time_sem, K_SECONDS(30));
	}
	if (date_time_now(now_utc_ms) != 0) {
		return -ENODATA;
	}
	if (boot_utc_ms < 0 || date_time_uptime_to_unix_time_ms(&boot_utc_ms) != 0) {
		return -ENODATA;
	}
	first_boot_uptime_ms = boot_utc_ms;
	return 0;
}

static int wait_for_network(void)
{
	modem_service_wait_for_lte_registration();
	return 0;
}

static int prepare_next_schedule(void)
{
	struct fairway_ota_schedule_state state;
	int ret = fairway_ota_scheduler_get(&state);

	if (ret != 0) {
		return ret;
	}
	if (state.next_check_utc_ms > 0 ||
	    (state.mode == FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME &&
	     state.one_time_complete)) {
		return 0;
	}

	int64_t next_check_utc_ms;
	ret = fairway_ota_discovery_get_next_check(&next_check_utc_ms);
	while (ret != 0 && IS_ENABLED(CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY)) {
		LOG_ERR("OTA schedule discovery failed: %d", ret);
		k_sleep(K_SECONDS(24 * 60 * 60));
		ret = fairway_ota_discovery_get_next_check(&next_check_utc_ms);
	}
	if (ret != 0) {
		return ret;
	}
	return fairway_ota_scheduler_set_next_check(next_check_utc_ms);
}

static int process_available_release(const struct fairway_ota_release *release)
{
	struct fairway_ota_status status;
	int ret;

	ret = fairway_ota_scheduler_set_deployment(release->deployment_id,
						   release->version_string);
	if (ret != 0) {
		return ret;
	}
	ret = fairway_ota_report(release->deployment_id, "downloading", 0);
	if (ret != 0) {
		return ret;
	}
	ret = ota_update_begin(&release->descriptor);
	if (ret != 0) {
		if (fairway_ota_report(release->deployment_id, "failed", ret) == 0) {
			(void)fairway_ota_scheduler_mark_deployment_terminal();
		}
		return ret;
	}
	ret = fairway_ota_download_release(release);
	if (ret != 0) {
		(void)ota_update_cancel();
		if (fairway_ota_report(release->deployment_id, "failed", ret) == 0) {
			(void)fairway_ota_scheduler_mark_deployment_terminal();
		}
		return ret;
	}

	ret = fairway_ota_report(release->deployment_id, "verifying", 0);
	if (ret != 0) {
		(void)ota_update_cancel();
		return ret;
	}
	ret = ota_update_finish();
	if (ret != 0) {
		if (fairway_ota_report(release->deployment_id, "failed", ret) == 0) {
			(void)fairway_ota_scheduler_mark_deployment_terminal();
		}
		return ret;
	}
	ota_update_get_status(&status);
	if (status.state != FAIRWAY_OTA_STAGED) {
		if (fairway_ota_report(release->deployment_id, "failed", -EPROTO) == 0) {
			(void)fairway_ota_scheduler_mark_deployment_terminal();
		}
		return -EPROTO;
	}
	ret = fairway_ota_report(release->deployment_id, "staged", 0);
	if (ret != 0) {
		(void)ota_update_cancel();
		return ret;
	}
	ret = fairway_ota_scheduler_mark_activation_pending();
	if (ret != 0) {
		LOG_ERR("OTA activation intent could not be persisted: %d", ret);
		(void)fairway_ota_report(release->deployment_id, "failed", ret);
		return ret;
	}
	ret = ota_update_schedule_activation();
	if (ret != 0) {
		if (fairway_ota_report(release->deployment_id, "failed", ret) == 0) {
			(void)fairway_ota_scheduler_mark_deployment_terminal();
		}
		return ret;
	}
	ret = fairway_ota_report(release->deployment_id, "activation_pending", 0);
	if (ret != 0) {
		LOG_ERR("OTA activation report failed; scheduled image remains pending: %d",
			ret);
	}
	k_sleep(K_MSEC(100));
	sys_reboot(SYS_REBOOT_COLD);
	return 0;
}

static void ota_delivery_thread_entry(void *arg1, void *arg2, void *arg3)
{
	ARG_UNUSED(arg1);
	ARG_UNUSED(arg2);
	ARG_UNUSED(arg3);

	k_sem_take(&ota_delivery_start_sem, K_FOREVER);
	if (wait_for_network() != 0) {
		return;
	}

	int64_t now_utc_ms;
	int ret = wait_for_utc_time(&now_utc_ms);
	if (ret != 0) {
		LOG_ERR("OTA scheduling requires trusted UTC time: %d", ret);
		return;
	}
	ret = fairway_ota_delivery_initialize_and_report_boot(
		first_boot_uptime_ms, CONFIG_FAIRWAY_OTA_FIRMWARE_VERSION,
		configured_schedule_mode);
	if (ret != 0) {
		LOG_ERR("OTA protected schedule could not be initialized: %d", ret);
		return;
	}
	ret = prepare_next_schedule();
	if (ret != 0) {
		LOG_ERR("OTA schedule could not be prepared: %d", ret);
		return;
	}

	while (1) {
		struct fairway_ota_schedule_state schedule;

		ret = fairway_ota_scheduler_get(&schedule);
		if (ret != 0) {
			LOG_ERR("OTA schedule state could not be loaded: %d", ret);
			return;
		}
		if (!schedule.check_due ||
		    (schedule.mode == FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME &&
		     schedule.one_time_complete)) {
			return;
		}
		while (date_time_now(&now_utc_ms) != 0) {
			(void)k_sem_take(&ota_delivery_time_sem, K_SECONDS(30));
		}
		while (now_utc_ms < schedule.next_check_utc_ms) {
			int64_t wait_ms = schedule.next_check_utc_ms - now_utc_ms;

			k_sleep(K_MSEC(wait_ms));
			if (date_time_now(&now_utc_ms) != 0) {
				while (date_time_now(&now_utc_ms) != 0) {
					(void)k_sem_take(&ota_delivery_time_sem, K_SECONDS(30));
				}
			}
		}

		if (IS_ENABLED(CONFIG_FAIRWAY_OTA_SCHEDULE_ONE_TIME)) {
			ret = fairway_ota_scheduler_mark_check_complete();
			if (ret != 0) {
				LOG_ERR("OTA one-time check could not be persisted: %d", ret);
				return;
			}
		}

		struct fairway_ota_release release = {0};
		ret = fairway_ota_discovery_check(&release);
		if (ret != 0 && ret != -ENOENT) {
			LOG_ERR("OTA assignment discovery failed: %d", ret);
		}
		if (IS_ENABLED(CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY)) {
			int64_t next_check = release.next_check_utc_ms;
			int schedule_ret = 0;

			/* The server owns local-time/DST conversion. Offline recovery
			 * backs off without replacing that policy with a UTC cadence.
			 */
			while (date_time_now(&now_utc_ms) != 0 ||
			       next_check <= now_utc_ms) {
				schedule_ret = fairway_ota_discovery_get_next_check(&next_check);
				if (schedule_ret == 0 &&
				    date_time_now(&now_utc_ms) == 0 &&
				    next_check > now_utc_ms) {
					break;
				}
				LOG_ERR("OTA next-window discovery unavailable: %d", schedule_ret);
				k_sleep(K_SECONDS(24 * 60 * 60));
			}
			schedule_ret = fairway_ota_scheduler_set_next_check(next_check);
			if (schedule_ret != 0) {
				LOG_ERR("Next OTA check could not be persisted: %d", schedule_ret);
				return;
			}
		}
		if (ret == 0) {
			ret = process_available_release(&release);
			if (ret != 0) {
				LOG_ERR("OTA release processing failed: %d", ret);
			}
		}
		if (!IS_ENABLED(CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY)) {
			return;
		}
	}

}

#if defined(FAIRWAY_OTA_TEST)
void fairway_ota_delivery_test_run(int64_t boot_uptime_ms)
{
	first_boot_uptime_ms = boot_uptime_ms;
	ota_delivery_thread_entry(NULL, NULL, NULL);
}
#endif

int fairway_ota_delivery_init(int64_t boot_started_uptime_ms)
{
	if (boot_started_uptime_ms < 0) {
		return -EINVAL;
	}
	first_boot_uptime_ms = boot_started_uptime_ms;
	delivery_started = true;
	k_thread_create(&ota_delivery_thread, ota_delivery_stack,
			K_THREAD_STACK_SIZEOF(ota_delivery_stack),
			ota_delivery_thread_entry, NULL, NULL, NULL,
			OTA_DELIVERY_PRIORITY, 0, K_NO_WAIT);
	k_thread_name_set(&ota_delivery_thread, "fairway_ota");
	return 0;
}

void fairway_ota_delivery_report_boot(void)
{
	if (delivery_started) {
		k_sem_give(&ota_delivery_start_sem);
	}
}

void fairway_ota_delivery_report_healthy(void)
{
	fairway_ota_delivery_report_pending_boot();
}
