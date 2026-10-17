# Feature Backlog — Fairway Refresh Pilot 1.1

This document lists open or explicitly deferred work only. Completed behavior is
owned by its subsystem document; superseded and abandoned work is summarized in
`docs/archive.md`. Backlog entries do not authorize implementation or a product
change.

## Open and deferred work

| Item | Status / boundary |
|---|---|
| Cart Operator mobile acceptance | The responsive-layout release is live. Complete authenticated physical-phone/Safari checks at representative small and large phone widths and obtain CPO acceptance. Do not infer acceptance from build checks or unauthenticated route smoke tests. Preserve the accepted iPad and desktop experience. |
| Repeat-press transport and persistence | Firmware-local repeat behavior exists; transporting repeat events and persisting `repeat_press_count`/`last_repeat_press_at` against the originating accepted request is deferred. Keep one authoritative service request per demand window. |
| Fleet credential lifecycle | Production Admin credential-lifecycle capability is deployed on `fairway-admin-00017-dvk`; candidate regression tests passed 118/118 and local Firestore Emulator tests passed 8/8. The accepted-baseline rerun contained 106 tests; 103 counted only `PASS:` output lines, and the earlier 105 count was not reproduced. Device-specific provisioning/build/artifact verification passed 30/30 tests. Three synthetic NCS 3.1.1 artifacts verify; their differences are expected MCUboot ECDSA-P256 signature-TLV nondeterminism, but they use the insecure SDK debug signing key and are not production/flash candidates. FRB-0003 credential recovery has not occurred and no physical recovery has been demonstrated. Its removable Hologram SIM is its only active cellular identity; the CPO approves temporary removal for offline maintenance. Separate stage authorizations and an approved production signing key/trust anchor remain required before physical/end-to-end recovery. No production credential operation occurred. Emulator evidence does not establish production IAM or physical behavior. No Admin UI, revocation, or routine rotation policy is included. See `docs/DEVICE_PROVISIONING_GUIDE.md` and `docs/DEPLOYMENT_GUIDE.md`. |
| Production MCUboot signing key | No approved production signing key or corresponding bootloader trust anchor is recorded. Increment 3C synthetic artifacts used NCS's widely distributed `root-ec-p256.pem` debug key, which MCUboot documents as insecure and not for production. Approve and configure the production signing-key/trust-anchor process and verify the signed image before any real-device build or flash. Do not use the synthetic artifacts in production. See `docs/FIRMWARE_SPECIFICATION.md` and `docs/DEVICE_PROVISIONING_GUIDE.md`. |
| Orphaned user-access cleanup | Nonblocking post-pilot maintenance. Provide an explicit, auditable administrator-controlled way to review and remove an Auth-orphaned `user_access/{uid}` record without affecting valid users. |
| Power consumption and pack autonomy characterization | Measure current field-power idle/transaction consumption at a documented boundary and assess V25/V50/V75 runtime from evidence. Do not infer autonomy from functional commissioning or historical AA/LiPo measurements. |
| COMPLETE polling cadence review | Reevaluate the active-window polling period using field evidence. It remains a pilot hypothesis; no cadence change is authorized by this entry. |
| Request/network reliability review | Reassess request timing/retry policy only against representative production field evidence. Preserve the accepted 15-second transaction budget unless the CPO approves a change. |
| Watchdog and reset diagnostics | Evaluate fault recovery and reset-reason diagnostics without changing current runtime behavior until scoped and approved. |
| Broader course analytics | Course-level analytics beyond the accepted Cart Operator day/week/month service summaries remain deferred. |
| NCS 3.4 migration evaluation | The field-operation gate has been met by the CPO-confirmed pilot fleet. Evaluate migration from NCS 3.1.1 only as a separately authorized task; assess Errata 36/AP-protect and power-policy implications before changing the accepted build baseline. |

## Archived or abandoned work

Superseded milestones, abandoned features, and temporary diagnostic work are
not active backlog items. See `docs/archive.md` for concise historical
disposition and lessons.
