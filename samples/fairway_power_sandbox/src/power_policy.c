#include "power_policy.h"

#include <zephyr/device.h>
#include <zephyr/drivers/mfd/npm13xx.h>
#include <zephyr/drivers/regulator.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/drivers/sensor/npm13xx_charger.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/pm/device_runtime.h>

#include "modem_service.h"

LOG_MODULE_REGISTER(power_policy);

static const struct device *i2c2_dev = DEVICE_DT_GET(DT_NODELABEL(i2c2));
static const struct device *npm1300_pmic_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_pmic));
static const struct device *npm1300_charger_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_charger));
static const struct device *buck2_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_buck2));

static struct gpio_callback vbus_cb;

/* USB/VBUS service hold: keeps the device out of its normal field WFI/PSM
 * idle policy for as long as VBUS remains present.
 */
static volatile bool vbus_hold_active;
static volatile bool interaction_awake_active;

/* Global awake keeper: the lowest-priority application thread, strictly
 * above K_IDLE_PRIO, that stays continuously runnable while VBUS is
 * present or a bounded golfer interaction owns the awake hold. Zephyr
 * cannot select the idle thread and execute WFI during either hold; any
 * higher-priority thread still preempts the keeper normally.
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

void power_policy_set_interaction_awake(bool active)
{
	interaction_awake_active = active;

	if (active) {
		k_sem_give(&keeper_sem);
	}
}

bool power_policy_vbus_hold_active(void)
{
	return vbus_hold_active;
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

		modem_service_set_psm_requested(false);
	}

	if ((pins & BIT(NPM13XX_EVENT_VBUS_REMOVED)) != 0U) {
		set_vbus_hold(false);

		if (apply_buck2_power_policy(false) < 0) {
			LOG_ERR("BUCK2 disable after VBUS removal failed");
		}

		modem_service_set_psm_requested(true);
	}
}

int power_policy_init(void)
{
	struct sensor_value vbus_present;
	int ret;

	if (!device_is_ready(i2c2_dev)) {
		LOG_ERR("I2C2 device is not ready");
		return -ENODEV;
	}

	ret = pm_device_runtime_enable(i2c2_dev);
	if (ret < 0) {
		LOG_ERR("I2C2 runtime PM initialization failed: %d", ret);
		return ret;
	}

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
