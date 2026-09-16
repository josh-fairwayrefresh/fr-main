# Vendor Reference Library

This directory contains external vendor and manufacturer documents supplied for Fairway Refresh.

Vendor documents in this directory are reference evidence only. They do not supersede Fairway canonical SoTs, current tracked implementation, or CPO-confirmed evidence. Use them to establish external product specifications, pinouts, electrical limits, connector details, and vendor-supported behavior. Current Fairway architecture, requirements, procedures, and engineering decisions remain owned by the README-defined canonical engineering documents.

The presence of a document here does not mean every statement in it applies to the current Fairway architecture. Conflicts between vendor material and Fairway SoT or CPO-confirmed evidence must be surfaced for review.

## Supplied Documents

| Fairway BOM item / product | Manufacturer or source vendor | Document | Local path |
|---|---|---|---|
| Adafruit 368 DC power adapter | Adafruit | Product document | [368_Web.pdf](adafruit/368_Web.pdf) |
| Adafruit 4287 DC jack adapter | Adafruit | Product document | [4287_Web.pdf](adafruit/4287_Web.pdf) |
| Adafruit 5580 MAX17048 breakout | Adafruit | Product manual | [5580_Web%20manual.pdf](adafruit/5580_Web%20manual.pdf) |
| Adafruit BQ25185 / 5 V boost charger | Adafruit | Product guide | [adafruit-bq25185-usb-dc-solar-charger-with-5v-boost-board.pdf](adafruit/adafruit-bq25185-usb-dc-solar-charger-with-5v-boost-board.pdf) |
| Hologram SIM | Hologram | SGP.02 Hyper SIM datasheet | [2026_SGP.02_Hyper_SIM_Triple_Cut_Format_Datasheet.pdf](hologram/2026_SGP.02_Hyper_SIM_Triple_Cut_Format_Datasheet.pdf) |
| Circuit Dojo nRF9151 Feather | Circuit Dojo | Supplied nRF9151 Feather specification | [Nordic%20nRF9151%20spec.docx](circuitdojo/Nordic%20nRF9151%20spec.docx) |
| Circuit Dojo nRF9151 Feather | Circuit Dojo | Official PCB source | [nRF9151_Feather.kicad_pcb](circuitdojo/nRF9151_Feather.kicad_pcb) |
| Circuit Dojo nRF9151 Feather | Circuit Dojo | Official main schematic | [nRF9151_Feather.kicad_sch](circuitdojo/nRF9151_Feather.kicad_sch) |
| Circuit Dojo nRF9151 Feather power tree | Circuit Dojo | Official power schematic | [power.kicad_sch](circuitdojo/power.kicad_sch) |
| Circuit Dojo nRF9151 module | Nordic Semiconductor | nRF9151 Product Specification v1.1 | [nRF9151_PS_v1.1.pdf](nordic/nRF9151_PS_v1.1.pdf) |
| Fairway cellular antenna, ANT-LTE-RPC-UFL | Linx Technologies | ANT-LTE-RPC product datasheet | [ENG_DS_ANT-LTE-RPC-ccc_A.pdf](linx/ENG_DS_ANT-LTE-RPC-ccc_A.pdf) |
| Adafruit 328 2500 mAh LiPo | Hunan Soundon New Energy | 785060 2500 mAh battery specification | [785060-2500mAh_specification_sheet.pdf](soundon/785060-2500mAh_specification_sheet.pdf) |
| Adafruit 5366 solar panel | Voltaic Systems | P126 R1E panel drawing | [5366_Voltaic%2BSystems%2BP126%2BR1E.pdf](voltaic/5366_Voltaic%2BSystems%2BP126%2BR1E.pdf) |

## Feather JST / VBAT Evidence Availability

The official Circuit Dojo PCB and power-schematic sources above are the board-level reference for the onboard battery connector, VBAT/GND topology, J1/1 relationship, and separation from VBUS. The supplied Circuit Dojo specification document and current official specifications page provide the board battery-input requirements and range:

https://docs.circuitdojo.com/nrf9151-feather/specs.html

This index records where the external evidence resides. It does not make or supersede a Fairway architecture decision.

## Provenance

All files in this directory were copied from the CPO-supplied package at ingestion time. The source ZIP/package itself is not retained in the repository. Source documents were not rewritten, converted, annotated, or substantively modified.
