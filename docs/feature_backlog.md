# Feature Backlog — Fairway Refresh Pilot 1.1

This document lists open or explicitly deferred work only. Completed behavior is
owned by its subsystem document; superseded and abandoned work is summarized in
`docs/archive.md`. Backlog entries do not authorize implementation or a product
change.

The CPO confirmed the production FRB-0006 test passed and accepted the released
queue selection and independent Amenity Areas controls on 2026-10-23.
That increment and its reporting/service-control prerequisite are closed;
acceptance and publication evidence are retained in the
[existing release record](DEPLOYMENT_GUIDE.md#cpo-production-acceptance-and-closeout--2026-10-23),
not as open backlog items. This does not close the separate queue-volume,
physical-phone/Safari, notification, or network-reliability work below.

## Open and deferred work

| Item | Status / boundary |
|---|---|
| Persistent cart stock / sales / staff / audits / shift close | CPO accepted current functionality on 2026-10-24; Inventory presentation and automatic current On Cart golfer-menu follow-ups remain in sandbox review within PR #12 on `feat/persistent-cart-inventory`, based on main `08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`. The automatic menu supersedes manual publication. Requirements and superseding nonnegative-stock/quantity-preserving transitions are owned by the [UX specification](UX_SPECIFICATION.md#persistent-cart-stock-staff-audits-and-shift-close--sandbox-increment). Production data/deployment, merge, firmware and physical-device actions are not authorized. Sandbox publication and review evidence are owned by the Deployment Guide. |
| Cart Operator mobile acceptance | The responsive-layout release is live. Complete authenticated physical-phone/Safari checks at representative small and large phone widths and obtain CPO acceptance. Do not infer acceptance from build checks or unauthenticated route smoke tests. Preserve the accepted iPad and desktop experience. |
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
| Notifier source/deployment and sandbox-delivery gap | Established deployment divergence; do not claim delivery-time entitlement/preference enforcement or sandbox delivery acceptance. [Details](#notification-release-gap). |
| Branch protection and CI | October 21 PR #2 inspection found no required checks/protections; no tracked GitHub Actions workflow. Protection/CI design and setup need a separately authorized increment. [Details](#review-enforcement-gap). |
| Provisioning policy and automation | Transactional allocation and prepared rotations exist; manufacturing, compromise/revocation, secret delivery, and end-to-end automation remain incomplete. [Details](#provisioning-policy-and-automation). |

## Material readiness items

Evidence below is accepted source at
`11feb67696e69e504592908a8ffafcdcb7271bd0` or explicitly dated evidence in
the linked owner. No new production/device investigation was performed.
These form a queue for prioritization, not implementation authorization.
"Blocks" identifies an affected acceptance/release claim, not a newly asserted
whole-product shutdown.

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
