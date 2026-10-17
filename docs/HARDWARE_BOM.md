# Hardware Bill of Materials — Fairway Refresh Pilot 1.1

This document owns current hardware component identity. Physical connections and service-power precautions are owned by `docs/HARDWARE_ASSEMBLY_GUIDE.md`.

## Current pilot hardware

The current field-power architecture uses a regulated Voltaic V25, V50, or V75 USB output as designated by the CPO, feeding the Feather's VBUS domain. The VXX pack variants are designated interchangeable in regulated-output function and differ in capacity. This designation is not a measured autonomy or across-pack electrical qualification.

| Component | Manufacturer / identifier | Current use |
|---|---|---|
| Cellular MCU | Circuit Dojo `PASSY-NRF9151-FEATHER` | nRF9151 Feather with onboard nPM1300 |
| Field power | Voltaic V25 / V50 / V75 | Regulated USB output to the VBUS field-power rail; follow the assembly guide |
| Antenna | Circuit Dojo `FLEX-LTE-GPS-UFL` | LTE/GPS combo antenna |
| SIM | Hologram SIM | Cellular service; individual ICCID belongs in the device registry, not this BOM |
| Project board | Adafruit 571 | Perma-Proto half-sized distribution and driver board |
| Headers | Adafruit 2940 and 3009 | Feather female and male breakaway headers |
| Wiring | Adafruit 288 | 22 AWG stranded silicone wire |
| Pushbutton | E-Switch PV8FWY0SS | Non-illuminated momentary button; leads 1 and 4 are the CPO continuity-tested switch contacts |
| Orange indicator | Dialight 656-3352-303F | 5 VDC, SENDING |
| Green indicator | Dialight 656-3202-303F | 5 VDC, REQUEST RECEIVED |
| Red indicator | Dialight 656-3102-303F | 5 VDC, TRY AGAIN |
| Indicator drivers | ALLECIN 2N3904, TO-92, qty 3 | One NPN transistor per indicator; procured-batch lead order is in the assembly guide |
| Base drive resistors | 2.2 kΩ, qty 3 | Feather GPIO to transistor base |
| Base pull-down resistors | 100 kΩ, qty 3 | Transistor base to common GND |
| Indicator terminal block | DIANN 12-position, 2.54 mm pitch | Positions 1–6 terminate the three indicator pairs |
| Cable gland | CPO-supplied IP67/68-rated | Enclosure cable penetration |

## Current validation boundary

FRB-0003 field-power validation used a V75 and observed approximately 5.3–5.4 V at Feather J1/3 VBUS under load. This is within the nPM1300 VBUS 4.0–5.5 V operating range but leaves limited margin to the upper bound; transient behavior and V25/V50 loaded voltage were not established by that measurement. Functional fleet commissioning does not establish PPK2 consumption or pack autonomy. See `docs/archive.md` for the bounded historical validation notes.

## Not part of the current field-power path

The earlier AA, solar/LiPo/Adafruit 6106, Adafruit 5580/MAX17048 battery-health, and J4/VBAT designs are superseded. Battery-health acquisition and reporting are abandoned. Historical parts and lessons are summarized in `docs/archive.md`; do not use those parts or wiring as current build guidance.
