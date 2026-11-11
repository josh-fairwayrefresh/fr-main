#ifndef FAIRWAY_SDK_JSON_UTIL_H
#define FAIRWAY_SDK_JSON_UTIL_H
#define ARRAY_SIZE(array) (sizeof(array) / sizeof((array)[0]))
#define ROUND_UP(x, align) ((((x) + (align) - 1) / (align)) * (align))
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define BIT(n) (1UL << (n))
#define SIZEOF_FIELD(type, member) sizeof((((type *)0)->member))
#define ARG_UNUSED(x) ((void)(x))
#endif
