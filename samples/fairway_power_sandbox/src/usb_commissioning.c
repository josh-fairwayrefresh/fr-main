#include "device_identity.h"
#include "power_policy.h"

#include <errno.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include <zephyr/drivers/uart.h>
#include <zephyr/kernel.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/crc.h>
#include <zephyr/sys/ring_buffer.h>
#include <zephyr/sys/util.h>

/* Binary requests: FRC1, operation, 16-byte nonce, ID/key for install/verify.
 * Replies contain only protocol, nonce, status and identity, never credentials.
 */
#define HEADER_SIZE 21
#define PAYLOAD_SIZE (FAIRWAY_DEVICE_ID_MAX - 1 + FAIRWAY_DEVICE_KEY_MAX - 1)
#define CRC_SIZE 4

static const struct device *const uart = DEVICE_DT_GET(DT_CHOSEN(zephyr_console));
RING_BUF_DECLARE(rx_buffer, 1024);
K_SEM_DEFINE(rx_available, 0, 1);
static atomic_t overflow;

static void clear_secret(void *buffer, size_t size)
{
	volatile unsigned char *cursor = buffer;

	while (size-- > 0) {
		*cursor++ = 0;
	}
}

static bool read_byte(unsigned char *byte)
{
	unsigned char *slot;

	if (ring_buf_get_claim(&rx_buffer, &slot, 1) != 1) {
		return false;
	}
	*byte = *slot;
	clear_secret(slot, 1);
	ring_buf_get_finish(&rx_buffer, 1);
	return true;
}

static void receive(const struct device *dev, void *unused)
{
	unsigned char bytes[16];
	int count;

	ARG_UNUSED(unused);
	while (uart_irq_update(dev) && uart_irq_rx_ready(dev)) {
		count = uart_fifo_read(dev, bytes, sizeof(bytes));
		if (count <= 0) {
			break;
		}
		if (ring_buf_put(&rx_buffer, bytes, count) != count) {
			atomic_set(&overflow, 1);
		}
		k_sem_give(&rx_available);
		clear_secret(bytes, sizeof(bytes));
	}
}

static void reply(const unsigned char *nonce, int status, const char *device_id)
{
	char hex[33];
	char response[128];
	static const char digits[] = "0123456789abcdef";

	for (size_t i = 0; i < 16; i++) {
		hex[i * 2] = digits[nonce[i] >> 4];
		hex[i * 2 + 1] = digits[nonce[i] & 15];
	}
	hex[32] = '\0';
	int length = snprintk(response, sizeof(response), "FRC1 %s %d %s\r\n",
			      hex, status, device_id);

	for (int i = 0; i < length && i < (int)sizeof(response); i++) {
		uart_poll_out(uart, response[i]);
	}
}

static int transaction(unsigned char operation, const unsigned char *payload,
		       char device_id[FAIRWAY_DEVICE_ID_MAX])
{
	struct fairway_device_identity stored = {0};
	char expected_id[FAIRWAY_DEVICE_ID_MAX] = {0};
	char expected_key[FAIRWAY_DEVICE_KEY_MAX] = {0};
	int ret;

	if (operation == '?') {
		ret = fairway_device_identity_load(&stored);
		if (ret == 0) {
			memcpy(device_id, stored.device_id, sizeof(stored.device_id));
		}
		clear_secret(&stored, sizeof(stored));
		return ret;
	}

	memcpy(expected_id, payload, sizeof(expected_id) - 1);
	memcpy(expected_key, payload + sizeof(expected_id) - 1, sizeof(expected_key) - 1);
	ret = operation == 'P'
		      ? fairway_device_identity_provision(expected_id, expected_key)
		      : 0;
	if (ret == 0 || ret == -EALREADY) {
		ret = fairway_device_identity_load(&stored);
		if (ret == 0 &&
		    (memcmp(stored.device_id, expected_id, sizeof(expected_id)) != 0 ||
		     memcmp(stored.device_key, expected_key, sizeof(expected_key)) != 0)) {
			ret = -EACCES;
		}
	}
	if (ret == 0) {
		memcpy(device_id, stored.device_id, sizeof(stored.device_id));
	}
	clear_secret(&stored, sizeof(stored));
	clear_secret(expected_key, sizeof(expected_key));
	return ret;
}

int main(void)
{
	unsigned char frame[HEADER_SIZE + PAYLOAD_SIZE + CRC_SIZE] = {0};
	size_t received = 0;
	int64_t last_byte = 0;
	int ret = power_policy_init(true);

	if (ret < 0 || !device_is_ready(uart)) {
		printk("USB commissioning initialization failed: %d\r\n", ret);
		return 0;
	}
	ret = uart_irq_callback_user_data_set(uart, receive, NULL);
	if (ret < 0) {
		printk("USB commissioning receive initialization failed: %d\r\n", ret);
		return 0;
	}
	uart_irq_rx_enable(uart);

	while (true) {
		unsigned char byte;

		k_sem_take(&rx_available, K_MSEC(100));
		if (atomic_get(&overflow)) {
			/* Never install a frame after losing bytes. A fresh boot is required. */
			uart_irq_rx_disable(uart);
			clear_secret(frame, sizeof(frame));
			printk("USB commissioning receive overflow; no further writes allowed\r\n");
			return 0;
		}
		if (received && k_uptime_get() - last_byte > 2000) {
			clear_secret(frame, sizeof(frame));
			received = 0;
		}
		while (read_byte(&byte)) {
			last_byte = k_uptime_get();
			if (received < 4 && byte != (unsigned char)"FRC1"[received]) {
				received = 0;
				continue;
			}
			frame[received++] = byte;
			if (received == 5 && byte != '?' && byte != 'P' && byte != 'V') {
				clear_secret(frame, sizeof(frame));
				received = 0;
				continue;
			}
			size_t body_size = HEADER_SIZE + (frame[4] == '?' ? 0 : PAYLOAD_SIZE);

			if (received < HEADER_SIZE || received < body_size + CRC_SIZE) {
				continue;
			}
			if (sys_get_le32(frame + body_size) != crc32_ieee(frame, body_size)) {
				clear_secret(frame, sizeof(frame));
				received = 0;
				continue;
			}
			char device_id[FAIRWAY_DEVICE_ID_MAX] = "-";

			ret = transaction(frame[4], frame + HEADER_SIZE, device_id);
			reply(frame + 5, ret, device_id);
			clear_secret(frame, sizeof(frame));
			received = 0;
		}
	}
	return 0;
}
