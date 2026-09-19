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
| WP4 | Device Health transport + persistence | Pending | Supersedes former backlog items "Device health monitoring" and "LTE signal telemetry" (acquisition of RSRP/RSRQ/SNR/temperature/battery is already validated per `docs/FIRMWARE_SPECIFICATION.md`; WP4 adds transport and persistence). |
| WP5 | Fleet/device administration UI | Pending | Supersedes former backlog item "Button provisioning workflow" (Admin "Add Device" allocation workflow). |
| WP6 | Alert engine | Pending | New. |
| WP7 | Second-device deployment spike | Pending | New. |

## Future Backlog (Post Fleet Administration + Device Health Sprint)

| Priority | Feature | Notes |
|----------|---------|-------|
| 1 | Admin notification delivery | Delivery of alert/health notifications to administrators; deferred per CPO direction. |
| 2 | Remote / on-demand Device Health | Remote wake/downlink health-check request; deferred per CPO direction (visible-but-disabled admin placeholder is in scope for WP5). |
| 3 | Cart operator UX + notifications | Cart-operator-facing notifications; separate from admin notification delivery above. |
| 4 | Request/network robustness & remaining security hardening | Incorporates former items: Payload/API alignment; Backend payload contract decision (aliases/defaults); Operator endpoint authentication hardening; Request timeout and retry handling. |
| 5 | Final Golfer Button / LED UX | Design, approve, implement, and validate the replacement golfer-facing button/light interaction before pilot deployment. The future colors, counts, timing, sequencing, feedback states, and interaction logic are not yet specified. Current Build A behavior remains an accepted interim implementation only. |
| 6 | Fleet Security Procedure & Credential Lifecycle | Credential compromise response, replacement/re-provisioning procedure, device credential revocation, administrator secret-handling rules, storage-policy hardening, and future consideration of routine rotation and stronger device-side protected storage (e.g. TF-M PS/ITS) if justified. |
| 7 | Watchdog + fault recovery / reset diagnostics | Incorporates former items: Watchdog and fault recovery; Reset reason logging. |
| 8 | Analytics / course analytics | Incorporates former items: Operator analytics; Course analytics dashboard. |
| 9 | Pilot readiness review | Final validation before pilot deployment. |
| 10 | Pilot-build validation / deployment | Validate the CPO-approved 5580 / J4 VBAT-GND architecture, LiPo trend evidence, and end-to-end battery-health behavior on the new build set before any broader rollout. |
| 11 | NCS 3.4 Upgrade — Post-Field Deployment | Do not begin until the current engineering/feature backlog is complete AND pilot units are deployed and operating successfully in the field. At that point: evaluate migration from NCS 3.1.1 to NCS 3.4; reassess nRF9151 Errata 36 / AP-protect handling using mechanisms supported by the newer SDK; preserve validated Fairway behavior during migration. |

Historical alternatives (TMUX1101, MAX4544, switched-SAADC/divider paths) remain archived and are not active backlog items for the current pilot-build architecture.
