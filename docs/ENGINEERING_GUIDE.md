# Fairway Refresh Engineering Guide

## Document Status
- Status: Draft
- Version: 0.1
- Last updated: 2026-09-11
- Repository-verified implementation facts, validated prototype behavior, engineering decisions, field observations, and planned backlog items are distinguished in this guide.
- Repository-verified claims identify the relevant source path.
- Validated prototype behavior may come from repeated real-world testing even when the supporting implementation still needs full traceability in code.
- Unverified claims are marked `To Be Verified`.
- This revision reconciles the current `nfed` repository state against the May 18, 2026 milestone source and separates current verified behavior from historical milestone claims.

## 1. Product System Overview

The implemented end-to-end path is:

physical marker button → nRF9151 firmware → LTE-M → HTTPS → Cloud Run receiver → Firestore → cart operator webapp.

The firmware runs on a Circuit Dojo nRF9151 Feather board and uses LTE-M connectivity to send an authenticated JSON button event to a Cloud Run function. The Cloud Run receiver validates the device key, stores requests in Firestore, and the webapp shows current requests to the cart operator.

## 2. Workspace and Repository Ownership

`feather_code` is the West workspace root used to assemble the embedded development environment.
Within that workspace, `nfed` is the Fairway-owned Git repository and the Fairway engineering system of record.
It contains the Fairway firmware, backend, webapp, engineering documentation, and the West manifest used to define the workspace.

The Fairway Refresh GitHub repository is the off-laptop current-state recovery repository. It contains the current Fairway-owned source, board and build configuration, canonical engineering documents, dependency manifests, and Fairway-owned development and recovery tooling required to reconstruct the current development state on a replacement machine. Recovery assumes the repository, separately secured production secrets and credentials, and publicly obtainable vendor tooling and dependencies identified by repository manifests and procedures. It is not intended to preserve hosted CI, historical Git development state, obsolete branches, generated build products, historical binary backups, or abandoned development material.

The other major repositories present in the workspace, including `zephyr`, `nrf`, `nrfxlib`, and related modules, are upstream dependencies managed through West rather than Fairway-owned repositories.
Canonical engineering documentation resides in `nfed/docs/`.
Product strategy material, milestone notes, and historical business documents may exist outside `nfed`, but they are not part of the canonical engineering source of truth unless migrated into the repository-controlled documentation set.

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

## 4. Firmware

- User-visible device behavior is owned by `docs/UX_SPECIFICATION.md`.
- Firmware implementation is owned by `docs/FIRMWARE_SPECIFICATION.md`.

## 5. Hardware

Prototype 1.0 hardware definition is split between two owner documents.
`docs/HARDWARE_BOM.md` owns the installed hardware components and part numbers.
`docs/HARDWARE_ASSEMBLY_GUIDE.md` owns Prototype 1.0 physical assembly, wiring, and maintenance power-handling guidance.

## Circuit Dojo nRF9151 Feather Reference

Prototype 1.0 uses the Circuit Dojo nRF9151 Feather development board.

- `docs/decisions/`

Firmware generation identity and accepted checkpoint provenance are owned exclusively by `docs/FIRMWARE_SPECIFICATION.md`. Production authentication material is restored separately at the documented local path; the public CA input is tracked with the production application.
### Device authentication/rejection behavior

- Requests without the expected device key are rejected with `401 Unauthorized`.
- Unknown device IDs are rejected with `404 Unknown device`.
- Inactive devices are rejected with `403 Inactive device`.

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

## 8. Troubleshooting Sequence

1. Verify power.
2. Attempt a hardware reset.
3. Connect USB with primary battery disconnected.
4. Open serial.
5. Reset and observe boot.
6. Test button acknowledgement.
7. Observe LTE/HTTPS logs.
8. Check Cloud Run/backend only if the request reached it.

### Field Observation — 2026-08-02

- Prototype 1.0 stopped functioning while the battery pack measured approximately 3.0 V at rest.
- Replacing the cells with fresh batteries measuring approximately 4.0 V restored operation.
- Resting voltage alone is insufficient to establish operational readiness.
- Battery behavior under LTE load remains to be characterized.

## 9. Known Risks and Feature Backlog

### Current Observed or Repository-Verified Risks

- Blocking network operations in the firmware request path.
- Battery behavior under LTE load remains uncharacterized.

### Engineering Roadmap Themes

Current engineering roadmap and feature planning are owned by `docs/feature_backlog.md`.

- Device provisioning
- Payload/API alignment
- Device onboarding
- Authentication & Security
- Course configuration
- Analytics
- Health monitoring
- Operational instrumentation

This section is a summary only; canonical backlog ownership is maintained in `docs/feature_backlog.md`.

## 10. Documentation Map

- `docs/README.md`
- `docs/ENGINEERING_GUIDE.md`
- `docs/HARDWARE_BOM.md`
- `docs/HARDWARE_ASSEMBLY_GUIDE.md`
- `docs/FIRMWARE_SPECIFICATION.md`
- `docs/UX_SPECIFICATION.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/DEVICE_PROVISIONING_GUIDE.md`
- `docs/feature_backlog.md`
- `docs/decisions/`

### Artifact provenance

The current validated Phase 2 Build A checkpoint is:

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

A tracked successful-build record exists at
`samples/fairway_request_test/notes/builds/stable-main-afa191d-2026-07-06.txt`.
The matching `samples/fairway_request_test/build/merged.hex` is present in the current workspace and its SHA-256 matches the recorded checksum. It is not tracked as a formal release artifact, and source-to-binary provenance is not independently attested.

## 11. Historical Baseline — 2026-05-18

The May 18, 2026 milestone update described the following validated end-to-end system state:

- Physical PV4 button press triggered an nRF9151 prototype over LTE-M to send an HTTPS POST to Cloud Run.
- Cloud Run stored valid button events as Firestore request documents.
- A Firebase-hosted Cart Operator Dashboard displayed active requests in near real time.
- Operators could confirm and complete requests, with completion showing a success screen and removing the request from the active queue.
- The prototype latency from button press to dashboard card was approximately 8 seconds.

### Current repository reconciliation

Verified in the current `nfed` repository:

- Firmware path: `samples/fairway_request_test/src/main.c`.
- Backend path: `fairway_backend/cloudrun_receiver/index.js`.
- Webapp path: `fairway_webapp/cart_operator_dashboard/src/main.jsx`.
- The firmware provisions the Google Cloud Run CA chain and uses TLS to connect to `fairway-button-receiver-936892386735.us-central1.run.app`.
- The firmware currently sends a fixed JSON payload:
  `{"device_id":"frb-0001","event_type":"button_press"}`.
- The firmware sends the `X-Fairway-Device-Key` header using `FAIRWAY_DEVICE_KEY`.
- The backend rejects missing/invalid device keys, unknown devices, and inactive devices.
- The backend suppresses duplicate open requests by checking for existing `requests` with status `new` or `confirmed`.
- The backend writes new request documents to the `requests` collection and supports status updates through `POST /api/v1/requests/{requestId}/confirm` and `POST /api/v1/requests/{requestId}/complete`.
- The webapp implements Firebase authentication via `onAuthStateChanged`, `signInWithRedirect`, and `signInWithEmailAndPassword`.
- The webapp subscribes to Firestore requests in real time and renders active request cards.

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

- `west.yml`
- `/Users/DuplexLoop/Documents/feather_code/.west/config` (workspace evidence outside the `nfed` repository)
