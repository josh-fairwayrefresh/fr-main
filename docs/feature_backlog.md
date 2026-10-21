# Feature Backlog — Fairway Refresh Pilot 1.1

This document lists open or explicitly deferred work only. Completed behavior is
owned by its subsystem document; superseded and abandoned work is summarized in
`docs/archive.md`. Backlog entries do not authorize implementation or a product
change.

## Open and deferred work

| Item | Status / boundary |
|---|---|
| Pilot-cleanup acceptance and clean-main documentation merge | Cleanup is executed; Lead Architect review of evidence commit `af5bd53304a8d42c7859c282891ec1b99ac642d6` is complete with no material discrepancy requiring another production operation. CPO acceptance remains pending. Complete review/validation of the clean-main documentation increment and obtain explicit merge authorization before it enters main. Detailed evidence and one-time scripts remain branch-only in [draft PR #1](https://github.com/josh-fairwayrefresh/fr-main/pull/1), unmerged; they are not a dependency to copy into main. See the concise execution record in [the Deployment Guide](DEPLOYMENT_GUIDE.md#pilot-test-data-cleanup-execution--2026-10-20). No cleanup rerun is authorized. |
| Cart Operator mobile acceptance | The responsive-layout release is live. Complete authenticated physical-phone/Safari checks at representative small and large phone widths and obtain CPO acceptance. Do not infer acceptance from build checks or unauthenticated route smoke tests. Preserve the accepted iPad and desktop experience. |
| Repeat-press transport and persistence | Firmware-local repeat behavior exists; transporting repeat events and persisting `repeat_press_count`/`last_repeat_press_at` against the originating accepted request is deferred. Keep one authoritative service request per demand window. |
| Production MCUboot signing key | No approved production signing key or corresponding bootloader trust anchor is recorded. Increment 3C synthetic artifacts used NCS's widely distributed `root-ec-p256.pem` debug key, which MCUboot documents as insecure and not for production. Approve and configure the production signing-key/trust-anchor process and verify the signed image before any real-device build or flash. Do not use the synthetic artifacts in production. See `docs/FIRMWARE_SPECIFICATION.md` and `docs/DEVICE_PROVISIONING_GUIDE.md`. |
| Orphaned user-access cleanup | Nonblocking post-pilot maintenance. Provide an explicit, auditable administrator-controlled way to review and remove an Auth-orphaned `user_access/{uid}` record without affecting valid users. |
| Power consumption and pack autonomy characterization | Measure current field-power idle/transaction consumption at a documented boundary and assess V25/V50/V75 runtime from evidence. Do not infer autonomy from functional commissioning or historical AA/LiPo measurements. |
| COMPLETE polling cadence review | Reevaluate the active-window polling period using field evidence. FRB-0006's intermittent TLS timeouts occurred during 15-second polling, but later COMPLETE delivery and acknowledgement succeeded without firmware/configuration changes; cadence causality is unproven. No cadence change is authorized by this entry. |
| Request/network reliability review | FRB-0006 showed LTE registration status `90` then `2` then `5`, TLS connect/handshake timeouts `-116`, and later successful button/COMPLETE operation without intervening changes. Correlate registration, signal, TLS-stage, HTTP, and LED-state evidence before selecting a fix; a shared modem/network transport issue is plausible but unconfirmed. Preserve the accepted 15-second transaction budget unless the CPO approves a change. See `docs/DEPLOYMENT_GUIDE.md`. |
| Watchdog and reset diagnostics | Evaluate fault recovery and reset-reason diagnostics without changing current runtime behavior until scoped and approved. |
| Broader course analytics | Course-level analytics beyond the accepted Cart Operator day/week/month service summaries remain deferred. |
| NCS 3.4 migration evaluation | FRB-0001 through FRB-0005 have CPO-confirmed physical validation; FRB-0006 reliability remains unresolved, so the full-fleet field-operation gate is not met. Evaluate migration from NCS 3.1.1 only as a separately authorized task; assess Errata 36/AP-protect and power-policy implications before changing the accepted build baseline. |

## Archived or abandoned work

Superseded milestones, abandoned features, and temporary diagnostic work are
not active backlog items. See `docs/archive.md` for concise historical
disposition and lessons.
