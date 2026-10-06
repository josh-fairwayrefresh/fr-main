#include "button_ux.h"

#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(button_ux);

#define BUTTON_PIN    31
#define ORANGE_PIN    30
#define GREEN_PIN     29
#define RED_PIN       28

#define STARTUP_FLASH_COUNT      3
#define STARTUP_FLASH_ON_MS      150
#define STARTUP_FLASH_OFF_MS     150

/* Shared green/red "blink-blink then solid" terminal feedback timing;
 * reuses the previously validated quick-flash cadence. */
#define FEEDBACK_BLINK_COUNT     2
#define FEEDBACK_BLINK_ON_MS     40
#define FEEDBACK_BLINK_OFF_MS    40
#define FEEDBACK_SOLID_MS        5000

static const struct device *gpio0_dev = DEVICE_DT_GET(DT_NODELABEL(gpio0));
static struct gpio_callback button_cb;
static struct k_sem *press_wake_sem;
static volatile bool button_wake_pending;

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
	k_sem_give(press_wake_sem);
}

bool button_ux_take_press_pending(void)
{
	bool pending = button_wake_pending;

	button_wake_pending = false;
	return pending;
}

void button_ux_set_interrupt_enabled(bool enabled)
{
	gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN,
				     enabled ? GPIO_INT_EDGE_FALLING : GPIO_INT_DISABLE);
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

void button_ux_all_off(void)
{
	indicator_off(ORANGE_PIN);
	indicator_off(GREEN_PIN);
	indicator_off(RED_PIN);
}

void button_ux_orange_on(void)
{
	indicator_on(ORANGE_PIN);
}

void button_ux_orange_off(void)
{
	indicator_off(ORANGE_PIN);
}

void button_ux_show_success_feedback(void)
{
	indicator_flash(GREEN_PIN, FEEDBACK_BLINK_COUNT, FEEDBACK_BLINK_ON_MS, FEEDBACK_BLINK_OFF_MS);
	indicator_on(GREEN_PIN);
	k_sleep(K_MSEC(FEEDBACK_SOLID_MS));
	indicator_off(GREEN_PIN);
}

void button_ux_show_failure_feedback(void)
{
	indicator_flash(RED_PIN, FEEDBACK_BLINK_COUNT, FEEDBACK_BLINK_ON_MS, FEEDBACK_BLINK_OFF_MS);
	indicator_on(RED_PIN);
	k_sleep(K_MSEC(FEEDBACK_SOLID_MS));
	indicator_off(RED_PIN);
}

void button_ux_startup_flash(void)
{
	indicator_flash(ORANGE_PIN, STARTUP_FLASH_COUNT, STARTUP_FLASH_ON_MS, STARTUP_FLASH_OFF_MS);
}

int button_ux_init(struct k_sem *wake_sem)
{
	int ret;

	press_wake_sem = wake_sem;

	if (!device_is_ready(gpio0_dev)) {
		LOG_ERR("GPIO0 device is not ready");
		return -ENODEV;
	}

	ret = gpio_pin_configure(gpio0_dev, BUTTON_PIN, GPIO_INPUT | GPIO_PULL_UP);
	if (ret < 0) {
		LOG_ERR("Failed to configure button GPIO P0.%d: %d", BUTTON_PIN, ret);
		return ret;
	}

	ret = gpio_pin_configure(gpio0_dev, ORANGE_PIN, GPIO_OUTPUT_INACTIVE);
	if (ret < 0) {
		LOG_ERR("Failed to configure orange indicator GPIO P0.%d: %d", ORANGE_PIN, ret);
		return ret;
	}

	ret = gpio_pin_configure(gpio0_dev, GREEN_PIN, GPIO_OUTPUT_INACTIVE);
	if (ret < 0) {
		LOG_ERR("Failed to configure green indicator GPIO P0.%d: %d", GREEN_PIN, ret);
		return ret;
	}

	ret = gpio_pin_configure(gpio0_dev, RED_PIN, GPIO_OUTPUT_INACTIVE);
	if (ret < 0) {
		LOG_ERR("Failed to configure red indicator GPIO P0.%d: %d", RED_PIN, ret);
		return ret;
	}

	gpio_init_callback(&button_cb, button_pressed_cb, BIT(BUTTON_PIN));
	ret = gpio_add_callback(gpio0_dev, &button_cb);
	if (ret < 0) {
		LOG_ERR("Failed to add button GPIO callback: %d", ret);
		return ret;
	}

	ret = gpio_pin_interrupt_configure(gpio0_dev, BUTTON_PIN, GPIO_INT_EDGE_FALLING);
	if (ret < 0) {
		LOG_ERR("Failed to configure button GPIO interrupt: %d", ret);
		return ret;
	}

	return 0;
}
