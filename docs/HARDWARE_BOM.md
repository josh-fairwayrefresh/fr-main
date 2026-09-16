# Hardware Bill of Materials — Fairway Refresh

This document records the hardware installed in the Fairway Refresh prototype across physical hardware generations.

## Prototype 1.1 — Solar Power Integration (Current Physical Hardware Generation)

Prototype 1.1 is the current physical hardware generation. It replaces the Prototype 1.0 AA primary-battery field-power architecture with a CPO-installed and functionally validated solar / LiPo / Adafruit 6106 field-power architecture. No firmware changed as part of this hardware generation; the current validated firmware generation remains LP 1.2 as recorded in the Firmware Generation Registry in `docs/FIRMWARE_SPECIFICATION.md`.

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
- Prototype 1.0 polyfuse (Littelfuse RUEF075HF-ND) and 1000 µF capacitor (Panasonic EEU-FR1A102) — installed as part of the historical Prototype 1.0 AA power-conditioning path. Their exact current physical status (retained in place but unused, or physically removed) is **not confirmed by direct CPO evidence** and requires physical inspection before being represented as retained or removed in a canonical wiring record.

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
