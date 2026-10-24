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

### Persistent cart inventory increment — sandbox only

The CPO resolved readiness on 2026-10-23 and authorized a single coherent
increment from main `08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`: persistent
nonnegative quantities, whole-unit sales, Customer operational staff, immutable
inventory audits and session-specific shift close. This is sandbox-only work,
not merge, production, firmware, physical-device or production-data authority.
Product requirements are owned by
[the UX specification](UX_SPECIFICATION.md#persistent-cart-stock-staff-audits-and-shift-close--sandbox-increment).

Extend the existing inventory owner under the Course; one shared inventory is
the only supported scope. Keep its storage boundary localized so a future
Course-to-Cart hierarchy does not require competing balances now. Staff IDs
belong to a Customer, not Firebase Auth. Existing `user_access` remains the
sole login/Admin/Course entitlement authority. A small centralized operational
role policy initially permits both Cart Operator and F&B Management equally.

Balance/availability changes and their immutable attributed historical record
form one transaction. Missing quantities mean zero without moving legacy tiles.
Sales apply deltas against current On Cart stock; excessive sales reject, never
clamp or go negative. Sold Out always has zero quantity. Moving either On Cart
or In Inventory to Sold Out with remaining stock confirms a sale
of exactly the displayed units, using the same sale operation and idempotency
owner, with an expected stock revision checked inside its transaction. Normal
quick sales without this optional precondition retain concurrent delta semantics.
Stale remaining-sale confirmations require explicit refresh/reconfirmation;
positive stock in either source cannot bypass the sale via availability-only
writes. The shared sale operation accepts a Sold Out target only with an exact
remaining-unit count and expected stock revision; that bounded intent also permits
In Inventory as a source without allowing ordinary quick sales off cart.
Zero stock can change availability without a zero-unit sale.
Absolute stock edits use expected stock revisions.
Metadata autosaves cannot carry stale availability into this contract. Movement
to In Inventory preserves quantity; no restaurant balance or automatic-zeroing
adjustment exists. Stock totals and new audit snapshots select On Cart only,
binding confirmed immutable data to a coherent inventory revision. Historical
audits retain their original scope and contents.
An adjustment to zero only applies the On Cart-to-Sold Out transition for
On Cart products; restaurant-held stock remains In Inventory. Drag-and-drop
and selectors share the same attributed stock endpoint, including staff
selection/resumption and expected revisions. Conflicted moves refresh the
confirmed view before retry, rather than leaving an unrepeatable stale card.
One Pointer Events interaction owns mouse/touch/pen dragging, replacing native
HTML drag-and-drop. Pointer capture, a movement threshold and coordinate-based
column hit testing handle nested targets consistently. Only the visible
product-name/grip reserves touch gestures; other card areas retain scrolling.
Viewport-edge scrolling supports stacked columns. Cancellation and scope
changes clear the interaction; a completed drop calls the same availability
intent as the selector, including the remaining-sale confirmation. Adjacent
columns stretch to the full grid-row height so lower-tile horizontal drops
have a target even when the destination contains fewer products. Accepted
mouse drag regions suppress competing native text dragging. Browser-generated mouse/touch regression evidence is
distinct from synthetic handler tests and physical iPad/Safari acceptance.

The browser's current-view Excel (.xlsx) exporter consumes the same confirmed inventory
snapshot, visible-product filters and displayed Course-wide tally as the UI;
it has no mutation/shift API. Bootstrap/snapshot responses expose canonical
Customer names and Course timezone for report context. Exports explicitly name
their filter scope; pending or unresolved writes disable them, and changed
snapshot/submission context during generation rejects the download explicitly.
The ExcelJS writer is loaded only for export, writes untrusted text as literal
string cells and whole units as numbers, and owns readable report styling and
one-page landscape print settings. Its scoped UUID override uses the patched
CommonJS-compatible version; unrelated Firebase dependencies are unchanged.
One reusable
quantity input supplies direct entry and 48-pixel minus/plus buttons to stock
dialogs; stepping changes only the draft, never confirms a transaction.

Operational context is scoped to authenticated UID, browser operator session,
Customer and Course. One open shift per session/Course allows staff correction
before activity, requires close before a different operator after activity,
and closes only with a durable submitted USD total. Both selected staff
snapshots and authenticated UID are recorded. Stock/history commit together;
stable operation identities make lost-response retries and shift close
idempotent. Uncertain outcomes remain explicit and recoverable, not success.
Completed stock/audit submissions keep a synchronous intent guard until their
dialog closes, including post-commit refresh; late/repeated submit callbacks
cannot start a new attribution request. Session forms ignore submission when
neither selection nor close is open. A successful close clears chooser/context
and invalidates older in-flight session reads so they cannot resurrect the
closed identity. No new name prompt occurs until a subsequent attributed action.
The CPO's 2026-10-24 follow-up supersedes manual publication: the anonymous
menu transactionally reads the same committed Course inventory, selecting only
active On Cart products through one public-product allowlist (including nested
price projection). There is no second mutable menu projection or publication
pointer. Old published snapshots/metadata remain historical and unmodified,
not a serving source. Existing slug mappings and branded URLs are preserved;
other configured Course slugs use the same public route. Anonymous responses
are no-store; the public UI fetches only on page open/manual reload (or explicit
error retry), with no interval/focus refresh. Categories initially collapse and
expand only by selection. Scope-change/unmount cleanup aborts superseded
requests so older responses cannot replace current state. Retired
preview/publish endpoints explicitly return 410 without mutation or shift
activity, directing cached clients to refresh. This changes sandbox source,
not production release authority. No internal stock/staff/shift/audit data
enters the golfer menu.

K-001/K-002 readiness uses the CPO's resolved transitions rather than inventing
new behavior. K-003 assigns each capability one owner; K-004 focuses evidence
on lost responses, concurrency, authorization, audit revision coherence and
unchanged adjacent accepted behavior. No speculative permissions framework,
POS, offline queue, multiple carts, transfers or trend UI is introduced.

### Independent service groups sandbox increment

The `feat/independent-service-groups` increment is based on PR #8's
Architect-reviewed head `d33f86091673149479148c9d44d6582c95d7e105`, rather
than merged main, by explicit CPO authorization. It retains queue selection,
tab visibility, and their verification evidence. On 2026-10-23 the CPO accepted
the queue/category update and authorized merging PRs #7, #8, and #9 in
dependency order and production deployment after the Amenity Areas refinement.
PRs #7, #8, and #9 were merged in that order and published from merged main
`b3e1a53c47f5ffc52389666517876c5b1634e07d` on 2026-10-23; exact runtime
identities and verification are owned by the Deployment Guide. Production
verification is read-only; no request generation, reassignment, service
toggle, firmware, or physical-device action is authorized.

The existing `lib/course_service.js` owner resolves both groups. On-course
retains Course `service_suspension` and `service_events`; Amenity Areas uses
Course `on_premise_service.active` (missing means OFF) and a separate
`on_premise_service_events` stream under the same Course. The existing
operator Resume/Suspend endpoints accept optional `service_group`, defaulting
to `on_course` for cached clients. Transactions update only the chosen group's
state and record actual state changes; retried same-state actions do not add
events. This preserves independent concurrent toggles without modifying
reporting's On-course event queries or prior-event boundary.

Amenity Areas replaces the former On-premise / Driving Range display names throughout Admin,
Cart Operator, accessible labels, and confirmation prompts. Existing
`on_premise` identifiers remain unchanged; this is a presentation change,
not a data/API migration. Each category's short Suspend/Resume action and
status align beneath its headline in adjacent bounded control sets.

`fairway_backend/cloudrun_receiver/lib/service_categories.json` is the single
authoritative category definition and shared data interface. It separates
stable `id` from editable `display_name` for the two existing categories.
Backend service validation derives its identity constants from this file;
the frontend `src/lib/serviceCategories.mjs` exposes the same definitions to
Admin options and all generated Cart category text. Do not add parallel label
maps or category-name conditionals. Change display wording only in this owner
and rebuild/publish affected consumers; stored IDs, service fields/events,
assignments, and request snapshots are not renamed. No management screen,
runtime category configuration, additional categories, or framework is added.

Admin assignment/state APIs validate the device `service_group` enum; missing
device fields resolve to `on_course`. The Receiver uses only the authenticated
stored group for eligibility and snapshots it on new requests. Existing
requests and COMPLETE correlation are unaffected by reassignment. Assigned
devices, not requests, determine the dual-control read model. No schedules,
expiry, state migration, or firmware changes are introduced. The CPO's
2026-10-23 reporting decision for PR #9, owned by the UX specification,
accepts equal counting of both groups' completed requests in the existing
Course-wide KPIs against On-course-only Active Cart Hours. Cancelled requests
do not count as completions; the shared queue and History include both
groups. Calculations remain unchanged; no group filters, separate KPIs, or
reporting UI are introduced.

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

### CPO_stats_fix architecture — accepted and deployed

CPO_stats_fix keeps one operational owner for Course service state and
operator transitions. Resume sets service ON and Suspend sets it OFF; this
state is independent of schedules and expiry; only Resume changes persistent
OFF back to ON. Request eligibility reads that same state. Reporting consumes
the transition and request records and must never be a prerequisite for
accepting requests.

The Cart UI presents the reporting capability;
[the reporting module](../fairway_backend/cloudrun_receiver/lib/service_reporting.js)
owns KPI calculation and period aggregation. The production Admin
implementation removes Beverage Service Schedule from active Admin controls
and Course configuration APIs. It ignores schedule fields in older cached
payloads and does not read or write legacy schedule fields; existing stored
values remain untouched.
No schedule migration or PR #4 cutover machinery is introduced. Existing
request actions, permissions, notifications, device protocol, and firmware
remain unchanged. CPO_stats_fix was accepted and deployed to production on
2026-10-22; the release record documents retained pre-release identities,
the rollback behavior difference, and the custom-domain sign-in limitation.
The
[UX owner](UX_SPECIFICATION.md#cpo-stats-fix-reporting-requirements) owns
detailed behavior and acceptance requirements.
