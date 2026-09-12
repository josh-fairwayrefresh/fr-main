# Hardware Bill of Materials — Prototype 1.0 (First Build, Pre-Pilot)

This document records the hardware installed in Prototype 1.0.

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
