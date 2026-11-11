#ifndef FAIRWAY_OTA_HOST_ZEPHYR_UTIL_H
#define FAIRWAY_OTA_HOST_ZEPHYR_UTIL_H

#define __packed __attribute__((__packed__))
#define FAIRWAY_UTIL_CAT(a, b) a##b
#define FAIRWAY_UTIL_IS_ENABLED_0 0
#define FAIRWAY_UTIL_IS_ENABLED_1 1
#define IS_ENABLED(config) FAIRWAY_UTIL_CAT(FAIRWAY_UTIL_IS_ENABLED_, config)
#define ARRAY_SIZE(array) (sizeof(array) / sizeof((array)[0]))
#define BIT_MASK(bits) ((1UL << (bits)) - 1UL)

#endif
