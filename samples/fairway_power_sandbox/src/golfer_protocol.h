#ifndef GOLFER_PROTOCOL_H
#define GOLFER_PROTOCOL_H

#include <stddef.h>
#include <stdbool.h>
#include <stdint.h>

#include "command_protocol.h"
#include "golfer_acceptance.h"

bool golfer_protocol_parse_acceptance(char *body, size_t body_len,
				      struct golfer_acceptance *acceptance);

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
				    int64_t press_time_ms,
				    struct golfer_acceptance *acceptance);

#endif /* GOLFER_PROTOCOL_H */
