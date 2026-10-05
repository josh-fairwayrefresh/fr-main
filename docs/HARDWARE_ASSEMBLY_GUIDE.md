# Hardware Assembly & Wiring Guide — Prototype 1.0

## Purpose

This document is the canonical physical assembly record for Fairway Refresh Prototype 1.0.

Its purpose is to preserve exactly how the first working prototype was physically assembled so that an identical unit can be reproduced in the future.

This is not a manufacturing work instruction.

Prototype 1.1 reference-device wiring and Prototype 1.0 AA wiring are retained as historical records; the accepted Prototype 3.2 pilot wiring is recorded separately below. CPO-confirmed on 2026-10-05: FRB-0001 is disassembled on the workbench, not in active service, and awaits reconstruction after the Prototype 3.2 (Adafruit 6106/5580) versus anticipated Prototype 3.3 Voltaic decision, with no compatibility requirement. FRB-0002 is the current physical validation device. No 3.3 hardware decision or candidate flash is established here; historical MAX17048 physical evidence remains valid even though candidate firmware Health runtime is retired.

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

## Monarch Bay Pilot --- Final Hardware Architecture (Approved, v3.2 Pilot Ready)

The CPO has completed the Monarch Bay Pilot hardware architecture review and
approved the following as final for the Monarch Bay Pilot build. "Final" here
means final for the Monarch Bay Pilot configuration specifically, not a
permanent freeze of Fairway Refresh hardware generally; a later pilot or
production architecture may still evolve this design. This section supersedes
the prior direct `5580 GND → J2/4` wiring and the PV4 + 220 Ω LED-resistor
circuit as the active new-build hardware for this pilot. The reference-device
evidence recorded elsewhere in this document remains historical and is not
rewritten to reflect this architecture.

Retained from the prior approved pilot-build path:

- LiPo → Adafruit 5580 / MAX17048 → Adafruit 4714 → Adafruit 6106 BATT
- 5580 VIN → Feather J2/2 3V3
- 5580 SCL → Feather J1/11 / P0.01 / I2C2 SCL
- 5580 SDA → Feather J1/12 / P0.02 / I2C2 SDA
- 5580 INT unused
- 5580 QStart unused
- 5580 rear `LED` solder jumper CUT to disable the green power LED; the separate center `VIO` jumper is left unchanged
- VDD = VCC retained
- external polyfuse omitted
- 1000 uF capacitor omitted

Superseded for this pilot:

- 5580 GND no longer wires directly to Feather J2/4. **5580 GND → Perma-Proto
  common GND rail.**
- The PV4 illuminated pushbutton and its 220 Ω LED series resistor are retired
  from this build. See the Pushbutton and Indicators subsections below for the
  accepted replacement.

### Power-Distribution Rails (New for This Pilot)

The Perma-Proto rails are now canonicalized as the explicit system
power-distribution buses, not just a Feather/battery return path:

- Adafruit 6106 regulated positive output (TPS61023 5 V boost) → Perma-Proto
  **+5 V rail**.
- Adafruit 6106 GND output → Perma-Proto **common GND rail**.
- Perma-Proto +5 V rail → Adafruit 261 JST pigtail → Feather onboard **J4/1
  VBAT**.
- Perma-Proto GND rail → Adafruit 261 JST pigtail → Feather onboard **J4/2
  GND**.
- No jumper is added from Feather J2/4 to the GND rail: J4/2 GND and J2/4 are
  already the same Feather ground domain (see "Feather onboard battery JST
  evidence" above), so a separate jumper would be redundant, not required.
- Field power is not connected to Feather J1/3 VBUS.

The common GND rail therefore serves: 6106 GND, Feather J4/2 GND, 5580 GND,
PV8 lead 4, all three 2N3904 emitters, and all three 100 kΩ base pull-down
returns. The +5 V rail therefore serves: the 6106 regulated positive output,
Feather J4/1 VBAT (through the Adafruit 261), and all three indicator
positive leads.

### Pushbutton (Final: E-Switch PV8FWY0SS)

Non-illuminated momentary pushbutton; the CPO physically continuity-tested
the procured unit and confirmed leads 1 and 4 are open released / closed when
pressed.

- PV8 Lead 1 → Feather **J1/5 / P0.31 / D7**.
- PV8 Lead 4 → Perma-Proto common GND rail.
- PV8 Leads 2 and 3: unused, not connected.
- The mechanical contact is non-polarized; the Lead 1/Lead 4 assignment above
  is the canonical assembly convention for this build, not an electrical
  requirement of the switch itself.

### Indicators (Final: 3 x Dialight, Driven Through 2N3904 Transistors)

| Color | Part | Golfer Meaning | GPIO |
|---|---|---|---|
| Orange | Dialight 656-3352-303F, 5 VDC | SENDING | Feather J1/6 / P0.30 / D6 |
| Green | Dialight 656-3202-303F, 5 VDC | REQUEST RECEIVED | Feather J1/7 / P0.29 / D5 |
| Red | Dialight 656-3102-303F, 5 VDC | TRY AGAIN | Feather J1/8 / P0.28 / D4 |

These are integrated 5 V indicators and do not use the historical PV4 220 Ω
series resistor. Each indicator is driven by its own ALLECIN 2N3904 NPN
TO-92 transistor, identical topology per color:

- Feather GPIO → 2.2 kΩ resistor → transistor base.
- Transistor base → 100 kΩ resistor → common GND rail.
- Transistor emitter → common GND rail.
- Transistor collector → indicator negative lead.
- Indicator positive lead → Perma-Proto +5 V rail.

**CPO bench-verified lead order:** with the flat face toward the viewer and
leads pointing downward, LEFT = Collector (C), MIDDLE = Base (B), RIGHT =
Emitter (E), for the actual procured ALLECIN 2N3904 batch. This resolves the
previously open E/B/C verification requirement; see 2N3904 Lead
Identification below.

### 2N3904 Lead Identification

CPO bench-verified for the actual procured ALLECIN 2N3904 batch. Orientation:
flat face toward the viewer, leads pointing downward.

| Position | Lead | Fairway Connection |
|---|---|---|
| LEFT | Collector (C) | Corresponding Dialight indicator negative lead |
| MIDDLE | Base (B) | 2.2 kΩ to the assigned Feather GPIO; 100 kΩ to the common GND rail |
| RIGHT | Emitter (E) | Common GND rail |

### Indicator Termination (DIANN 12-Position Screw-Terminal Block)

DIANN 12-position, 2.54 mm / 0.1-inch pitch PCB screw-terminal block, rated
for 26–18 AWG. Six of the twelve positions are used:

| Position | Assignment |
|---|---|
| 1 | Orange +5 V |
| 2 | Orange switched negative (transistor collector return) |
| 3 | Green +5 V |
| 4 | Green switched negative (transistor collector return) |
| 5 | Red +5 V |
| 6 | Red switched negative (transistor collector return) |

The terminal block accepts the Dialight factory leads directly; board-side
wiring remains the approved Adafruit 288 22 AWG stranded silicone wire.

### Solar Input Path (Retained Component Chain; Ground Boundary Clarified)

```
Adafruit 5366 solar panel
  -> Voltaic 3.5x1.1 mm extension
  -> Adafruit 4287 3.5x1.1 to 5.5x2.1 mm adapter
  -> Adafruit 368 barrel-to-screw-terminal adapter
  -> Adafruit 6106 solar/DC input (observe polarity)
```

- Adafruit 368 `+` terminal → 6106 solar/DC input positive.
- Adafruit 368 `-` terminal → 6106 solar/DC input GND.

The 6106 is the physical boundary between solar-input wiring and the system
distribution rails: its own regulated-output GND (a separate wire from the
368 `-` terminal) is the single connection to the Perma-Proto common GND
rail, and its regulated positive output is the single connection to the
Perma-Proto +5 V rail. Do not add a separate jumper from Adafruit 368 `-`
directly to the Perma-Proto GND rail; the solar-input ground path and the
system distribution ground path are joined only inside the 6106, not by an
additional external wire.

### Antenna / SIM Interfaces

Unchanged from the existing installed configuration: Circuit Dojo
FLEX-LTE-GPS-UFL antenna and Hologram SIM. Component identity is owned by
`docs/HARDWARE_BOM.md`; device-specific SIM provisioning is owned by
`docs/DEVICE_PROVISIONING_GUIDE.md`.

### Monarch Bay Pilot --- Final Wiring Record

This table is the canonical, complete record of every active electrical
connection for the Monarch Bay Pilot build, superseding the prior pilot-build
bullet list above for wiring detail. Component identity/selection is owned by
`docs/HARDWARE_BOM.md`; this table owns the connections themselves.

| Function | Physical Installation | Electrical Purpose |
|---|---|---|
| Solar Input | Adafruit 5366 panel → Voltaic 3.5x1.1 mm extension → Adafruit 4287 adapter → Adafruit 368 barrel-to-screw-terminal adapter (`+` → 6106 solar/DC input positive, `-` → 6106 solar/DC input GND). | Solar charging input to the 6106 charger/power-path. |
| Solar-to-System Ground Boundary | Adafruit 368 `-` is not separately jumpered to the Perma-Proto GND rail. | The 6106 is the sole boundary between solar-input ground and the system GND rail; only its own regulated-output GND connects to the rail (see "6106 GND Output" below). |
| Battery / Fuel Gauge Path | LiPo (Adafruit 328) → Adafruit 5580/MAX17048 → Adafruit 4714 interconnect → Adafruit 6106 BATT. | Protected battery feed with inline fuel-gauge sensing. |
| 5580 VIN | 5580 VIN → Feather J2/2 (3V3). | Fuel-gauge logic supply. |
| 5580 SCL | 5580 SCL → Feather J1/11 / P0.01 (I2C2 SCL). | Fuel-gauge I2C clock. |
| 5580 SDA | 5580 SDA → Feather J1/12 / P0.02 (I2C2 SDA). | Fuel-gauge I2C data. |
| 5580 GND | 5580 GND → Perma-Proto common GND rail. | Fuel-gauge ground return (supersedes direct J2/4 wiring). |
| 5580 INT / QStart | Not connected. | Unused per approved architecture. |
| 6106 Positive Output | Adafruit 6106 regulated +5 V (TPS61023) → Perma-Proto +5 V rail. | Establishes the system +5 V distribution bus. |
| 6106 GND Output | Adafruit 6106 GND → Perma-Proto common GND rail. | Establishes the system GND distribution bus. |
| Feather VBAT Feed | Perma-Proto +5 V rail → Adafruit 261 JST pigtail → Feather onboard J4/1 (VBAT). | Main battery feed into the Feather. |
| Feather GND Feed | Perma-Proto GND rail → Adafruit 261 JST pigtail → Feather onboard J4/2 (GND). | Main Feather ground connection. |
| Feather J2/4 | Not separately jumpered to the GND rail. | J4/2 and J2/4 are already the same Feather ground domain; a separate jumper is redundant. |
| Feather J1/3 VBUS | Not connected to field power. | VBUS remains a separate domain from the Fairway field-power feed. |
| PV8 Switch Input | PV8 Lead 1 → Feather J1/5 / P0.31 (D7). | Button input / wake signal. |
| PV8 Switch Ground | PV8 Lead 4 → Perma-Proto common GND rail. | Switch common return. |
| PV8 Leads 2, 3 | Not connected. | Unused per PV8FWY0SS pinout. |
| Orange Indicator Driver | Feather J1/6 / P0.30 (D6) → 2.2 kΩ → transistor base; base → 100 kΩ → GND rail; emitter → GND rail; collector → orange indicator negative; orange indicator positive → +5 V rail. | Drives the orange (SENDING) indicator. |
| Green Indicator Driver | Feather J1/7 / P0.29 (D5) → 2.2 kΩ → transistor base; base → 100 kΩ → GND rail; emitter → GND rail; collector → green indicator negative; green indicator positive → +5 V rail. | Drives the green (REQUEST RECEIVED) indicator. |
| Red Indicator Driver | Feather J1/8 / P0.28 (D4) → 2.2 kΩ → transistor base; base → 100 kΩ → GND rail; emitter → GND rail; collector → red indicator negative; red indicator positive → +5 V rail. | Drives the red (TRY AGAIN) indicator. |
| Indicator Termination | DIANN 12-position terminal block, positions 1–6 per the Indicator Termination table above. | Accepts Dialight factory leads; board-side wiring is 22 AWG. |
| Antenna | Circuit Dojo FLEX-LTE-GPS-UFL, unchanged mounting. | LTE/GPS RF path. |
| SIM | Hologram SIM, unchanged mounting. | LTE service identity; provisioning owned by `docs/DEVICE_PROVISIONING_GUIDE.md`. |

### PV8 Lead Identification

Verify lead assignments with a continuity meter before soldering.

| PV8 Lead | Connection |
|---|---|
| 1 | Switch input (to Feather J1/5) |
| 2 | Not used |
| 3 | Not used |
| 4 | Ground (to common GND rail) |

### Validation Requirements (Not Yet Established Evidence)

These are assembly-validation requirements for this architecture, not already-
established evidence:

- After assembly, measure the regulated +5 V rail under representative
  indicator load (all three indicators active) and confirm normal operation
  of each 5 V Dialight indicator.

Actual component placement, Perma-Proto geometry, battery mount location,
connector orientation, harness routing, and the exact final mechanical
layout remain TBD.

## Validation of CPO-Approved Pilot-Build Architecture

Validated:

- I2C electrical behavior and MAX17048 response at address 0x36: confirmed live through the then-existing Device Health snapshot, with the 5580 wired as VIN → J2/2 3V3, GND → J2/4 GND, SCL → J1/11 / P0.01, SDA → J1/12 / P0.02. This validation event predates the Monarch Bay Pilot GND-rail supersession above and is retained as historical evidence of the I2C signal path and address, not as current ground-wiring truth or current Health runtime.
- MAX17048 cell voltage compared with a DMM measurement at the actual LiPo node: MAX17048 reported 4.0125 V; CPO DMM measurement at the LiPo node was approximately 4.0 V; difference approximately 12.5 mV (approximately 0.31%). The CPO accepted this as adequate out-of-box battery-voltage calibration for the prototype. This validates voltage acquisition only; it does not establish long-term SOC model accuracy.
- FRB-0002 Monarch Bay Pilot assembly: regulated rail measured approximately 5.2 V at Feather J1/1 (VBAT) relative to J2/4 (GND), and J2/2 measured 3.3 V after correcting 5580 VIN to J2/2. PV8 input and each indicator channel were then physically validated through normal firmware behavior: orange startup/transmitting, green success/repeat, and red failure.
- FRB-0002 completed an authenticated LTE/HTTPS button transaction from field power and produced the expected operator-dashboard request. This is representative functional validation of the assembled pilot path; it is not simultaneous-three-indicator load characterization or a dormant-current measurement.

Physical assembly lesson: Feather header references (for example J1/11, J1/12) and Perma-Proto board coordinates are separate coordinate systems and must not be conflated. An earlier I2C communication failure was traced to SCL/SDA being physically landed on incorrect Perma-Proto positions while intending to reference J1/11 and J1/12; correcting the physical landing resolved the failure.

FRB-0002 assembly initially omitted the three 100 kΩ base-pull-down returns to the common GND rail and landed 5580 VIN on Feather J2/1 (`~RST`) instead of J2/2 (`3V3`). The resulting symptoms included absent indicator behavior and a held/non-running Feather. Correcting both connections restored normal operation. Assembly inspection must verify each base pull-down reaches common GND, 5580 VIN reaches J2/2 only, and J2/1 remains unconnected.

Remaining forthcoming validation of the CPO-approved 5580/new-build architecture:

- Verify LiPo → 5580 → 6106 continuity and polarity, with no battery-positive-to-ground short.
- Verify the 5580 rear `LED` jumper is cut (and `VIO` left unchanged) on each production assembly.
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

# Prototype 1.1 — Solar Power Integration (Historical Reference-Device Architecture)

Prototype 1.1 is the reference-device solar-power generation. It replaced the historical Prototype 1.0 AA/VBAT field-power architecture recorded above with a CPO-installed and functionally validated solar / LiPo / Adafruit 6106 field-power architecture. No firmware changed as part of that hardware milestone; LP 1.2 was the validated firmware generation at the time. Current firmware-generation truth is recorded in `docs/FIRMWARE_SPECIFICATION.md`.

This section preserves historical reference-device hardware evidence, not FRB-0001's present disassembled state. The accepted Prototype 3.2 pilot wiring above is separate; reconstruction and any 3.3 selection remain pending.

## Historical Field-Power Chain (CPO-Installed and Functionally Validated)

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

This document preserves the Prototype 1.0 and Prototype 1.1 physical records and owns the accepted Prototype 3.2 pilot wiring. Current device status is stated at the top; Prototype 3.3 is not decided here.