# Hardware Assembly & Wiring Guide — Prototype 1.0

## Purpose

This document is the canonical physical assembly record for Fairway Refresh Prototype 1.0.

Its purpose is to preserve exactly how the first working prototype was physically assembled so that an identical unit can be reproduced in the future.

This is not a manufacturing work instruction.

---

## Canonical Source References

| Topic | Canonical Owner |
|--------|-----------------|
| Feather pin map | docs/ENGINEERING_GUIDE.md |
| Installed components | docs/HARDWARE_BOM.md |
| Prototype 1.0 wiring | Prototype 1.0 Wiring Record (this document) |
| Firmware behavior | docs/FIRMWARE_SPECIFICATION.md |
| User-visible behavior | docs/UX_SPECIFICATION.md |

---

## Scope

- Circuit Dojo nRF9151 Feather
- Adafruit Perma-Proto Half Size PCB
- Two AA primary lithium battery supply
- PV4 illuminated pushbutton
- LTE antenna
- Hologram SIM

Firmware implementation and software behavior are intentionally outside the scope of this document.

---

## Required Parts

The approved component list for Prototype 1.0 is maintained exclusively in:

`docs/HARDWARE_BOM.md`

---

## Required Tools

- Soldering iron
- Wire strippers
- Flush cutters
- Multimeter
- Needle nose pliers
- Tweezers
- Heat shrink (recommended)

---

# Mandatory Assembly Record

1. Verify the BOM revision.

2. Verify the Feather orientation against the pin map in
   `docs/ENGINEERING_GUIDE.md`.

3. Install the female headers.

   - Position the Feather so the headers occupy rows 1–16.
   - Leave Perma-Proto columns A and J available for jumper wiring.
   - Leave rows 17 and above available for the power conditioning circuitry.
   - Verify the Feather is fully seated before soldering.

4. Install the power conditioning components.

5. Install the battery holder.

6. Install the PV4 pushbutton.

7. Install the LTE antenna.

8. Cut JMP2 for primary battery operation.

9. Install the Hologram SIM.

10. Verify all wiring before first power-up.

---

# Perma-Proto Coordinate System

- Rows A-E are electrically common.
- Rows F-J are electrically common.
- The center gap electrically isolates both sides.
- Power rails run vertically along the board edges.

Whenever ambiguity exists, references shall explicitly identify either:

- Feather
- Perma-Proto

---

# Prototype 1.0 Wiring Record

This table is the canonical record of every physical electrical connection used in Prototype 1.0.

| Function | Physical Installation | Electrical Purpose |
|----------|-----------------------|--------------------|
| Battery Supply | Battery holder positive lead soldered to the positive power rail. Battery negative lead soldered to the ground rail. | Provides system power. |
| Polyfuse | Polyfuse soldered between the positive power rail and Perma-Proto A25. | Primary over-current protection. |
| Feather VBAT | Jumper from Perma-Proto B25 to Perma-Proto J5, which is in the same row as Feather J1 pin 1 (VBAT). | Main battery feed into the Feather. |
| Energy Buffer Capacitor | Positive lead soldered into Perma-Proto C25. Negative lead soldered to the ground rail. | Provides transient current during LTE transmission. |
| Feather Ground | Jumper from Perma-Proto J4, which is in the same row as Feather J2 pin 4 (GND), to the ground rail. | Main Feather ground connection. |
| PV4 Switch Input | Jumper from Perma-Proto J9, in the Feather J1 pin 5 (D7) row, through the JST connector to PV4 NO1. | Button input / wake signal. |
| PV4 LED Control | Jumper from Perma-Proto J10, in the Feather J1 pin 6 (D6) row, to J28. A 220 Ω resistor is soldered between F28 and E28. A jumper from A28 passes through the JST connector to PV4 LED+. | Controls the LED ring. |
| PV4 Switch Ground | Ground rail through JST connector to PV4 C1. | Switch common return. |
| PV4 LED Ground | Ground rail through JST connector to PV4 LED−. | LED return path. |

---

# PV4 Terminal Identification

Verify terminal assignments with a continuity meter before soldering.

| PV4 Terminal | Connection |
|-------------|------------|
| C1 | Ground |
| NO1 | Switch input |
| NC1 | Not used |
| LED+ | LED control |
| LED− | Ground |

---

# Critical Safety Notes

- Observe capacitor polarity.
- Install the 220 Ω resistor in series with the LED+ circuit.
- Protect exposed solder joints.
- Do not connect USB and the AA battery simultaneously.
- Cut JMP2 when operating from primary lithium batteries.

---

# Standard Maintenance Procedure

1. Disconnect battery before connecting USB.
2. Disconnect USB before reconnecting battery.
3. Never operate from USB and battery simultaneously.

# Operating Power Modes

Fairway uses two mutually exclusive operating modes:

| Mode | Power connection | Required disconnection |
|------|------------------|------------------------|
| USB/debug/service | USB connected | PPK2 disconnected |
| Field/measurement | PPK2 or future approved 5.0 V field supply connected | USB disconnected |

The accepted Fairway operating and measurement input boundary for this architecture is 5.0 V.

---

# First Power-Up

Verify:

- Battery polarity
- Wiring
- Antenna
- JMP2 cut
- SIM installed
- Wire strain relief

Connect battery.

Verify successful power-up.

Firmware operation and user-visible behavior are verified according to:

- docs/FIRMWARE_SPECIFICATION.md
- docs/UX_SPECIFICATION.md

---

# Engineering Recommendations

- Use JST connectors wherever practical.
- Keep power and signal wiring separated.
- Provide strain relief.
- Keep capacitor leads short.

---

# Observed Prototype Behavior

Observed battery behavior and engineering risks are maintained in:

`docs/ENGINEERING_GUIDE.md`

---

# Verification Checklist

- Feather installed
- Pin map verified
- Perma-Proto continuity confirmed
- Battery connected correctly
- Polyfuse installed
- Capacitor polarity confirmed
- Ground jumper installed
- PV4 switch wiring verified
- LED wiring verified
- LTE antenna installed
- SIM installed
- Hardware powers successfully

---

# Lessons Learned

- Verify PV4 terminal identification before soldering.
- Install antenna before final enclosure assembly.
- Provide strain relief.
- Perform continuity checks before first power-up.
- Verify SIM seating.

---

# Notes

This document is the canonical physical assembly record for Prototype 1.0.