#ifndef POWER_POLICY_H
#define POWER_POLICY_H

#include <stdbool.h>

/*
 * Owns nPM1300 VBUS detection and BUCK2 service-rail policy, plus the
 * bounded interaction-awake keeper. VBUS does not control CPU idle or LTE PSM.
 * Independent of the external battery/solar front-end:
 * the nPM1300 PMIC is onboard the Feather itself, so this module is
 * unaffected by a Prototype 3.2 -> 3.3 external power-harness change.
 */

/* Configures I2C2/nPM1300 readiness, registers the VBUS callback, takes
 * the initial VBUS-present snapshot, and applies the initial BUCK2 policy.
 * Returns <0 on failure (caller should abort boot, matching prior
 * behavior).
 */
int power_policy_init(void);

/* Bounded golfer-interaction awake hold: while active, Zephyr cannot select
 * the idle thread and execute WFI. VBUS state does not affect this hold.
 */
void power_policy_set_interaction_awake(bool active);

#endif /* POWER_POLICY_H */
