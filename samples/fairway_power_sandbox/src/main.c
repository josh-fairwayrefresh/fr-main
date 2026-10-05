/*
 * Fairway Refresh button-request state machine
 *
 * Confirmed hardware mappings (Monarch Bay Pilot final architecture; see
 * docs/HARDWARE_ASSEMBLY_GUIDE.md and docs/HARDWARE_BOM.md):
 *
 * PV8 switch:
 *   PV8 Lead 4 -> common GND rail
 *   PV8 Lead 1 -> Feather J1/5 -> nRF GPIO P0.31 -> Zephyr gpio0 pin 31
 *   PV8 Leads 2, 3 -> not connected
 *
 * Three indicator driver circuits (identical low-side 2N3904 topology per
 * color; GPIO drives the transistor base through 2.2 kOhm, base also has
 * 100 kOhm to common GND, emitter to common GND, collector to the
 * indicator's negative lead, indicator positive lead to the regulated
 * +5 V rail). GPIO logical 1 = indicator lit, logical 0 = indicator off
 * (unchanged active-level convention from the prior single-LED circuit,
 * reused as-is for all three pins -- same topology, same GPIO_OUTPUT_INACTIVE
 * configuration, no ACTIVE_LOW flag):
 *   Orange (SENDING)          -> Feather J1/6 -> nRF GPIO P0.30 -> gpio0 pin 30
 *   Green  (REQUEST RECEIVED) -> Feather J1/7 -> nRF GPIO P0.29 -> gpio0 pin 29
 *   Red    (TRY AGAIN)        -> Feather J1/8 -> nRF GPIO P0.28 -> gpio0 pin 28
 *
 * Approved Monarch Bay Pilot golfer UX (see docs/UX_SPECIFICATION.md,
 * "Final Monarch Bay Pilot Golfer UX"):
 *   Startup:
 *     Orange flashes 3 times
 *
 *   IDLE:
 *     All three indicators off
 *
 *   Valid press, no active demand window:
 *     Orange begins immediately and pulses for the unresolved transaction
 *     SUCCESS: orange off; green blink-blink then ~5 s solid; starts a local
 *       5-minute demand window from the original accepted press time
 *     FAILURE: orange off; red blink-blink then ~5 s solid; no demand window
 *     Return to IDLE
 *
 *   Valid press during an active 5-minute demand window:
 *     No orange, no new transaction, no new request; immediate green
 *     blink-blink then ~5 s solid; increments a local repeat-press counter
 *     on the originating transaction (preparatory state only; backend
 *     transport/persistence is a later work package, not implemented here)
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/mfd/npm13xx.h>
#include <zephyr/drivers/regulator.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/drivers/sensor/npm13xx_charger.h>
#include <zephyr/logging/log.h>
#include <zephyr/pm/device_runtime.h>
#include <stdbool.h>
#include <stdio.h>
#include <modem/nrf_modem_lib.h>
#include <modem/lte_lc.h>
#include <zephyr/net/socket.h>
#include <zephyr/posix/fcntl.h>
#include <zephyr/random/random.h>
#include <string.h>
#include <errno.h>
#include <stdint.h>
#include <modem/modem_key_mgmt.h>
#include <zephyr/net/tls_credentials.h>
#include "secrets/fairway_device_key.h"
#include "command_protocol.h"
#include "complete_poll.h"
#include "demand_window.h"
#include "http_response.h"
LOG_MODULE_REGISTER(main);
static int send_https_test(int64_t attempt_deadline_ms,
			   const char *transaction_id,
			   char *request_id, size_t request_id_len);
static int send_command_poll_request(const char *active_request_id,
				     struct fairway_complete_command *command,
				     int64_t attempt_deadline_ms);
static int send_command_ack_request(const struct fairway_complete_command *command,
				    int64_t attempt_deadline_ms);
static bool button_is_pressed(void);
static const struct device *gpio0_dev = DEVICE_DT_GET(DT_NODELABEL(gpio0));
static const struct device *uart0_dev = DEVICE_DT_GET(DT_CHOSEN(zephyr_console));
static const struct device *i2c2_dev = DEVICE_DT_GET(DT_NODELABEL(i2c2));
static const struct device *npm1300_pmic_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_pmic));
static const struct device *npm1300_charger_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_charger));
static const struct device *buck2_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_buck2));

#define BUTTON_PIN    31
#define ORANGE_PIN    30
#define GREEN_PIN     29
#define RED_PIN       28

#define GOLFER_TRANSACTION_BUDGET_MS      15000
#define GOLFER_MAX_ATTEMPTS               2
#define GOLFER_MIN_RETRY_RESERVE_MS       3000
#define GOLFER_DNS_READINESS_TIMEOUT_MS   3000
#define BUTTON_REARM_SETTLE_MS            250

#define STARTUP_FLASH_COUNT      3
#define STARTUP_FLASH_ON_MS      150
#define STARTUP_FLASH_OFF_MS     150

/* Continuous orange pulse cadence while a golfer transaction is unresolved;
 * reuses the previously validated initial-acknowledgement flash timing.
 */
#define ORANGE_PULSE_ON_MS       80
#define ORANGE_PULSE_OFF_MS      85

/* Shared green/red "blink-blink then solid" terminal feedback timing;
 * reuses the previously validated quick-flash cadence, just at count 2
 * ("blink-blink") instead of the superseded 3-blink pattern. */
#define FEEDBACK_BLINK_COUNT     2
#define FEEDBACK_BLINK_ON_MS     40
#define FEEDBACK_BLINK_OFF_MS    40
#define FEEDBACK_SOLID_MS        5000

#define DEMAND_WINDOW_MS         (5 * 60 * 1000)
#define COMMAND_HTTP_TIMEOUT_MS     12000
#define COMMAND_DNS_READINESS_TIMEOUT_MS  2000
#define COMMAND_YIELD_CONNECT_POLL_MS    3000
#define COMMAND_YIELD_IO_POLL_MS         2000

#define FAIRWAY_TLS_SEC_TAG 42
#define FAIRWAY_TRANSACTION_ID_LENGTH 32

static const char fairway_ca_cert[] = {
#include "certs/google-run-ca-chain-cstr.pem"
};

typedef enum {
	STATE_IDLE = 0,
	STATE_BUTTON_ACK,
	STATE_TRANSMITTING,
	STATE_SUCCESS,
	STATE_FAILURE,
	STATE_REPEAT_PRESS,
} app_state_t;

static K_SEM_DEFINE(button_wake_sem, 0, 1);
static K_SEM_DEFINE(txn_wake_sem, 0, 1);
static K_SEM_DEFINE(network_wake_sem, 0, 1);
static K_SEM_DEFINE(local_hw_ready_sem, 0, 1);
static K_SEM_DEFINE(dns_request_wake_sem, 0, 1);
static K_SEM_DEFINE(dns_result_sem, 0, 1);

#define TRANSACTION_THREAD_PRIORITY       1
#define TRANSACTION_THREAD_STACK_SIZE     3072
#define MODEM_SERVICE_THREAD_PRIORITY     2
#define DNS_RESOLVER_THREAD_PRIORITY      3

BUILD_ASSERT(CONFIG_MAIN_THREAD_PRIORITY < TRANSACTION_THREAD_PRIORITY,
	     "button thread must always outrank the transaction scheduler");
BUILD_ASSERT(TRANSACTION_THREAD_PRIORITY < MODEM_SERVICE_THREAD_PRIORITY,
	     "transaction scheduler must always outrank background maintenance");
BUILD_ASSERT(MODEM_SERVICE_THREAD_PRIORITY < DNS_RESOLVER_THREAD_PRIORITY,
	     "background maintenance must always outrank isolated helpers");

struct golfer_txn {
	uint32_t generation;
	int64_t deadline_ms;
	char transaction_id[FAIRWAY_TRANSACTION_ID_LENGTH + 1];
	bool pending;
	bool done;
	bool done_result_ok;
	uint32_t done_generation;
	char done_request_id[FAIRWAY_REQUEST_ID_MAX];
};
static struct golfer_txn golfer_txn;
static struct k_spinlock golfer_txn_lock;

static uint32_t golfer_txn_accept(int64_t deadline_ms)
{
	uint32_t random_words[4];
	char transaction_id[FAIRWAY_TRANSACTION_ID_LENGTH + 1];

	sys_rand_get(random_words, sizeof(random_words));
	snprintk(transaction_id, sizeof(transaction_id), "%08x%08x%08x%08x",
		random_words[0], random_words[1], random_words[2], random_words[3]);

	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);

	golfer_txn.generation++;
	uint32_t gen = golfer_txn.generation;

	golfer_txn.deadline_ms = deadline_ms;
	strcpy(golfer_txn.transaction_id, transaction_id);
	golfer_txn.pending = true;
	golfer_txn.done = false;
	k_spin_unlock(&golfer_txn_lock, key);
	return gen;
}

static bool golfer_txn_pickup(uint32_t *out_gen, int64_t *out_deadline_ms,
			      char *transaction_id)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);
	bool has = golfer_txn.pending;

	if (has) {
		golfer_txn.pending = false;
		*out_gen = golfer_txn.generation;
		*out_deadline_ms = golfer_txn.deadline_ms;
		strcpy(transaction_id, golfer_txn.transaction_id);
	}
	k_spin_unlock(&golfer_txn_lock, key);
	return has;
}

static bool golfer_txn_is_pending(void)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);
	bool pending = golfer_txn.pending;

	k_spin_unlock(&golfer_txn_lock, key);
	return pending;
}

static void golfer_txn_complete(uint32_t gen, bool success, const char *request_id)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);

	golfer_txn.done = true;
	golfer_txn.done_result_ok = success;
	golfer_txn.done_generation = gen;
	golfer_txn.done_request_id[0] = '\0';
	if (success && request_id != NULL) {
		strncpy(golfer_txn.done_request_id, request_id,
			sizeof(golfer_txn.done_request_id));
		golfer_txn.done_request_id[sizeof(golfer_txn.done_request_id) - 1] = '\0';
	}
	k_spin_unlock(&golfer_txn_lock, key);
}

static bool golfer_txn_check_done(uint32_t gen, bool *out_success,
				  char *request_id, size_t request_id_len)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);
	bool matched = golfer_txn.done && golfer_txn.done_generation == gen;

	if (matched) {
		*out_success = golfer_txn.done_result_ok;
		strncpy(request_id, golfer_txn.done_request_id, request_id_len);
		request_id[request_id_len - 1] = '\0';
		golfer_txn.done = false;
	}
	k_spin_unlock(&golfer_txn_lock, key);
	return matched;
}

static app_state_t state = STATE_IDLE;
static volatile bool button_wake_pending;
static struct gpio_callback button_cb;
static struct gpio_callback vbus_cb;

#define DNS_CACHE_MAX_AGE_MS               300000

/* USB/VBUS service hold: reuses the existing GPIO wake path to keep the
 * device out of its normal field WFI/PSM idle policy for as long as VBUS
 * remains present. Set only from configure_buck2_power_policy() (boot) and
 * vbus_event_callback() (runtime); read from low_power_idle() and configure_psm().
 */
static volatile bool vbus_hold_active;
/* Guards PSM API calls from vbus_event_callback() until the modem is ready. */
static volatile bool modem_ready;
static volatile bool interaction_awake_active;

/* Global awake keeper: the lowest-priority application thread, strictly above
 * K_IDLE_PRIO, that stays continuously runnable while VBUS is present or a
 * bounded golfer interaction owns the awake hold. Zephyr cannot select the
 * idle thread and execute WFI during either hold; any higher-priority thread
 * still preempts the keeper normally.
 */
static K_SEM_DEFINE(keeper_sem, 0, 1);

static void service_awake_keeper_entry(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);

	while (1) {
		k_sem_take(&keeper_sem, K_FOREVER);

		while (vbus_hold_active || interaction_awake_active) {
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

static void set_interaction_awake(bool active)
{
	interaction_awake_active = active;

	if (active) {
		k_sem_give(&keeper_sem);
	}
}

static bool lte_registered;
static struct k_spinlock lte_registration_lock;

static void radio_state_write_registration(enum lte_lc_nw_reg_status status)
{
	k_spinlock_key_t key = k_spin_lock(&lte_registration_lock);

	lte_registered = status == LTE_LC_NW_REG_REGISTERED_HOME ||
			 status == LTE_LC_NW_REG_REGISTERED_ROAMING;
	k_spin_unlock(&lte_registration_lock, key);
}

/* Shared DNS cache for the fixed Cloud Run host, used by both the golfer
 * and COMPLETE flows. A resolved address is not assumed valid forever
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
		 * the golfer/COMPLETE transaction scheduler.
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
 * context, never button_thread/transaction_thread/modem_service_thread.
 * Writes locked registration state; any follow-up requiring a
 * particular thread is only ever signaled via
 * network_wake_sem, never performed directly here.
 */
static void lte_evt_handler(const struct lte_lc_evt *const evt)
{
	switch (evt->type) {
	case LTE_LC_EVT_NW_REG_STATUS:
		radio_state_write_registration(evt->nw_reg_status);
		complete_poll_signal();

		if (evt->nw_reg_status == LTE_LC_NW_REG_REGISTERED_HOME ||
		    evt->nw_reg_status == LTE_LC_NW_REG_REGISTERED_ROAMING) {
			LOG_INF("LTE registered: status=%d", evt->nw_reg_status);
			k_sem_give(&network_wake_sem);
		} else {
			LOG_INF("LTE registration status update: %d", evt->nw_reg_status);
		}
		break;
#if defined(CONFIG_LTE_LC_MODEM_SLEEP_MODULE)
	case LTE_LC_EVT_PSM_UPDATE:
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
	 * in main() is the single point that clears it. LTE events are serviced by
	 * modem_service_thread on its own network_wake_sem; the golfer
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

static void indicator_on(int pin)
{
	gpio_pin_set(gpio0_dev, pin, 1);
}

static void indicator_off(int pin)
{
	gpio_pin_set(gpio0_dev, pin, 0);
}

static void indicator_flash(int pin, int count, int on_ms, int off_ms)
{
	for (int i = 0; i < count; i++) {
		indicator_on(pin);
		k_sleep(K_MSEC(on_ms));
		indicator_off(pin);
		k_sleep(K_MSEC(off_ms));
	}
}

static void all_indicators_off(void)
{
	indicator_off(ORANGE_PIN);
	indicator_off(GREEN_PIN);
	indicator_off(RED_PIN);
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
	case STATE_REPEAT_PRESS:
		LOG_INF("STATE_REPEAT_PRESS");
		break;
	default:
		LOG_WRN("Unknown state: %d", state);
		break;
	}
}

static void show_success_feedback(void)
{
	indicator_flash(GREEN_PIN, FEEDBACK_BLINK_COUNT, FEEDBACK_BLINK_ON_MS, FEEDBACK_BLINK_OFF_MS);
	indicator_on(GREEN_PIN);
	k_sleep(K_MSEC(FEEDBACK_SOLID_MS));
	indicator_off(GREEN_PIN);
}

static void show_failure_feedback(void)
{
	indicator_flash(RED_PIN, FEEDBACK_BLINK_COUNT, FEEDBACK_BLINK_ON_MS, FEEDBACK_BLINK_OFF_MS);
	indicator_on(RED_PIN);
	k_sleep(K_MSEC(FEEDBACK_SOLID_MS));
	indicator_off(RED_PIN);
}

/* Runs the golfer's accepted transaction to terminal disposition within the
 * single absolute txn_deadline_ms established at acceptance time (see
 * main()). Every attempt and every stage inside send_https_test() computes
 * its own remaining time from this same deadline -- no attempt ever resets
 * or extends it.
 */
static int run_golfer_transaction(int64_t txn_deadline_ms, const char *transaction_id,
				  char *request_id, size_t request_id_len)
{
	int ret = -ETIMEDOUT;

	request_id[0] = '\0';

	for (int attempt = 0; attempt < GOLFER_MAX_ATTEMPTS; attempt++) {
		int64_t now_ms = k_uptime_get();
		int64_t remaining_ms = txn_deadline_ms - now_ms;

		if (remaining_ms <= 0) {
			break;
		}
		if (attempt > 0 && remaining_ms < GOLFER_MIN_RETRY_RESERVE_MS) {
			break;
		}

		ret = send_https_test(txn_deadline_ms, transaction_id,
				      request_id, request_id_len);
		if (ret == 0 || ret == -EACCES) {
			break;
		}
	}

	return ret;
}

static bool lte_is_registered(void)
{
	k_spinlock_key_t key = k_spin_lock(&lte_registration_lock);
	bool registered = lte_registered;

	k_spin_unlock(&lte_registration_lock, key);
	return registered;
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

enum http_response_kind {
	HTTP_RESPONSE_GENERIC,
	HTTP_RESPONSE_BUTTON,
	HTTP_RESPONSE_COMMAND_POLL,
};

/* Shared authenticated HTTPS transport primitive for the golfer
 * button_press flow and COMPLETE poll/acknowledgement.
 *
 * DNS is served from the shared, spinlock-protected dns_cache via
 * dns_get_address_bounded(): zsock_getaddrinfo() itself only ever executes
 * on the isolated dns_resolver_thread, never here.
 *
 * connect()/send()/recv() all use a nonblocking socket plus
 * socket_stage_deadline()/socket_connect_bounded(), so no single stage can
 * ever block longer than the remaining portion of attempt_deadline_ms.
 *
 * When yieldable is true (COMPLETE only), golfer_txn_is_pending()
 * is checked before/after every stage; a pending golfer press aborts this
 * call immediately with -ECANCELED so COMPLETE never holds the shared
 * transport once a golfer transaction has been accepted. The golfer's own
 * flow (yieldable=false) never checks this and is never itself aborted.
 *
 * Return value convention (unchanged from the pre-WP4 button-only
 * behavior), plus one new outcome:
 *   0           HTTP 2xx.
 *   -EACCES     HTTP 400/401/403/404 (terminal; caller does not retry).
 *   -EPROTO     Any other received-but-unsuccessful HTTP response.
 *   -ECANCELED  COMPLETE yielded to an accepted golfer press (yieldable only).
 *   -errno/-ETIMEDOUT  No response could be obtained at all.
 */
static int send_http_request(const char *request, int request_len,
			      int64_t attempt_deadline_ms,
			      bool yieldable,
			      enum http_response_kind response_kind,
			      const char *active_request_id,
			      void *response_output,
			      size_t response_output_len)
{
	int fd = -1;
	int ret;
	int64_t remaining_ms;
	struct sockaddr_storage addr;
	socklen_t addr_len;

	const char *host = "fairway-button-receiver-936892386735.us-central1.run.app";

	static char recv_chunk[512];
	static struct fairway_http_response response;

	int verify = TLS_PEER_VERIFY_REQUIRED;
	sec_tag_t sec_tag_list[] = { FAIRWAY_TLS_SEC_TAG };

	LOG_INF("Sending HTTPS request to Cloud Run");

	if (yieldable && golfer_txn_is_pending()) {
		return -ECANCELED;
	}

	remaining_ms = attempt_deadline_ms - k_uptime_get();
	ret = dns_get_address_bounded(&addr,
		yieldable ? MIN(remaining_ms, (int64_t)COMMAND_DNS_READINESS_TIMEOUT_MS)
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
		yieldable ? MIN(remaining_ms, (int64_t)COMMAND_YIELD_CONNECT_POLL_MS)
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

	int sent = 0;
	while (sent < request_len) {
		remaining_ms = attempt_deadline_ms - k_uptime_get();
		ret = socket_stage_deadline(fd, ZSOCK_POLLOUT,
			yieldable ? MIN(remaining_ms, (int64_t)COMMAND_YIELD_IO_POLL_MS)
				  : remaining_ms);
		if (ret != 0) {
			goto out;
		}

		ret = zsock_send(fd, request + sent, (size_t)(request_len - sent), 0);
		if (ret < 0) {
			ret = -errno;
			LOG_ERR("HTTPS zsock_send failed: errno %d", errno);
			goto out;
		}
		if (ret == 0) {
			ret = -EIO;
			goto out;
		}
		sent += ret;

		if (yieldable && golfer_txn_is_pending()) {
			ret = -ECANCELED;
			goto out;
		}
	}

	LOG_INF("HTTPS request sent: %d bytes", sent);

	fairway_http_response_init(&response);
	while (1) {
		remaining_ms = attempt_deadline_ms - k_uptime_get();
		ret = socket_stage_deadline(fd, ZSOCK_POLLIN,
			yieldable ? MIN(remaining_ms, (int64_t)COMMAND_YIELD_IO_POLL_MS)
				  : remaining_ms);
		if (ret != 0) {
			goto out;
		}

		ret = zsock_recv(fd, recv_chunk, sizeof(recv_chunk), 0);
		if (ret < 0) {
			ret = -errno;
			LOG_ERR("HTTPS zsock_recv failed: errno %d", errno);
			goto out;
		}
		if (ret == 0) {
			ret = -EPROTO;
			goto out;
		}

		enum fairway_http_feed_result feed_result =
			fairway_http_response_feed(&response, recv_chunk, (size_t)ret);
		if (feed_result == FAIRWAY_HTTP_INVALID) {
			ret = -EPROTO;
			goto out;
		}
		if (feed_result == FAIRWAY_HTTP_COMPLETE) {
			break;
		}
		if (yieldable && golfer_txn_is_pending()) {
			ret = -ECANCELED;
			goto out;
		}
	}

	LOG_INF("HTTPS response received: %u bytes", response.length);
	LOG_INF("HTTPS response preview: %.80s", response.data);

	{
		int http_status = response.status_code;
		const char *body = fairway_http_response_body(&response);

		if (http_status >= 200 && http_status < 300) {
			if (body != NULL) {
				size_t body_len = response.content_length;
				static char parse_buf[4096];

				if (body_len >= sizeof(parse_buf)) {
					ret = -EPROTO;
					goto out;
				}

				memcpy(parse_buf, body, body_len);
				parse_buf[body_len] = '\0';

				if (response_kind == HTTP_RESPONSE_BUTTON &&
				    !fairway_parse_button_response(parse_buf, body_len,
							    response_output, response_output_len)) {
					ret = -EPROTO;
					goto out;
				}

				if (response_kind == HTTP_RESPONSE_COMMAND_POLL) {
					struct fairway_complete_command *command = response_output;

					command->command_id[0] = '\0';
					(void)fairway_parse_complete_command(parse_buf, body_len,
								      FAIRWAY_DEVICE_ID,
								      active_request_id, command);
				}

			}
		}

		if (http_status < 200 || http_status >= 300) {
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

static int send_https_test(int64_t attempt_deadline_ms,
			   const char *transaction_id,
			   char *request_id, size_t request_id_len)
{
	static char request_body[128];
	int request_body_len;

	request_body_len = snprintk(request_body, sizeof(request_body),
		"{\"device_id\":\"%s\",\"event_type\":\"button_press\","
		"\"transaction_id\":\"%s\"}", FAIRWAY_DEVICE_ID, transaction_id);

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

	return send_http_request(request, request_len, attempt_deadline_ms, false,
				 HTTP_RESPONSE_BUTTON, NULL, request_id, request_id_len);
}

static int send_command_poll_request(const char *active_request_id,
				     struct fairway_complete_command *command,
				     int64_t attempt_deadline_ms)
{
	char body[256];
	char request[768];
	int body_len = snprintk(body, sizeof(body),
		"{\"device_id\":\"%s\",\"active_request_id\":\"%s\"}",
		FAIRWAY_DEVICE_ID, active_request_id);

	if (body_len < 0 || body_len >= sizeof(body)) {
		return -ENOMEM;
	}

	int request_len = snprintk(request, sizeof(request),
		"POST /api/v1/device-commands/poll HTTP/1.1\r\n"
		"Host: fairway-button-receiver-936892386735.us-central1.run.app\r\n"
		"Content-Type: application/json\r\n"
		"X-Fairway-Device-Key: " FAIRWAY_DEVICE_KEY "\r\n"
		"Content-Length: %d\r\nConnection: close\r\n\r\n%s",
		body_len, body);

	if (request_len < 0 || request_len >= sizeof(request)) {
		return -ENOMEM;
	}

	return send_http_request(request, request_len, attempt_deadline_ms, true,
				 HTTP_RESPONSE_COMMAND_POLL, active_request_id, command,
				 sizeof(*command));
}

static int send_command_ack_request(const struct fairway_complete_command *command,
				    int64_t attempt_deadline_ms)
{
	char body[256];
	char request[768];
	int body_len = snprintk(body, sizeof(body),
		"{\"device_id\":\"%s\",\"request_id\":\"%s\"}",
		FAIRWAY_DEVICE_ID, command->request_id);

	if (body_len < 0 || body_len >= sizeof(body)) {
		return -ENOMEM;
	}

	int request_len = snprintk(request, sizeof(request),
		"POST /api/v1/device-commands/%s/ack HTTP/1.1\r\n"
		"Host: fairway-button-receiver-936892386735.us-central1.run.app\r\n"
		"Content-Type: application/json\r\n"
		"X-Fairway-Device-Key: " FAIRWAY_DEVICE_KEY "\r\n"
		"Content-Length: %d\r\nConnection: close\r\n\r\n%s",
		command->command_id, body_len, body);

	if (request_len < 0 || request_len >= sizeof(request)) {
		return -ENOMEM;
	}

	return send_http_request(request, request_len, attempt_deadline_ms, true,
				 HTTP_RESPONSE_GENERIC, NULL, NULL, 0);
}

/* Owns modem service work. Blocks on local_hw_ready_sem
 * until main() has finished local button/LED hardware setup, then performs
 * the one-time modem/PSM/cert/connect sequence, then blocks until LTE
 * registration signaling. Never itself performs DNS or HTTP work.
 */
static void modem_service_thread_entry(void *p1, void *p2, void *p3)
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
		k_sem_take(&network_wake_sem, K_FOREVER);
	}
}
K_THREAD_DEFINE(modem_service_thread, CONFIG_MAIN_STACK_SIZE,
		modem_service_thread_entry, NULL, NULL, NULL,
		MODEM_SERVICE_THREAD_PRIORITY, 0, 0);

/* Golfer-first transaction scheduler: the sole owner of the shared product
 * network transport (DNS/socket/TLS/HTTP) for golfer then COMPLETE,
 * one at a time. Blocks indefinitely when neither has work.
 */
static void transaction_thread_entry(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);

	while (1) {
		uint32_t gen;
		int64_t deadline_ms;
		char transaction_id[FAIRWAY_TRANSACTION_ID_LENGTH + 1];
		struct complete_poll_action command_action;
		bool have_golfer = golfer_txn_pickup(&gen, &deadline_ms, transaction_id);
		bool have_command = !have_golfer &&
			complete_poll_next_action(k_uptime_get(), lte_is_registered(),
						  &command_action);

		if (!have_golfer && !have_command) {
			k_sem_take(&txn_wake_sem, K_FOREVER);
			continue;
		}

		if (have_golfer) {
			char request_id[FAIRWAY_REQUEST_ID_MAX];

			int ret = run_golfer_transaction(deadline_ms, transaction_id, request_id,
						 sizeof(request_id));

			golfer_txn_complete(gen, ret == 0, request_id);
			k_sem_give(&button_wake_sem);

			continue;
		}

		if (have_command) {
			int64_t command_deadline_ms = MIN(command_action.deadline_ms,
							 k_uptime_get() + COMMAND_HTTP_TIMEOUT_MS);
			int ret;

			if (command_action.type == COMPLETE_ACTION_POLL) {
				struct fairway_complete_command command = {0};

				ret = send_command_poll_request(command_action.request_id, &command,
							command_deadline_ms);
				complete_poll_poll_finished(command_action.generation,
							    k_uptime_get(), ret,
							    command.command_id[0] == '\0' ? NULL : &command);
			} else {
				ret = send_command_ack_request(&command_action.command,
						       command_deadline_ms);
				if (complete_poll_ack_finished(command_action.generation,
							       k_uptime_get(), ret) &&
				    demand_window_clear_if_matches(command_action.generation,
							   command_action.request_id,
							   k_uptime_get())) {
					LOG_INF("COMPLETE acknowledged for request %s",
						command_action.request_id);
				}
			}
			continue;
		}

	}
}
K_THREAD_DEFINE(transaction_thread, TRANSACTION_THREAD_STACK_SIZE,
		transaction_thread_entry, NULL, NULL, NULL,
		TRANSACTION_THREAD_PRIORITY, 0, 0);

int main(void)
{
	int ret;

	demand_window_init();
	complete_poll_init(&txn_wake_sem);

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
	 * regardless of what modem_service_thread does next or how long it
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

	ret = gpio_pin_configure(gpio0_dev, ORANGE_PIN, GPIO_OUTPUT_INACTIVE);
	if (ret < 0) {
		LOG_ERR("Failed to configure orange indicator GPIO P0.%d: %d", ORANGE_PIN, ret);
		return 0;
	}

	ret = gpio_pin_configure(gpio0_dev, GREEN_PIN, GPIO_OUTPUT_INACTIVE);
	if (ret < 0) {
		LOG_ERR("Failed to configure green indicator GPIO P0.%d: %d", GREEN_PIN, ret);
		return 0;
	}

	ret = gpio_pin_configure(gpio0_dev, RED_PIN, GPIO_OUTPUT_INACTIVE);
	if (ret < 0) {
		LOG_ERR("Failed to configure red indicator GPIO P0.%d: %d", RED_PIN, ret);
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

	indicator_flash(ORANGE_PIN, STARTUP_FLASH_COUNT, STARTUP_FLASH_ON_MS, STARTUP_FLASH_OFF_MS);

	set_state(STATE_IDLE);

	/* Releases modem_service_thread to begin modem/PSM/cert/LTE work.
	 * This is the only interaction between the two threads at boot; this
	 * thread never waits on anything from modem_service_thread.
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
		set_interaction_awake(true);

		int64_t press_time_ms = k_uptime_get();

		/* Active five-minute golfer demand window (docs/UX_SPECIFICATION.md,
		 * "Five-Minute Golfer Demand Window"): a valid press before the
		 * window's expiry is a same-group repeat, not a new golfer demand
		 * event. It never touches golfer_txn/txn_wake_sem -- no new
		 * transaction, no new request -- and is purely a local indicator
		 * echo plus a local counter increment. Naturally becomes false
		 * once press_time_ms reaches expires_at_ms, regardless of the
		 * stale `active` flag left over from the originating success.
		 */
		uint32_t repeat_press_count;
		if (demand_window_repeat_press(press_time_ms, &repeat_press_count)) {
			LOG_INF("REPEAT_PRESS within demand window: count=%u",
				repeat_press_count);

			gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_DISABLE);

			set_state(STATE_REPEAT_PRESS);
			show_success_feedback();

			k_sleep(K_MSEC(BUTTON_REARM_SETTLE_MS));
			gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_EDGE_FALLING);
			set_interaction_awake(false);
			set_state(STATE_IDLE);
			continue;
		}

		/* Keep switch bounce from queuing a second press during the
		 * active transaction; re-armed only after terminal feedback
		 * plus BUTTON_REARM_SETTLE_MS below.
		 */
		gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_DISABLE);

		/* Architect Correction 1: the hard 15-second deadline begins
		 * at acceptance, before the acknowledgement animation runs.
		 */
		int64_t accept_time_ms = press_time_ms;
		int64_t deadline_ms = accept_time_ms + GOLFER_TRANSACTION_BUDGET_MS;
		uint32_t my_gen = golfer_txn_accept(deadline_ms);

		set_state(STATE_TRANSMITTING);

		/* Canonical local acknowledgement begins here (orange physically
		 * turns on) -- strictly before the scheduler is released, so
		 * network/transaction work can never start ahead of the golfer's
		 * visible acknowledgement. The 15-second deadline above is
		 * unaffected: it was already fixed at acceptance, not here.
		 */
		indicator_on(ORANGE_PIN);
		k_sem_give(&txn_wake_sem);

		bool got_result = false;
		bool success = false;
		bool orange_lit = true;
		char request_id[FAIRWAY_REQUEST_ID_MAX];

		/* Orange pulses continuously for the whole unresolved transaction
		 * (docs/UX_SPECIFICATION.md: "pulses while the transaction is
		 * unresolved"), reusing the previously validated brief-flash
		 * cadence. Waiting is chunked to one pulse half-cycle at a time
		 * instead of the full remaining budget so the indicator can keep
		 * toggling; golfer_txn_check_done() is still checked on every
		 * wake (whether from a genuine completion signal or a pulse-phase
		 * timeout), so a real completion is still reacted to immediately,
		 * exactly as before this change. Only reaching the outer
		 * 15-second deadline itself (not a pulse-phase timeout) produces
		 * the defensive FAILURE fallback.
		 */
		while (1) {
			int64_t remaining_ms = deadline_ms - k_uptime_get();

			if (remaining_ms <= 0) {
				break;
			}

			int64_t phase_ms = orange_lit ? ORANGE_PULSE_ON_MS : ORANGE_PULSE_OFF_MS;
			int64_t wait_ms = (remaining_ms < phase_ms) ? remaining_ms : phase_ms;

			if (k_sem_take(&button_wake_sem, K_MSEC(wait_ms)) == 0) {
				if (golfer_txn_check_done(my_gen, &success, request_id,
							 sizeof(request_id))) {
					got_result = true;
					break;
				}
				/* Spurious wake (e.g. a completion signal for an
				 * already-expired generation): keep pulsing within
				 * the same bounded deadline.
				 */
				continue;
			}

			/* This pulse phase elapsed with no completion yet. */
			orange_lit = !orange_lit;
			if (orange_lit) {
				indicator_on(ORANGE_PIN);
			} else {
				indicator_off(ORANGE_PIN);
			}
		}

		indicator_off(ORANGE_PIN);

		if (got_result && success) {
			int64_t demand_deadline_ms = accept_time_ms + DEMAND_WINDOW_MS;

			demand_window_start(my_gen, request_id, demand_deadline_ms);
			complete_poll_start(my_gen, request_id, accept_time_ms,
					    demand_deadline_ms);
			set_state(STATE_SUCCESS);
			show_success_feedback();
		} else {
			/* Local defensive deadline (Architect Correction):
			 * guarantees a terminal disposition even in the
			 * unforeseen case that transaction_thread itself does
			 * not report back in time. Failure never establishes a
			 * demand window.
			 */
			set_state(STATE_FAILURE);
			show_failure_feedback();
		}

		k_sleep(K_MSEC(BUTTON_REARM_SETTLE_MS));
		gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_EDGE_FALLING);
		set_interaction_awake(false);
		set_state(STATE_IDLE);
		all_indicators_off();
	}

	return 0;
}
