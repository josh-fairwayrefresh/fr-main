#include "runtime_scheduler.h"

#include <string.h>

#include <zephyr/sys/util.h>

static void scheduler_timer_expiry(struct k_timer *timer)
{
	struct fairway_runtime_scheduler *scheduler = k_timer_user_data_get(timer);
	k_spinlock_key_t key = k_spin_lock(&scheduler->lock);

	fairway_demand_window_note_timer_fire(&scheduler->window);
	k_spin_unlock(&scheduler->lock, key);
	k_sem_give(scheduler->wake_sem);
}

void fairway_runtime_scheduler_init(struct fairway_runtime_scheduler *scheduler,
				    struct k_sem *wake_sem,
				    int64_t poll_interval_ms,
				    int64_t action_timeout_ms)
{
	memset(scheduler, 0, sizeof(*scheduler));
	scheduler->wake_sem = wake_sem;
	scheduler->poll_interval_ms = poll_interval_ms;
	scheduler->action_timeout_ms = action_timeout_ms;
	k_timer_init(&scheduler->timer, scheduler_timer_expiry, NULL);
	k_timer_user_data_set(&scheduler->timer, scheduler);
}

uint32_t fairway_runtime_scheduler_start(struct fairway_runtime_scheduler *scheduler,
					const char *request_id, int64_t now_ms,
					int64_t expires_at_ms)
{
	k_spinlock_key_t key = k_spin_lock(&scheduler->lock);
	uint32_t generation = fairway_demand_window_start(&scheduler->window,
		request_id, now_ms, expires_at_ms, scheduler->poll_interval_ms);
	k_spin_unlock(&scheduler->lock, key);
	k_sem_give(scheduler->wake_sem);
	return generation;
}

bool fairway_runtime_scheduler_repeat_press(struct fairway_runtime_scheduler *scheduler,
					     int64_t now_ms, uint32_t *repeat_count)
{
	k_spinlock_key_t key = k_spin_lock(&scheduler->lock);
	bool active = fairway_demand_window_repeat_press(&scheduler->window, now_ms,
							 repeat_count);
	k_spin_unlock(&scheduler->lock, key);
	if (!active) {
		k_sem_give(scheduler->wake_sem);
	}
	return active;
}

bool fairway_runtime_scheduler_next(struct fairway_runtime_scheduler *scheduler,
				    bool registration_valid, bool registered,
				    int registration_state,
				    struct fairway_command_action *action)
{
	int64_t now_ms = k_uptime_get();
	int64_t next_wake_at_ms;
	k_spinlock_key_t key = k_spin_lock(&scheduler->lock);
	bool ready = fairway_demand_window_evaluate(&scheduler->window, now_ms,
		scheduler->poll_interval_ms, scheduler->action_timeout_ms,
		registration_valid, registered, registration_state,
		action, &next_wake_at_ms);
	k_spin_unlock(&scheduler->lock, key);

	if (ready || next_wake_at_ms < 0) {
		k_timer_stop(&scheduler->timer);
	} else {
		int64_t delay_ms = next_wake_at_ms - k_uptime_get();

		k_timer_start(&scheduler->timer, K_MSEC(MAX(delay_ms, 0)), K_NO_WAIT);
	}
	return ready;
}

void fairway_runtime_scheduler_poll_finished(struct fairway_runtime_scheduler *scheduler,
					     uint32_t generation,
					     enum fairway_command_result result,
					     const struct fairway_complete_command *command)
{
	k_spinlock_key_t key = k_spin_lock(&scheduler->lock);
	fairway_demand_window_poll_finished(&scheduler->window, generation,
		k_uptime_get(), scheduler->poll_interval_ms, result, command);
	k_spin_unlock(&scheduler->lock, key);
}

void fairway_runtime_scheduler_ack_finished(struct fairway_runtime_scheduler *scheduler,
					    uint32_t generation,
					    enum fairway_command_result result)
{
	k_spinlock_key_t key = k_spin_lock(&scheduler->lock);
	fairway_demand_window_ack_finished(&scheduler->window, generation,
		k_uptime_get(), scheduler->poll_interval_ms, result);
	k_spin_unlock(&scheduler->lock, key);
}

void fairway_runtime_scheduler_wake(struct fairway_runtime_scheduler *scheduler)
{
	k_sem_give(scheduler->wake_sem);
}

void fairway_runtime_scheduler_telemetry(struct fairway_runtime_scheduler *scheduler,
					 struct fairway_command_telemetry *telemetry)
{
	k_spinlock_key_t key = k_spin_lock(&scheduler->lock);
	fairway_demand_window_telemetry(&scheduler->window, telemetry);
	k_spin_unlock(&scheduler->lock, key);
}