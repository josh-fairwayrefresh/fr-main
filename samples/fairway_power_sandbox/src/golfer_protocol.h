#ifndef GOLFER_PROTOCOL_H
#define GOLFER_PROTOCOL_H

#include <stddef.h>
#include <stdint.h>

#include "command_protocol.h"

/*
 * Runs the golfer's accepted transaction to terminal disposition within
 * the single absolute txn_deadline_ms established at acceptance time.
 * Every attempt and every stage inside the shared transport computes its
 * own remaining time from this same deadline -- no attempt ever resets or
 * extends it.
 *
 * Return value convention matches http_transport_send(): 0 on success,
 * -EACCES on a terminal HTTP rejection, anything else retryable within the
 * attempt budget.
 */
int golfer_protocol_run_transaction(int64_t txn_deadline_ms,
				    char *request_id, size_t request_id_len);

#endif /* GOLFER_PROTOCOL_H */
