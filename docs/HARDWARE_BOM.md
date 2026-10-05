# Hardware Bill of Materials — Fairway Refresh

This document records the hardware installed in the Fairway Refresh prototype across physical hardware generations.

## Current Physical Status (CPO-Confirmed 2026-10-05)

FRB-0001 is not in active service and is physically disassembled on the workbench, pending reconstruction after the Prototype 3.2 (Adafruit 6106/5580) versus anticipated Prototype 3.3 Voltaic decision. No compatibility requirement applies. FRB-0002 is the current physical validation device. This document retains the accepted 3.2 BOM and earlier MAX17048 installation/validation evidence; it does not select 3.3 hardware. Candidate firmware has retired MAX17048/Device Health runtime, which does not erase installed-hardware history. Firmware truth belongs to `docs/FIRMWARE_SPECIFICATION.md`.

## Prototype 1.1 — Solar Power Integration (Reference-Device Generation)

Prototype 1.1 replaced the Prototype 1.0 AA primary-battery field-power architecture with a CPO-installed and functionally validated solar / LiPo / Adafruit 6106 field-power architecture on the reference device. No firmware changed as part of that hardware milestone; LP 1.2 was the validated firmware generation at the time. Current firmware-generation truth is recorded in `docs/FIRMWARE_SPECIFICATION.md`.

## Monarch Bay Pilot --- Final Hardware Architecture (Approved, v3.2 Pilot Ready)

This is the CPO-approved final hardware architecture and Bill of Materials for
the Monarch Bay Pilot build ("Prototype Bill of Materials (v3.2 Pilot Ready)",
approved 2026-09-29). "Final" applies to the Monarch Bay Pilot configuration
specifically; it does not freeze Fairway Refresh hardware for all future
builds. This supersedes the prior direct `5580 GND → J2/4` wiring and the
PV4 + 220 Ω LED-resistor circuit as the active new-build hardware for this
pilot. It is the engineering basis for the Monarch Bay Pilot build batch and
is not a statement that the current reference device is already wired in
this exact arrangement; that device's own history remains recorded
separately below.

FRB-0002 has now been assembled in this Monarch Bay Pilot configuration and
functionally validated with the PV8 button, all three indicator channels, and
an end-to-end LTE/HTTPS request. This establishes one validated pilot-build
instance; it does not redefine the separate FRB-0001 reference-device history
or establish batch-wide manufacturing validation.

### Approved power / battery-health path

- LiPo → Adafruit 5580 / MAX17048 → Adafruit 4714 → Adafruit 6106 BATT
- 5580 VIN → J2/2 3V3
- 5580 GND → Perma-Proto common GND rail (supersedes the prior direct J2/4 wiring for this pilot)
- 5580 SCL → J1/11 / P0.01 / I2C2 SCL
- 5580 SDA → J1/12 / P0.02 / I2C2 SDA
- INT unused
- QStart unused
- 5580 rear `LED` solder jumper CUT for pilot to disable the green power LED; the separate center `VIO` jumper is left unchanged
- VDD = VCC retained
- external polyfuse omitted
- 1000 uF capacitor omitted
- PV4 220 Ω LED resistor circuit retired from this build; see Pushbutton/Indicators below
- in the historical Prototype 3.2 Health interpretation, actual LiPo voltage/trend was primary and SOC supplementary; this is not an active candidate telemetry claim

The Adafruit 6106 regulated output and GND now explicitly establish the
Perma-Proto +5 V and GND rails as the system power-distribution buses, which
in turn feed the Feather (via Adafruit 261 into onboard J4 VBAT/GND) and the
indicator circuits below. Full connection-by-connection wiring is owned by
`docs/HARDWARE_ASSEMBLY_GUIDE.md` ("Monarch Bay Pilot --- Final Wiring
Record") and is not duplicated here.

### Pushbutton and Indicators (Final, Supersedes Provisional Status)

The pushbutton and three-indicator system previously recorded as provisional
(see "Historical: Provisional Button / Indicator Proposal" below) is now the
accepted final Monarch Bay Pilot hardware. The PV4 illuminated pushbutton is
retired from this build; wiring is owned by `docs/HARDWARE_ASSEMBLY_GUIDE.md`.

### Approved Feath er J4 power feed refinement

The current official Circuit Dojo nRF9151 Feather PCB source assigns J4 pad 1 to net 4 `VBAT` and J4 pad 2 to net 1 `GND`. The same PCB source assigns Feather J1 pad 1 to net 4 `VBAT`, and J2/4 is GND. Therefore the new Fairway feed using Adafruit 261 into the onboard JST J4 VBAT/GND connector is a physical interconnect refinement to the same VBAT/GND domains and is not a VBUS feed.

### Locked BOM basis for pilot builds

| Component | Manufacturer | Manufacturer Part # | Supplier | Notes |
|---|---|---|---|---|
| Cellular MCU | Circuit Dojo | PASSY-NRF9151-FEATHER | Circuit Dojo | Circuit Dojo nRF9151 Feather development board. |
| Solar panel | Adafruit | 5366 | Adafruit | Solar charging input for the 6106. |
| Solar extension/interconnect | Voltaic | Not specified | Voltaic | 3.5 x 1.1 mm solar extension cable. |
| LiPo battery | Adafruit | 328 | Adafruit | Protected 3.7 V / 2500 mAh LiPo. |
| Solar/USB/DC charger with 5 V boost | Adafruit | 6106 | Adafruit | BQ25185 charger/power-path with TPS61023 5 V boost output; establishes the Perma-Proto +5 V/GND distribution rails. |
| Antenna | Circuit Dojo | FLEX-LTE-GPS-UFL | Circuit Dojo | Must be LTE+GPS combo for 9151. |
| Hologram SIM | Hologram | Hologram SIM Card | Hologram | Installed for LTE service. |
| LiPo fuel gauge | Adafruit | 5580 / MAX17048 | Adafruit | Recorded Prototype 3.2 inline sensing hardware, electrically between the protected LiPo and Adafruit 6106 battery input through the approved JST path. Former Device Health voltage/SOC acquisition is retired in candidate firmware; the installed physical record is retained. |
| Barrel-to-screw-terminal adapter | Adafruit | 368 | Adafruit | 5.5 x 2.1 mm female barrel to screw-terminal adapter; solar input path. |
| Panel connector adapter | Adafruit | 4287 | Adafruit | 3.5 x 1.1 mm to 5.5 x 2.1 mm adapter; solar input path. |
| Cable gland | Voltaic | Appropriate IP67/68 gland | Voltaic | Enclosure cable penetration. |
| Feather JST power pigtail | Adafruit | 261 | Adafruit | Used for the onboard J4 VBAT/GND feed from the Perma-Proto distribution rails. |
| 5580 -> 6106 battery jumper | Adafruit | 4714 | Adafruit | Current approved battery jumper. |
| Wiring | Adafruit | 288 | Adafruit | 22 AWG Stranded Silicone Wire. |
| Project Board | Adafruit | 571 | Adafruit | Perma-Proto Half-Sized PCB. |
| Feather female headers | Adafruit | 2940 | Adafruit | Short female headers for the board build. |
| Feather male breakaway headers | Adafruit | 3009 | Adafruit | Short male breakaway headers. |
| Battery mounting | Not specified | Not specified | CPO-supplied | Closed-cell foam + soft hook-and-loop battery mounting. |
| Pushbutton (final) | E-Switch | PV8FWY0SS | DigiKey/E-Switch | Non-illuminated momentary pushbutton. CPO physically continuity-tested the procured unit: leads 1 and 4 open released, closed when pressed. Retires the PV4 illuminated pushbutton for this build. |
| Indicator, orange (final) | Dialight | 656-3352-303F | Dialight | 5 VDC. Golfer meaning: SENDING. |
| Indicator, green (final) | Dialight | 656-3202-303F | Dialight | 5 VDC. Golfer meaning: REQUEST RECEIVED. |
| Indicator, red (final) | Dialight | 656-3102-303F | Dialight | 5 VDC. Golfer meaning: TRY AGAIN. |
| Indicator driver transistor | ALLECIN | 2N3904 | ALLECIN | NPN, TO-92. Qty 3 (one per indicator). E/B/C lead order CPO bench-verified; see `docs/HARDWARE_ASSEMBLY_GUIDE.md` ("2N3904 Lead Identification"). |
| Base drive resistor | Not specified | 2.2 kΩ, 1/2 W, 5% | Not specified | Qty 3. Feather GPIO to each transistor base. |
| Base pull-down resistor | Not specified | 100 kΩ, 1/4 W, ±1% | Not specified | Qty 3. Each transistor base to common GND. |
| Indicator terminal block | DIANN | 12-position, 2.54 mm / 0.1 in pitch, 26-18 AWG | Not specified | Six of twelve positions used for the three indicators; see `docs/HARDWARE_ASSEMBLY_GUIDE.md`. |

The canonical engineering BOM basis is the approved pilot-build configuration above. Inventory quantities, procurement status, and cost are intentionally not duplicated in canonical engineering truth unless a BOM owner requires those fields.

**Removed from the final architecture:** the Adafruit 1131 battery/board disconnect (present historically on the reference device, see below) is not part of the Monarch Bay Pilot final BOM and must not be treated as an active pilot component.

### Retained historical field-power evidence

The historical reference-device evidence is separate from the later pilot-build architecture and FRB-0001's current disassembled condition. The reference device was functionally validated with solar / LiPo / Adafruit 6106 field power; that event remains valid history.

### Reference-Device Battery-Health Update

Historically, the Adafruit 5580 / MAX17048 was installed on the reference device with VIN → J2/2 3V3, GND → J2/4 GND, SCL → J1/11, SDA → J1/12. I2C communication and battery-voltage acquisition were validated live; see the firmware and assembly owners for that historical evidence. This is not a claim that disassembled FRB-0001 remains wired or that candidate firmware acquires Health. Placement, geometry, and final mechanical layout remain TBD.

### Retained from Prototype 1.0 (CPO-confirmed installed and functioning)

| Component | Manufacturer | Manufacturer Part # | Supplier | Notes |
|---|---|---|---|---|
| Cellular MCU | Circuit Dojo | PASSY-NRF9151-FEATHER | Circuit Dojo | Circuit Dojo nRF9151 Feather development board. |
| Pushbutton | E-Switch | PV4F2B0SS-311 | DigiKey | Silver contacts, Red Ring, 2.8V LED. |
| Antenna | Circuit Dojo | FLEX-LTE-GPS-UFL | Circuit Dojo | Must be LTE+GPS combo for 9151. |
| Resistor | Yageo | CFR-25JR-52-220RCT-ND | DigiKey | 220 Ω, 1/4W Carbon Film; LED series resistor. |
| Harness (2-pin) | Adafruit | 261 | Adafruit | JST-PH 2.0mm 2-pin Male/Female set. |
| Project Board | Adafruit | 571 | Adafruit | Perma-Proto Half-Sized PCB. |
| Wiring | Adafruit | 288 | Adafruit | 22AWG Stranded Silicone Wire. |
| Female Headers | Adafruit | 2222 |  | (12/16 pin) 2 Sets |
| Hologram SIM Card | Hologram | Hologram SIM Card | Hologram | Installed for LTE service. |

### Newly installed for Prototype 1.1 (CPO-supplied, functionally validated field-power subsystem)

| Component | Manufacturer | Manufacturer Part # | Supplier | Notes |
|---|---|---|---|---|
| Solar panel | Adafruit | 5366 | Adafruit | 2.37 W max, Vmp 7.28 V, 330 mA, 3.5 x 1.1 mm panel connector. |
| Solar extension/interconnect | Voltaic | Not specified | Voltaic | 3.5 x 1.1 mm solar extension cable. |
| Panel connector adapter | Adafruit | 4287 | Adafruit | 3.5 x 1.1 mm to 5.5 x 2.1 mm adapter. |
| Barrel-to-screw-terminal adapter | Adafruit | 368 | Adafruit | 5.5 x 2.1 mm female barrel to screw-terminal adapter. |
| Solar/USB/DC charger with 5 V boost | Adafruit | 6106 | Adafruit | BQ25185 charger/power-path with TPS61023 5 V boost output; CPO measured regulated output at approximately 5.2–5.3 V unloaded. |
| LiPo battery | Adafruit | 328 | Adafruit | Protected 3.7 V / 2500 mAh LiPo. |
| Battery/board disconnect | Adafruit | 1131 | Adafruit | 2-pin JST-PH board-to-board disconnect. |
| Cable penetration | Not specified | Not specified | CPO-supplied | IP67/68-rated enclosure cable penetration. |
| Battery mounting provisions | Not specified | Not specified | CPO-supplied | Secures LiPo within enclosure. |

### Retired from the active field-power path (historical Prototype 1.0 provenance only)

- 2xAA battery holder (Keystone 2462) and Energizer Ultimate Lithium AA primary batteries — physically removed by the CPO before Prototype 1.1 installation; no longer part of the current field-power path.

### Retained Historical Power-Conditioning Components in the Prototype 1.1 Reference Device

- The historical Prototype 1.0 polyfuse (Littelfuse RUEF075HF-ND) and 1000 µF capacitor (Panasonic EEU-FR1A102) were present during the original successful Prototype 1.1 solar/LiPo/LTE validation. This is CPO-confirmed physical-device evidence.
- The 1000 µF capacitor was subsequently electrically disconnected for CPO-performed functional validation. The Prototype 1.1 reference device successfully completed normal Fairway cellular transactions without it. The CPO accepted this functional result as sufficient to omit the capacitor from the five-new-board architecture; it is not detailed electrical transient characterization.
- No additional external polyfuse or 1000 µF capacitor is required for the five new boards.

### Historical alternatives retained only as history

- TMUX1101
- MAX4544
- switched-SAADC/divider approaches

These are historical alternatives and are not current alternatives for the approved pilot-build architecture.

## Historical: Provisional Button / Indicator Proposal (Superseded)

This section previously recorded a CPO-approved provisional future hardware
direction, not yet accepted, with the PV8 ordering part number unconfirmed.
That proposal has now been accepted as final for the Monarch Bay Pilot — see
"Monarch Bay Pilot --- Final Hardware Architecture" above for the accepted
part numbers, wiring, and golfer-facing meanings. This section is retained
only to preserve the provenance of the original proposal; it is not current
BOM guidance.

## Prototype 1.0 (Historical, First Build, Pre-Pilot)

This section preserves the original Prototype 1.0 hardware record for historical provenance. It no longer reflects the current field-power architecture.

Prototype assembled using the Circuit Dojo nRF9151 Feather with integrated nPM1300 PMIC.

| Component | Manufacturer | Manufacturer Part # | Supplier | Notes |
|---|---|---|---|---|
| Cellular MCU | Circuit Dojo | PASSY-NRF9151-FEATHER | Circuit Dojo | Circuit Dojo nRF9151 Feather development board. |
| Pushbutton | E-Switch | PV4F2B0SS-311 | DigiKey | Silver contacts, Red Ring, 2.8V LED. |
| Antenna | Circuit Dojo | FLEX-LTE-GPS-UFL | Circuit Dojo | Must be LTE+GPS combo for 9151. |
| Polyfuse | Littelfuse | RUEF075HF-ND | DigiKey | Surface mount (fits Perma-Proto pads). |
| Capacitor | Panasonic | EEU-FR1A102 | DigiKey | 1000µF, 10V, Low ESR (for pulse). |
| Resistor | Yageo | CFR-25JR-52-220RCT-ND | DigiKey | 220 Ω, 1/4W Carbon Film. |
| Battery Holder | Keystone | 2462 | Mouser | 2xAA with 6" wire leads. |
| Harness (2-pin) | Adafruit | 261 | Adafruit | JST-PH 2.0mm 2-pin Male/Female set. |
| Project Board | Adafruit | 571 | Adafruit | Perma-Proto Half-Sized PCB. |
| Wiring | Adafruit | 288 | Adafruit | 22AWG Stranded Silicone Wire. |
| Female Headers | Adafruit | 2222 |  | (12/16 pin) 2 Sets |
| Hologram SIM Card | Hologram | Hologram SIM Card | Hologram | Installed for LTE service. |
| Primary Batteries | Energizer | Ultimate Lithium AA Batteries |  |  |

## SIM Identity and Provisioning Note

Device-specific SIM identity and provisioning records are maintained in accordance with `docs/DEVICE_PROVISIONING_GUIDE.md`.
