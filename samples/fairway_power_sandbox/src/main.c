/*
 * Fairway Refresh button-request orchestrator.
 *
 * This file wires together focused modules (see each header for its
 * owned concern) and contains only the golfer button/LED sequencing
 * itself:
 *   power_policy        - VBUS/BUCK2/PSM/Errata-36 awake keeper
 *   modem_service        - modem/cert/LTE bring-up, registration-triggered
 *                           DNS prewarm, PSM request/withdraw
 *   http_transport        - DNS cache/resolver + bounded HTTPS primitive
 *   golfer_txn            - the accepted-transaction handoff/completion state
 *   golfer_protocol       - the golfer button_press wire protocol + retries
 *   button_ux             - button GPIO/ISR + three indicator LEDs
 *   transaction_scheduler - sole owner of the shared transport for golfer
 *                           and COMPLETE, auto-started
 *   complete_poll/demand_window/command_protocol - unchanged, pre-existing
 *
 * Approved Monarch Bay Pilot golfer UX (see docs/UX_SPECIFICATION.md,
 * "Final Monarch Bay Pilot Golfer UX"):
 *   Startup:
 *     Orange flashes 3 times
 *
 *   IDLE:
 *     All three indicators off
 *
 *   Valid press, no active demand window:
 *     Orange begins immediately and pulses for the unresolved transaction
 *     SUCCESS: orange off; green blink-blink then ~5 s solid; starts a local
 *       5-minute demand window from the original accepted press time
 *     FAILURE: orange off; red blink-blink then ~5 s solid; no demand window
 *     Return to IDLE
 *
 *   Valid press during an active 5-minute demand window:
 *     No orange, no new transaction, no new request; immediate green
 *     blink-blink then ~5 s solid; increments a local repeat-press counter
 *     on the originating transaction (preparatory state only; backend
 *     transport/persistence is a later work package, not implemented here)
 */

#include <zephyr/device.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/pm/device_runtime.h>

#include "button_ux.h"
#include "command_protocol.h"
#include "complete_poll.h"
#include "demand_window.h"
#include "golfer_txn.h"
#include "modem_service.h"
#include "power_policy.h"
#include "sync_primitives.h"
#include "thread_priorities.h"
#include "transaction_scheduler.h"

LOG_MODULE_REGISTER(main);

static const struct device *uart0_dev = DEVICE_DT_GET(DT_CHOSEN(zephyr_console));

#define GOLFER_TRANSACTION_BUDGET_MS      15000
#define BUTTON_REARM_SETTLE_MS            250

/* Continuous orange pulse cadence while a golfer transaction is unresolved;
 * reuses the previously validated initial-acknowledgement flash timing.
 */
#define ORANGE_PULSE_ON_MS       80
#define ORANGE_PULSE_OFF_MS      85

/* Canonical Monarch Bay Pilot golfer demand window (docs/UX_SPECIFICATION.md,
 * "Five-Minute Golfer Demand Window"), mirroring the backend's DEMAND_WINDOW_MS
 * (fairway_backend/cloudrun_receiver/lib/fleet/schema.js). Firmware-local
 * only; no shared code with the backend.
 */
#define DEMAND_WINDOW_MS         (5 * 60 * 1000)

/* Non-static: shared via sync_primitives.h with button_ux's ISR and the
 * transaction scheduler. See that header for why these two (and only
 * these two) are raw externs rather than function-wrapped.
 */
K_SEM_DEFINE(button_wake_sem, 0, 1);
K_SEM_DEFINE(txn_wake_sem, 0, 1);

BUILD_ASSERT(CONFIG_MAIN_THREAD_PRIORITY < TRANSACTION_THREAD_PRIORITY,
	     "button thread must always outrank the transaction scheduler");
BUILD_ASSERT(TRANSACTION_THREAD_PRIORITY < MODEM_SERVICE_THREAD_PRIORITY,
	     "transaction scheduler must always outrank background maintenance");
BUILD_ASSERT(MODEM_SERVICE_THREAD_PRIORITY < DNS_RESOLVER_THREAD_PRIORITY,
	     "background maintenance must always outrank isolated helpers");

typedef enum {
	STATE_IDLE = 0,
	STATE_BUTTON_ACK,
	STATE_TRANSMITTING,
	STATE_SUCCESS,
	STATE_FAILURE,
	STATE_REPEAT_PRESS,
} app_state_t;

static app_state_t state = STATE_IDLE;

static void set_state(app_state_t new_state)
{
	state = new_state;

	switch (state) {
	case STATE_IDLE:
		LOG_INF("STATE_IDLE");
		break;
	case STATE_BUTTON_ACK:
		LOG_INF("STATE_BUTTON_ACK");
		break;
	case STATE_TRANSMITTING:
		LOG_INF("STATE_TRANSMITTING");
		break;
	case STATE_SUCCESS:
		LOG_INF("STATE_SUCCESS");
		break;
	case STATE_FAILURE:
		LOG_INF("STATE_FAILURE");
		break;
	case STATE_REPEAT_PRESS:
		LOG_INF("STATE_REPEAT_PRESS");
		break;
	default:
		LOG_WRN("Unknown state: %d", state);
		break;
	}
}

int main(void)
{
	int ret;

	demand_window_init();
	complete_poll_init(&txn_wake_sem);

	if (!device_is_ready(uart0_dev)) {
		return 0;
	}

	ret = pm_device_runtime_enable(uart0_dev);
	if (ret < 0) {
		LOG_ERR("UART runtime PM initialization failed: %d", ret);
		return 0;
	}

	ret = power_policy_init();
	if (ret < 0) {
		LOG_ERR("Power policy initialization failed: %d", ret);
		return 0;
	}

	LOG_INF("Fairway Refresh state-machine feedback test starting");

	/* Local hardware first: button/LED GPIO, callback, and interrupt are
	 * configured and armed, and this thread reaches its event loop,
	 * before any modem/network call is made -- the golfer button is live
	 * regardless of what modem_service does next or how long it takes.
	 */
	ret = button_ux_init(&button_wake_sem);
	if (ret < 0) {
		LOG_ERR("Button/indicator initialization failed: %d", ret);
		return 0;
	}

	button_ux_startup_flash();

	set_state(STATE_IDLE);

	/* Releases modem_service to begin modem/PSM/cert/LTE work. This is
	 * the only interaction with modem_service at boot; this thread
	 * never waits on anything from it.
	 */
	modem_service_notify_local_hw_ready();

	LOG_INF("Ready. Waiting in low-power idle for button wake.");

	while (1) {
		k_sem_take(&button_wake_sem, K_FOREVER);

		if (!button_ux_take_press_pending()) {
			continue;
		}

		LOG_INF("BUTTON_WAKE detected");
		power_policy_set_interaction_awake(true);

		int64_t press_time_ms = k_uptime_get();

		/* Active five-minute golfer demand window (docs/UX_SPECIFICATION.md,
		 * "Five-Minute Golfer Demand Window"): a valid press before the
		 * window's expiry is a same-group repeat, not a new golfer demand
		 * event. It never touches golfer_txn/txn_wake_sem -- no new
		 * transaction, no new request -- and is purely a local indicator
		 * echo plus a local counter increment. Naturally becomes false
		 * once press_time_ms reaches expires_at_ms, regardless of the
		 * stale `active` flag left over from the originating success.
		 */
		uint32_t repeat_press_count;
		if (demand_window_repeat_press(press_time_ms, &repeat_press_count)) {
			LOG_INF("REPEAT_PRESS within demand window: count=%u",
				repeat_press_count);

			button_ux_set_interrupt_enabled(false);

			set_state(STATE_REPEAT_PRESS);
			button_ux_show_success_feedback();

			k_sleep(K_MSEC(BUTTON_REARM_SETTLE_MS));
			button_ux_set_interrupt_enabled(true);
			power_policy_set_interaction_awake(false);
			set_state(STATE_IDLE);
			continue;
		}

		/* Keep switch bounce from queuing a second press during the
		 * active transaction; re-armed only after terminal feedback
		 * plus BUTTON_REARM_SETTLE_MS below.
		 */
		button_ux_set_interrupt_enabled(false);

		/* The hard 15-second deadline begins at acceptance, before the
		 * acknowledgement animation runs.
		 */
		int64_t accept_time_ms = press_time_ms;
		int64_t deadline_ms = accept_time_ms + GOLFER_TRANSACTION_BUDGET_MS;
		uint32_t my_gen = golfer_txn_accept(deadline_ms);

		set_state(STATE_TRANSMITTING);

		/* Canonical local acknowledgement begins here (orange physically
		 * turns on) -- strictly before the scheduler is released, so
		 * network/transaction work can never start ahead of the golfer's
		 * visible acknowledgement. The 15-second deadline above is
		 * unaffected: it was already fixed at acceptance, not here.
		 */
		button_ux_orange_on();
		k_sem_give(&txn_wake_sem);

		bool got_result = false;
		bool success = false;
		bool orange_lit = true;
		char request_id[FAIRWAY_REQUEST_ID_MAX];

		/* Orange pulses continuously for the whole unresolved transaction
		 * (docs/UX_SPECIFICATION.md: "pulses while the transaction is
		 * unresolved"), reusing the previously validated brief-flash
		 * cadence. Waiting is chunked to one pulse half-cycle at a time
		 * instead of the full remaining budget so the indicator can keep
		 * toggling; golfer_txn_check_done() is still checked on every
		 * wake (whether from a genuine completion signal or a pulse-phase
		 * timeout), so a real completion is still reacted to immediately,
		 * exactly as before this change. Only reaching the outer
		 * 15-second deadline itself (not a pulse-phase timeout) produces
		 * the defensive FAILURE fallback.
		 */
		while (1) {
			int64_t remaining_ms = deadline_ms - k_uptime_get();

			if (remaining_ms <= 0) {
				break;
			}

			int64_t phase_ms = orange_lit ? ORANGE_PULSE_ON_MS : ORANGE_PULSE_OFF_MS;
			int64_t wait_ms = (remaining_ms < phase_ms) ? remaining_ms : phase_ms;

			if (k_sem_take(&button_wake_sem, K_MSEC(wait_ms)) == 0) {
				if (golfer_txn_check_done(my_gen, &success, request_id,
							 sizeof(request_id))) {
					got_result = true;
					break;
				}
				/* Spurious wake (e.g. a completion signal for an
				 * already-expired generation): keep pulsing within
				 * the same bounded deadline.
				 */
				continue;
			}

			/* This pulse phase elapsed with no completion yet. */
			orange_lit = !orange_lit;
			if (orange_lit) {
				button_ux_orange_on();
			} else {
				button_ux_orange_off();
			}
		}

		button_ux_orange_off();

		if (got_result && success) {
			int64_t demand_deadline_ms = accept_time_ms + DEMAND_WINDOW_MS;

			demand_window_start(my_gen, request_id, demand_deadline_ms);
			complete_poll_start(my_gen, request_id, accept_time_ms,
					    demand_deadline_ms);
			set_state(STATE_SUCCESS);
			button_ux_show_success_feedback();
		} else {
			/* Local defensive deadline: guarantees a terminal
			 * disposition even in the unforeseen case that the
			 * transaction scheduler itself does not report back in
			 * time. Failure never establishes a demand window.
			 */
			set_state(STATE_FAILURE);
			button_ux_show_failure_feedback();
		}

		k_sleep(K_MSEC(BUTTON_REARM_SETTLE_MS));
		button_ux_set_interrupt_enabled(true);
		power_policy_set_interaction_awake(false);
		set_state(STATE_IDLE);
		button_ux_all_off();
	}

	return 0;
}

