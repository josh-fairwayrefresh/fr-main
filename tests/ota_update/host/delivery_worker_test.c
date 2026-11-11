#include <errno.h>
#include <setjmp.h>
#include <string.h>

#include <date_time.h>
#include <zephyr/ztest.h>
#include "ota_delivery.h"
#include "ota_update_discovery.h"
#include "ota_update_download.h"
#include "ota_update_scheduler.h"
#include "ota_test_fakes.h"

void fairway_ota_delivery_test_run(int64_t boot_uptime_ms);
static int64_t clock_ms;
static int checks;
static int schedule_requests;
static int failed_schedules;
static int discovery_error;
static bool discovery_available;
static bool fail_schedule_save;
static jmp_buf worker_exit;

void date_time_register_handler(void (*handler)(const struct date_time_evt *))
{
	(void)handler;
}
void date_time_update_async(void *handler) { (void)handler; }
bool date_time_is_valid(void) { return true; }
int date_time_now(int64_t *value) { *value = clock_ms; return 0; }
int date_time_uptime_to_unix_time_ms(int64_t *value) { (void)value; return 0; }
void modem_service_wait_for_lte_registration(void) {}
void ota_worker_test_sleep(int64_t ms)
{
	zassert_true(ms > 0);
	clock_ms += ms;
	if (checks >= 3) longjmp(worker_exit, 1);
}
int fairway_ota_discovery_get_next_check(int64_t *next)
{
	schedule_requests++;
	if (failed_schedules > 0) { failed_schedules--; return -EIO; }
	*next = clock_ms + 3600000;
	if (fail_schedule_save) {
		fail_schedule_save = false;
		ota_test_ps_fail_next_set();
	}
	return 0;
}
int fairway_ota_discovery_check(struct fairway_ota_release *release)
{
	checks++;
	release->next_check_utc_ms = discovery_error ? 0 : clock_ms + 3600000;
	if (discovery_available) {
		strcpy(release->deployment_id, "worker-test-deployment");
		strcpy(release->version_string, "1.0.0+1");
		return 0;
	}
	return discovery_error ? discovery_error : -ENOENT;
}
int fairway_ota_download_release(const struct fairway_ota_release *release)
{
	(void)release; return -EIO;
}

static void reset_worker(void)
{
	ota_test_reset_fakes();
	clock_ms = 1000;
	checks = 0;
	schedule_requests = 0;
	failed_schedules = 0;
	discovery_error = 0;
	discovery_available = false;
	fail_schedule_save = false;
}

ZTEST(fairway_ota_worker, test_nightly_recurs_after_bootstrap_completion_and_no_update)
{
	struct fairway_ota_schedule_state state;
	reset_worker();
	if (!CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY) return;
	zassert_equal(fairway_ota_scheduler_initialize(1000, "0.1.0+1",
		FAIRWAY_OTA_SCHEDULE_MODE_ONE_TIME), 0);
	zassert_equal(fairway_ota_scheduler_mark_check_complete(), 0);
	if (setjmp(worker_exit) == 0) fairway_ota_delivery_test_run(1000);
	zassert_equal(checks, 3);
	zassert_equal(fairway_ota_scheduler_get(&state), 0);
	zassert_equal(state.mode, FAIRWAY_OTA_SCHEDULE_MODE_NIGHTLY);
	zassert_true(state.one_time_complete);
	zassert_true(state.next_check_utc_ms > 0);
	/* A reboot reuses persisted nightly state, not the bootstrap stop flag. */
	checks = 0;
	if (setjmp(worker_exit) == 0) fairway_ota_delivery_test_run(1000);
	zassert_equal(checks, 3);
}

ZTEST(fairway_ota_worker, test_nightly_recovers_schedule_and_discovery_network_failures)
{
	reset_worker();
	if (!CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY) return;
	failed_schedules = 2;
	discovery_error = -EIO;
	if (setjmp(worker_exit) == 0) fairway_ota_delivery_test_run(1000);
	zassert_equal(checks, 3);
	zassert_true(schedule_requests >= 5);
}

ZTEST(fairway_ota_worker, test_one_time_remains_900_seconds_and_never_rearms)
{
	reset_worker();
	if (CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY) return;
	fairway_ota_delivery_test_run(1000);
	zassert_equal(clock_ms, 901000);
	zassert_equal(checks, 1);
	fairway_ota_delivery_test_run(1000);
	zassert_equal(checks, 1);
	zassert_equal(schedule_requests, 0);
}

ZTEST(fairway_ota_worker, test_nightly_processing_failure_does_not_stop_discovery)
{
	reset_worker();
	if (!CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY) return;
	discovery_available = true;
	if (setjmp(worker_exit) == 0) fairway_ota_delivery_test_run(1000);
	zassert_equal(checks, 3);
}

ZTEST(fairway_ota_worker, test_corrupt_storage_stops_without_network_check_or_repair)
{
	static const uint8_t corrupt[] = {1, 2, 3};
	reset_worker();
	ota_test_ps_put(0x46520003u, corrupt, sizeof(corrupt));
	fairway_ota_delivery_test_run(1000);
	zassert_equal(checks, 0);
	zassert_equal(schedule_requests, 0);
}

ZTEST(fairway_ota_worker, test_schedule_storage_failure_is_not_retried_as_network_recovery)
{
	reset_worker();
	if (!CONFIG_FAIRWAY_OTA_SCHEDULE_NIGHTLY) return;
	fail_schedule_save = true;
	if (setjmp(worker_exit) == 0) fairway_ota_delivery_test_run(1000);
	zassert_equal(checks, 0);
	zassert_equal(schedule_requests, 1);
	zassert_equal(clock_ms, 1000);
}
