#ifndef MODEM_SERVICE_H
#define MODEM_SERVICE_H

#include <stdbool.h>

/*
 * Owns modem init, Cloud Run CA certificate provisioning, LTE connect and
 * registration-event handling, and registration-triggered DNS prewarm.
 * Also the sole owner of whether PSM is actually requested from the modem
 * -- callers (power_policy, on VBUS transitions) do not need to know
 * whether the modem is ready yet; that gate lives entirely here.
 */

/* Releases this module's modem/PSM/cert/LTE bring-up sequence. Called
 * once local button/LED hardware setup has finished, so the golfer button
 * is live regardless of what this sequence does next or how long it
 * takes.
 */
void modem_service_notify_local_hw_ready(void);

bool modem_service_lte_is_registered(void);

/* Requests or withdraws modem PSM. A no-op (logged) if the modem is not
 * yet initialized; power_policy may call this before modem_ready is true
 * (e.g. VBUS removed during early boot) without special-casing it.
 */
void modem_service_set_psm_requested(bool requested);

#endif /* MODEM_SERVICE_H */
