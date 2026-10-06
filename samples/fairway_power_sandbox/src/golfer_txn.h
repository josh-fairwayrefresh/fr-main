#ifndef GOLFER_TXN_H
#define GOLFER_TXN_H

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

#include "command_protocol.h"

/*
 * Coherent golfer transaction handoff/completion state. A reader must
 * never observe a generation paired with a mismatched deadline/result, so
 * every field is read/written as a single locked unit internally; callers
 * only ever see it through the accessors below.
 */

/* button_ux/main: accept a newly-validated press. Allocates a fresh
 * generation and commits the absolute deadline as one coherent unit.
 */
uint32_t golfer_txn_accept(int64_t deadline_ms);

/* transaction_scheduler: pick up a pending press, if any. */
bool golfer_txn_pickup(uint32_t *out_gen, int64_t *out_deadline_ms);

/* COMPLETE yield checkpoints (http_transport): true only while a press is
 * accepted but not yet picked up by the transaction scheduler (i.e. still
 * waiting its turn).
 */
bool golfer_txn_is_pending(void);

/* transaction_scheduler: post a terminal result for a specific generation. */
void golfer_txn_complete(uint32_t gen, bool success, const char *request_id);

/* main: consume a matching completion for gen, if one is ready. A
 * completion tagged with any other (older) generation does not match and
 * is left untouched -- it belongs to an already-expired transaction.
 */
bool golfer_txn_check_done(uint32_t gen, bool *out_success,
			   char *request_id, size_t request_id_len);

#endif /* GOLFER_TXN_H */
