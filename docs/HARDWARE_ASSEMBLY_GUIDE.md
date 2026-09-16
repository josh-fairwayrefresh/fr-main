# Hardware Assembly & Wiring Guide — Prototype 1.0

## Purpose

This document is the canonical physical assembly record for Fairway Refresh Prototype 1.0.

Its purpose is to preserve exactly how the first working prototype was physically assembled so that an identical unit can be reproduced in the future.

This is not a manufacturing work instruction.

The current physical hardware generation is Prototype 1.1, documented in a dedicated section near the end of this document. The Prototype 1.0 wiring record below remains a historical reference for the original AA-powered build and is not the current field-power architecture.

---

## Canonical Source References

| Topic | Canonical Owner |
|--------|-----------------|
| Feather physical header/pin reference | Circuit Dojo nRF9151 Feather Pin Reference (this document) |
| Installed components | docs/HARDWARE_BOM.md |
| Prototype 1.0 wiring | Prototype 1.0 Wiring Record (this document) |
| Firmware behavior | docs/FIRMWARE_SPECIFICATION.md |
| User-visible behavior | docs/UX_SPECIFICATION.md |

---

# Circuit Dojo nRF9151 Feather Pin Reference

## Feather onboard battery JST evidence

Official Circuit Dojo current hardware evidence verifies the following:

- J4 pad 1 = net 4 `VBAT`
- J4 pad 2 = net 1 `GND`
- J1 pad 1 = net 4 `VBAT`
- J2 pad 4 = GND
- J4 is the onboard battery connector; it is not a VBUS domain.

This means the new Fairway feed using the onboard JST J4 connector is a physical interconnect refinement to the same VBAT/GND electrical domains as J1/1 and J2/4. The direct official PCB source confirms the shared net relationship and therefore closes the previous vendor-evidence gate for the current design state.

## Approved Current Pilot-Build Architecture

The CPO-approved pilot-build architecture is distinct from the current reference-device hardware evidence:

- LiPo → Adafruit 5580 / MAX17048 → Adafruit 4714 → Adafruit 6106 BATT
- 5580 VIN → J2/2 3V3
- 5580 GND → J2/4 GND
- 5580 SCL → J1/11 / P0.01 / I2C2 SCL
- 5580 SDA → J1/12 / P0.02 / I2C2 SDA
- INT unused
- QStart unused
- SJ1 power LED jumper cut for pilot
- VDD = VCC retained
- external polyfuse omitted
- 1000 uF capacitor omitted
- 220 Ω PV4 LED resistor retained
- Fairway power feed for new builds uses Adafruit 261 into onboard JST J4 VBAT/GND; J1/3 VBUS remains separate and is not the new Fairway feed

Actual component placement, Perma-Proto geometry, battery mount location, connector orientation, harness routing, and the exact final mechanical layout remain TBD.

## Forthcoming Validation of CPO-Approved Pilot-Build Architecture

The following is forthcoming validation of the CPO-approved 5580/new-build architecture. It does not reopen architecture selection or imply that this validation has already occurred:

- Verify LiPo → 5580 → 6106 continuity and polarity, with no battery-positive-to-ground short.
- Verify 5580 VIN is tied only to Feather 3V3, and verify SDA/SCL routing and SJ1 cut state.
- Verify I2C electrical behavior and MAX17048 response at address 0x36.
- Compare MAX17048 cell voltage with a DMM measurement at the actual LiPo node.
- Verify solar-present and battery-only operation, including a representative LTE/HTTPS transaction.
- Verify return to LP1.2 low-power behavior, including incremental dormant-current and automatic-hibernate behavior.
- Check for abnormal partial-power or back-power behavior throughout the validation.

This table is the canonical Fairway reference for physical Feather header-to-signal/nRF9151 mapping. Current source and DTS own which pins are presently configured, consumed, or reserved by the implementation; physical exposure does not imply availability.

## J1 - 12-Pin Header

| Feather header | nRF9151 | Label |
|----------------|---------|-------|
| J1/1 | - | VBAT |
| J1/2 | - | EN |
| J1/3 | - | VBUS |
| J1/4 | P0.00 | D8 |
| J1/5 | P0.31 | D7 |
| J1/6 | P0.30 | D6 |
| J1/7 | P0.29 | D5 |
| J1/8 | P0.28 | D4 |
| J1/9 | P0.27 | D3 |
| J1/10 | P0.26 | D2 |
| J1/11 | P0.01 | SCL |
| J1/12 | P0.02 | SDA |

## J2 - 16-Pin Header

| Feather header | nRF9151 | Label |
|----------------|---------|-------|
| J2/1 | - | ~RST |
| J2/2 | - | 3V3 |
| J2/3 | - | MODE/WAKE |
| J2/4 | - | GND |
| J2/5 | P0.13 | A0 |
| J2/6 | P0.14 | A1 |
| J2/7 | P0.15 | A2 |
| J2/8 | P0.16 | A3 |
| J2/9 | P0.17 | A4 |
| J2/10 | P0.18 | A5 |
| J2/11 | P0.20 | SCK |
| J2/12 | P0.21 | COPI |
| J2/13 | P0.22 | CIPO |
| J2/14 | P0.23 | RX |
| J2/15 | P0.24 | TX |
| J2/16 | P0.25 | EXTRA |

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

2. Verify the Feather orientation against the Circuit Dojo nRF9151 Feather Pin
  Reference in this document.

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

# Prototype 1.1 — Solar Power Integration (Current Field-Power Architecture)

Prototype 1.1 is the current physical hardware generation. It replaces the historical Prototype 1.0 AA/VBAT field-power architecture recorded above with a CPO-installed and functionally validated solar / LiPo / Adafruit 6106 field-power architecture. No firmware changed as part of this hardware generation; the current validated firmware generation remains LP 1.2 as recorded in `docs/FIRMWARE_SPECIFICATION.md`.

This section documents the current reference-device hardware evidence. The CPO-approved pilot-build architecture above remains a separate design-state record for new builds and must not be described as already installed in the current reference unit.

## Current Field-Power Chain (CPO-Installed and Functionally Validated)

```
Adafruit 5366 solar panel
  -> Voltaic solar extension/interconnect
  -> Adafruit 4287 adapter
  -> Adafruit 368 barrel/screw-terminal adapter
  -> Adafruit 6106 solar/DC input

Adafruit 6106 BQ25185 charger/power-path
  <-> Adafruit 328 protected 3.7 V / 2500 mAh LiPo

Adafruit 6106 TPS61023 regulated output
  -> positive output screw terminal to existing Fairway Refresh positive power rail
  -> ground output screw terminal to existing Fairway Refresh ground rail
```

The separate Adafruit 6106 protoboard supplies the existing Fairway Refresh power rails. Everything downstream of those rails, including the existing Feather, button, LED, antenna, SIM, Perma-Proto, and electronics wiring, remains the Prototype 1.0 configuration and was left untouched.

Installed component identity and part numbers are owned by `docs/HARDWARE_BOM.md`.

## CPO-Confirmed 6106 LED Behavior

- Green LED near the output screw connector indicates the regulated 5 V output is active.
- Amber LED near the battery connector indicates battery charging; it illuminates when solar is available and extinguishes when solar is removed.
- Neither LED was disabled as part of Prototype 1.1. LED power optimization is deferred to later low-power characterization.

## Retained Historical Power Conditioning in the Prototype 1.1 Reference Device

The CPO confirmed that the historical Prototype 1.0 polyfuse and 1000 µF capacitor were not removed when the Adafruit 6106 output was connected to the existing Fairway positive and ground rails. Both were present during the original successful Prototype 1.1 solar/LiPo/LTE validation.

The 1000 µF capacitor was subsequently electrically disconnected for CPO-performed functional validation. The Prototype 1.1 reference device successfully completed normal Fairway cellular transactions without it. The CPO accepted this functional result as sufficient to omit the capacitor from the five-new-board architecture; it is not detailed electrical transient characterization. No additional external polyfuse or 1000 µF capacitor is required for those boards.

## CPO-Confirmed Functional Validation

The following functional validation was performed by the CPO on the assembled Prototype 1.1 device, with the unchanged LP 1.2 validated firmware:

- The device operated successfully from the new solar/LiPo/6106 power architecture and completed a golfer button press through LTE-M/HTTPS, producing a request on the cart operator dashboard.
- The device operated successfully while solar power was present, with the amber charging LED illuminated.
- The device transitioned from solar-supported operation to LiPo-only operation without an observed functional interruption.
- The device completed a Fairway transaction successfully while operating from LiPo power alone.

Detailed validation evidence and remaining characterization scope are recorded in `docs/ENGINEERING_GUIDE.md`.

---

# Notes

This document is the canonical physical assembly record for Prototype 1.0. The current Prototype 1.1 field-power architecture is recorded in the section above.