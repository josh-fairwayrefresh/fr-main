# Fairway Refresh Archive

This archive collects superseded milestones, abandoned features, and lessons
from earlier engineering work. It is historical context only. Current
operating behavior, requirements, procedures, and acceptance status are owned
by the current SoT documents listed in `README.md`. Do not use this file as
implementation, deployment, provisioning, or hardware guidance.

No device credentials or per-device course/location assignments belong here.
Production release and deployment records remain in `DEPLOYMENT_GUIDE.md`.

## Earlier hardware and firmware milestones

| Milestone or feature | Disposition | What went right / what was learned |
|---|---|---|
| Prototype 1.0 AA-powered reference build | Superseded | A complete button-to-LTE/HTTPS request path was demonstrated. A low resting battery voltage coincided with a nonfunctional device; replacing the cells restored operation, so resting voltage alone was not a sufficient readiness test. |
| LP 1.0 / LP 1.2 low-power generations | Superseded by the pilot runtime | The earlier 5.0 V measurement boundary produced approximately 23.5 uA and 23.25 uA dormant-current results, respectively. These are not measurements of the current VXX field-power architecture and must not be used as its autonomy estimate. |
| Prototype 1.1 solar/LiPo/Adafruit 6106 reference-device power | Superseded | Solar-supported and battery-only transactions succeeded on the reference unit. Disconnecting the 1000 uF capacitor did not interrupt the tested transactions; this functional observation was not transient or endurance characterization. |
| Prototype 1.2 Device Health and battery-health integration | Abandoned | Modem/link diagnostics and MAX17048 voltage acquisition were demonstrated. The Health and battery-health product path is not part of the current system. Historical Firestore records and a deployed legacy Health reader are not current telemetry. |
| Prototype 3.2 LiPo/5580/6106 and J4/VBAT pilot power | Superseded by Prototype 3.3 VBUS field power | The PV8 button and three-indicator circuits were validated and remain the control/feedback design. Assembly errors (missing transistor base pull-down grounds and 5580 VIN on `~RST` rather than `3V3`) caused absent indicators/non-running behavior; correcting the wiring restored operation. Do not reuse the old power feed as current wiring. |
| Prototype 3.3 VXX field-power validation evidence | Historical validation remains bounded; current wiring is owned by the BOM and assembly guide | The CPO designated V25, V50, and V75 as interchangeable regulated-output supplies. FRB-0003 operation and the approximately 5.3-5.4 V loaded reading were recorded with V75 only. V25/V50, long-term autonomy, and PPK2 consumption were not measured in that validation. The measured V75 voltage is close to the nPM1300's 5.5 V upper operating limit; transient and across-pack margin were not established. |
| Pre-3.2 single-indicator golfer feedback | Superseded | The old blink/solid-color sequence was replaced by the current orange/green/red pilot feedback. Current observable behavior is owned by `UX_SPECIFICATION.md`. |
| LP 1.0, LP 1.2, Golfer-First, Prototype 3.2, and intermediate diagnostic firmware images | Superseded or temporary | These generations established pieces of the current bounded transaction and local feedback design. Their individual artifact hashes, temporary test outcomes, and intermediate implementation details are not current firmware provenance. |

## Abandoned or retired product work

| Work | Disposition | What went right / what was learned |
|---|---|---|
| Course-configurable golfer demand window | Abandoned by CPO direction | Automated checks and a clean application build passed, but did not establish a working integrated feature. The accepted product uses a fixed five-minute window. |
| Device Health ingestion, battery-health reporting, and Health-derived alert engine | Abandoned/retired | Historical acquisition and records existed, but they do not represent current runtime behavior or monitoring. Their residual deployed read surface is tracked as deployment history, not active functionality. |
| Shared fleet-wide device credential | Retired | It was replaced by identity-bound per-device credentials. The current backend verifies each credential against the exact claimed device; no shared-key fallback is current behavior. |
| Prototype power alternatives (TMUX1101, MAX4544, switched-SAADC/divider) | Not selected | These alternatives were not adopted into the current hardware architecture. |
| Temporary connectivity and LED diagnostic variants | Not product releases | The diagnostics established observations about modem/network timing and the MCU LED output path. A commanded/high electrical pad did not by itself prove visible LED illumination; physical wiring/polarity corrections resolved the observed pilot LED issue without a firmware behavior change. |
| Historical authorization schema-v1 and intermediate UI integrations | Superseded by Pilot 1.1 | Incremental sandbox work exposed a Map-constructor initialization defect and a customer-label refresh defect. Regression tests and browser acceptance caught these before the accepted production state. Current authorization and UI behavior are owned by the deployment and UX documents. |

## Pilot 1.1 closeout notes

- The CPO accepted Pilot 1.1 as the integrated product milestone; it did not
  create a new firmware generation. Its original firmware milestone source was
  `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`; current source lineage and
  recovered artifact provenance are owned by `FIRMWARE_SPECIFICATION.md`.
- An earlier archive draft claimed that all six pilot devices were fully
  commissioned. That aggregate claim was unsupported and has been removed;
  current device status is owned by `DEVICE_PROVISIONING_GUIDE.md`.
- FRB-0006's device-specific image was built from the accepted source, flashed
  with readback verification, and reached `STATE_IDLE`, initialized the modem,
  and started LTE while USB-powered. Those recovery checks did not establish
  sustained field reliability; later intermittent request/COMPLETE results
  are recorded in `DEPLOYMENT_GUIDE.md`.
- On FRB-0001, the CPO corrected SIM orientation after an initial cellular
  failure. For FRB-0005, LTE registration rejections were observed before the
  CPO registered its SIM with Hologram; after registration, a fresh boot
  reached roaming LTE status. These observations support checking SIM seating
  and carrier provisioning before changing firmware; they do not diagnose
  every registration rejection.
- Fleet commissioning confirms functional operation, not endurance,
  VXX-pack autonomy, or PPK2 power characterization.
- The unaccepted opening-weekend service/reporting implementation was rejected
  and restored out of the working baseline. It is not current architecture or
  a compatibility path. Its approved product targets are recorded separately
  in `UX_SPECIFICATION.md`; future implementation must follow current readiness
  and review discipline rather than revive the rejected design.

## Current owner documents

For current facts and procedures, use:

- `README.md` for navigation and documentation policy.
- `ENGINEERING_GUIDE.md` for system overview and the Fidelity Mandate.
- `FIRMWARE_SPECIFICATION.md` for the accepted firmware implementation.
- `HARDWARE_BOM.md` and `HARDWARE_ASSEMBLY_GUIDE.md` for current parts and
  wiring.
- `DEVICE_PROVISIONING_GUIDE.md` for device lifecycle and credentials.
- `UX_SPECIFICATION.md` for current observable behavior.
- `DEPLOYMENT_GUIDE.md` for current deployment configuration and release
  records.
- `feature_backlog.md` for open future work.
