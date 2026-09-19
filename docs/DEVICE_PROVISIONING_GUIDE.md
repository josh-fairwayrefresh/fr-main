# Device Provisioning Guide

## Document Status

- Status: Draft
- Version: 0.2
- Last Updated: 2026-09-18

## Purpose

This document is the canonical process for provisioning a new Fairway Refresh field device before deployment.

This document defines the canonical provisioning process. Device-specific
records, provisioning logs, and historical provisioning events are operational
records rather than canonical engineering configuration. The bounded FRB-0001
migration evidence below is retained as the validated reference-device
bootstrap record without exposing its secret or complete operational record.

## Fleet Hierarchy

Fairway Refresh fleet data is organized as:

Customer -> Course -> Device

- **Customer** — the Fairway Refresh contractual customer. One Customer may own one or many Courses. Canonical IDs use the `CUST-0001` style; the readable name is a separate `customer_name` field. Stored at `customers/{customerId}`; the Firestore document ID is the canonical identity and is not duplicated as a `customer_id` field inside the document.
- **Course** — belongs to exactly one Customer and is stored as a Firestore subcollection of that Customer (`customers/{customerId}/courses/{courseId}`); the parent path itself establishes ownership, so no `customer_id` field is duplicated inside the Course document. Canonical IDs use the `COURSE-0001` style (globally unique across all Customers, centrally allocated, never restarted per Customer); the readable name is a separate `course_name` field. Each Course requires a timezone and a Device Health reporting schedule (default 09:00 and 17:00 course-local time); this timezone and schedule are currently stored/configured on the Course record. Autonomous firmware Device Health scheduling that uses these values is an approved WP4 sprint target and is not yet implemented; see `docs/FIRMWARE_SPECIFICATION.md` ("Device Health Transport and Scheduling (Approved Target, Not Yet Implemented)") for the detailed requirement. A Device's effective timezone and Device Health reporting schedule are inherited from its currently assigned Course, are not independently stored/authoritative on the Device, and follow automatically whenever the Device is reassigned to a different Course.
- **Device** — a permanent physical marker identified by its `FRB-0001`-style ID (see Device Identity below), stored at the top level (`devices/{deviceId}`). A Device is assigned to a Customer, a Course belonging to that Customer, and a marker location; that assignment is mutable, but the Device ID itself never changes. The Device record stores both `customer_id`/`course_id` (authoritative) and `customer_name`/`course_name` (synchronized display copies sourced from the Customer/Course records, never independently editable) for administrator readability. Per current product policy, once a Device has a `customer_id` it is not reassigned to a different Customer; only Course (within the same Customer) and location may change through normal reassignment.

This hierarchy, the canonical ID formats, and the backend allocation mechanism are implemented in `fairway_backend/cloudrun_receiver/lib/fleet/` (`schema.js`, `ids.js`, `customers.js`, `courses.js`, `devices.js`). These are internal backend primitives only; no admin UI or exposed admin API is implemented yet (future work, see `docs/feature_backlog.md`).

## Provisioning Workflow

Assembled
-> Hardware Inspection
-> Firmware Installed
-> Device Identity Assigned
-> Authentication Material Installed
-> SIM Assigned
-> Backend Registered
-> Functional Verification
-> Deployment Ready

These are provisioning workflow stages, not values stored in the Device
`state` field. The persisted Device state enum is defined under "Canonical
Registered-Device States" below.

## Repository Reconciliation

Repository-verified:

- Backend currently requires a recognized device identity in the devices collection and derives backend communication permission from canonical `state` before accepting button events.
- Backend request ingestion verifies the presented `X-Fairway-Device-Key` credential against the exact claimed device's stored SHA-256 verifier; a single fleet-wide `FAIRWAY_DEVICE_KEY` is no longer the authentication mechanism.
- Backend rejects unknown devices and Retired devices.
- Backend stores request metadata using device course/hole data when present; hole number and display label are derived from the device's canonical `location` field.
- A backend fleet data-foundation module now exists (`fairway_backend/cloudrun_receiver/lib/fleet/`) implementing the canonical Customer/Course/Device schema, centralized ID allocation, and per-device credential generation/verification (`credentials.js`). Courses are stored as a Firestore subcollection of their owning Customer (`customers/{customerId}/courses/{courseId}`); Course IDs remain globally allocated and unique. Device creation/reassignment always sources `customer_name`/`course_name` from the authoritative Customer/Course records and validates that an assigned Course belongs to the Device's Customer. The live request-ingestion path in `index.js` now looks up the claimed device first, then verifies its credential against that device's own stored verifier, before continuing to the same duplicate-suppression/request-creation logic as before.

Current prototype behavior:

- Per-device credential verification is implemented in the backend and is now live in production: the canonical reference device `devices/FRB-0001` has an issued credential verifier and has been physically validated end-to-end (button press through LTE/HTTPS to a persisted request) using it.
- Provisioning workflow around the devices registry is not yet fully codified as a single operational procedure.

Intended production model:

- Per-device authentication material with controlled assignment, rotation, and revocation.
- Full registry-backed SIM and device lifecycle management.

Outstanding decisions:

- Credential rotation and revocation workflow (credential issuance, verifier storage, and verification are implemented; routine rotation policy remains future work — see `docs/feature_backlog.md`, "Fleet Security Procedure & Credential Lifecycle").
- Provisioning automation, manufacturing serialization, and inventory lifecycle tooling.
- Admin UI/authorization model for creating and managing Customer/Course/Device records (see `docs/feature_backlog.md`).

## Provisioning Record

Each provisioned device requires a provisioning record with the fields below.

| Field | Purpose |
|---|---|
| Firestore document ID | Permanent logical identifier (`devices/{FRB-XXXX}`); not duplicated as `device_id` |
| `customer_id` / `customer_name` | Authoritative Customer ID and synchronized readable name; Customer assignment is set once |
| `course_id` / `course_name` | Current Course ID within that Customer and synchronized readable name |
| `location` | `{ type: "hole", hole: 1-18 }` or `{ type: "custom", name }` |
| `state` | One exact canonical stored value: `in_inventory`, `deployed`, `maintenance`, or `retired` |
| `hardware_revision` | Prototype or production hardware revision |
| `firmware_generation` | Installed firmware generation |
| `sim_iccid` | Installed SIM identity |
| `credential` | Non-reversible SHA-256 verifier metadata only; never the plaintext secret |
| `comments` | Administrator free-text notes |
| `commissioning` | Commissioning metadata (`commissioned_at`, `commissioned_by`) or null |
| `service` | Service metadata (`last_service_at`, `last_service_by`) or null |
| `latest_health` | Currently a null placeholder; no health transport/persistence is implemented yet. Approved target (see "Device Health: Latest State and History" below): the freshest successfully received valid Device Health observation, including a backend/server-owned `received_at`. |
| `gps` | Reserved null placeholder for a future GPS extension |
| `created_at` / `updated_at` | Standard record metadata |

Do not store secret values in this record. Do not store device-specific records in canonical engineering documentation.

## Device Identity

Each physical device receives one permanent Device ID.

Device IDs use the format:

FRB-0001

The canonical identity is the Firestore document ID itself (`devices/{FRB-XXXX}`). A Device document does not additionally store its own ID as a `device_id` field; any code needing the Device ID derives it from the document reference/document ID, or from the request's claimed Device ID where applicable.

Device ID remains unchanged when:

- firmware changes
- batteries are replaced
- the SIM is replaced
- the device moves between courses or holes
- the device is reassigned to a different course (within the same Customer) or marker location
- the device's administrative state changes

Similarly, once a Device has been assigned a `customer_id`, that Customer association is not changed by normal reassignment; only Course (within that Customer) and marker location may change. There is no cross-Customer Device transfer workflow.

If the physical device itself is replaced, assign a new Device ID.

## Canonical Registered-Device States

Every registered Device is in exactly one canonical persisted `state`:

- `in_inventory` (displayed as In Inventory)
- `deployed` (displayed as Deployed)
- `maintenance` (displayed as Maintenance)
- `retired` (displayed as Retired)

There is no normal delete workflow. A Retired device remains permanently in the registry for historical provenance rather than being deleted.

Administrative state and backend/device communication access are related but distinct concepts:

- `state` is the sole canonical field representing operational/admin lifecycle (the four values above). There is no independent `active` field in the canonical Device schema.
- Backend communication permission is always derived from `state` via `isDeviceCommunicationAllowed(state)`: `in_inventory`, `deployed`, and `maintenance` permit communication. `retired`, missing, malformed, and unknown values deny communication. The policy fails closed.

Implementation: `fairway_backend/cloudrun_receiver/lib/fleet/schema.js` (`DEVICE_STATES`, `isDeviceCommunicationAllowed`) and `devices.js` (`updateDeviceState`). The live request-ingestion handler (`index.js`) derives communication permission from `state` directly.

## Fleet ID Allocation

Customer, Course, and Device IDs (`CUST-XXXX`, `COURSE-XXXX`, `FRB-XXXX`) are allocated centrally by the backend, never guessed or assigned client-side. The allocation mechanism uses a Firestore transaction against a per-prefix counter document (`counters/{prefix}`), which is duplicate-resistant and safe for future concurrent use by an Admin "Add Customer/Course/Device" workflow. Course IDs are allocated from a single global `counters/COURSE` document regardless of which Customer a Course is nested under, so Course IDs remain globally unique across the entire fleet and never restart per Customer.

Implementation: `fairway_backend/cloudrun_receiver/lib/fleet/ids.js` (`allocateNextId`), used by `customers.js`, `courses.js`, and `devices.js`.

Per CPO direction, a physical marker's `FRB-XXXX` ID is allocated only once build/test has reached "Ready for Deployment"; the Admin UI that will trigger that allocation is future work (see `docs/feature_backlog.md`), not implemented here.

### Existing Reference Device: FRB-0001 (Live, Migrated, Physically Validated)

The existing physical reference device is canonically designated **FRB-0001** and this migration is now complete. To reserve that identity, the Device allocator (`RESERVED_FLOORS` in `ids.js`) starts a fresh/uninitialized `counters/FRB` document at sequence `2` rather than `1`, so the allocator can never issue `FRB-0001` to a new device; the first device allocated through the future Add Device workflow will be `FRB-0002`. Customer and Course allocation are unaffected and continue to start at `CUST-0001` and `COURSE-0001` respectively.

Current live state (CPO-authorized bootstrap writes, separate from the repository's own Admin "Add Device" workflow, which remains unimplemented):

- `customers/CUST-0001` exists live with `customer_name = "Monarch Bay GC"`.
- `customers/CUST-0001/courses/COURSE-0001` exists live with `course_name = "Tony Lema Course"`, `timezone = "America/Los_Angeles"`, and `health_report_schedule = { times: ["09:00", "17:00"] }` in course-local time.
- Live allocation counters are `counters/CUST.next = 2`, `counters/COURSE.next = 2`, and `counters/FRB.next = 2`.
- `devices/FRB-0001` exists live with the normalized canonical schema: `state = "deployed"`, `customer_id = "CUST-0001"`, `customer_name = "Monarch Bay GC"`, `course_id = "COURSE-0001"`, `course_name = "Tony Lema Course"`, `location = { type: "hole", hole: 7 }`, an associated SIM ICCID, `hardware_revision`, `firmware_generation`, and an issued unique credential verifier. No `device_id`, `active`, top-level `hole`, `label`, or `model` field is present.
- The legacy lowercase `devices/frb-0001` record and the unrelated legacy `devices/pv4` record have both been deleted from live Firestore; the `devices` collection contains only `FRB-0001`.
- The physical reference Feather has been reflashed with a firmware build reading `FAIRWAY_DEVICE_ID = "FRB-0001"` and its unique production credential from the local gitignored provisioning file; the firmware source change enabling this (`FAIRWAY_DEVICE_ID`/`FAIRWAY_DEVICE_KEY` macro usage) is currently part of the uncommitted WP3 working tree. Formal `docs/FIRMWARE_SPECIFICATION.md` Firmware Generation Registry update is deferred until this WP3 source is committed/merged to `main`; see that document for the current firmware-generation provenance note.
- End-to-end physical validation succeeded: a real physical button press produced a successful (`HTTP 200`) request through the live `fairway-button-receiver` Cloud Run backend, authenticated using FRB-0001's own unique credential (no shared/global credential path), and persisted a request document with `device_id = "FRB-0001"`, `course_id = "COURSE-0001"`, `course_name = "Tony Lema Course"`, `hole = 7`, and `device_label = "Hole 7"`.
- The cart-operator webapp was not independently visually verified during this validation; the underlying Firestore data it reads was confirmed correct. This is a known gap, not a WP3 blocker, and is not claimed as UI-validated.

**Legacy field mapping applied during this migration:**

| Legacy `devices/frb-0001` field | Canonical destination |
|---|---|
| `device_id` | Firestore document ID itself (`FRB-0001`); not duplicated as a document field |
| `active` | Replaced by canonical `state`; communication permission derived via `isDeviceCommunicationAllowed(state)` |
| `hole` | `location: { type: "hole", hole: N }` |
| `label` (e.g. "Hole N Button") | Redundant for a normal hole placement; display text is derived from `location`, no canonical Device field required |
| `course_id` / `course_name` | `course_id` carried forward as-is; `course_name` re-derived from the authoritative `customers/{customerId}/courses/{course_id}` record at migration time rather than copied verbatim, in case it has drifted |
| (no legacy field) | The legacy record has no Customer association; migration must assign a `customer_id`/`customer_name` for the first time (a first-time assignment, not a reassignment) once the corresponding canonical `customers/CUST-0001` record exists |
| `notes` | Canonical `comments` |
| `model` (`"pv4"`) | Not migrated. CPO decision: `model = "pv4"` identifies the legacy E-Switch PV4 physical button model and is excluded from the canonical `FRB-0001` Device record; a future `button_type` field for multi-button-type support is deferred and not implemented. |

### Additional Normalization Candidates

Not changed in this migration; flagged for future CPO/Architect review:

- Storing `customer_id` inside a Course document (in addition to the parent Firestore path already establishing ownership) was considered and intentionally **not** implemented: no current code path requires a Course-by-ID lookup without already knowing its Customer, so the parent path alone is sufficient today. Revisit if a future cross-Customer Course query (e.g. "find this Course ID across the whole fleet") becomes required.
- `course_name` (and now `customer_name`) denormalized on the Device document are approved, intentional synchronized display copies per current CPO direction, not a normalization defect; they are re-derived from the authoritative Customer/Course records on every assignment/reassignment rather than being independently editable.

## Authentication Material

Each device must possess authentication material before it is permitted to communicate with the backend.

Requirements:

- unique per device
- never committed to source control
- never written into canonical documentation
- installed through the approved provisioning workflow
- referenced in the provisioning record without exposing the secret
- subject to future rotation and revocation procedures

### Credential Architecture (Implemented)

Each device has exactly one active unique credential, bound to its permanent Device ID (the Firestore document ID). There is no multiple-active-credential architecture and no routine rotation at this stage.

- **Form:** a 256-bit (32-byte) cryptographically random value generated with Node's built-in `crypto.randomBytes(32)`, base64url-encoded for transport in the existing `X-Fairway-Device-Key` header. No new dependency, no custom cryptography, no PKI/device-certificate infrastructure.
- **Backend storage:** only a non-reversible SHA-256 verifier (`{ algorithm: 'sha256', digest, updated_at }`) is persisted on the device record's `credential` field. The plaintext secret is never written to Firestore, never logged, and never written into canonical documentation.
- **One-time delivery:** the plaintext secret is returned exactly once, at generation time, to the caller performing device creation/credential replacement (the future Admin "Add Device"/"Replace Credential" workflow, WP5). It is not routinely re-displayed afterward; the Admin UI should show credential status/metadata (e.g., last-updated time), not the secret itself, since the backend no longer possesses the plaintext after that one response.
- **Verification/binding:** the backend looks up the device strictly by the claimed `device_id` (the Firestore document ID), rejects unknown or Retired devices (per canonical `state`), and only then verifies the presented credential against that exact device's stored verifier using a constant-time comparison. A credential issued for one FRB identity can never authenticate a request claiming a different FRB identity.
- **Replacement:** a new credential can be issued for the same permanent `device_id` at any time (for example after suspected compromise); this replaces the stored verifier only and never changes the Device ID.
- **Retirement and invalid state:** a Retired device, or a Device record with a missing, malformed, or unknown state, is rejected before credential verification is attempted, consistent with the fail-closed backend-access policy above.

Implementation: `fairway_backend/cloudrun_receiver/lib/fleet/credentials.js` (`generateDeviceCredential`, `deriveCredentialVerifier`, `verifyDeviceCredential`) and `lib/fleet/devices.js` (`replaceDeviceCredential`, `getDeviceForAuthentication`, `authenticateDeviceCredential`). The live request-ingestion handler (`index.js`) now verifies per-device credentials in this way instead of a single fleet-wide shared key. This architecture is now validated in live production: `devices/FRB-0001` has an issued credential and successfully authenticated a real physical button-press request end-to-end; the legacy fleet-wide `FAIRWAY_DEVICE_KEY` Cloud Run environment variable has been removed and no shared-key fallback remains.

Full compromise-response, revocation, and routine-rotation procedures remain deferred; see `docs/feature_backlog.md` ("Fleet Security Procedure & Credential Lifecycle").

### Device-Side Provisioning Material

Firmware reads both the permanent canonical `FAIRWAY_DEVICE_ID` and the unique `FAIRWAY_DEVICE_KEY` from one local, gitignored per-device header (`samples/fairway_power_sandbox/src/secrets/fairway_device_key.h`), so identity and credential can never be independently hardcoded in different application locations. The tracked template (`fairway_device_key.example.h`) contains placeholders only, never a real ID or secret. This file is never committed and never duplicated into canonical documentation. Provisioning a physical unit means writing that unit's issued `FRB-XXXX` ID and one-time plaintext credential into this local file before building/flashing that unit's firmware.

## SIM Provisioning

SIM provisioning associates:

- Device ID
- Hologram SIM ICCID
- carrier
- canonical Device `state`

The exact SIM identifier for each unit is recorded when the unit is built or provisioned.

SIM assignment belongs in the device registry, not in the hardware BOM or assembly guide.

## Device Registry

The device registry is the authoritative operational record for every physical device, implemented as the `devices` Firestore collection via `fairway_backend/cloudrun_receiver/lib/fleet/devices.js`.

The canonical current Device fields are defined in "Provisioning Record" above.
Device identity comes from the Firestore document ID; readable Customer/Course
names are synchronized copies; placement comes from `location`; lifecycle and
communication permission come from `state`; and operational history may be
represented through the `commissioning` and `service` metadata objects. Future
history requirements must not introduce duplicate identity, placement, or
communication flags.

## Firmware Installation Prerequisite

Approved firmware must be installed before provisioning can be completed.

Canonical references:

- docs/FIRMWARE_SPECIFICATION.md
- docs/DEPLOYMENT_GUIDE.md

This document does not duplicate firmware build, flash, or implementation instructions.

## UICR AP-Protect Provisioning (Unresolved Question)

During a bounded engineering investigation, the current development reference device received:

- `UICR.APPROTECT = HwUnprotected (0x50FA50FA)`
- `UICR.SECUREAPPROTECT = HwUnprotected (0x50FA50FA)`

This was applied once, to that specific device, as investigation evidence/provenance. It is not established whether future pilot devices require, or already have, this provisioning; this is an open question, not a current provisioning requirement. Any pilot provisioning requirement based on this evidence requires separate CPO approval.

## Backend Registration and Communication Permission

A device must be registered at `devices/{FRB-XXXX}` so backend request handling
can recognize its permanent identity and verify its per-device credential.

Registration does not create an independent activation flag. Communication
permission is derived only from canonical `state`; `in_inventory`, `deployed`,
and `maintenance` allow communication, while all other values deny it.

Related planning owner:

- docs/feature_backlog.md

## Course, Customer, and Marker Location Assignment

A deployment-ready device may be associated with:

- a Customer (`customer_id`, authoritative) with a synchronized `customer_name` display copy
- a Course (`course_id`, authoritative), which itself belongs to exactly one Customer (enforced by nested Firestore storage) and carries a timezone and Device Health reporting schedule (default 09:00 and 17:00 course-local time), with a synchronized `course_name` display copy
- a marker location: either a standard Hole 1 through Hole 18 selection, or a "Custom" free-text location name (for example "Driving Range", "Practice Green", "Clubhouse Patio"). Hole number and any display text (e.g. "Hole 7") are always derived from this single `location` field; no independent `hole`/`label` fields are stored on the Device document.
- administrator comments

`customer_name` and `course_name` are always sourced from the authoritative Customer/Course records at assignment time; a caller cannot supply an arbitrary or conflicting display name. A Course can only be assigned if it belongs to the Device's own Customer; a Course belonging to a different Customer is rejected. Once a Device has a `customer_id`, normal reassignment only moves it between Courses belonging to that same Customer — there is no cross-Customer Device transfer workflow. Physical identity remains constant even if Customer, Course, or location assignment changes. Future GPS coordinates may be added to the location model later without requiring a breaking schema change; GPS is not implemented in the current schema.

## Device Health: Latest State, History, Thresholds, and Alerts (Approved Target)

This section is the canonical owner of backend Device Health state requirements, `latest_health` semantics, the health-history requirement, Device Health thresholds, and alert-state/lifecycle semantics. Firmware-side acquisition and the approved scheduled-transport requirement are owned by `docs/FIRMWARE_SPECIFICATION.md` ("Device Health Transport and Scheduling (Approved Target, Not Yet Implemented)") and are not duplicated here.

Current implementation status: `latest_health` is a null placeholder on every Device record today (see "Provisioning Record" above); no Device Health backend persistence, history store, threshold evaluation, or alert record exists in current tracked source.

### Latest Health and History (Approved Target)

- `devices/{FRB-XXXX}.latest_health` shall represent the freshest successfully received valid Device Health observation for that Device, including a backend/server-owned `received_at` timestamp.
- The backend shall also retain immutable historical Device Health observations, distinct in purpose from `latest_health`: `latest_health` serves efficient current fleet/device state, while health history serves trends, diagnosis, alert analysis, and historical record.
- Ordinary golfer button communications shall also update `latest_health` and health history whenever they carry a fresh valid health observation, in addition to the two autonomous scheduled observations per day described in `docs/FIRMWARE_SPECIFICATION.md`.
- The exact immutable-history Firestore collection/path/schema is not yet approved and is unresolved WP4 implementation work; it is not invented here. Once WP4 implementation establishes an actual deployed Firestore collection/path/configuration, `docs/DEPLOYMENT_GUIDE.md` shall document that deployed configuration.

### Device Health Thresholds (Approved Initial Values)

| Metric | Yellow | Red | Status |
|---|---|---|---|
| Battery voltage | below 3.0 V | below 2.5 V | Approved |
| Temperature | above 100 F | above 110 F | Approved |
| RSRP | below -105 dBm | below -115 dBm | Provisional |
| RSRQ | below -15 dB | below -19 dB | Provisional |
| SNR | below 0 dB | below -5 dB | Provisional |

Battery and temperature thresholds are approved initial values. Cellular thresholds (RSRP, RSRQ, SNR) are explicitly provisional sprint thresholds and must not be silently converted into permanent validated thresholds. These are approved target values; no threshold-evaluation implementation exists yet.

### Alert Lifecycle (Approved Target)

Health alerts are persistent records, not transient UI coloring. Alerts shall:

- open when the relevant condition is established;
- remain represented as an active condition while unresolved;
- automatically resolve when subsequent valid evidence establishes recovery;
- retain their history indefinitely; resolution does not erase alert history.

A missed scheduled Device Health report is itself an alert condition, independent of the values contained in the most recent successful health observation. For the default 09:00/17:00 schedule, a report is missed if not successfully received by 09:05/17:05 Course-local time respectively; the backend independently determines a miss and must not depend on a failed Device transmission to report its own communication failure. The next successful health-bearing communication for that Device, whether a scheduled health report or an ordinary button communication, automatically resolves the missed-report/connectivity alert without erasing its history.

No general stale-device threshold beyond the explicit 09:05/17:05 missed-scheduled-report rules has been approved; one is not implied or invented here. The exact alert collection/path/schema is unresolved WP4 implementation work, to be documented in `docs/DEPLOYMENT_GUIDE.md` once deployed.

### Admin Notifications (Approved Target)

A missed scheduled Device Health report shall generate an immediate notification to the admin once the backend establishes the miss at the applicable 09:05/17:05 Course-local deadline. Approved channels are email and SMS/text. For the present sprint/pilot, notification recipient scope is admin only; it must not be expanded to Course or Customer personnel without separate approval. The exact email/SMS provider is not yet selected and is not canonicalized here; notification implementation should remain sufficiently decoupled that the health architecture is not unnecessarily bound to a particular provider.

### Admin Authorization (Current vs. Approved Target)

The existing `fairway_webapp/cart_operator_dashboard/` currently implements Firebase Authentication (Google and email/password sign-in); there is no operator/admin role distinction today — every authenticated user is treated identically. Approved target: extend the existing Fairway application with a distinct admin area/login using the same Firebase authentication system, with real admin authorization. The exact admin authorization mechanism is not yet established and is not invented here; it remains implementation work, see `docs/feature_backlog.md` (WP5).

## Functional Verification

The standard future full deployment/provisioning validation includes:

- Identity
	- correct Device ID assigned
	- authentication material installed
- Firmware
	- approved firmware installed
- Connectivity
	- SIM installed and active
	- LTE registration succeeds
- Backend communication
	- backend accepts the device
	- button event reaches the backend
- End-to-end verification
	- request appears in the operator dashboard
	- confirm and complete workflow succeeds

Canonical references:

- docs/DEPLOYMENT_GUIDE.md
- docs/UX_SPECIFICATION.md

WP3 used a narrower, explicitly accepted bootstrap-validation scope: FRB-0001
successfully authenticated and created exactly one correctly attributed backend
request. The operator webapp was not independently visually validated, and its
confirm/complete flow was not claimed as WP3 evidence. Broader UI validation
remains part of a separately authorized full-system or pilot deployment check.

Build, test, provisioning, verification, and Ready for Deployment are workflow
stages, not additional persisted Device states. The only persisted state enum
is the four-value `state` model above.

## Device Replacement

Replacement rules:

- A replacement physical device receives a new Device ID.
- Historical records for the retired or failed unit remain preserved.
- Course and hole assignment may be transferred to the replacement unit.
- SIM reuse or replacement must be recorded in the registry.
- Secrets for the retired device must be revoked when supported.

Operational tooling is intentionally out of scope for this document.

## Future Work

Provisioning work that remains to be completed, aligned with current repository state and backlog:

- manufacturing serialization process
- production inventory management workflow
- secure administrative delivery and storage policy for the one-time issued plaintext credential
- credential replacement, revocation, and compromise-response procedures
- future routine rotation policy and stronger protected device-side storage if justified
- fleet provisioning automation approach
- Admin UI for creating/managing Customer, Course, and Device records (see `docs/feature_backlog.md`)

## Repository Ownership

| Subject | Canonical Owner |
|---|---|
| Hardware components | docs/HARDWARE_BOM.md |
| Physical assembly | docs/HARDWARE_ASSEMBLY_GUIDE.md |
| Firmware implementation | docs/FIRMWARE_SPECIFICATION.md |
| UX behavior | docs/UX_SPECIFICATION.md |
| Deployment | docs/DEPLOYMENT_GUIDE.md |
| Engineering architecture | docs/ENGINEERING_GUIDE.md |
| Outstanding features | docs/feature_backlog.md |

## Notes

This document intentionally excludes:

- live credentials
- secret values
- device-specific registry records
- deployment commands
- firmware implementation details
- hardware assembly instructions
