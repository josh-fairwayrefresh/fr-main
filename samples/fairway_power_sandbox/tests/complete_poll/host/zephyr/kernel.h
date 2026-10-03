#ifndef FAIRWAY_HOST_ZEPHYR_KERNEL_H
#define FAIRWAY_HOST_ZEPHYR_KERNEL_H

#include <stddef.h>
#include <stdint.h>

#define ARG_UNUSED(value) ((void)(value))
#define K_NO_WAIT 0
#define K_MSEC(ms) (ms)
#define MAX(a, b) ((a) > (b) ? (a) : (b))

struct k_sem {
	unsigned int count;
	unsigned int limit;
};

struct k_timer {
	void (*expiry)(struct k_timer *timer);
	int64_t delay_ms;
	int64_t period_ms;
	int active;
};

struct k_spinlock {
	int unused;
};

typedef unsigned int k_spinlock_key_t;

#define K_SEM_DEFINE(name, initial_count, count_limit) \
	struct k_sem name = { initial_count, count_limit }

#define K_TIMER_DEFINE(name, expiry_fn, stop_fn) \
	struct k_timer name = { expiry_fn, 0, 0, 0 }

static inline k_spinlock_key_t k_spin_lock(struct k_spinlock *lock)
{
	ARG_UNUSED(lock);
	return 0;
}

static inline void k_spin_unlock(struct k_spinlock *lock, k_spinlock_key_t key)
{
	ARG_UNUSED(lock);
	ARG_UNUSED(key);
}

static inline void k_sem_give(struct k_sem *sem)
{
	if (sem->count < sem->limit) {
		sem->count++;
	}
}

static inline void k_sem_reset(struct k_sem *sem)
{
	sem->count = 0;
}

static inline void k_timer_start(struct k_timer *timer, int64_t delay_ms,
				 int64_t period_ms)
{
	timer->delay_ms = delay_ms;
	timer->period_ms = period_ms;
	timer->active = 1;
}

static inline void k_timer_stop(struct k_timer *timer)
{
	timer->active = 0;
}

#endif