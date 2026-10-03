#include "complete_poll.h"

#include <string.h>

static struct complete_poll_snapshot poll;
static struct k_spinlock poll_lock;
static struct k_sem *poll_wake_sem;

static void timer_expiry(struct k_timer *timer)
{
	ARG_UNUSED(timer);

	if (poll_wake_sem != NULL) {
		k_sem_give(poll_wake_sem);
	}
}

K_TIMER_DEFINE(poll_timer, timer_expiry, NULL);

static bool state_is_terminal(void)
{
	return poll.state == COMPLETE_POLL_INACTIVE ||
	       poll.state == COMPLETE_POLL_COMPLETE ||
	       poll.state == COMPLETE_POLL_EXPIRED;
}

static void expire_if_due(int64_t now_ms)
{
	if (!state_is_terminal() && now_ms >= poll.deadline_ms) {
		poll.state = COMPLETE_POLL_EXPIRED;
	}
}

static void advance_target_after(int64_t now_ms)
{
	do {
		poll.next_target_ms += COMPLETE_POLL_INTERVAL_MS;
	} while (poll.next_target_ms <= now_ms &&
		 poll.next_target_ms < poll.deadline_ms);
}

static void arm_timer(int64_t now_ms)
{
	int64_t wake_at_ms;

	if (state_is_terminal()) {
		k_timer_stop(&poll_timer);
		return;
	}

	switch (poll.state) {
	case COMPLETE_POLL_WAIT:
		wake_at_ms = poll.next_target_ms;
		break;
	case COMPLETE_ACK_WAIT:
		wake_at_ms = poll.next_action_ms;
		break;
	case COMPLETE_LTE_WAIT_POLL:
	case COMPLETE_LTE_WAIT_ACK:
		wake_at_ms = poll.next_target_ms;
		break;
	case COMPLETE_POLL_IN_FLIGHT:
	case COMPLETE_ACK_IN_FLIGHT:
		wake_at_ms = poll.deadline_ms;
		break;
	default:
		k_timer_stop(&poll_timer);
		return;
	}

	if (wake_at_ms > poll.deadline_ms) {
		wake_at_ms = poll.deadline_ms;
	}
	k_timer_start(&poll_timer, K_MSEC(MAX(wake_at_ms - now_ms, 0)), K_NO_WAIT);
}

static void fill_action(enum complete_poll_action_type type,
			struct complete_poll_action *action)
{
	*action = (struct complete_poll_action){
		.type = type,
		.generation = poll.generation,
		.deadline_ms = poll.deadline_ms,
		.command = poll.command,
	};
	strcpy(action->request_id, poll.request_id);
}

void complete_poll_init(struct k_sem *wake_sem)
{
	k_spinlock_key_t key = k_spin_lock(&poll_lock);

	k_timer_stop(&poll_timer);
	memset(&poll, 0, sizeof(poll));
	poll_wake_sem = wake_sem;
	k_spin_unlock(&poll_lock, key);
}

bool complete_poll_start(uint32_t generation, const char *request_id,
			 int64_t timeline_start_ms, int64_t deadline_ms)
{
	if (request_id == NULL || request_id[0] == '\0' ||
	    strlen(request_id) >= sizeof(poll.request_id) ||
	    timeline_start_ms >= deadline_ms) {
		return false;
	}

	k_spinlock_key_t key = k_spin_lock(&poll_lock);

	poll = (struct complete_poll_snapshot){
		.state = COMPLETE_POLL_WAIT,
		.generation = generation,
		.deadline_ms = deadline_ms,
		.next_target_ms = timeline_start_ms + COMPLETE_POLL_INTERVAL_MS,
	};
	strcpy(poll.request_id, request_id);
	arm_timer(timeline_start_ms);
	k_spin_unlock(&poll_lock, key);
	return true;
}

bool complete_poll_next_action(int64_t now_ms, bool lte_registered,
			       struct complete_poll_action *action)
{
	if (action == NULL) {
		return false;
	}

	k_spinlock_key_t key = k_spin_lock(&poll_lock);

	expire_if_due(now_ms);
	bool ready = false;

	if (poll.state == COMPLETE_LTE_WAIT_POLL ||
	    poll.state == COMPLETE_LTE_WAIT_ACK) {
		if (lte_registered) {
			enum complete_poll_action_type type =
				poll.state == COMPLETE_LTE_WAIT_POLL ?
				COMPLETE_ACTION_POLL : COMPLETE_ACTION_ACK;

			fill_action(type, action);
			poll.state = type == COMPLETE_ACTION_POLL ?
				COMPLETE_POLL_IN_FLIGHT : COMPLETE_ACK_IN_FLIGHT;
			if (now_ms >= poll.next_target_ms) {
				advance_target_after(now_ms);
			}
			ready = true;
		} else if (now_ms >= poll.next_target_ms) {
			advance_target_after(now_ms);
		}

		arm_timer(now_ms);
		k_spin_unlock(&poll_lock, key);
		return ready;
	}

	if (poll.state == COMPLETE_POLL_WAIT && now_ms >= poll.next_target_ms) {
		if (!lte_registered) {
			poll.state = COMPLETE_LTE_WAIT_POLL;
			advance_target_after(now_ms);
		} else {
			fill_action(COMPLETE_ACTION_POLL, action);
			poll.state = COMPLETE_POLL_IN_FLIGHT;
			advance_target_after(now_ms);
			ready = true;
		}
	} else if (poll.state == COMPLETE_ACK_WAIT && now_ms >= poll.next_action_ms) {
		if (!lte_registered) {
			poll.state = COMPLETE_LTE_WAIT_ACK;
			if (now_ms >= poll.next_target_ms) {
				advance_target_after(now_ms);
			}
		} else {
			fill_action(COMPLETE_ACTION_ACK, action);
			poll.state = COMPLETE_ACK_IN_FLIGHT;
			if (now_ms >= poll.next_target_ms) {
				advance_target_after(now_ms);
			}
			ready = true;
		}
	}

	arm_timer(now_ms);
	k_spin_unlock(&poll_lock, key);
	return ready;
}

void complete_poll_poll_finished(uint32_t generation, int64_t now_ms, int result,
				 const struct fairway_complete_command *command)
{
	k_spinlock_key_t key = k_spin_lock(&poll_lock);

	if (poll.generation != generation || poll.state != COMPLETE_POLL_IN_FLIGHT) {
		k_spin_unlock(&poll_lock, key);
		return;
	}

	expire_if_due(now_ms);
	if (poll.state == COMPLETE_POLL_EXPIRED) {
		arm_timer(now_ms);
		k_spin_unlock(&poll_lock, key);
		return;
	}

	bool correlated = result == 0 && command != NULL &&
			  command->command_id[0] != '\0' &&
			  strcmp(command->request_id, poll.request_id) == 0;

	if (correlated) {
		poll.command = *command;
		poll.next_action_ms = now_ms;
		poll.state = COMPLETE_ACK_WAIT;
	} else {
		poll.state = COMPLETE_POLL_WAIT;
	}
	arm_timer(now_ms);
	k_spin_unlock(&poll_lock, key);
}

bool complete_poll_ack_finished(uint32_t generation, int64_t now_ms, int result)
{
	k_spinlock_key_t key = k_spin_lock(&poll_lock);

	if (poll.generation != generation || poll.state != COMPLETE_ACK_IN_FLIGHT) {
		k_spin_unlock(&poll_lock, key);
		return false;
	}

	expire_if_due(now_ms);
	bool confirmed = poll.state != COMPLETE_POLL_EXPIRED && result == 0;

	if (confirmed) {
		poll.state = COMPLETE_POLL_COMPLETE;
	} else if (poll.state != COMPLETE_POLL_EXPIRED) {
		poll.next_action_ms = poll.next_target_ms;
		poll.state = COMPLETE_ACK_WAIT;
	}
	arm_timer(now_ms);
	k_spin_unlock(&poll_lock, key);
	return confirmed;
}

void complete_poll_signal(void)
{
	if (poll_wake_sem != NULL) {
		k_sem_give(poll_wake_sem);
	}
}

struct complete_poll_snapshot complete_poll_get_snapshot(int64_t now_ms)
{
	k_spinlock_key_t key = k_spin_lock(&poll_lock);

	expire_if_due(now_ms);
	struct complete_poll_snapshot snapshot = poll;

	arm_timer(now_ms);
	k_spin_unlock(&poll_lock, key);
	return snapshot;
}