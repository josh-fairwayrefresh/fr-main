#ifndef BUTTON_UX_H
#define BUTTON_UX_H

#include <stdbool.h>

#include <zephyr/kernel.h>

/*
 * Owns the PV8 button GPIO (debounce-free hardware debounce via the
 * physical switch, edge interrupt only), the three indicator LEDs, and
 * their R/Y/G feedback patterns. Pure hardware mechanics: callers own all
 * sequencing/business logic (what to show when).
 *
 * Confirmed hardware mappings (Monarch Bay Pilot final architecture; see
 * docs/HARDWARE_ASSEMBLY_GUIDE.md and docs/HARDWARE_BOM.md):
 *   PV8 switch       -> Feather J1/5 -> nRF GPIO P0.31
 *   Orange (SENDING)          -> Feather J1/6 -> nRF GPIO P0.30
 *   Green  (REQUEST RECEIVED) -> Feather J1/7 -> nRF GPIO P0.29
 *   Red    (TRY AGAIN)        -> Feather J1/8 -> nRF GPIO P0.28
 */

/* Configures the button and all three indicator pins, arms the button
 * interrupt (edge-falling, enabled), and stores wake_sem for the ISR to
 * give on a validated press. Returns <0 on failure (caller should abort
 * boot, matching prior behavior).
 */
int button_ux_init(struct k_sem *wake_sem);

void button_ux_startup_flash(void);

/* Disabled while an accepted press is being handled, so switch bounce
 * cannot queue a second press mid-transaction; re-armed after terminal
 * feedback plus the settle delay.
 */
void button_ux_set_interrupt_enabled(bool enabled);

/* Atomically checks and clears the ISR-set press-pending flag. Callers
 * must only trust a wake on wake_sem as a genuine button press after this
 * returns true -- wake_sem is also given by the transaction scheduler for
 * an unrelated reason, and a stray wake at the loop boundary must not be
 * misread as a new press.
 */
bool button_ux_take_press_pending(void);

void button_ux_orange_on(void);
void button_ux_orange_off(void);
void button_ux_show_success_feedback(void);
void button_ux_show_failure_feedback(void);
void button_ux_all_off(void);

#endif /* BUTTON_UX_H */
