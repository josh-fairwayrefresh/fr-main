#ifndef FAIRWAY_OTA_HOST_DFU_TARGET_MCUBOOT_H
#define FAIRWAY_OTA_HOST_DFU_TARGET_MCUBOOT_H

#include <stddef.h>

int dfu_target_mcuboot_set_buf(void *buffer, size_t size);

#endif
