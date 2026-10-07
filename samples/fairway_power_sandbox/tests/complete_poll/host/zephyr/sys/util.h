#ifndef FAIRWAY_HOST_ZEPHYR_UTIL_H
#define FAIRWAY_HOST_ZEPHYR_UTIL_H

#include <stddef.h>

#define ARRAY_SIZE(array) (sizeof(array) / sizeof((array)[0]))
#define SIZEOF_FIELD(type, field) sizeof(((type *)0)->field)
#define ZERO_OR_COMPILE_ERROR(condition) ((int)sizeof(char[1 - 2 * !(condition)]) - 1)
#define ARG_UNUSED(value) ((void)(value))
#define ROUND_UP(value, align) (((value) + (align) - 1) / (align) * (align))
#define Z_ALIGN_SHIFT(type) (__alignof__(type) == 1 ? 0 : \
				 __alignof__(type) == 2 ? 1 : \
				 __alignof__(type) == 4 ? 2 : 3)

#endif