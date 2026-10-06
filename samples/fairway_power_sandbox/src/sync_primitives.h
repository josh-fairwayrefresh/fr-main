#ifndef SYNC_PRIMITIVES_H
#define SYNC_PRIMITIVES_H

#include <zephyr/kernel.h>

/*
 * The only two synchronization primitives genuinely touched from more than
 * one module in more than one simple way (button_ux's ISR gives
 * button_wake_sem; main's orchestrator loop both takes it with varying
 * timeouts and owns the golfer sequencing; transaction_scheduler gives it
 * on completion and waits on txn_wake_sem). Every other cross-module signal
 * is wrapped behind a named function in its owning module's header instead
 * of exposing a raw semaphore.
 *
 * Defined (non-static) in main.c, which runs before any other thread can
 * meaningfully observe them; declared extern here so every translation
 * unit sees the same underlying object. K_SEM_DEFINE-backed objects have
 * static storage duration and are valid before main() runs, so auto-started
 * K_THREAD_DEFINE threads in other modules may safely reference them from
 * their very first instruction.
 */
extern struct k_sem button_wake_sem;
extern struct k_sem txn_wake_sem;

#endif /* SYNC_PRIMITIVES_H */
