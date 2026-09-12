/*
 * Fairway Refresh state-machine feedback test
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
 * Current behavior:
 *   Startup:
 *     Ring flashes 3 times
 *
 *   IDLE:
 *     Ring off
 *
 *   Button press:
 *     ACK: ring solid briefly
 *     TRANSMITTING: slow blink
 *     SUCCESS: 3 quick flashes
 *     Return to IDLE
 *
 * Future replacement point:
 *   Replace simulated_send_request() with actual LTE/cloud request logic.
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/drivers/mfd/npm1300.h>
#include <zephyr/drivers/regulator.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/drivers/sensor/npm1300_charger.h>
#include <zephyr/logging/log.h>
#include <zephyr/pm/device_runtime.h>
#include <stdbool.h>
#include <stdio.h>
#include <modem/nrf_modem_lib.h>
#include <modem/lte_lc.h>
#include <zephyr/net/socket.h>
#include <string.h>
#include <modem/modem_key_mgmt.h>
#include <zephyr/net/tls_credentials.h>
#include "secrets/fairway_device_key.h"

LOG_MODULE_REGISTER(main);
static int send_https_test(int64_t attempt_deadline_ms);
static bool button_is_pressed(void);
static const struct device *gpio0_dev = DEVICE_DT_GET(DT_NODELABEL(gpio0));
static const struct device *uart0_dev = DEVICE_DT_GET(DT_CHOSEN(zephyr_console));
static const struct device *i2c2_dev = DEVICE_DT_GET(DT_NODELABEL(i2c2));
static const struct device *npm1300_pmic_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_pmic));
static const struct device *npm1300_charger_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_charger));
static const struct device *buck2_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_buck2));

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
static volatile bool request_lockout_active;
static volatile int64_t request_lockout_deadline_ms;
static struct gpio_callback button_cb;
static struct gpio_callback vbus_cb;
static K_SEM_DEFINE(wake_sem, 0, 1);

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

static void configure_psm(void)
{
	int ret;

	ret = lte_lc_psm_param_set_seconds(-1, 0);
	if (ret) {
		LOG_ERR("lte_lc_psm_param_set_seconds failed: %d", ret);
		return;
	}

	ret = lte_lc_psm_req(true);
	if (ret) {
		LOG_ERR("lte_lc_psm_req(true) failed: %d", ret);
		return;
	}

	LOG_INF("PSM configured: RPTAU=default, RAT=0 s");
}

static void low_power_idle(void)
{
	k_sem_take(&wake_sem, K_FOREVER);

	/* button_wake_pending is left set here; the outer loop in main() is the
	 * single point that clears it and invokes run_request_flow().
	 */
	if (button_wake_pending) {
		LOG_INF("BUTTON_WAKE detected");
		LOG_INF("BUTTON_WAKE: invoking request flow");
		return;
	}
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

	if ((pins & BIT(NPM1300_EVENT_VBUS_DETECTED)) != 0U) {
		if (apply_buck2_power_policy(true) < 0) {
			LOG_ERR("BUCK2 enable after VBUS detection failed");
		}
	}

	if ((pins & BIT(NPM1300_EVENT_VBUS_REMOVED)) != 0U) {
		if (apply_buck2_power_policy(false) < 0) {
			LOG_ERR("BUCK2 disable after VBUS removal failed");
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
			   BIT(NPM1300_EVENT_VBUS_DETECTED) | BIT(NPM1300_EVENT_VBUS_REMOVED));
	ret = mfd_npm1300_add_callback(npm1300_pmic_dev, &vbus_cb);
	if (ret < 0) {
		return ret;
	}

	ret = sensor_attr_get(npm1300_charger_dev, SENSOR_CHAN_NPM1300_CHARGER_VBUS_STATUS,
			      SENSOR_ATTR_NPM1300_CHARGER_VBUS_PRESENT, &vbus_present);
	if (ret < 0) {
		return ret;
	}

	return apply_buck2_power_policy(vbus_present.val1 != 0);
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

/*
 * Placeholder for the future real LTE/cloud request.
 *
 * Return true for success.
 * Return false for failure.
 *
 * Later this function will:
 *   1. wake/connect modem
 *   2. send request payload
 *   3. wait for server response
 *   4. return success/failure
 */
static int send_fairway_request(int64_t attempt_deadline_ms)
{
	int ret;

	LOG_INF("Fairway HTTPS request send started");

	ret = send_https_test(attempt_deadline_ms);
	if (ret) {
		LOG_ERR("Fairway HTTPS request send failed: %d", ret);
		return ret;
	}

	LOG_INF("Fairway HTTPS request send complete: success");

	return 0;
}

static void run_request_flow(void)
{
	int ret = -ETIMEDOUT;

	set_state(STATE_TRANSMITTING);
	show_transmitting_feedback();

	for (size_t attempt = 0; attempt < REQUEST_MAX_ATTEMPTS; attempt++) {
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

	set_state(STATE_IDLE);
	ring_off();
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

static int send_https_test(int64_t attempt_deadline_ms)
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

	const char request_body[] =
	"{\"device_id\":\"frb-0001\",\"event_type\":\"button_press\"}";

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
	(int)strlen(request_body),
	request_body);

if (request_len < 0 || request_len >= sizeof(request)) {
	LOG_ERR("HTTPS request buffer too small");
	return -ENOMEM;
}

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
	if (sscanf(recv_buf, "HTTP/%*u.%*u %d", &http_status) != 1 ||
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
		low_power_idle();

		if (button_wake_pending) {
			button_wake_pending = false;

			/* Keep switch bounce from queuing a second request during the flow. */
			gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_DISABLE);
			run_request_flow();
			gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_EDGE_FALLING);
			continue;
		}

	}

	return 0;
}