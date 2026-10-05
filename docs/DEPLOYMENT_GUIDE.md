# Deployment Guide

## Purpose

This document is the canonical deployment and operational guide for Fairway Refresh.

It owns deployment configuration, environment configuration, hosting configuration, and deployment workflow information.

It does not own hardware implementation, firmware implementation details, UX behavior definitions, or feature planning.

## Repository Candidate Versus Production (2026-10-05)

The uncommitted `pilot/minimal-runtime` candidate is based on HEAD `6d90177c3f6e1e374c236d65fa773cc7c06af6c4` (no upstream configured). It has not been deployed to Cloud Run/Hosting or flashed to FRB-0002. Production revision, asset, Health, and physical-acceptance facts below record earlier validated checkpoints, not the candidate's deployed state.

Candidate firmware runs only the bounded golfer lifecycle and its active-window correlated COMPLETE poll/ACK, with no unrelated application networking. Health scheduling/acquisition, time/NTP, prewarm, bootstrap, and telemetry helper are retired; modem/PSM/TLS/on-demand DNS/VBUS/BUCK2 remain. The backend requires `transaction_id` and atomically reuses the request for the same Device plus ID; different IDs create fresh demand regardless of older open requests. Firmware success requires a complete bounded 2xx JSON response containing valid `request_id`. Detailed contracts belong to `docs/FIRMWARE_SPECIFICATION.md` and `docs/DEVICE_PROVISIONING_GUIDE.md`.

Candidate Admin removes Health columns/detail/history/schedule/on-demand placeholder and backend Health ingestion/configuration/persistence logic/routes. Historical stored observations and neutral identity provenance remain. Active COMPLETE actions and device poll/ACK remain available during service suspension; Health is no longer accepted because its event is retired.

---

## Deployment Architecture

The documented deployment architecture consists of:

- Firmware running on nRF9151 hardware that sends HTTPS button events to a Cloud Run endpoint.
- A Cloud Run backend service that validates requests and writes request records to Firestore.
- A Firebase-hosted operator web application.
- Firestore for request state and operator workflow state transitions.
- Operator actions in the web application that call Cloud Run status endpoints.
- A Firestore document-created Eventarc trigger that invokes a dedicated Web
  Push sender for authorized course subscriptions.

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
| Primary Production Application Origin | CPO Physical Acceptance | https://app.fairwayrefresh.com |
| Firebase Hosting URL | Current Operational Evidence | https://savvy-kit-496703-r5.web.app |
| Firestore Database | Current Operational Evidence | `(default)`, Native mode, `nam5` |

WP3 deployment validation on 2026-09-18 established that Cloud Run revision
`fairway-button-receiver-00009-c5j` was healthy and receiving 100% of service
traffic. The revision identifies that validation event only; deployment and
operational procedures target the durable service name, not a permanent
revision ID.

### WP5-S1 Isolated Sandbox Environment (Historical Rollout Evidence)

WP5-S1 established a dedicated non-production environment on 2026-09-30. It
does not reuse production Auth users, Firestore data, counters, credentials,
claims, sessions, or runtime identities.

| Item | Established Sandbox Value |
|------|---------------------------|
| Google Cloud / Firebase Project | `fairway-refresh-sandbox-260930` |
| Project Number | `269424081919` |
| Region | `us-central1` |
| Firestore Database | `(default)`, Native mode |
| Cloud Run Service | `fairway-button-receiver-sandbox` |
| Cloud Run Revision | `fairway-button-receiver-sandbox-00002-vh7` (100% traffic at validation) |
| Cloud Run API URL | `https://fairway-button-receiver-sandbox-269424081919.us-central1.run.app` |
| Runtime Identity | `fairway-backend-sandbox@fairway-refresh-sandbox-260930.iam.gserviceaccount.com` |
| Firebase Hosting URL | `https://fairway-refresh-sandbox-260930.web.app` |

The backend requires `FAIRWAY_ENV=sandbox`, matching
`FAIRWAY_GCP_PROJECT`/`GOOGLE_CLOUD_PROJECT` values, and a project ID beginning
with `fairway-refresh-sandbox-` before initializing Firestore. Frontend build
and runtime guards require the same sandbox prefix and the separately named
sandbox Cloud Run service. Missing, mismatched, or production-targeted values
fail before deployment/runtime traffic. The local `.env.sandbox` deployment
configuration is gitignored; `.env.sandbox.example` is the tracked template.

The sandbox has a distinct Firebase web application and email/password Auth
configuration. The sandbox Auth record for `admin@fairwayrefresh.com` has the
`admin: true` custom claim; this is a sandbox-local UID and does not establish
or modify a production claim. Firestore rules and indexes were deployed from
the repository. The runtime identity has `roles/datastore.user`; the sandbox
build identity has `roles/run.builder`. Organization policy rejected an
`allUsers` IAM binding, so the sandbox Cloud Run service uses the supported
no-invoker-IAM-check service setting while application authentication remains
enforced on device, operator, and Admin routes.

Validation established: unauthenticated Admin API `401`, authenticated
non-admin `403`, admin `200`; direct unauthenticated fleet-document access
`403`; unknown Device ingestion `404`; concurrent credential recovery and
first-Customer assignment each produced exactly one `200` and one `409`; Health
history returned the newest 100 of 105 observations in descending order; the
stored Device credential contained SHA-256 verifier metadata only; and the
hosted bundle contained the sandbox API identity and no production project,
number, Hosting, or Cloud Run identifiers. Temporary validation users and data
were removed.

The retained dataset is synthetic only: one Customer, one Course, Device
`FRB-0002`, one Health observation, one request, and sandbox-local counters.
The Device is explicitly marked `WP5-S1 SYNTHETIC SANDBOX DATA - NOT A PHYSICAL
DEVICE`; its plaintext generated credential was discarded. Numerical FRB ID
overlap has no relationship to a physical or production Device.

The sandbox remains available for synthetic workflow testing. Its Hosting build
now calls only the isolated sandbox backend; it no longer reads production data.

### WP5 Production Fleet Administration (Historical Rollout Evidence)

This section preserves the deployed WP5 record, including now-retired Health surfaces and system-identity promotion. Those facts are not candidate route/UI requirements or evidence that FRB-0001 is currently physically operating.

The CPO accepted the live production-data information architecture and
presentation during the WP5 read-only review. On 2026-09-30, that accepted UI
was advanced to a dedicated production Admin API supporting the approved WP5
read and write workflows without exposing Firestore or service credentials to
the browser.

| Item | Production Value |
|------|------------------|
| Primary Application Origin | `https://app.fairwayrefresh.com` |
| Firebase Hosting | `https://savvy-kit-496703-r5.web.app` |
| Cloud Run Admin Service | `fairway-admin` |
| Validated Admin Revision | `fairway-admin-00007-znz` (100% traffic) |
| Admin API URL | `https://fairway-admin-936892386735.us-central1.run.app` |
| Runtime Identity | `fairway-admin-prod@savvy-kit-496703-r5.iam.gserviceaccount.com` |
| Runtime IAM | `roles/datastore.user` only |
| Allowed Browser Origins | `https://savvy-kit-496703-r5.web.app`, `https://app.fairwayrefresh.com` |

The production services use the canonical fleet modules in
`fairway_backend/cloudrun_receiver/lib/fleet/` through dedicated Admin and
receiver targets. Runtime initialization requires `FAIRWAY_ENV=production`, an
explicit supported `FAIRWAY_SERVICE_MODE`, and both project variables equal to
`savvy-kit-496703-r5`. Admin mode additionally requires the exact production
origin allowlist (Firebase Hosting and `app.fairwayrefresh.com`); receiver mode
rejects any Admin browser origin. The Admin target
exposes only `/api/v1/admin/*`, and the receiver returns `404` for that surface.
Every Admin request requires a production Firebase ID token with the
server-verified `admin: true` claim. Production `admin@fairwayrefresh.com`
retains its password provider and has that claim. Responses use `no-store`,
exact-origin CORS, allowlisted fleet DTOs, and credential-verifier redaction.

Web application entry is role-specific while sharing the same persistent
Firebase Authentication session. `/admin` is the first-class Admin entry: it
checks the signed-in user's `admin: true` claim and renders the Admin UI without
calling operator bootstrap. `/` and `/requests/{requestId}` are Cart Operator
entries: they call `/api/v1/operator/bootstrap` and require an enabled
`operator_course_assignments/{uid}` record. Entry path selects the initial mode;
neither role requires the other role's authorization. An authenticated Admin
without an operator assignment can therefore use `/admin`, while an operator
without the Admin claim receives an access-denied response at `/admin`. Login
and redirect flows retain the current path and query so Admin entry and operator
notification deep links return to their original destinations. Backend claim,
assignment, and Firestore Rules enforcement remain the security boundaries.

Admin revision `fairway-admin-00007-znz` corrected the custom-domain CORS
configuration after mobile Admin requests from `app.fairwayrefresh.com` were
rejected while the Firebase Hosting origin succeeded. Production now reflects
only the exact matched canonical origin. Preflight returns `204` for both
canonical origins and `403` for an arbitrary origin; unauthenticated requests
from either canonical origin retain the expected `401` boundary. The receiver
was not deployed or changed by this correction. The CPO refreshed the existing
authenticated mobile Admin session on `app.fairwayrefresh.com` and confirmed
that the production fleet loaded without the prior `Load failed` state.

The production UI supports Customer/Course create and edit, Course timezone and
Health schedule, permanent Device provisioning and bounded one-time credential
recovery, atomic Customer/Course/location deployment assignment, lifecycle
state, SIM/comments, service and commissioning records,
read-only hardware/firmware identity, read-only current Device Health/history,
and Device-to-SIM export. Hardware revision and firmware generation start unknown
at provisioning; authenticated Device Health populates both atomically
from build-owned firmware values. Installed legacy images use controlled verified
provenance until a self-reporting artifact is flashed. Neither field can be
changed through an administrative metadata route.
Request Health Check and WP6 Alerts remain visible and non-operational.

The WP5 system-metadata closeout deployed Admin revision
`fairway-admin-00004-mz5`, receiver revision
`fairway-button-receiver-00016-djx`, and Hosting asset
`assets/index-0JzD1L0J.js`. The receiver now requires explicit fail-closed
production mode and project configuration and accepts the build-owned identity
pair on authenticated Device Health. The Admin DTO exposes only redacted
provenance source/time. FRB-0001 retains `verified_provenance` for its installed
legacy image. FRB-0002 was flashed with the exact artifact recorded in the
Firmware Generation Registry; authenticated Device Health at
`2026-10-01T03:57:38.827Z` replaced its bridge atomically with `device_health`
provenance and the build-owned `Monarch Bay Pilot v3.2` / `Prototype 3.2 for
Pilot — Working Button and Lights` identity pair. The CPO confirmed normal boot
and the resulting available identity/provenance in production Admin. The flash
required separately authorized canonical erase-all after the non-destructive
physical-RESET service-entry response failed to restore Memory AP access.
The authorized two-record provenance reconciliation and subsequent runtime promotion left
all unrelated production Customer, Course, Device, and counter facts unchanged:
their normalized SHA-256 fingerprint was
`c330b8df195c2de5c6aaacf6d4fe21fd6ba39e6534e1cf8addaa682933333ade`
both before and after the transaction. That checkpoint passed 91/91 backend
tests, exact-origin CORS, route isolation, receiver unknown-device rejection,
and byte-identical Hosting artifact verification.

The final WP5 lifecycle/assignment correction deployed Admin revision
`fairway-admin-00006-n87` at 100% traffic and Hosting asset
`assets/index-Bn8RWJ55.js` (SHA-256
`d72c456eb2ab190fe0fdeaaa30fa92c6def1ce244f05b5ce890090bb73987925`). The
backend now atomically clears Customer, Course, and location when a Device enters
`in_inventory`, requires a valid Customer, a Course belonging to that Customer,
and a valid location before accepting `deployed`, and prevents a deployed
assignment from being cleared independently. New provisioning creates a
completely unassigned inventory Device. That deployment passed 91/91 backend tests; the production
bundle is byte-identical to the validated local artifact, and Admin
authorization/CORS checks return the expected `401`, `403`, and `204`.
FRB-0002 was reconciled through the corrected lifecycle primitive to
`state = "in_inventory"` with null `customer_id`, `customer_name`, `course_id`,
`course_name`, and `location`. Its SIM, credential verifier, system identity,
Health, commissioning metadata, and unrelated fleet data were preserved. The
normalized seven-record preservation fingerprint, excluding those authorized
assignment fields and their write timestamp, remained
`833e0c9765cac04202a1ef7f939444c43dddf560ee3e4483928e4677d190649b` before and
after correction. No errors were logged for the Admin revision, and the receiver
remained on revision `fairway-button-receiver-00016-djx`.

The original WP5 rollout validation established: 88/88 backend tests; exact production and sandbox
frontend configuration validation/builds; production Hosting artifact equality;
unauthenticated `401`; authenticated non-admin `403`; wrong-origin `403`;
approved preflight `204`; non-Admin route `404`; authenticated fleet, FRB-0002
Health history, and Device-to-SIM export `200`; authenticated malformed Customer
creation and invalid lifecycle state `400` with no write; two authoritative
production Devices and two export rows; no credential digest in the fleet
response; and zero retained temporary validation users. The dedicated Admin
identity has only `roles/datastore.user`; the receiver revision at that original
validation checkpoint was `fairway-button-receiver-00013-zhj`.

Production validation created no Customer, Course, Device, credential, counter,
service, commissioning, metadata, assignment, state, or Health mutation. The
fleet hash changed from 105 to 109 documents only because four authenticated
real Device Health observations arrived while validation was in progress;
allocation counters remained exactly `CUST=2`, `COURSE=2`, and `FRB=3`. No
legitimate deployed-device fact was altered for testing.

The temporary sandbox production-read broker, its Cloud Run service, production
`roles/datastore.viewer` binding, sandbox runtime identity, frontend review
configuration/routes, and source package were removed after production rollout.

The CPO accepted the production-backed Admin experience and the final ownership
boundary between administrative data and system/device truth. Acceptance does
not require a fictitious or audit-distorting production write. Integrated-browser
visual/network automation was unavailable during the original rollout; the CPO's
direct review is the visual acceptance evidence on record. WP5 is complete.

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
| Per-device ID and credential | Local provisioning material | Required | `FAIRWAY_DEVICE_ID` and the per-device `FAIRWAY_DEVICE_KEY` macro are supplied by the local gitignored provisioning header; values are intentionally omitted. |
| Hardware/firmware system identity | Historical build/flash or device observation | Retained provenance only | The former build-owned Health reporting path is retired in the candidate. Existing identity/provenance remains read-only; it does not establish installation of this candidate. |
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

Routine development, diagnostic, and validation builds shall use a disposable/reusable `<new-build-dir>` rather than creating a persistent, uniquely named top-level build directory for each investigation; reuse or `--pristine` the disposable location as appropriate between materially different builds. A generated build directory is not an evidence-retention mechanism: if a build produces an artifact that must be retained as canonical validation evidence, preserve that artifact and its provenance/hash in the existing artifact/provenance record (see the Firmware Generation Registry in `docs/FIRMWARE_SPECIFICATION.md`) rather than retaining the generated build tree itself.

The build must exit successfully and produce `<new-build-dir>/merged.hex`.
Record the artifact path, byte size, SHA-256, board target, configuration, and source commit in the build provenance record before flashing.

Before flashing, verify the selected artifact against that provenance record. Do not substitute an artifact from another build directory.

The application `samples/fairway_power_sandbox/sysbuild.cmake` propagates the tracked Fairway board root to the MCUboot child image. This is required for the custom `circuitdojo_feather_nrf9151` board to resolve consistently during the sysbuild build.

### Candidate Validation Evidence and Limits

Working-state inspection on 2026-10-05 found `build-minimal-runtime/merged.hex` and sysbuild metadata specifying NCS v3.1.1, toolchain bundle `561dce9adf`, West 1.4.0, `circuitdojo_feather_nrf9151@1/nrf9151/ns`, explicit `BOARD_ROOT`, and `prj_a.conf`. Generated artifact presence/metadata is not source-to-artifact equivalence or physical acceptance; no candidate artifact is promoted to the validated firmware registry here.

Current backend tests include required/malformed transaction ID rejection, concurrent retry idempotency, cross-device ID isolation, fresh different-ID requests, and retired Health rejection. `samples/fairway_power_sandbox/tests/complete_poll` includes COMPLETE/demand-window lifecycle and fragmented, truncated, bodyless, and malformed-length HTTP cases. Inspection establishes that these cases exist, not a new passing count. Prior test/build counts in milestone records retain their historical scope.

The Zephyr `native_sim` target requires Linux; its executable validation is not a native macOS procedure. Use an authorized Linux environment for that target, or the existing host-compatible checks for their narrower scope. This limitation does not prevent the canonical nRF9151 cross-build on macOS and does not imply native_sim tests passed here.

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

Retained backend architecture and earlier deployment evidence:

- Runtime libraries indicate Node.js function-style service using @google-cloud/functions-framework.
- Documented deployed service name: fairway-button-receiver
- Documented deployed URL: https://fairway-button-receiver-936892386735.us-central1.run.app
- Button-event ingestion currently enforces `X-Fairway-Device-Key` authentication, verified per-device against each claimed device's own stored SHA-256 verifier (see `docs/DEVICE_PROVISIONING_GUIDE.md`, "Credential Architecture"); this is not a single fleet-wide shared key. The obsolete fleet-wide `FAIRWAY_DEVICE_KEY` Cloud Run environment variable has been removed following WP3 per-device credential validation.
- The deployed backend requires a Firebase bearer ID token on operator mutations, verifies it with Firebase Admin, and records the verified UID as `operator_id`. The active Cart Operator workflow has no CONFIRM interaction; COMPLETE, Cancel, Suspend/Resume, and dashboard-summary calls are restricted by enabled Course assignment. The WP5 admin API continues to require the out-of-band-assigned Firebase custom claim `admin: true` on every `/api/v1/admin/*` route and returns HTTP 403 before fleet reads or writes for authenticated non-admins.
- Candidate golfer ingestion requires a valid `transaction_id` in addition to device identity/event and per-device authentication. There is no supported Health event or effective Health configuration response. See the canonical protocol and idempotency contract in `docs/DEVICE_PROVISIONING_GUIDE.md`.
- Supported request routes:
  - POST /
  - POST /api/v1/button-events
  - POST /api/v1/requests/{requestId}/confirm
  - POST /api/v1/requests/{requestId}/complete
  - POST /api/v1/device-commands/poll
  - POST /api/v1/device-commands/{commandId}/ack
  - GET /api/v1/operator/bootstrap
  - POST /api/v1/operator/push-subscriptions
  - POST /api/v1/requests/{requestId}/cancel
  - GET /api/v1/operator/dashboard
  - POST /api/v1/operator/service/suspend
  - POST /api/v1/operator/service/resume

The Option C production rollout on 2026-10-01 deployed receiver revision
`fairway-button-receiver-00019-c8h` and Admin revision
`fairway-admin-00008-sjt`, each ready with 100% traffic and its prior runtime
identity preserved. Before activation, Tony Lema Course was migrated with an
explicit Course-local `service_schedule` covering Sunday through Saturday,
10:00–19:00 in `America/Los_Angeles`. The migration used a one-field update
mask; the normalized non-schedule Course fingerprint remained
`078fe6c87dc2e8532fd169d5edc184a20304d600130d57775a2c04647e6d7d19`.

The validated backend production deployment commands are:

```sh
gcloud run deploy fairway-button-receiver --project=savvy-kit-496703-r5 \
  --region=us-central1 --source=fairway_backend/cloudrun_receiver \
  --function=fairwayButtonReceiver --quiet
gcloud run deploy fairway-admin --project=savvy-kit-496703-r5 \
  --region=us-central1 --source=fairway_backend/cloudrun_receiver \
  --function=fairwayAdmin --quiet
```

### Cart Operator Web Push

The production Cart Operator notification path uses the standards-based Push
API, Notifications API, a root service worker, and VAPID. It does not use FCM,
a native application, Apple ID addressing, or an Apple account as a push
destination.

- `operator_course_assignments/{uid}` is the server-owned operator entitlement.
  Each enabled record contains canonical `courses` for backend authorization
  and `course_ids` for Firestore Rules query authorization.
- `course_push_subscriptions/{courseId}/subscriptions/{subscriptionId}` stores
  endpoint and encryption material server-side. Browser bootstrap responses are
  redacted and never return stored subscription secrets.
- `notification_dispatches/{requestId}/subscriptions/{subscriptionId}` records
  deterministic delivery state. Request-created trigger retries cannot produce
  a second dispatch for an already accepted request/subscription pair.
- The `fairway-request-notifier` generation-2 function runs in `us-central1` and
  is triggered from Firestore events in `nam5`. The trigger identity is
  `fairway-notifier-trigger@savvy-kit-496703-r5.iam.gserviceaccount.com`; it has
  Eventarc receiver permission and service-level invoke permission only on the
  notifier. The sender identity is
  `fairway-notifier-prod@savvy-kit-496703-r5.iam.gserviceaccount.com`; it has
  Firestore access and Secret Manager access only to the private VAPID key.
- The VAPID private key is stored in Secret Manager. The public key and key
  version are supplied through operator bootstrap and may be present in public
  client configuration.
- Firestore document events are delivered as `application/protobuf`; the sender
  obtains the request document path from the CloudEvent `subject` envelope.

Retained candidate Admin routes (earlier WP5 deployment evidence does not establish deployment of the Health-removal candidate):

- `GET /api/v1/admin/fleet`
- `GET /api/v1/admin/export/device-sim`
- `POST|PATCH /api/v1/admin/customers...` for Customer/Course creation and configuration
- `POST /api/v1/admin/devices` for permanent-ID allocation and one-time credential issuance
- `POST /api/v1/admin/devices/{deviceId}/credential-recovery` only when a partial provisioning event left that exact Device without a credential
- `PATCH /api/v1/admin/devices/{deviceId}/{assignment|state|metadata}`; metadata permits only SIM association and comments after provisioning
- `POST /api/v1/admin/devices/{deviceId}/{service|commission}`

The Admin UI calls these backend routes with the current Firebase ID token. It does not read or write fleet collections directly, and the repository Firestore rules continue to deny browser access to those collections. Admin responses redact credential verifier digests; new-device provisioning returns the plaintext credential only in the one successful creation response.

The command routes retain per-device `X-Fairway-Device-Key` authentication. COMPLETE transactionally creates one deterministic per-device command correlated to the originating request; poll returns only the exact pending, unexpired command, and ACK rechecks backend-owned expiry with idempotent replay. The candidate no longer uses the old demand-window suppression query/index. Historically, Stage B2 deployed and validated the backend, dashboard, and then-required index; FRB-0002 acknowledged an exact correlated COMPLETE and ended its local window early. That evidence is not candidate deployment acceptance.

Operational lesson (established during WP3 per-device credential deployment): read-only Cloud Run inspection commands (for example `gcloud run services describe`) return full container environment variable values, including secrets, unless the output is field-restricted. Always use a field-restricted `--format=value(...)` (or equivalent) query that excludes environment variable values when inspecting a service that may hold secret-bearing configuration; only request variable names, never values, unless a value is explicitly required and authorized.

Deployment process status:

The source-deployment commands above are production-validated. No automated
repository CI deployment pipeline is currently established.

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
- Production build command: npm run build:production
- Sandbox build command: npm run build:sandbox (package.json)
- Sandbox local dev command: npm run dev:sandbox (package.json)
- Firebase Hosting config present in firebase.json with SPA rewrite to /index.html
- Primary production application origin: `https://app.fairwayrefresh.com`
- Firebase Hosting origin: `https://savvy-kit-496703-r5.web.app`
- First-class entry routes:
  - `https://app.fairwayrefresh.com/admin` for claim-authorized production administration
  - `https://app.fairwayrefresh.com/` and `/requests/{requestId}` for Course-assigned Cart Operators
- Firebase Authentication sessions are shared across routes, but each route
  invokes only its own authorization path; Admin entry never depends on
  operator bootstrap.
- Validated WP5-S1 sandbox deployment command:
  - npx firebase-tools deploy --only hosting --project fairway-refresh-sandbox-260930 --non-interactive
- Validated production deployment command:
  - npx firebase-tools deploy --only hosting --project savvy-kit-496703-r5

Deployment process status:

Repository-controlled artifacts define web build behavior and the production
Hosting deployment command above was validated on 2026-10-01.

Deployment Verification:

- The full-surface logged-out entry cleanup deployed Hosting asset
  `assets/index-DXzzUJ_N.js` (SHA-256
  `e7b45ecd4b8b495a63951fafa5c86e4dbb21ee94f5c12d95e294c304d17e47ea`).
  The custom-domain and Firebase Hosting copies were byte-identical to the
  validated local production build. `/`, `/admin`, a request deep link, the
  manifest, and the service worker returned `200`. Isolated logged-out
  production inspection confirmed no simulated phone shell or horizontal
  overflow at 1440x900, 1024x768, and 390x844; the primary email sign-in
  reached Firebase Authentication, and Admin Login reached `/admin`.
- The redundant operator queue-header cleanup deployed Hosting asset
  `assets/index-ClNsEp5w.js` (SHA-256
  `fb45582f004521105279141e5347b9c0671dc7d229fe9f4f1d8b61e3e8834e7f`).
  The custom-domain and Firebase Hosting copies were byte-identical to the
  validated local production build. `/`, `/admin`, and a request deep link
  returned `200`, and authenticated production inspection confirmed that the
  queue count remains while the duplicate `NEXT REQUEST` and top-level hole
  fields are absent.
- The CPO-accepted Option C rollout deployed Hosting asset
  `assets/index-B-HgnZrQ.js` (SHA-256
  `efcc091e392d4c27db704f17bdf61aae4049a70de70140b258456b4e9d2f7f37`).
  The custom domain and Firebase Hosting copies were byte-identical to the
  validated local production build. `/`, `/admin`, request deep links, the
  manifest, and root service worker returned `200` through
  `app.fairwayrefresh.com`. Authenticated production acceptance established the
  Option C queue, Complete advancing transactions exactly once, guarded Cancel,
  Course schedule display/edit controls, and independent Operator/Admin paths.
  With Tony Lema Course authoritatively suspended, one FRB-0002 press produced
  orange followed by red blink-blink-solid; receiver revision `00019-c8h`
  returned two bounded `503` attempts with explicit service-unavailable logs,
  and no request document was created. Resume then cleared the Course suspension
  and restored Service Active.

- Production Hosting, manifest, service worker, and 180/192/512 icons were verified
  byte-for-byte against the validated production build on 2026-10-01.
- The independent Admin/Operator entry release deployed production asset
  `assets/index-B7nqMQ1i.js` (SHA-256
  `e1ac15b62ccacbea179dd33eb08de943ba90d87e53ebe8f3db3981c10c74716d`).
  The live index and JavaScript were byte-identical to the validated local
  build. Direct `/admin` and `/requests/{requestId}?course=...` requests returned
  the SPA, and browser inspection confirmed role-specific logged-out entry,
  preserved operator deep-link URLs, and no horizontal overflow at a 390 by 844
  viewport. The deterministic frontend test suite passed 7/7 and the
  unchanged backend authorization/receiver suite passed 101/101.
- The initially deployed entry release omitted the imported `X` icon while
  retaining deferred references in Device and Course overlays. Opening either
  overlay therefore raised `ReferenceError: X is not defined` and left only its
  dark backdrop visible. The corrected asset above restores that dependency;
  production Chrome acceptance confirmed that Device and Course overlays open
  normally after the browser loads the corrected bundle.
- Real-account production acceptance confirmed the independent role paths.
  `admin@fairwayrefresh.com` loaded the live fleet from `/admin` with Admin API
  requests and zero operator-bootstrap requests; the same persistent session
  received `Operator course access required` at `/` and returned to `/admin`
  without reauthentication. `josh@fairwayrefresh.com` retained the complete
  `/requests/{requestId}?course=...` URL through sign-in, completed operator
  bootstrap, and rendered the Monarch Bay Cart Operator queue with zero Admin
  API requests; `/admin` then returned `Administrator access is required` with
  zero Admin API and zero operator-bootstrap requests.
- The iPhone Home Screen application was physically validated for authenticated
  queue access, push subscription registration, notification display, and
  notification-click deep linking.

---

## Firestore Configuration

Repository-Derived Firestore Configuration:

- Rules file path: fairway_webapp/cart_operator_dashboard/firestore.rules
- Current rule behavior in repository:
  - requests are readable only when the authenticated UID has an enabled
    `operator_course_assignments` record containing the request's `course_id`
  - Browser writes are denied by rules
  - Catch-all deny for other document paths

Repository-Derived collection usage in repository code:

- `customers/{CUST-XXXX}` (Customer records)
- `customers/{CUST-XXXX}/courses/{COURSE-XXXX}` (Customer-owned Course records)
- `devices/{FRB-XXXX}` (Device registry, metadata, state-derived communication permission, and credential verifier)
- `counters/CUST`, `counters/COURSE`, and `counters/FRB` (central ID allocation)
- `requests/{requestId}` (request creation, lookup, and status updates)
- `operator_course_assignments/{uid}` (server-owned operator/course entitlement)
- `course_push_subscriptions/{courseId}/subscriptions/{subscriptionId}` (private push subscription material)
- `notification_dispatches/{requestId}/subscriptions/{subscriptionId}` (effective-once dispatch state)

Collection schema is owned by the backend implementation.

Indexes:

- Candidate `fairway_webapp/cart_operator_dashboard/firestore.indexes.json` retains the `requests` Course query (`course_id`, `received_at` descending). The old suppression index (`device_id`, `status`, `demand_window_expires_at`) is removed from the repository candidate; no production index deployment/deletion is claimed. Atomic device-plus-transaction-ID idempotency does not require it.

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

1. Firmware boots with local button readiness and the expected idle policy; network startup does not gate local readiness.
2. Device sends an authenticated golfer request with one transaction ID across retries.
3. Backend stores exactly one request for that Device/ID and firmware receives the complete valid 2xx JSON `request_id` before success.
4. Operator dashboard receives live request update.
5. Complete updates status/removes the active item; correlated marker poll/ACK clears its matching window, with local expiry fallback when unavailable.
6. In-window repeats stay local; a fresh transaction ID can create another request even while an earlier request remains open. Validate service rejection and continued actionability of existing COMPLETE during suspension.

A full-system or pilot operational validation is complete only after all six
steps succeed. A bounded backend deployment can be validated against its own
approved backend acceptance criteria without claiming unperformed operator UI
validation.

The first production Cart Operator Web Push workflow was physically accepted on
2026-10-01 with FRB-0002 at Hole 2. One authoritative request
`clBCgv0UGm9jsBL1DIy6` was persisted at `07:32:36.169Z`; its one active iPhone
subscription dispatch was accepted on attempt 1 at `07:32:36.692Z`, 0.523
seconds later. The CPO observed exactly one visible notification, and tapping it
opened/focused the authenticated application at the actionable Hole 2 request.
A second physical press during the same demand window produced no additional
request or visible notification. The original request remained actionable.

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
