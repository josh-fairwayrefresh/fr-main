# Deployment Guide

## Purpose

This document is the canonical deployment and operational guide for Fairway Refresh.

It owns deployment configuration, environment configuration, hosting configuration, and deployment workflow information.

It does not own hardware implementation, firmware implementation details, UX behavior definitions, or feature planning.

---

## Deployment Architecture

The documented deployment architecture consists of:

- Firmware running on nRF9151 hardware that sends HTTPS button events to a Cloud Run endpoint.
- A Cloud Run backend service that validates requests and writes request records to Firestore.
- A Firebase-hosted operator web application.
- Firestore for request state and operator workflow state transitions.
- Operator actions in the web application that call Cloud Run status endpoints.

Context references:

- Firmware owner document: docs/FIRMWARE_SPECIFICATION.md
- Hardware owner documents: docs/HARDWARE_BOM.md and docs/HARDWARE_ASSEMBLY_GUIDE.md
- UX owner document: docs/UX_SPECIFICATION.md

---

## Current Environment

### Repository + Historical Deployment Configuration (Pending Live Verification)

| Item | Source | Value |
|------|--------|-------|
| Google Cloud Project | Repository + Historical Working State | savvy-kit-496703-r5 |
| Project Number | Repository + Historical Working State | 936892386735 |
| Firebase Project | Repository + Historical Working State | savvy-kit-496703-r5 |
| Cloud Run Region | Repository + Historical Working State | us-central1 |
| Cloud Run Service | Repository + Historical Working State | fairway-button-receiver |
| Cloud Run URL | Repository + Historical Working State | https://fairway-button-receiver-936892386735.us-central1.run.app |
| Firebase Hosting URL | Historical Working State | https://savvy-kit-496703-r5.web.app |
| Firestore Database | Live Verification Required | Cloud Firestore (Native mode); database ID is not recorded in current repository-controlled artifacts. |

### Historical Deployment Environment (Pending Independent Revalidation)

- Historical deployment workflow and environment details are captured in the Working State document.
- Historical statements that have not been independently revalidated are explicitly labeled throughout this guide.

---

## Repository Locations

- Firmware: samples/fairway_power_sandbox/
- Backend: fairway_backend/cloudrun_receiver/
- Operator Dashboard: fairway_webapp/cart_operator_dashboard/

---

## Required Services

Current deployment depends on:

- Google Cloud Project (Cloud Run and Firestore)
- Cloud Run
- Firebase Hosting
- Cloud Firestore
- Hologram (LTE-M SIM/provider dependency)

---

## Environment Configuration

| Item | Source | Status | Notes |
|------|--------|--------|-------|
| FAIRWAY_DEVICE_KEY | Repository | Required | Runtime secret used by backend request authentication; value intentionally omitted. |
| Firmware device key secret | Repository | Required | Device-side secret material required for outbound request header; values intentionally omitted. |
| Firebase web configuration | Repository | Repository-managed | Web app configuration is maintained in source; this guide does not duplicate values. |
| TLS CA chain certificates | Repository | Repository-managed | Firmware trust material is maintained in the firmware certificate directory. |
| Cloud Run service account IAM | Historical Working State | Pending Live Verification | Historical source reports Firestore write role assignment; exact service account identity is not recorded in current repository-controlled artifacts. |
| Secrets management system of record | Live Verification Required | Not Documented | Secrets system of record, ownership, and rotation workflow are not documented in current repository-controlled deployment artifacts. |

---

## Firmware Deployment

Firmware deployment procedures are owned by this document.

Firmware implementation is owned by docs/FIRMWARE_SPECIFICATION.md.

### Authorization Control

Fairway firmware work follows this authorization sequence:

PLAN
-> CPO APPROVAL
-> IMPLEMENT / CODE
-> BUILD
-> CPO AUTHORIZATION TO FLASH
-> FLASH
-> CPO AUTHORIZATION TO RUNTIME / MANUAL TEST
-> MANUAL TEST
-> CHECK

Build authorization does not authorize flashing.
Flash authorization does not authorize runtime or manual testing.

The technical procedure below describes how an already-approved operation is performed; it does not grant authorization to perform that operation.

### Build Procedure

On a replacement machine, install the publicly available Nordic toolchain compatible with the `nrf` manifest revision in `west.yml` and West. Create a workspace directory, clone this repository into `<workspace>/nfed`, then initialize its vendor dependencies from the workspace root:

```sh
west init -l nfed
west update
```

Build the current Fairway application with Build A configuration using a new pristine build directory from `<workspace>`:

```sh
west build \
  --build-dir <new-build-dir> \
  <workspace>/nfed/samples/fairway_power_sandbox \
  --pristine \
  --board circuitdojo_feather_nrf9151@1/nrf9151/ns \
  -- -DEXTRA_CONF_FILE=prj_a.conf \
     -DDEBUG_THREAD_INFO=On \
     -DCONFIG_DEBUG_THREAD_INFO=y \
     -Dfairway_power_sandbox_DEBUG_THREAD_INFO=On \
     -Dmcuboot_DEBUG_THREAD_INFO=Off
```

The build must exit successfully and produce `<new-build-dir>/merged.hex`.
Record the artifact path, byte size, SHA-256, board target, configuration, and source commit in the build provenance record before flashing.

Before flashing, verify the selected artifact against that provenance record. Do not substitute an artifact from another build directory.

The application `samples/fairway_power_sandbox/sysbuild.cmake` propagates the tracked Fairway board root to the MCUboot child image. This is required for the custom `circuitdojo_feather_nrf9151` board to resolve consistently during the sysbuild build.

### Flash Procedure

The current Fairway programming path is probe-rs. In USB/debug/service mode, USB is connected and PPK2 is disconnected, as specified by `docs/HARDWARE_ASSEMBLY_GUIDE.md`.

After separate CPO authorization to flash, program the verified Intel HEX artifact:

```sh
probe-rs download --chip nRF9151_xxAA --binary-format hex <merged.hex>
```

Successful programming is indicated by probe-rs completing erase and programming and reporting completion. After successful programming, a normal reset may be issued:

```sh
probe-rs reset --chip nRF9151_xxAA
```

### Recovery and Debug-Lock Operations

Debug-lock inspection is separate from normal deployment:

```sh
recovery --verify
```

This is a non-destructive diagnostic check. A destructive unlock/erase operation must be separately authorized and is not a normal flash prerequisite:

```sh
recovery --unlock-only
```

After an authorized unlock, verify the device reports unlocked before proceeding. Recovery does not replace the normal probe-rs programming procedure.

### Manual Validation

After separate CPO authorization for runtime/manual testing, perform only the validation appropriate to the approved operating mode.

For the validated field/measurement path:

1. Disconnect USB and use PPK2 or an approved 5.0 V field supply, with the mutually exclusive power modes defined in `docs/HARDWARE_ASSEMBLY_GUIDE.md`.
2. Cold-boot the approved production image.
3. Confirm expected startup and dormant behavior described by `docs/FIRMWARE_SPECIFICATION.md` and `docs/UX_SPECIFICATION.md`.
4. Press the Fairway button once.
5. Confirm the expected request and LED sequence.
6. Confirm the device returns to its expected dormant state.

The accepted production field result is approximately 23.5 uA dormant current at the 5.0 V boundary after the request transaction. This value and its implementation context are owned by `docs/FIRMWARE_SPECIFICATION.md`.

### USB / PPK2 Switchover Observation

During development, the device has occasionally entered a locked state while physically switching between USB power/service connection and PPK2 field/measurement connection.

The specific cause has not been determined. The occurrence may be related to the physical power, cable, or reset sequence used during the switchover.

If the device becomes locked, the condition can be confirmed from the terminal using `recovery --verify`. Recovery is straightforward: perform the established erase-all/unlock recovery procedure with `recovery --unlock-only` and then re-flash the approved firmware.

Determining which part of the physical USB/PPK2 switchover sequence causes this behavior is not currently a priority because the condition is easily recoverable and does not affect normal field operation.

Revisit this issue only if it becomes frequent, difficult to recover from, or materially interferes with development or deployment.

---

## Backend Deployment

Repository-Derived and Historical Backend Deployment Facts:

- Runtime libraries indicate Node.js function-style service using @google-cloud/functions-framework.
- Documented deployed service name: fairway-button-receiver
- Documented deployed URL: https://fairway-button-receiver-936892386735.us-central1.run.app
- Button-event ingestion currently enforces `X-Fairway-Device-Key` authentication.
- Confirm and complete status endpoints currently do not enforce equivalent endpoint authentication in backend implementation.
- Authentication/authorization hardening for operator control endpoints remains unresolved and is not an approved production security model.
- Backend request parsing currently accepts compatibility aliases/defaults (`device_id` or `device`, `event_type` or `event`, with defaults when absent) beyond the canonical payload contract; formal acceptance or removal of this behavior remains unresolved.
- Supported request routes:
  - POST /
  - POST /api/v1/button-events
  - POST /api/v1/requests/{requestId}/confirm
  - POST /api/v1/requests/{requestId}/complete

Deployment process status:

No repository-controlled backend deployment command or CI pipeline is currently documented.
The canonical backend deployment process is not yet published in repository-controlled artifacts.

Deployment Verification:

- Historical deployment verification flow (pending independent revalidation):
  - Cloud Run curl POST creates Firestore document and returns OK with document id.
  - Dashboard status actions update request status via confirm/complete endpoints.

---

## Web Application Deployment

Repository-Derived and Historical Web Deployment Facts:

- Web app source path: fairway_webapp/cart_operator_dashboard/
- Build command: npm run build (package.json)
- Local dev command: npm run dev (package.json)
- Firebase Hosting config present in firebase.json with SPA rewrite to /index.html
- Historical deployment command (pending independent revalidation):
  - npx firebase-tools deploy --only hosting --project savvy-kit-496703-r5

Deployment process status:

Repository-controlled artifacts define web build behavior, and historical records capture a firebase-tools deployment command.
The currently approved web deployment release command is not yet published as a repository-controlled operational standard.

Deployment Verification:

- Historical Working State indicates hosted dashboard URL is reachable and live request flow is validated (pending independent revalidation).

---

## Firestore Configuration

Repository-Derived Firestore Configuration:

- Rules file path: fairway_webapp/cart_operator_dashboard/firestore.rules
- Current rule behavior in repository:
  - requests collection is readable when request.auth is not null
  - Browser writes are denied by rules
  - Catch-all deny for other document paths

Repository-Derived collection usage in repository code:

- requests (read and write paths)
- devices (backend lookup for device activation and metadata)

Collection schema is owned by the backend implementation.

Indexes:

- No repository firestore.indexes.json file is currently present; required composite indexes are not documented in repository-controlled artifacts.

---

## Device Provisioning Dependencies

Device provisioning procedures are out of scope for this deployment owner document.

Owned by:

- `docs/DEVICE_PROVISIONING_GUIDE.md`

Related planning reference:

- docs/feature_backlog.md

---

## Operational Verification

Repository + historical operational verification sequence (pending live verification):

1. Firmware boots and reaches network-ready state.
2. Device sends request to Cloud Run endpoint.
3. Backend stores request document in Firestore.
4. Operator dashboard receives live request update.
5. Confirm action succeeds and updates status.
6. Complete action succeeds and updates status/removes active item.

A deployment is considered successful only after all six verification steps complete successfully.

---

## Rollback Procedure

No verified rollback workflow is currently documented in repository-controlled deployment artifacts or in the extracted historical Working State evidence used for this document.
Rollback procedure remains undefined in canonical deployment documentation at this time.

---

## Troubleshooting

Troubleshooting procedures are owned by other Source of Truth documents.

References:

- docs/HARDWARE_ASSEMBLY_GUIDE.md
- docs/FIRMWARE_SPECIFICATION.md

Deployment-specific troubleshooting entries should be added here only after they are verified from repository-controlled deployment artifacts.

---

## Notes

Ownership boundaries:

- Hardware: docs/HARDWARE_BOM.md
- Hardware Assembly: docs/HARDWARE_ASSEMBLY_GUIDE.md
- Firmware: docs/FIRMWARE_SPECIFICATION.md
- UX: docs/UX_SPECIFICATION.md
- Device Provisioning: docs/DEVICE_PROVISIONING_GUIDE.md
- Engineering: docs/ENGINEERING_GUIDE.md
- Feature Backlog: docs/feature_backlog.md

---

## Source Provenance

This document was initially reconciled from:

- Repository source code
- Repository configuration
- Historical Working State document

Historical information that has not been independently revalidated is explicitly identified throughout this document.
