#ifndef FAIRWAY_RUNTIME_SCHEDULER_H
#define FAIRWAY_RUNTIME_SCHEDULER_H

#include <zephyr/kernel.h>

#include "runtime_reliability.h"

struct fairway_runtime_scheduler {
	struct fairway_demand_window window;
	struct k_spinlock lock;
	struct k_timer timer;
	struct k_sem *wake_sem;
	int64_t poll_interval_ms;
	int64_t action_timeout_ms;
};

void fairway_runtime_scheduler_init(struct fairway_runtime_scheduler *scheduler,
				    struct k_sem *wake_sem,
				    int64_t poll_interval_ms,
				    int64_t action_timeout_ms);
uint32_t fairway_runtime_scheduler_start(struct fairway_runtime_scheduler *scheduler,
					const char *request_id, int64_t now_ms,
					int64_t expires_at_ms);
bool fairway_runtime_scheduler_repeat_press(struct fairway_runtime_scheduler *scheduler,
					     int64_t now_ms, uint32_t *repeat_count);
bool fairway_runtime_scheduler_next(struct fairway_runtime_scheduler *scheduler,
				    bool registration_valid, bool registered,
				    int registration_state,
				    struct fairway_command_action *action);
void fairway_runtime_scheduler_poll_finished(struct fairway_runtime_scheduler *scheduler,
					     uint32_t generation,
					     enum fairway_command_result result,
					     const struct fairway_complete_command *command);
void fairway_runtime_scheduler_ack_finished(struct fairway_runtime_scheduler *scheduler,
					    uint32_t generation,
					    enum fairway_command_result result);
void fairway_runtime_scheduler_wake(struct fairway_runtime_scheduler *scheduler);
void fairway_runtime_scheduler_telemetry(struct fairway_runtime_scheduler *scheduler,
					 struct fairway_command_telemetry *telemetry);

#endif