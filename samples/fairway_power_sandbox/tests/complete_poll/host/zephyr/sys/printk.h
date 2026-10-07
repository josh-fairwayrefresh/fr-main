#ifndef FAIRWAY_HOST_ZEPHYR_PRINTK_H
#define FAIRWAY_HOST_ZEPHYR_PRINTK_H

#include <stdarg.h>
#include <stdio.h>

static inline int snprintk(char *buffer, size_t size, const char *format, ...)
{
	va_list args;
	va_start(args, format);
	int result = vsnprintf(buffer, size, format, args);
	va_end(args);
	return result;
}

#endif