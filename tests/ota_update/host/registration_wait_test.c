#include <assert.h>
#include <pthread.h>
#include <stdbool.h>
#include <stdatomic.h>
#include <stdio.h>
#include <time.h>

#define K_FOREVER (-1)

static struct k_sem {
	pthread_mutex_t mutex;
	pthread_cond_t ready;
	pthread_cond_t progress;
	int count;
	int blocked;
	int completed;
	int takes;
} registration_ready_sem = {
	.mutex = PTHREAD_MUTEX_INITIALIZER,
	.ready = PTHREAD_COND_INITIALIZER,
	.progress = PTHREAD_COND_INITIALIZER,
};
static atomic_bool registered;

static bool modem_service_lte_is_registered(void)
{
	return atomic_load(&registered);
}

static void k_sem_take(struct k_sem *sem, int timeout)
{
	assert(timeout == K_FOREVER);
	pthread_mutex_lock(&sem->mutex);
	sem->takes++;
	while (sem->count == 0) {
		sem->blocked++;
		pthread_cond_broadcast(&sem->progress);
		pthread_cond_wait(&sem->ready, &sem->mutex);
		sem->blocked--;
	}
	sem->count--;
	pthread_mutex_unlock(&sem->mutex);
}

static void k_sem_give(struct k_sem *sem)
{
	pthread_mutex_lock(&sem->mutex);
	sem->count = 1;
	pthread_cond_signal(&sem->ready);
	pthread_mutex_unlock(&sem->mutex);
}

void modem_service_wait_for_lte_registration(void);

static void *worker(void *unused)
{
	(void)unused;
	modem_service_wait_for_lte_registration();
	pthread_mutex_lock(&registration_ready_sem.mutex);
	registration_ready_sem.completed++;
	pthread_cond_broadcast(&registration_ready_sem.progress);
	pthread_mutex_unlock(&registration_ready_sem.mutex);
	return NULL;
}

static void wait_for_progress(int completed, int blocked)
{
	struct timespec deadline;
	assert(clock_gettime(CLOCK_REALTIME, &deadline) == 0);
	deadline.tv_sec += 5;
	pthread_mutex_lock(&registration_ready_sem.mutex);
	while (registration_ready_sem.completed != completed ||
	       registration_ready_sem.blocked != blocked) {
		assert(pthread_cond_timedwait(&registration_ready_sem.progress,
			&registration_ready_sem.mutex, &deadline) == 0);
	}
	pthread_mutex_unlock(&registration_ready_sem.mutex);
}

int main(void)
{
	pthread_t first, second;
	for (int cycle = 0; cycle < 2; cycle++) {
		atomic_store(&registered, false);
		assert(pthread_create(&first, NULL, worker, NULL) == 0);
		assert(pthread_create(&second, NULL, worker, NULL) == 0);
		wait_for_progress(cycle * 2, 2);
		assert(registration_ready_sem.takes == (cycle == 0 ? 2 : 5));
		atomic_store(&registered, true);
		k_sem_give(&registration_ready_sem);
		wait_for_progress((cycle + 1) * 2, 0);
		assert(pthread_join(first, NULL) == 0);
		assert(pthread_join(second, NULL) == 0);
	}
	puts("PASS: real registration wait releases both boot workers and handles reconnect without polling");
	return 0;
}
