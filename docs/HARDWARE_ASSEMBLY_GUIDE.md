# Hardware Assembly & Wiring Guide — Fairway Refresh Pilot 1.1

## Purpose

This document owns current physical wiring, service-power isolation, and the Circuit Dojo nRF9151 Feather header reference. It is not a manufacturing work instruction. Current component identity is owned by `docs/HARDWARE_BOM.md`.

## Current field power and service isolation

The CPO-designated Voltaic V25/V50/V75 regulated USB output feeds the distribution +5 V rail and Feather J1/3 VBUS. Pack negative connects to the common GND rail and Feather J2/4 GND. The Feather J4 battery connector and J1/1 VBAT are unused for this field-power path.

The [current BOM reconciliation](HARDWARE_BOM.md#prototype-33-parts-list-reconciliation--2026-10-21)
designates ElectroCookie boards and a USB screw-terminal adapter/WAGO
connectors. Older "Perma-Proto" labels describe recorded distribution, not a
requirement to purchase Adafruit 571. The parts list alone does not establish
new trace connections, wire sizing, quantities, or electrical qualification.

**The VXX pack and USB service cable are mutually exclusive power sources.** Disconnect VXX field power before connecting Feather USB for development or service; disconnect USB before reconnecting field power. Never drive the shared VBUS domain from both sources simultaneously.

The nPM1300 VBUS operating range is 4.0–5.5 V. The CPO observed approximately 5.3–5.4 V under load on FRB-0003 using V75. That observation is close to the upper limit; it does not establish transient/tolerance margin or qualify V25/V50 voltage under load. Stop and obtain engineering review if the supply is outside the documented operating range or operation is abnormal.

Specifications: [Nordic nPM1300 Product Specification](https://docs.nordicsemi.com/bundle/ps_npm1300/) and [Circuit Dojo nRF9151 Feather specifications](https://docs.circuitdojo.com/nrf9151-feather/specs.html).

## Button and indicator wiring

### PV8 button

- PV8 lead 1 → Feather J1/5 / P0.31 / D7.
- PV8 lead 4 → common GND.
- Leads 2 and 3 are not connected.
- Verify lead continuity before soldering: leads 1 and 4 are open released and closed when pressed.

### Three 5 V indicators

| Indicator | Feather GPIO | Meaning |
|---|---|---|
| Orange | J1/6 / P0.30 / D6 | SENDING |
| Green | J1/7 / P0.29 / D5 | REQUEST RECEIVED |
| Red | J1/8 / P0.28 / D4 | TRY AGAIN |

Each indicator's positive lead connects to the +5 V rail; its negative lead connects to the collector of its own 2N3904. Each transistor emitter connects to common GND; Feather GPIO connects through 2.2 kΩ to the base; a 100 kΩ resistor connects base to common GND. For the procured ALLECIN 2N3904 batch, with flat face toward the viewer and leads downward: LEFT = Collector, MIDDLE = Base, RIGHT = Emitter.

DIANN terminal positions 1–6 are Orange +/−, Green +/−, Red +/− respectively. Positions 7–12 are unused. The indicator circuit does not use a series resistor; the Dialight parts are integrated 5 V indicators.

## Feather onboard battery connector reference

Official Circuit Dojo board evidence identifies J4 pad 1 and J1/1 as VBAT, and J4 pad 2 and J2/4 as GND. J4/J1/1 are not VBUS; do not use them for the current VXX field-power feed.

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

## Pre-power inspection

Before energizing an assembly, confirm:

- VXX polarity and continuity to the +5 V/GND distribution rails.
- Feather field-power feed is on J1/3 VBUS and return is on J2/4 GND; J4 and J1/1 are not connected to field power.
- USB and VXX are not connected simultaneously.
- Button lead assignments and each indicator's transistor/resistor topology are correct.
- All three 100 kΩ base pull-downs reach common GND; transistor lead order is verified for the procured batch.
- LTE/GPS antenna and SIM are installed and wiring has strain relief.

Power and firmware behavior checks are owned by `docs/DEPLOYMENT_GUIDE.md`, `docs/FIRMWARE_SPECIFICATION.md`, and `docs/UX_SPECIFICATION.md`. Functional operation is not evidence of endurance or pack autonomy.

## FRB-0003 SIM-removal maintenance exception

**Completed one-time historical exception, not standing authorization.**
The following preserves the authorized recovery sequence and safety limits;
do not repeat it. Current commissioning status is owned by the Device
Provisioning Guide. Future maintenance needs its own coherent authorization.

The normal pre-power inspection above still requires the LTE/GPS antenna and
SIM to be installed. For the CPO-authorized FRB-0003 credential-recovery
maintenance procedure only, the CPO confirms the removable Hologram SIM is
the device's only active cellular identity and authorizes temporary removal.
Power the device down and disconnect field power and all external power before
removing the SIM. Keep the same SIM out throughout flashing and credential
activation so the device remains offline. After successful activation, power
the device down before reinstalling that SIM, then restore the approved power
configuration. Never connect USB and VXX simultaneously. This exception does
not authorize flashing or production credential operations; follow the
separate stage approvals and procedure in `docs/DEVICE_PROVISIONING_GUIDE.md`.

## Reference

Historical prototype wiring and lessons are summarized in `docs/archive.md`. They are not current assembly instructions.
