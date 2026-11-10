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
#define K_SECONDS(seconds) ((int64_t)(seconds) * 1000)
#define K_MSEC(ms) (ms)
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

struct k_sem { int unused; };
struct k_thread { int unused; };
#define K_SEM_DEFINE(name, initial, limit) struct k_sem name
#define K_THREAD_STACK_DEFINE(name, size) char name[size]
#define K_THREAD_STACK_SIZEOF(name) sizeof(name)
#define K_NO_WAIT 0
static inline int k_sem_take(struct k_sem *sem, int64_t timeout)
{
	ARG_UNUSED(sem); ARG_UNUSED(timeout); return 0;
}
static inline void k_sem_give(struct k_sem *sem) { ARG_UNUSED(sem); }
void ota_worker_test_sleep(int64_t ms);
static inline void k_sleep(int64_t ms) { ota_worker_test_sleep(ms); }
static inline void k_thread_create(struct k_thread *thread, char *stack,
	size_t size, void (*entry)(void *, void *, void *), void *a, void *b,
	void *c, int priority, int options, int delay)
{
	ARG_UNUSED(thread); ARG_UNUSED(stack); ARG_UNUSED(size); ARG_UNUSED(entry);
	ARG_UNUSED(a); ARG_UNUSED(b); ARG_UNUSED(c); ARG_UNUSED(priority);
	ARG_UNUSED(options); ARG_UNUSED(delay);
}
static inline void k_thread_name_set(struct k_thread *thread, const char *name)
{
	ARG_UNUSED(thread); ARG_UNUSED(name);
}

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
