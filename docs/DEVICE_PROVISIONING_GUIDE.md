# Device Provisioning Guide

## Document Status

- Status: Draft
- Version: 0.1
- Last Updated: 2026-08-03

## Purpose

This document is the canonical process for provisioning a new Fairway Refresh field device before deployment.

This document defines the canonical provisioning process. Device-specific records, provisioning logs, and historical provisioning events are operational records and are not part of the engineering Source of Truth.

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

Current prototype behavior:

- Authentication currently follows a shared-key prototype path.
- Provisioning workflow around the devices registry is not yet fully codified as a single operational procedure.

Intended production model:

- Per-device authentication material with controlled assignment, rotation, and revocation.
- Full registry-backed SIM and device lifecycle management.

Outstanding decisions:

- Canonical registry implementation and ownership model.
- Secret generation, storage, rotation, and revocation workflow.
- Provisioning automation, manufacturing serialization, and inventory lifecycle tooling.

## Provisioning Record

Each provisioned device requires a provisioning record with the fields below.

| Field | Purpose |
|---|---|
| Device ID | Permanent logical identifier |
| Hardware Revision | Prototype or production revision |
| Firmware Version | Installed firmware version |
| PCB / Assembly Revision | Physical build reference |
| SIM ICCID | Installed SIM identity |
| Carrier | Cellular provider |
| Authentication Credential Reference | Reference to assigned credential without exposing the secret |
| Provisioning Date | Traceability |
| Provisioned By | Traceability |
| Deployment Status | Current lifecycle state |

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

If the physical device itself is replaced, assign a new Device ID.

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

The device registry is the authoritative operational record for every physical device.

Registry fields should include:

- Device ID
- SIM ICCID
- authentication credential reference
- hardware revision
- firmware version
- activation state
- course
- hole or marker location
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

## Course and Hole Assignment

A deployment-ready device may be associated with:

- course
- hole
- marker location
- operational status

Physical identity remains constant even if deployment assignment changes.

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
- canonical device registry implementation and ownership model
- production inventory management workflow
- per-device secret generation and storage system of record
- secure provisioning tooling
- secret rotation and revocation procedures
- fleet provisioning automation approach

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
