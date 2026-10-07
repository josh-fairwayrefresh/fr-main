#ifndef GOLFER_ACCEPTANCE_H
#define GOLFER_ACCEPTANCE_H

#include <stdbool.h>
#include <stdint.h>

#define FAIRWAY_REQUEST_ID_MAX 96

struct golfer_acceptance {
	char request_id[FAIRWAY_REQUEST_ID_MAX];
	uint32_t golfer_demand_window_ms;
	uint32_t demand_window_remaining_ms;
	bool duplicate;
	int64_t press_time_ms;
	int64_t response_received_ms;
};

#endif /* GOLFER_ACCEPTANCE_H */