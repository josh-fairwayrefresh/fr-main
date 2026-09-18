# Feature Backlog

This document is the canonical engineering feature backlog for Fairway Refresh.

Completed features should be removed from this document and incorporated into the appropriate Source of Truth documents.

| Priority | Feature | Notes |
|----------|---------|-------|
| 1 | Multi-device provisioning | Support multiple deployed Fairway Refresh buttons with unique identities. |
| 2 | Device-to-SIM registry | Track each FRB device against its installed Hologram SIM. |
| 3 | Payload/API alignment | Finalize payload format and backend contract. |
| 4 | Backend payload contract decision | Decide whether to remove or formally support backend payload aliases and default values. |
| 5 | Device authentication | Replace prototype authentication with production device identity. |
| 6 | Operator endpoint authentication hardening | Enforce authentication/authorization for operator confirm and complete endpoints. |
| 7 | Course configuration | Support configurable course, hole, and deployment settings. |
| 8 | Button provisioning workflow | Define first-time setup and commissioning process for new devices. |
| 9 | Device health monitoring | Heartbeats, battery status, connectivity, and offline detection. |
| 10 | LTE signal telemetry | Capture signal quality for diagnostics. |
| 11 | Watchdog and fault recovery | Automatic recovery from firmware failures. |
| 12 | Reset reason logging | Record reset causes for troubleshooting. |
| 13 | Request timeout and retry handling | Improve robustness of network communications. |
| 14 | Operator analytics | Capture request timing and operational metrics. |
| 15 | Course analytics dashboard | Aggregate usage trends and demand patterns. |
| 16 | Finalize golfer button/LED UX before pilot | Revisit and approve the final golfer-facing button feedback sequence, LED meanings/timing, and request-lockout experience before pilot deployment. Current Build A behavior is an accepted engineering placeholder, not final pilot UX. |
| 17 | Pilot readiness review | Final validation before pilot deployment. |
| 18 | Pilot-build validation | Validate the CPO-approved 5580 / J4 VBAT-GND architecture, LiPo trend evidence, and end-to-end battery-health behavior on the new build set before any broader rollout. |
| 19 | NCS 3.4 Upgrade — Post-Field Deployment | Do not begin until the current engineering/feature backlog is complete AND pilot units are deployed and operating successfully in the field. At that point: evaluate migration from NCS 3.1.1 to NCS 3.4; reassess nRF9151 Errata 36 / AP-protect handling using mechanisms supported by the newer SDK; preserve validated Fairway behavior during migration. |

Historical alternatives (TMUX1101, MAX4544, switched-SAADC/divider paths) remain archived and are not active backlog items for the current pilot-build architecture.
