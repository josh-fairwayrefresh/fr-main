# Hardware Bill of Materials — Fairway Refresh

This document records the hardware installed in the Fairway Refresh prototype across physical hardware generations.

## Prototype 1.1 — Solar Power Integration (Current Physical Hardware Generation)

Prototype 1.1 is the current physical hardware generation. It replaces the Prototype 1.0 AA primary-battery field-power architecture with a CPO-installed and functionally validated solar / LiPo / Adafruit 6106 field-power architecture. No firmware changed as part of this hardware generation; the current validated firmware generation remains LP 1.2 as recorded in the Firmware Generation Registry in `docs/FIRMWARE_SPECIFICATION.md`.

## Approved Current Pilot-Build Hardware Architecture (New Builds)

This is the current CPO-approved architecture for new Fairway builds. It is the engineering basis for the next build batch and is not a statement that the current reference device is already wired in this exact arrangement.

### Approved power / battery-health path

- LiPo → Adafruit 5580 / MAX17048 → Adafruit 4714 → Adafruit 6106 BATT
- 5580 VIN → J2/2 3V3
- 5580 GND → J2/4 GND
- 5580 SCL → J1/11 / P0.01 / I2C2 SCL
- 5580 SDA → J1/12 / P0.02 / I2C2 SDA
- INT unused
- QStart unused
- SJ1 power LED jumper CUT for pilot
- VDD = VCC retained
- external polyfuse omitted
- 1000 uF capacitor omitted
- 220 Ω PV4 LED resistor retained
- actual LiPo voltage/trend remains the primary energy-health evidence; SOC is supplementary

### Approved Feath er J4 power feed refinement

The current official Circuit Dojo nRF9151 Feather PCB source assigns J4 pad 1 to net 4 `VBAT` and J4 pad 2 to net 1 `GND`. The same PCB source assigns Feather J1 pad 1 to net 4 `VBAT`, and J2/4 is GND. Therefore the new Fairway feed using Adafruit 261 into the onboard JST J4 VBAT/GND connector is a physical interconnect refinement to the same VBAT/GND domains and is not a VBUS feed.

### Locked BOM basis for pilot builds

| Component | Manufacturer | Manufacturer Part # | Supplier | Notes |
|---|---|---|---|---|
| LiPo fuel gauge | Adafruit | 5580 / MAX17048 | Adafruit | Direct LiPo voltage and fuel-gauge sensing for Device Health; electrically between the protected LiPo and the Adafruit 6106 battery input through the approved JST path. Actual LiPo voltage/trend is the primary operational metric; SOC is supplementary. |
| Feather female headers | Adafruit | 2940 | Adafruit | Short female headers for the board build. |
| Feather male breakaway headers | Adafruit | 3009 | Adafruit | Short male breakaway headers. |
| Feather JST power pigtail | Adafruit | 261 | Adafruit | Used for the onboard J4 VBAT/GND feed. |
| 5580 → 6106 battery jumper | Adafruit | 4714 | Adafruit | Current approved battery jumper. |

The canonical engineering BOM basis is the approved pilot-build configuration above. Inventory quantities, procurement status, and cost are intentionally not duplicated in canonical engineering truth unless a BOM owner requires those fields.

### Retained historical field-power evidence

The current reference device remains a separate physical evidence record and is not redefined as the new-build architecture. The current reference device was functionally validated with solar / LiPo / Adafruit 6106 field power, and the physical placement and mounting details remain TBD.

### Reference-Device Battery-Health Update

The Adafruit 5580 / MAX17048 fuel gauge is now physically installed and wired on the current reference device, using the approved wiring: VIN → J2/2 3V3, GND → J2/4 GND, SCL → J1/11, SDA → J1/12. I2C communication and battery-voltage acquisition were validated live on this reference device; see `docs/FIRMWARE_SPECIFICATION.md` for the validated Device Health result and `docs/HARDWARE_ASSEMBLY_GUIDE.md` for the wiring/validation record. Component placement, Perma-Proto geometry, and final mechanical layout remain TBD, as previously recorded.

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
