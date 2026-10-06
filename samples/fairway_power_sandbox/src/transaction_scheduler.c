#include "transaction_scheduler.h"

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

#include "command_protocol.h"
#include "complete_poll.h"
#include "demand_window.h"
#include "golfer_protocol.h"
#include "golfer_txn.h"
#include "modem_service.h"
#include "sync_primitives.h"
#include "thread_priorities.h"

LOG_MODULE_REGISTER(transaction_scheduler);

#define TRANSACTION_THREAD_STACK_SIZE     3072
#define COMMAND_HTTP_TIMEOUT_MS            12000

static void transaction_thread_entry(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);

	while (1) {
		uint32_t gen;
		int64_t deadline_ms;
		struct complete_poll_action command_action;
		bool have_golfer = golfer_txn_pickup(&gen, &deadline_ms);
		bool have_command = !have_golfer &&
			complete_poll_next_action(k_uptime_get(), modem_service_lte_is_registered(),
						  &command_action);

		if (!have_golfer && !have_command) {
			k_sem_take(&txn_wake_sem, K_FOREVER);
			continue;
		}

		if (have_golfer) {
			char request_id[FAIRWAY_REQUEST_ID_MAX];

			int ret = golfer_protocol_run_transaction(deadline_ms, request_id,
							  sizeof(request_id));

			golfer_txn_complete(gen, ret == 0, request_id);
			k_sem_give(&button_wake_sem);

			continue;
		}

		if (have_command) {
			int64_t command_deadline_ms = MIN(command_action.deadline_ms,
							 k_uptime_get() + COMMAND_HTTP_TIMEOUT_MS);
			int ret;

			if (command_action.type == COMPLETE_ACTION_POLL) {
				struct fairway_complete_command command = {0};

				ret = command_protocol_send_poll(command_action.request_id,
								 &command, command_deadline_ms);
				complete_poll_poll_finished(command_action.generation,
							    k_uptime_get(), ret,
							    command.command_id[0] == '\0' ? NULL : &command);
			} else {
				ret = command_protocol_send_ack(&command_action.command,
								command_deadline_ms);
				if (complete_poll_ack_finished(command_action.generation,
							       k_uptime_get(), ret) &&
				    demand_window_clear_if_matches(command_action.generation,
							   command_action.request_id,
							   k_uptime_get())) {
					LOG_INF("COMPLETE acknowledged for request %s",
						command_action.request_id);
				}
			}
			continue;
		}
	}
}
K_THREAD_DEFINE(transaction_thread, TRANSACTION_THREAD_STACK_SIZE,
		transaction_thread_entry, NULL, NULL, NULL,
		TRANSACTION_THREAD_PRIORITY, 0, 0);
