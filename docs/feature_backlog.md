# Feature Backlog

This document is the canonical engineering feature backlog for Fairway Refresh.

Detailed truth for completed features belongs in the appropriate owner
documents. Completed work packages may remain in the Current Sprint table
through sprint closeout for status traceability; they are removed when they no
longer serve current sprint tracking and do not remain indefinitely as future
backlog items.

## Current Sprint: Embarrassingly Small Runtime

Current scope retains Prototype 3.2 hardware and golfer UX, scoped-awake execution, authenticated bounded HTTPS, the local five-minute demand window, exact correlated COMPLETE, Cart Operator behavior, and fleet/lifecycle/provisioning Admin. Device Health firmware, ingestion, persistence, Course scheduling, and Admin surfaces are retired. Voltaic/Prototype 3.3 work is outside this sprint.

| WP | Work Package | Status | Notes |
|----|---------------|--------|-------|
| WP1 | Current-state architecture inspection | Complete | Read-only investigation; findings reconciled into `docs/DEVICE_PROVISIONING_GUIDE.md`. |
| WP2 | Fleet data foundation (Customer -> Course -> Device) | Complete | Canonical Customer/Course/Device schema and centralized ID allocation (`fairway_backend/cloudrun_receiver/lib/fleet/`); see `docs/DEVICE_PROVISIONING_GUIDE.md`. Supersedes former backlog items "Multi-device provisioning," "Device-to-SIM registry," and "Course configuration." |
| WP3 | Per-device credentials spike | Complete | Per-device credential generation/verification and canonical identity implemented (`fairway_backend/cloudrun_receiver/lib/fleet/credentials.js`); Device schema normalized to remove duplicate `device_id`/`hole`/`label`/`active` fields (derived from the Firestore document ID, `location`, and `state` instead); Customer/Course hierarchy corrected to nested `customers/{customerId}/courses/{courseId}` storage with `customer_name`/`course_name` synchronized display copies on Device. Live migration completed: `customers/CUST-0001`, `customers/CUST-0001/courses/COURSE-0001`, and `devices/FRB-0001` (with issued production credential) now exist in production Firestore; legacy `devices/frb-0001` and `devices/pv4` removed; obsolete fleet-wide `FAIRWAY_DEVICE_KEY` Cloud Run environment variable removed. Physically validated end-to-end via a real button press producing a successful, correctly-attributed persisted request. See `docs/DEVICE_PROVISIONING_GUIDE.md` ("Existing Reference Device: FRB-0001") for the full record. Supersedes former backlog item "Device authentication." |
| WP4 | Historical Device Health work | Superseded | Historical validation remains recorded in owner documents; all current runtime/backend/Admin Health behavior is retired. |
| WP5 | Fleet/device administration UI | Complete | Customer/Course hierarchy, provisioning, deployment assignment, lifecycle, SIM/comments, commissioning/service, verified identity provenance, and export remain. Health/history/schedule UI is retired. |
| WP6 | Alert engine | Retired | Health-derived thresholds, missed-report detection, and notifications are not current product scope. |
| WP7 | Second-device deployment spike | Complete | FRB-0002 remains the validated Prototype 3.2 field reference. Historical Health commissioning evidence does not imply a current Health runtime. |
| WP8 | Firmware modular decomposition + physical validation | Complete | `main.c` decomposed into single-responsibility modules (`button_ux.c`, `golfer_txn.c`, `golfer_protocol.c`, `http_transport.c`, `modem_service.c`, `power_policy.c`, `transaction_scheduler.c`; `command_protocol.c` extended to own both directions of the COMPLETE wire protocol); no protocol or product-behavior change. CPO-confirmed physical validation on FRB-0002: golfer button press reached the operator dashboard with a valid `request_id`, and a CPO-initiated COMPLETE command was polled, acknowledged, and cleared the active demand window. See the Firmware Generation Registry in `docs/FIRMWARE_SPECIFICATION.md` ("Embarrassingly Small Runtime (Health Retirement + Modular Rewrite)"). Demand-window repeat-press behavior and field-power dormant-current measurement remain outstanding for this generation. |

## Future Backlog (Post Fleet Administration + Device Health Sprint)

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
| 3 | Request/network robustness & remaining security hardening | Incorporates former items: Payload/API alignment; Backend payload contract decision (aliases/defaults); finer-grained operator/admin authorization beyond the implemented Firebase identity check; Request timeout and retry handling. |
| 5 | Fleet Security Procedure & Credential Lifecycle | Credential compromise response, replacement/re-provisioning procedure, device credential revocation, administrator secret-handling rules, storage-policy hardening, and future consideration of routine rotation and stronger device-side protected storage (e.g. TF-M PS/ITS) if justified. |
| 6 | Watchdog + fault recovery / reset diagnostics | Incorporates former items: Watchdog and fault recovery; Reset reason logging. |
| 7 | Course analytics dashboard | Broader Admin/Course analytics remain deferred. The bounded Cart Operator day/week/month service summary and history are implemented and deployed as part of Option C. |
| 8 | Pilot readiness review | Final validation before pilot deployment. |
| 9 | Pilot-build validation / deployment | Validate the CPO-approved 5580 / J4 VBAT-GND architecture, LiPo trend evidence, and end-to-end battery-health behavior on the new build set before any broader rollout. |
| 10 | NCS 3.4 Upgrade — Post-Field Deployment | Do not begin until the current engineering/feature backlog is complete AND pilot units are deployed and operating successfully in the field. At that point: evaluate migration from NCS 3.1.1 to NCS 3.4; reassess nRF9151 Errata 36 / AP-protect handling using mechanisms supported by the newer SDK; preserve validated Fairway behavior during migration. |
| 11 | Whole-device idle-power regression investigation | CPO-observed: whole-device idle/dormant current increased by approximately an order of magnitude versus the LP 1.2 ~23.25 uA baseline, coincident with the approved pilot-build 5580/MAX17048 + Adafruit 6106 power-architecture integration (see `docs/HARDWARE_BOM.md`). Deferred and unresolved: cause not yet diagnosed, no replacement dormant-current target adopted. Not corrected or investigated as part of WP4 closeout. |
| 12 | Repeat-press transport and persistence | Transport firmware-local in-window repeat presses and atomically update the originating request's `repeat_press_count` and `last_repeat_press_at`. This is separate deferred work; Stage B2 COMPLETE is implemented and validated. |
| 13 | Pilot COMPLETE-check cadence reevaluation | Reevaluate the period between completion checks using pilot field evidence. The implemented 15-second active-window period is an explicit pilot hypothesis, not a permanently optimized production constant; active-window energy characterization is not an acceptance criterion for the Stage B2 implementation itself. |
Historical alternatives (TMUX1101, MAX4544, switched-SAADC/divider paths) remain archived and are not active backlog items for the current pilot-build architecture.
