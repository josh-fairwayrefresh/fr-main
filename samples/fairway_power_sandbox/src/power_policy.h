#ifndef POWER_POLICY_H
#define POWER_POLICY_H

#include <stdbool.h>

/*
 * Owns the nPM1300 BUCK2 debugger service-rail policy and the bounded
 * interaction-awake keeper. BUCK2 is disabled during normal operation and
 * enabled only for explicit boot-button service mode; VBUS does not control
 * BUCK2, CPU idle, or LTE PSM.
 * Independent of the external battery/solar front-end:
 * the nPM1300 PMIC is onboard the Feather itself, so this module is
 * unaffected by a Prototype 3.2 -> 3.3 external power-harness change.
 */

/* Configures I2C2 runtime access and applies the service-rail policy.
 * Returns <0 on failure (caller should abort boot, matching prior behavior).
 */
int power_policy_init(bool service_mode);

/* Bounded golfer-interaction awake hold: while active, Zephyr cannot select
 * the idle thread and execute WFI. VBUS state does not affect this hold.
 */
void power_policy_set_interaction_awake(bool active);

#endif /* POWER_POLICY_H */
