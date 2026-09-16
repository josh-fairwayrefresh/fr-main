# Engineering Documentation Index

This is the first document every engineer or AI coding agent should read before modifying the Fairway Refresh repository.

## Purpose
This document is the starting point for engineering work in Fairway Refresh. It explains what the engineering documentation is for, how the documentation is organized, and how to use it.

## Engineering Principles
- Source code is authoritative for implementation.
- One engineering document owns each topic.
- Upstream documentation is referenced, not duplicated.
- Historical documents preserve context but are never updated.
- Keep documentation short, practical, and example-driven.
- Repository recovery architecture is owned by `docs/ENGINEERING_GUIDE.md`.
- Current prototype evidence, current pilot-build architecture, and physical-layout TBD status are tracked separately and never conflated.

## Documentation Hierarchy
- **Index**: this document and other top-level navigation pages.
- **Authoritative engineering docs**: product level behavior, runbooks, and operational guidance.
- **Subsystem documents**: firmware, backend, hardware, and integration guides.
- **Implementation HOWTOs**: sample build/run instructions and component-level guides.
- **Upstream references**: vendor, RTOS, and SDK documentation linked as references.
- **Archive**: obsolete or historical material kept for context only.

## Canonical Document Ownership
- `docs/README.md` — documentation navigation and policy.
- `docs/ENGINEERING_GUIDE.md` — system-level overview, cross-document summary, and canonical Fairway Refresh Fidelity Mandate.
- `docs/HARDWARE_BOM.md` — installed hardware components and part numbers.
- `docs/HARDWARE_ASSEMBLY_GUIDE.md` — physical assembly, wiring, maintenance power procedure, and the complete Circuit Dojo nRF9151 Feather physical header/pin reference.
- `docs/FIRMWARE_SPECIFICATION.md` — current firmware implementation, constraints, and firmware backlog.
- `docs/UX_SPECIFICATION.md` — externally observable user behavior.
- `docs/DEPLOYMENT_GUIDE.md` — deployment and operational configuration ownership.
- `docs/DEVICE_PROVISIONING_GUIDE.md` — device provisioning lifecycle and registry requirements ownership.
- `docs/feature_backlog.md` — canonical engineering feature backlog.

Owner documents hold the detailed truth for their domain. Other documents should summarize and link rather than duplicate implementation or assembly details.

## Engineering Workflow
1. Read `docs/README.md`.
2. Read `docs/ENGINEERING_GUIDE.md`.
3. Read the subsystem document relevant to the work.
4. Inspect and verify the current implementation before changing it.
5. Make the approved code or configuration change.
6. Update the authoritative documentation that owns the changed topic.

## Major Engineering Documents
Current:

- `docs/README.md` — documentation index and usage principles.
- `docs/ENGINEERING_GUIDE.md` — primary engineering handbook; currently a draft, and the canonical owner of the Fairway Refresh Fidelity Mandate.
- `docs/HARDWARE_BOM.md` — installed prototype hardware components and part numbers.
- `docs/HARDWARE_ASSEMBLY_GUIDE.md` — assembly and wiring guide for Prototype 1.0, including the complete Circuit Dojo nRF9151 Feather physical header/pin reference.
- `docs/decisions/` — accepted engineering decision records.
- `docs/FIRMWARE_SPECIFICATION.md` — implementation-level firmware behavior and design rationale.
- `docs/UX_SPECIFICATION.md` — externally-observable user interaction and LED behavior.
- `docs/DEPLOYMENT_GUIDE.md` — deployment and operational guide.
- `docs/DEVICE_PROVISIONING_GUIDE.md` — device provisioning lifecycle and registry requirements guide.
- `docs/feature_backlog.md` — canonical engineering feature backlog.
- `docs/vendor/` — local external/vendor reference-evidence library; noncanonical material that does not change the existing owner-document hierarchy.

Current-state notes:
- LP 1.2 remains the validated firmware generation.
- Prototype 1.1 remains the current validated reference-device hardware milestone.
- The current pilot-build hardware architecture retains the 5580 battery-health path and the new onboard J4 VBAT/GND feed, while actual physical placement remains TBD.

Planned during documentation migration:

- Current working-state reference
- Hardware troubleshooting guide
- Firmware build and flash guide
- Lessons learned

## Stability
This page is intentionally implementation-agnostic. It should remain stable when files move or repository structure changes. The overall purpose, principles, hierarchy, workflow, and navigation model remain the same.
