# Fairway Refresh Engineering Documentation

Read this index first, then follow the owner-document hierarchy below. Current
source is authoritative for implementation; each owner document is authoritative
for its engineering domain. CPO-confirmed physical and production evidence is
valid validation evidence. Surface material conflicts instead of resolving
them by assumption.

## Current Milestone

Fairway Refresh is a fielded product operating at the CPO-accepted **Pilot 1.1** milestone.
Pilot 1.1 is an integrated product milestone, not a new firmware generation.
The CPO confirms FRB-0001 through FRB-0005 passed firmware programming,
credential activation, and physical end-to-end testing. FRB-0006's authorized
firmware recovery and credential replacement completed on 2026-10-17.
Subsequent field testing demonstrated a successful button request and COMPLETE
rearm, but intermittent LTE/HTTPS failures remain unresolved; sustained
reliability acceptance is pending.
The firmware milestone base is
`6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`; the incorporated HTTPS recovery
correction, device-specific provisioning source, and exact artifact provenance
are distinguished in the firmware and deployment documents. Do not treat the
milestone base alone as an installed-image identity. No current per-device
course or marker-location assignments are recorded in engineering SoTs.

## Reading status correctly

Current accepted source describes implementation, not proof of deployment.
Use the Deployment Guide's latest verified production alignment for dated
runtime evidence; older release records are historical, not competing current
states or standing authorizations. The CPO_stats_fix reporting and persistent
Resume/Suspend behavior was CPO-accepted, merged, and deployed to production
on 2026-10-22. The CPO-accepted select-any-request queue and independent
On-course / Amenity Areas categories were merged and deployed on 2026-10-23.
The CPO subsequently confirmed the production FRB-0006 test passed and accepted
the released queue-selection and independent controls; that release handoff
is closed.
The next persistent cart inventory, Customer staff, audits and shift-close
increment is published only to the authorized sandbox in draft PR #12.
The CPO accepted its current functionality on 2026-10-24 and requested
presentation refinement within the same PR. It is not merged or
production-deployed; presentation review remains pending. Its current review
identity and verification are in the Deployment Guide's latest Alignment
Register entry; accepted behavior is owned by the UX specification.
Detailed operator behavior is owned by the
[UX owner](UX_SPECIFICATION.md#cpo-stats-fix-reporting-requirements); deployed
release identities, custom-domain Auth correction, verification, and remaining
physical-device limits are owned by the
[Deployment Guide](DEPLOYMENT_GUIDE.md#queue-selection-and-amenity-areas-production-release--2026-10-23).
The rejected PR #4 architecture remains retired; its migration/cutover machinery
is not active guidance. Unknown measurements, incomplete
acceptance, and unresolved product decisions remain explicit in the backlog.
The October 20 test-data cleanup and October 21 CPO acceptance are complete;
the concise deployment record is authoritative for that operation, with
detailed evidence retained only on its historical branch. No rerun is implied.

## Documentation Hierarchy and Ownership

- `docs/README.md` — navigation, hierarchy, and current milestone.
- `docs/ENGINEERING_GUIDE.md` — system overview, cross-document summary, and
  canonical Fairway Refresh Fidelity Mandate.
- `docs/Continuous_improvement_Kaizen_1.0.md` — product-first engineering
  discipline, prioritization, evidence, CPO-time protection, and retrospective
  practice.
- `docs/FIRMWARE_SPECIFICATION.md` — current firmware implementation,
  constraints, and firmware-related deferred work.
- `docs/HARDWARE_BOM.md` — current installed hardware components and part
  numbers.
- `docs/HARDWARE_ASSEMBLY_GUIDE.md` — current physical wiring, service-power
  isolation, and Circuit Dojo nRF9151 Feather header/pin reference.
- `docs/DEVICE_PROVISIONING_GUIDE.md` — device identity, credentials, registry,
  and commissioning lifecycle.
- `docs/UX_SPECIFICATION.md` — current externally observable golfer and
  operator behavior.
- `docs/DEPLOYMENT_GUIDE.md` — deployment configuration, production alignment,
  and retained release/deployment audit records.
- `docs/feature_backlog.md` — open, deferred engineering work only.
- `docs/archive.md` — superseded milestones, abandoned work, and lessons;
  historical and non-authoritative.
- `docs/decisions/` — accepted engineering decision records.
- `docs/vendor/` — noncanonical vendor/reference evidence.

Owner documents hold detailed truth. Other documents summarize and link rather
than duplicating implementation or assembly detail. The archive preserves
context only; it does not override current requirements or procedures.

## Engineering Workflow

1. Read this index and `docs/ENGINEERING_GUIDE.md`.
2. Read the owner document relevant to the proposed work.
3. Inspect current implementation and verify the relevant evidence.
4. Resolve material conflicts with the CPO/Lead Architect before proceeding.
5. Perform only explicitly authorized work.
6. Update the owner document for any changed behavior, design, or procedure.
7. Validate the result and report what changed, what passed, and what remains
   unresolved or unverified.

## Engineering Principles

- Preserve the accepted product architecture and behavior unless a change is
  explicitly approved.
- Prefer small, evidence-led changes over speculative redesign.
- Keep historical context in `docs/archive.md` or retained deployment audit
  entries, not in current operating guidance.
- Never put secrets or unneeded per-device location assignments in engineering
  documentation.
