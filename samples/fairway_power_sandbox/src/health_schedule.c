/*
 * WP4 Device Health scheduling helpers. See health_schedule.h.
 */
#include "health_schedule.h"

#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

#include <zephyr/data/json.h>
#include <zephyr/sys/timeutil.h>
#include <zephyr/sys/util.h>

struct health_schedule_effective_config_json {
	const char *next_health_report_at;
};

static const struct json_obj_descr effective_config_descr[] = {
	JSON_OBJ_DESCR_PRIM(struct health_schedule_effective_config_json,
			    next_health_report_at, JSON_TOK_STRING),
};

struct health_schedule_response_json {
	struct health_schedule_effective_config_json effective_config;
};

static const struct json_obj_descr response_descr[] = {
	JSON_OBJ_DESCR_OBJECT(struct health_schedule_response_json,
			      effective_config, effective_config_descr),
};

int health_schedule_parse_utc_timestamp(const char *str, int64_t *out_unix_ms)
{
	struct tm tm = {0};
	int year, month, day, hour, min, sec;
	int consumed = 0;
	const char *rest;
	bool leap;
	int max_day;
	static const int days_in_month[] = {
		31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
	};

	if (str == NULL || out_unix_ms == NULL) {
		return -EINVAL;
	}

	if (sscanf(str, "%4d-%2d-%2dT%2d:%2d:%2d%n",
		   &year, &month, &day, &hour, &min, &sec, &consumed) != 6) {
		return -EINVAL;
	}

	rest = str + consumed;

	if (*rest == '.') {
		rest++;
		while (isdigit((unsigned char)*rest)) {
			rest++;
		}
	}

	/* Only a bare UTC 'Z' suffix is accepted; firmware performs no
	 * timezone-offset arithmetic for any other suffix form.
	 */
	if (*rest != 'Z' || rest[1] != '\0') {
		return -EINVAL;
	}

	if (year < 1970 || year > 2100) {
		return -EINVAL;
	}

	if (month < 1 || month > 12) {
		return -EINVAL;
	}

	leap = (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0));
	max_day = days_in_month[month - 1] + ((month == 2 && leap) ? 1 : 0);

	if (day < 1 || day > max_day) {
		return -EINVAL;
	}

	if (hour < 0 || hour > 23) {
		return -EINVAL;
	}

	if (min < 0 || min > 59) {
		return -EINVAL;
	}

	if (sec < 0 || sec > 59) {
		return -EINVAL;
	}

	tm.tm_year = year - 1900;
	tm.tm_mon = month - 1;
	tm.tm_mday = day;
	tm.tm_hour = hour;
	tm.tm_min = min;
	tm.tm_sec = sec;

	*out_unix_ms = timeutil_timegm64(&tm) * 1000;

	return 0;
}

bool health_schedule_parse_effective_config(char *body, size_t body_len,
					     int64_t *out_deadline_unix_ms)
{
	struct health_schedule_response_json resp = {0};
	int64_t parse_ret;
	int64_t deadline_unix_ms;

	if (body == NULL || body_len == 0 || out_deadline_unix_ms == NULL) {
		return false;
	}

	parse_ret = json_obj_parse(body, body_len, response_descr,
				   ARRAY_SIZE(response_descr), &resp);

	if (parse_ret < 0) {
		return false;
	}

	if (resp.effective_config.next_health_report_at == NULL) {
		return false;
	}

	if (health_schedule_parse_utc_timestamp(
		    resp.effective_config.next_health_report_at,
		    &deadline_unix_ms) != 0) {
		return false;
	}

	*out_deadline_unix_ms = deadline_unix_ms;

	return true;
}

int64_t health_schedule_delta_ms(int64_t deadline_unix_ms, int64_t now_unix_ms)
{
	int64_t delta_ms = deadline_unix_ms - now_unix_ms;

	if (delta_ms < 0) {
		delta_ms = 0;
	}

	return delta_ms;
}
