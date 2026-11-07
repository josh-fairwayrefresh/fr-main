#ifndef FAIRWAY_OTA_HOST_ZEPHYR_KERNEL_H
#define FAIRWAY_OTA_HOST_ZEPHYR_KERNEL_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

struct k_mutex {
	int unused;
};

#define K_MUTEX_DEFINE(name) struct k_mutex name __attribute__((unused))
#define K_FOREVER 0
#define K_SECONDS(seconds) (seconds)
#define ARG_UNUSED(value) ((void)(value))
#define MIN(left, right) ((left) < (right) ? (left) : (right))
#define __aligned(alignment) __attribute__((aligned(alignment)))

static inline int k_mutex_lock(struct k_mutex *mutex, int timeout)
{
	ARG_UNUSED(mutex);
	ARG_UNUSED(timeout);
	return 0;
}

static inline int k_mutex_unlock(struct k_mutex *mutex)
{
	ARG_UNUSED(mutex);
	return 0;
}

struct k_work {
	void (*handler)(struct k_work *work);
};

struct k_work_delayable {
	struct k_work work;
	bool scheduled;
	int delay;
};

extern struct k_work_delayable *ota_test_scheduled_work;

static inline void k_work_init_delayable(struct k_work_delayable *work,
					 void (*handler)(struct k_work *))
{
	work->work.handler = handler;
	work->scheduled = false;
	work->delay = 0;
}

static inline int k_work_schedule(struct k_work_delayable *work, int delay)
{
	work->scheduled = true;
	work->delay = delay;
	ota_test_scheduled_work = work;
	return 1;
}

static inline int k_work_cancel_delayable(struct k_work_delayable *work)
{
	work->scheduled = false;
	if (ota_test_scheduled_work == work) {
		ota_test_scheduled_work = NULL;
	}
	return 0;
}

#endif
