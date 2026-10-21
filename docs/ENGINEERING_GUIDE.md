# Fairway Refresh Engineering Guide

## Document Status
- Status: Current Pilot 1.1 engineering overview
- The current engineering truth is owned by the subsystem documents listed in `docs/README.md`.
- Pilot 1.1 is an integrated product milestone, not a new firmware generation.

## Fidelity Mandate

==================================================
FAIRWAY REFRESH — FIDELITY MANDATE
==================================================

Before acting:

1. Establish current truth from the canonical Fairway repository. Confirm Git
   branch, HEAD, upstream and working-tree status. When canonical context has
   not yet been established for the active work context, read docs/README.md
   first, then read all current Major Engineering Documents:

   docs/ENGINEERING_GUIDE.md
   docs/Continuous_improvement_Kaizen_1.0.md
   docs/FIRMWARE_SPECIFICATION.md
   docs/HARDWARE_BOM.md
   docs/HARDWARE_ASSEMBLY_GUIDE.md
   docs/DEPLOYMENT_GUIDE.md
   docs/DEVICE_PROVISIONING_GUIDE.md
   docs/feature_backlog.md
   docs/UX_SPECIFICATION.md

   Retain and reuse established canonical context for bounded follow-up work.
   Freshly read a document only when the task needs canonical truth not already
   established in the active context or when relevant state may have changed;
   a new task or prompt alone does not require another full-document read.

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


## Product System Overview

The current end-to-end path is:

physical marker button → nRF9151 firmware → LTE-M → HTTPS → Cloud Run receiver → Firestore → Cart Operator web application.

Each physical marker has a permanent device identity and unique credential. The receiver validates identity and authentication, applies the course service and request rules, and persists accepted requests for authorized Cart Operators.

## Current Pilot Baseline

- Firmware milestone base: `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`. The incorporated `1.1_tempfix` and device-specific artifact provenance are owned by [the firmware specification](FIRMWARE_SPECIFICATION.md#purpose-and-current-baseline); this base is not an exact installed-image identity.
- Nordic NCS: 3.1.1; board: `circuitdojo_feather_nrf9151@1/nrf9151/ns`; application configuration: `prj_a.conf`.
- Firmware architecture: MCUboot + TF-M + non-secure application on the Circuit Dojo nRF9151 Feather.
- Current field-power design: regulated Voltaic V25/V50/V75 output to the Feather VBUS input, with the three-indicator button circuit. Current wiring and qualification boundaries are owned by the hardware documents.
- The CPO confirms products are in the field and FRB-0001 through FRB-0005 passed firmware programming, credential activation, and physical end-to-end testing. FRB-0006's authorized firmware recovery and credential replacement completed on 2026-10-17. Subsequent field testing demonstrated a successful button request and COMPLETE rearm, but intermittent LTE/HTTPS failures remain unresolved; sustained reliability acceptance is pending. Registry eligibility is not physical deployment proof; do not infer individual assignments from this summary.
- The responsive Cart Operator release is live. The production deployment record does not establish authenticated physical-phone/Safari acceptance; that acceptance remains pending.

## Current System Boundaries

- Firmware, backend, web applications, build configuration, and canonical documents are in the `nfed` repository. The official Nordic SDK and matching toolchain are installed separately; build and deployment procedures are owned by `docs/DEPLOYMENT_GUIDE.md`.
- Device provisioning, registry lifecycle, and authentication requirements are owned by `docs/DEVICE_PROVISIONING_GUIDE.md`.
- Externally observable behavior is owned by `docs/UX_SPECIFICATION.md`.
- Current parts and physical wiring are owned by `docs/HARDWARE_BOM.md` and `docs/HARDWARE_ASSEMBLY_GUIDE.md`.
- Open, deferred work is listed in `docs/feature_backlog.md`. Superseded milestones and abandoned work are summarized, non-authoritatively, in `docs/archive.md`.
- Pilot 1.1 has no Health reporting, and the golfer demand window is fixed at five minutes.

## Change and Validation Discipline

Follow the Fidelity Mandate above and the engineering workflow in `docs/README.md`. Inspect current source and the owning SoT before changing behavior. Preserve accepted tablet/desktop and device behavior unless an explicitly authorized change requires otherwise. Keep changes within scope, update the owner document, and validate both the changed behavior and adjacent accepted behavior. Stop for CPO/Lead Architect direction when evidence or authority is insufficient.

### Isolated development and remote review

The canonical GitHub repository is `josh-fairwayrefresh/fr-main`. Begin new
material work on a scoped branch from accepted `main` in an isolated workspace,
with clear sprint/feature goals, scope, readiness, and acceptance criteria.
Use the existing readiness, roles, and authorization rules in
[Kaizen](Continuous_improvement_Kaizen_1.0.md), not a competing approval process.
Development and testing use approved sandbox resources: a Git branch alone
does not isolate production data, credentials, infrastructure, or devices.

Within explicit authorization, develop, validate, commit, and push the branch;
expose in-progress work and evidence in a draft PR targeting `main`. Each
handoff identifies the repository, branch, full remote review commit SHA,
PR URL, validation evidence, and known gaps. The Lead Architect independently
examines actual remote changes and evidence at that commit. Address feedback
on the branch and identify subsequent commits for review.

Only validated, architecturally reviewed, CPO-accepted, explicitly
merge-authorized increments enter `main`. Publication is not acceptance and
does not authorize deployment, flashing, or production-data operations.
Spikes remain on their branches; separately accepted results may be
incorporated through this workflow. Give abandoned work a concise disposition
and preserve its branch as archived history; clean up disposable workspaces
and artifacts only within authorization. Main retains accepted product work,
necessary tests, canonical documentation, and concise operational records,
not disposable development artifacts.

### Field-safe readiness, validation, and release

Apply [Kaizen's existing Definition of Ready and role ownership](Continuous_improvement_Kaizen_1.0.md)
to each coherent increment: establish its product goal, scope, architectural
contracts and owners, dependencies, acceptance criteria, and material unknowns.
VSC owns ordinary design, decomposition, and verification within that scope;
these criteria do not create routine-step approval gates.

For a fielded product, make modularity and failure isolation testable. Identify
affected firmware, API, data, authorization, notification, and cached-client
contracts. Validate affected contracts in approved sandbox resources, including
old/new client-server combinations, concurrent/retried operations, partial
failures, and recovery. A module's passing tests alone do not establish an
end-to-end compatible increment. Report unavailable sandbox capabilities and
residual risks explicitly; do not substitute production experimentation.

The increment Definition of Done includes proportionate acceptance/regression
validation, exact source/configuration/artifact/environment traceability,
independent architectural review at the published commit, updated owner
documentation, residual risks, and CPO acceptance. Merge and operational
authorization remain separate. Release-specific rollout, observation, stop
conditions, and compatible recovery are owned by
[the Deployment Guide](DEPLOYMENT_GUIDE.md#field-safe-release-readiness).

### Approved service/reporting architecture — not yet implemented

The [opening-weekend targets](UX_SPECIFICATION.md#approved-opening-weekend-targets--not-yet-implemented)
require one backend-owned course-service capability for current state,
authoritative transitions/accounting, and request eligibility. State and audit
must stay consistent under concurrency, retries, response loss, and failures;
frontends operate explicit authorized interfaces rather than duplicate owners.
Reporting is a read-only consumer: its failure cannot block service controls
or actions on existing requests. Keep shared request/authentication,
notification, and correlated COMPLETE contracts compatible with fielded
devices; removal of schedule control must not change independent firmware
power/lifecycle behavior. No source implementation or production cutover is
established by this target. See [the backlog](feature_backlog.md) for blockers
and genuinely unresolved rate/coverage decisions.
