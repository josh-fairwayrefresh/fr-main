/*
 * Fairway Refresh button-request state machine
 *
 * Confirmed hardware mappings:
 *
 * PV4 switch:
 *   PV4 C  -> GND
 *   PV4 NO -> J9
 *   J9     -> nRF GPIO P0.31 -> Zephyr gpio0 pin 31
 *
 * PV4 red LED ring:
 *   PV4 LED - -> GND
 *   PV4 LED + -> 220 ohm resistor -> J10
 *   J10       -> nRF GPIO P0.30 -> Zephyr gpio0 pin 30
 *
 * Current interim behavior (future final golfer UX is backlog work):
 *   Startup:
 *     Ring flashes 3 times
 *
 *   IDLE:
 *     Ring off
 *
 *   Button press:
 *     Capture the current Device Health snapshot
 *     TRANSMITTING: 3 brief flashes before the first HTTPS attempt
 *     SUCCESS: 3 quick flashes
 *     FAILURE: long solid illumination
 *     Return to IDLE
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/mfd/npm13xx.h>
#include <zephyr/drivers/regulator.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/drivers/sensor/npm13xx_charger.h>
#include <zephyr/drivers/fuel_gauge.h>
#include <zephyr/logging/log.h>
#include <zephyr/pm/device_runtime.h>
#include <stdbool.h>
#include <stdio.h>
#include <modem/nrf_modem_lib.h>
#include <modem/lte_lc.h>
#include <modem/modem_info.h>
#include <zephyr/net/socket.h>
#include <zephyr/posix/fcntl.h>
#include <string.h>
#include <errno.h>
#include <stdint.h>
#include <modem/modem_key_mgmt.h>
#include <zephyr/net/tls_credentials.h>
#include "secrets/fairway_device_key.h"
#include "health_temperature.h"
#include "health_schedule.h"
#include <date_time.h>

LOG_MODULE_REGISTER(main);
struct health_cellular_snapshot;
static int send_https_test(struct health_cellular_snapshot *snap, int64_t attempt_deadline_ms);
static int send_health_report_request(struct health_cellular_snapshot *snap, int64_t attempt_deadline_ms);
static bool button_is_pressed(void);
static const struct device *gpio0_dev = DEVICE_DT_GET(DT_NODELABEL(gpio0));
static const struct device *uart0_dev = DEVICE_DT_GET(DT_CHOSEN(zephyr_console));
static const struct device *i2c2_dev = DEVICE_DT_GET(DT_NODELABEL(i2c2));
static const struct device *npm1300_pmic_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_pmic));
static const struct device *npm1300_charger_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_charger));
static const struct device *buck2_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_buck2));
static const struct device *max17048_dev = DEVICE_DT_GET(DT_NODELABEL(max17048));

#define BUTTON_PIN    31
#define RING_LED_PIN  30

#define GOLFER_TRANSACTION_BUDGET_MS      15000
#define GOLFER_MAX_ATTEMPTS               2
#define GOLFER_MIN_RETRY_RESERVE_MS       3000
#define GOLFER_DNS_READINESS_TIMEOUT_MS   3000
#define BUTTON_REARM_SETTLE_MS            250

#define STARTUP_FLASH_COUNT      3
#define STARTUP_FLASH_ON_MS      150
#define STARTUP_FLASH_OFF_MS     150

#define INITIAL_FLASH_ON_MS      80
#define INITIAL_FLASH_OFF_MS     85

#define SUCCESS_FLASH_COUNT      3
#define SUCCESS_FLASH_ON_MS      40
#define SUCCESS_FLASH_OFF_MS     40

#define FAILURE_SOLID_MS         5000

#define FAIRWAY_TLS_SEC_TAG 42

static const char fairway_ca_cert[] = {
#include "certs/google-run-ca-chain-cstr.pem"
};

typedef enum {
	STATE_IDLE = 0,
	STATE_BUTTON_ACK,
	STATE_TRANSMITTING,
	STATE_SUCCESS,
	STATE_FAILURE,
} app_state_t;

/* Golfer-vs-Health transaction scheduler states (observability only; the
 * actual control flow is the sequential transaction_thread loop below).
 */
enum txn_state {
	TXN_IDLE = 0,
	TXN_HEALTH_PENDING,
	TXN_HEALTH_ACTIVE,
	TXN_GOLFER_PENDING,
	TXN_GOLFER_ACTIVE,
};

static K_SEM_DEFINE(button_wake_sem, 0, 1);
static K_SEM_DEFINE(txn_wake_sem, 0, 1);
static K_SEM_DEFINE(network_wake_sem, 0, 1);
static K_SEM_DEFINE(local_hw_ready_sem, 0, 1);
static K_SEM_DEFINE(dns_request_wake_sem, 0, 1);
static K_SEM_DEFINE(dns_result_sem, 0, 1);
static K_SEM_DEFINE(telemetry_request_wake_sem, 0, 1);
static K_SEM_DEFINE(telemetry_result_sem, 0, 1);

#define TRANSACTION_THREAD_PRIORITY       1
#define NETWORK_HEALTH_THREAD_PRIORITY    2
#define DNS_RESOLVER_THREAD_PRIORITY      3
#define TELEMETRY_HELPER_THREAD_PRIORITY  3

BUILD_ASSERT(CONFIG_MAIN_THREAD_PRIORITY < TRANSACTION_THREAD_PRIORITY,
	     "button thread must always outrank the transaction scheduler");
BUILD_ASSERT(TRANSACTION_THREAD_PRIORITY < NETWORK_HEALTH_THREAD_PRIORITY,
	     "transaction scheduler must always outrank background maintenance");
BUILD_ASSERT(NETWORK_HEALTH_THREAD_PRIORITY < DNS_RESOLVER_THREAD_PRIORITY,
	     "background maintenance must always outrank isolated helpers");

/* Coherent golfer transaction handoff/completion state. Replaces a
 * scattered set of independent volatiles: a reader must never observe a
 * generation paired with a mismatched deadline/result, so every field is
 * read/written as a single locked unit via the accessors below.
 */
struct golfer_txn {
	uint32_t generation;
	int64_t deadline_ms;
	bool pending;
	bool done;
	bool done_result_ok;
	uint32_t done_generation;
};
static struct golfer_txn golfer_txn;
static struct k_spinlock golfer_txn_lock;

/* Coherent scheduler control state (health-due flag + observability
 * state), written from multiple contexts (network_health_thread and
 * transaction_thread itself).
 */
struct scheduler_control {
	bool health_due_pending;
	enum txn_state state;
};
static struct scheduler_control sched_ctl;
static struct k_spinlock sched_ctl_lock;

/* button_thread: accept a newly-validated press. Allocates a fresh
 * generation and commits the absolute deadline as one coherent unit.
 */
static uint32_t golfer_txn_accept(int64_t deadline_ms)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);

	golfer_txn.generation++;
	uint32_t gen = golfer_txn.generation;

	golfer_txn.deadline_ms = deadline_ms;
	golfer_txn.pending = true;
	golfer_txn.done = false;
	k_spin_unlock(&golfer_txn_lock, key);
	return gen;
}

/* transaction_thread: pick up a pending press, if any. */
static bool golfer_txn_pickup(uint32_t *out_gen, int64_t *out_deadline_ms)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);
	bool has = golfer_txn.pending;

	if (has) {
		golfer_txn.pending = false;
		*out_gen = golfer_txn.generation;
		*out_deadline_ms = golfer_txn.deadline_ms;
	}
	k_spin_unlock(&golfer_txn_lock, key);
	return has;
}

/* Health's yield checkpoints: true only while a press is accepted but not
 * yet picked up by transaction_thread (i.e. still waiting its turn).
 */
static bool golfer_txn_is_pending(void)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);
	bool p = golfer_txn.pending;

	k_spin_unlock(&golfer_txn_lock, key);
	return p;
}

/* transaction_thread: post a terminal result for a specific generation. */
static void golfer_txn_complete(uint32_t gen, bool success)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);

	golfer_txn.done = true;
	golfer_txn.done_result_ok = success;
	golfer_txn.done_generation = gen;
	k_spin_unlock(&golfer_txn_lock, key);
}

/* button_thread: consume a matching completion for gen, if one is ready.
 * A completion tagged with any other (older) generation does not match and
 * is left untouched -- it belongs to an already-expired transaction.
 */
static bool golfer_txn_check_done(uint32_t gen, bool *out_success)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);
	bool matched = golfer_txn.done && golfer_txn.done_generation == gen;

	if (matched) {
		*out_success = golfer_txn.done_result_ok;
		golfer_txn.done = false;
	}
	k_spin_unlock(&golfer_txn_lock, key);
	return matched;
}

static void sched_ctl_set_health_due(void)
{
	k_spinlock_key_t key = k_spin_lock(&sched_ctl_lock);

	sched_ctl.health_due_pending = true;
	k_spin_unlock(&sched_ctl_lock, key);
}

static bool sched_ctl_take_health_due(void)
{
	k_spinlock_key_t key = k_spin_lock(&sched_ctl_lock);
	bool due = sched_ctl.health_due_pending;

	sched_ctl.health_due_pending = false;
	k_spin_unlock(&sched_ctl_lock, key);
	return due;
}

static void sched_ctl_set_state(enum txn_state s)
{
	k_spinlock_key_t key = k_spin_lock(&sched_ctl_lock);

	sched_ctl.state = s;
	k_spin_unlock(&sched_ctl_lock, key);
}

/* Coherent single-owner handoff for a freshly-parsed effective_config
 * deadline: network_health_thread is the sole owner of
 * cached_next_health_report_at_ms/health_timer, regardless of which flow
 * (golfer or Health) received the response containing it.
 */
struct pending_deadline_handoff {
	bool valid;
	int64_t deadline_unix_ms;
};
static struct pending_deadline_handoff pending_deadline;
static struct k_spinlock pending_deadline_lock;

static void pending_deadline_post(int64_t deadline_unix_ms)
{
	k_spinlock_key_t key = k_spin_lock(&pending_deadline_lock);

	pending_deadline.deadline_unix_ms = deadline_unix_ms;
	pending_deadline.valid = true;
	k_spin_unlock(&pending_deadline_lock, key);
	k_sem_give(&network_wake_sem);
}

static bool pending_deadline_take(int64_t *out_deadline_unix_ms)
{
	k_spinlock_key_t key = k_spin_lock(&pending_deadline_lock);
	bool valid = pending_deadline.valid;

	if (valid) {
		*out_deadline_unix_ms = pending_deadline.deadline_unix_ms;
		pending_deadline.valid = false;
	}
	k_spin_unlock(&pending_deadline_lock, key);
	return valid;
}

static app_state_t state = STATE_IDLE;
static volatile bool button_wake_pending;
static volatile bool health_wake_pending;
static volatile bool date_time_valid_pending;
static volatile bool lte_registered_pending;
static struct gpio_callback button_cb;
static struct gpio_callback vbus_cb;

#define HEALTH_REPORT_MAX_ATTEMPTS             2
#define HEALTH_REPORT_ATTEMPT_TIMEOUT_MS       20000
#define HEALTH_REPORT_RETRY_WINDOW_MS          45000
#define HEALTH_DNS_READINESS_TIMEOUT_MS        2000
#define HEALTH_TELEMETRY_READINESS_TIMEOUT_MS  2000
#define HEALTH_YIELD_CONNECT_POLL_MS           3000
#define HEALTH_YIELD_IO_POLL_MS                2000

#define DNS_CACHE_MAX_AGE_MS               300000
#define HEALTH_TELEMETRY_CACHE_MAX_AGE_MS  10000

/* Bounded wait for the date_time library to confirm authoritative UTC at
 * boot (Correction 1). Modem-derived time is expected to resolve almost
 * immediately once LTE is registered; this bound only guards against the
 * rare case where it does not, so boot can still proceed deterministically.
 */
#define DATE_TIME_BOOT_WAIT_MS  15000

/* RAM-only cache of the backend-supplied next scheduled Device Health report
 * deadline (Unix epoch ms, UTC). No persistent storage across reset is
 * implemented: a fresh deadline is (re)established by the boot bootstrap
 * attempt and by every later successful authenticated response. Owned
 * exclusively by the main thread (see date_time_evt_handler() below): the
 * date_time library's own callback thread never reads or writes this 64-bit
 * value, so no cross-thread synchronization is needed for it at all.
 */
static int64_t cached_next_health_report_at_ms = -1;

static K_SEM_DEFINE(date_time_sem, 0, 1);

static void health_timer_expiry(struct k_timer *timer)
{
	ARG_UNUSED(timer);

	/* ISR context: minimal work only, mirroring button_pressed_cb(). All
	 * network/LTE/health-acquisition work happens later in thread context,
	 * exclusively on network_health_thread.
	 */
	health_wake_pending = true;
	k_sem_give(&network_wake_sem);
}

K_TIMER_DEFINE(health_timer, health_timer_expiry, NULL);

/* date_time library event handler (cross-thread-safe by construction):
 * runs on the date_time library's own callback thread, and deliberately
 * never reads or writes cached_next_health_report_at_ms or calls
 * health_schedule_apply_deadline() itself -- doing so from this thread
 * would risk a torn read/write of that 64-bit value racing against
 * network_health_thread. Instead this handler only signals: it releases
 * the bounded boot wait below, and (on any obtained event) sets
 * date_time_valid_pending and gives network_wake_sem so
 * network_health_thread -- the sole owner of the cached deadline and the
 * timer -- applies it. date_time_register_handler() only allows one
 * globally registered handler, and this one stays registered for the
 * process lifetime, so it also fires on every later periodic
 * CONFIG_DATE_TIME_AUTO_UPDATE re-sync, not just at boot.
 */
static void date_time_evt_handler(const struct date_time_evt *evt)
{
	k_sem_give(&date_time_sem);

	if (evt->type != DATE_TIME_NOT_OBTAINED) {
		date_time_valid_pending = true;
		k_sem_give(&network_wake_sem);
	}
}

/* Establishes trustworthy UTC before any scheduled-wake calculation is
 * trusted (Correction 1). Always registers date_time_evt_handler() (via
 * date_time_update_async()) so later re-syncs keep arming a cached deadline
 * even if this bounded wait times out. Never busy-polls: a single bounded
 * k_sem_take() is the only wait, and a timeout here is not itself a
 * failure -- it just means bootstrap communication proceeds without
 * confirmed UTC, and health_schedule_apply_deadline()'s own date_time_now()
 * check (plus this handler's later re-arm) remain the source of truth for
 * whether a deadline actually gets armed.
 */
static void wait_for_authoritative_time(void)
{
	date_time_update_async(date_time_evt_handler);

	if (date_time_is_valid()) {
		LOG_INF("HEALTH_SCHEDULE: authoritative UTC already valid");
		return;
	}

	LOG_INF("HEALTH_SCHEDULE: waiting up to %d ms for authoritative UTC",
		DATE_TIME_BOOT_WAIT_MS);

	if (k_sem_take(&date_time_sem, K_MSEC(DATE_TIME_BOOT_WAIT_MS)) != 0) {
		LOG_WRN("HEALTH_SCHEDULE: authoritative UTC not confirmed within bounded boot wait");
	} else if (date_time_is_valid()) {
		LOG_INF("HEALTH_SCHEDULE: authoritative UTC established");
	} else {
		LOG_WRN("HEALTH_SCHEDULE: date_time event received but time still not valid");
	}
}

/* USB/VBUS service hold: reuses the existing GPIO wake path to keep the
 * device out of its normal field WFI/PSM idle policy for as long as VBUS
 * remains present. Set only from configure_buck2_power_policy() (boot) and
 * vbus_event_callback() (runtime); read from low_power_idle() and configure_psm().
 */
static volatile bool vbus_hold_active;
/* Guards PSM API calls from vbus_event_callback() until the modem is ready. */
static volatile bool modem_ready;

/* Global service-awake keeper: the lowest-priority application thread,
 * strictly above K_IDLE_PRIO, that stays continuously runnable while VBUS
 * is present so Zephyr can never select the idle thread and execute WFI,
 * regardless of what any other thread (application or vendor LTE/modem
 * code) is doing. Any higher-priority thread still preempts it normally.
 */
static K_SEM_DEFINE(keeper_sem, 0, 1);

static void service_awake_keeper_entry(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);

	while (1) {
		k_sem_take(&keeper_sem, K_FOREVER);

		while (vbus_hold_active) {
			k_yield();
		}
	}
}

K_THREAD_DEFINE(service_awake_keeper, 512, service_awake_keeper_entry, NULL, NULL, NULL,
		K_LOWEST_APPLICATION_THREAD_PRIO, 0, 0);

static void set_vbus_hold(bool active)
{
	vbus_hold_active = active;

	if (active) {
		LOG_INF("SERVICE_AWAKE: keeper enabled");
		k_sem_give(&keeper_sem);
	} else {
		LOG_INF("SERVICE_AWAKE: keeper disabled");
	}
}

struct health_cellular_snapshot {
	bool registration_valid;
	enum lte_lc_nw_reg_status registration_state;
	bool https_result_valid;
	bool https_succeeded;
	bool http_status_valid;
	int http_status;
	uint8_t transaction_attempts;
	struct health_temperature_sample temperature;
	bool conn_eval_valid;
	int conn_eval_error;
	bool rsrp_valid;
	int rsrp_dbm;
	bool rsrq_valid;
	int rsrq_db;
	bool snr_valid;
	int snr_db;
	bool serving_cell_valid;
	uint32_t serving_cell_id;
	bool serving_band_valid;
	int serving_band;
	bool psm_valid;
	int psm_tau_s;
	int psm_active_time_s;
	bool battery_valid;
	int battery_voltage_uV;
	uint8_t battery_soc_pct;
};

static struct health_cellular_snapshot button_health_snapshot;
static struct health_cellular_snapshot sched_health_snapshot;

/* Registration/PSM radio state: written only by lte_evt_handler() (the LTE
 * link-control library's own notification context); read by both snapshot
 * flows as a whole-struct locked copy so a reader never observes a
 * registration_state paired with a mismatched/stale PSM update or vice
 * versa.
 */
struct radio_state {
	bool registration_valid;
	enum lte_lc_nw_reg_status registration_state;
	bool psm_valid;
	int psm_tau_s;
	int psm_active_time_s;
};
static struct radio_state radio_state;
static struct k_spinlock radio_state_lock;

static void radio_state_write_registration(enum lte_lc_nw_reg_status status)
{
	k_spinlock_key_t key = k_spin_lock(&radio_state_lock);

	radio_state.registration_valid = true;
	radio_state.registration_state = status;
	k_spin_unlock(&radio_state_lock, key);
}

#if defined(CONFIG_LTE_LC_MODEM_SLEEP_MODULE)
static void radio_state_write_psm(int tau, int active_time)
{
	k_spinlock_key_t key = k_spin_lock(&radio_state_lock);

	radio_state.psm_valid = true;
	radio_state.psm_tau_s = tau;
	radio_state.psm_active_time_s = active_time;
	k_spin_unlock(&radio_state_lock, key);
}
#endif

static struct radio_state radio_state_snapshot(void)
{
	k_spinlock_key_t key = k_spin_lock(&radio_state_lock);
	struct radio_state copy = radio_state;

	k_spin_unlock(&radio_state_lock, key);
	return copy;
}

/* Shared DNS cache for the fixed Cloud Run host, used by both the golfer
 * and Health flows. A resolved address is not assumed valid forever
 * (Cloud Run/GFE addresses are not permanent): entries expire after
 * DNS_CACHE_MAX_AGE_MS and are invalidated outright on a connect failure
 * using the cached address, forcing a fresh resolution next time.
 */
struct dns_cache_entry {
	bool valid;
	int64_t resolved_at_ms;
	struct sockaddr_storage addr;
};
static struct dns_cache_entry dns_cache;
static struct k_spinlock dns_cache_lock;
static bool dns_resolver_busy;

static bool dns_cache_get(struct sockaddr_storage *out, bool *out_stale)
{
	k_spinlock_key_t key = k_spin_lock(&dns_cache_lock);
	bool valid = dns_cache.valid;
	bool stale = valid && (k_uptime_get() - dns_cache.resolved_at_ms > DNS_CACHE_MAX_AGE_MS);

	if (valid) {
		*out = dns_cache.addr;
	}
	k_spin_unlock(&dns_cache_lock, key);
	if (out_stale) {
		*out_stale = stale;
	}
	return valid;
}

static void dns_cache_set(const struct sockaddr_storage *addr)
{
	k_spinlock_key_t key = k_spin_lock(&dns_cache_lock);

	dns_cache.valid = true;
	dns_cache.resolved_at_ms = k_uptime_get();
	dns_cache.addr = *addr;
	k_spin_unlock(&dns_cache_lock, key);
}

static void dns_cache_invalidate(void)
{
	k_spinlock_key_t key = k_spin_lock(&dns_cache_lock);

	dns_cache.valid = false;
	k_spin_unlock(&dns_cache_lock, key);
}

/* Returns true and kicks off dns_resolver_thread if no resolution is
 * already in flight. Never blocks.
 */
static bool dns_kickoff_if_idle(void)
{
	k_spinlock_key_t key = k_spin_lock(&dns_cache_lock);
	bool kicked = false;

	if (!dns_resolver_busy) {
		dns_resolver_busy = true;
		kicked = true;
	}
	k_spin_unlock(&dns_cache_lock, key);
	if (kicked) {
		k_sem_reset(&dns_result_sem);
		k_sem_give(&dns_request_wake_sem);
	}
	return kicked;
}

static void dns_resolver_thread_entry(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);

	while (1) {
		k_sem_take(&dns_request_wake_sem, K_FOREVER);

		struct zsock_addrinfo hints = { .ai_family = AF_INET, .ai_socktype = SOCK_STREAM };
		struct zsock_addrinfo *res = NULL;
		/* The one unbounded call in the firmware: no NCS 3.1.1 API
		 * bounds it. Isolated here so its non-return can never strand
		 * the golfer/Health transaction scheduler.
		 */
		int ret = zsock_getaddrinfo(
			"fairway-button-receiver-936892386735.us-central1.run.app",
			"443", &hints, &res);

		if (ret == 0) {
			struct sockaddr_storage addr = {0};

			memcpy(&addr, res->ai_addr, res->ai_addrlen);
			dns_cache_set(&addr);
			zsock_freeaddrinfo(res);
		}

		k_spinlock_key_t key = k_spin_lock(&dns_cache_lock);

		dns_resolver_busy = false;
		k_spin_unlock(&dns_cache_lock, key);
		k_sem_give(&dns_result_sem);
	}
}
K_THREAD_DEFINE(dns_resolver_thread, CONFIG_MAIN_STACK_SIZE,
		dns_resolver_thread_entry, NULL, NULL, NULL,
		DNS_RESOLVER_THREAD_PRIORITY, 0, 0);

/* Bounded accessor: never returns later than bound_ms. A cache hit (fresh
 * or stale) returns immediately at zero wait; a stale hit also triggers a
 * background refresh for next time.
 */
static int dns_get_address_bounded(struct sockaddr_storage *out, int64_t bound_ms)
{
	bool stale = false;

	if (dns_cache_get(out, &stale)) {
		if (stale) {
			dns_kickoff_if_idle();
		}
		return 0;
	}

	dns_kickoff_if_idle();
	if (bound_ms <= 0) {
		return -ETIMEDOUT;
	}
	k_sem_take(&dns_result_sem, K_MSEC(bound_ms));
	if (dns_cache_get(out, NULL)) {
		return 0;
	}
	return -ETIMEDOUT;
}

/* Isolated connection-evaluation telemetry cache/helper: the golfer flow
 * never uses this (no verified bound, no payload value); only Health's
 * run_health_cycle() calls telemetry_get_bounded().
 */
struct telemetry_cache_entry {
	bool valid;
	int64_t captured_at_ms;
	struct lte_lc_conn_eval_params params;
};
static struct telemetry_cache_entry telemetry_cache;
static struct k_spinlock telemetry_cache_lock;
static bool telemetry_busy;

static void telemetry_helper_thread_entry(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);

	while (1) {
		k_sem_take(&telemetry_request_wake_sem, K_FOREVER);

		struct lte_lc_conn_eval_params tmp = {0};
		/* The other unbounded call in the firmware: isolated here. */
		int ret = lte_lc_conn_eval_params_get(&tmp);
		k_spinlock_key_t key = k_spin_lock(&telemetry_cache_lock);

		if (ret == 0) {
			telemetry_cache.params = tmp;
			telemetry_cache.captured_at_ms = k_uptime_get();
			telemetry_cache.valid = true;
		}
		telemetry_busy = false;
		k_spin_unlock(&telemetry_cache_lock, key);
		k_sem_give(&telemetry_result_sem);
	}
}
K_THREAD_DEFINE(telemetry_helper_thread, CONFIG_MAIN_STACK_SIZE,
		telemetry_helper_thread_entry, NULL, NULL, NULL,
		TELEMETRY_HELPER_THREAD_PRIORITY, 0, 0);

static int telemetry_get_bounded(struct lte_lc_conn_eval_params *out, int64_t bound_ms)
{
	k_spinlock_key_t key = k_spin_lock(&telemetry_cache_lock);
	bool kicked = false;

	if (!telemetry_busy) {
		telemetry_busy = true;
		kicked = true;
	}
	k_spin_unlock(&telemetry_cache_lock, key);
	if (kicked) {
		k_sem_reset(&telemetry_result_sem);
		k_sem_give(&telemetry_request_wake_sem);
	}
	if (bound_ms > 0) {
		k_sem_take(&telemetry_result_sem, K_MSEC(bound_ms));
	}

	key = k_spin_lock(&telemetry_cache_lock);
	bool ok = telemetry_cache.valid &&
		  (k_uptime_get() - telemetry_cache.captured_at_ms) <= HEALTH_TELEMETRY_CACHE_MAX_AGE_MS;

	if (ok) {
		*out = telemetry_cache.params;
	}
	k_spin_unlock(&telemetry_cache_lock, key);
	return ok ? 0 : -ETIMEDOUT;
}

/* Reads the installed Adafruit 5580 / MAX17048 via the native NCS fuel-gauge
 * API into the Device Health snapshot. Leaves battery_valid false on any
 * failure rather than reporting a stale or invented value.
 */
static void health_battery_read(struct health_cellular_snapshot *snap)
{
	if (!device_is_ready(max17048_dev)) {
		return;
	}

	fuel_gauge_prop_t props[] = {
		FUEL_GAUGE_VOLTAGE,
		FUEL_GAUGE_RELATIVE_STATE_OF_CHARGE,
	};
	union fuel_gauge_prop_val vals[ARRAY_SIZE(props)];

	if (fuel_gauge_get_props(max17048_dev, props, vals, ARRAY_SIZE(props)) < 0) {
		return;
	}

	snap->battery_valid = true;
	snap->battery_voltage_uV = vals[0].voltage;
	snap->battery_soc_pct = vals[1].relative_state_of_charge;
}

/* Applies a freshly-parsed backend deadline: caches it in RAM and, only when
 * authoritative UTC is currently available, (re)arms the scheduled-health
 * k_timer from the newest deadline. If UTC is not currently valid, the
 * deadline is still cached, but no timer is armed from it; a later valid
 * deadline (from any subsequent authenticated communication) is required to
 * actually schedule the wake.
 */
static void health_schedule_apply_deadline(int64_t new_deadline_unix_ms)
{
	int64_t now_unix_ms;
	int64_t delta_ms;

	cached_next_health_report_at_ms = new_deadline_unix_ms;

	if (date_time_now(&now_unix_ms) != 0) {
		LOG_WRN("HEALTH_SCHEDULE: deadline cached but UTC unavailable; timer not armed");
		return;
	}

	delta_ms = health_schedule_delta_ms(new_deadline_unix_ms, now_unix_ms);

	k_timer_start(&health_timer, K_MSEC(delta_ms), K_NO_WAIT);

	LOG_INF("HEALTH_SCHEDULE: next_health_report_at applied, delta_ms=%lld",
		(long long)delta_ms);
}

static void button_pressed_cb(const struct device *dev, struct gpio_callback *cb,
			     uint32_t pins)
{
	ARG_UNUSED(dev);
	ARG_UNUSED(cb);
	ARG_UNUSED(pins);

	if (!button_is_pressed()) {
		return;
	}

	button_wake_pending = true;
	k_sem_give(&button_wake_sem);
}

/* Single globally-registered LTE event handler (lte_lc_connect_async() and
 * lte_lc_register_handler() both only support one handler at a time, so
 * PSM/modem-sleep diagnostics and network-registration handling are
 * combined here). Runs on the LTE link-control library's own notification
 * context, never button_thread/transaction_thread/network_health_thread.
 * Only writes radio_state (spinlock-protected, single-word members per
 * field but copied/read as a coherent whole); any follow-up requiring a
 * particular thread is only ever signaled via lte_registered_pending +
 * network_wake_sem, never performed directly here.
 */
static void lte_evt_handler(const struct lte_lc_evt *const evt)
{
	switch (evt->type) {
	case LTE_LC_EVT_NW_REG_STATUS:
		radio_state_write_registration(evt->nw_reg_status);

		if (evt->nw_reg_status == LTE_LC_NW_REG_REGISTERED_HOME ||
		    evt->nw_reg_status == LTE_LC_NW_REG_REGISTERED_ROAMING) {
			LOG_INF("LTE registered: status=%d", evt->nw_reg_status);
			lte_registered_pending = true;
			k_sem_give(&network_wake_sem);
		} else {
			LOG_INF("LTE registration status update: %d", evt->nw_reg_status);
		}
		break;
#if defined(CONFIG_LTE_LC_MODEM_SLEEP_MODULE)
	case LTE_LC_EVT_PSM_UPDATE:
		radio_state_write_psm(evt->psm_cfg.tau, evt->psm_cfg.active_time);
		LOG_INF("PSM granted: TAU=%d s, active_time=%d s",
			evt->psm_cfg.tau, evt->psm_cfg.active_time);
		break;
	case LTE_LC_EVT_MODEM_SLEEP_ENTER:
		LOG_INF("MODEM_SLEEP_ENTER: time=%lld ms",
			(long long)evt->modem_sleep.time);
		break;
	case LTE_LC_EVT_MODEM_SLEEP_EXIT:
		LOG_INF("MODEM_SLEEP_EXIT");
		break;
#endif /* CONFIG_LTE_LC_MODEM_SLEEP_MODULE */
	default:
		break;
	}
}

/* Shared with vbus_event_callback() so VBUS insertion/removal reuses the
 * exact same PSM request API as the existing field policy, instead of a
 * new modem architecture.
 */
static void set_modem_psm_requested(bool requested)
{
	int ret = lte_lc_psm_req(requested);

	if (ret) {
		LOG_ERR("lte_lc_psm_req(%d) failed: %d", requested, ret);
		return;
	}

	if (requested) {
		LOG_INF("PSM requested: RPTAU=default, RAT=0 s");
	} else {
		LOG_INF("PSM request withdrawn: VBUS service hold active");
	}
}

static void configure_psm(void)
{
	int ret;

	ret = lte_lc_psm_param_set_seconds(-1, 0);
	if (ret) {
		LOG_ERR("lte_lc_psm_param_set_seconds failed: %d", ret);
		return;
	}

	set_modem_psm_requested(!vbus_hold_active);
}

static void low_power_idle(void)
{
	/* button_wake_pending is left set here; the button thread's own loop
	 * in main() is the single point that clears it. Health/date_time/LTE/
	 * effective_config causes are serviced entirely by
	 * network_health_thread on its own network_wake_sem; the golfer
	 * transaction scheduler is serviced entirely by transaction_thread on
	 * its own txn_wake_sem. Neither is ever observed here.
	 */
	k_sem_take(&button_wake_sem, K_FOREVER);
}

static int apply_buck2_power_policy(bool vbus_present)
{
	int ret;

	if (!device_is_ready(buck2_dev)) {
		return -ENODEV;
	}

	if (vbus_present) {
		if (regulator_is_enabled(buck2_dev)) {
			return 0;
		}

		ret = regulator_enable(buck2_dev);
		if (ret == 0) {
			LOG_INF("VBUS present: BUCK2 service rail enabled");
		}
		return ret;
	}

	if (!regulator_is_enabled(buck2_dev)) {
		return 0;
	}

	ret = regulator_disable(buck2_dev);
	if (ret == 0) {
		LOG_INF("VBUS absent: BUCK2 service rail disabled");
	}
	return ret;
}

static void vbus_event_callback(const struct device *dev, struct gpio_callback *cb,
				uint32_t pins)
{
	ARG_UNUSED(dev);
	ARG_UNUSED(cb);

	if ((pins & BIT(NPM13XX_EVENT_VBUS_DETECTED)) != 0U) {
		set_vbus_hold(true);

		if (apply_buck2_power_policy(true) < 0) {
			LOG_ERR("BUCK2 enable after VBUS detection failed");
		}

		if (modem_ready) {
			set_modem_psm_requested(false);
		}
	}

	if ((pins & BIT(NPM13XX_EVENT_VBUS_REMOVED)) != 0U) {
		set_vbus_hold(false);

		if (apply_buck2_power_policy(false) < 0) {
			LOG_ERR("BUCK2 disable after VBUS removal failed");
		}

		if (modem_ready) {
			set_modem_psm_requested(true);
		}
	}
}

static int configure_buck2_power_policy(void)
{
	struct sensor_value vbus_present;
	int ret;

	if (!device_is_ready(npm1300_pmic_dev) || !device_is_ready(npm1300_charger_dev)) {
		return -ENODEV;
	}

	gpio_init_callback(&vbus_cb, vbus_event_callback,
			   BIT(NPM13XX_EVENT_VBUS_DETECTED) | BIT(NPM13XX_EVENT_VBUS_REMOVED));
	ret = mfd_npm13xx_add_callback(npm1300_pmic_dev, &vbus_cb);
	if (ret < 0) {
		return ret;
	}

	ret = sensor_attr_get(npm1300_charger_dev, SENSOR_CHAN_NPM13XX_CHARGER_VBUS_STATUS,
			      SENSOR_ATTR_NPM13XX_CHARGER_VBUS_PRESENT, &vbus_present);
	if (ret < 0) {
		return ret;
	}

	LOG_INF("VBUS_HOLD: active=%d at boot", vbus_present.val1 != 0);

	set_vbus_hold(vbus_present.val1 != 0);

	return apply_buck2_power_policy(vbus_hold_active);
}

static void ring_on(void)
{
	gpio_pin_set(gpio0_dev, RING_LED_PIN, 1);
}

static void ring_off(void)
{
	gpio_pin_set(gpio0_dev, RING_LED_PIN, 0);
}

static void ring_flash(int count, int on_ms, int off_ms)
{
	for (int i = 0; i < count; i++) {
		ring_on();
		k_sleep(K_MSEC(on_ms));
		ring_off();
		k_sleep(K_MSEC(off_ms));
	}
}

static bool button_is_pressed(void)
{
	int raw = gpio_pin_get(gpio0_dev, BUTTON_PIN);

	/*
	 * Internal pull-up:
	 * released      = raw 1
	 * fully pressed = raw 0
	 */
	return raw == 0;
}

static void set_state(app_state_t new_state)
{
	state = new_state;

	switch (state) {
	case STATE_IDLE:
		LOG_INF("STATE_IDLE");
		break;
	case STATE_BUTTON_ACK:
		LOG_INF("STATE_BUTTON_ACK");
		break;
	case STATE_TRANSMITTING:
		LOG_INF("STATE_TRANSMITTING");
		break;
	case STATE_SUCCESS:
		LOG_INF("STATE_SUCCESS");
		break;
	case STATE_FAILURE:
		LOG_INF("STATE_FAILURE");
		break;
	default:
		LOG_WRN("Unknown state: %d", state);
		break;
	}
}

static void show_transmitting_feedback(void)
{
	ring_flash(3, INITIAL_FLASH_ON_MS, INITIAL_FLASH_OFF_MS);
}

static void show_success_feedback(void)
{
	ring_flash(SUCCESS_FLASH_COUNT, SUCCESS_FLASH_ON_MS, SUCCESS_FLASH_OFF_MS);
	ring_off();
}

static void show_failure_feedback(void)
{
	ring_on();
	k_sleep(K_MSEC(FAILURE_SOLID_MS));
	ring_off();
}

/* Resets and reacquires the Device Health snapshot (temperature, battery,
 * connection-evaluation radio metrics), preserving registration/PSM state
 * from the coherent radio_state snapshot. Shared by the golfer button flow
 * and the scheduled health_report flow, each into its own owned struct
 * instance, so both report the same underlying measurement shape without
 * sharing mutable state.
 */
static void health_snapshot_acquire(struct health_cellular_snapshot *snap)
{
	struct radio_state radio = radio_state_snapshot();
	struct lte_lc_conn_eval_params conn_eval = {0};
	int temperature_ret;
	int ret;

	*snap = (struct health_cellular_snapshot){
		.registration_valid = radio.registration_valid,
		.registration_state = radio.registration_state,
		.psm_valid = radio.psm_valid,
		.psm_tau_s = radio.psm_tau_s,
		.psm_active_time_s = radio.psm_active_time_s,
	};

	temperature_ret = health_temperature_read(&snap->temperature);
	if (temperature_ret) {
		LOG_WRN("Device temperature unavailable: %d", temperature_ret);
	}

	health_battery_read(snap);

	/* Isolated, bounded telemetry accessor (Health only -- the golfer flow
	 * never calls this function's conn_eval portion at all, see
	 * run_golfer_transaction()). lte_lc_conn_eval_params_get() itself has
	 * no established application-level bound, so it never executes
	 * directly here; telemetry_helper_thread is the sole caller.
	 */
	ret = telemetry_get_bounded(&conn_eval, HEALTH_TELEMETRY_READINESS_TIMEOUT_MS);
	snap->conn_eval_error = ret;
	if (ret == 0) {
		snap->conn_eval_valid = true;
		if (conn_eval.rsrp != LTE_LC_CELL_RSRP_INVALID) {
			snap->rsrp_valid = true;
			snap->rsrp_dbm = RSRP_IDX_TO_DBM(conn_eval.rsrp);
		}
		if (conn_eval.rsrq != LTE_LC_CELL_RSRQ_INVALID) {
			snap->rsrq_valid = true;
			snap->rsrq_db = RSRQ_IDX_TO_DB(conn_eval.rsrq);
		}
		if (conn_eval.snr != 127) {
			snap->snr_valid = true;
			snap->snr_db = SNR_IDX_TO_DB(conn_eval.snr);
		}
		if (conn_eval.cell_id != 0) {
			snap->serving_cell_valid = true;
			snap->serving_cell_id = conn_eval.cell_id;
		}
		if (conn_eval.band != 0) {
			snap->serving_band_valid = true;
			snap->serving_band = conn_eval.band;
		}
	} else {
		LOG_WRN("Connection evaluation unavailable within bound: %d", ret);
	}
}

/* Runs the golfer's accepted transaction to terminal disposition within the
 * single absolute txn_deadline_ms established at acceptance time (see
 * main()). Every attempt and every stage inside send_https_test() computes
 * its own remaining time from this same deadline -- no attempt ever resets
 * or extends it. Never yields to Health (Health always yields to this).
 * Telemetry/connection-evaluation is intentionally never acquired here: it
 * has no established bound and no value in the button_press payload: only
 * best-effort temperature/battery logging happens, after disposition.
 */
static int run_golfer_transaction(int64_t txn_deadline_ms)
{
	int ret = -ETIMEDOUT;

	for (int attempt = 0; attempt < GOLFER_MAX_ATTEMPTS; attempt++) {
		int64_t now_ms = k_uptime_get();
		int64_t remaining_ms = txn_deadline_ms - now_ms;

		if (remaining_ms <= 0) {
			break;
		}
		if (attempt > 0 && remaining_ms < GOLFER_MIN_RETRY_RESERVE_MS) {
			break;
		}

		button_health_snapshot.transaction_attempts = attempt + 1;
		ret = send_https_test(&button_health_snapshot, txn_deadline_ms);
		button_health_snapshot.https_result_valid = true;
		button_health_snapshot.https_succeeded = (ret == 0);
		if (ret == 0 || ret == -EACCES) {
			break;
		}
	}

	/* Best-effort, post-disposition-only local telemetry: never gates the
	 * retry loop or terminal disposition above.
	 */
	(void)health_temperature_read(&button_health_snapshot.temperature);
	health_battery_read(&button_health_snapshot);

	LOG_INF("Golfer transaction telemetry: attempts=%u https=%d http=%d temp_valid=%d temp_mC=%d "
		"batt_valid=%d batt_uV=%d batt_soc=%u",
		button_health_snapshot.transaction_attempts,
		button_health_snapshot.https_succeeded,
		button_health_snapshot.http_status,
		button_health_snapshot.temperature.valid,
		button_health_snapshot.temperature.temp_mC,
		button_health_snapshot.battery_valid,
		button_health_snapshot.battery_valid ? button_health_snapshot.battery_voltage_uV : 0,
		button_health_snapshot.battery_valid ? button_health_snapshot.battery_soc_pct : 0U);

	return ret;
}

/* Sends the scheduled health_report within its own two-attempt retry policy
 * (see FIRMWARE_SPECIFICATION.md "Device Health Transport and Scheduling").
 */
static int send_health_report(struct health_cellular_snapshot *snap, int64_t attempt_deadline_ms)
{
	int ret;

	LOG_INF("Scheduled health_report send started");

	ret = send_health_report_request(snap, attempt_deadline_ms);
	snap->https_result_valid = true;
	snap->https_succeeded = (ret == 0);
	if (ret) {
		LOG_ERR("Scheduled health_report send failed: %d", ret);
		return ret;
	}

	LOG_INF("Scheduled health_report send complete: success");

	return 0;
}

enum health_cycle_result {
	HEALTH_CYCLE_DONE = 0,
	HEALTH_CYCLE_ABORTED,
};

/* Runs one scheduled Device Health reporting cycle: initial attempt plus at
 * most one retry, the retry occurring within HEALTH_REPORT_RETRY_WINDOW_MS
 * of the cycle start. Yields to the golfer at every checkpoint via
 * golfer_txn_is_pending(): if a golfer press is accepted while this cycle is
 * running, the cycle aborts immediately (no partial-attempt state is
 * preserved) and re-arms itself as still due so a fresh, full two-attempt
 * cycle runs again once the golfer transaction reaches terminal disposition.
 * Deliberately does not touch app_state_t/the LED ring: scheduled health
 * reporting is a silent background operation, not golfer-facing UX.
 */
static enum health_cycle_result run_health_cycle(void)
{
	int ret = -ETIMEDOUT;
	int64_t cycle_start_ms = k_uptime_get();

	health_snapshot_acquire(&sched_health_snapshot);

	for (int attempt = 0; attempt < HEALTH_REPORT_MAX_ATTEMPTS; attempt++) {
		if (golfer_txn_is_pending()) {
			sched_ctl_set_health_due();
			return HEALTH_CYCLE_ABORTED;
		}

		int64_t now_ms = k_uptime_get();
		int64_t attempt_deadline = MIN(now_ms + HEALTH_REPORT_ATTEMPT_TIMEOUT_MS,
						cycle_start_ms + HEALTH_REPORT_RETRY_WINDOW_MS);

		sched_health_snapshot.transaction_attempts = attempt + 1;

		if (attempt_deadline <= now_ms) {
			break;
		}

		ret = send_health_report(&sched_health_snapshot, attempt_deadline);
		if (ret == -ECANCELED) {
			sched_ctl_set_health_due();
			return HEALTH_CYCLE_ABORTED;
		}
		if (ret == 0 || ret == -EACCES) {
			break;
		}
	}

	LOG_INF("Scheduled health report cycle complete: attempts=%u https=%d http=%d result=%d",
		sched_health_snapshot.transaction_attempts,
		sched_health_snapshot.https_succeeded,
		sched_health_snapshot.http_status,
		ret);

	return HEALTH_CYCLE_DONE;
}

static int provision_fairway_ca_certificate(void)
{
	int ret;
	bool exists;
	int mismatch;

	LOG_INF("Checking Cloud Run CA certificate");

	ret = modem_key_mgmt_exists(FAIRWAY_TLS_SEC_TAG,
				    MODEM_KEY_MGMT_CRED_TYPE_CA_CHAIN,
				    &exists);
	if (ret) {
		LOG_ERR("CA certificate exists check failed: %d", ret);
		return ret;
	}

	if (exists) {
		mismatch = modem_key_mgmt_cmp(FAIRWAY_TLS_SEC_TAG,
					      MODEM_KEY_MGMT_CRED_TYPE_CA_CHAIN,
					      fairway_ca_cert,
					      strlen(fairway_ca_cert));
		if (!mismatch) {
			LOG_INF("CA certificate already provisioned and matches");
			return 0;
		}

		LOG_INF("CA certificate mismatch; replacing certificate");

		ret = modem_key_mgmt_delete(FAIRWAY_TLS_SEC_TAG,
					    MODEM_KEY_MGMT_CRED_TYPE_CA_CHAIN);
		if (ret) {
			LOG_ERR("CA certificate delete failed: %d", ret);
			return ret;
		}
	}

	LOG_INF("Provisioning CA certificate to modem");

	ret = modem_key_mgmt_write(FAIRWAY_TLS_SEC_TAG,
				   MODEM_KEY_MGMT_CRED_TYPE_CA_CHAIN,
				   fairway_ca_cert,
				   sizeof(fairway_ca_cert) - 1);
	if (ret) {
		LOG_ERR("CA certificate write failed: %d", ret);
		return ret;
	}

	LOG_INF("CA certificate provisioned successfully");
	return 0;
}

/* Bounded poll-based stage wait: never blocks longer than remaining_ms,
 * regardless of NCS socket-timeout-option semantics.
 */
static int socket_stage_deadline(int fd, short events, int64_t remaining_ms)
{
	if (remaining_ms <= 0) {
		return -ETIMEDOUT;
	}

	struct zsock_pollfd pfd = { .fd = fd, .events = events };
	int ret = zsock_poll(&pfd, 1, (int)remaining_ms);

	if (ret <= 0) {
		return -ETIMEDOUT;
	}
	if (pfd.revents & (ZSOCK_POLLERR | ZSOCK_POLLHUP)) {
		return -ECONNRESET;
	}
	return 0;
}

/* NCS 3.1.1 does not document SO_SNDTIMEO/SO_RCVTIMEO as bounding
 * zsock_connect() on this offloaded socket stack (only send/recv, per
 * POSIX convention); a nonblocking connect plus zsock_poll()'s own
 * timeout parameter is the only verified way to enforce a hard connect
 * deadline.
 */
static int socket_connect_bounded(int fd, const struct sockaddr *addr, socklen_t len,
				   int64_t remaining_ms)
{
	int flags = zsock_fcntl(fd, F_GETFL, 0);
	int ret;

	zsock_fcntl(fd, F_SETFL, flags | O_NONBLOCK);

	ret = zsock_connect(fd, addr, len);
	if (ret == 0) {
		return 0;
	}
	if (errno != EINPROGRESS) {
		return -errno;
	}
	if (socket_stage_deadline(fd, ZSOCK_POLLOUT, remaining_ms) != 0) {
		return -ETIMEDOUT;
	}

	int so_error = 0;
	socklen_t elen = sizeof(so_error);

	zsock_getsockopt(fd, SOL_SOCKET, SO_ERROR, &so_error, &elen);
	return so_error ? -so_error : 0;
}

/* Shared authenticated HTTPS transport primitive for both the golfer
 * button_press flow and the scheduled health_report flow.
 *
 * DNS is served from the shared, spinlock-protected dns_cache via
 * dns_get_address_bounded(): zsock_getaddrinfo() itself only ever executes
 * on the isolated dns_resolver_thread, never here.
 *
 * connect()/send()/recv() all use a nonblocking socket plus
 * socket_stage_deadline()/socket_connect_bounded(), so no single stage can
 * ever block longer than the remaining portion of attempt_deadline_ms.
 *
 * When yieldable is true (Health's own flow only), golfer_txn_is_pending()
 * is checked before/after every stage; a pending golfer press aborts this
 * call immediately with -ECANCELED so Health never holds the shared
 * transport once a golfer transaction has been accepted. The golfer's own
 * flow (yieldable=false) never checks this and is never itself aborted.
 *
 * Return value convention (unchanged from the pre-WP4 button-only
 * behavior), plus one new outcome:
 *   0           HTTP 2xx.
 *   -EACCES     HTTP 400/401/403/404 (terminal; caller does not retry).
 *   -EPROTO     Any other received-but-unsuccessful HTTP response.
 *   -ECANCELED  Health yielded to an accepted golfer press (yieldable only).
 *   -errno/-ETIMEDOUT  No response could be obtained at all.
 */
static int send_http_request(const char *request, int request_len,
			      int64_t attempt_deadline_ms,
			      struct health_cellular_snapshot *snap,
			      bool yieldable)
{
	int fd = -1;
	int ret;
	int64_t remaining_ms;
	struct sockaddr_storage addr;
	socklen_t addr_len;

	const char *host = "fairway-button-receiver-936892386735.us-central1.run.app";

	static char recv_buf[4096];

	int verify = TLS_PEER_VERIFY_REQUIRED;
	sec_tag_t sec_tag_list[] = { FAIRWAY_TLS_SEC_TAG };

	LOG_INF("Sending HTTPS request to Cloud Run");

	if (yieldable && golfer_txn_is_pending()) {
		return -ECANCELED;
	}

	remaining_ms = attempt_deadline_ms - k_uptime_get();
	ret = dns_get_address_bounded(&addr,
		yieldable ? MIN(remaining_ms, (int64_t)HEALTH_DNS_READINESS_TIMEOUT_MS)
			  : MIN(remaining_ms, (int64_t)GOLFER_DNS_READINESS_TIMEOUT_MS));
	if (ret != 0) {
		LOG_WRN("HTTPS DNS not ready within bound: %d", ret);
		return ret;
	}
	if (yieldable && golfer_txn_is_pending()) {
		return -ECANCELED;
	}

	addr_len = (addr.ss_family == AF_INET) ? sizeof(struct sockaddr_in)
						: sizeof(struct sockaddr_in6);

	fd = zsock_socket(addr.ss_family, SOCK_STREAM, IPPROTO_TLS_1_2);
	if (fd < 0) {
		ret = -errno;
		LOG_ERR("HTTPS zsock_socket failed: errno %d", errno);
		goto out;
	}

	ret = zsock_setsockopt(fd, SOL_TLS, TLS_PEER_VERIFY,
			       &verify, sizeof(verify));
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS TLS_PEER_VERIFY failed: errno %d", errno);
		goto out;
	}

	ret = zsock_setsockopt(fd, SOL_TLS, TLS_SEC_TAG_LIST,
			       sec_tag_list, sizeof(sec_tag_list));
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS TLS_SEC_TAG_LIST failed: errno %d", errno);
		goto out;
	}

	ret = zsock_setsockopt(fd, SOL_TLS, TLS_HOSTNAME,
			       host, strlen(host));
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS TLS_HOSTNAME failed: errno %d", errno);
		goto out;
	}

	if (yieldable && golfer_txn_is_pending()) {
		ret = -ECANCELED;
		goto out;
	}

	remaining_ms = attempt_deadline_ms - k_uptime_get();
	LOG_INF("Connecting to %s:443", host);
	ret = socket_connect_bounded(fd, (struct sockaddr *)&addr, addr_len,
		yieldable ? MIN(remaining_ms, (int64_t)HEALTH_YIELD_CONNECT_POLL_MS)
			  : remaining_ms);
	if (ret != 0) {
		LOG_ERR("HTTPS connect failed: %d", ret);
		if (ret == -ECONNREFUSED || ret == -ETIMEDOUT) {
			dns_cache_invalidate();
		}
		goto out;
	}

	LOG_INF("HTTPS socket connected");

	if (yieldable && golfer_txn_is_pending()) {
		ret = -ECANCELED;
		goto out;
	}

	remaining_ms = attempt_deadline_ms - k_uptime_get();
	ret = socket_stage_deadline(fd, ZSOCK_POLLOUT,
		yieldable ? MIN(remaining_ms, (int64_t)HEALTH_YIELD_IO_POLL_MS) : remaining_ms);
	if (ret != 0) {
		goto out;
	}

	ret = zsock_send(fd, request, request_len, 0);
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS zsock_send failed: errno %d", errno);
		goto out;
	}

	LOG_INF("HTTPS request sent: %d bytes", ret);

	if (yieldable && golfer_txn_is_pending()) {
		ret = -ECANCELED;
		goto out;
	}

	remaining_ms = attempt_deadline_ms - k_uptime_get();
	ret = socket_stage_deadline(fd, ZSOCK_POLLIN,
		yieldable ? MIN(remaining_ms, (int64_t)HEALTH_YIELD_IO_POLL_MS) : remaining_ms);
	if (ret != 0) {
		goto out;
	}

	ret = zsock_recv(fd, recv_buf, sizeof(recv_buf) - 1, 0);
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS zsock_recv failed: errno %d", errno);
		goto out;
	}

	recv_buf[ret] = '\0';
	LOG_INF("HTTPS response received: %d bytes", ret);
	LOG_INF("HTTPS response preview: %.80s", recv_buf);

	if (yieldable && golfer_txn_is_pending()) {
		ret = -ECANCELED;
		goto out;
	}

	{
		int http_status = 0;

		snap->http_status_valid =
			sscanf(recv_buf, "HTTP/%*u.%*u %d", &http_status) == 1;
		snap->http_status = http_status;

		if (snap->http_status_valid &&
		    http_status >= 200 && http_status < 300) {
			char *body = strstr(recv_buf, "\r\n\r\n");

			if (body != NULL) {
				body += 4;

				size_t body_len = (size_t)ret - (size_t)(body - recv_buf);
				int64_t new_deadline_unix_ms;

				if (health_schedule_parse_effective_config(body, body_len,
									    &new_deadline_unix_ms)) {
					pending_deadline_post(new_deadline_unix_ms);
				}
			}
		}

		if (!snap->http_status_valid ||
		    http_status < 200 || http_status >= 300) {
			ret = (http_status == 400 || http_status == 401 ||
			       http_status == 403 || http_status == 404) ? -EACCES : -EPROTO;
			goto out;
		}
	}

	LOG_INF("Cloud Run HTTPS request succeeded");
	ret = 0;

out:
	if (fd >= 0) {
		zsock_close(fd);
	}
	return ret;
}

static int send_https_test(struct health_cellular_snapshot *snap, int64_t attempt_deadline_ms)
{
	static char request_body[128];
	int request_body_len;

	request_body_len = snprintk(request_body, sizeof(request_body),
		"{\"device_id\":\"%s\",\"event_type\":\"button_press\"}",
		FAIRWAY_DEVICE_ID);

	if (request_body_len < 0 || request_body_len >= sizeof(request_body)) {
		LOG_ERR("HTTPS request body buffer too small");
		return -ENOMEM;
	}

	static char request[512];
	int request_len;

	request_len = snprintk(request, sizeof(request),
		"POST / HTTP/1.1\r\n"
		"Host: fairway-button-receiver-936892386735.us-central1.run.app\r\n"
		"Content-Type: application/json\r\n"
		"X-Fairway-Device-Key: " FAIRWAY_DEVICE_KEY "\r\n"
		"Content-Length: %d\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		request_body_len,
		request_body);

	if (request_len < 0 || request_len >= sizeof(request)) {
		LOG_ERR("HTTPS request buffer too small");
		return -ENOMEM;
	}

	return send_http_request(request, request_len, attempt_deadline_ms, snap, false);
}

/* Formats one nullable integer health measurement into buf (decimal, base
 * 10) when valid, or returns the JSON literal "null" when not -- mirrors
 * the *_valid gating already used for local logging, now applied to the
 * transmitted health_report contract (lib/fleet/health.js
 * NULLABLE_INTEGER_FIELDS).
 */
static const char *health_field_or_null(char *buf, size_t buf_len, bool valid, int32_t value)
{
	if (!valid) {
		return "null";
	}

	snprintk(buf, buf_len, "%d", value);
	return buf;
}

/* serving_cell_id is the only unsigned nullable field (28-bit LTE ECI);
 * formatted separately so a large cell ID can never be misrepresented via
 * a signed cast.
 */
static const char *health_field_or_null_u32(char *buf, size_t buf_len, bool valid, uint32_t value)
{
	if (!valid) {
		return "null";
	}

	snprintk(buf, buf_len, "%u", value);
	return buf;
}

/* Serializes health_cellular_snapshot into the deployed backend health_report
 * contract (docs/DEVICE_PROVISIONING_GUIDE.md / lib/fleet/health.js).
 * conn_eval_error is firmware-local diagnostic only and is never
 * transmitted, matching the current backend contract exactly.
 */
static int send_health_report_request(struct health_cellular_snapshot *snap, int64_t attempt_deadline_ms)
{
	char registration_state_buf[16];
	char http_status_buf[16];
	char temp_buf[16];
	char rsrp_buf[16];
	char rsrq_buf[16];
	char snr_buf[16];
	char cell_buf[16];
	char band_buf[16];
	char psm_tau_buf[16];
	char psm_active_buf[16];
	char batt_uv_buf[16];
	char batt_soc_buf[16];
	const char *https_succeeded_str;

	static char health_body[512];
	int health_body_len;

	if (snap->https_result_valid) {
		https_succeeded_str = snap->https_succeeded ? "true" : "false";
	} else {
		https_succeeded_str = "null";
	}

	health_body_len = snprintk(health_body, sizeof(health_body),
		"{\"device_id\":\"%s\",\"event_type\":\"health_report\",\"health\":{"
		"\"attempts\":%u,"
		"\"registration_state\":%s,"
		"\"http_status\":%s,"
		"\"modem_temperature_m_c\":%s,"
		"\"rsrp_dbm\":%s,"
		"\"rsrq_db\":%s,"
		"\"snr_db\":%s,"
		"\"serving_cell_id\":%s,"
		"\"serving_band\":%s,"
		"\"psm_tau_s\":%s,"
		"\"psm_active_time_s\":%s,"
		"\"battery_voltage_u_v\":%s,"
		"\"battery_soc_pct\":%s,"
		"\"https_succeeded\":%s"
		"}}",
		FAIRWAY_DEVICE_ID,
		(unsigned)snap->transaction_attempts,
		health_field_or_null(registration_state_buf, sizeof(registration_state_buf),
				      snap->registration_valid,
				      (int32_t)snap->registration_state),
		health_field_or_null(http_status_buf, sizeof(http_status_buf),
				      snap->http_status_valid,
				      snap->http_status),
		health_field_or_null(temp_buf, sizeof(temp_buf),
				      snap->temperature.valid,
				      snap->temperature.temp_mC),
		health_field_or_null(rsrp_buf, sizeof(rsrp_buf),
				      snap->rsrp_valid, snap->rsrp_dbm),
		health_field_or_null(rsrq_buf, sizeof(rsrq_buf),
				      snap->rsrq_valid, snap->rsrq_db),
		health_field_or_null(snr_buf, sizeof(snr_buf),
				      snap->snr_valid, snap->snr_db),
		health_field_or_null_u32(cell_buf, sizeof(cell_buf),
					 snap->serving_cell_valid,
					 snap->serving_cell_id),
		health_field_or_null(band_buf, sizeof(band_buf),
				      snap->serving_band_valid,
				      snap->serving_band),
		health_field_or_null(psm_tau_buf, sizeof(psm_tau_buf),
				      snap->psm_valid, snap->psm_tau_s),
		health_field_or_null(psm_active_buf, sizeof(psm_active_buf),
				      snap->psm_valid,
				      snap->psm_active_time_s),
		health_field_or_null(batt_uv_buf, sizeof(batt_uv_buf),
				      snap->battery_valid,
				      snap->battery_voltage_uV),
		health_field_or_null(batt_soc_buf, sizeof(batt_soc_buf),
				      snap->battery_valid,
				      (int32_t)snap->battery_soc_pct),
		https_succeeded_str);

	if (health_body_len < 0 || health_body_len >= sizeof(health_body)) {
		LOG_ERR("health_report request body buffer too small");
		return -ENOMEM;
	}

	static char health_request[1024];
	int health_request_len;

	health_request_len = snprintk(health_request, sizeof(health_request),
		"POST / HTTP/1.1\r\n"
		"Host: fairway-button-receiver-936892386735.us-central1.run.app\r\n"
		"Content-Type: application/json\r\n"
		"X-Fairway-Device-Key: " FAIRWAY_DEVICE_KEY "\r\n"
		"Content-Length: %d\r\n"
		"Connection: close\r\n"
		"\r\n"
		"%s",
		health_body_len,
		health_body);

	if (health_request_len < 0 || health_request_len >= sizeof(health_request)) {
		LOG_ERR("health_report request buffer too small");
		return -ENOMEM;
	}

	return send_http_request(health_request, health_request_len, attempt_deadline_ms, snap, true);
}

/* Owns all network/time/health background work. Blocks on local_hw_ready_sem
 * until main() has finished local button/LED hardware setup, then performs
 * the one-time modem/PSM/cert/connect sequence, then services
 * lte_registered_pending / date_time_valid_pending / a freshly-parsed
 * effective_config deadline / the scheduled-health timer for the process
 * lifetime. Never touches button_wake_pending, button_wake_sem, or
 * button_health_snapshot, and never itself performs HTTP work: a due health
 * cycle is only ever executed by transaction_thread.
 */
static void network_health_thread_entry(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);
	int ret;

	k_sem_take(&local_hw_ready_sem, K_FOREVER);

	LOG_INF("Initializing modem library");
	ret = nrf_modem_lib_init();
	if (ret) {
		LOG_ERR("Modem library init failed: %d", ret);
	} else {
		LOG_INF("Modem library init succeeded");
		modem_ready = true;

		configure_psm();

		ret = provision_fairway_ca_certificate();
		if (ret) {
			LOG_ERR("Cloud Run CA certificate provisioning failed: %d", ret);
		} else {
			LOG_INF("Cloud Run CA certificate ready");
		}

		LOG_INF("Starting LTE connection (asynchronous)");
		ret = lte_lc_connect_async(lte_evt_handler);
		if (ret) {
			LOG_ERR("lte_lc_connect_async failed: %d", ret);
			LOG_WRN("Continuing without an LTE connection attempt in progress; "
				"the golfer path remains available and any request made "
				"before connectivity is established reaches bounded FAILURE");
		} else {
			LOG_INF("LTE connection attempt started; registration reported asynchronously");
		}
	}

	while (1) {
		int64_t pending_deadline_unix_ms;

		if (!lte_registered_pending && !date_time_valid_pending &&
		    !health_wake_pending) {
			k_sem_take(&network_wake_sem, K_FOREVER);
		}

		if (pending_deadline_take(&pending_deadline_unix_ms)) {
			LOG_INF("HEALTH_SCHEDULE: applying deadline received from a request flow");
			health_schedule_apply_deadline(pending_deadline_unix_ms);
			continue;
		}

		if (lte_registered_pending) {
			lte_registered_pending = false;

			wait_for_authoritative_time();

			/* One-time, non-blocking DNS pre-warm: never waited on here. */
			dns_kickoff_if_idle();

			LOG_INF("HEALTH_SCHEDULE: boot bootstrap due");
			sched_ctl_set_health_due();
			k_sem_give(&txn_wake_sem);
			continue;
		}

		if (date_time_valid_pending) {
			date_time_valid_pending = false;

			/* Sole place cached_next_health_report_at_ms is read/armed
			 * from on this path -- network_health_thread only, per
			 * date_time_evt_handler()'s signal-only design above.
			 */
			if (cached_next_health_report_at_ms >= 0) {
				LOG_INF("DATE_TIME_WAKE: authoritative UTC available, arming cached deadline");
				health_schedule_apply_deadline(cached_next_health_report_at_ms);
			}
			continue;
		}

		if (health_wake_pending) {
			health_wake_pending = false;

			LOG_INF("HEALTH_WAKE detected");
			sched_ctl_set_health_due();
			k_sem_give(&txn_wake_sem);
			continue;
		}
	}
}
K_THREAD_DEFINE(network_health_thread, CONFIG_MAIN_STACK_SIZE,
		network_health_thread_entry, NULL, NULL, NULL,
		NETWORK_HEALTH_THREAD_PRIORITY, 0, 0);

/* Golfer-first transaction scheduler: the sole owner of the shared product
 * network transport (DNS/socket/TLS/HTTP) for both the golfer and Health
 * flows, one at a time. A golfer press always takes priority: it is picked
 * up before any pending Health cycle, and an active Health cycle yields
 * (aborts, re-arms itself as still due) as soon as one is accepted -- see
 * run_health_cycle()'s golfer_txn_is_pending() checks.
 */
static void transaction_thread_entry(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);

	while (1) {
		uint32_t gen;
		int64_t deadline_ms;
		bool have_golfer = golfer_txn_pickup(&gen, &deadline_ms);
		bool have_health = !have_golfer && sched_ctl_take_health_due();

		if (!have_golfer && !have_health) {
			k_sem_take(&txn_wake_sem, K_FOREVER);
			continue;
		}

		if (have_golfer) {
			sched_ctl_set_state(TXN_GOLFER_ACTIVE);

			int ret = run_golfer_transaction(deadline_ms);

			golfer_txn_complete(gen, ret == 0);
			k_sem_give(&button_wake_sem);

			sched_ctl_set_state(TXN_IDLE);
			continue;
		}

		sched_ctl_set_state(TXN_HEALTH_ACTIVE);

		enum health_cycle_result r = run_health_cycle();

		sched_ctl_set_state(r == HEALTH_CYCLE_ABORTED ? TXN_GOLFER_PENDING : TXN_IDLE);
	}
}
K_THREAD_DEFINE(transaction_thread, CONFIG_MAIN_STACK_SIZE,
		transaction_thread_entry, NULL, NULL, NULL,
		TRANSACTION_THREAD_PRIORITY, 0, 0);

int main(void)
{
	int ret;

	if (!device_is_ready(uart0_dev)) {
		return 0;
	}

	ret = pm_device_runtime_enable(uart0_dev);
	if (ret < 0) {
		LOG_ERR("UART runtime PM initialization failed: %d", ret);
		return 0;
	}

	if (!device_is_ready(i2c2_dev)) {
		LOG_ERR("I2C2 device is not ready");
		return 0;
	}

	ret = pm_device_runtime_enable(i2c2_dev);
	if (ret < 0) {
		LOG_ERR("I2C2 runtime PM initialization failed: %d", ret);
		return 0;
	}

	ret = configure_buck2_power_policy();
	if (ret < 0) {
		LOG_ERR("BUCK2 power policy initialization failed: %d", ret);
		return 0;
	}

	LOG_INF("Fairway Refresh state-machine feedback test starting");

	/* Local hardware first: button/LED GPIO, callback, and interrupt are
	 * configured and armed, and this thread reaches its event loop,
	 * before any modem/network call is made -- the golfer button is live
	 * regardless of what network_health_thread does next or how long it
	 * takes.
	 */
	if (!device_is_ready(gpio0_dev)) {
		LOG_ERR("GPIO0 device is not ready");
		return 0;
	}

	ret = gpio_pin_configure(gpio0_dev, BUTTON_PIN, GPIO_INPUT | GPIO_PULL_UP);
	if (ret < 0) {
		LOG_ERR("Failed to configure button GPIO P0.%d: %d", BUTTON_PIN, ret);
		return 0;
	}

	ret = gpio_pin_configure(gpio0_dev, RING_LED_PIN, GPIO_OUTPUT_INACTIVE);
	if (ret < 0) {
		LOG_ERR("Failed to configure LED ring GPIO P0.%d: %d", RING_LED_PIN, ret);
		return 0;
	}

	gpio_init_callback(&button_cb, button_pressed_cb, BIT(BUTTON_PIN));
	ret = gpio_add_callback(gpio0_dev, &button_cb);
	if (ret < 0) {
		LOG_ERR("Failed to add button GPIO callback: %d", ret);
		return 0;
	}

	ret = gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_EDGE_FALLING);
	if (ret < 0) {
		LOG_ERR("Failed to configure button GPIO interrupt: %d", ret);
		return 0;
	}

	ring_flash(STARTUP_FLASH_COUNT, STARTUP_FLASH_ON_MS, STARTUP_FLASH_OFF_MS);

	set_state(STATE_IDLE);

	/* Releases network_health_thread to begin modem/PSM/cert/LTE work.
	 * This is the only interaction between the two threads at boot; this
	 * thread never waits on anything from network_health_thread.
	 */
	k_sem_give(&local_hw_ready_sem);

	LOG_INF("Ready. Waiting in low-power idle for button wake.");

	while (1) {
		low_power_idle();

		if (!button_wake_pending) {
			continue;
		}
		button_wake_pending = false;

		LOG_INF("BUTTON_WAKE detected");

		/* Keep switch bounce from queuing a second press during the
		 * active transaction; re-armed only after terminal feedback
		 * plus BUTTON_REARM_SETTLE_MS below.
		 */
		gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_DISABLE);

		/* Architect Correction 1: the hard 15-second deadline begins
		 * at acceptance, before the acknowledgement animation runs.
		 */
		int64_t accept_time_ms = k_uptime_get();
		int64_t deadline_ms = accept_time_ms + GOLFER_TRANSACTION_BUDGET_MS;
		uint32_t my_gen = golfer_txn_accept(deadline_ms);

		set_state(STATE_TRANSMITTING);

		/* Canonical local acknowledgement begins here (the LED
		 * physically turns on) -- strictly before the scheduler is
		 * released, so network/transaction work can never start
		 * ahead of the golfer's visible acknowledgement. The
		 * 15-second deadline above is unaffected: it was already
		 * fixed at acceptance, not here.
		 */
		ring_on();
		k_sem_give(&txn_wake_sem);

		/* Completes the existing 3-flash acknowledgement pattern; its
		 * own first ring_on() is a harmless redundant write (the LED
		 * is already on), so the golfer-visible pattern/timing is
		 * unchanged, it now simply runs concurrently with the
		 * transaction that was just released above.
		 */
		show_transmitting_feedback();

		bool got_result = false;
		bool success = false;

		while (1) {
			int64_t remaining_ms = deadline_ms - k_uptime_get();

			if (remaining_ms <= 0) {
				break;
			}
			if (k_sem_take(&button_wake_sem, K_MSEC(remaining_ms)) != 0) {
				break;
			}
			if (golfer_txn_check_done(my_gen, &success)) {
				got_result = true;
				break;
			}
			/* Spurious wake (e.g. a completion signal for an
			 * already-expired generation): keep waiting within the
			 * same bounded deadline.
			 */
		}

		if (got_result && success) {
			set_state(STATE_SUCCESS);
			show_success_feedback();
		} else {
			/* Local defensive deadline (Architect Correction):
			 * guarantees a terminal disposition even in the
			 * unforeseen case that transaction_thread itself does
			 * not report back in time.
			 */
			set_state(STATE_FAILURE);
			show_failure_feedback();
		}

		k_sleep(K_MSEC(BUTTON_REARM_SETTLE_MS));
		gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_EDGE_FALLING);
		set_state(STATE_IDLE);
		ring_off();
	}

	return 0;
}
