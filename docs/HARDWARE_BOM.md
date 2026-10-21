# Hardware Bill of Materials — Fairway Refresh Pilot 1.1

This document owns current hardware component identity. Physical connections and service-power precautions are owned by `docs/HARDWARE_ASSEMBLY_GUIDE.md`.

## Current pilot hardware

The current field-power architecture uses a regulated Voltaic V25, V50, or V75 USB output as designated by the CPO, feeding the Feather's VBUS domain. The VXX pack variants are designated interchangeable in regulated-output function and differ in capacity. This designation is not a measured autonomy or across-pack electrical qualification.

| Component | Manufacturer / identifier | Current use |
|---|---|---|
| Cellular MCU | Circuit Dojo `PASSY-NRF9151-FEATHER` | nRF9151 Feather with onboard nPM1300 |
| Field power | Voltaic V25 / V50 / V75 | Regulated USB output to the VBUS field-power rail; BOM lists V25, 6,700 mAh, qty 1; follow the assembly guide and qualification limits below |
| Antenna | Circuit Dojo `FLEX-LTE-GPS-UFL` | LTE/GPS combo antenna |
| SIM | Hologram SIM | Cellular service; individual ICCID belongs in the device registry, not this BOM |
| Project board | ElectroCookie PCB | BOM lists 6.8 × 2.05 inches, hole diameter 0.047 inches (1.2 mm), qty 2; supersedes the Adafruit 571 Perma-Proto parts-list designation |
| Solar panel | Adafruit 5366 / DigiKey 1528-5366-ND | BOM lists 2.37 W maximum, Vmp 7.28 V, 330 mA, factory 3.5 × 1.1 mm connector, qty 1; source-listed ratings, not measured system performance |
| Pack extensions | Voltaic extension cables | BOM lists 4 or 10 ft, 3.5 × 1.1 mm, qty 2; actual installed length unverified |
| Enclosure | Yetlebox | BOM lists grey IP67, 11.8 × 7.87 × 5 inches, qty 1; no independent certification established |
| USB power termination | USB 2.0 male-to-4-pin screw-terminal adapter | BOM qty 1; not a new wiring instruction |
| Rail connectors | WAGO 221, model 0221412K00-012, two-conductor | BOM qty 4; not a new wiring instruction |
| Headers | Adafruit 2940 and 3009 | Feather female and male breakaway headers |
| Wiring | Adafruit 288 | 22 AWG stranded silicone wire |
| Pushbutton | E-Switch PV8FWY0SS | Non-illuminated momentary button; leads 1 and 4 are the CPO continuity-tested switch contacts |
| Orange indicator | Dialight 656-3352-303F | 5 VDC, SENDING |
| Green indicator | Dialight 656-3202-303F | 5 VDC, REQUEST RECEIVED |
| Red indicator | Dialight 656-3102-303F | 5 VDC, TRY AGAIN |
| Indicator drivers | ALLECIN 2N3904, TO-92, qty 3 | One NPN transistor per indicator; procured-batch lead order is in the assembly guide |
| Base drive resistors | 2.2 kΩ, qty 3 | Feather GPIO to transistor base |
| Base pull-down resistors | 100 kΩ, qty 3 | Transistor base to common GND |
| Indicator terminal block | DIANN 12-position, 2.54 mm pitch | BOM procurement qty 5; documented terminal usage remains positions 1–6 for the three indicator pairs, not evidence that all five blocks are installed |
| Cable gland | CPO-supplied IP67/68-rated | Enclosure cable penetration |

## Current validation boundary

### Prototype 3.3 parts-list reconciliation — 2026-10-21

The CPO-supplied "Prototype Bill of Materials (v3.3 Pilot Ready), AS OF OCT 11,
2026" was inspected by the Lead Architect, who relayed the listed specifications
and procurement quantities recorded above. The PDF remains unavailable in the
checked local repository/workspace locations; VSC did not inspect it locally.
These are attributed BOM-listed facts, not verification of installed parts,
dimensions, quantities, wiring, electrical qualification, or measured autonomy.
V25 is the named pack; the established V25/V50/V75 regulated-output designation
and its qualification limits remain unchanged.
Existing button/indicator/driver components and established reference identities
are retained. The [retained panel reference](vendor/voltaic/5366_Voltaic+Systems+P126+R1E.pdf)
is not evidence of pack-specific charging wiring.

The supplied BOM also lists Adafruit 4714 with the legacy role
"MAX17048 #5580 -> 6106 BATT". That role describes the superseded architecture
and is obsolete for Prototype 3.3. This line is not a current wiring instruction
or a designation of any alternative current use for Adafruit 4714.
Solar charging sufficiency is the present operating assumption, not a
demonstrated energy balance or autonomy claim. Current VBUS power policy is
retained legacy design; idle-power correction, measurement, and solar/autonomy
qualification remain [backlog work](feature_backlog.md#power-and-autonomy).

FRB-0003 field-power validation used a V75 and observed approximately 5.3–5.4 V at Feather J1/3 VBUS under load. This is within the nPM1300 VBUS 4.0–5.5 V operating range but leaves limited margin to the upper bound; transient behavior and V25/V50 loaded voltage were not established by that measurement. Functional fleet commissioning does not establish PPK2 consumption or pack autonomy. See `docs/archive.md` for the bounded historical validation notes.

## Not part of the current field-power path

The earlier AA, solar/LiPo/Adafruit 6106, Adafruit 5580/MAX17048 battery-health, and J4/VBAT designs are superseded. Battery-health acquisition and reporting are abandoned. Historical parts and lessons are summarized in `docs/archive.md`; do not use those parts or wiring as current build guidance.
