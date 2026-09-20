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
static int send_https_test(int64_t attempt_deadline_ms);
static int send_health_report_request(int64_t attempt_deadline_ms);
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

#define REQUEST_MAX_ATTEMPTS        3
#define REQUEST_ATTEMPT_TIMEOUT_MS  30000
#define REQUEST_LOCKOUT_MS \
	(REQUEST_MAX_ATTEMPTS * REQUEST_ATTEMPT_TIMEOUT_MS)

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

typedef enum {
	WAKE_CAUSE_NONE = 0,
	WAKE_CAUSE_BUTTON,
} wake_cause_t;

static app_state_t state = STATE_IDLE;
static volatile bool button_wake_pending;
static volatile bool health_wake_pending;
static volatile bool date_time_valid_pending;
static volatile bool request_lockout_active;
static volatile int64_t request_lockout_deadline_ms;
static struct gpio_callback button_cb;
static struct gpio_callback vbus_cb;
static K_SEM_DEFINE(wake_sem, 0, 1);

#define HEALTH_REPORT_MAX_ATTEMPTS        2
#define HEALTH_REPORT_ATTEMPT_TIMEOUT_MS  30000
#define HEALTH_REPORT_RETRY_WINDOW_MS     90000

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
	 * network/LTE/health-acquisition work happens later in thread context.
	 */
	health_wake_pending = true;
	k_sem_give(&wake_sem);
}

K_TIMER_DEFINE(health_timer, health_timer_expiry, NULL);

/* date_time library event handler (Correction 1, cross-thread-safe by
 * construction): runs on the date_time library's own callback thread, and
 * deliberately never reads or writes cached_next_health_report_at_ms or
 * calls health_schedule_apply_deadline() itself -- doing so from this
 * thread would risk a torn read/write of that 64-bit value racing against
 * the main thread. Instead this handler only signals: it releases the
 * bounded boot wait below, and (on any obtained event) sets
 * date_time_valid_pending and gives the shared wake_sem so the main thread
 * -- the sole owner of the cached deadline and the timer -- applies it.
 * date_time_register_handler() only allows one globally registered
 * handler, and this one stays registered for the process lifetime (via the
 * one date_time_update_async() call in wait_for_authoritative_time()), so
 * it also fires on every later periodic CONFIG_DATE_TIME_AUTO_UPDATE
 * re-sync, not just at boot.
 */
static void date_time_evt_handler(const struct date_time_evt *evt)
{
	k_sem_give(&date_time_sem);

	if (evt->type != DATE_TIME_NOT_OBTAINED) {
		date_time_valid_pending = true;
		k_sem_give(&wake_sem);
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

static struct health_cellular_snapshot health_snapshot;

/* Reads the installed Adafruit 5580 / MAX17048 via the native NCS fuel-gauge
 * API into the Device Health snapshot. Leaves battery_valid false on any
 * failure rather than reporting a stale or invented value.
 */
static void health_battery_read(void)
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

	health_snapshot.battery_valid = true;
	health_snapshot.battery_voltage_uV = vals[0].voltage;
	health_snapshot.battery_soc_pct = vals[1].relative_state_of_charge;
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

	int64_t now_ms = k_uptime_get();
	if (request_lockout_active) {
		if (now_ms < request_lockout_deadline_ms) {
			return;
		}
		request_lockout_active = false;
	}

	if (!button_is_pressed()) {
		return;
	}

	request_lockout_active = true;
	request_lockout_deadline_ms = now_ms + REQUEST_LOCKOUT_MS;
	button_wake_pending = true;
	k_sem_give(&wake_sem);
}

#if defined(CONFIG_LTE_LC_MODEM_SLEEP_MODULE)
/* Diagnostic-only: observes PSM grant and actual modem sleep enter/exit. */
static void lte_diag_evt_handler(const struct lte_lc_evt *const evt)
{
	switch (evt->type) {
	case LTE_LC_EVT_PSM_UPDATE:
		health_snapshot.psm_valid = true;
		health_snapshot.psm_tau_s = evt->psm_cfg.tau;
		health_snapshot.psm_active_time_s = evt->psm_cfg.active_time;
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
	default:
		break;
	}
}
#endif /* CONFIG_LTE_LC_MODEM_SLEEP_MODULE */

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
	/* button_wake_pending / health_wake_pending are left set here; the
	 * outer loop in main() is the single point that clears each flag and
	 * invokes its corresponding flow.
	 */
	k_sem_take(&wake_sem, K_FOREVER);
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

/* Sends the current authenticated LTE/HTTPS request within the attempt deadline. */
static int send_fairway_request(int64_t attempt_deadline_ms)
{
	int ret;

	LOG_INF("Fairway HTTPS request send started");

	ret = send_https_test(attempt_deadline_ms);
	health_snapshot.https_result_valid = true;
	health_snapshot.https_succeeded = (ret == 0);
	if (ret) {
		LOG_ERR("Fairway HTTPS request send failed: %d", ret);
		return ret;
	}

	LOG_INF("Fairway HTTPS request send complete: success");

	return 0;
}

/* Resets and reacquires the Device Health snapshot (temperature, battery,
 * connection-evaluation radio metrics), preserving registration/PSM state
 * exactly as before. Shared by the golfer button flow and the scheduled
 * health_report flow so both report the same underlying measurements.
 */
static void health_snapshot_acquire(void)
{
	struct lte_lc_conn_eval_params conn_eval = {0};
	int temperature_ret;
	int ret;

	health_snapshot = (struct health_cellular_snapshot){
		.registration_valid = health_snapshot.registration_valid,
		.registration_state = health_snapshot.registration_state,
		.psm_valid = health_snapshot.psm_valid,
		.psm_tau_s = health_snapshot.psm_tau_s,
		.psm_active_time_s = health_snapshot.psm_active_time_s,
	};

	temperature_ret = health_temperature_read(&health_snapshot.temperature);
	if (temperature_ret) {
		LOG_WRN("Device temperature unavailable: %d", temperature_ret);
	}

	health_battery_read();

	ret = lte_lc_conn_eval_params_get(&conn_eval);
	health_snapshot.conn_eval_error = ret;
	if (ret == 0) {
		health_snapshot.conn_eval_valid = true;
		if (conn_eval.rsrp != LTE_LC_CELL_RSRP_INVALID) {
			health_snapshot.rsrp_valid = true;
			health_snapshot.rsrp_dbm = RSRP_IDX_TO_DBM(conn_eval.rsrp);
		}
		if (conn_eval.rsrq != LTE_LC_CELL_RSRQ_INVALID) {
			health_snapshot.rsrq_valid = true;
			health_snapshot.rsrq_db = RSRQ_IDX_TO_DB(conn_eval.rsrq);
		}
		if (conn_eval.snr != 127) {
			health_snapshot.snr_valid = true;
			health_snapshot.snr_db = SNR_IDX_TO_DB(conn_eval.snr);
		}
		if (conn_eval.cell_id != 0) {
			health_snapshot.serving_cell_valid = true;
			health_snapshot.serving_cell_id = conn_eval.cell_id;
		}
		if (conn_eval.band != 0) {
			health_snapshot.serving_band_valid = true;
			health_snapshot.serving_band = conn_eval.band;
		}
	} else {
		LOG_WRN("Connection evaluation unavailable: %d", ret);
	}
}

static void run_request_flow(void)
{
	int ret = -ETIMEDOUT;

	health_snapshot_acquire();

	set_state(STATE_TRANSMITTING);
	show_transmitting_feedback();

	for (size_t attempt = 0; attempt < REQUEST_MAX_ATTEMPTS; attempt++) {
		health_snapshot.transaction_attempts = attempt + 1;
		int64_t now_ms = k_uptime_get();
		int64_t attempts_remaining = REQUEST_MAX_ATTEMPTS - attempt;
		int64_t reserved_for_later =
			(attempts_remaining - 1) * REQUEST_ATTEMPT_TIMEOUT_MS;
		int64_t attempt_deadline = MIN(
			now_ms + REQUEST_ATTEMPT_TIMEOUT_MS,
			request_lockout_deadline_ms - reserved_for_later);

		if (attempt_deadline <= now_ms) {
			break;
		}

		ret = send_fairway_request(attempt_deadline);
		if (ret == 0 || ret == -EACCES) {
			break;
		}
	}

	if (ret == 0) {
		set_state(STATE_SUCCESS);
		show_success_feedback();
	} else {
		set_state(STATE_FAILURE);
		show_failure_feedback();
	}

	LOG_INF("Health snapshot: attempts=%u https=%d http=%d temp_valid=%d temp_mC=%d conn_eval=%d rsrp=%d rsrq=%d snr=%d cell=%u band=%d batt_valid=%d batt_uV=%d batt_soc=%u",
		health_snapshot.transaction_attempts,
		health_snapshot.https_succeeded,
		health_snapshot.http_status,
		health_snapshot.temperature.valid,
		health_snapshot.temperature.temp_mC,
		health_snapshot.conn_eval_valid,
			(int32_t)(health_snapshot.rsrp_valid ? health_snapshot.rsrp_dbm : INT32_MIN),
			(int32_t)(health_snapshot.rsrq_valid ? health_snapshot.rsrq_db : INT32_MIN),
			(int32_t)(health_snapshot.snr_valid ? health_snapshot.snr_db : INT32_MIN),
		health_snapshot.serving_cell_valid ? health_snapshot.serving_cell_id : 0,
		health_snapshot.serving_band_valid ? health_snapshot.serving_band : 0,
		health_snapshot.battery_valid,
		health_snapshot.battery_valid ? health_snapshot.battery_voltage_uV : 0,
		health_snapshot.battery_valid ? health_snapshot.battery_soc_pct : 0U);

	set_state(STATE_IDLE);
	ring_off();
}

/* Sends the scheduled health_report within its own two-attempt retry policy
 * (see FIRMWARE_SPECIFICATION.md "Device Health Transport and Scheduling"):
 * distinct from, and does not modify, REQUEST_MAX_ATTEMPTS/
 * REQUEST_ATTEMPT_TIMEOUT_MS used by the golfer button flow.
 */
static int send_health_report(int64_t attempt_deadline_ms)
{
	int ret;

	LOG_INF("Scheduled health_report send started");

	ret = send_health_report_request(attempt_deadline_ms);
	health_snapshot.https_result_valid = true;
	health_snapshot.https_succeeded = (ret == 0);
	if (ret) {
		LOG_ERR("Scheduled health_report send failed: %d", ret);
		return ret;
	}

	LOG_INF("Scheduled health_report send complete: success");

	return 0;
}

/* Runs one scheduled Device Health reporting cycle: initial attempt plus at
 * most one retry, the retry occurring within HEALTH_REPORT_RETRY_WINDOW_MS
 * of the cycle start. After the second failure this stops entirely -- no
 * third attempt and no ad-hoc follow-up retry schedule is created. This same
 * function also serves as the boot bootstrap communication (see
 * bootstrap_health_schedule()), since the bootstrap and scheduled-health
 * retry envelopes are identical (2 attempts, retry within 90 seconds).
 *
 * Deliberately does not touch app_state_t/the LED ring: scheduled health
 * reporting is a silent background operation, not golfer-facing UX.
 */
static void run_health_report_flow(void)
{
	int ret = -ETIMEDOUT;
	int64_t cycle_start_ms = k_uptime_get();

	health_snapshot_acquire();

	for (int attempt = 0; attempt < HEALTH_REPORT_MAX_ATTEMPTS; attempt++) {
		int64_t now_ms = k_uptime_get();
		int64_t attempt_deadline = MIN(now_ms + HEALTH_REPORT_ATTEMPT_TIMEOUT_MS,
						cycle_start_ms + HEALTH_REPORT_RETRY_WINDOW_MS);

		health_snapshot.transaction_attempts = attempt + 1;

		if (attempt_deadline <= now_ms) {
			break;
		}

		ret = send_health_report(attempt_deadline);
		if (ret == 0 || ret == -EACCES) {
			break;
		}
	}

	LOG_INF("Scheduled health report cycle complete: attempts=%u https=%d http=%d result=%d",
		health_snapshot.transaction_attempts,
		health_snapshot.https_succeeded,
		health_snapshot.http_status,
		ret);
}

/* Boot/reset bootstrap: attempts to obtain valid effective configuration
 * (and, via health_schedule_apply_deadline(), arm the first scheduled-health
 * wake) using the same 2-attempt/90-second envelope as an ordinary scheduled
 * report. After a second bootstrap failure, no autonomous hourly or ad-hoc
 * retry is scheduled; the device simply remains available for golfer button
 * presses, and a later successful authenticated communication (button or
 * scheduled health) may still refresh the schedule.
 */
static void bootstrap_health_schedule(void)
{
	LOG_INF("HEALTH_SCHEDULE: boot bootstrap starting (date_time_is_valid=%d)",
		date_time_is_valid());

	run_health_report_flow();

	LOG_INF("HEALTH_SCHEDULE: boot bootstrap complete, cached_next_health_report_at_ms=%lld",
		(long long)cached_next_health_report_at_ms);
}

static void bounded_recovery_delay(int attempt)
{
	int delay_s = 2 + (attempt * 2);

	if (delay_s > 30) {
		delay_s = 30;
	}

	LOG_INF("Low-power recovery backoff: %d seconds", delay_s);
	k_sleep(K_SECONDS(delay_s));
}

static int wait_for_lte_registration(void)
{
	int ret;
	enum lte_lc_nw_reg_status status = LTE_LC_NW_REG_UNKNOWN;

	LOG_INF("Connecting to LTE-M network");

	ret = lte_lc_connect();
	if (ret) {
		LOG_ERR("lte_lc_connect failed: %d", ret);
		return ret;
	}

	while (1) {
		ret = lte_lc_nw_reg_status_get(&status);
		if (ret) {
			LOG_ERR("lte_lc_nw_reg_status_get failed: %d", ret);
			return ret;
		}

		health_snapshot.registration_valid = true;
		health_snapshot.registration_state = status;

		if (status == LTE_LC_NW_REG_REGISTERED_HOME) {
			LOG_INF("LTE registered: home network");
			return 0;
		}

		if (status == LTE_LC_NW_REG_REGISTERED_ROAMING) {
			LOG_INF("LTE registered: roaming network");
			return 0;
		}

		LOG_INF("Waiting for LTE registration, status: %d", status);
		k_sleep(K_SECONDS(15));
	}
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

/* Shared authenticated HTTPS transport primitive for both the golfer
 * button_press flow and the scheduled health_report flow. Connects fresh,
 * sends the pre-built request, and reads a single response into recv_buf.
 * Populates the shared health_snapshot http_status fields exactly as
 * before (status-line only), and additionally applies a fresh
 * effective_config from the response body when the response is a
 * successful (2xx) one -- this is the one shared config-refresh path for
 * both event types described in FIRMWARE_SPECIFICATION.md "Device Health
 * Transport and Scheduling".
 *
 * Return value convention (unchanged from the pre-WP4 button-only
 * behavior):
 *   0        HTTP 2xx.
 *   -EACCES  HTTP 400/401/403/404 (terminal; caller does not retry).
 *   -EPROTO  Any other received-but-unsuccessful HTTP response.
 *   -errno   No response could be obtained at all (connect/send/recv/
 *            timeout failure).
 */
static int send_http_request(const char *request, int request_len,
			      int64_t attempt_deadline_ms)
{
	int fd;
	int ret;
	int remaining_ms;
	struct timeval timeout;

	struct zsock_addrinfo hints = {
		.ai_family = AF_INET,
		.ai_socktype = SOCK_STREAM,
	};

	struct zsock_addrinfo *res = NULL;

	const char *host = "fairway-button-receiver-936892386735.us-central1.run.app";

	static char recv_buf[4096];

	int verify = TLS_PEER_VERIFY_REQUIRED;
	sec_tag_t sec_tag_list[] = { FAIRWAY_TLS_SEC_TAG };

	LOG_INF("Sending HTTPS request to Cloud Run");
	remaining_ms = attempt_deadline_ms - k_uptime_get();
	if (remaining_ms <= CONFIG_NET_SOCKETS_CONNECT_TIMEOUT) {
		return -ETIMEDOUT;
	}

	ret = zsock_getaddrinfo(host, "443", &hints, &res);
	if (ret != 0) {
		LOG_ERR("HTTPS zsock_getaddrinfo failed: %d", ret);
		return ret;
	}

	remaining_ms = attempt_deadline_ms - k_uptime_get();
	if (remaining_ms <= CONFIG_NET_SOCKETS_CONNECT_TIMEOUT) {
		zsock_freeaddrinfo(res);
		return -ETIMEDOUT;
	}

	fd = zsock_socket(res->ai_family, res->ai_socktype, IPPROTO_TLS_1_2);
	if (fd < 0) {
		ret = -errno;
		LOG_ERR("HTTPS zsock_socket failed: errno %d", errno);
		zsock_freeaddrinfo(res);
		return ret;
	}

	ret = zsock_setsockopt(fd, SOL_TLS, TLS_PEER_VERIFY,
			       &verify, sizeof(verify));
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS TLS_PEER_VERIFY failed: errno %d", errno);
		zsock_close(fd);
		zsock_freeaddrinfo(res);
		return ret;
	}

	timeout.tv_sec = remaining_ms / 1000;
	timeout.tv_usec = (remaining_ms % 1000) * 1000;
	ret = zsock_setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO,
			       &timeout, sizeof(timeout));
	if (ret < 0) {
		ret = -errno;
		zsock_close(fd);
		zsock_freeaddrinfo(res);
		return ret;
	}

	ret = zsock_setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO,
			       &timeout, sizeof(timeout));
	if (ret < 0) {
		ret = -errno;
		zsock_close(fd);
		zsock_freeaddrinfo(res);
		return ret;
	}

	ret = zsock_setsockopt(fd, SOL_TLS, TLS_SEC_TAG_LIST,
			       sec_tag_list, sizeof(sec_tag_list));
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS TLS_SEC_TAG_LIST failed: errno %d", errno);
		zsock_close(fd);
		zsock_freeaddrinfo(res);
		return ret;
	}

	ret = zsock_setsockopt(fd, SOL_TLS, TLS_HOSTNAME,
			       host, strlen(host));
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS TLS_HOSTNAME failed: errno %d", errno);
		zsock_close(fd);
		zsock_freeaddrinfo(res);
		return ret;
	}

	LOG_INF("Connecting to %s:443", host);

	ret = zsock_connect(fd, res->ai_addr, res->ai_addrlen);
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS zsock_connect failed: errno %d", errno);
		zsock_close(fd);
		zsock_freeaddrinfo(res);
		return ret;
	}

	LOG_INF("HTTPS socket connected");

	ret = zsock_send(fd, request, request_len, 0);
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS zsock_send failed: errno %d", errno);
		zsock_close(fd);
		zsock_freeaddrinfo(res);
		return ret;
	}

	LOG_INF("HTTPS request sent: %d bytes", ret);

	ret = zsock_recv(fd, recv_buf, sizeof(recv_buf) - 1, 0);
	if (ret < 0) {
		ret = -errno;
		LOG_ERR("HTTPS zsock_recv failed: errno %d", errno);
		zsock_close(fd);
		zsock_freeaddrinfo(res);
		return ret;
	}

	recv_buf[ret] = '\0';
	LOG_INF("HTTPS response received: %d bytes", ret);
	LOG_INF("HTTPS response preview: %.80s", recv_buf);

	int http_status = 0;
	health_snapshot.http_status_valid =
		sscanf(recv_buf, "HTTP/%*u.%*u %d", &http_status) == 1;
	health_snapshot.http_status = http_status;

	if (health_snapshot.http_status_valid &&
	    http_status >= 200 && http_status < 300) {
		char *body = strstr(recv_buf, "\r\n\r\n");

		if (body != NULL) {
			body += 4;

			size_t body_len = (size_t)ret - (size_t)(body - recv_buf);
			int64_t new_deadline_unix_ms;

			if (health_schedule_parse_effective_config(body, body_len,
								    &new_deadline_unix_ms)) {
				health_schedule_apply_deadline(new_deadline_unix_ms);
			}
		}
	}

	if (!health_snapshot.http_status_valid ||
	    http_status < 200 || http_status >= 300) {
		zsock_close(fd);
		zsock_freeaddrinfo(res);
		return (http_status == 400 || http_status == 401 ||
			http_status == 403 || http_status == 404) ? -EACCES : -EPROTO;
	}

	zsock_close(fd);
	zsock_freeaddrinfo(res);

	LOG_INF("Cloud Run HTTPS request succeeded");
	return 0;
}

static int send_https_test(int64_t attempt_deadline_ms)
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

	return send_http_request(request, request_len, attempt_deadline_ms);
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
static int send_health_report_request(int64_t attempt_deadline_ms)
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

	if (health_snapshot.https_result_valid) {
		https_succeeded_str = health_snapshot.https_succeeded ? "true" : "false";
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
		(unsigned)health_snapshot.transaction_attempts,
		health_field_or_null(registration_state_buf, sizeof(registration_state_buf),
				      health_snapshot.registration_valid,
				      (int32_t)health_snapshot.registration_state),
		health_field_or_null(http_status_buf, sizeof(http_status_buf),
				      health_snapshot.http_status_valid,
				      health_snapshot.http_status),
		health_field_or_null(temp_buf, sizeof(temp_buf),
				      health_snapshot.temperature.valid,
				      health_snapshot.temperature.temp_mC),
		health_field_or_null(rsrp_buf, sizeof(rsrp_buf),
				      health_snapshot.rsrp_valid, health_snapshot.rsrp_dbm),
		health_field_or_null(rsrq_buf, sizeof(rsrq_buf),
				      health_snapshot.rsrq_valid, health_snapshot.rsrq_db),
		health_field_or_null(snr_buf, sizeof(snr_buf),
				      health_snapshot.snr_valid, health_snapshot.snr_db),
		health_field_or_null_u32(cell_buf, sizeof(cell_buf),
					 health_snapshot.serving_cell_valid,
					 health_snapshot.serving_cell_id),
		health_field_or_null(band_buf, sizeof(band_buf),
				      health_snapshot.serving_band_valid,
				      health_snapshot.serving_band),
		health_field_or_null(psm_tau_buf, sizeof(psm_tau_buf),
				      health_snapshot.psm_valid, health_snapshot.psm_tau_s),
		health_field_or_null(psm_active_buf, sizeof(psm_active_buf),
				      health_snapshot.psm_valid,
				      health_snapshot.psm_active_time_s),
		health_field_or_null(batt_uv_buf, sizeof(batt_uv_buf),
				      health_snapshot.battery_valid,
				      health_snapshot.battery_voltage_uV),
		health_field_or_null(batt_soc_buf, sizeof(batt_soc_buf),
				      health_snapshot.battery_valid,
				      (int32_t)health_snapshot.battery_soc_pct),
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

	return send_http_request(health_request, health_request_len, attempt_deadline_ms);
}

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

	LOG_INF("Initializing modem library");

	ret = nrf_modem_lib_init();
	if (ret) {
		LOG_ERR("Modem library init failed: %d", ret);
	} else {
		LOG_INF("Modem library init succeeded");
		modem_ready = true;

#if defined(CONFIG_LTE_LC_MODEM_SLEEP_MODULE)
		lte_lc_register_handler(lte_diag_evt_handler);
#endif

		configure_psm();

		ret = provision_fairway_ca_certificate();
		if (ret) {
			LOG_ERR("Cloud Run CA certificate provisioning failed: %d", ret);
		} else {
			LOG_INF("Cloud Run CA certificate ready");
		}

		ret = wait_for_lte_registration();
		if (ret) {
			LOG_ERR("LTE registration failed: %d", ret);
			bounded_recovery_delay(1);
		} else {
			LOG_INF("LTE registration succeeded");
			LOG_INF("Network ready. GPIO wake path active.");

			wait_for_authoritative_time();
			bootstrap_health_schedule();
		}
	}

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

	LOG_INF("Ready. Waiting in low-power idle for button wake.");

	while (1) {
		/* Skip the blocking wait if a wake is already pending from a prior
		 * iteration. The shared wake_sem has a max count of 1, so a
		 * coincident button press, scheduled-health timer expiry, and/or
		 * date_time event can coalesce into a single semaphore give;
		 * checking all flags here (rather than unconditionally blocking
		 * again) ensures a second pending flow is never silently lost.
		 */
		if (!button_wake_pending && !health_wake_pending && !date_time_valid_pending) {
			low_power_idle();
		}

		if (button_wake_pending) {
			button_wake_pending = false;

			LOG_INF("BUTTON_WAKE detected");
			LOG_INF("BUTTON_WAKE: invoking request flow");

			/* Keep switch bounce from queuing a second request during the flow. */
			gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_DISABLE);
			run_request_flow();
			gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_EDGE_FALLING);
			continue;
		}

		if (health_wake_pending) {
			health_wake_pending = false;

			LOG_INF("HEALTH_WAKE detected");
			LOG_INF("HEALTH_WAKE: invoking scheduled health report flow");

			run_health_report_flow();
			continue;
		}

		if (date_time_valid_pending) {
			date_time_valid_pending = false;

			/* Sole place cached_next_health_report_at_ms is read/armed from
			 * on this path -- main thread only, per date_time_evt_handler()'s
			 * signal-only design above.
			 */
			if (cached_next_health_report_at_ms >= 0) {
				LOG_INF("DATE_TIME_WAKE: authoritative UTC available, arming cached deadline");
				health_schedule_apply_deadline(cached_next_health_report_at_ms);
			}
			continue;
		}
	}

	return 0;
}