#ifndef MODEM_SERVICE_H
#define MODEM_SERVICE_H

#include <stdbool.h>

/*
 * Owns modem init, Cloud Run CA certificate provisioning, LTE connect and
 * registration-event handling, and registration-triggered DNS prewarm.
 * Also owns LTE PSM configuration and requests; PSM is independent of VBUS
 * and its lifecycle is not controlled by power_policy.
 */

/* Releases this module's modem/PSM/cert/LTE bring-up sequence. Called
 * once local button/LED hardware setup has finished, so the golfer button
 * is live regardless of what this sequence does next or how long it
 * takes.
 */
void modem_service_notify_local_hw_ready(void);

bool modem_service_lte_is_registered(void);

#endif /* MODEM_SERVICE_H */
