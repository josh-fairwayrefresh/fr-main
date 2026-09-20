# Fairway Refresh Engineering Guide

## Document Status
- Status: Draft
- Version: 0.2
- Last updated: 2026-09-18
- Repository-verified implementation facts, validated prototype behavior, engineering decisions, field observations, and planned backlog items are distinguished in this guide.
- Repository-verified claims identify the relevant source path.
- Validated prototype behavior may come from repeated real-world testing even when the supporting implementation still needs full traceability in code.
- Unverified claims are marked `To Be Verified`.
- This revision reconciles the current `nfed` repository state against the validated LP 1.2 (West SDK Offloaded, NCS 3.1.1 Upgrade) engineering baseline and separates current verified behavior from historical milestone claims.

## Fidelity Mandate

==================================================
FAIRWAY REFRESH — FIDELITY MANDATE
==================================================

Before acting:

1. Establish current truth from the canonical Fairway repository. Confirm Git
   branch, HEAD, upstream and working-tree status. Read docs/README.md first,
   then freshly read all current Major Engineering Documents:

   docs/ENGINEERING_GUIDE.md
   docs/Continuous_improvement_Kaizen_1.0.md
   docs/FIRMWARE_SPECIFICATION.md
   docs/HARDWARE_BOM.md
   docs/HARDWARE_ASSEMBLY_GUIDE.md
   docs/DEPLOYMENT_GUIDE.md
   docs/DEVICE_PROVISIONING_GUIDE.md
   docs/feature_backlog.md
   docs/UX_SPECIFICATION.md

2. Follow the README-defined owner-document hierarchy. Current tracked
   source/configuration is authoritative for implementation; owner documents
   are authoritative for their engineering decisions and requirements;
   CPO-confirmed physical/validation evidence is valid evidence. Surface any
   material conflict rather than resolving it by assumption.

3. Perform only the work explicitly authorized. Use the canonical Fairway
   workspace, established procedures and direct current evidence. Preserve a
   clean workspace and keep investigation, editing, build, flash, test,
   deployment, commit and push within their explicit authorization boundaries.

4. Before reporting completion, inspect the actual result and re-check Git
   state. Verify the work against current implementation and the relevant owner
   documents, then report what changed, what was validated, anything unresolved,
   and anything not performed.

If the task requires an unapproved engineering/product decision or encounters
a material conflict that direct evidence cannot resolve, STOP and report it
for CPO/Architect decision.
==================================================

This section is the canonical Fairway Refresh Fidelity Mandate. Its exact text is authoritative for Fairway engineering governance and must be preserved verbatim.

## 1. Product System Overview

The implemented end-to-end path is:

physical marker button → nRF9151 firmware → LTE-M → HTTPS → Cloud Run receiver → Firestore → cart operator webapp.

The firmware runs on a Circuit Dojo nRF9151 Feather board and uses LTE-M connectivity to send an authenticated JSON button event to a Cloud Run function. The Cloud Run receiver validates the device key, stores requests in Firestore, and the webapp shows current requests to the cart operator.

## 2. Workspace and Repository Ownership

`nfed` is the Fairway-owned Git repository and the Fairway engineering system of record. It contains the Fairway firmware, backend, webapp, engineering documentation, board definitions, and build integration.

As of LP 1.2 (West SDK Offloaded, NCS 3.1.1 Upgrade), `nfed` is a freestanding product repository. It is not a West manifest repository and is not part of a Fairway-owned West workspace. The official Nordic NCS SDK (validated baseline: v3.1.1) is an independently installed, complete, pre-existing vendor West workspace external to `nfed`. Fairway builds against that installed SDK using an explicit `BOARD_ROOT` pointing at `nfed`; a second Fairway-owned West/NCS/Zephyr reconstruction (`west init`/`west update` against `nfed`) is not required and is not the validated procedure.

Exact build commands, the required matching Nordic toolchain, and the `BOARD_ROOT` invocation are owned by `docs/DEPLOYMENT_GUIDE.md` and are not duplicated here.

The Fairway Refresh GitHub repository (`nfed`) is the off-laptop current-state recovery repository. It contains the current Fairway-owned source, board and build configuration, canonical engineering documents, and Fairway-owned development and recovery tooling required to reconstruct the current development state on a replacement machine. Recovery assumes this repository, a separately installed official Nordic NCS SDK and matching toolchain, separately secured production secrets and credentials, and publicly obtainable vendor tooling identified by repository manifests and procedures. It is not intended to preserve hosted CI, historical Git development state, obsolete branches, generated build products, historical binary backups, or abandoned development material.

Canonical engineering documentation resides in `nfed/docs/`.
Product strategy material, milestone notes, and historical business documents may exist outside `nfed`, but they are not part of the canonical engineering source of truth unless migrated into the repository-controlled documentation set.

## LP1.3 — Repository Cleanup Milestone

LP1.3 is a repository/workspace engineering milestone. It is not a firmware generation and does not supersede LP1.2 as the validated firmware implementation. The validated firmware implementation remains the LP 1.2 (West SDK Offloaded, NCS 3.1.1 Upgrade) generation recorded in the Firmware Generation Registry in `docs/FIRMWARE_SPECIFICATION.md`; that record is unchanged by LP1.3.

LP1.3 records that:

- The canonical Fairway engineering workspace is `/Users/DuplexLoop/Documents/feather_code`, and the canonical Fairway repository is `/Users/DuplexLoop/Documents/feather_code/nfed`, confirmed clean at commit `8773548f42676aaf90bde1771fa2613d26a3b852` on `main`.
- `nfed` remains the freestanding Fairway product repository described above; the old Fairway-owned reconstructed West/NCS/Zephyr workspace (previously co-located as sibling directories alongside `nfed`) is not part of the active engineering state.
- Migration/recovery workspaces, stale repository copies, generated recovery build products, redundant secret copies, obsolete Agent edit material, and superseded vendor West-module workspace material were removed from the active workspace.
- The resulting repository was verified clean (no staged, unstaged, or untracked changes) before this milestone was recorded.
- LP1.3 establishes the clean starting point for the next Health Check engineering sprint.

## Prototype 1.1 — Solar Power Integration (Hardware Milestone)

Prototype 1.1 is a physical hardware milestone. It is not a firmware generation and does not change the Firmware Generation Registry in `docs/FIRMWARE_SPECIFICATION.md`. The current validated firmware generation remains LP 1.2 (West SDK Offloaded, NCS 3.1.1 Upgrade), unchanged by this milestone.

Prototype 1.1 replaces the historical Prototype 1.0 AA primary-battery field-power architecture with a CPO-installed solar / LiPo / Adafruit 6106 field-power architecture. Installed components and part numbers are owned by `docs/HARDWARE_BOM.md`; physical wiring detail is owned by `docs/HARDWARE_ASSEMBLY_GUIDE.md`.

Current vendor evidence closure for the onboard JST power feed:

- Official Circuit Dojo nRF9151 Feather specifications state that battery input supports LiPoly or primary cell and the battery operating range is 2.8–5.5 V.
- The current official Circuit Dojo nRF9151 Feather PCB source assigns J4 pad 1 to net 4 `VBAT` and J4 pad 2 to net 1 `GND`.
- The same official PCB source assigns Feather J1 pad 1 to net 4 `VBAT`.
- Therefore J4 pin 1 = J1/1 = VBAT and J4 pin 2 = common GND. This is not a VBUS domain.
- The current Fairway measured regulated rail at approximately 5.2–5.3 V is within Circuit Dojo's published 2.8–5.5 V battery-input range.
- No intervening alternate power-input topology exists between J4 pin 1 and J1/1; both are direct members of the same `VBAT` net on the official PCB.

This evidence closes the previous direct vendor-evidence gate and authorizes the documented J4 VBAT/GND feed refinement to be described as a physical interconnect refinement to the same electrical domains, not as a separate VBUS-connected topology.

The current approved pilot-build hardware architecture is distinct from the current reference device:

- Prototype 1.1 reference device: separate solar / LiPo / 6106 architecture with the historical AA power path removed and the physically validated field-power chain retained in the reference build.
- Current approved pilot-build architecture for new builds: LiPo → Adafruit 5580 / MAX17048 → Adafruit 4714 → Adafruit 6106 BATT; 5580 VIN → J2/2 3V3; 5580 GND → J2/4 GND; 5580 SCL → J1/11 / P0.01 / I2C2 SCL; 5580 SDA → J1/12 / P0.02 / I2C2 SDA; INT and QStart unused; SJ1 power LED jumper cut for pilot; VDD=VCC retained; external polyfuse omitted; 1000 uF capacitor omitted; 220 Ω PV4 LED resistor retained.
- The approved pilot-build power feed uses the existing regulated Fairway rail/common ground into the onboard JST J4 VBAT/GND domain using the Feather's official onboard connector path; J1/1 remains electrically VBAT and J2/4 remains electrically GND.
- Exact component placement, Perma-Proto geometry, battery mounting, connector orientation, and harness routing remain TBD.

Prototype 1.1 remains the current hardware milestone. The CPO-approved pilot-build architecture is a separate engineering-state record for new builds and must not be described as already installed on the reference unit.

The historical TMUX1101, MAX4544, switched-SAADC/divider, and legacy power-conditioning alternatives remain historical only and are not current alternatives.

CPO-confirmed functional validation for Prototype 1.1:

- The Adafruit 6106 regulated output was measured by the CPO at approximately 5.2–5.3 V unloaded, consistent with expected Adafruit 6106 behavior.
- The device operated the existing unchanged LP 1.2 firmware from the new power architecture and successfully completed a golfer button press through LTE-M/HTTPS to the existing backend, producing a request on the cart operator dashboard.
- The device successfully operated from solar-supported power, with an amber charging indicator present.
- The device transitioned from solar-supported to LiPo-only power without an observed functional interruption.
- The device successfully completed a Fairway transaction while operating from LiPo power alone, after solar was disconnected.

Not yet established by this milestone (deferred to later characterization / Device Health work):

- exact dormant current of the complete solar/LiPo/6106 system;
- 6106 conversion losses and quiescent consumption;
- LiPo-side and solar-side current measurements;
- LTE transient voltage/current behavior on the new power path;
- battery sag under LTE load;
- behavior across battery state-of-charge and solar irradiance/temperature conditions;
- long-duration reliability and exact runtime/autonomy;
- Device Health battery-voltage telemetry and watchdog/recovery behavior.

The historical 1000 uF bulk capacitor was present during the original Prototype 1.1 solar/LiPo/LTE validation, then electrically disconnected for a CPO-performed functional validation. The device successfully completed normal Fairway cellular transactions without it. The CPO accepted that functional result as sufficient to omit the capacitor from the five-new-board architecture. This does not establish detailed electrical transient characteristics, conversion efficiency, or long-duration reliability.

The historical LP 1.2 approximately 23.25 uA dormant-current measurement remains a whole-device measurement at the previously accepted 5.0 V boundary with AA batteries and USB disconnected; it is not reinterpreted as a measurement of the Prototype 1.1 solar/LiPo/6106 system.

Prototype 1.1 establishes the current physical hardware baseline for the next Device Health / Reliability engineering sprint, alongside the unchanged LP 1.2 validated firmware generation and the LP1.3 repository/workspace cleanup milestone above.

## Prototype 1.2 — Device Reliability Integration (Hardware/System Milestone)

Prototype 1.2 is the validated integrated product/system milestone. It is not a new firmware generation; the validated firmware implementation remains the LP 1.2 (West SDK Offloaded, NCS 3.1.1 Upgrade) generation recorded in the Firmware Generation Registry in `docs/FIRMWARE_SPECIFICATION.md`, unchanged by this milestone.

Prototype 1.2 integrates, on the existing Prototype 1.1 solar / LiPo / Adafruit 6106 field-power architecture:

- validated USB/VBUS service-awake behavior preventing Errata-36 debug-access loss while USB is present, implementation owned by `docs/FIRMWARE_SPECIFICATION.md`;
- validated Device Health acquisition layer (modem internal temperature, cellular RSRP/RSRQ/SNR, serving cell/band, transaction result/attempt tracking), acquisition/logging only, with no backend persistence or admin UI yet;
- the Adafruit 5580 / MAX17048 battery-health monitor, physically installed and wired on the reference device, with battery voltage/SOC acquisition integrated into the Device Health snapshot and validated against a DMM measurement;
- the documented non-destructive physical-RESET USB service-entry procedure, owned by `docs/DEPLOYMENT_GUIDE.md`.

CPO-confirmed validation: the integrated candidate built cleanly under the canonical NCS 3.1.1 procedure, flashed successfully, and operated correctly from the current field-power architecture with one normal Fairway button interaction producing the expected behavior.

Backend Device Health persistence and an admin-facing Device Health view are not part of Prototype 1.2. Current Prototype 1.2 behavior remains acquisition/logging only, with no backend persistence and no admin UI. The approved target architecture for Device Health transport, scheduling, backend persistence, thresholds, and alerts is recorded in `docs/FIRMWARE_SPECIFICATION.md` ("Device Health Transport and Scheduling (Approved Target, Not Yet Implemented)") and `docs/DEVICE_PROVISIONING_GUIDE.md` ("Device Health: Latest State, History, Thresholds, and Alerts (Approved Target)"); the approved admin capability target is recorded in `docs/feature_backlog.md` (WP4/WP5/WP6). None of that approved target architecture is implemented as of Prototype 1.2.

Prototype 1.2 does not redefine or freeze still-forthcoming pilot manufacturing details (exact component placement, Perma-Proto geometry, and mechanical layout), which remain owned by `docs/HARDWARE_BOM.md` and `docs/HARDWARE_ASSEMBLY_GUIDE.md` as previously recorded.

## Documentation Philosophy

Fairway Refresh engineering documentation follows a single-owner model.
Each engineering concept has exactly one canonical owner document.
That owner document holds the authoritative detail for the concept.
Other documents summarize only what is needed for context and otherwise reference the owner.
This reduces duplication across the documentation set.
It also minimizes documentation drift by ensuring updates are made in one location.

## 3. Stable Development Workflow

- `main` is the stable product branch.
- Experimental work occurs on feature branches.
- Inspect the current implementation before modifying it.
- Build does not flash firmware.
- Flashing requires explicit authorization and must be treated separately.
- Do not mix unrelated firmware, backend, and generated webapp changes in one task.

### VS Code Integrated-Terminal Shell Safety

VSC and engineers must not enable `set -u`, `setopt nounset`, `set -e`,
`setopt errexit`, or `set -euo pipefail` in a persistent VS Code integrated
zsh parent shell. Leaked `nounset` or `errexit` state can interfere with VS
Code prompt integration. When strict execution is needed, isolate it so the
option state cannot return to the parent shell:

```sh
(
   set -euo pipefail
   # bounded commands
)
```

When only pipeline failure propagation is required, prefer `set -o pipefail`
by itself. Do not mask this interaction by globally defining `RPROMPT`, by
modifying `~/.zprofile` or `~/.zshrc` without a separately established reason,
or by disabling VS Code shell integration. This is terminal-execution hygiene
only; it does not alter Fairway build, NCS/toolchain, firmware, deployment, or
Git architecture or governance.

## 4. Firmware

- User-visible device behavior is owned by `docs/UX_SPECIFICATION.md`.
- Firmware implementation is owned by `docs/FIRMWARE_SPECIFICATION.md`.

## 5. Hardware

Prototype 1.0 hardware definition is split between two owner documents.
`docs/HARDWARE_BOM.md` owns the installed hardware components and part numbers.
`docs/HARDWARE_ASSEMBLY_GUIDE.md` owns Prototype 1.0 physical assembly, wiring, and maintenance power-handling guidance.

The current approved pilot-build hardware architecture is owned by `docs/HARDWARE_BOM.md` and `docs/HARDWARE_ASSEMBLY_GUIDE.md` as the active design state for new builds, while the current reference-device evidence remains distinct and separate.

## Circuit Dojo nRF9151 Feather Reference

Prototype 1.0 uses the Circuit Dojo nRF9151 Feather development board.

The complete physical Feather header-to-signal/nRF9151 mapping is owned by the
Circuit Dojo nRF9151 Feather Pin Reference in
`docs/HARDWARE_ASSEMBLY_GUIDE.md`. Current source and DTS own implementation
pin configuration, consumption, and reservation.

Firmware generation identity and accepted checkpoint provenance are owned exclusively by `docs/FIRMWARE_SPECIFICATION.md`. Production authentication material is restored separately at the documented local path; the public CA input is tracked with the production application.
### Device authentication/rejection behavior

- Requests presenting a missing or invalid per-device credential are rejected with `401 Unauthorized`.
- Unknown device IDs are rejected with `404 Unknown device`.
- Retired devices and records with missing, malformed, or unknown states are rejected with `403 Inactive device`; communication permission is always derived from the device's canonical `state` (there is no independent `active` field on the Device record). See `docs/DEVICE_PROVISIONING_GUIDE.md` ("Canonical Registered-Device States").
- The claimed `device_id` (the Firestore document ID) is looked up first; credential verification is checked only against that exact device's own stored verifier, never a single fleet-wide value. See `docs/DEVICE_PROVISIONING_GUIDE.md` for the credential architecture.

### Fleet data foundation

The Customer -> Course -> Device fleet hierarchy, canonical ID formats (`CUST-XXXX`, `COURSE-XXXX`, `FRB-XXXX`), canonical device states, per-device credential architecture, and the backend ID-allocation/schema primitives (`fairway_backend/cloudrun_receiver/lib/fleet/`) are owned by `docs/DEVICE_PROVISIONING_GUIDE.md`. The live request-ingestion handler (`index.js`) verifies per-device credentials via this module instead of a single fleet-wide shared key; the duplicate-suppression logic is unchanged, but request-document `hole`/`device_label` fields are now derived from the device's canonical `location` field rather than reading independent duplicate Device fields.

### Cart operator webapp

- The webapp is implemented in `fairway_webapp/cart_operator_dashboard/`.
- It is a Firebase/Vite React dashboard that listens to Firestore request state.
- It calls Cloud Run status endpoints to confirm or complete requests.

#### Backend and webapp evidence
- `fairway_backend/cloudrun_receiver/index.js`
- `fairway_webapp/cart_operator_dashboard/src/main.jsx`
- `fairway_webapp/cart_operator_dashboard/package.json`

## Deployment Configuration Ownership

Deployment configuration, environment configuration, hosting rewrites, Cloud Run deployment, and operational deployment workflow are owned by `docs/DEPLOYMENT_GUIDE.md`.

## 7. Safe Build, Serial, and Flash Workflow

Firmware builds are performed with West from the Fairway firmware application.
Building and flashing are separate operations and must remain distinct in engineering workflow.
Detailed deployment, flashing, serial, and other operational procedures are owned by `docs/DEPLOYMENT_GUIDE.md` rather than this system-level engineering summary.

The current nRF9151 board runner configuration is maintained in
`boards/circuitdojo/feather_nrf9151/board.cmake`.
The pyOCD runner target is `nrf91`, and the probe-rs target is `nRF9151_xxAA`.

USB/VBUS service-mode debug-access loss on Errata-36-family reference silicon has been resolved through a validated CPU-awake prevention strategy while USB/VBUS is present. Implementation detail is owned by `docs/FIRMWARE_SPECIFICATION.md`; the exceptional destructive recovery procedure is owned by `docs/DEPLOYMENT_GUIDE.md`.

## 8. Troubleshooting Sequence

Current power isolation, USB service entry, flashing, and exceptional recovery
procedures are owned by `docs/HARDWARE_ASSEMBLY_GUIDE.md` and
`docs/DEPLOYMENT_GUIDE.md`. Follow those procedures for the installed hardware
generation before beginning symptom triage. Firmware behavior and diagnostic
interpretation are owned by `docs/FIRMWARE_SPECIFICATION.md`.

### Field Observation — 2026-08-02

- Prototype 1.0 stopped functioning while the battery pack measured approximately 3.0 V at rest.
- Replacing the cells with fresh batteries measuring approximately 4.0 V restored operation.
- Resting voltage alone is insufficient to establish operational readiness.
- Battery behavior under LTE load remains to be characterized.

## 9. Known Risks and Feature Backlog

### Current Observed or Repository-Verified Risks

- Blocking network operations in the golfer button request path were resolved by the golfer-first transaction architecture in `fde1aade63ac62650709e7ea6aead6f817b71b58`; see `docs/FIRMWARE_SPECIFICATION.md` ("Golfer Transaction Architecture"). Remaining desk/source-verified-only scenarios (forced-FAILURE timing, Health-vs-golfer concurrency, repeated boot determinism) are tracked as WP4 follow-up validation, not an open architectural risk.
- Battery behavior under LTE load remains uncharacterized.
- CPO-observed whole-device idle-power regression (approximately an order of magnitude versus the LP 1.2 ~23.25 uA baseline) coincident with the 5580/6106 power-architecture integration; deferred and unresolved, see `docs/feature_backlog.md`.

Current engineering roadmap, sprint status, and feature priority are owned
exclusively by `docs/feature_backlog.md` and are not duplicated here.

## 10. Documentation Map

- `docs/README.md`
- `docs/ENGINEERING_GUIDE.md`
- `docs/Continuous_improvement_Kaizen_1.0.md`
- `docs/HARDWARE_BOM.md`
- `docs/HARDWARE_ASSEMBLY_GUIDE.md`
- `docs/FIRMWARE_SPECIFICATION.md`
- `docs/UX_SPECIFICATION.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/DEVICE_PROVISIONING_GUIDE.md`
- `docs/feature_backlog.md`
- `docs/decisions/`

### Artifact provenance (historical)

The Phase 2 checkpoint below predates the LP 1.0 and LP 1.2 validated production generations and is retained only as historical context. Current firmware generation identity, checkpoint provenance, and artifact SHA-256 values are owned exclusively by the Firmware Generation Registry in `docs/FIRMWARE_SPECIFICATION.md`.

- Checkpoint commit: `d4381b3cc30391ca5509c749e25f14aac24b0059` — `fairway: checkpoint Phase 2 power management`.
- Board target: `circuitdojo_feather_nrf9151@1/nrf9151/ns`.
- Application/profile: `samples/fairway_power_sandbox` with `prj_a.conf`.
- Formal artifact: `samples/fairway_power_sandbox/artifacts/phase2/fairway_power_a_phase2_d4381b3c_merged.hex`.
- Artifact size: `453060` bytes.
- Artifact SHA-256: `e0ba5df0412af0577b63177e2b4ee7cfee28d76c64b3b80c0ca709317628d0ef`.
- Formal provenance record: `samples/fairway_power_sandbox/notes/builds/phase2-d4381b3c-2026-09-05.txt`.
- Validation: successful flash and boot, button wake, modem PSM exit/re-entry, HTTPS HTTP 200, return to `STATE_IDLE`, and PPK2 idle measurement of `901.12 uA`.

The Build A authentication and TLS inputs are intentionally local, ignored, and untracked:

- `samples/fairway_power_sandbox/src/secrets/fairway_device_key.h`
- `samples/fairway_power_sandbox/src/certs/google-run-ca-chain-cstr.pem`

Their contents are not repository documentation or source-controlled configuration.

Earlier workspace evidence referenced a `fairway_request_test` successful-build
record and generated artifact. That sample and artifact are not present in the
current workspace and are not current recoverable firmware provenance. Current
firmware provenance is owned by the Firmware Generation Registry in
`docs/FIRMWARE_SPECIFICATION.md`.

## 11. Historical Baseline — 2026-05-18

The May 18, 2026 milestone update described the following validated end-to-end system state:

- Physical PV4 button press triggered an nRF9151 prototype over LTE-M to send an HTTPS POST to Cloud Run.
- Cloud Run stored valid button events as Firestore request documents.
- A Firebase-hosted Cart Operator Dashboard displayed active requests in near real time.
- Operators could confirm and complete requests, with completion showing a success screen and removing the request from the active queue.
- The prototype latency from button press to dashboard card was approximately 8 seconds.

### Historical repository reconciliation recorded for this milestone

The earlier reconciliation associated with this historical milestone recorded:

- Firmware path: `samples/fairway_request_test/src/main.c`.
- Backend path: `fairway_backend/cloudrun_receiver/index.js`.
- Webapp path: `fairway_webapp/cart_operator_dashboard/src/main.jsx`.
- The firmware provisions the Google Cloud Run CA chain and uses TLS to connect to `fairway-button-receiver-936892386735.us-central1.run.app`.
- The firmware sent a fixed JSON payload:
  `{"device_id":"frb-0001","event_type":"button_press"}`.
- The firmware sent the `X-Fairway-Device-Key` header using `FAIRWAY_DEVICE_KEY`.
- The backend rejected missing/invalid device keys, unknown devices, and inactive devices.
- The backend suppressed duplicate open requests by checking for existing `requests` with status `new` or `confirmed`.
- The backend wrote new request documents to the `requests` collection and supported status updates through `POST /api/v1/requests/{requestId}/confirm` and `POST /api/v1/requests/{requestId}/complete`.
- The webapp implemented Firebase authentication via `onAuthStateChanged`, `signInWithRedirect`, and `signInWithEmailAndPassword`.
- The webapp subscribed to Firestore requests in real time and rendered active request cards.

These statements describe the historical snapshot, not current implementation.
Current firmware, fleet identity, authentication, and deployment truth is owned
by the current source and the subsystem owner documents listed above.

### Information from the milestone source and canonical ownership status

- Device provisioning details such as the Hologram APN and validated carrier-registration context exist in the milestone source; canonical provisioning guidance is maintained in `docs/DEVICE_PROVISIONING_GUIDE.md`, and historical statements remain historical unless independently revalidated.
- Deployment information from the milestone source is owned by `docs/DEPLOYMENT_GUIDE.md`; statements remain historical unless independently revalidated.

### Historical milestone context

- The May 18 milestone latency observation and test-environment details remain useful historical context, but they are not stable repository-controlled engineering configuration.
- Historical milestone statements should not be treated as canonical deployment or provisioning authority unless the relevant information is assigned to an owner document inside `nfed/docs`.

### Notes

- This guide uses the current `nfed` repository state as the authoritative source of truth.
- Historical milestone statements that are not directly traced to source code or repository-managed deployment artifacts are labeled as historical or to be verified.

## Workspace Evidence

- `west.yml` (historical West manifest; retained in `nfed` but not used by the validated LP 1.2 freestanding build procedure owned by `docs/DEPLOYMENT_GUIDE.md`).
