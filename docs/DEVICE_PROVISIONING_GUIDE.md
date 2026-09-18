# Device Provisioning Guide

## Document Status

- Status: Draft
- Version: 0.1
- Last Updated: 2026-08-03

## Purpose

This document is the canonical process for provisioning a new Fairway Refresh field device before deployment.

This document defines the canonical provisioning process. Device-specific records, provisioning logs, and historical provisioning events are operational records and are not part of the engineering Source of Truth.

## Fleet Hierarchy

Fairway Refresh fleet data is organized as:

Customer -> Course -> Device

- **Customer** — the Fairway Refresh contractual customer. One Customer may own one or many Courses. Canonical IDs use the `CUST-0001` style.
- **Course** — belongs to exactly one Customer. Canonical IDs use the `COURSE-0001` style. Each Course requires a timezone and a Device Health reporting schedule (default 09:00 and 17:00 course-local time; stored/configured only, firmware scheduling is separate future work).
- **Device** — a permanent physical marker identified by its `FRB-0001`-style ID (see Device Identity below). A Device is assigned to a Customer, a Course, and a marker location; that assignment is mutable, but the Device ID itself never changes.

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

Lifecycle states:

Manufactured
	↓
Provisioned
	↓
Verified
	↓
Deployed
	↓
Maintenance
	↓
Returned to Service
	↓
Retired

## Repository Reconciliation

Repository-verified:

- Backend currently requires a recognized device identity in the devices collection and checks active state before accepting button events.
- Backend request ingestion validates X-Fairway-Device-Key against FAIRWAY_DEVICE_KEY.
- Backend rejects unknown devices and devices marked inactive.
- Backend stores request metadata using device course/hole data when present.
- A backend fleet data-foundation module now exists (`fairway_backend/cloudrun_receiver/lib/fleet/`) implementing the canonical Customer/Course/Device schema and centralized ID allocation. It is purely additive: the live request-ingestion path above is unmodified and continues to read the same `active`/`course_id`/`course_name`/`hole`/`label` fields it always has, now derived/maintained by the new Device primitives for devices created or updated through them.

Current prototype behavior:

- Authentication currently follows a shared-key prototype path.
- Provisioning workflow around the devices registry is not yet fully codified as a single operational procedure.

Intended production model:

- Per-device authentication material with controlled assignment, rotation, and revocation.
- Full registry-backed SIM and device lifecycle management.

Outstanding decisions:

- Secret generation, storage, rotation, and revocation workflow.
- Provisioning automation, manufacturing serialization, and inventory lifecycle tooling.
- Admin UI/authorization model for creating and managing Customer/Course/Device records (see `docs/feature_backlog.md`).

## Provisioning Record

Each provisioned device requires a provisioning record with the fields below.

| Field | Purpose |
|---|---|
| Device ID | Permanent logical identifier (`FRB-XXXX`) |
| Customer ID | Assigned Customer (`CUST-XXXX`); mutable |
| Course ID | Assigned Course (`COURSE-XXXX`); mutable |
| Marker Location | Hole 1-18 or Custom free-text location name; mutable |
| Administrative State | One of: In Inventory, Deployed, Maintenance, Retired |
| Hardware Revision | Prototype or production revision |
| Firmware Version | Installed firmware version |
| PCB / Assembly Revision | Physical build reference |
| SIM ICCID | Installed SIM identity |
| Carrier | Cellular provider |
| Authentication Credential Reference | Reference to assigned credential without exposing the secret |
| Comments | Administrator free-text notes |
| Provisioning Date | Traceability |
| Provisioned By | Traceability |

Do not store secret values in this record. Do not store device-specific records in canonical engineering documentation.

## Device Identity

Each physical device receives one permanent Device ID.

Device IDs use the format:

FRB-0001

Device ID remains unchanged when:

- firmware changes
- batteries are replaced
- the SIM is replaced
- the device moves between courses or holes
- the device is reassigned to a different customer, course, or marker location
- the device's administrative state changes

If the physical device itself is replaced, assign a new Device ID.

## Canonical Registered-Device States

Every registered Device is in exactly one of the following canonical administrative states:

- In Inventory
- Deployed
- Maintenance
- Retired

There is no normal delete workflow. A Retired device remains permanently in the registry for historical provenance rather than being deleted.

Administrative state and backend/device communication access are related but distinct concepts:

- `state` is the operational/admin lifecycle state (the four values above).
- `active` is the existing compatibility flag the live request-ingestion path in `index.js` reads directly; it is a backend communication access gate, not an administrative lifecycle indicator.
- Access policy: In Inventory, Deployed, and Maintenance all permit backend communication (`active = true`); only Retired denies it (`active = false`).

Implementation: `fairway_backend/cloudrun_receiver/lib/fleet/schema.js` (`DEVICE_STATES`, `deriveLegacyActiveFlag`) and `devices.js` (`updateDeviceState`). The current backend behavior in `index.js` is unaffected.

## Fleet ID Allocation

Customer, Course, and Device IDs (`CUST-XXXX`, `COURSE-XXXX`, `FRB-XXXX`) are allocated centrally by the backend, never guessed or assigned client-side. The allocation mechanism uses a Firestore transaction against a per-prefix counter document (`counters/{prefix}`), which is duplicate-resistant and safe for future concurrent use by an Admin "Add Customer/Course/Device" workflow.

Implementation: `fairway_backend/cloudrun_receiver/lib/fleet/ids.js` (`allocateNextId`), used by `customers.js`, `courses.js`, and `devices.js`.

Per CPO direction, a physical marker's `FRB-XXXX` ID is allocated only once build/test has reached "Ready for Deployment"; the Admin UI that will trigger that allocation is future work (see `docs/feature_backlog.md`), not implemented here.

### Existing Reference Device: FRB-0001 Bootstrap

The existing physical reference device is canonically designated **FRB-0001**. To reserve that identity, the Device allocator (`RESERVED_FLOORS` in `ids.js`) starts a fresh/uninitialized `counters/FRB` document at sequence `2` rather than `1`, so the allocator can never issue `FRB-0001` to a new device; the first device allocated through the future Add Device workflow will be `FRB-0002`. Customer and Course allocation are unaffected and continue to start at `CUST-0001` and `COURSE-0001` respectively.

This is a backend/data-model allocation-floor fact only. It does **not** mean any live Firestore migration has occurred:

- Current firmware still transmits the lowercase literal `frb-0001` (see `docs/FIRMWARE_SPECIFICATION.md`/`samples/fairway_power_sandbox/src/main.c`); migrating firmware identity to canonical `FRB-0001` is WP3 scope.
- The live Firestore `devices` document ID for the existing reference device has not yet been inspected or verified against this canonical designation; that verification and any live-document migration/rename is deferred to WP3 or separately authorized live-cloud work.
- No historical `requests` records are altered by this reservation.
- No live Firestore counter document is created by this WP2 correction; the reservation only takes effect the first time the allocator runs against an absent `counters/FRB` document.

## Authentication Material

Each device must possess authentication material before it is permitted to communicate with the backend.

Requirements:

- unique per device
- never committed to source control
- never written into canonical documentation
- installed through the approved provisioning workflow
- referenced in the provisioning record without exposing the secret
- subject to future rotation and revocation procedures

## SIM Provisioning

SIM provisioning associates:

- Device ID
- Hologram SIM ICCID
- carrier
- activation state

The exact SIM identifier for each unit is recorded when the unit is built or provisioned.

SIM assignment belongs in the device registry, not in the hardware BOM or assembly guide.

## Device Registry

The device registry is the authoritative operational record for every physical device, implemented as the `devices` Firestore collection via `fairway_backend/cloudrun_receiver/lib/fleet/devices.js`.

Registry fields should include:

- Device ID
- Customer ID and Course ID (current assignment)
- SIM ICCID
- authentication credential reference
- hardware revision
- firmware version
- administrative state (In Inventory, Deployed, Maintenance, Retired)
- marker location (Hole 1-18 or Custom)
- comments
- commissioning date
- service status
- replacement or retirement history

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

## Backend Activation

A device must be registered or activated in backend data so backend request handling recognizes it as an approved sender.

Activation authorizes a provisioned device to communicate with backend services.

Related planning owner:

- docs/feature_backlog.md

## Course, Customer, and Marker Location Assignment

A deployment-ready device may be associated with:

- a Customer (`customer_id`)
- a Course (`course_id`), which itself belongs to exactly one Customer and carries a timezone and Device Health reporting schedule (default 09:00 and 17:00 course-local time)
- a marker location: either a standard Hole 1 through Hole 18 selection, or a "Custom" free-text location name (for example "Driving Range", "Practice Green", "Clubhouse Patio")
- administrator comments

Physical identity remains constant even if Customer, Course, or location assignment changes. Future GPS coordinates may be added to the location model later without requiring a breaking schema change; GPS is not implemented in the current schema.

## Functional Verification

A device is not considered provisioned until all of the following are verified:

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

## Inventory States

| State | Meaning |
|---|---|
| Assembly | Hardware is being built |
| Provisioning | Identity, SIM, and authentication are being assigned |
| Verified | Functional provisioning checks completed |
| Ready for Deployment | Approved for field installation |
| Deployed | Installed in active service |
| Maintenance | Temporarily removed from service |
| Retired | Permanently removed from service |

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
- per-device secret generation and storage system of record
- secure provisioning tooling
- secret rotation and revocation procedures
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
