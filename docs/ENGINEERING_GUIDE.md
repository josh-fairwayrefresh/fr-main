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

### Operator Service Control and Authoritative Intervals

The approved source increment implements the UX owner's
[Operator Service Control and Intervals](UX_SPECIFICATION.md#approved-operator-service-control-and-intervals--source-implemented-rollout-pending)
with one backend owner in
[service_control.js](../fairway_backend/cloudrun_receiver/lib/service_control.js):
Course state, generation-checked Resume/Suspend, migration, interval records,
audit events, and operation receipts. Its explicit authorized interfaces are
the operator service-state and transition routes and Admin per-Course cutover
route in [index.js](../fairway_backend/cloudrun_receiver/index.js). Reads and
button requests do not initialize Courses. The activation gate must be enabled
only after old backend revisions and write paths are fenced/drained. During
staged rollout, uncutover Courses retain read-only schedule eligibility;
requests transactionally read the Course so cutover and request acceptance
serialize. After atomic cutover, the v2 service state is authoritative and
schedule fields are removed. New Courses are initialized off.

The Course document owns `service_schema_version`, `service_status`,
`service_generation`, `service_coverage_started_at`, and the active interval
identifier. Nested `service_intervals` represent actual on-time,
`service_events` record migration baselines and actual transitions, and
`service_operations` hold idempotency receipts. The migration event has the
reserved `migration-baseline-v2` identity; operator event keys use the
disjoint `operator-<operation_id>` namespace and existing evidence is never
overwritten. A successful state change,
required evidence, interval adjustment, and receipt commit together. A
generation conflict is explicit; retrying the same operation replays its
receipt, while operation-ID reuse for a different intent is rejected. A
failed required audit/interval write aborts the state change.

Request acceptance uses the same Course transaction boundary after activation:
new v2 requests receive server-owned acceptance metadata; legacy eligibility
remains available only until explicit per-Course cutover. Existing request
COMPLETE/Cancel transactions serialize against service state, permit eligible
same-local-day completion while off, reject prior-local-day COMPLETE, and
preserve manual Cancel. Device request and correlated COMPLETE wire contracts
are unchanged. Frontend service actions use the explicit operation interface;
Admin schedule submission is rejected with an update instruction. Reporting in
[service_reporting.js](../fairway_backend/cloudrun_receiver/lib/service_reporting.js)
is read-only and cannot block controls or request actions. The separately
authorized `GET /api/v1/operator/service-state` reads only the assigned
Course's service state and validates its referenced open interval when service
is on; it does not depend on dashboard metric, history, or request queries.
The Operator UI uses this response for controls, so a dashboard/reporting
outage cannot hide or disable otherwise available service actions, while
inconsistent authoritative state is never presented as ready.

Active Cart Hours come only from authoritative intervals beginning at each
Course's atomic cutover; active migration baselines are explicitly not operator
Resume events. Reporting allocates actual elapsed intervals to course-local
Day, Monday-start Week, and Month, counts Completed Requests by completion
time, and retains received-time History attribution. Rates are period totals,
computed unrounded; known positive hours with zero completions yield zero.
Unknown, zero, partial, or incomplete hours yield “Rate unavailable” while
counts remain visible. No historical hours are reconstructed. The broader
Service History/Performance & Outcomes redesign remains out of scope.

This describes branch source. The separately authorized 2026-10-22 sandbox
deployment and synthetic Course cutovers are recorded in the
[Deployment Guide](DEPLOYMENT_GUIDE.md#operator-service-control-rollout-and-recovery);
no production deployment or Course cutover is claimed. Local validation,
remaining gaps, and the production rollout/recovery procedure are recorded
there as well. Independent firmware lifecycle and power contracts remain
unchanged.
