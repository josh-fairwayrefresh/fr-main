#include "golfer_txn.h"

#include <string.h>

#include <zephyr/kernel.h>

struct golfer_txn {
	uint32_t generation;
	int64_t deadline_ms;
	bool pending;
	bool done;
	bool done_result_ok;
	uint32_t done_generation;
	char done_request_id[FAIRWAY_REQUEST_ID_MAX];
};
static struct golfer_txn golfer_txn;
static struct k_spinlock golfer_txn_lock;

uint32_t golfer_txn_accept(int64_t deadline_ms)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);

	golfer_txn.generation++;
	uint32_t gen = golfer_txn.generation;

	golfer_txn.deadline_ms = deadline_ms;
	golfer_txn.pending = true;
	golfer_txn.done = false;
	k_spin_unlock(&golfer_txn_lock, key);
	return gen;
}

bool golfer_txn_pickup(uint32_t *out_gen, int64_t *out_deadline_ms)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);
	bool has = golfer_txn.pending;

	if (has) {
		golfer_txn.pending = false;
		*out_gen = golfer_txn.generation;
		*out_deadline_ms = golfer_txn.deadline_ms;
	}
	k_spin_unlock(&golfer_txn_lock, key);
	return has;
}

bool golfer_txn_is_pending(void)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);
	bool p = golfer_txn.pending;

	k_spin_unlock(&golfer_txn_lock, key);
	return p;
}

void golfer_txn_complete(uint32_t gen, bool success, const char *request_id)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);

	golfer_txn.done = true;
	golfer_txn.done_result_ok = success;
	golfer_txn.done_generation = gen;
	golfer_txn.done_request_id[0] = '\0';
	if (success && request_id != NULL) {
		strncpy(golfer_txn.done_request_id, request_id,
			sizeof(golfer_txn.done_request_id));
		golfer_txn.done_request_id[sizeof(golfer_txn.done_request_id) - 1] = '\0';
	}
	k_spin_unlock(&golfer_txn_lock, key);
}

bool golfer_txn_check_done(uint32_t gen, bool *out_success,
			   char *request_id, size_t request_id_len)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);
	bool matched = golfer_txn.done && golfer_txn.done_generation == gen;

	if (matched) {
		*out_success = golfer_txn.done_result_ok;
		strncpy(request_id, golfer_txn.done_request_id, request_id_len);
		request_id[request_id_len - 1] = '\0';
		golfer_txn.done = false;
	}
	k_spin_unlock(&golfer_txn_lock, key);
	return matched;
}
