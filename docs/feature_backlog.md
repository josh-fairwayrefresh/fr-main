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
not as open backlog items. The CPO-reported notification field operation on
2026-10-30 closed that incident; deployment and evidence limits are recorded
in the [notification production baseline](DEPLOYMENT_GUIDE.md#notification-recovery-production-baseline-2026-10-30).
Separate physical-phone/Safari mobile-layout and network-reliability work below
remain open.

The CPO-accepted persistent inventory increment was merged through PR #12 and
released to production Admin/Hosting on 2026-10-26. It is no longer open backlog
work; accepted behavior and recovery evidence are owned by the UX specification
and [release record](DEPLOYMENT_GUIDE.md#persistent-inventory-production-release--2026-10-26).

PR #13's authorized production release now closes active-queue promotion and
the notifier source/deployment divergence. Current shared request/notification
owners, the active-query index and exact production identities are recorded
in the [Driving Range release record](DEPLOYMENT_GUIDE.md#driving-range-production-integration-and-controlled-release--2026-10-26).
The CPO separately authorized activation on 2026-10-30. The existing
production QR edition was confirmed against the supplied installed-sign PDF;
one controlled Bay 1A request was notified and completed through the normal
operator workflow. This operational validation did not change source or QR
routing. See the [activation record](DEPLOYMENT_GUIDE.md#driving-range-activation-and-installed-qr-production-validation-2026-10-30).
This does not close separate Cart Operator mobile acceptance or independent
physical print/laminated-sign scan acceptance.

## Open and deferred work

| Item | Status / boundary |
|---|---|
| Administrator request reporting exclusion | CPO-tested in the QR sandbox and deployed to production on 2026-11-02 (see the Deployment Guide release record). Remaining: production use by a global Admin; no production request has been excluded by engineering. |
| Cart Operator mobile acceptance | The responsive-layout release is live. Complete authenticated physical-phone/Safari checks at representative small and large phone widths and obtain CPO acceptance. Do not infer acceptance from build checks or unauthenticated route smoke tests. Preserve the accepted iPad and desktop experience. |
| Repeat-press transport and persistence | Firmware-local repeat behavior exists; transporting repeat events and persisting `repeat_press_count`/`last_repeat_press_at` against the originating accepted request is deferred. Keep one authoritative service request per demand window. |
| Production signing and artifact provenance | OTA releases now use the CPO-custodied encrypted production ECDSA-P256 key (fingerprint `sha256:be1c1257…f88eb`), independent verification, exact-hash CPO acceptance and remote-backed release records; see the Deployment Guide. Remaining: per-device installed trust-anchor records beyond FRB-0005, and reconciliation of completed fleet recoveries that used NCS's insecure debug key. Completed one-time exceptions are not standing permission. See [details](#signing-and-provenance). |
| OTA beyond the Prototype 4.0 baseline | Prototype 4.0 is CPO field-validated on FRB-0005 (`OTA-1.0-r4`, nightly install 2026-11-11). Open: fleet OTA capability and per-device trust-anchor records for other units (none verified), rollback and interrupted-download recovery, and a post-`1.0.0+4` request/COMPLETE check. Superseded r3 images retain the 32-bit discovery defect and must not be reassigned. See the [Alignment Register entry](DEPLOYMENT_GUIDE.md#prototype-40--cpo-field-validated-stable-firmware-baseline-2026-11-11). |
| Routine PV8-free USB service access | CPO requirement (2026-11-10): USB maintenance must not require PV8. Current low-power firmware powers down the debugger in normal mode; each FRB-0005 service session required a PV8-held USB power application. Needs a CPO-approved hardware/firmware design that preserves field low-power behavior and protected storage. See the [Firmware Specification](FIRMWARE_SPECIFICATION.md#unresolved-routine-usb-debugger-access). |
| Confirmation sequence after clean reinstall | A clean USB install restarts the protected running-image sequence at 1; the backend rejects that report (409) if sequence 1 already identifies different firmware, until a higher sequence arrives. Define an authorized reconciliation for clean reinstalls; the stale-evidence guard is unchanged. |
| Customer Onboarding & Administration (Increment 2) | Architecturally reviewed commit `71e0917` (readable Add course, creation-only Cart/Driving Range operation type, Admin user creation, password reset and deactivation) is merged into `main` (merge `83ed53b`); **not deployed**. Production deployment needs separate CPO authorization of both the Admin backend (`fairwayAdmin`, which changes operator/Admin token verification to revocation-checked) and the Hosting frontend; until then production Admin keeps the earlier behavior, including the unreadable Add course label. Accepted limitation (CPO, 2026-11-11, current pilot): the Cart request list reads Firestore directly, so a deactivated user's already-issued ID token keeps Firestore read access until it expires (at most one hour); no implementation change is required. Excluded from this increment: Customer/Course archival, QR bay UI, `service_days` UI, email invitations and self-service password recovery. [Contract](DEPLOYMENT_GUIDE.md#wp5-production-fleet-administration). |
| Orphaned user-access cleanup | Nonblocking post-pilot maintenance. Provide an explicit, auditable administrator-controlled way to review and remove an Auth-orphaned `user_access/{uid}` record without affecting valid users. |
| Idle-power correction and solar/pack autonomy | Fleet Pilot 1.1 units still run the retained VBUS service-awake policy. The FRB-0005 low-power development line (carried by the OTA images) removes the unconditional awake hold and powers down the debugger in normal mode; it is not a fleet baseline. Measure consumption and runtime before autonomy or solar-sufficiency claims; preserve service access and power isolation. See [details](#power-and-autonomy). |
| COMPLETE polling cadence review | Reevaluate the active-window polling period using field evidence. FRB-0006's intermittent TLS timeouts occurred during 15-second polling, but later COMPLETE delivery and acknowledgement succeeded without firmware/configuration changes; cadence causality is unproven. No cadence change is authorized by this entry. |
| Request/network reliability review | FRB-0006 showed LTE registration status `90` then `2` then `5`, TLS connect/handshake timeouts `-116`, and later successful button/COMPLETE operation without intervening changes. Correlate registration, signal, TLS-stage, HTTP, and LED-state evidence before selecting a fix; a shared modem/network transport issue is plausible but unconfirmed. Preserve the accepted 15-second transaction budget unless the CPO approves a change. See `docs/DEPLOYMENT_GUIDE.md`. |
| Watchdog and reset diagnostics | Evaluate fault recovery and reset-reason diagnostics without changing current runtime behavior until scoped and approved. |
| Driving Range Request Performance Report | CPO-requested 2026-11-03. A separate Admin PDF report for Driving Range (QR) requests, distinct from the Cart Request Performance Report (button requests). Scope, metrics, layout and data sources are not yet defined; requires CPO review of a design before implementation. No implementation is authorized by this entry. |
| Broader course analytics | Course-level analytics beyond the accepted Cart Operator day/week/month service summaries remain deferred. |
| NCS 3.4 migration evaluation | FRB-0001 through FRB-0005 have CPO-confirmed physical validation; FRB-0006 reliability remains unresolved, so the full-fleet field-operation gate is not met. Evaluate migration from NCS 3.1.1 only as a separately authorized task; assess Errata 36/AP-protect and power-policy implications before changing the accepted build baseline. |
| Branch protection and CI | October 21 PR #2 inspection found no required checks/protections; no tracked GitHub Actions workflow. Protection/CI design and setup need a separately authorized increment. [Details](#review-enforcement-gap). |
| Provisioning policy and automation | Transactional allocation and prepared rotations exist; manufacturing, compromise/revocation, secret delivery, and end-to-end automation remain incomplete. [Details](#provisioning-policy-and-automation). |

## Material readiness items

Evidence below is accepted source at
`11feb67696e69e504592908a8ffafcdcb7271bd0` or explicitly dated evidence in
the linked owner, including the authorized PR #13 production release.
These form a queue for prioritization, not implementation authorization.
"Blocks" identifies an affected acceptance/release claim, not a newly asserted
whole-product shutdown.

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

- **Evidence/mechanism:** The accepted Pilot 1.1 policy enabled the awake
  keeper and disabled requested PSM when VBUS is present, and current field
  supply also enters VBUS. The current
  [power_policy.c](../samples/fairway_power_sandbox/src/power_policy.c)
  (FRB-0005 development line) removes that unconditional hold and selects PV8
  service mode explicitly; see the Firmware Specification. The legacy policy does not
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
