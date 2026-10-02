#include <string.h>

#include <zephyr/kernel.h>
#include <zephyr/sys/atomic.h>
#include <zephyr/sys/printk.h>

#include "runtime_scheduler.h"

#define POLL_INTERVAL_MS 20
#define ACTION_TIMEOUT_MS 40
#define TEST_TIMEOUT_MS 1000

enum test_script {
	SCRIPT_ACK_RETRY,
	SCRIPT_EMPTY_POLLS,
};

K_SEM_DEFINE(scheduler_wake, 0, 1);
K_SEM_DEFINE(poll_started, 0, 1);
K_SEM_DEFINE(release_poll, 0, 1);

static struct fairway_runtime_scheduler scheduler;
static atomic_t registered;
static atomic_t script;
static atomic_t hold_first_poll;
static atomic_t active_actions;
static atomic_t overlap_detected;
static atomic_t poll_actions;
static atomic_t ack_actions;
static atomic_t retained_command_mismatch;

static void run_action(const struct fairway_command_action *action)
{
	if (atomic_inc(&active_actions) != 0) {
		atomic_set(&overlap_detected, 1);
	}

	if (action->type == FAIRWAY_COMMAND_ACTION_POLL) {
		int poll_index = atomic_inc(&poll_actions);

		if (poll_index == 0 && atomic_cas(&hold_first_poll, 1, 0)) {
			k_sem_give(&poll_started);
			k_sem_take(&release_poll, K_FOREVER);
		}

		if (atomic_get(&script) == SCRIPT_ACK_RETRY && poll_index == 0) {
			struct fairway_complete_command command = {0};

			strcpy(command.request_id, action->request_id);
			strcpy(command.command_id, "command-1");
			fairway_runtime_scheduler_poll_finished(&scheduler,
				action->generation,
				FAIRWAY_COMMAND_RESULT_COMPLETE_RECEIVED, &command);
		} else {
			fairway_runtime_scheduler_poll_finished(&scheduler,
				action->generation, FAIRWAY_COMMAND_RESULT_POLL_EMPTY, NULL);
		}
	} else {
		int ack_index = atomic_inc(&ack_actions);

		if (strcmp(action->command_id, "command-1") != 0) {
			atomic_set(&retained_command_mismatch, 1);
		}
		fairway_runtime_scheduler_ack_finished(&scheduler, action->generation,
			ack_index == 0 ? FAIRWAY_COMMAND_RESULT_ACK_TRANSPORT_FAILURE :
				FAIRWAY_COMMAND_RESULT_COMPLETE_ACKED);
	}

	atomic_dec(&active_actions);
}

static void scheduler_worker(void *unused1, void *unused2, void *unused3)
{
	ARG_UNUSED(unused1);
	ARG_UNUSED(unused2);
	ARG_UNUSED(unused3);

	while (true) {
		struct fairway_command_action action;

		if (fairway_runtime_scheduler_next(&scheduler, true,
			atomic_get(&registered) != 0, atomic_get(&registered), &action)) {
			run_action(&action);
			continue;
		}
		k_sem_take(&scheduler_wake, K_FOREVER);
	}
}

K_THREAD_DEFINE(scheduler_worker_thread, 2048, scheduler_worker,
	NULL, NULL, NULL, 5, 0, 0);

static bool wait_for_state(enum fairway_command_state expected)
{
	int64_t deadline = k_uptime_get() + TEST_TIMEOUT_MS;

	while (k_uptime_get() < deadline) {
		struct fairway_command_telemetry telemetry;

		fairway_runtime_scheduler_telemetry(&scheduler, &telemetry);
		if (telemetry.state == expected) {
			return true;
		}
		k_sleep(K_MSEC(2));
	}
	return false;
}

#define CHECK(condition, message) do { \
	if (!(condition)) { \
		printk("FAIL: %s\n", message); \
		return 1; \
	} \
} while (false)

int main(void)
{
	struct fairway_command_telemetry telemetry;
	uint32_t first_generation;
	int64_t now_ms;

	fairway_runtime_scheduler_init(&scheduler, &scheduler_wake,
		POLL_INTERVAL_MS, ACTION_TIMEOUT_MS);
	atomic_set(&script, SCRIPT_ACK_RETRY);
	atomic_set(&hold_first_poll, 1);
	atomic_set(&registered, 0);
	now_ms = k_uptime_get();
	first_generation = fairway_runtime_scheduler_start(&scheduler,
		"request-1", now_ms, now_ms + 300);

	CHECK(wait_for_state(FAIRWAY_COMMAND_STATE_LTE_WAIT_POLL),
		"unregistered window did not enter LTE wait");
	atomic_set(&registered, 1);
	fairway_runtime_scheduler_wake(&scheduler);
	CHECK(k_sem_take(&poll_started, K_MSEC(TEST_TIMEOUT_MS)) == 0,
		"LTE recovery did not start the poll");

	fairway_runtime_scheduler_wake(&scheduler);
	fairway_runtime_scheduler_wake(&scheduler);
	fairway_runtime_scheduler_poll_finished(&scheduler, first_generation + 1,
		FAIRWAY_COMMAND_RESULT_POLL_EMPTY, NULL);
	k_sem_give(&release_poll);

	CHECK(wait_for_state(FAIRWAY_COMMAND_STATE_COMPLETE),
		"retained ACK retry did not complete");
	fairway_runtime_scheduler_telemetry(&scheduler, &telemetry);
	CHECK(telemetry.complete_received == 1, "COMPLETE was not retained");
	CHECK(telemetry.ack_attempts == 2 && telemetry.ack_failures == 1 &&
		telemetry.ack_successes == 1, "ACK retry counters are incorrect");
	CHECK(telemetry.lte_not_registered == 1 && telemetry.lte_recoveries == 1,
		"LTE transition counters are incorrect");
	CHECK(telemetry.stale_results == 1, "stale generation was not rejected");
	CHECK(atomic_get(&overlap_detected) == 0,
		"duplicate wakes overlapped command actions");
	CHECK(atomic_get(&retained_command_mismatch) == 0,
		"ACK retry lost the retained command ID");

	atomic_set(&script, SCRIPT_EMPTY_POLLS);
	atomic_set(&poll_actions, 0);
	atomic_set(&ack_actions, 0);
	now_ms = k_uptime_get();
	fairway_runtime_scheduler_start(&scheduler, "request-2", now_ms,
		now_ms + 95);
	CHECK(wait_for_state(FAIRWAY_COMMAND_STATE_EXPIRED),
		"timer-driven local expiry did not terminate the window");
	fairway_runtime_scheduler_telemetry(&scheduler, &telemetry);
	CHECK(telemetry.empty_responses >= 3, "repeated empty polls stopped early");
	CHECK(telemetry.timer_fires >= 3, "one-shot timer did not rearm");
	CHECK(telemetry.stop_reason == FAIRWAY_COMMAND_STOP_LOCAL_EXPIRY,
		"expiry stop reason is incorrect");

	printk("runtime scheduler integration tests passed\n");
	return 0;
}
