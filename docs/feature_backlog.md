# Feature Backlog

This document is the canonical engineering feature backlog for Fairway Refresh.

Detailed truth for completed features belongs in the appropriate owner
documents. Completed work packages may remain in the Current Sprint table
through sprint closeout for status traceability; they are removed when they no
longer serve current sprint tracking and do not remain indefinitely as future
backlog items.

## Current Sprint: Fleet Administration + Device Health (WP1–WP7)

| WP | Work Package | Status | Notes |
|----|---------------|--------|-------|
| WP1 | Current-state architecture inspection | Complete | Read-only investigation; findings reconciled into `docs/DEVICE_PROVISIONING_GUIDE.md`. |
| WP2 | Fleet data foundation (Customer -> Course -> Device) | Complete | Canonical Customer/Course/Device schema and centralized ID allocation (`fairway_backend/cloudrun_receiver/lib/fleet/`); see `docs/DEVICE_PROVISIONING_GUIDE.md`. Supersedes former backlog items "Multi-device provisioning," "Device-to-SIM registry," and "Course configuration." |
| WP3 | Per-device credentials spike | Complete | Per-device credential generation/verification and canonical identity implemented (`fairway_backend/cloudrun_receiver/lib/fleet/credentials.js`); Device schema normalized to remove duplicate `device_id`/`hole`/`label`/`active` fields (derived from the Firestore document ID, `location`, and `state` instead); Customer/Course hierarchy corrected to nested `customers/{customerId}/courses/{courseId}` storage with `customer_name`/`course_name` synchronized display copies on Device. Live migration completed: `customers/CUST-0001`, `customers/CUST-0001/courses/COURSE-0001`, and `devices/FRB-0001` (with issued production credential) now exist in production Firestore; legacy `devices/frb-0001` and `devices/pv4` removed; obsolete fleet-wide `FAIRWAY_DEVICE_KEY` Cloud Run environment variable removed. Physically validated end-to-end via a real button press producing a successful, correctly-attributed persisted request. See `docs/DEVICE_PROVISIONING_GUIDE.md` ("Existing Reference Device: FRB-0001") for the full record. Supersedes former backlog item "Device authentication." |
| WP4 | Device Health transport + persistence + autonomous reporting | Pending | Supersedes former backlog items "Device health monitoring" and "LTE signal telemetry" (acquisition of RSRP/RSRQ/SNR/temperature/battery is already validated per `docs/FIRMWARE_SPECIFICATION.md`). Approved sprint scope: transport and persistence of Device Health observations, plus autonomous scheduled health reporting at approximately 09:00 and 17:00 Course-local time (two total transmission attempts, retry within 90 seconds), with backend missed-report determination at 09:05/17:05 Course-local time. Detailed `latest_health`/history/threshold/alert requirements are owned by `docs/DEVICE_PROVISIONING_GUIDE.md`; scheduling/timekeeping requirements are owned by `docs/FIRMWARE_SPECIFICATION.md`. |
| WP5 | Fleet/device administration UI | Pending | Supersedes former backlog item "Button provisioning workflow" (Admin "Add Device" allocation workflow). Approved target capability: Customer/Course/Device administration, Device lifecycle state, Course assignment, location assignment, fleet health view, per-Device health view, health history/trends, alert state/history, Course timezone, Course Device Health schedule, SIM ICCID metadata, and Device-to-SIM export. The existing operator webapp already implements Firebase Authentication (Google and email/password sign-in); real admin role authorization does not yet exist and remains implementation work. A future "Request Health Check" action remains deferred unless separately approved. |
| WP6 | Alert engine | Pending | New. Approved target: persistent alert lifecycle (open, remain active while unresolved, automatic resolution on recovery, indefinitely retained history), including the missed-scheduled-report/connectivity alert. Approved sprint scope: when a missed scheduled report opens that alert, the admin shall be notified immediately via email and SMS/text; recipient scope for the present sprint/pilot is admin only; the exact email/SMS provider is not yet selected and remains unresolved implementation work. Detailed thresholds and alert-lifecycle semantics are owned by `docs/DEVICE_PROVISIONING_GUIDE.md`; this row does not duplicate them. |
| WP7 | Second-device deployment spike | Pending | New. |

## Future Backlog (Post Fleet Administration + Device Health Sprint)

| Priority | Feature | Notes |
|----------|---------|-------|
| 1 | Remote / on-demand Device Health | Remote wake/downlink health-check request; deferred per CPO direction (visible-but-disabled admin placeholder is in scope for WP5). |
| 2 | Cart operator UX + notifications | Cart-operator-facing notifications; separate from the admin-only email/SMS missed-report notification owned by WP6 above. |
| 3 | Request/network robustness & remaining security hardening | Incorporates former items: Payload/API alignment; Backend payload contract decision (aliases/defaults); Operator endpoint authentication hardening; Request timeout and retry handling. |
| 4 | Final Golfer Button / LED UX | Design, approve, implement, and validate the replacement golfer-facing button/light interaction before pilot deployment. The future colors, counts, timing, sequencing, feedback states, and interaction logic are not yet specified. Current Build A behavior remains an accepted interim implementation only. A CPO-approved provisional future Button / Indicator System is recorded in `docs/HARDWARE_BOM.md` ("Provisional Future Button / Indicator System — Not Yet Accepted") as provisional hardware only, subject to testing and final acceptance; it does not define final timing/sequencing/repeated-press UX. |
| 5 | Fleet Security Procedure & Credential Lifecycle | Credential compromise response, replacement/re-provisioning procedure, device credential revocation, administrator secret-handling rules, storage-policy hardening, and future consideration of routine rotation and stronger device-side protected storage (e.g. TF-M PS/ITS) if justified. |
| 6 | Watchdog + fault recovery / reset diagnostics | Incorporates former items: Watchdog and fault recovery; Reset reason logging. |
| 7 | Analytics / course analytics | Incorporates former items: Operator analytics; Course analytics dashboard. |
| 8 | Pilot readiness review | Final validation before pilot deployment. |
| 9 | Pilot-build validation / deployment | Validate the CPO-approved 5580 / J4 VBAT-GND architecture, LiPo trend evidence, and end-to-end battery-health behavior on the new build set before any broader rollout. |
| 10 | NCS 3.4 Upgrade — Post-Field Deployment | Do not begin until the current engineering/feature backlog is complete AND pilot units are deployed and operating successfully in the field. At that point: evaluate migration from NCS 3.1.1 to NCS 3.4; reassess nRF9151 Errata 36 / AP-protect handling using mechanisms supported by the newer SDK; preserve validated Fairway behavior during migration. |

Historical alternatives (TMUX1101, MAX4544, switched-SAADC/divider paths) remain archived and are not active backlog items for the current pilot-build architecture.
