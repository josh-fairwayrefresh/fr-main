#ifndef FAIRWAY_OTA_HOST_ZEPHYR_MCUBOOT_H
#define FAIRWAY_OTA_HOST_ZEPHYR_MCUBOOT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

struct mcuboot_img_sem_ver {
	uint8_t major;
	uint8_t minor;
	uint16_t revision;
	uint32_t build_num;
};

struct mcuboot_img_header {
	uint32_t magic;
	uint8_t mcuboot_version;
	struct {
		struct {
			struct mcuboot_img_sem_ver sem_ver;
		} v1;
	} h;
};

bool boot_is_img_confirmed(void);
int boot_write_img_confirmed(void);
int boot_read_bank_header(uint8_t bank_id, struct mcuboot_img_header *header,
			  size_t header_size);

#endif
