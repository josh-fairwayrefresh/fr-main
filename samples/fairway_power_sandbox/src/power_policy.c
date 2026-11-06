#include "power_policy.h"

#include <zephyr/device.h>
#include <zephyr/drivers/regulator.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/pm/device_runtime.h>

LOG_MODULE_REGISTER(power_policy);

static const struct device *i2c2_dev = DEVICE_DT_GET(DT_NODELABEL(i2c2));
static const struct device *buck2_dev = DEVICE_DT_GET(DT_NODELABEL(npm1300_buck2));

static volatile bool interaction_awake_active;

/* The lowest-priority application thread stays runnable only during a
 * bounded golfer interaction, preventing WFI until that interaction ends.
 */
static K_SEM_DEFINE(keeper_sem, 0, 1);

static void service_awake_keeper_entry(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);

	while (1) {
		k_sem_take(&keeper_sem, K_FOREVER);

		while (interaction_awake_active) {
			k_yield();
		}
	}
}

K_THREAD_DEFINE(service_awake_keeper, 512, service_awake_keeper_entry, NULL, NULL, NULL,
		K_LOWEST_APPLICATION_THREAD_PRIO, 0, 0);

void power_policy_set_interaction_awake(bool active)
{
	interaction_awake_active = active;

	if (active) {
		k_sem_give(&keeper_sem);
	}
}

static int set_buck2_service_rail(bool enabled)
{
	int ret;

	if (!device_is_ready(buck2_dev)) {
		return -ENODEV;
	}

	if (regulator_is_enabled(buck2_dev) == enabled) {
		LOG_INF("BUCK2 debugger service rail already %s",
			enabled ? "enabled for service" : "disabled for normal operation");
		return 0;
	}

	ret = enabled ? regulator_enable(buck2_dev) : regulator_disable(buck2_dev);
	if (ret == 0) {
		LOG_INF("BUCK2 debugger service rail %s",
			enabled ? "enabled for service mode" : "disabled for normal operation");
	}
	return ret;
}

int power_policy_init(bool service_mode)
{
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

	return set_buck2_service_rail(service_mode);
}
