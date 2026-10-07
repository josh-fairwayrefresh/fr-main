#include "golfer_txn.h"

#include <string.h>

#include <zephyr/kernel.h>

struct golfer_txn {
	uint32_t generation;
	int64_t deadline_ms;
	int64_t press_time_ms;
	bool pending;
	bool done;
	bool done_result_ok;
	uint32_t done_generation;
	struct golfer_acceptance done_acceptance;
};
static struct golfer_txn golfer_txn;
static struct k_spinlock golfer_txn_lock;

uint32_t golfer_txn_accept(int64_t deadline_ms, int64_t press_time_ms)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);

	golfer_txn.generation++;
	uint32_t gen = golfer_txn.generation;

	golfer_txn.deadline_ms = deadline_ms;
	golfer_txn.press_time_ms = press_time_ms;
	golfer_txn.pending = true;
	golfer_txn.done = false;
	k_spin_unlock(&golfer_txn_lock, key);
	return gen;
}

bool golfer_txn_pickup(uint32_t *out_gen, int64_t *out_deadline_ms,
		       int64_t *out_press_time_ms)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);
	bool has = golfer_txn.pending;

	if (has) {
		golfer_txn.pending = false;
		*out_gen = golfer_txn.generation;
		*out_deadline_ms = golfer_txn.deadline_ms;
		*out_press_time_ms = golfer_txn.press_time_ms;
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

void golfer_txn_complete(uint32_t gen, bool success,
			 const struct golfer_acceptance *acceptance)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);

	golfer_txn.done = true;
	golfer_txn.done_result_ok = success;
	golfer_txn.done_generation = gen;
	memset(&golfer_txn.done_acceptance, 0, sizeof(golfer_txn.done_acceptance));
	if (success && acceptance != NULL) {
		golfer_txn.done_acceptance = *acceptance;
	}
	k_spin_unlock(&golfer_txn_lock, key);
}

bool golfer_txn_check_done(uint32_t gen, bool *out_success,
			   struct golfer_acceptance *acceptance)
{
	k_spinlock_key_t key = k_spin_lock(&golfer_txn_lock);
	bool matched = golfer_txn.done && golfer_txn.done_generation == gen;

	if (matched) {
		*out_success = golfer_txn.done_result_ok;
		if (acceptance != NULL) {
			*acceptance = golfer_txn.done_acceptance;
		}
		golfer_txn.done = false;
	}
	k_spin_unlock(&golfer_txn_lock, key);
	return matched;
}
