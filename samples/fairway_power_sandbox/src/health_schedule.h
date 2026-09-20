/*
 * WP4 Device Health scheduling helpers: backend UTC timestamp parsing,
 * effective_config response parsing, and deadline/delta calculation.
 *
 * Firmware performs no IANA timezone or DST interpretation anywhere in this
 * module: only bare UTC ("...Z") timestamps are accepted, and the backend
 * remains the sole authority for Course timezone and Course-local schedule.
 */
#ifndef HEALTH_SCHEDULE_H
#define HEALTH_SCHEDULE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* Parses a UTC timestamp of the exact form "YYYY-MM-DDTHH:MM:SS[.fff]Z"
 * (fractional seconds optional and ignored; no other timezone offset is
 * accepted). Validates calendar component ranges, including leap years.
 *
 * Returns 0 and stores the corresponding Unix time in milliseconds in
 * *out_unix_ms on success. Returns -EINVAL for any malformed or
 * out-of-range input; *out_unix_ms is left untouched on failure.
 */
int health_schedule_parse_utc_timestamp(const char *str, int64_t *out_unix_ms);

/* Parses a JSON HTTP response body and extracts
 * effective_config.next_health_report_at. The buffer is mutated in place by
 * the underlying JSON parser (string values are NUL-terminated/unescaped in
 * place), so body must be writable.
 *
 * Returns true and stores the parsed Unix ms deadline in
 * *out_deadline_unix_ms only when the body is well-formed JSON containing a
 * valid effective_config.next_health_report_at timestamp. Returns false
 * (leaving *out_deadline_unix_ms untouched) for any other case: non-JSON
 * body, missing/null effective_config, missing or malformed
 * next_health_report_at, or an empty body. Never partially applies a
 * result.
 */
bool health_schedule_parse_effective_config(char *body, size_t body_len,
					     int64_t *out_deadline_unix_ms);

/* Computes a clamped, non-negative relative duration in milliseconds from
 * now_unix_ms to deadline_unix_ms, suitable for arming a one-shot k_timer.
 * A deadline at or before now clamps to 0 (fire as soon as possible) rather
 * than producing a negative duration.
 */
int64_t health_schedule_delta_ms(int64_t deadline_unix_ms, int64_t now_unix_ms);

#endif /* HEALTH_SCHEDULE_H */
