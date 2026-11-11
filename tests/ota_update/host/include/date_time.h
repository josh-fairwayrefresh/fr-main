#ifndef FAIRWAY_HOST_DATE_TIME_H
#define FAIRWAY_HOST_DATE_TIME_H
#include <stdbool.h>
#include <stdint.h>
enum { DATE_TIME_OBTAINED_MODEM, DATE_TIME_OBTAINED_NTP, DATE_TIME_OBTAINED_EXT };
struct date_time_evt { int type; };
void date_time_register_handler(void (*handler)(const struct date_time_evt *));
void date_time_update_async(void *handler);
bool date_time_is_valid(void);
int date_time_now(int64_t *value);
int date_time_uptime_to_unix_time_ms(int64_t *value);
#endif
