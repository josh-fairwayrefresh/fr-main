#ifndef FAIRWAY_OTA_HOST_DFU_TARGET_H
#define FAIRWAY_OTA_HOST_DFU_TARGET_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define DFU_TARGET_IMAGE_TYPE_MCUBOOT 1

int dfu_target_init(int image_type, size_t offset, size_t image_size,
		    void *callback);
int dfu_target_write(const void *data, size_t length);
int dfu_target_done(bool successful);
int dfu_target_reset(void);
int dfu_target_offset_get(size_t *offset);
int dfu_target_schedule_update(int image_type);

#endif
