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

### Current Validated Deployment Environment

| Item | Source | Value |
|------|--------|-------|
| Google Cloud Project | Current Operational Evidence | savvy-kit-496703-r5 |
| Project Number | Repository + Historical Working State | 936892386735 |
| Firebase Project | Repository + Historical Working State | savvy-kit-496703-r5 |
| Cloud Run Region | Current Operational Evidence | us-central1 |
| Cloud Run Service | Current Operational Evidence | fairway-button-receiver |
| Cloud Run URL | Repository + Current Operational Evidence | https://fairway-button-receiver-936892386735.us-central1.run.app |
| Firebase Hosting URL | Historical Working State | https://savvy-kit-496703-r5.web.app |
| Firestore Database | Current Operational Evidence | Cloud Firestore (Native mode); database ID is not recorded in current repository-controlled artifacts. |

WP3 deployment validation on 2026-09-18 established that Cloud Run revision
`fairway-button-receiver-00009-c5j` was healthy and receiving 100% of service
traffic. The revision identifies that validation event only; deployment and
operational procedures target the durable service name, not a permanent
revision ID.

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
| Per-device firmware identity and credential | Local provisioning material | Required | `FAIRWAY_DEVICE_ID` and the per-device `FAIRWAY_DEVICE_KEY` macro are supplied by the local gitignored provisioning header; values are intentionally omitted. |
| Firebase web configuration | Repository | Repository-managed | Web app configuration is maintained in source; this guide does not duplicate values. |
| TLS CA chain certificates | Repository | Repository-managed | Firmware trust material is maintained in the firmware certificate directory. |
| Cloud Run service account IAM | Historical Working State | Pending Live Verification | Historical source reports Firestore write role assignment; exact service account identity is not recorded in current repository-controlled artifacts. |
| Secrets management system of record | Live Verification Required | Not Documented | Secrets system of record, ownership, and rotation workflow are not documented in current repository-controlled deployment artifacts. |

The backend has no fleet-wide `FAIRWAY_DEVICE_KEY` requirement. Button-event
authentication uses the claimed Device's own Firestore-stored verifier, and
the obsolete Cloud Run environment variable has been removed.

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

Fairway `nfed` operates as a freestanding product repository built against the separately installed official NCS v3.1.1 SDK. A second Fairway-owned West/NCS reconstruction (`west init`/`west update` against `nfed`) is not required and is not the validated procedure.

On macOS, install the nRF Connect for VS Code extension and use **Install SDK** or **Manage SDKs** to install nRF Connect SDK v3.1.1 with its matching Nordic toolchain. NCS v3.1.1 is the validated canonical deployment SDK baseline. As an equivalent supported command-line alternative, use nRF Util SDK Manager with Nordic's release-specific v3.1.1 installation flow. Do not use the deprecated nRF Connect for Desktop Toolchain Manager for NCS 3.x.

Create a clean workspace directory, then clone the Fairway recovery repository into `<workspace>/nfed`:

```sh
git clone https://github.com/josh-fairwayrefresh/fr-main.git <workspace>/nfed
```

Before building, activate or otherwise configure the Nordic-installed toolchain environment that matches the approved NCS SDK, then verify the shell before invoking West. The durable requirement is the matching Nordic-installed toolchain environment for the approved NCS version; the toolchain bundle identifier is installation evidence, not a permanent Fairway architecture constant.

For the current validated local installation, the mapping is:

```sh
NCS_INSTALL_DIR=/opt/nordic/ncs/v3.1.1
NCS_TOOLCHAIN_DIR=/opt/nordic/ncs/toolchains/561dce9adf

export PATH="$NCS_TOOLCHAIN_DIR/bin:$NCS_TOOLCHAIN_DIR/usr/bin:$NCS_TOOLCHAIN_DIR/usr/local/bin:$NCS_TOOLCHAIN_DIR/opt/bin:$NCS_TOOLCHAIN_DIR/nrfutil/bin:$NCS_TOOLCHAIN_DIR/opt/zephyr-sdk/arm-zephyr-eabi/bin:$NCS_TOOLCHAIN_DIR/opt/zephyr-sdk/riscv64-zephyr-elf/bin:$PATH"
export ZEPHYR_TOOLCHAIN_VARIANT=zephyr
export ZEPHYR_SDK_INSTALL_DIR="$NCS_TOOLCHAIN_DIR/opt/zephyr-sdk"

command -v west
west --version
grep -Fx '3.1.1' "$NCS_INSTALL_DIR/nrf/VERSION"
test -x "$NCS_TOOLCHAIN_DIR/bin/python"
test -x "$NCS_TOOLCHAIN_DIR/opt/zephyr-sdk/arm-zephyr-eabi/bin/arm-zephyr-eabi-gcc"
```

The verification must show that `west` resolves from the Nordic-installed environment, `west --version` succeeds, the SDK is NCS v3.1.1, and the selected toolchain is the one installed for that SDK. If `west` is not on `PATH`, activate or configure the matching Nordic-installed environment and repeat these checks. Do not search for or create a Fairway-owned West workspace, run `west init`/`west update` to reconstruct one, or create a second SDK workspace.

The current local evidence above used NCS v3.1.1 with Nordic toolchain bundle `561dce9adf` and West 1.4.0. A future SDK Manager installation or update may use a different bundle identifier; that does not change the requirement to use the matching Nordic-installed toolchain environment.

With the environment verified, build directly against the installed NCS v3.1.1 SDK directory (`<ncs-install-dir>`), passing `<workspace>/nfed` as an explicit board root:

```sh
cd <ncs-install-dir>
west build \
  --build-dir <new-build-dir> \
  <workspace>/nfed/samples/fairway_power_sandbox \
  --pristine \
  --board circuitdojo_feather_nrf9151@1/nrf9151/ns \
  -- -DBOARD_ROOT=<workspace>/nfed \
     -DEXTRA_CONF_FILE=prj_a.conf \
     -DDEBUG_THREAD_INFO=On \
     -DCONFIG_DEBUG_THREAD_INFO=y \
     -Dfairway_power_sandbox_DEBUG_THREAD_INFO=On \
     -Dmcuboot_DEBUG_THREAD_INFO=Off
```

`-DBOARD_ROOT` is required so the installed NCS v3.1.1 workspace (whose own manifest does not include `nfed`) can resolve the Circuit Dojo `feather_nrf9151` board and Fairway's `sysbuild.cmake`-propagated MCUboot board root.

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

Debug-access recovery for this procedure (including the non-destructive service-entry response and the exceptional destructive erase-all) is owned by the "USB/VBUS Service-Mode Debug-Lock Prevention and Exceptional Recovery" section below; there is no separate normal recovery-diagnostic step as part of ordinary flashing.

### Manual Validation

After separate CPO authorization for runtime/manual testing, perform only the validation appropriate to the approved operating mode.

For the validated field/measurement path:

1. Disconnect USB and use PPK2 or an approved 5.0 V field supply, with the mutually exclusive power modes defined in `docs/HARDWARE_ASSEMBLY_GUIDE.md`.
2. Cold-boot the approved production image.
3. Confirm expected startup and dormant behavior described by `docs/FIRMWARE_SPECIFICATION.md` and `docs/UX_SPECIFICATION.md`.
4. Press the Fairway button once.
5. Confirm the expected request and LED sequence.
6. Confirm the device returns to its expected dormant state.

The accepted production field dormant-current result and its implementation context are owned by `docs/FIRMWARE_SPECIFICATION.md`.

### USB/VBUS Service-Mode Debug-Lock Prevention and Exceptional Recovery

The current accepted engineering strategy is prevention, not recovery. The implementation is owned by `docs/FIRMWARE_SPECIFICATION.md`: the reference nRF9151 device is within the silicon family covered by Nordic Errata 36, and Fairway firmware keeps the application CPU out of Zephyr idle/WFI for as long as USB/VBUS is present. This was directly validated to preserve ordinary probe-rs access across the tested service interval. Ordinary Fairway flashing remains the normal `probe-rs download` procedure above; no separate recovery architecture is part of normal development workflow.

A bounded investigation into a separate field→USB debug-access gap (probe-rs access unavailable after actual field-powered operation, before USB was reconnected) found that a Fairway-owned TF-M secure-service reapply mechanism does not close this gap: it was implemented, built, and hardware-tested, and failed its physical acceptance criterion even after separately confirming `UICR.APPROTECT`/`UICR.SECUREAPPROTECT` were provisioned `HwUnprotected` on the test device. That experimental implementation has been fully removed from the codebase and is not current firmware architecture.

#### Non-Destructive Service-Entry Response

Direct CPO-confirmed physical validation established a non-destructive response to this specific condition, validated on a second tested instance during the WP4 physical-validation campaign in addition to the original tested instance:

1. Connect USB using the existing safe power-isolation procedure (isolate the 6106 positive output from Feather VBAT/J4 before connecting USB; the solar/LiPo side may remain connected to the 6106).
2. Attempt the normal `probe-rs` operation (for example `probe-rs reset --chip nRF9151_xxAA`).
3. If the established AP/DRW access fault occurs (for example "Failed to read register DRW"), press the Circuit Dojo nRF9151 Feather physical RESET button once.
4. Verify recovery using a non-resetting check rather than another reset, for example:

```sh
probe-rs info --chip nRF9151_xxAA
```

A successful CoreSight/AP walk (including the AP that previously faulted) confirms recovered access without needing to issue and risk-reproducing another reset.

Do not repeatedly issue `probe-rs reset` solely to test whether access has recovered; use the non-resetting check in step 4 instead. Do not escalate automatically to destructive erase/recovery/APPROTECT-unlock actions when this non-destructive response succeeds; destructive recovery remains exceptional and separately authorized, as described below.

This response required no erase, no reflash, and no UICR modification during service entry, and used no recovery utility. This is not a recovery architecture; it is the current non-destructive first response to this specific condition. It has now been validated on two tested instances; reliability across repeated field→USB cycles is not yet established.

If a development reference Feather nevertheless remains AP-inaccessible after the above response, destructive erase-all is an exceptional, manually authorized recovery action only, using the currently established command:

```sh
~/.zephyrtools/recovery/recovery --unlock-only
```

This command is destructive and requires explicit authorization before use. After an authorized erase-all, normal Fairway flashing and provisioning is required to restore the device.

#### Serial/UART Console — Current Truth

No canonical host USB serial-console path has yet been established for the current Mac + CMSIS-DAP composite-probe arrangement. During the WP4 physical-validation campaign:

- The composite CMSIS-DAP probe enumerates multiple serial nodes (for example, distinct `/dev/cu.usbmodem...` entries) in addition to its debug/SWD function.
- The numeric `/dev/cu.usbmodem...` suffixes are assigned by the host per connection/enumeration and are ephemeral; they must NOT be treated as a canonical, stable interface identity across sessions.
- One such interface was unavailable/busy (held by another process) at the time of investigation.
- One accessible interface produced no output at 115200 8N1 across a reset.
- Another reset-reactive interface (i.e., one that produced activity correlated with a device reset) produced binary/non-console data at 115200 8N1, not readable Zephyr log text.
- Enumeration and reset-reactivity alone therefore do NOT prove a given host interface is the Feather's Zephyr UART console; none of the interfaces tried were confirmed as a working console path.

Canonical operational rule: do not hunt-and-peck across arbitrary `/dev/cu.*` ports, arbitrary baud rates, or parity/framing combinations to find a working console, and do not attempt to work around this by changing `.vscode` settings or shell configuration. If direct UART logs are genuinely required for a task, first verify the physical UART bridge/wiring between the debug probe and the Feather console UART with the CPO. Only after a readable console is physically established should this Guide be updated with the exact Feather UART pins, bridge wiring, probe interface identity, baud, data bits, parity, stop bits, flow control, a deterministic macOS interface-selection rule, and the exact known-good console command. An unverified current USB serial path must not be documented here as canonical.

#### Functional Validation Evidence Rule

UART/serial logs are useful diagnostic evidence but are NOT automatically a required gate for Fairway end-to-end functional validation when the required behavior can instead be established directly through CPO-observed physical device behavior, authenticated Cloud Run traffic, Firestore state/history, operator-dashboard behavior, and timing evidence. Do not block a functional validation campaign solely because UART logging is unavailable when those other evidence sources can establish the acceptance criterion. UART becomes necessary when the specific question requires internal device state that cannot be established externally. This does not permit unsupported inference: each acceptance criterion must still be supported by direct evidence, whether that evidence is UART-based or externally observed.

---

## Backend Deployment

Current Backend Deployment Facts:

- Runtime libraries indicate Node.js function-style service using @google-cloud/functions-framework.
- Documented deployed service name: fairway-button-receiver
- Documented deployed URL: https://fairway-button-receiver-936892386735.us-central1.run.app
- Button-event ingestion currently enforces `X-Fairway-Device-Key` authentication, verified per-device against each claimed device's own stored SHA-256 verifier (see `docs/DEVICE_PROVISIONING_GUIDE.md`, "Credential Architecture"); this is not a single fleet-wide shared key. The obsolete fleet-wide `FAIRWAY_DEVICE_KEY` Cloud Run environment variable has been removed following WP3 per-device credential validation.
- Confirm and complete status endpoints currently do not enforce equivalent endpoint authentication in backend implementation.
- Authentication/authorization hardening for operator control endpoints remains unresolved and is not an approved production security model.
- Backend request parsing currently accepts compatibility aliases/defaults (`device_id` or `device`, `event_type` or `event`, with defaults when absent) beyond the canonical payload contract; formal acceptance or removal of this behavior remains unresolved.
- Supported request routes:
  - POST /
  - POST /api/v1/button-events
  - POST /api/v1/requests/{requestId}/confirm
  - POST /api/v1/requests/{requestId}/complete

The current working-tree backend source includes a fail-closed Device-state
authorization correction made after revision
`fairway-button-receiver-00009-c5j` was validated. Redeployment and bounded
backend regression validation are required before the WP3 source can be
committed; this guide does not claim that correction is already live.

Operational lesson (established during WP3 per-device credential deployment): read-only Cloud Run inspection commands (for example `gcloud run services describe`) return full container environment variable values, including secrets, unless the output is field-restricted. Always use a field-restricted `--format=value(...)` (or equivalent) query that excludes environment variable values when inspecting a service that may hold secret-bearing configuration; only request variable names, never values, unless a value is explicitly required and authorized.

Deployment process status:

No repository-controlled backend deployment command or CI pipeline is currently documented.
The canonical backend deployment process is not yet published in repository-controlled artifacts.

### Backend Deployment Validation

Backend deployment validation is scoped to the backend being changed. It
includes service health, expected authentication/authorization responses, and
request persistence behavior where applicable. WP3 validated per-device
authentication and creation of exactly one correctly attributed FRB-0001
request through a physical button press. It did not independently visually
validate the operator webapp or its confirm/complete flow.

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

- `customers/{CUST-XXXX}` (Customer records)
- `customers/{CUST-XXXX}/courses/{COURSE-XXXX}` (Customer-owned Course records)
- `devices/{FRB-XXXX}` (Device registry, metadata, state-derived communication permission, and credential verifier)
- `counters/CUST`, `counters/COURSE`, and `counters/FRB` (central ID allocation)
- `requests/{requestId}` (request creation, lookup, and status updates)

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

Full-system or pilot operational validation is broader than backend deployment
validation. When that scope is authorized, the sequence is:

1. Firmware boots and reaches network-ready state.
2. Device sends request to Cloud Run endpoint.
3. Backend stores request document in Firestore.
4. Operator dashboard receives live request update.
5. Confirm action succeeds and updates status.
6. Complete action succeeds and updates status/removes active item.

A full-system or pilot operational validation is complete only after all six
steps succeed. A bounded backend deployment can be validated against its own
approved backend acceptance criteria without claiming unperformed operator UI
validation.

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
