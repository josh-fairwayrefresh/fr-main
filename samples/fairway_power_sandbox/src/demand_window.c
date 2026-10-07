#include "demand_window.h"

#include <string.h>

#include <zephyr/kernel.h>

static struct demand_window_snapshot window;
static struct k_spinlock window_lock;

static void expire_if_due(int64_t now_ms)
{
	if (window.active && now_ms >= window.deadline_ms) {
		window.active = false;
	}
}

void demand_window_init(void)
{
	k_spinlock_key_t key = k_spin_lock(&window_lock);

	memset(&window, 0, sizeof(window));
	k_spin_unlock(&window_lock, key);
}

bool demand_window_start(uint32_t generation,
			 const struct golfer_acceptance *acceptance,
			 int64_t now_ms)
{
	if (acceptance == NULL || acceptance->request_id[0] == '\0' ||
	    strlen(acceptance->request_id) >= sizeof(window.request_id) ||
	    acceptance->golfer_demand_window_ms == 0 ||
	    acceptance->press_time_ms < 0 || acceptance->response_received_ms < 0 ||
	    (acceptance->duplicate && acceptance->demand_window_remaining_ms >
	     acceptance->golfer_demand_window_ms) ||
	    (!acceptance->duplicate && acceptance->demand_window_remaining_ms != 0)) {
		return false;
	}

	int64_t timeline_start_ms = acceptance->duplicate
		? acceptance->response_received_ms : acceptance->press_time_ms;
	uint32_t duration_ms = acceptance->duplicate
		? acceptance->demand_window_remaining_ms
		: acceptance->golfer_demand_window_ms;
	if (timeline_start_ms > INT64_MAX - duration_ms) {
		return false;
	}
	int64_t deadline_ms = timeline_start_ms + duration_ms;
	k_spinlock_key_t key = k_spin_lock(&window_lock);

	window = (struct demand_window_snapshot){
		.active = duration_ms > 0 && now_ms < deadline_ms,
		.generation = generation,
		.timeline_start_ms = timeline_start_ms,
		.deadline_ms = deadline_ms,
		.golfer_demand_window_ms = acceptance->golfer_demand_window_ms,
		.duplicate = acceptance->duplicate,
	};
	strcpy(window.request_id, acceptance->request_id);
	k_spin_unlock(&window_lock, key);
	return true;
}

bool demand_window_repeat_press(int64_t now_ms, uint32_t *repeat_press_count)
{
	k_spinlock_key_t key = k_spin_lock(&window_lock);

	expire_if_due(now_ms);
	bool active = window.active;

	if (active) {
		window.repeat_press_count++;
		if (repeat_press_count != NULL) {
			*repeat_press_count = window.repeat_press_count;
		}
	}
	k_spin_unlock(&window_lock, key);
	return active;
}

bool demand_window_clear_if_matches(uint32_t generation, const char *request_id,
				    int64_t now_ms)
{
	if (request_id == NULL) {
		return false;
	}

	k_spinlock_key_t key = k_spin_lock(&window_lock);

	expire_if_due(now_ms);
	bool matches = window.active && window.generation == generation &&
		       strcmp(window.request_id, request_id) == 0;

	if (matches) {
		window.active = false;
	}
	k_spin_unlock(&window_lock, key);
	return matches;
}

struct demand_window_snapshot demand_window_get_snapshot(int64_t now_ms)
{
	k_spinlock_key_t key = k_spin_lock(&window_lock);

	expire_if_due(now_ms);
	struct demand_window_snapshot snapshot = window;

	k_spin_unlock(&window_lock, key);
	return snapshot;
}