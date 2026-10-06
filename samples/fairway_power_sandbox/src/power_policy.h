#ifndef POWER_POLICY_H
#define POWER_POLICY_H

#include <stdbool.h>

/*
 * Owns nPM1300 VBUS detection, BUCK2 service-rail policy, and the
 * Errata-36 whole-device WFI-prevention keeper (VBUS hold + bounded
 * interaction hold). Independent of the external battery/solar front-end:
 * the nPM1300 PMIC is onboard the Feather itself, so this module is
 * unaffected by a Prototype 3.2 -> 3.3 external power-harness change.
 *
 * Calls modem_service_set_psm_requested() on every VBUS transition; does
 * not need to know whether the modem is ready yet -- that gate lives
 * entirely inside modem_service.
 */

/* Configures I2C2/nPM1300 readiness, registers the VBUS callback, takes
 * the initial VBUS-present snapshot, and applies the initial BUCK2 policy.
 * Returns <0 on failure (caller should abort boot, matching prior
 * behavior).
 */
int power_policy_init(void);

/* Bounded golfer-interaction awake hold: active while a press is being
 * handled, exactly like the VBUS hold, so Zephyr cannot select the idle
 * thread and execute WFI for the duration.
 */
void power_policy_set_interaction_awake(bool active);

/* Read-only snapshot of whether the VBUS/service hold is currently active;
 * used by modem_service at modem-ready time to decide the initial PSM
 * request state.
 */
bool power_policy_vbus_hold_active(void);

#endif /* POWER_POLICY_H */
