#ifndef TRANSACTION_SCHEDULER_H
#define TRANSACTION_SCHEDULER_H

/*
 * Golfer-first transaction scheduler: the sole owner of the shared
 * product network transport (via http_transport) for golfer and COMPLETE
 * flows. Fully self-contained -- its K_THREAD_DEFINE auto-starts and it
 * reaches golfer_txn/complete_poll/golfer_protocol/command_protocol and the
 * shared button_wake_sem/txn_wake_sem directly, so no init call is needed
 * from main(). This header exists only so main.c can state its ownership
 * explicitly alongside the other modules.
 */

#endif /* TRANSACTION_SCHEDULER_H */
