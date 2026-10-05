# Feature Backlog

This document is the canonical engineering feature backlog for Fairway Refresh.

Detailed truth for completed features belongs in the appropriate owner
documents. Completed work packages may remain in the Current Sprint table
through sprint closeout for status traceability; they are removed when they no
longer serve current sprint tracking and do not remain indefinitely as future
backlog items.

## Current Work: Minimal Runtime Candidate

As of 2026-10-05, `pilot/minimal-runtime` contains an uncommitted repository candidate, not a deployed or physically accepted release. Firmware is restricted to the bounded golfer lifecycle and active-window correlated COMPLETE poll/ACK; the backend requires device-plus-transaction-ID idempotency; Admin Health surfaces are removed. Detailed truth belongs to the firmware, provisioning, deployment, and UX owners. No candidate backend deployment or FRB-0002 flash has occurred.

Device Health is retired, not a current completed runtime or pending continuation of WP4/WP6. Future telemetry will be rebuilt independently around Voltaic V25/V50/V75; no hardware choice, protocol, schedule, thresholds, alerts, or UI design is established by this backlog. FRB-0001 is disassembled, not in active service, and has no compatibility requirement. FRB-0002 is the current physical validation device; reconstruction awaits the Prototype 3.2 versus anticipated Prototype 3.3 decision.

## Historical Sprint Record: Fleet Administration + Device Health (WP1–WP7)

The table preserves work-package completion and evidence at that sprint's checkpoints. Health implementation and former Health targets are now retired; the recorded test counts and production/physical acceptance are not validation of the minimal candidate. "Complete" below means historical closeout, not an active Health architecture.

| WP | Work Package | Status | Notes |
|----|---------------|--------|-------|
| WP1 | Current-state architecture inspection | Complete | Read-only investigation; findings reconciled into `docs/DEVICE_PROVISIONING_GUIDE.md`. |
| WP2 | Fleet data foundation (Customer -> Course -> Device) | Complete | Canonical Customer/Course/Device schema and centralized ID allocation (`fairway_backend/cloudrun_receiver/lib/fleet/`); see `docs/DEVICE_PROVISIONING_GUIDE.md`. Supersedes former backlog items "Multi-device provisioning," "Device-to-SIM registry," and "Course configuration." |
| WP3 | Per-device credentials spike | Complete | Per-device credential generation/verification and canonical identity implemented (`fairway_backend/cloudrun_receiver/lib/fleet/credentials.js`); Device schema normalized to remove duplicate `device_id`/`hole`/`label`/`active` fields (derived from the Firestore document ID, `location`, and `state` instead); Customer/Course hierarchy corrected to nested `customers/{customerId}/courses/{courseId}` storage with `customer_name`/`course_name` synchronized display copies on Device. Live migration completed: `customers/CUST-0001`, `customers/CUST-0001/courses/COURSE-0001`, and `devices/FRB-0001` (with issued production credential) now exist in production Firestore; legacy `devices/frb-0001` and `devices/pv4` removed; obsolete fleet-wide `FAIRWAY_DEVICE_KEY` Cloud Run environment variable removed. Physically validated end-to-end via a real button press producing a successful, correctly-attributed persisted request. See `docs/DEVICE_PROVISIONING_GUIDE.md` ("Existing Reference Device: FRB-0001") for the full record. Supersedes former backlog item "Device authentication." |
| WP4 | Device Health transport + persistence + autonomous reporting | Historical Complete; Health retired | The former `health_report`, latest/history persistence, effective configuration, scheduled two-attempt reports, and authoritative-time gating closed out with 56/56 backend tests and golfer-first source commit `fde1aade63ac62650709e7ea6aead6f817b71b58`. Primary golfer physical validation covered startup, immediate acknowledgement, SUCCESS within 15 s reaching the operator app, immediate re-press, and no historical lockout. Forced-FAILURE timing, repeated boots, Health concurrency, and PPK2 measurement remained source/desk-only at closeout. Health transport/configuration/persistence and runtime scheduling are removed in the candidate. Former missed-report/alert targets were WP6, never implemented. Historical acquisition/transport evidence remains in the firmware and provisioning owners. The 5580/6106 idle-power regression remains unresolved, not fixed by WP4 or retirement. |
| WP5 | Fleet/device administration UI | Complete | The CPO accepted the production-backed Admin experience and final ownership boundary. Production Hosting uses a dedicated Admin-only Cloud Run service with exact-origin CORS, server-enforced `admin: true`, allowlisted/redacted DTOs, and a dedicated runtime identity holding only `roles/datastore.user`. Approved Customer, Course, provisioning, atomic deployment assignment, lifecycle, SIM/comments, commissioning/service, read-only hardware/firmware identity with explicit provenance, read-only Health/history, and export workflows are implemented while preserving permanent IDs, complete unassignment in inventory, no deletion, and one-time credentials. Provisioning leaves system identity unknown; authenticated Device Health atomically promotes the build-owned hardware/firmware pair, while verified build/flash provenance bridges installed legacy images. Administrative hardware/firmware writes are rejected. The final backend suite passes 101/101; production auth/route/CORS checks, receiver ingestion deployment, Hosting artifact equality, and bounded provenance reconciliation pass without changing unrelated production facts. Role-specific Admin/Operator entry and production-origin details are owned by `docs/DEPLOYMENT_GUIDE.md`. Request Health Check and WP6 Alerts remain visibly deferred. |
| WP6 | Alert engine | Historical Pending; target retired | Former approved-but-unimplemented persistent alerts, missed-scheduled-report detection, and admin email/SMS targets remain historical planning in `docs/DEVICE_PROVISIONING_GUIDE.md`. They are not current work or requirements for the independent Voltaic rebuild. |
| WP7 | Second-device deployment spike | Complete | FRB-0002 was independently provisioned through the reusable utility, physically commissioned for golfer and Device Health behavior, and is currently deployed to Tony Lema Course / Hole 2. See `docs/DEVICE_PROVISIONING_GUIDE.md` ("Second Device: FRB-0002") for the full record. |

## Future Backlog

Recently completed pilot work: Final Golfer Button / LED UX was implemented in
`ce25e0f0b3f21fcc0af6a79e2c4aa5c2677d2c1f` and physically validated on
FRB-0002. Current implementation and validation truth is owned by
`docs/FIRMWARE_SPECIFICATION.md` and `docs/UX_SPECIFICATION.md`. Stage B2
COMPLETE was subsequently implemented and validated end-to-end; the remaining
repeat-press transport/persistence work is tracked separately below.

Cart Operator UX + notifications was completed and physically accepted in
production on 2026-10-01. The standards-based iPhone Home Screen Web Push path
uses course-scoped authorization, durable subscriptions, effective-once dispatch,
and request deep linking. FRB-0002 produced one visible Hole 2 notification; an
in-window duplicate produced no additional request or notification. Deployment
truth is owned by `docs/DEPLOYMENT_GUIDE.md`, and observable behavior is owned by
`docs/UX_SPECIFICATION.md`.

The replacement Option C Cart Operator application was CPO-accepted in the
functional sandbox and promoted to production on 2026-10-01 with oldest-first
queue focus, Complete/Cancel, Course-owned schedule and Suspend/Resume controls,
and normalized day/week/month operator metrics/history. Deployment and
observable behavior are owned by `docs/DEPLOYMENT_GUIDE.md` and
`docs/UX_SPECIFICATION.md`; it is complete and is not a future backlog item.

| Priority | Feature | Notes |
|----------|---------|-------|
| 1 | Independent Voltaic Device Health rebuild | Future work around Voltaic V25/V50/V75. Retired Health is not reused as active architecture; its on-demand Admin placeholder is removed. Scope and design require later approval; none is invented here. |
| 3 | Request/network robustness & remaining security hardening | Validate the candidate's required transaction ID, atomic retry idempotency, complete-response/request-ID success contract, and retained auth/service/COMPLETE behavior before rollout. Candidate implementation does not establish deployment or physical acceptance. Further hardening remains subject to approved scope. |
| 5 | Fleet Security Procedure & Credential Lifecycle | Credential compromise response, replacement/re-provisioning procedure, device credential revocation, administrator secret-handling rules, storage-policy hardening, and future consideration of routine rotation and stronger device-side protected storage (e.g. TF-M PS/ITS) if justified. |
| 6 | Watchdog + fault recovery / reset diagnostics | Incorporates former items: Watchdog and fault recovery; Reset reason logging. |
| 7 | Course analytics dashboard | Broader Admin/Course analytics remain deferred. The bounded Cart Operator day/week/month service summary and history are implemented and deployed as part of Option C. |
| 8 | Pilot readiness review | Final validation before pilot deployment. |
| 9 | Pilot-build validation / deployment | Resolve Prototype 3.2 (Adafruit 6106/5580) versus anticipated Prototype 3.3 Voltaic before reconstruction or broader rollout. Preserve recorded 5580/J4 physical evidence without requiring retired Health runtime or deciding future hardware here. Candidate deployment, FRB-0002 flash, and physical acceptance remain unperformed. |
| 10 | NCS 3.4 Upgrade — Post-Field Deployment | Do not begin until the current engineering/feature backlog is complete AND pilot units are deployed and operating successfully in the field. At that point: evaluate migration from NCS 3.1.1 to NCS 3.4; reassess nRF9151 Errata 36 / AP-protect handling using mechanisms supported by the newer SDK; preserve validated Fairway behavior during migration. |
| 11 | Whole-device idle-power regression investigation | CPO-observed: whole-device idle/dormant current increased by approximately an order of magnitude versus the LP 1.2 ~23.25 uA baseline, coincident with the approved pilot-build 5580/MAX17048 + Adafruit 6106 power-architecture integration (see `docs/HARDWARE_BOM.md`). Deferred and unresolved: cause not yet diagnosed, no replacement dormant-current target adopted. Not corrected or investigated as part of WP4 closeout. |
| 12 | Repeat-press transport and persistence | Transport firmware-local in-window repeat presses and atomically update the originating request's `repeat_press_count` and `last_repeat_press_at`. This is separate deferred work; Stage B2 COMPLETE is implemented and validated. |
| 13 | Pilot COMPLETE-check cadence reevaluation | Reevaluate the period between completion checks using pilot field evidence. The implemented 15-second active-window period is an explicit pilot hypothesis, not a permanently optimized production constant; active-window energy characterization is not an acceptance criterion for the Stage B2 implementation itself. |
Historical alternatives (TMUX1101, MAX4544, switched-SAADC/divider paths) remain archived and are not active backlog items for the current pilot-build architecture.
