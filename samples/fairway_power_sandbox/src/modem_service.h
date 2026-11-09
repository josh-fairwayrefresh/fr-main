#ifndef MODEM_SERVICE_H
#define MODEM_SERVICE_H

#include <stdbool.h>

#include <zephyr/kernel.h>

/*
 * Owns modem init, Cloud Run CA certificate provisioning, LTE connect and
 * registration-event handling, and registration-triggered DNS prewarm.
 * Also owns LTE PSM configuration and requests; PSM is independent of VBUS
 * and its lifecycle is not controlled by power_policy.
 */

/* Releases this module's modem/PSM/cert/LTE bring-up sequence after local
 * hardware setup. The supplied semaphore is given once when local bootstrap
 * reaches a terminal result; registration is intentionally not awaited.
 */
void modem_service_notify_local_hw_ready(struct k_sem *application_wake_sem);

/* Returns 0 with the terminal bootstrap result, or -EAGAIN while bootstrap
 * is still running. LTE registration and backend availability are excluded.
 */
int modem_service_local_bootstrap_result(int *result);

bool modem_service_lte_is_registered(void);
void modem_service_wait_for_lte_registration(void);

#endif /* MODEM_SERVICE_H */
