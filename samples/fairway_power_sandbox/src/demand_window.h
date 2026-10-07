#ifndef DEMAND_WINDOW_H
#define DEMAND_WINDOW_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "golfer_acceptance.h"

struct demand_window_snapshot {
	bool active;
	uint32_t generation;
	int64_t timeline_start_ms;
	int64_t deadline_ms;
	uint32_t golfer_demand_window_ms;
	bool duplicate;
	uint32_t repeat_press_count;
	char request_id[FAIRWAY_REQUEST_ID_MAX];
};

void demand_window_init(void);
bool demand_window_start(uint32_t generation,
			 const struct golfer_acceptance *acceptance,
			 int64_t now_ms);
bool demand_window_repeat_press(int64_t now_ms, uint32_t *repeat_press_count);
bool demand_window_clear_if_matches(uint32_t generation, const char *request_id,
				    int64_t now_ms);
struct demand_window_snapshot demand_window_get_snapshot(int64_t now_ms);

#endif /* DEMAND_WINDOW_H */