# Feature Backlog — Fairway Refresh Pilot 1.1

This document lists open or explicitly deferred work only. Completed behavior is
owned by its subsystem document; superseded and abandoned work is summarized in
`docs/archive.md`. Backlog entries do not authorize implementation or a product
change.

## Open and deferred work

| Item | Status / boundary |
|---|---|
| Cart Operator mobile acceptance | The responsive-layout release is live. Complete authenticated physical-phone/Safari checks at representative small and large phone widths and obtain CPO acceptance. Do not infer acceptance from build checks or unauthenticated route smoke tests. Preserve the accepted iPad and desktop experience. |
| Operator Service Control and Authoritative Intervals | Source corrections and authenticated per-Course cutover tooling are implemented; the Lead Architect source review passed, and the Hosting-only correction was reviewed at `434d074bab0d13feb5125e2935d6f182f5fd8aac`. The authorized 2026-10-22 sandbox deployment, synthetic Course cutovers, protocol/UI checks, and same-image v2 traffic failback are recorded in the [Deployment Guide](DEPLOYMENT_GUIDE.md#operator-service-control-rollout-and-recovery). A narrowly scoped 2026-10-22 production read confirmed the last stable revisions and legacy Course schema; current PR #4 cutover deletes fields those revisions require, so code-defect rollback is not safe. The proposed stable-source compatibility rollback plan is documented but not implemented or reviewed. It requires an immutable production Hosting version, a separate stable-source fallback artifact, sandbox proof, and a CPO decision on legacy schedule/Suspend semantics during rollback. No production mutation/cutover or CPO acceptance has occurred; the increment is not Done. Other gaps: no notifier/push delivery or physical LED observation, no remote prior-day COMPLETE case, and no shared-sandbox reporting-outage injection. See the [UX owner](UX_SPECIFICATION.md#approved-operator-service-control-and-intervals--source-implemented-rollout-pending) and [architecture owner](ENGINEERING_GUIDE.md#operator-service-control-and-authoritative-intervals). |
| Repeat-press transport and persistence | Firmware-local repeat behavior exists; transporting repeat events and persisting `repeat_press_count`/`last_repeat_press_at` against the originating accepted request is deferred. Keep one authoritative service request per demand window. |
| Production signing and artifact provenance | Open security/release concern, not unfinished pilot recovery. Synthetic tests and separately authorized completed recoveries used NCS's insecure debug key. Establish approved signing, installed trust-anchor compatibility, and exact artifact provenance before future release promotion; completed one-time exceptions are not standing permission. See [details](#signing-and-provenance). |
| Orphaned user-access cleanup | Nonblocking post-pilot maintenance. Provide an explicit, auditable administrator-controlled way to review and remove an Auth-orphaned `user_access/{uid}` record without affecting valid users. |
| Idle-power correction and solar/pack autonomy | Current VBUS field power triggers the retained service-awake policy. Correct/validate the field-idle policy and measure consumption before making runtime or solar-sufficiency claims; preserve service debug access and power isolation. See [details](#power-and-autonomy). |
| COMPLETE polling cadence review | Reevaluate the active-window polling period using field evidence. FRB-0006's intermittent TLS timeouts occurred during 15-second polling, but later COMPLETE delivery and acknowledgement succeeded without firmware/configuration changes; cadence causality is unproven. No cadence change is authorized by this entry. |
| Request/network reliability review | FRB-0006 showed LTE registration status `90` then `2` then `5`, TLS connect/handshake timeouts `-116`, and later successful button/COMPLETE operation without intervening changes. Correlate registration, signal, TLS-stage, HTTP, and LED-state evidence before selecting a fix; a shared modem/network transport issue is plausible but unconfirmed. Preserve the accepted 15-second transaction budget unless the CPO approves a change. See `docs/DEPLOYMENT_GUIDE.md`. |
| Watchdog and reset diagnostics | Evaluate fault recovery and reset-reason diagnostics without changing current runtime behavior until scoped and approved. |
| Broader course analytics | Course-level analytics beyond the accepted Cart Operator day/week/month service summaries remain deferred. |
| NCS 3.4 migration evaluation | FRB-0001 through FRB-0005 have CPO-confirmed physical validation; FRB-0006 reliability remains unresolved, so the full-fleet field-operation gate is not met. Evaluate migration from NCS 3.1.1 only as a separately authorized task; assess Errata 36/AP-protect and power-policy implications before changing the accepted build baseline. |
| Active queue truncation | Confirmed source defect; older open work can disappear behind newer closed requests. Blocks complete-queue acceptance; [details](#active-queue-truncation). |
| Broader Service History retrieval and calendar navigation | Full historical retrieval, selected-period history navigation, and complete-queue retrieval remain outside the Operator Service Control increment. Preserve received-time attribution and do not label capped/incomplete history as complete. [Details](#reporting-integration-and-deferred-history-work). |
| Notifier source/deployment and sandbox-delivery gap | Established deployment divergence; do not claim delivery-time entitlement/preference enforcement or sandbox delivery acceptance. [Details](#notification-release-gap). |
| Branch protection and CI | October 21 PR #2 inspection found no required checks/protections; no tracked GitHub Actions workflow. Protection/CI design and setup need a separately authorized increment. [Details](#review-enforcement-gap). |
| Provisioning policy and automation | Transactional allocation and prepared rotations exist; manufacturing, compromise/revocation, secret delivery, and end-to-end automation remain incomplete. [Details](#provisioning-policy-and-automation). |

## Material readiness items

The remaining items below distinguish accepted-main evidence from the current
feature-branch implementation and do not imply deployment. No production/device
investigation or rollout was performed. "Blocks" identifies an affected
acceptance/release claim, not a newly asserted whole-product shutdown.

### Active queue truncation

- **Evidence/mechanism:** [main.jsx](../fairway_webapp/cart_operator_dashboard/src/main.jsx)
  retrieves latest 100 requests per course and slices the merged feed to 100.
  [OperatorApp.jsx](../fairway_webapp/cart_operator_dashboard/src/OperatorApp.jsx)
  filters/sorts active work after retrieval. Newer closed work can crowd older
  active work out; ordering the reduced set oldest-first does not recover it.
- **Impact/blocking:** Operators can miss actionable requests; blocks
  complete-queue correctness at volume and is independent of responsive CSS.
  Field prevalence was not measured in this documentation increment.
- **Durable outcome/dependencies/acceptance:** Design complete authorized
  active retrieval with bounded/paginated closed history, consistent with
  Firestore rules/indexes and multi-course entitlements. Test more than 100
  newer closed rows hiding an old open row, more than 100 active rows,
  multi-course selection, deep links, and COMPLETE/Cancel with live updates.
  No client-side re-sort or larger arbitrary cap is an accepted fix.

### Operator Service Control implementation and release boundary

- **Accepted-main evidence:** At the implementation base
  `229c27ce6b5920aaef5f6c1488dcdb3d477f4168`, service state mutations and
  reporting shared failure paths, service audit writes were not atomic with
  state, eligibility used schedules, and reporting used rolling periods.
- **Feature-branch source:** The branch adds the backend-owned state/transition/
  eligibility capability, independent service-state and dashboard interfaces,
  explicit gated per-Course cutover, transactional request acceptance,
  interval-based local-calendar reporting, and updated operator/Admin
  behavior. Details and requirements belong to the [UX](UX_SPECIFICATION.md#approved-operator-service-control-and-intervals--source-implemented-rollout-pending)
  and [Engineering](ENGINEERING_GUIDE.md#operator-service-control-and-authoritative-intervals)
  owners. The Lead Architect review passed at `8d5a8e137c38196dd446e49b54b84db3bb0a74fa`;
  subsequent authenticated cutover-preflight tooling and label/documentation
  changes require review at their final SHA. The Admin UI now invokes the
  backend-owned cutover endpoint with a read-only preflight, explicit Course
  confirmation, target validation, and idempotent retry behavior. Local
  validation does not establish remote deployment or cutover behavior.
- **Release boundary:** No remote sandbox deployment, fixture mutation,
  production inspection, production migration, or production rollout is
  authorized or claimed. Read-only inventory after local reauthentication
  verified the current Cloud Run revisions/digests/traffic, invocation
  settings, backend gate configuration, Hosting release/predecessor, and
  Firestore fixture relationships. Existing synthetic-marked access records
  map to a non-synthetic Course; the synthetic-marked Course is assigned to
  field-tested FRB-0002. Neither is suitable. No v2-compatible deployed
  recovery pair exists. Follow the bounded fixture, fencing, activation,
  per-Course cutover, refresh, and recovery proposal in the
  [Deployment Guide](DEPLOYMENT_GUIDE.md#operator-service-control-rollout-and-recovery).
  Do not change credentials or IAM as a workaround.

### Reporting integration and deferred history work

- **In-scope reporting contract:** Active hours derive only from authoritative
  interval overlaps in course-local Day, Monday-start Week, and calendar
  Month. Completed Requests are attributed by `completed_at`; rates use
  period totals, unrounded values, and counts remain visible if hours or
  request coverage is incomplete. A retrieval cap or missing completion time
  marks request coverage incomplete. Known positive hours with zero
  completions yield rate 0; zero, unknown, partial, or incomplete hours yield
  “Rate unavailable.” These rules are settled in the [UX owner](UX_SPECIFICATION.md).
- **Deferred work:** The existing request/history retrieval limit and
  last-100 closed history remain; the full historical navigation and complete
  Service History redesign are not implemented in this increment. The source
  surfaces incomplete request coverage rather than claiming a complete rate.
  The independent [active queue truncation](#active-queue-truncation) remains
  an open correctness issue for actionable work at volume.

### Notification release gap

- **Evidence/mechanism:** [Deployment Guide](DEPLOYMENT_GUIDE.md#cart-operator-web-push)
  records source delivery-time entitlement/preference checks absent from
  last-inspected notifier `fairway-request-notifier-00003-mah` (source archive
  generation `1790840128801876`), and no sandbox notifier/VAPID deployment.
  This is established source/deployment divergence, not evidence of a
  specific unauthorized notification incident.
- **Impact/blocking:** Revocation/preference delivery claims are not
  production-verified; local tests cannot prove actual sandbox delivery.
  Blocks release acceptance of changed delivery filtering, not request
  persistence or Cart access.
- **Durable outcome/dependencies/acceptance:** Separately authorize a
  sandbox-capable notifier/delivery configuration and matched reviewed
  release. Depend on environment/IAM/secret isolation and preference/access
  contracts. Verify enabled, disabled, revoked, retried, failed, and
  deep-linked delivery without duplicate dispatches, including missing-parent
  descendant handling. Record exact source/configuration/revision and
  physical delivery coverage; no production deployment is authorized here.

### Review enforcement gap

- **Evidence/uncertainty:** October 21 PR #2 merge inspection found no
  required status checks or main protection; the accepted tree has no tracked
  GitHub Actions workflow. Remote policy was not re-inspected here.
- **Impact/blocking:** The accepted review/merge workflow currently depends
  on procedural compliance, not demonstrated enforced CI. This does not
  invalidate completed acceptance; blocks any claim of enforced gates.
- **Durable outcome/dependencies/acceptance:** CPO/Lead Architect prioritize
  a minimal required-check/protection design appropriate to documentation,
  frontend, backend, and firmware changes. Validate check discovery,
  failure-blocking, authorized merge permissions, sandbox-only tests, and
  credential isolation in a separately authorized configuration increment.

### Signing and provenance

- **Evidence/uncertainty:** [Firmware owner](FIRMWARE_SPECIFICATION.md)
  and [provisioning owner](DEVICE_PROVISIONING_GUIDE.md) distinguish the
  original milestone, incorporated tempfix, recovery manifests, and NCS debug
  signatures. Registry `firmware_generation` is incomplete/inconsistent;
  it is not installed-image identity. Original installed anchors were not
  established by synthetic tests; completed replacements had explicit
  one-time authorization.
- **Impact/blocking:** Debug-key verification proves consistency, not
  production trust. Blocks future secure release promotion; it does not
  reopen completed recovery or negate CPO-confirmed physical validation.
- **Durable outcome/dependencies/acceptance:** Approve signer/key custody,
  artifact/config/source identity, per-device installed trust-anchor records,
  compatible update/recovery, and secure distribution. Validate signatures,
  wrong-key rejection and mixed-version recovery with synthetic artifacts
  before any separately authorized device operation. Reuse immutable existing
  manifests; do not publish credential-bearing images.

### Power and autonomy

- **Evidence/mechanism:** [power_policy.c](../samples/fairway_power_sandbox/src/power_policy.c)
  enables the awake keeper and disables requested PSM when VBUS is present.
  Current field supply also enters VBUS. The legacy policy does not
  distinguish field VBUS from USB service power. Actual field idle consumption,
  pack runtime, and solar energy balance have not been measured.
- **Impact/blocking:** Prevents claims of qualified low-power field operation,
  autonomous runtime, or demonstrated solar sufficiency; solar charging is
  only the operating assumption. It is not proof of a particular field outage.
- **Durable outcome/dependencies/acceptance:** Separately scope field-idle
  correction with Errata-36/debug-service safety and electrical qualification,
  then measure idle/transaction/COMPLETE behavior at explicit supply boundaries.
  Assess V25/V50/V75 energy budget with realistic solar/exposure assumptions,
  loading, losses, and service patterns. Preserve 15-second UX, request/COMPLETE
  contracts, and mutually exclusive USB/field power; require compatible recovery
  and measured results before autonomy claims. Need CPO operating/runtime
  targets and prioritization; do not infer wiring from the incomplete BOM.

### Provisioning policy and automation

- **Evidence/known versus missing:** [Provisioning owner](DEVICE_PROVISIONING_GUIDE.md)
  documents centralized transactional identity allocation, one-time issuance,
  prepared rotation with version guards, device-specific build verification,
  and completed recoveries. These exist; manufacturing serialization,
  routine rotation/revocation and compromise response, secure secret delivery,
  and automation beyond the allocator/manual workflow remain deferred.
- **Impact/blocking:** Manual steps and unagreed policy limit repeatable fleet
  provisioning and compromise response. Blocks scale/automation readiness,
  not a claim that already commissioned devices lack identity or credentials.
- **Durable outcome/dependencies/acceptance:** Obtain CPO policy decisions on
  manufacturing/ownership handoff, revocation/compromise and custody, then
  scope automation against the existing single-active-credential contract.
  Depend on signing/provenance, secure input/artifact handling and compatible
  recovery. Validate concurrent allocation, partial issuance, response loss,
  wrong-device input, prepare/cancel/activate retry, secret redaction, and
  field-compatible recovery. No bulk credentials or fleet operations are
  authorized by this entry.

## Archived or abandoned work

Superseded milestones, abandoned features, and temporary diagnostic work are
not active backlog items. See `docs/archive.md` for concise historical
disposition and lessons.
