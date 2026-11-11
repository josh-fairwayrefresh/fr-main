# Deployment Guide

## Current Deployment and OTA Readiness

This snapshot includes the CPO-authorized 2026-11-09 empty-catalog Admin
deployment and subsequent private-delivery infrastructure/firmware qualification.
“Last verified” means the date of the evidence,
not continuous production monitoring. Confirm actual
serving state and obtain release-specific authorization before production
changes. OTA rows and the readiness subsection below include subsequent
FRB-0005 commissioning evidence and the local Prototype 4.0 readiness increment;
the original accepted firmware artifacts remain unchanged.

| Area | Latest recorded state | Last verified / evidence limit |
|---|---|---|
| Accepted Pilot 1.1 field operation | CPO confirms FRB-0001 through FRB-0006 commissioned and in operation; accepted firmware source is `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0` | Aggregate acceptance does not identify a live image on each device or current registry assignments. The latest local OTA build is not the accepted/deployed field firmware. |
| Production Hosting | Production site `savvy-kit-496703-r5`; live version `ba810bdc550d6501` | Released `2026-11-11T00:56:32.950Z`. All 127 published files verified byte-for-byte on both origins, including all 107 accepted Driving Range assets; cache policies unchanged. Adds assignment supersession disclosure to Firmware OTA. Prior versions retained (`5eb383e4a44c3d13` previous). |
| Production Admin / receiver | Admin `fairway-admin-ota-10r4-2e0b5a9`; receiver `fairway-button-receiver-ota-10r4-2e0b5a9`, both Ready, 100% | Promoted `2026-11-11T02:52Z`; isolated source archive `2e0b5a9edcbb5a8dcff9c23906046edb1f7cdadbcf7ff765c1e10df17debc445` (source `b843c42`). Runtime identities/configuration unchanged; `*-ota-r4-53cf494` retained as rollback. No later deployment. |
| OTA implementation | **Prototype 4.0 — CPO field-validated stable firmware baseline** (2026-11-11): FRB-0005 autonomously installed `OTA-1.0-r4` (`1.0.0+4`) in its 12:30 AM Pacific window and confirmed it at 12:32:45 AM | See the [Prototype 4.0 Alignment Register entry](#prototype-40--cpo-field-validated-stable-firmware-baseline-2026-11-11). Selectable releases: `OTA-1.0-r4`, `OTA-0.1alt-r4` (FRB-0005 only). Superseded r2/r3 releases retained, not selectable; r3 images carry the discovery defect. |
| Local OTA validation | Final `OTA-0.1-r3` / `OTA-0.1alt-r3` signed packages built and independently verified, including exact-deployment completion and the registration handoff fix; 42 host cases pass in each schedule mode, both revised wire/ack configurations pass, and concurrent registration/reconnect regression passes | Final local output suffix `production-20261110-r3`; exact hashes below. Current firmware source matches both manifests. Existing commissioning helper pairing and secure payload verified. No new exact hashes accepted or published. Autonomous physical transitions remain unvalidated. |
| FRB-0005 commissioning | Running `1.0.0+4` (nightly) via autonomous OTA from `0.1.0+7`; credential generation 6 active | Clean USB install of `OTA-0.1-r4` (2026-11-10 17:57 Pacific), OTA to `0.1.0+7` with post-OTA request/COMPLETE, then nightly OTA to `1.0.0+4` (2026-11-11). Post-`1.0.0+4` request/COMPLETE not separately exercised. PV8 still required for USB service access. |
| Production OTA prerequisites | Private GCS controls verified; exact `OTA-0.1alt-r4` stored bytes verified; delivery enabled | Assignment never requires reconciling earlier targets. HQ remains `America/Los_Angeles`. Installation is shown only from authenticated device evidence. |
| Production data | Publication created `OTA-0.1alt-r4`; authorized recoveries activated FRB-0005 credential generations 4–6; CPO assignments superseded earlier targets with retained history; the successful deployment cleared its assignment | Permanent identity and placement unchanged. No other devices were changed. Preflight reports PITR/delete protection disabled; code rollback is not data recovery. |
| Current hardware | Prototype 3.3 uses CPO-designated Voltaic V25/V50/V75 regulated supplies; FRB-0003 operation was validated with V75 | V25/V50 voltage under load and pack autonomy were not separately verified. See the Hardware BOM and Assembly Guide. |

The exact-Device in-inventory credential-recovery UI is included in this
Hosting release, preserving the existing local protections. The
credential-lifecycle backend was originally deployed on 2026-10-17;
this rollout performed no credential operation or authenticated lifecycle
request. See
`docs/DEVICE_PROVISIONING_GUIDE.md`.

### Running-image confirmation revision — implementation and release boundary (2026-11-10)

The CPO authorized the revised USB-only bootstrap, matching nightly successor,
local validation, production backend/frontend rollout and new release
publication, but did not authorize physical operations, assignments or Git
commit/push/merge. New build identities are `OTA-0.1-r3` (`0.1.0+4`, USB only)
and `OTA-0.1alt-r3` (`0.1.0+5`, nightly). No existing release identity or
artifact may be overwritten. The original commissioning helper may be reused
only after the existing verifier and pairing checks establish matching
partitions, protected-storage settings, signing trust and TF-M payload.
Provisioning accepts the revised bootstrap, not a nightly image, as its final
operational image.

Runtime confirmation behavior is owned by the Firmware Specification.
The backend adds authenticated `POST /api/v1/device-ota/confirmation` with
Device ID, primary-image version and protected monotonic change sequence.
Exact acknowledgment, idempotent time, stale protection and the existing
registry projection use `ota_device_status`; no second inventory is created.
The CPO subsequently approved automatic completion cleanup only after
confirmed-running installation. OTA reports bind the existing persisted
activation deployment ID to the actual primary-image version; the backend
transaction records successful deployment/event evidence, preserves
`last_deployment_id` for fleet history and clears only that matching current
assignment. It never guesses from a version alone, fabricates missed lifecycle
events, or clears a newer assignment from duplicate/stale/older-deployment
reports. The authenticated legacy confirmed path retains its ordered lifecycle
checks and the same exact-assignment protection. Offer/download/failure and
an unbound or different-version USB report do not perform this success cleanup.
This is not authorization to cancel FRB-0005's unresolved old assignment.

The selectable-catalog replacement is conditional: after the exact accepted,
governance-complete `OTA-0.1alt-r3` is published, new selections and unconfirmed
reviews of `OTA-0.1alt-r2` are rejected. The old release, object, deployment
history and existing assignment's delivery authorization remain intact.
This does not cancel or retarget an active assignment. A pending old
assignment and an already observed one-time check still block a new
FRB-0005 assignment under the existing guards; a reflash alone is not
authorization to reconcile those backend records.

**Current publication scope (2026-11-10):** the CPO now authorizes required
source/release-record commits and push to the existing review branch and its
designated `origin` remote, without merge. The CPO requests both
`OTA-0.1alt-r3` and the newly added `OTA-1.0-r3` (`1.0.0+3`, nightly) in Admin
before FRB-0005 is reflashed. The final bootstrap and 0.1alt packages remain
unchanged; only the additional 1.0 identity needs a signed build. Exact-hash
acceptance, actual remote-backup evidence and governed catalog deployment
remain prerequisites. Publishing does not assign a device. The old unresolved
assignment and consumed bootstrap state need separately scoped reconciliation;
do not start a physical commissioning window while they still block selection.

The source checkpoint is now committed and remotely verified at
`00530a1a5875c3217e1de7e0368cd8b323fe1173`. The CPO explicitly accepted all
three final signed hashes below and authorized publication of the two nightly
successors for FRB-0005 only, with the bootstrap remaining USB-only.
Release-record backup and governed catalog deployment/publication must still
be verified before claiming availability; these checks have now passed as
recorded below. No device or assignment operation is permitted as a publication
side effect.

#### Verified r3 catalog publication (2026-11-10 Pacific)

- Admin `fairway-admin-ota-r3-c0d0720` and receiver
  `fairway-button-receiver-ota-r3-c0d0720` are Ready at 100%. Their immutable
  image digests respectively are
  `sha256:b0cb1d23b84e69503ef546ab91d9e1bbaa2bf26566d49edaa958a6f5c9d12cf7`
  and `sha256:a0308cd06a028cc467c1b6a33d6a21f8e37eaa30ba7a8c9d421c4e24fa695ca7`.
  Both were first staged at zero traffic, with unchanged runtime/identity
  fingerprints and prior traffic verified. Negative authentication and an
  authenticated read-only Admin catalog request passed before promotion.
- The deployed 40-file source archive SHA-256 is
  `c0d0720c6820659ac7dcd969438c76873cc766c518ab458af93cfea3f6cc3ad3`,
  from remote-backed approval catalog
  `a38172d159eda8d8344f63b750e0dbdc88b0571c`. Original manifests and
  exact-hash acceptance records are remotely backed at
  `fd631ecf9d9479ada8f11c937e072093b80797a5`.
- Existing Admin-authenticated `POST /api/v1/admin/ota/releases` returned
  `201 published` for `OTA-0.1alt-r3` at `2026-11-11T00:08:40.186Z` and
  `OTA-1.0-r3` at `2026-11-11T00:08:41.220Z`, using exactly the accepted
  hashes and original manifests below. Production browser refresh shows only
  these two approved successors in the selector; both are catalog-assignable.
  Their r2 predecessors remain published but unselectable for new assignments.
- Authenticated operator-only GCS reads verified all four r3/r2 stored objects
  byte-for-byte against their original manifests. Private bucket uniform
  access and enforced public-access prevention remain enabled. No valid device
  download token or device confirmation was synthesized.
- Read-only verification at `2026-11-11T00:09:32Z` confirms FRB-0005's old
  assignment/deployment/check status is unchanged. The production fleet still
  blocked a new assignment with `An active assignment already exists`; that
  lock was later removed by the assignment-contract correction below.
- Source inventories, redacted before/staged/promoted runtime snapshots,
  immutable revision identities, build evidence and byte-level publication
  verification are retained under the session's `ota-publication-r3/`.
  Temporary loopback payload serving was stopped after publication. No physical
  operation, new assignment, credential operation or merge was performed.

The CPO clarified the immediate deliverable: publish the latest 0.1alt/1.0
versions so the CPO can make assignments, and ready the new USB 0.1 image for
the normal FRB-0005 SOP. No new recommissioning procedure is requested.
The existing workspace `Maintain FRB-0005 USB` task now selects the accepted
`ota-OTA-0.1-r3-production-20261110-r3/OTA-0.1-r3-manifest.json`, retaining
the exact probe, existing credential/rotation, verified commissioner and
storage-preserving flags. Its artifact hash, current firmware-source match,
pairing and byte-identical secure payload were rechecked without accessing
the device. The task was prepared, not executed. This readiness does not claim
that a flash resets the already consumed schedule or clears the old backend
assignment.

On 2026-11-10 at approximately 16:15 Pacific, the CPO reported FRB-0005
connected by USB and ready for the new bootstrap. Preflight found no devices
through nRF Connect and a single canonical `probe-rs list` returned
`No debug probes were found.` The required exact CMSIS-DAP debugger therefore
was not accessible. The maintenance task was not started; no flash, erase,
reset, serial provisioning, credential operation, reconnect listener or OTA
assignment occurred. Resume only once stable authorized service access is
established, per the existing SOP; connection alone is not debugger readiness.

During the subsequent CPO-authorized PV8-assisted service entry on the same
date, `probe-rs list` detected exact serial `E66550A147969135`. The existing
no-erase maintenance task was then run in a visible Terminal with its hidden
signing-key prompt. Both original signed artifacts independently verified,
including accepted bootstrap SHA-256
`a93b4620d119a7d08b253ca76e1dcbe697557f329d2bf262246b742d58d6986d`.
The first commissioning-primary `probe-rs download` failed with exit 1.
The host stopped without executing provisioning, the final bootstrap write,
backend activation or final reset. A subsequent exact-probe `probe-rs info`
identified a Nordic DPv2 debug port, but Memory APs 0, 1 and 3 reported
`Memory AP is not accessible, DeviceEn bit not set`. This does not establish
the cause of the failed download or whether its first write partially changed
the primary slot; the new bootstrap is not installed/verified. No erase,
new rotation, assignment change or blind programming retry was performed.
Probe enumeration is therefore not sufficient evidence of programming access.

#### Verified FRB-0005 OTA-0.1-r3 recovery and normal operation

The CPO subsequently authorized the established local recovery, including
erase only after identity/credential restoration prerequisites were secured,
without firmware rebuild, architecture changes, assignment changes or Git
commit/push/merge. Read-only preflight verified that the retained credential
matched the active production verifier. Its old rotation was already
activated, so it could not authorize the canonical clean-install path.
The CPO explicitly authorized one FRB-0005-only prepared credential cutover.

The existing production signing key was unlocked only at a visible Terminal's
hidden prompt. Independent verification passed for the existing commissioner
and exact accepted bootstrap bytes, with matching production trust, storage
maps and byte-identical secure TF-M payloads. No artifact was rebuilt or
changed. Through the established Admin-authenticated prepare route, operation
`76ea6fed-cef4-484c-bf4b-c101593e6561` was prepared at
`2026-11-11T00:37:17.022Z`; its one-time credential was secured in the existing
owner-only, locally Git-excluded secret directory and validated before erase.
The established host confirmed `prepared` and `can_activate: true`.

The unchanged commissioning implementation then performed one exact-probe
erase, complete verified commissioning HEX installation, protected identity/
credential installation and verification, commissioner reboot and credential
re-verification, followed by accepted bootstrap primary-only programming at
`0x10000` with `--verify --restore-unwritten`. No second full erase occurred.
Only after final-image verification did the matching rotation activate
(`2026-11-11T00:38:52.144Z`, credential generation 4); normal reset and a
post-install activated-status check succeeded. The recovery process exited
zero. This established recovery resolved the observed access failure without
claiming a separately proven cause for `DeviceEn bit not set`.

Post-reset validation, not just flashing, established:

- The backend accepted actual-running version `0.1.0+4`, confirmation
  sequence 1, at `2026-11-11T00:39:09.969Z` (16:39:09 Pacific). No confirmation
  had existed before erase; no backend sequence reset/reconciliation was
  performed.
- The new retained credential matches the active production verifier.
  Permanent ID `FRB-0005`, deployed state, Customer/Course/location and the
  old `OTA-0.1alt-r2` deployment
  `18d1f946-f809-43b0-8a02-58925e630add` were verified unchanged. No new OTA
  assignment was made.
- The CPO pressed the physical request button. Real `nrf9151` request
  `HfLSTqo3onSv638pMxHg`, attributed to FRB-0005 at its existing Hole 1
  placement, reached production at `2026-11-11T00:39:43.030Z` and was completed
  at `00:39:50.296Z`. The Cart UI showed the 16:39 completion.
- The corresponding `complete__HfLSTqo3onSv638pMxHg` command was acknowledged
  by the device at `2026-11-11T00:40:15.206Z`. The CPO confirmed normal
  completion indication and return to idle.
- The production Admin registry detail displayed firmware `0.1.0+4` and
  `Last confirmed running: Nov 10, 2026, 4:39 PM`.

Redacted recovery status/log and read-only before/after validation evidence
remain in the current session's files directory. No plaintext credential or
passphrase was printed. No source or release changes, backend/frontend
rollout, commit, push or merge were performed for this recovery. Autonomous
OTA qualification and permanent PV8-free access remain separate work.

At its first 900-second check (`2026-11-11T00:54:02.421Z`), the device was
offered the then-current old `OTA-0.1alt-r2` (`0.1.0+3`) target, older than
its running `0.1.0+4`. No artifact request or lifecycle report followed. The
cause was later identified as the r3 discovery parsing defect below, not the
older version. The consumed one-time check required a fresh installation for
a new attempt.

#### r4 discovery parsing correction — CPO acceptance and publication authorization 2026-11-10

After the 17:06 reinstall, FRB-0005's 900-second check at
`2026-11-11T01:21:17Z` received an 813-byte HTTP 200 `OTA-0.1alt-r3` offer.
Cloud Run logs show no subsequent artifact request or lifecycle report,
matching the 14:30 and 16:54 attempts. Root cause: discovery decoded
`next_check_at_utc_ms` (UTC milliseconds, about 1.79e12) with
`JSON_TOK_NUMBER`, which the NCS 3.1.1 decoder stores as `int32_t` through
32-bit `strtol`. On the nRF9151 that returns `ERANGE`, so every offer and
schedule response was rejected with `-EPROTO` before a deployment ID was
retained, preventing a failure report. Earlier host tests replaced the
vendor decoder, so they did not exercise this boundary. All r3 images
(`0.1.0+4`, `0.1.0+5`, `1.0.0+3`) contain the defect.

Correction: both schedule fields use `JSON_TOK_INT64`. The new
`tests/ota_update/host/discovery_json_test.c` compiles the installed SDK's
real `lib/utils/json.c` and unmodified `json.h` with the real
`ota_update_discovery.c` and a production-shaped offer. It fails against the
r3 source and passes with the correction. Acceptance evidence: full OTA host
suite (including this regression), 119 Python release/provisioning tests
(one skip), and 29 OTA API plus 33 fleet/governance backend cases.

The CPO approved the r4 correction and accepted these exact production-signed
hashes (fingerprint
`sha256:be1c125733db97148309513e75282736024bec3e2b47beb44b7aa3008f4f88eb`),
built from base `a6350d738088557463909886c411775149fd5984` plus the corrected
source (firmware source digest
`831cf3b9a2eadc52e6b6c425e2c3bf8377a0f7fb63a3644e1535c5f998eb69c9`), each
independently verified for signature, version, schedule, trust, layout,
capacity and credential exclusion:

| Release | Version | Role | Signed bytes | SHA-256 |
|---|---|---|---:|---|
| `OTA-0.1-r4` | `0.1.0+6` | USB-only bootstrap, one-time 900 s | 281474 | `00a33f9f06056e3468ad7165af51a255ffad40574d9a14570cccd78c030717e1` |
| `OTA-0.1alt-r4` | `0.1.0+7` | Nightly OTA successor | 281660 | `e05e67f4b5b060658badd1881fd0189be1b53f3019df67ee29c0a221a45849f2` |

Original manifests are retained in `docs/releases/`; outputs are under
`/Users/DuplexLoop/fairway-builds/ota-OTA-0.1{,alt}-r4-production-20261110-r1/`.
The existing commissioner passes pairing and byte-identical secure TF-M
comparison with the r4 bootstrap. The CPO authorized publication of
`OTA-0.1alt-r4` for FRB-0005 only; publication withdraws `OTA-0.1alt-r3`
from new selection while preserving its bytes and history. The bootstrap
is never published. `OTA-1.0-r3` was not rebuilt and retains the defect.
This record is also the Alignment Register recognition for r4.

#### r4 publication, FRB-0005 installation and first verified OTA — 2026-11-10

Source, manifests and acceptance were committed and pushed as `bd1bc7b`,
then the exact-hash publication approval as `742c3b7` (remote verified after
each push; no merge). The first publication attempt was rejected
`invalid_provenance` before any storage write: the successor provenance
pattern still matched only r2/r3, so r4 was compared with the original
OTA 0.1 source. That was corrected and regression-tested (`e2d5db8`).
Both services were staged at zero traffic as `*-ota-r4-53cf494`, verified
Ready with unchanged runtime/identity fingerprints and serving traffic, and
denied unauthenticated Admin and device-confirmation calls (401) before
promotion. The intermediate `*-ota-r4-8bac296` revisions served briefly and
are superseded. `OTA-0.1alt-r4` was published through the authenticated
Admin route at `2026-11-11T01:53:44.508Z` (GCS generation
`1794362024485510`); the stored object matched the accepted 281660-byte
manifest hash, uniform access and public-access prevention remain enforced,
and the loopback payload handoff was stopped. The selector then showed
`OTA-0.1alt-r4` and `OTA-1.0-r3`; `OTA-0.1alt-r3` became unselectable.

After a PV8-held USB power application enumerated exact probe
`E66550A147969135`, the established recovery reused the accepted artifacts
with one newly prepared rotation `8c0ce37c-cfca-4239-b62f-d90a34f9ffdf`:
one erase, commissioner install, protected identity/credential install and
post-reboot verification, `OTA-0.1-r4` primary programming with read-back,
rotation activation (credential generation 6) and normal reset at
`01:57:51Z`. Its authenticated `0.1.0+6` running report returned the
expected 409: the clean install restarted the device sequence at 1, which
conflicts with recorded sequence 1 for `0.1.0+4`. The backend was not
reconciled. A 409 rather than 401 confirms the new credential authenticated.

The CPO assigned `OTA-0.1alt-r4` through Admin (deployment
`5af5a716-21d2-486a-88f9-358ecd95c31e` at `01:54:08Z`, then superseding it
with `3e77b457-8492-4bc2-bb32-b6a7bfe9c409` at `02:01:40Z`). Production
evidence for the current deployment:

| UTC | Evidence |
|---|---|
| `02:13:00.9` | One-time check, HTTP 200, offer recorded `02:13:01.546` |
| `02:13:07` | `downloading` lifecycle report |
| `02:14:46.971` | Authorized artifact request recorded |
| `02:14:49` / `02:14:52` / `02:14:57` | `verifying`, `staged`, `activation_pending` |
| `02:15:48.9` | Successor authenticated `/schedule` request, HTTP 200 (64-bit parsing on the nightly image) |
| `02:20:47.946` | Authenticated running confirmation `0.1.0+7`, sequence 2, bound to the deployment: deployment `confirmed`, assignment cleared, schedule mode `nightly` |
| `02:20:53` | Ordered `confirmed` lifecycle event accepted |

No `trial_boot` lifecycle event was recorded; confirmation rests on the
authenticated running-image report after mandatory health and MCUboot
confirmation, which is device evidence rather than independent attestation.
Production Admin then showed Confirmed firmware `0.1.0+7`, no pending
release, next window 12:30 AM Pacific, and the registry Firmware generation
`0.1.0+7`, `Last confirmed running: Nov 10, 2026, 6:20 PM`. Superseded
deployments retain `superseded_by` history. The external maintenance task
references the active rotation and the r4 bootstrap without `--erase`.

On `0.1.0+7`, the CPO pressed the physical button and confirmed request UI
and button behavior. Real `nrf9151` request `lW9tI1TW3W1rtA7ezW3Y`
(FRB-0005, Hole 1) was received at `2026-11-11T02:41:41.118Z` and completed
at `02:42:25.320Z`; its `complete__lW9tI1TW3W1rtA7ezW3Y` command was
acknowledged by the device at `02:42:54.657Z`.

Not yet observed: a subsequent nightly check and PV8-free service access.

#### OTA-1.0-r4 correction — CPO acceptance and publication authorization 2026-11-10

At `02:42:59Z` the CPO assigned `OTA-1.0-r3` to FRB-0005 for the 12:30 AM
Pacific window. Because r3 retains the discovery defect, FRB-0005 would
install it but then reject every later offer. The CPO approved building the
corrected `OTA-1.0-r4` and will reassign FRB-0005 to it before the window,
superseding the r3 target through normal Admin review.

`OTA-1.0-r4` (`1.0.0+4`, nightly) was built from base
`cfc98efde2db49e6190c769064c5e587c2076a10` plus its release registration;
its firmware source digest
`831cf3b9a2eadc52e6b6c425e2c3bf8377a0f7fb63a3644e1535c5f998eb69c9` is
identical to the accepted 0.1alt-r4 source. Independently verified with
production fingerprint
`sha256:be1c125733db97148309513e75282736024bec3e2b47beb44b7aa3008f4f88eb`.
Validation: full OTA host suite including the real-SDK decoder regression,
119 Python tests (one skip), and 30 OTA API plus 34 fleet/governance backend
cases, including r3→r4 1.0 replacement and supersession of an r3 target.
The CPO accepted the exact hash and authorized publication for FRB-0005 only:

| Release | Version | Signed bytes | SHA-256 |
|---|---|---:|---|
| `OTA-1.0-r4` | `1.0.0+4` | 281659 | `cd1ecbdf6072a5ad72b2ed1e86d6fe207c12717d5f057c6f8f1437b29db9e26e` |

The original manifest is retained in `docs/releases/`. Publication withdraws
`OTA-1.0-r3` from new selection while preserving its bytes and history. This
record is also the Alignment Register recognition for `OTA-1.0-r4`.

Acceptance records were pushed as `cc79c02` and the exact-hash approval as
`b843c42` (remote verified; no merge). Both services were staged at zero
traffic as `*-ota-10r4-2e0b5a9` (archive SHA-256
`2e0b5a9edcbb5a8dcff9c23906046edb1f7cdadbcf7ff765c1e10df17debc445`),
verified Ready with unchanged runtime/identity and serving traffic, denied
unauthenticated calls (401), and promoted to 100%; `*-ota-r4-53cf494` are
retained for rollback. `OTA-1.0-r4` was published through the authenticated
Admin route at `2026-11-11T02:53:31.067Z` (GCS generation
`1794365611041915`); stored bytes match the accepted manifest, private
bucket controls remain enforced, and the loopback handoff was stopped. The
selector shows `OTA-1.0-r4` and `OTA-0.1alt-r4`; `OTA-1.0-r3` is retained
but unselectable. At record time FRB-0005's current target was still the
CPO's `OTA-1.0-r3` deployment `f79ea43a-3f49-4fa6-8e1b-bd3549e40915`
(12:30 AM Pacific); the CPO will supersede it with `OTA-1.0-r4` through Admin.

#### OTA-1.0-r4 field installation — CPO field validation 2026-11-11

The CPO superseded the r3 target by assigning `OTA-1.0-r4` to FRB-0005
through normal Admin review (deployment
`f89395d0-3e0b-4383-9898-0eebe0bb5fc8`, `nightly_0030`, eligible
`2026-11-11T08:30:00Z`). FRB-0005, running `OTA-0.1alt-r4` (`0.1.0+7`),
performed its first scheduled nightly check and installed the update without
physical interaction. Authenticated production Admin evidence (Pacific):

| Time | Evidence |
|---|---|
| 12:30:08 AM | Nightly check-in; image offered |
| 12:30:22 AM | `downloading` |
| 12:31:52 AM | Authorized artifact request recorded |
| 12:31:54 / 12:31:57 / 12:32:02 AM | `verifying`, `staged`, `activation_pending` |
| 12:32:45 AM | Authenticated running-image confirmation `1.0.0+4`; deployment `confirmed`, assignment cleared |

Admin Firmware OTA then showed Confirmed firmware `1.0.0+4`, no pending
release and next window Nov 12 12:30 AM; the registry Firmware generation
showed `1.0.0+4`, `Last confirmed running: Nov 11, 2026, 12:32 AM`. This also
demonstrates the nightly schedule of the `0.1.0+7` image. Evidence was read
through the authenticated Admin UI; a separate Firestore/Cloud Run log read
was not repeated because the operator gcloud session had expired. Not
exercised: a post-`1.0.0+4` request/COMPLETE, rollback, and interrupted
download recovery. The CPO accepted this as the Prototype 4.0 field
validation recorded in the Alignment Register.

#### OTA assignment-contract correction — 2026-11-10

The CPO clarified that the Admin page must never lock a device against a new
assignment. Implemented contract: any approved, compatible release may be
assigned to any authorized device regardless of running firmware or earlier
assignment state; confirmation supersedes the prior target atomically,
records `superseded_by`/`superseded_at` and a `superseded` history event on
the old deployment, and stores `replaces_deployment_id` on the new one.
Discovery now re-reads the current target, issues the offer and download grant
in one transaction, and grants only the latest deployment. Delayed old
lifecycle or running reports cannot clear or complete the newer target, and
the last confirmed running version still changes only through authenticated
sequence-protected device confirmation. Assignment basis v2 hashes the stored
capability, so a confirmed schedule promotion does not revoke the next target;
pre-revision assignments retain their legacy basis check. Signing, accepted
hashes, hardware, lifecycle, publication and release-authorization gates are
unchanged; the per-release device authorization remains enforced, while the
bootstrap-only release-name restriction was removed.

Validation: 32 fleet/governance and 29 OTA API backend cases and 9 Admin
model/source tests pass, including supersession from every lifecycle state,
failed-commit rollback, stale reviews, latest-target-only offers/grants and
delayed superseded reports. The production frontend build verified all 107
Driving Range assets. Both services were staged at zero traffic as
`*-ota-target-12cf730` (isolated 40-file archive SHA-256
`12cf730f9551f36e6ec14bcd8d9d07f4ec632e2f5f02acb8087cdffcd4a00721`),
verified Ready with unchanged runtime/identity fingerprints and serving
traffic, denied unauthenticated Admin fleet (401) and well-formed device
confirmation (401), and the staged authenticated fleet read showed FRB-0005
selectable. Both were then promoted to 100%; `*-ota-r3-c0d0720` remain the
rollback anchors. Hosting version `ba810bdc550d6501` (release time
`2026-11-11T00:56:32.950Z`) was byte-verified on both origins (127 files).
Production Admin showed FRB-0005 selectable for `OTA-0.1alt-r3`. The rollout
created no assignment or publication.

#### FRB-0005 fresh bootstrap reinstall and CPO assignment — 2026-11-10

To restart the consumed one-time check, the CPO directed a fresh installation.
After a PV8-held USB power application enumerated exact probe
`E66550A147969135`, the same established recovery reused the identical
verified artifacts (no rebuild) and one newly prepared FRB-0005 rotation
`59033669-297d-41e1-a784-8d2af1f018fd`. It erased once, installed and
reboot-verified the protected identity/credential, programmed and read-back
verified `OTA-0.1-r3` (`0.1.0+4`), activated the rotation
(`2026-11-11T01:06:07.449Z`, credential generation 5) and reset normally;
the run exited zero at `01:06:08Z` (17:06:08 Pacific). Placement was
unchanged. The external maintenance task references this operation and its
owner-only credential file, without `--erase`.

At `2026-11-11T01:06:56.576Z` the CPO assigned `OTA-0.1alt-r3` (`0.1.0+5`)
through Admin as deployment `810915b0-af7c-4fe6-9267-7e4cc7e96930`
(`bootstrap_900_seconds`, basis v2), superseding
`18d1f946-f809-43b0-8a02-58925e630add`, whose `assigned` history and
`superseded_by` marker are retained. The next autonomous check is expected
about 900 seconds after the 17:06 boot. At record time no new check, offer,
download, installation or `0.1.0+5` confirmation had occurred; the recorded
running version remains `0.1.0+4` (sequence 1). A post-reinstall button
request was not separately exercised.

#### Verified application rollout and remaining release blockers

- Completion-enabled Admin `fairway-admin-ota-complete-abf92e9` and receiver
  `fairway-button-receiver-ota-complete-abf92e9` are Ready and receive 100%,
  verified `2026-11-10T23:48:16Z`. Their image digests respectively are
  `sha256:8cd877776dd3f5bb10f494f4b35f99f517adb075fe207d0536846905d9da4a35`
  and `sha256:e59ed58dacbed02507aa458b8598761db5963f6dc12e8265291cd31546fc38dd`.
  The isolated 40-file source archive SHA-256 is
  `abf92e931fdecd3807063c365f2ed867d8666a548f7272b1382b1ee278ad3ed2`.
  Both were staged at zero traffic, verified Ready with unchanged runtime/
  identity fingerprints and unchanged prior traffic, then promoted and read
  back. Well-formed unauthenticated Admin and confirmation calls return 401.
  Prior `*-ota-confirm-12eed29` and `*-ota-r2-cb02` revisions remain available.
  Source inventory, immutable revision identities, redacted before/staged/
  promoted snapshots, denial checks, full backend/Python validation and
  unchanged read-only FRB-0005 evidence are retained under
  `/Users/DuplexLoop/.copilot/session-state/4078b11f-7d91-4c26-8b5b-285780cd8598/files/ota-completion-release/`.
  The full backend runner includes atomic commit failure/retry, exact-deployment
  binding, duplicate/stale/older-report protection, retained fleet history,
  legacy completion and invalidation of prior artifact grants after success.
- The initial running-confirmation backend rollout was followed by the final registry-layout Hosting
  release at `2026-11-10T23:28:13.852Z`.
  Admin `fairway-admin-ota-confirm-12eed29` and receiver
  `fairway-button-receiver-ota-confirm-12eed29` were Ready and received 100%
  before the completion-enabled rollout above.
  Their image digests respectively are
  `sha256:272f4b1f4fd15e5e43de6c810be21758c471549447ac376b7932ec8f547c3c2d`
  and `sha256:993711b8720e09f22f3ed43b42db8e5f4da9bd8dcf9b1b513c85785a7877f48b`.
  Both were first staged with no traffic; runtime identities/configuration
  fingerprints matched the prior serving revisions before promotion.
  Prior `*-ota-r2-cb02` revisions remain rollback anchors.
- Hosting version `5eb383e4a44c3d13`, release `1794353293852000`, is live on
  both production origins. All 127 published file hashes and entry/asset cache
  policies were verified on both origins, including all 107 accepted Driving
  Range assets. The other accepted public files are unchanged. Fifteen ignored
  numbered duplicate files copied by Vite were excluded from the isolated release
  snapshot without deleting or modifying the workspace copies. Hosting config
  equals the prior serving version. The first rollout version
  `83b7935f50996e65` and previous baseline `87d3105f0676a782` are retained.
  Publication used the Hosting REST API with the authenticated authorized
  principal, explicit production quota project and verified TLS CA bundle.
- The isolated 40-file backend source archive SHA-256 is
  `12eed29c6feb2a12c13ad7ffff61dfd273c69731183af993ba41068b7aa0211f`.
  Source inventories, redacted runtime/traffic snapshots, staging logs, exact
  Hosting snapshot and per-file production verification are retained under
  `/Users/DuplexLoop/.copilot/session-state/4078b11f-7d91-4c26-8b5b-285780cd8598/files/ota-confirmation-release/`.
  Final Hosting evidence is in its `final-ui/` subdirectory.
  This is dirty-worktree deployment evidence, not Git or remote-backed firmware
  publication evidence.
- The complete backend regression runner passes, including exact-Device
  confirmation authentication, registry projection, duplicate/stale/conflicting
  reports, delayed legacy lifecycle protection and conditional replacement
  selection with preserved active delivery. Seven focused Admin tests and the
  production frontend build pass. Production unauthenticated Admin fleet and
  running-confirmation requests both return 401. The shared authenticated
  browser could not be inspected because the VS Code tools have no connected
  client; no authenticated production confirmation was synthesized.
- Local Python validation passes 119 tests with one skip. Actual OTA manager/
  scheduler/delivery host tests pass 42 cases in each schedule mode, covering primary flash-area ID,
  current-boot health and MCUboot gating, persistent retry/ack and unchanged
  one-time discovery. The real reporting request/acknowledgment code also
  compiles and passes boundary tests for both `0.1.0+4` and `0.1.0+5`, with the
  vendor JSON decoder and transport mocked. The real registration-wait
  function is additionally compiled against blocking pthread semaphore fakes:
  the two-worker deadlock reproduced before the fix, and both registration
  and reconnect now release both boot workers without polling. A successful
  waiter passes the existing registration semaphore signal to other waiters;
  power and registration policy are unchanged. VS Code task/diagnostic tools
  still have no connected client. The CPO explicitly authorized the macOS
  Terminal alternative using the existing builder's hidden prompt. Earlier
  candidates are preserved, not published; final complete-source signed builds
  and independent verification succeeded, as recorded below. No passphrase is captured in
  chat, command arguments, environment or logs.
- Read-only current-state verification finds FRB-0005's existing
  `OTA-0.1alt-r2` deployment `18d1f946-f809-43b0-8a02-58925e630add` still
  `assigned`, with last OTA check `2026-11-10T22:30:49.128Z` and no confirmed
  version. The active assignment and consumed bootstrap guard prevent a new
  assignment until separately authorized engineering reconciliation. No
  assignment, capability, registry or credential record was changed by rollout.
- New r3 publication, old-r2 selectable withdrawal and physical qualification
  remain unperformed at the application-rollout checkpoint. Exact-hash
  acceptance and commit/push authorization have since been granted; release
  publication is recorded separately below. Explicit scope for old-assignment/
  bootstrap reconciliation is still needed. No physical operation or new OTA
  assignment was performed. Commits/push were subsequently authorized and
  completed on the review branch; no merge was performed.

#### Final revised firmware packages — built and verified, not accepted/published

The final packages include both the persisted deployment binding and the
two-worker LTE registration handoff fix. Both use production ECDSA-P256 trust
fingerprint
`sha256:be1c125733db97148309513e75282736024bec3e2b47beb44b7aa3008f4f88eb`.
The existing builder and independent verifier passed signature, version,
credential-exclusion, generated layout/trust and capacity checks. Both are
below the 434,176-byte signed-image ceiling.

| Release | Version | Signed bytes | Signed image SHA-256 |
|---|---|---|---|
| `OTA-0.1-r3` (USB only) | `0.1.0+4` | 281,476 | `a93b4620d119a7d08b253ca76e1dcbe697557f329d2bf262246b742d58d6986d` |
| `OTA-0.1alt-r3` (nightly successor) | `0.1.0+5` | 281,659 | `79e53b5643fcc78cabb152e89eeac4fc1377587dd58b71c51d41c0cb7637275d` |

Final directories under `/Users/DuplexLoop/fairway-builds/` are
`ota-OTA-0.1-r3-production-20261110-r3/` and
`ota-OTA-0.1alt-r3-production-20261110-r3/`. Both record build-source digest
`7db7dfa0a8f8070eb93253cecddc82bce09b66d5585f165ef3041afca52b7051`,
verified against current firmware inputs, based on HEAD
`a99c45cf97de478c5c199381e48e6061d9de5fcd` with authorized uncommitted changes.
The existing `usb-commissioning-20261110-r2` helper passes the independent
verification/pairing checks and exact secure TF-M payload comparison with
the final bootstrap. No helper rebuild or physical operation was performed.
The bootstrap retains its one-time 900-second policy.

Final build logs and verification status are under the completion evidence
directory's `firmware-r3-retry1/`. Earlier local candidates and the failed
unlock attempt remain separate evidence; they are not the final packages.
The CPO subsequently explicitly accepted these exact hashes for the planned
release and authorized publication of the two nightly successors for FRB-0005
only. This approval does not bypass the remote-backup/publication gates.

The additionally requested `OTA-1.0-r3` (`1.0.0+3`, nightly) is now independently
verified at 281,659 signed bytes, SHA-256
`2869c2f47cb1b6a35665235e6b24bacd401aaafe8dfa59f632514d0cf0ebd41d`,
in `/Users/DuplexLoop/fairway-builds/ota-OTA-1.0-r3-production-20261110-r1/`.
It shares the exact firmware-source digest above, records clean source
checkpoint `00530a1a5875c3217e1de7e0368cd8b323fe1173`, and uses the same
verified production trust/layout/capacity. The CPO explicitly accepted this
hash with the bootstrap and 0.1alt hashes. Its build/verification evidence is
under the session's `ota-publication-r3/`.
Original final manifests for all three images are retained in `docs/releases/`;
no binary or secret is a Git input. No further build is planned.

### OTA Administration production deployment (2026-11-09)

CPO explicitly authorized release packaging, no-traffic staging, receiver/Admin
promotion, Hosting publication and non-destructive verification. Firmware
publication, assignment, flashing, physical commissioning and Git commit/push
remain unauthorized and were not performed.

Release source is the production-aligned dirty worktree on
`review/frb0005-increment-1.0-source-checkpoint-20261105`, HEAD
`0f21f5ebf849695b40898253136d4589b525a6a4`. HEAD alone is not the deployed
source identity. Isolated deterministic archives and per-file SHA-256
inventories are retained under the deployment session's `files/ota-admin-rollout/`
directory; archives exclude local environment credentials, signing material,
dependencies and unrelated firmware work.
The exact local evidence directory is
`/Users/DuplexLoop/.copilot/session-state/937dc64a-d76a-44ab-9ebd-392a14f06f80/files/ota-admin-rollout/`;
it includes `release-identity.json`, per-file inventories, before/staged/final
service fingerprints, Cloud Build identities and full Hosting verification.
These are retained deployment artifacts, not a Git commit or a firmware release
record satisfying the separate remote-backup publication prerequisite.

| Release input | SHA-256 |
|---|---|
| `backend-source.tar.gz` | `59f81b595ad926d3efe7a345e4718a47b4c1cfc33a77a0a2235f730bfea07c28` |
| `frontend-source.tar.gz` | `dc94ad651351fa07e86b6ac6d6bf51969ddd216c817ba2433b17c848213da50e` |
| `hosting-artifact.tar.gz` | `d67b9fdfcc7e92343ad8bd02dfe9ebf58208b3d18714fd0d3bd898ee17e59bfd` |
| Backend dependency lock | `b9631f65f38cd45d8fb1b1f52f73d93e79bfc861251300d411bf80dff8cd95e8` |
| Frontend dependency lock | `90a2f6a07104f502ea6ffba6607157d882dbc937dd90b6314b4a0dca24e7fc27` |

| Production resource | Deployed identity |
|---|---|
| Receiver revision | `fairway-button-receiver-ota-admin-59f81b5`, 100% |
| Receiver image SHA-256 | `14eac36752afa9f1b6a7c503076834716948e9547f6d1fe561fd42da20ffaaa4` |
| Receiver Cloud Build | `1605605e-8064-4b34-97ac-14d4ef55fd6e`, SUCCESS |
| Admin revision | `fairway-admin-ota-admin-59f81b5`, 100% |
| Admin image SHA-256 | `6faec16d9a4fed486ce9c87141eb78adb809b125e436435e569bda6b60766c88` |
| Admin Cloud Build | `b1a4f96f-d657-42fb-9365-092fb15f887c`, SUCCESS |
| Hosting version / release | `87d3105f0676a782` / `1794273364645000` |
| Hosting release time | `2026-11-10T01:16:04.645Z` |
| Entry HTML SHA-256 | `c0eb79c3aebc4da687c39a49154d82b180b521a5c0f8ff60607a2b159af9b64f` |
| `assets/index-krLtXbu3.js` SHA-256 | `21da5e9fc37dd10d4d966ffedc890546c200f5f3ff4bdb89ac0deeb4db015f29` |
| `assets/index-DlQhF9OB.css` SHA-256 | `9cfb45a22a62fc9d62414de122384f6f73b19fe19c69d43e6cc0317394e5fd32` |
| `sw.js` SHA-256 | `86d6194ae42ce84119701d1e2eade1cb72b4a771ef6ec12141fa009895dc0685` |

Images reside in the existing `us-central1` project Artifact Registry
`cloud-run-source-deploy` repository under each service name. Both services
were staged with `--no-traffic`, `--revision-suffix=ota-admin-59f81b5` and
`--tag=ota-admin-release`. Before promotion, prior revisions still held 100%.
Runtime contract hashes (identities, environment/secret references, container
settings, invocation/ingress and limits) match before/staged/promoted snapshots.
All previous revision tags remain; neither invocation IAM policy gained bindings.
The existing service identities/origins/entrypoints listed in the alignment
section remain unchanged. No notifier deployment, bucket configuration,
Firestore rules/index deployment or IAM change was performed.

Staging and production verification reused the existing authenticated CPO
browser session, keeping bearer values inside the browser. Read-only calls to
Admin fleet, access bootstrap, Inventory bootstrap and OTA releases/fleet/history
returned 200; six devices/two Customers remained visible. Receiver operator
bootstrap was equivalent to the prior revision: three Courses, push configuration
and notification preferences retained. Dashboard reads returned existing
history and daily/weekly/monthly reporting. Missing/invalid Firebase tokens
returned 401 on staged Admin/Inventory reads; the receiver returned 404 for
Admin OTA routes. Prior local tests cover authenticated non-Admin 403 denial;
no separate non-Admin session was created in production.

After promotion and Hosting publication, the existing authenticated Admin
session loaded the actual Firmware OTA dashboard and performance-report UI.
At 375/430/768/1024/1440 px, all seven Admin sections remained present, OTA had
no horizontal overflow or error alerts, the release selector had only its
placeholder and exact-assignment review was disabled. Canonical Customer/Course
devices and Inventory/Maintenance groups displayed without creating capability
records. The API returned `releases: []` and empty deployment/status history;
all six OTA collections were empty before and after. No device discovery,
schedule, artifact, publication or assignment route was exercised.

Hosting CLI 14.27.0 failed before publication because its separate cached
credentials were expired. The same authorized Google account successfully used
the supported Firebase Hosting REST version/populateFiles/upload/finalize/release
flow, without changing credentials or permissions. Its configuration exactly
matches prior live routing/cache settings. All 127 uploaded files were verified
by decoded SHA-256 and cache policy on both production origins (254 checks),
including all 107 accepted Driving Range files, manifest and service worker.
All 52 established QR destinations returned the deployed SPA; eight additional
SPA route checks passed. No public sign/mapping identity was changed.

No error-severity logs were returned for either new revision during the bounded
rollout observation. This is not an endurance test or physical-phone/Safari
acceptance. No live COMPLETE/Cancel, stock/shift changes, report generation
(which can refresh registers), push send, credential operation or physical
device interaction was induced. Existing regression evidence covers those
mutation paths; live evidence is explicitly read-only.

Rollback anchors remain Hosting `c6a6de50274e48b5`, Admin
`fairway-admin-cartperf-35e7c6c` and receiver
`fairway-button-receiver-roll-26b6201`. Restore Hosting first, then Admin and
receiver traffic as required, preserving tags and credential-operation safeguards.
No rollback was necessary. Rollback does not restore data or revoke firmware.

Next gates are separately authorized private artifact storage/IAM and bearer-path
log protection (including organization/export visibility), corrected nightly
successor qualification, all five publication prerequisites and exact canonical
capability evidence. Only then authorize publication, FRB-0005's first physical
autonomous transition and subsequent recurring transition. Empty-catalog Admin
deployment is complete; Prototype 4.0 physical OTA acceptance remains open.

#### Securing the accepted Admin baseline (2026-11-09)

The CPO accepted the deployed capability and separately authorized a normal
commit/push to `https://github.com/josh-fairwayrefresh/fr-main.git` on
`review/frb0005-increment-1.0-source-checkpoint-20261105`. The baseline commit
contains the production-aligned backend/frontend source, dependencies,
configuration, tests and current owner documentation. Per-file reconciliation
matches all 41 backend and 165 frontend packaged source entries to the recorded
deployment inventories; source identity is the archive digests above, not an
assumption based on ancestry. Public assets and build verification remain
the accepted deployment evidence; generated bundles/archives are not committed.
The published artifact is 127 files, with exact inventories retained as above.

Unrelated firmware work and disposable `scripts/__pycache__` files are excluded
from the Admin baseline commit and left in the worktree. In particular, the
unbuilt recurring-worker correction and its host-test changes are not part of
the deployed backend/frontend baseline and still require their own source
checkpoint/remote backup before firmware qualification/publication.
This commit does not activate `PUBLICATION_APPROVALS`; all five release-specific
publication prerequisites remain required and are not satisfied by an Admin
baseline backup.
Completed commit `11213b4ad0607486df12f28d764f6d6abd90cdb6` was pushed
fast-forward and independently fetched; all 206 packaged source hashes and
Git object integrity passed. `main` and unrelated firmware work were unchanged.

#### Private delivery infrastructure and corrected qualification (2026-11-09)

- **Storage:** `gs://savvy-kit-496703-r5-ota-artifacts`, `US-CENTRAL1`,
  uniform bucket-level access and enforced public-access prevention. Bucket
  grants use project custom roles `fairwayOtaArtifactPublisher` (objects
  create/get) for `fairway-admin-prod@savvy-kit-496703-r5.iam.gserviceaccount.com`
  and `fairwayOtaArtifactReader` (objects get) for
  `936892386735-compute@developer.gserviceaccount.com`. No project-wide storage
  grant was added; default bucket-level project-Viewer convenience bindings
  were removed. Existing owner/editor administration and the receiver's
  inherited `roles/run.builder` get permission remain unchanged.
- **Access evidence:** isolated, temporary Cloud Run job executions
  `fairway-ota-storage-qualification-gq95d` (publisher) and
  `fairway-ota-storage-qualification-qrhnb` (reader) verified actual runtime
  access to one non-firmware canary. Publisher create/get and generation-zero
  retry rejection passed; both identities lacked list/delete, receiver also
  lacked create; anonymous GET returned 403. No impersonation role was granted.
  The canary and job were removed; no live objects or firmware were published.
  Default seven-day GCS soft deletion may retain the harmless deleted probe.
- **Pre-reauth checkpoint (superseded by the activation record below):** On
  2026-11-10 the CPO manually inspected the Logs Router
  for organization `284487864580` and reported that its only displayed enabled
  sinks were `_Default` and `_Required`, neither including child-project logs;
  no additional organization sinks were displayed. This owner-observed console
  evidence supports that organization sinks do not export this project's Cloud
  Run request URLs. At this checkpoint, `gcloud` required interactive
  reauthentication and the organization API inventory could not yet be
  independently retrieved. The project exclusion had been validated on
  2026-11-09, and a nonsecret Receiver artifact-path GET returned HTTP 503
  `artifact_delivery_disabled`. The later authenticated API readback, project
  sink inspection and staged activation are recorded in the next subsection.
- **Production package:** backend archive SHA-256
  `43b4da080f4c69bef2c47d3cff21ea6ca14ab5c7b0c9280f862af656ecf47fd0`;
  unchanged dependency lock. Receiver `fairway-button-receiver-ota-delivery-43b4da0`
  image `sha256:bf91cd69f3ed253e5becdfa19a63e445df1533d76a38066ffbe73f9a1a3c8c1b`,
  build `87410f20-a638-4c9b-98eb-03e8b2ffc58f`; Admin
  `fairway-admin-ota-delivery-43b4da0` image
  `sha256:48d270597204edfc5f75beaa2b9c2cb356b77a5aefff7e75d29bc2d6b808bb99`,
  build `4e835db7-3cec-4dc7-971c-9b31c69a8b7d`. Both are Ready/100%.
  Both bind `FAIRWAY_OTA_BUCKET=savvy-kit-496703-r5-ota-artifacts` and
  `FAIRWAY_OTA_DELIVERY_ENABLED=false` in the original `43b4da0` deployment
  snapshot; the later enablement revision is recorded below.
  Code also defaults closed before token issuance, authorization or streaming.
  An early no-traffic `7aa3cd6` staging
  revision was superseded before promotion; it never served production.
- **Pre-activation verification/rollback:** staged/live authenticated Admin
  and Cart bootstrap returned 200; OTA releases/deployments were empty,
  unauthenticated Admin returned 401, and artifact retrieval returned explicit
  503 while gated. All six OTA collections were empty. No Firestore rules/index/data, Hosting, customer,
  identity or credential mutation occurred. Hosting `87d3105f0676a782` and its
  public assets remain unchanged. Compatible code rollback is receiver to
  `fairway-button-receiver-ota-admin-59f81b5`, then Admin to
  `fairway-admin-ota-admin-59f81b5`, each using the existing
  `gcloud run services update-traffic ... --to-revisions=<revision>=100`
  procedure. Keep the bucket private and log exclusion in place; code rollback
  is not revocation or data recovery.
- **Firmware:** exact successor packages, sizes, source/archive identities and
  qualification limits are owned by [Firmware Specification](./FIRMWARE_SPECIFICATION.md#corrected-successor-qualification--2026-11-09).
  Release-specific approval records must distinguish `build_base_commit`
  (manifest's pre-build HEAD) and `build_source_sha256` from the subsequently
  remote-backed `source_commit` containing the corrected source. Recognizing
  successor IDs/provenance does not by itself accept their bytes. The release-
  specific CPO acceptance and publication authorization granted on 2026-11-10
  are recorded below; publication awaits the reviewed production catalog update.
  Corrected source is backed up on the review branch as recorded in the current
  Alignment Register entry.

Bounded cloud/source evidence is retained in the deployment session's
`files/ota-delivery-qualification/`. No real bearer was generated for logging
validation. See the 2026-11-10 delivery activation record below for final
organization/project sink evidence, service revisions, non-destructive
validation and remaining publication boundaries.
FRB-0005 physical authorization remains separate.

### OTA artifact delivery enablement (2026-11-10)

- **Logging boundary:** independently retrieved the complete organization
  `284487864580` sink inventory. Only enabled `_Default` and `_Required` sinks
  exist; both have `includeChildren=false`. `_Required` filters only audit,
  system-event and access-transparency logs; `_Default` excludes those same
  log IDs and also does not include child-project logs. No organization sink
  exports this project's Cloud Run request logs. The CPO's prior console
  inspection is consistent with the API response.
- **Project request logs:** project `savvy-kit-496703-r5` has the normal
  `_Default` request-log sink with the active, unsampled
  `fairway-ota-artifact-bearer-paths` exclusion:
  `resource.type="cloud_run_revision" AND httpRequest.requestUrl =~ "/api/v1/device-ota/artifacts/"`.
  `_Required` contains audit/system logs only, not Cloud Run request logs.
  Existing application error handling logs fixed error codes rather than raw
  URLs, tokens or transport errors. Earlier harmless marker validation showed
  the artifact path excluded while an ordinary request-log control remained.
- **Private storage:** `savvy-kit-496703-r5-ota-artifacts` reverified with
  uniform bucket-level access and public access prevention enforced. Bucket
  custom roles remain least-privilege: Admin publisher has object create/get;
  Receiver reader has object get. No public object access or project-wide
  storage grant was added.
- **Staged activation:** created Receiver revision
  `fairway-button-receiver-00051-dad` and Admin revision
  `fairway-admin-00062-zuv` with no traffic first. Both were Ready, retained
  their prior image digests and runtime service accounts, and changed only
  `FAIRWAY_OTA_DELIVERY_ENABLED=false` to `true`; bucket and unrelated
  environment/secret bindings were preserved. Staged Receiver rejected a
  non-real invalid token with `403 download_not_authorized`; staged Admin
  returned `401` without authentication.
- **Production promotion:** promoted Receiver first, verified its production
  invalid-token response remained `403 download_not_authorized`, then promoted
  Admin. Both new revisions are Ready at 100% traffic. Current image digests
  remain Receiver `sha256:bf91cd69f3ed253e5becdfa19a63e445df1533d76a38066ffbe73f9a1a3c8c1b`
  and Admin `sha256:48d270597204edfc5f75beaa2b9c2cb356b77a5aefff7e75d29bc2d6b808bb99`;
  runtime service accounts are unchanged. Production Admin API still returns
  `401` without operator authentication.
- **Scope/effect:** no valid artifact token was generated, no real device was
  queried or authorized, and no artifact was requested or downloaded. All six
  OTA collections (`ota_releases`, `ota_assignments`, `ota_deployments`,
  `ota_device_status`, `ota_download_tokens`, `ota_authorization_reviews`)
  were read-only counted at zero after promotion. Admin continues to show no
  published firmware. Delivery infrastructure is enabled and guarded, but the
  empty catalog means this change alone offers no firmware.
- **Rollback:** if a material issue is found before publication, restore the
  Receiver to `fairway-button-receiver-ota-delivery-43b4da0` and Admin to
  `fairway-admin-ota-delivery-43b4da0` using the established
  `gcloud run services update-traffic ... --to-revisions=<revision>=100`
  procedure. Those revisions preserve the delivery-disabled gate. This is a
  configuration/code rollback, not artifact revocation or data recovery.
- **Not authorized/performed:** no OTA release publication, real-device
  assignment, valid download grant, firmware delivery, flash, or physical
  commissioning. Each corrected release still needs its release-specific CPO
  acceptance, complete publication-governance records and explicit publication
  authorization. FRB-0005 physical commissioning requires its separate
  authorization after a published, assigned candidate is confirmed ready.

### Prototype 4.0 corrected successors — CPO acceptance and publication authorization (2026-11-10)

- The CPO explicitly accepted the exact signed bytes and authorized publication
  of both successors for FRB-0005 only:
  - `OTA-0.1alt-r2`, version `0.1.0+3`, SHA-256
    `2f146c14586740fd7b0097e6a67ef2be3e82b20aa7d6b4d8cd792f39ef667844`.
  - `OTA-1.0-r2`, version `1.0.0+2`, SHA-256
    `21fe0f3df7cf775631b1d0af5f534ba35927e099e72b1b3184ee4713c4ba594c`.
- Each signed image is 280,387 bytes against the 434,176-byte effective
  limit (64.579% utilization; 153,789 bytes / 150.185 KiB remaining). The
  immutable build manifests are source-controlled at
  [OTA-0.1alt-r2-manifest.json](./releases/OTA-0.1alt-r2-manifest.json) and
  [OTA-1.0-r2-manifest.json](./releases/OTA-1.0-r2-manifest.json). No signed
  firmware binary or private signing key is committed.
- Both manifests identify pre-build base commit
  `11213b4ad0607486df12f28d764f6d6abd90cdb6` and the corrected 77-file
  firmware source SHA-256
  `47bbaa7c2543469f336e81d91121c49d1334400cc5ac426b20ff8cd44e414dc3`.
  The original qualification build records `source_worktree_dirty=true`;
  the exact source digest is preserved in the remotely backed source commit
  `685cf648fed4e366be37cb8f9861490ec9a31e39`. Both signatures were verified
  against the installed production trust anchor recorded in the Firmware
  Specification.
- This authorization permits publication and exact-device eligibility for
  FRB-0005; it does not create an assignment, download grant, or physical
  commissioning authorization. The OTA 0.1 bootstrap and original historical
  release identities remain unchanged. Source-controlled evidence commits
  `f06cde9e441a3824a9acc6c63cffacf6f2dee5db` (release records/manifests) and
  `cb02beb08b8ab5f1876194e753d0deef1bfe6a6e` (accepted hashes and reviewed
  publication approvals) are on the canonical review branch.
- Both releases were registered through the existing Admin publication API.
  Production release inventory and the Firmware OTA page report them as
  `published` and assignable only for the allowlisted FRB-0005:
  `OTA-0.1alt-r2` SHA-256
  `2f146c14586740fd7b0097e6a67ef2be3e82b20aa7d6b4d8cd792f39ef667844`, and
  `OTA-1.0-r2` SHA-256
  `21fe0f3df7cf775631b1d0af5f534ba35927e099e72b1b3184ee4713c4ba594c`.
  Their exact signed images are private create-only objects in
  `savvy-kit-496703-r5-ota-artifacts`, each 280,387 bytes with
  `private, no-store` cache control and matching release/digest custom metadata.
  No public object URL or direct device download was used.
- Catalog source was staged and promoted to Receiver
  `fairway-button-receiver-ota-r2-cb02` (image
  `sha256:4f79f35740e5db66fa407c9fc6fd3555f0c3550c10395c6495a131fd09b70cb9`)
  and Admin `fairway-admin-ota-r2-cb02` (image
  `sha256:3477ee58d759e3a5b9c7c0df120ef0af7c80b9f0caa47163e515c6480571de87`).
  Both are Ready at 100%, retain their previous runtime identities and
  `FAIRWAY_OTA_BUCKET` / delivery-enabled configuration. Unauthenticated Admin
  still returns 401; an invalid artifact token still returns 403.
- Read-only production Admin checks returned both exact published hashes,
  `assignable=true`, and `authorized_device_ids=["FRB-0005"]`; the deployment
  inventory is empty. No assignment, review, device download grant, valid
  device token, firmware download, flash, or physical commissioning was
  created or performed.
- **Assignment gate discrepancy:** the production Fleet/Admin view currently
  marks FRB-0005 ineligible with “Verified physical OTA initialization and
  compatible trust anchor are required.” The Firmware Specification and
  Device Provisioning Guide record the accepted USB OTA 0.1 installation, but
  production does not currently present sufficient matching
  `ota_capability` evidence to the authorization path. The current eligibility
  rejection is authoritative for assignment; do not infer or backfill
  capability. The fleet view also has no recorded OTA check time, which does
  not prove the PSA-persisted one-time timer's physical state. Resolve through
  the separately authorized canonical physical-commissioning/evidence process
  before attempting the FRB-0005 assignment. If using OTA 0.1's one-shot
  900-second check, arrange the separately authorized evidence-recording
  operation in advance and ensure verified capability evidence plus the
  exact-device assignment are in place before that check occurs.
- Code rollback anchors are the immediately prior delivery-enabled revisions
  `fairway-button-receiver-00051-dad` and `fairway-admin-00062-zuv`.
  Restoring those revisions does not delete the two published Firestore
  records or private GCS objects; it would make the corrected releases
  unavailable to the older backend catalog. Do not delete or overwrite them.

#### Next commissioning increment — proposed authorization scope

The following proposal is retained for lineage; the subsequent authorized
implementation/remaining organization-level blocker is recorded immediately above.

The Admin rollout is accepted; no further architecture/preflight work is needed.
Existing artifact services, reviewed catalog, exact-device review and local
00:30/DST policy remain the implementation. Suggested next authorization:

1. **Delivery infrastructure, before publication:** configure one dedicated
   private GCS bucket with uniform access and public-access prevention; grant
   Admin bucket-scoped create/get and receiver get, preserving existing identities.
   Set only the reviewed `FAIRWAY_OTA_BUCKET` binding. Apply the prepared bearer-path
   exclusion to all applicable sinks; obtain organization `logging.sinks.list`
   visibility and verify independent routing/exports and sanitized application
   logging. Verify this with a separately approved short-lived test grant before
   enabling artifact use. Do not make public objects or weaken auth.
2. **Corrected release qualification, before publication:** separately checkpoint
   and back up the existing scheduler correction/tests; reconcile image-size
   guards to the effective 434,176-byte (424 KiB) MCUboot move-swap ceiling and
   add boundary regressions. Current original nightly images are 280,144 bytes
   (273.578 KiB), leaving 154,032 bytes (150.422 KiB), 64.523% utilization.
   Effective-config evidence/calculation is owned by the Firmware Specification.
   Agree new immutable successor versions for the 0.1alt and 1.0 lines; preserve
   OTA 0.1 and all original artifacts. Then authorize builds/signing and focused
   regression/release verification. No version proposal is approval to build.
3. **Publication gate:** complete firmware verification/testing, explicit CPO
   release approval, Alignment Register recognition, source/release records
   committed/backed up to the canonical remote, and explicit CPO publication
   authorization. Only then add exact reviewed catalog evidence and publish.
   Securing this Admin baseline alone does not satisfy firmware release gates.
4. **Physical commissioning, after infrastructure and first publication:**
   separately authorize canonical FRB-0005 capability evidence, inspect its
   persisted/bootstrap-check evidence read-only, and review/confirm only that
   exact device. Do not assume the one-time 900-second opportunity remains
   available or rearm it silently; if consumed, stop that transition for CPO
   recovery direction. Do not erase/reflash OTA 0.1 as routine setup.
   Demonstrate authenticated download, verification, installation, trial and
   confirmation of the corrected 0.1alt successor, preserved identity/
   provisioning/connectivity, request/COMPLETE/new-transaction operation and
   CPO acceptance. Then separately authorize the corrected 1.0 successor and
   demonstrate the subsequent autonomous update at the canonical local 00:30
   window, including subsequent no-update recurrence and operational acceptance.

Infrastructure and corrected-release qualification can proceed independently,
but publication requires both plus governance; physical assignment/install
requires explicit target/operation authorization. This preparation authorizes
none of those cloud, firmware or physical operations.

### OTA commissioning implementation — local only

The approved Prototype 4.0 sequence is physical USB initialization with OTA 0.1,
then a first autonomous OTA transition to OTA 0.1alt, then a subsequent autonomous
transition to OTA 1.0. These are bootstrap/validation stages, not three equivalent
downloadable releases and not a mandatory three-release path for every future
device. OTA 0.1 is never published or assignable through OTA. Its signed binary
in the accepted package is a build/verification product, not an OTA inventory
entry. The distribution backend/Admin capability is deployed with an empty
catalog; artifact infrastructure and release publication remain gated.
The separate authorized FRB-0005 USB baseline
installation/provisioning is recorded above; this local readiness increment
does not change physical devices or production records.

The release builder `scripts/build_ota_release.py` produces a common,
credential-free merged HEX image for the initial USB installation, a signed
MCUboot OTA image, a release configuration, and a provenance manifest.
`scripts/verify_ota_release.py` independently checks release/version/schedule
identity, artifact hashes and sizes, the generated 432 KiB secondary slot and
effective 424 KiB signed-image maximum,
the actual MCUboot image-header version, and the MCUboot signature. The
builder requires an explicit Fairway-controlled signing key; historical
artifacts signed by the NCS development key and disposable test-key artifacts
are not commissioning candidates. The provenance manifest also records generated HUK,
Protected Storage, NV-counter, and release-schedule configuration.

| Release | Firmware / MCUboot version | Schedule |
|---|---|---|
| OTA 0.1 (USB only) | `0.1.0+1` | One persisted check 15 minutes after the first normal boot |
| OTA 0.1alt | `0.1.0+2` | Configured nightly local 00:30; original worker has the recurrence defects below |
| OTA 1.0 | `1.0.0+1` | Configured nightly local 00:30; original worker has the same recurrence defects |

#### Accepted local production package and source checkpoint (2026-11-09)

The CPO accepted these three local releases. All use production fingerprint
`sha256:be1c125733db97148309513e75282736024bec3e2b47beb44b7aa3008f4f88eb`,
NCS 3.1.1, Nordic toolchain bundle `561dce9adf`, West 1.4.0, and the same
partition layout. This is local acceptance, not field OTA qualification.
Directories below are under `/Users/DuplexLoop/fairway-builds/`; each contains
`<release-id>-ota.signed.bin`, `<release-id>-merged.hex`,
`<release-id>-manifest.json`, and `release.conf`.

| Release | Accepted directory | Signed OTA image SHA-256 |
|---|---|---|
| OTA-0.1 | `ota-OTA-0.1-production-20261109-r2` | `98687914b7ff0b7ab9116a7fff34d525b67c96955f84d06a24bd349538240f40` |
| OTA-0.1alt | `ota-OTA-0.1alt-production-20261109-r1` | `0ba9922abd81af93c721a37ac3d4c7ba2739cef24eaa7e56966c812865089cd4` |
| OTA-1.0 | `ota-OTA-1.0-production-20261109-r1` | `eab949f43a87949708e2764299464521e01688afe3307a1fe2444d92aa8d06b0` |

| Release | Merged HEX SHA-256 | Original manifest SHA-256 |
|---|---|---|
| OTA-0.1 | `1e87d6628fbdc5f034e7224440f23691542d3a61c03528f59b16400d5f7e48d7` | `bc6a1a731d38c036efae28f9ef323870f3a5f254ae581aa052af78b373d05b20` |
| OTA-0.1alt | `c9aa9cbcaabf6b7b746273da9871dae0e9bf959b42bfbb4592b8efbdec33085d` | `0b301c4fd10e7febfd809d209a4b279d9cb5c32bc13c22d2ed3044512fb1c3f3` |
| OTA-1.0 | `080050a560eab1dc1292c78610ee5e9d45e6f4c90d43fefba550584cd05dfd89` | `51a8ac5be84f215c6ed5c906d906dd24ed22dabd0ab07b43e9cf5b5111d39980` |

The original manifests retain source commit
`2d72b5de401b3faecb09a5e86a5410156692d18e`, dirty-worktree provenance, and
historical build-time digest
`6c786dd3257d5c05c4b792fa3d33f90d6473a790036dbc1377f886395433040c`.
That recursive measurement included two ignored historical FRB-0002 HEX
outputs, not build dependencies. They were copied, hash-verified, and removed
from the active tree under CPO authorization. The owner-only archive is
`/Users/DuplexLoop/fairway-builds/historical-frb0002-archive-20261109/`
(directory 0700, files 0600):

- `frb0002_runtime_reliability_candidate_merged.hex`:
  `b0b13741fd0ac78678c6b58a91714e8db2ba56928b68385708eb16becc641a32`.
- `fairway_system_identity_candidate_merged.hex`:
  `779caf8f2b3c469594fdb029b0b33770c86a14af0c063d6eb21563ad5b513f77`.

The corrected source-only inventory has 77 files and SHA-256
`32b121829f00adf9b4fe2b703c74fd66acd6cc9c6696568d660176879f4245b0`.
It is the original input set minus those two outputs, with all remaining
path/content records unchanged; it is **not** the original build-time digest.
No accepted image, manifest, or release configuration was rewritten.

`scripts/build_device_firmware.py::_build_source_files` now selects Git-tracked
files under the application and `boards/`, plus only the explicitly enumerated,
non-ignored OTA development source files while they await staging. It excludes
secrets, build/artifact/cache directories, and generated binary/log extensions
even if force-tracked. Unknown non-ignored development inputs and missing or
symlinked tracked source fail explicitly. Git ignore rules are applied to
untracked inputs; they do not remove legitimate tracked source. Hash records
retain sorted relative Path ordering, four-byte big-endian UTF-8 path length,
path bytes, and file bytes. New OTA manifests label the inventory
`git-tracked+explicit-development-v1` and include the exact path list.

A clean, tracked-only snapshot reproduces the corrected digest. That digest
covers application/board bytes, not release scripts, tests, documentation, SDK,
or toolchain; those source/tooling files must also be included in the checkpoint.
External NCS/toolchain installation, key custody, and release-specific
`release.conf` remain separate reproduction inputs. ECDSA signatures need not
be byte-identical across new builds. The original dirty source commit must not
be relabelled as a future checkpoint commit.

Historical verification remains explicit: `verify_ota_release.py` validates
the original artifacts against their original manifests and signing identity;
it does not compare the manifest source digest to the current checkout.
Post-cleanup verification passed for all three releases using the established
interactive unlock mechanism, with temporary-key removal confirmed. This is
a separate verifier run sharing builder helpers, not an independent verifier
implementation or a new firmware build.

Checkpoint preparation includes only the application/board changes, release
and provisioning tooling, related tests, ignore rule, and canonical owner
documentation. The separately deployable backend/Admin OTA changes remain
local and excluded; generated caches, images, credentials, signing keys,
passphrases, and the historical archive are not Git checkpoint inputs.
Validation after cleanup: nine source-inventory regressions pass; the combined
device/release tooling suite reports 71 passed and one optional
`NCS_INSTALL_DIR`-gated synthetic signing integration test skipped; all 27 OTA
host tests pass. A candidate-tree scan checked 265 files for private-key PEM
blocks, service-account JSON, forbidden artifact/secret filenames, and matches
to the five known local device credentials, with no findings. This bounded scan
does not prove absence of every possible secret format.

The generated flash layout is MCUboot `0x00000–0x0C000`, primary slot
`0x10000–0x7C000`, secondary slot `0x7C000–0xE8000`, TF-M ITS
`0xE8000–0xF0000`, TF-M NV counters `0xF0000–0xF8000`, and TF-M PSA
Protected Storage `0xF8000–0x100000`. Primary and secondary slots are each
432 KiB. The fixed-partition DTS, static Partition Manager file, and generated
map now agree. FRB-0005's read-back-verified installation used the accepted
OTA 0.1 merged image, including its production-key MCUboot. Physical autonomous
OTA verification, activation and confirmation remain outstanding.

Device/API ownership is split between `samples/fairway_power_sandbox/src/ota_*`,
`fairway_backend/cloudrun_receiver/lib/ota/`, `index.js`, and the Admin
`OtaManagement.jsx` view. Backend endpoints include Admin release
registration/listing and exact-device assignment; device endpoints provide
schedule, authenticated discovery, artifact download, and lifecycle reporting.
Before artifact publication/delivery, set `FAIRWAY_OTA_BUCKET`; grant the Admin
runtime identity bucket-scoped object create/get and the receiver object get.
An initial empty-catalog Admin rollout does not require artifact storage.
The short-lived download token currently appears in the artifact request path;
before artifact use, configure and verify Log Router protection for that path
so bearer tokens cannot be retained in request logs or independent exports.
No bucket, IAM, log policy, service deployment or production OTA
assignment was configured by the local readiness work.

#### Prototype 4.0 Admin/distribution readiness — implemented locally

The existing Admin OTA view and `lib/ota/` service remain the single management
path. No separate mobile, release-management or firmware system is introduced.

- Global schema-v2 Admin authorization and existing allowed-origin checks protect
  release publication/inventory, deployment history and exact-device assignment.
  Cart/customer users cannot use these endpoints.
- The CPO dashboard is a two-column approved-release selector and expandable
  canonical Customer/Course/Device tree, plus separate Inventory and Maintenance
  groups. It contains no uploads, manifests, signing controls or arbitrary time
  picker. VSC retains engineering publication ownership through the existing
  Admin-authenticated `POST /api/v1/admin/ota/releases` contract; the dashboard
  never calls that operation. VSC supplies the original release manifest,
  signed image as `artifact_base64`, matching `release_id`, `version`,
  `version_string`, `hardware_ids`, `sha256` and optional notes. No publication
  is authorized by implementation/testing this workflow.
- `accepted_releases.js` pins accepted image bytes/fingerprint, but hash acceptance
  alone is insufficient. `publication_policy.js::PUBLICATION_APPROVALS` is a
  reviewed source-controlled evidence catalog; it is deliberately empty now.
  Publication, assignment, discovery and artifact grants require its release
  entry to match the digest and include verification/testing, explicit CPO
  release approval, Alignment Register recognition, source/release-record commit
  IDs plus designated-remote backup evidence, and explicit CPO publication
  authorization. This evidence is established by the engineering review workflow,
  not self-asserted in an upload body and not verified by a live GitHub API call
  during a device check. Entries also enumerate exact authorized commissioning
  device IDs. The server rejects OTA 0.1 publication independently of this catalog.
  Existing published records are not automatically grandfathered.
- Exact bytes, header version, slot size and original production provenance remain
  verified before private create-only storage. Previously signature-verified
  accepted bytes are allowlisted; this is not a new general-purpose signature
  verifier. Admin/receiver need no signing key. Replacement bytes require separate
  release acceptance and reviewed catalog/provenance updates, never a renamed
  or overwritten accepted package.
- Publication and assignment are independent. Publication states are
  `publishing`, `published`, `publish_failed`; only published accepted images
  can be assigned. A failed publication can be retried with the same accepted
  image. An existing immutable object is reused only when size and stored
  release/digest metadata match; it is never overwritten. An interrupted worker
  left in `publishing` is a stop/inspect condition requiring separately authorized
  operational reconciliation, not an automatic overwrite or assignment.
- `GET /api/v1/admin/ota/fleet` projects canonical `customers/{id}`,
  nested Courses and `devices/{id}`, with OTA reports/assignment evidence.
  There is no separate asset inventory. Device lifecycle alone determines exactly
  one operational category; retired records are not selectable. Inventory and
  Maintenance are headquarters-held, not deployed to a Customer/Course.
  Canonical lifecycle transitions to either state clear active placement;
  legacy retained placement copies are not interpreted as an active deployment
  and are not rewritten by this increment.
- `POST /api/v1/admin/ota/assignment-reviews` takes only `release_id` and
  1–50 unique explicit `device_ids`, never a group selector or arbitrary date.
  Server-side validation resolves each canonical device, verifies physical OTA
  capability/trust, release-specific commissioning authorization, lifecycle,
  Course/timezone and absence of an active assignment. The five-minute,
  Admin-bound review records exact devices, local windows, UTC thresholds and
  eligibility basis. `POST /api/v1/admin/ota/assignment-reviews/{id}/confirm`
  revalidates everything transactionally before creating all deployments,
  exact-device assignments and audit events atomically. Confirmation is idempotent.
  Changed eligibility/window or an expired review requires a fresh review.
  The assignment retains the reviewed placement/trust/timezone basis hash.
  Discovery and existing artifact grants fail closed if that basis subsequently
  changes; the status view identifies blocked delivery. Reconcile such a pending
  assignment through a separately authorized engineering operation rather than
  silently transferring authorization across tenants or changing its window.
  Pre-integration assignments lacking a basis hash are also blocked and require
  inspection; do not backfill evidence or recreate assignments automatically.
  Group membership additions never expand authorization. The old direct
  `/devices/{id}/assignment` route fails closed with `assignment_review_required`.
- Physical OTA capability is non-secret commissioning evidence on the existing
  Device record: `ota_capability: { verified, hardware_id, signing_fingerprint,
  schedule_mode, evidence_record }`. Missing/unverified capability fails closed;
  neither a device ID nor a manually entered firmware-generation label proves
  initialization. No production capability records were written here. Existing
  field credentials are never returned by the OTA fleet read model.
- **Routine policy is fixed at next local 00:30**, using the deployed Course's
  canonical IANA timezone. Inventory/Maintenance use
  the CPO-approved `America/Los_Angeles` headquarters policy, defined by
  `fleet_authorization.js::HEADQUARTERS_TIME_ZONE` and used by the runtime
  without an environment override. This supersedes the earlier unconfirmed
  Pacific assumption; no separate HQ policy decision is outstanding.
  The backend computes DST-aware UTC windows and the review shows both local
  time/zone and UTC. There is no browser-timezone scheduling dependency.
- **Not-before gates eligibility, not device wake-up or installation.** At/after
  that threshold the device can discover the assigned image autonomously.
  The only bootstrap exception is verified FRB-0005 receiving OTA 0.1alt:
  immediate eligibility preserves its installed one-time 900-second check,
  explicitly labeled in review rather than pretending it is nightly.
  Publication does not restart it; an observed completed check blocks a new
  bootstrap assignment. If no check was observed, pending/consumed status is
  unknown, not guaranteed. A consumed check needs separate CPO direction.
- Admin displays backend-received check-in, image offer and artifact-request
  timestamps separately from authenticated device lifecycle reports. Download
  authorization/request is not proof of downloaded bytes, installation or boot.
  `verifying`, `staged`, `activation_pending`, `trial_boot`, `confirmed`,
  `failed` and `rolled_back` remain distinct. Trial/confirmation reports must
  name the assigned firmware version; duplicates do not rewrite the original
  report timestamp. Reports are authenticated device claims, not independent
  MCUboot attestation. Missing reports mean unknown.
- Download tokens expire after 30 minutes, are stored hashed and are rechecked
  against the current assignment and canonical device/release eligibility. Browser access
  to OTA Firestore collections remains denied by the existing catch-all rule.
  Do not expose bucket objects publicly.
- Device OTA responses, including check results containing an artifact grant
  and error responses, are `private, no-store` with `no-referrer`. Application
  artifact/OTA internal-error logs contain a fixed operation/error category,
  never raw storage/transport error text, request URLs or bearer values.
  These controls do not redact platform-generated Cloud Run request logs.
  The release dropdown uses the same accepted-byte, hardware, signing-trust and
  publication checks as assignment, not a weaker UI-only approval flag.

Local validation includes focused OTA route/service/storage tests, existing
backend/frontend regression suites, production-mode frontend compilation and
the real C delivery worker/scheduler in host tests for both schedule modes.
The fleet browser integration uses the actual Admin view/API with fictional
release approvals/devices and in-memory Firestore on loopback, not accepted
artifact publication. It demonstrates cross-Customer/Course, Inventory and
Maintenance selection, partial parent states, collapse/expand preservation,
exact-device review and local-only confirmation. No simulation is a production
record, device check-in or installed-firmware observation.

Prior local validation baseline: 33 host ztests pass in each ONE_TIME and NIGHTLY
configuration; full backend `npm test` passes, including 17 OTA API and
14 fleet/governance tests; all 64 frontend tests and the production-mode build
pass (existing bundle-size advisory only). Full Admin-shell loopback checks
at 375, 430, 768, 1024 and 1440 px show no page overflow or clipped OTA
controls, including the review confirmation. A four-device arbitrary selection
and a five-device all-group review resolve exact fictional IDs; review alone
creates no assignments. These are host/browser results, not Nordic release
compilation, real Firestore transaction contention or physical-phone/Safari
acceptance.

#### Accepted-image scheduler discrepancy and required release lineage

The three accepted manifests share historical source digest
`6c786dd3…`; the verified checkpoint inventory records the original
`ota_delivery.c` SHA-256
`d6696e0249ba5042622cb86ab47fa83742b79594be272e4f4c1285560f6f7760`.
OTA 0.1 enables one-time mode; OTA 0.1alt and OTA 1.0 enable nightly mode.
Source inspection and real-worker host regressions establish:

- Both schedule preparation and the worker stop condition incorrectly treated
  `one_time_complete` as a nightly stop flag. One-time-to-nightly migration
  intentionally retains that flag, so accepted OTA 0.1alt can boot/report after
  the first OTA yet fail to schedule its subsequent nightly update.
- Accepted nightly workers exit after no-update/network-failure handling and
  after release processing, so even fresh nightly state is not recurring.
  The OTA 0.1alt → OTA 1.0 transition and later nightly operation are at risk.
  OTA 1.0 contains the same nightly defects. These are source-confirmed,
  not physically demonstrated failures.
- Local source now mode-gates both completion guards, keeps the nightly worker
  sleeping through successive server-provided windows, and retries unavailable
  schedule discovery with a bounded 24-hour offline backoff. Server-provided
  local 00:30/DST policy is reacquired rather than replacing it with a permanent
  24-hour UTC cadence. Protected-state corruption/save failures still stop
  explicitly, without storage repair. The persisted state format, rollback
  migration, wire protocol, lifecycle manager and power-policy ownership are
  unchanged. OTA 0.1's single 900-second behavior remains unchanged in tests.
- No accepted binary, configuration or manifest has been rebuilt, re-signed,
  overwritten, flashed or published. All twelve accepted package file hashes
  are checked against the protected pre-change archive inventory.
- Recurring qualification needs a corrected OTA 0.1alt-line successor before
  the first autonomous transition, followed by a corrected OTA 1.0-line successor
  for the subsequent transition. New version/build identities and immutable
  packages require CPO agreement; do not silently reuse the accepted names/bytes
  as though corrected. A possible version progression is `0.1.0+3` then
  `1.0.0+2`, **proposal only**, not an authorized build or release.
  Keep the installed USB-only OTA 0.1 unchanged. Complete firmware testing,
  authorized release builds/signature verification, CPO acceptance, Alignment
  Register recognition, source/release-record commit and remote backup, and
  explicit publication authorization before activating catalog entries.

#### Production deployment prerequisites — require separate CPO authorization

1. Reuse the completed 2026-11-09 read-only preflight and established production
   references. Immediately before authorized rollout, recheck serving identities
   and traffic for rollback anchoring, not another provenance investigation.
   The initial deployment performs no real-device assignment or commissioning.
2. Select an isolated, reviewed backend source package/lockfile containing the
   OTA modules and `@google-cloud/storage`, with no local credentials or signing
   material. Use the existing [backend deployment](#backend-deployment) and
   [web deployment](#web-application-deployment) procedures/targets, preserving
   existing production environment variables, runtime identities, CORS allowlist,
   authentication and service entry points.
3. Before artifact publication/delivery (not an empty-catalog Admin rollout),
   configure a dedicated private bucket with uniform bucket-level access and
   enforced public-access prevention. Set `FAIRWAY_OTA_BUCKET` on the services
   that publish/serve artifacts. Grant Admin only required object create/get
   permissions (get supports exact retry validation); receiver requires object
   get. If the services share an identity, document its combined permissions.
   Do not grant public access, object deletion or project-wide Storage Admin.
4. **Security release gate:** configure and verify a supported request-log
   exclusion/redaction or equivalent delivery control that prevents the
   `/api/v1/device-ota/artifacts/<bearer>` path from retaining tokens in Cloud Run
   access logs, application logs, exports and other retention sinks. Cloud Run
   request logging is platform-generated; an application logger filter alone
   is insufficient. Verify against the actual logging configuration and
   short-lived test grants before production artifact use. If that cannot be
   demonstrated without changing the accepted firmware contract, stop for an
   architectural decision rather than enabling artifact delivery with a known
   token leak. Empty-catalog deployment issues no artifact grants.
   The prepared Log Router exclusion object is
   `fairway_backend/cloudrun_receiver/config/ota-artifact-log-exclusion.json`.
   It is enabled and unsampled, matches all `cloud_run_revision` request URLs
   containing `/api/v1/device-ota/artifacts/`, and intentionally has no revision,
   service-name or response-status restriction. Under separate cloud-write
   authorization, add its name/description/filter/disabled values as an exclusion
   on the project's `_Default` sink and every other applicable project,
   folder/organization aggregated or export sink routing these request logs.
   Preserve existing sink destinations, filters and exclusions. A project
   exclusion does not protect an independently routed aggregated sink.
   Inspect intercepting sinks and retention/exports as part of this verification.
   Do not disable all request logging or assume deleting retained entries
   retroactively protects already issued tokens.
5. Verify production Firestore rules deny all direct client reads/writes to OTA
   collections, including token, device-status and authorization-review documents. No new composite
   index is required by the current single-field inventory/history queries.
   Establish separately authorized token expiry-document cleanup/retention;
   expiry is enforced by the API even before cleanup exists. The
   headquarters policy is already fixed to `America/Los_Angeles`; no runtime
   environment variable or further CPO timezone approval is needed. Record
   capability evidence through a separately authorized canonical Device
   commissioning operation, never a duplicate inventory or an inferred label.
6. Deploy only the separately authorized receiver, Admin and production Hosting
   surfaces. Record prior service revisions and Hosting version for rollback;
   code rollback does not undo published objects, assignments or device state.
   Perform no artifact publication or assignment as a deployment side effect.
   Keep the reviewed publication catalog empty for the initial capability rollout.
   Deploy compatible backend services before Hosting, retaining current runtime
   project/origin/mode settings. Do not add a bucket setting until artifact
   infrastructure is separately authorized and configured.
   Record exact service revisions/images, source/lockfile identity, current
   traffic allocations and Hosting version before rollout. Roll back Hosting
   first if necessary, then restore each service's recorded traffic allocation;
   preserve existing credential-recovery safeguards described in the rollback
   procedure. Do not select historical revision names without current preflight.
7. Smoke-test Admin denial for non-Admin users, empty inventory/read-only status,
   existing request/COMPLETE behavior, targeted eligibility and log controls.
   Publication, FRB-0005 assignment and physical OTA qualification then require
   explicit operation-specific authorization and separately accepted corrected
   successor packages; do not use the original nightly packages as though
   they contain the local scheduler correction.
   Do not publish/assign OTA 1.0 or perform rollback testing implicitly.

#### Production source/configuration alignment (2026-11-09, local only)

The CPO established Admin `35e7c6c`, receiver `26b6201`, OTA checkpoint
`0f21f5ebf849695b40898253136d4589b525a6a4` and Hosting
`c6a6de50274e48b5` as the integration baseline. Git ancestry alone is not a
functional compatibility test. Direct comparison against shared base
`97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` found missing production reporting,
Inventory/QR, notification recovery and responsive Cart functionality.
The production delta in the two application subtrees is now integrated, not
a wholesale replacement of the OTA tree. All 252 production-delta files were
accounted for, including tests and accepted public assets. Production-only
behavior is preserved; overlapping entrypoints combine Reports/staff routes
with OTA routes, credential recovery protections and headquarters-held
Maintenance behavior. The shared backend includes the reporting changes
through `35e7c6c`; its receiver entrypoint remains compatible with `26b6201`.
No notifier deployment is included.

`firebase.json` retains the exact production site and SPA rewrite, general
`no-cache`, and `public,max-age=31536000,immutable` for `/assets/**`. The
production build again verifies all 107 accepted Driving Range public assets.
Backend dependency/lockfile alignment retains production PDF/reporting
dependencies and the OTA storage dependency; frontend production dependency
and build contracts are restored. The mobile Admin navigation has seven
columns for Reports plus Firmware OTA, without dropping existing sections.
Publication approvals remain empty; no firmware source or accepted artifact
is changed by this alignment.

Alignment validation: the backend operational/API suite passes, including
33 Admin API, 42 receiver, 29 Inventory operations, 17 OTA API,
20 fleet/governance and 16 performance report tests. Frontend evidence is
95 existing unit tests plus two new
Hosting/empty-catalog checks, all passing. Thirteen selected browser tests
pass for Reports, Inventory/shift/sign-out guards, notification recovery,
responsive Cart layout and the combined seven-section Admin shell.
The new shell regression checks Reports/OTA at 375/430/768/1024/1440 px,
no horizontal overflow, HQ-held Maintenance placement and service-group
preservation on explicit deployment using fictional local data.
Production compilation and the 107-asset check pass; the existing large-chunk
advisory remains. Prior firmware and comprehensive OTA commissioning evidence
is reused, not repeated. These checks do not represent production mutations
or physical-device acceptance.

Deployment continues to use the existing Cloud Run services/entrypoints:

| Contract | Receiver | Admin |
|---|---|---|
| Service / region | `fairway-button-receiver` / `us-central1` | `fairway-admin` / `us-central1` |
| Runtime identity | `936892386735-compute@developer.gserviceaccount.com` | `fairway-admin-prod@savvy-kit-496703-r5.iam.gserviceaccount.com` |
| Runtime environment / mode | `FAIRWAY_ENV=production`, `FAIRWAY_SERVICE_MODE=receiver` | `FAIRWAY_ENV=production`, `FAIRWAY_SERVICE_MODE=admin` |
| Entry function | `fairwayButtonReceiver` | `fairwayAdmin` |
| Prior serving revision | `fairway-button-receiver-roll-26b6201` | `fairway-admin-cartperf-35e7c6c` |

Both project environment variables remain `savvy-kit-496703-r5`. Preserve
all existing environment/secret bindings, invocation settings, limits, traffic
tags and Admin allowed origins
`https://savvy-kit-496703-r5.web.app,https://app.fairwayrefresh.com`; do not
replace them with a partial `--set-env-vars` list. Neither service needs a
bucket setting for the empty rollout. Existing app authorization remains the
boundary on public-invocation services. Deploy isolated reviewed source without
local credentials, `.env` files or signing material.

With separate CPO authorization, stage receiver and Admin revisions with no
traffic, perform nonmutating readiness/authentication smoke checks, promote
receiver then Admin, and deploy Hosting last (`--only hosting`, not rules/indexes).
Use the established `gcloud run deploy` source/function commands with
`--no-traffic` and distinct approved revision tags for this staged rollout;
do not use the immediate-traffic examples elsewhere in this guide unchanged.
Deploy only from the isolated reviewed package and retain its exact source
and lockfile checksums with the rollout record.
Do not probe real-device OTA checks or create production assignments as a smoke
test. On failure restore Hosting version `c6a6de50274e48b5`, then Admin traffic
to `fairway-admin-cartperf-35e7c6c` and receiver traffic to
`fairway-button-receiver-roll-26b6201`, preserving existing tags. These anchors
must still be checked immediately before rollout. Code rollback does not
restore Firestore data.

Artifact follow-on remains gated: project `_Default` retains 30 days and has
no bearer-path exclusion; organization `284487864580` sink inspection requires
`logging.sinks.list`. Receiver's existing `roles/run.builder` includes object
get; it is not evidence that the missing dedicated private bucket is configured.
Do not broaden runtime IAM merely to make the empty dashboard deployable.

An empty, governed Admin capability can be deployed independently of firmware
successor acceptance, once the infrastructure preflight and deployment
authorization are satisfied. Qualified release publication, real-device
assignment and physical commissioning are separate gates, not prerequisites
for locally finishing the Admin UI. No source-only test establishes live IAM,
log-sink effectiveness or production rollback availability.

For initial USB commissioning, separately authorize the target and
operation, confirm the registry identity/credential/customer
association, install the OTA 0.1 merged image by the established USB
procedure, provision the existing backend credential into PSA Protected
Storage through the existing USB CDC-ACM serial port in service mode (see
[USB Runtime UART Console — Verified Development Connection](#usb-runtime-uart-console--verified-development-connection);
no additional UART cable or adapter is required), and verify normal request/COMPLETE
behavior. FRB-0005 has completed those USB/provisioning/functional steps;
do not repeat its erase/flash merely to deploy Admin. Under separate future
authorization, assign OTA 0.1alt only to FRB-0005 through the Admin UI; confirm
download, signature acceptance, trial-health confirmation, post-reboot
stability, identity retention, customer CUST-0002 request attribution,
low-power behavior, and backend reporting. Do not describe the sequence as
physically validated before those observations are recorded.

The Engineering Guide identifies `00022-wxk` as the CPO-designated Stable
Pilot Baseline 1.0 receiver, not as the current live revision. The dated
2026-10-17 deployment record below identifies `00026-kg5` as the receiver
then serving 100% of traffic. A read-only Cloud Run check on 2026-11-07
observed `roll-26b6201` Ready and serving 100%; it also showed tagged
revisions `00031-5mx` (`qr-release`) and `excl-cf7d885` (`excl-release`)
without explicit percentage fields. Thus the apparent `00022` versus `00026`
cross-document discrepancy is resolved as an accepted historical baseline
versus later deployment evidence; the current live receiver is `roll-26b6201`.
The current revision has image digest
`sha256:cf29d45e7f3abe1dc5aa7b8ea69f48473a65e83a9605e466209cb7fe9ef45d56`,
Cloud Run build ID `d4dde314-fdf9-467c-8984-1790b072ad7f`, and source archive
`gs://run-sources-savvy-kit-496703-r5-us-central1/services/fairway-button-receiver/1793654018.090308-b160ecf08cd74872bfb93b8b15d61705.zip`.
The archive metadata creation time is `2026-11-02T21:13:38Z`; the build ID
could not be resolved through Cloud Build, so the exact Git source commit is
unverified. Recheck live service state before any production operation.

OTA Increment 1 and the November 7 boot-health/service-mode correction have
recorded local builds and verification evidence, but are **not physically
OTA-qualified and are not authorized for field deployment**. Their artifact
hashes, exact build provenance, and validation limits remain in the dated
records below. The local OTA candidate must not be described as the firmware
currently deployed on the accepted Pilot 1.1 fleet.

### Operational entry points

- [Environment, service identities, and targets](#current-environment)
- [Production release and change-safety gates](#production-change-safety)
- [Firmware build and physical flashing](#firmware-deployment)
- [Backend deployment](#backend-deployment)
- [Web application deployment](#web-application-deployment)
- [Firestore configuration and deployment boundary](#firestore-configuration)
- [Operational verification](#operational-verification)
- [Rollback and recovery](#rollback-procedure)
- [Device identity and credential procedures](./DEVICE_PROVISIONING_GUIDE.md)
- [Current firmware implementation and OTA limitations](./FIRMWARE_SPECIFICATION.md)
- [Installed hardware and power configuration](./HARDWARE_BOM.md)
- [Physical wiring and service-power isolation](./HARDWARE_ASSEMBLY_GUIDE.md)

## Production Change Safety

Classify each proposed operation before release: Hosting content, Admin
service, receiver service, Firestore rules/indexes, production records or
credentials, or physical firmware/hardware. Authorize and validate each
target separately; a Hosting release does not deploy Cloud Run, Firestore, or
firmware, and a code rollback does not reverse data, credential, or device
changes.

Before any production deployment, migration, credential change, or
administrative operation that can create, modify, migrate, or delete Firestore
records, device identity/credentials, user access, or historical operational
data, the release owner must verify the configured production
backup/recovery capability, its recovery point and retention, and the
applicable restore procedure with the responsible platform owner. This
repository contains no verified backup, restore, export, or point-in-time
recovery procedure or current recovery-point evidence. Until that capability
is independently established, do not claim production data is recoverable or
proceed with a data-affecting operation; obtain CPO and Lead Architect
direction. Do not use code rollback as a substitute for data restoration.
This deployment gate does not replace routine application workflows or
read-only operational checks.

For each release, use a reviewed source revision and build artifact; record
the source commit, relevant worktree changes included, tests, target
project/service/site, approval, and post-deployment evidence. Never deploy an
unreviewed dirty worktree or include unrelated OTA or provisioning changes
without explicit scope approval. Recheck live service traffic, revision/image
identity, Hosting release, environment target, and data/rules compatibility
immediately before changing production.

## Pilot 1.1 Operating State (as recorded through 2026-11-03)

The CPO confirms FRB-0001 through FRB-0005 passed firmware programming,
credential activation, and physical end-to-end testing. FRB-0006's authorized
firmware recovery and credential replacement completed on 2026-10-17.
Subsequent field testing demonstrated a successful button request and COMPLETE
rearm, but intermittent LTE/HTTPS failures remain unresolved; sustained
reliability acceptance is pending.
The CPO confirms products are now fielded; no individual deployment assignment
is inferred from registry `deployed` status or commissioning alone.
Pilot 1.1 is an integrated product milestone. Its original firmware milestone
source is `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`; incorporated
`1.1_tempfix` and per-device recovery build provenance are distinguished in
[the firmware owner](FIRMWARE_SPECIFICATION.md#purpose-and-current-baseline).

The Cart Operator responsive-layout release is live in production as recorded
below. Its deployment/build checks passed, but the authenticated physical
phone/Safari usability check remains pending; see `docs/feature_backlog.md`.
CPO_stats_fix was accepted, merged, and deployed on 2026-10-22. Its production
release record below documents the corrected custom-domain Auth configuration.
The CPO-accepted queue selection and independent On-course / Amenity Areas
update was merged and deployed on 2026-10-23. Authenticated production Admin
and Cart read-only checks are recorded in that release entry. On 2026-10-23,
the CPO confirmed the production FRB-0006 test passed and accepted the released
queue selection and independent Amenity Areas controls.

Deployment and release entries below are retained as audit history. Historical
entries describe the state at the time of each release and do not supersede
current owner documents. Dated records, including statements written as
"current," "pending," or imperative instructions, apply to their recorded
stage only; they cannot grant present operational authorization. Completed
recoveries and one-time exceptions must not be repeated from this history.

## Dated Readiness and Release Evidence

The dated readiness records and Alignment Register below are retained for
audit provenance. They describe only the state and authorization at their
recorded dates; they are not current deployment instructions or proof of
current live state. Current procedures begin under “Purpose and Operational
Procedures” and the
operational sections linked above. Preserve this history when updating the
runbook.

## Cart Request Performance Report production release (2026-11-03)

**CPO-authorized Admin and Hosting release with one CPO-authorized data
write.** Source is `35e7c6c` (`feature/button-report-one-page`: `466b6d5`,
`589eeee`, `1de944c`, `35e7c6c` on `370b2a5`). The Button Activity report is
renamed the **Cart Request Performance Report** (PDF title and Title metadata,
Admin Reports heading, download filenames `cart-request-performance-…pdf`; the
API route is unchanged) and has a redesigned header: title, one
Customer · Course · dates subtitle, four large total tiles as the primary
legend and a compact Button location key. The temperature line shows the
time-weighted 9:30 AM–5:30 PM average ("Avg"), and the rain drop marks only
precipitation from midnight to 5:30 PM; Course weather register rows without
`avg_f` or `precipitation_to_1730_in` are refetched once. Reviewed
`service_days` corrections replace a day's computed first start and/or last
end of service. A Driving Range Request Performance Report was added to the
feature backlog. Receiver, Firestore rules, indexes, firmware and
infrastructure were unchanged.

- Admin revision `fairway-admin-cartperf-35e7c6c` (tag `cartperf-release`) at
  100%; rollback target `fairway-admin-svchours-19f7f29` (tag
  `svchours-release`). Uploaded source (zip SHA-256 `2ae11b32…7956`) matched the
  commit (only `.gcloudignore` and `test/fixtures` excluded); configuration
  identical to the prior revision; 401 unauthenticated and 204 preflight on the
  tagged URL and 401 on the service URL after cutover; only those smoke-test
  401s were logged.
- Hosting version `c6a6de50274e48b5`, release `1793731609557000`; rollback
  target version `66967ac5f95e5070`. Two clean builds of 127 files were
  byte-identical, with 107 Driving Range assets and the protected mapping
  (`23b2c3fa…6b87`) and installation PDF (`f5296676…f425`) unchanged; only the
  JavaScript bundles and `index.html` changed. All 127 files matched byte for
  byte on `app.fairwayrefresh.com` and `savvy-kit-496703-r5.web.app`.
- Data write: `customers/CUST-0001/courses/COURSE-0001/service_days/2026-10-17`
  created (precondition: did not exist) with `start_local: "09:38"`,
  `end_local: null`, `source: "reviewed_correction"`, note "Opening day:
  service started at 9:38 AM (CPO, 2026-11-03)". On the production data
  2026-10-17 becomes 6.9 cart hours (9:38 AM–4:32 PM). Rollback: delete the
  document.
- Backend 14 files and frontend 89 unit plus 28 browser tests passed on the
  release commit.

## Button report one-page layout and service-hours anchoring production release (2026-11-03)

**CPO-authorized Admin-only release.** Source is `19f7f29`
(`feature/button-report-one-page`: `fd115b4`, `19f7f29` on `ea35a5d`). The
Button Activity PDF fits on one page for any range up to 31 days, shows cart
hours to one decimal and total sales in whole dollars (rounded to the nearest
dollar). Service shading now anchors a day's open-ended side to operator
activity: service already ON at the start of the day (including a legacy
pre-2026-10-22 Suspend that expired at midnight without a Resume event, seen
as a Suspend following a Suspend) starts at the day's first operator
Complete/Cancel, and service left ON past the end of the day ends at the day's
last operator Complete/Cancel. On the Tony Lema Course production data,
2026-10-17 changes from 0 to 5.7 hours, 10-22 from 0.1 to 4.4 and 10-25 from 0
to 4.5; no other day in Oct 17 - Nov 2 changes. Hosting, Receiver, Firestore
data, rules, indexes, firmware and infrastructure were unchanged.

- Admin revision `fairway-admin-svchours-19f7f29` (tag `svchours-release`) at
  100%; rollback target `fairway-admin-sales-12f60f0` (tag `sales-release`).
  Uploaded source matched the commit (only `.gcloudignore` and
  `test/fixtures` excluded); configuration identical to the prior revision;
  401 unauthenticated and 204 preflight on the tagged URL and 401 on the
  service URL after cutover; only those smoke-test 401s were logged.
- Backend all passing on the release commit (including a regression test built
  from the production 10/17, 10/22 and 10/25 event sequences).

## Button report title, logo, weather and total sales production release (2026-11-02)

**CPO-authorized Admin and Hosting release with two CPO-authorized data
writes.** Source is `12f60f0` (`feature/button-report-title`: `d97da3c`,
`1888273`, `12f60f0` on `8562756`). The Button Activity PDF is titled
"[Customer name]: Button Request Service Performance", carries the Fairway
Refresh logo, shows each day's high temperature with a rain drop from the new
Course weather register (Open-Meteo), and floats recorded daily total sales in
bold on the 8 PM line from the new Course Total Sales Register. The Admin Course
form gains a geocoded Location field. Firestore rules, indexes, firmware and
infrastructure were unchanged; the Receiver was not redeployed (no changed
Receiver routes).

- Admin revision `fairway-admin-sales-12f60f0` (tag `sales-release`) at 100%;
  rollback target `fairway-admin-hours-26b6201` (tag `hours-release`). Uploaded
  source matched the commit (only `.gcloudignore` and `test/fixtures`
  excluded); configuration identical to the prior revision; 401
  unauthenticated and 204 preflight on the tagged URL.
- Hosting version `66967ac5f95e5070`, release `1793656292240000`; rollback
  target version `1811ea077512804c`. Two clean builds of 127 files were
  byte-identical, with 107 Driving Range assets and the protected mapping and
  installation PDF hashes unchanged; only `index.html` and fingerprinted
  bundles changed, and all 127 files matched byte-for-byte on both origins.
- Data writes: Tony Lema Course (`CUST-0001`/`COURSE-0001`) `course_location`
  set to "San Leandro, CA" (37.72493, -122.15608) via the same Open-Meteo
  geocoding as the Admin form. Its `sales_days` register was seeded with paper
  records 2026-10-17 $1,435.27, 2026-10-18 $1,381.79 and 2026-10-19 $176.91,
  and a `reviewed_correction` of $187.80 for 2026-10-30, where the CPO
  confirmed the second identical $187.80 close-out was a duplicate. Close-out
  records were not modified.
- The CPO generated the Oct 17 report in production (200); the live service
  wrote the weather register and synced close-out days 2026-10-29, -31 and
  11-01 with no errors logged.
- Backend all passing (including new weather and sales register tests) and
  frontend 89/89 on the release commit.

## Report service hours and rolling history periods production release (2026-11-02)

**CPO-authorized Receiver, Admin and Hosting release.** Source is `26b6201`
(`release/report-hours-rolling`): `feature/button-report-service-hours`
(`153109b`, `07345df`) plus `feature/rolling-history-periods` (`55439f7`,
cherry-picked as `26b6201`) on `7c56f13`. The Button Activity PDF shows only
start and end dates, shades in-service time green and gives daily cart hours,
counting only time between each day's own Resume and Suspend changes. Cart
Service History and KPI Week/Month are the last 7 and 30 Course-local days.
Firestore, rules, indexes, firmware and infrastructure were unchanged.

- Receiver revision `fairway-button-receiver-roll-26b6201` (tag
  `roll-release`) at 100%; rollback target
  `fairway-button-receiver-excl-cf7d885` (tag `excl-release`).
- Admin revision `fairway-admin-hours-26b6201` (tag `hours-release`) at 100%;
  rollback target `fairway-admin-layout-c66b99f` (tag `layout-release`).
- Both revisions: uploaded source matched the commit (only `.gcloudignore`
  and `test/fixtures` excluded); configuration identical to the prior
  revisions; 401 unauthenticated and 204 preflight on the tagged URLs; no
  errors logged after cutover, and live operator dashboard calls returned 200.
- Hosting version `1811ea077512804c`, release `1793654166447000`; rollback
  target version `82a8137ff3f6a7f0`, release `1793652774354000`. Clean build of
  127 files with 107 Driving Range assets verified; the artifact was unchanged
  between build and deploy, and all 127 files matched byte-for-byte on both
  production origins.
- Backend 208 passing and frontend 89/89 on the release commit.

## Button Activity report layout production release (2026-11-02)

**CPO-authorized Admin and Hosting release.** Source is
`c66b99f` (`feature/button-report-layout`). The PDF shows completed (solid
dot), service-suspended (open circle) and cancelled (X) saved button requests
on a 6 AM-9 PM axis, coloured by the location label saved on each request, with
the course name, a plain dates line and no notes. Cloud Logging is no longer
read, so Admin exclusion applies to every series. Receiver, Firestore, rules,
indexes, firmware and infrastructure were unchanged.

- Admin revision `fairway-admin-layout-c66b99f` (tag `layout-release`) at
  100%; image digest
  `sha256:b4b8639e27ca72984c608441ca4f638c0fe546e51dc0240480a4c46667c1240b`.
  Rollback target `fairway-admin-rptexcl-7ec07b8` (tag `rptexcl-release`).
  Uploaded source matched the commit; configuration identical to the prior
  revision; 401 unauthenticated and 204 preflight on the tagged and live URLs.
- Hosting version `82a8137ff3f6a7f0`, release `1793652774354000`; rollback
  target version `40cc1fa49fad2c45`, release `1793649938227000`. Clean build of
  127 files with 107 Driving Range assets verified; relative to the prior live
  release only `index.html` and six fingerprinted bundles changed. All 127
  files matched byte-for-byte on both production origins.
- Backend 72/72 and frontend 89/89. The QR sandbox Admin generated a PDF end
  to end with the same commit.
- The production Admin service account's Logging read access is now unused
  and was left unchanged. The Firebase CLI deploy required
  `GOOGLE_CLOUD_QUOTA_PROJECT=savvy-kit-496703-r5` because the local ADC has no
  quota project.

## Button Activity exclusion of suspended presses production release (2026-11-02)

**CPO-authorized Admin-only release.** Source is
`7ec07b8741c9ae562675c9eccc7d7b08b9ae9109` (`feature/button-report-exclusion`).
The Button Activity "empty" series is read from Receiver rejection logs, so
Admin-excluded suspended presses were still counted. Each rejection log is now
paired with its same-device `service_suspended` request received 0-2000 ms
later; the log is omitted when that request is excluded, and unpaired logs
remain counted. The report is served by `fairway-admin`, so only that
service was deployed. The Receiver, Hosting, Firestore, rules, indexes,
firmware and infrastructure were unchanged.

- Admin revision `fairway-admin-rptexcl-7ec07b8` (tag `rptexcl-release`) at
  100%; image digest
  `sha256:1715cc04073165d77c4ed0820c342e041c9a032e0282380b5ade65547da107cd`.
  Rollback target `fairway-admin-excl-cf7d885` (tag `excl-release`).
- Backend 75/75. Replaying real production logs and requests from Oct 31 to
  Nov 2 paired 36/36 rejections one-to-one; Monarch Nov 1 empty dots fall from
  32 to 13, and Oct 31 is unchanged at 4.
- Uploaded source matched the commit; service account, environment, resources
  and scaling were identical to the prior revision. Unauthenticated access
  returned 401 and CORS preflight returned 204, both on the tagged URL and
  after traffic moved; no errors were logged.
- The QR sandbox Admin runs the same commit. Sandbox report generation fails
  on old and new revisions alike, because the sandbox service account lacks
  Cloud Logging read access.

## Full History request date production release (2026-11-02)

**CPO-authorized Hosting-only release after CPO sandbox review.** Source is
`f04bc30c1061c03758f58d8b312849f772cbc3c1` (`feature/history-request-date`,
one commit on the request reporting exclusion release). Full History and
Admin excluded rows now show the received weekday, date and time; on phones
that column is now shown beneath the request name instead of hidden.

- Hosting version `40cc1fa49fad2c45`, release `1793649938227000`; rollback
  target version `3fc2cc810d7a1591`, release `1793648738754000`.
- Frontend 89/89 and browser suite 28 passed, 0 failed, 3 skipped; the
  reporting browser test asserts the visible date fits at 375, 430, 768, 1024
  and 1440 px without horizontal overflow.
- Clean production build: 127 files, 107 Driving Range assets verified with
  unchanged mapping and PDF hashes. Relative to the prior live release, only
  `index.html` and seven fingerprinted bundles changed. All 127 files matched
  byte-for-byte on both production origins; `/`, `/inventory`, `/admin`, a QR
  destination, `sw.js` and the installation PDF returned 200.
- QR sandbox review used Hosting only; no backend, Firestore, rules, indexes,
  firmware, infrastructure or production data changed.

## Administrator request reporting exclusion production release (2026-11-02)

**CPO-authorized integrated release after CPO sandbox acceptance.** Release
source is `cf7d8855b9fb8816f4f332e80918a30be39d0806` on
`release/request-exclusion`: accepted `main` `cee166e` plus the already-live
Inventory menu viewer (`06005e1`, `fbbb23a`) and request reporting exclusion
(`6c0e62b`, `cf7d885`). Global Admins can exclude a History outcome from
reporting and restore it; History, Cart KPIs and Button Activity completed
contributions omit `excluded` requests. Missing `reporting_state` remains
active; any other value is omitted and logged as a warning.

### Deployed identities and rollback

| Surface | Deployed identity | Image / release | Immediate rollback |
|---|---|---|---|
| Admin | `fairway-admin-excl-cf7d885`, 100%, tag `excl-release` | `sha256:326831b1dfa73d856185f0313730cdf57ba9fee61891864f7072acdaea081be7` | `fairway-admin-report-5396b69` (source `eee363b`) |
| Receiver | `fairway-button-receiver-excl-cf7d885`, 100%, tag `excl-release` | `sha256:ec1df2bb8660bdd8a14473f34acb622770481e2bd46ad4a56ad16eff5349ef6b` | `fairway-button-receiver-00031-5mx` (source `98a401f`) |
| Hosting | Version `3fc2cc810d7a1591`, release `1793648738754000` | 127 project files plus 2 Firebase-managed init files | Version `3d703c16d356b247`, release `1793505866839000` |

Both services were deployed from the release worktree with tracked source only
(70 uploaded files each, byte-matching the release commit), as zero-traffic
tagged revisions, then cut over. Runtime identities, environment, secrets,
scaling and the Receiver's managed Node.js 22 base image are unchanged. Because
both services build from the same source, this release also brought Admin up
to the already-accepted service-suspended request handling (`e9eed24`),
body-parser advisory patch (`98a401f`) and notification recovery
(`de08089`), and brought the Receiver up to `de08089`. The notifier, Firestore
rules and indexes, firmware, infrastructure and production data were not
changed. The new excluded-request query uses existing single-field indexes.

### Validation

- Release worktree: backend **74/74**, Firestore Emulator reporting test
  PASS, frontend **89/89**, serial browser suite **28 passed, 0 failed,
  3 skipped** (private-fixture QR tests).
- CPO accepted the Cart UI flow in the QR sandbox
  (`fairway-refresh-sandbox-qr1`, revisions `*-excl-60fd88d`, Hosting
  release `1793643831201000`) using synthetic requests. Sandbox API checks
  confirmed exclusion changed History 6→5 and Completed 5→4 / average
  12→5.5 min, restore reversed it, an invalid state returned 400 and a
  non-Admin returned 403.
- Clean production build: 127 files; all 107 Driving Range sign assets
  verified, mapping SHA-256
  `23b2c3fa1449a79d8d129e8e693602d3ea5cca63ab7401c582f0d73bc9496b87`, PDF
  SHA-256 `f52966769dc155e37097e43fd5df72a3aadee149224994bb3210a768b1f6f425`.
  Relative to the prior live version, only `index.html` bundle references and
  seven fingerprinted bundles changed. All 127 files matched byte-for-byte on
  both production origins after release.
- Before and after cutover: Receiver preflight 204, unauthenticated operator
  bootstrap 401, public QR bay lookup 200, Admin unauthenticated access and
  excluded-list 401. No `ERROR` or 5xx entries on the new revisions. A
  production QR destination rendered the active Yes/No page (not submitted).
- Not exercised in production: authenticated Admin exclude/restore, because
  that would change production reporting data. No production request,
  service state, preference or subscription was created or changed.

## Inventory golfer menu in-app viewer production release (2026-10-31)

**Authorized Inventory-only navigation correction.** Source commit
`28087ed97357de85a5aa7d082776fd8ea8d3244c` changes the Inventory
**Golfer-View Menu** control to open the existing public menu URL in an
Inventory-controlled full-screen iframe viewer. Its accessible close control
returns focus to the opener and preserves the mounted Inventory screen and
operator session. The golfer-facing menu implementation and URL, Inventory
workflows, authentication, and backend contracts are unchanged.

### Hosting identity and artifact preservation

- Firebase Hosting site `savvy-kit-496703-r5`, version
  **`3d703c16d356b247`**, release **`1793505866839000`**. The previous live
  version was `a63610eb954a0104`, release `1793504216107000`.
- The isolated release worktree built **127** controlled project files.
  All 127 files matched byte-for-byte on both
  `https://app.fairwayrefresh.com/` and
  `https://savvy-kit-496703-r5.web.app/`. The prior and new complete artifacts
  have the same paths; only `index.html` and seven fingerprinted build bundles
  were replaced. All **107** Driving Range sign assets remained unchanged.
- The protected mapping SHA-256 is
  `23b2c3fa1449a79d8d129e8e693602d3ea5cca63ab7401c582f0d73bc9496b87`; the
  installation PDF SHA-256 is
  `f52966769dc155e37097e43fd5df72a3aadee149224994bb3210a768b1f6f425`.
- The existing menu route returned HTTP 200 and has no frame-blocking
  `X-Frame-Options` or Content-Security-Policy response header. The existing
  SPA rewrite, no-cache entry policy, and immutable `/assets/**` caching were
  retained. Only Firebase Hosting was deployed; no backend, Firestore, Rules,
  firmware, infrastructure, production data, or service configuration changed.

### Validation

- `npm test`: **89/89 passed**. The focused Inventory viewer and adjacent
  Inventory browser regressions passed **2/2** in the isolated release
  worktree. The new browser test opened the existing menu URL in the viewer and
  closed it at **390×844** and **834×1194**, checking full-screen geometry,
  accessible close focus, preserved Inventory scroll/category/component state,
  and retained operator session.
- The fresh production configuration check and build passed; the build
  verifier confirmed all 107 accepted QR assets. Vite emitted its existing
  advisory about chunks larger than 500 kB.
- The deployed `/`, `/inventory`, and public menu route returned HTTP 200.
  Read-only production browser inspection confirmed the public golfer menu
  rendered. Authenticated Inventory open/close was not exercised in production
  because no production operator test session was available; the exact deployed
  files were verified against the tested build on both Hosting origins.

## Driving Range tab-close guidance production release (2026-10-31)

**CPO-authorized frontend-only correction.** Implementation commit
`9b325fb6122cddafc0ff1ea14745c84d0a5d1efe`, based on accepted source
`43023583c88b2c9671fd2575fb8a18cdece0d724`, replaced the nonfunctional
**Close Window** controls with the ordinary text **"You can close this browser
tab."** on both terminal golfer confirmations. The production request and
retry logic is unchanged.

### Hosting identity and artifact preservation

- Live Hosting version **`e900799fa501018e`**, release
  **`1793422849956000`**, finalized at **`2026-10-31T05:00:49.956Z`** on
  `savvy-kit-496703-r5`. The version contains **154 files**: 152 project
  files and two Firebase-managed initialization files.
- The prior live version `66fdcec2411fb532` was read and merged with the
  production build. All **152 project files** match the merged artifact on
  both `https://app.fairwayrefresh.com/` and
  `https://savvy-kit-496703-r5.web.app/`; the file hashes were verified using
  the Firebase Tools gzip-level-9 upload hash. The existing no-cache entry
  policy, immutable `/assets/**` caching, and SPA rewrite were retained.
- All **107** files under `driving-range-signs/` remain byte-identical,
  including the complete 52-side map and installed PDF. The PDF SHA-256
  remains
  `f52966769dc155e37097e43fd5df72a3aadee149224994bb3210a768b1f6f425`.
  The existing Bay 1A QR destination was not changed. The deployed service
  worker and mapping file are present.
- No backend, Firestore, Rules, firmware, QR configuration, subscription
  preference, production data, or production configuration was changed.

### Validation

- `npm test`: **84/84 passed**. The focused
  `bayConfirmation.browser.mjs` test passed **1/1**. The production
  configuration check and build passed; Vite retained its existing advisory
  about chunks larger than 500 kB.
- The focused browser test verified the exact Yes and No confirmation text,
  success only after the backend returned success, no request for No, no
  Close Window button or `window.close()` call, no automatic navigation or
  reload, and preservation of the same request identity for failed-request
  retry. Both confirmations remained visible and unclipped at **375 px** and
  **430 px**.
- The deployed bundle contains the approved tab-close instruction and no
  Close Window control or script-close call. The existing Bay 1A production
  destination was checked at **375 px**: No displayed **"No service request
  was sent."** and **"You can close this browser tab."**, with no Close Window
  button, horizontal overflow, or subsequent navigation. No request-creation
  endpoint was called; the page's Firebase Identity Toolkit session lookup
  was the only observed POST. The deployed Yes journey was not submitted in
  production, as explicitly required.
- No rollback was required. Physical iOS/Safari validation was not part of
  this text-only correction.

## Driving Range golfer confirmation UX production release (2026-10-31)

**CPO-authorized frontend-only deployment.** Approved application source
`a75e635115848e6b073ded448ee49915514041af` was deployed to the production
Firebase Hosting site `savvy-kit-496703-r5`. No backend, Firestore, Rules,
firmware, QR configuration, subscription preference, or production service
configuration was changed.

### Hosting identity and artifact preservation

- Live Hosting version **`66fdcec2411fb532`**, release
  **`1793421275652000`**, finalized at **`2026-10-31T04:34:35.797952Z`**.
  The version contains **148 files** and serves both
  `https://app.fairwayrefresh.com/` and
  `https://savvy-kit-496703-r5.web.app/`.
- The prior live version `137b7cb36f21b327` was read and merged with the
  approved production build. All **148 deployed files** match the merged
  artifact byte-for-byte on both origins (**296 origin/file comparisons**).
  Existing app-entry/cache policy remains `no-cache`; fingerprinted assets
  remain `public,max-age=31536000,immutable`.
- All **107** files under `driving-range-signs/` remain byte-identical,
  including the 52-side mapping and installed 26-page PDF. The PDF SHA-256
  remains
  `f52966769dc155e37097e43fd5df72a3aadee149224994bb3210a768b1f6f425`.
  The installed Bay 1A URL remains
  `https://app.fairwayrefresh.com/range/Eq4h2a-N5qu4pS4aVSf9BW7Y`.
- The deployed `index.html`, approved Bay Request bundle, and service worker
  were independently checked on both production origins. No backend service
  was deployed: receiver `fairway-button-receiver-00031-5mx` and notifier
  `fairway-request-notifier-00009-seg` remain at 100%.

### Production validation

- The production build passed. Frontend unit tests passed **84/84** and the
  focused confirmation browser test passed **1/1**. The build retains the
  existing Vite advisory for chunks larger than 500 kB.
- Opening the installed Bay 1A destination at a 375 px viewport and choosing
  **No** showed “No service request was sent.” and **Close Window**, produced
  no request POST, and had no horizontal overflow or Reload button.
- One **Yes** submission to the production receiver returned HTTP 200 and
  showed “Thank you!”, “A server will visit your bay shortly.”, and
  **Close Window**, with no Reload button or horizontal overflow. Exactly one
  production `server_request` was recorded:
  `HHnMWTdtpkIvgVPJrpPB`, Bay **1A**, `CUST-0001 / COURSE-0003`, source `qr`,
  received **`2026-10-31T04:40:26.717Z`**. No sandbox request was created.
- The authenticated operator queue showed that Bay 1A request; it was
  completed through the existing **Complete service** action at
  **`2026-10-31T04:41:16.591Z`**. The request is `completed`, the queue
  returned to zero, and the public bay API still reports service available.
- The existing notifier recorded **one accepted** subscription dispatch at
  **`2026-10-31T04:40:29.062Z`**. No preference was changed. This test did
  not produce independent device-level push-receipt evidence; the separate
  2026-10-30 CPO-reported device receipt remains attributed to that earlier
  validation. The focused browser test also verified that a blocked
  `window.close()` leaves each confirmation visible without redirect or reload.
- Firebase CLI's default local authentication did not access the project.
  Deployment succeeded through the established Firebase Tools flow using the
  active authorized gcloud identity and explicit production quota project.
  No IAM, persistent credential, or production authentication configuration
  changed.

## Driving Range activation and installed-QR production validation (2026-10-30)

**CPO-authorized production activation and one controlled request.** The
operator resumed Monarch Bay's existing Driving Range Course through the
authenticated Cart Operator control on 2026-10-30. No source, Hosting,
backend, routing, QR, configuration, or notification-preference changes were
made for activation. The operation ran against documentation baseline
`bb661bf4672313767061e243cee8ddadec9c1e7b`, whose approved application source
baseline is `79940e63c03b0ef5bc3c55173607032e050289e7`; no application
deployment occurred.

### Installed QR destination and preservation

- The CPO supplied the 26-page installation PDF to preserve. Its SHA-256,
  **`f52966769dc155e37097e43fd5df72a3aadee149224994bb3210a768b1f6f425`**,
  exactly matches the published production installation PDF at
  `https://app.fairwayrefresh.com/driving-range-signs/driving-range-installation.pdf`.
- The existing 52 A/B QR destinations therefore remain
  `https://app.fairwayrefresh.com/range/{permanentId}`. No sandbox redirect,
  QR regeneration, sign replacement, or Hosting change was needed.
- All 52 production bay records remained enabled and owned by
  `CUST-0001 / COURSE-0003`; all 52 public API reads returned the matching bay
  number/side, Driving Range Course, and available state after activation.

### Activation and controlled request

- The existing authenticated operator control resumed `CUST-0001 /
  COURSE-0003` on 2026-10-30. The Course's `service_suspension` is cleared and
  its public bay API reports available. The operation did not change Tony
  Lema's service state or any bay identity/configuration.
- Before the test there were no production requests for this Course and no
  active Range request. One Yes submission from the installed production Bay
  1A URL created exactly one production `server_request`
  (`GkLgQsi3Dgh6icB4Ljtj`) at `2026-10-31T03:53:50.231Z`; the golfer page
  acknowledged Bay 1A and the authenticated operator queue showed Bay 1A.
- The request's existing notifier dispatch was accepted for one enabled
  operator subscription at `2026-10-31T03:53:52.539Z`. Three Range
  subscriptions were active: one operator's saved Course preference was
  enabled, and two were disabled. No preference was changed. The CPO confirmed
  visible push receipt on the intended device; the operator browser session
  also showed its existing reminder that push use requires the installed
  Fairway Home Screen app. The device receipt is CPO-reported, not supported
  by an independently captured device artifact.
- The operator completed the request through the existing Complete action at
  `2026-10-31T03:55:28.661Z`. The request is completed, Bay 1A's active
  request pointer is clear, and the operator queue returned to zero. No
  sandbox request was created.

The request, Course state, dispatch result, bay register, and public
availability were verified through read-only production reads after the
2026-10-30 activation test; no application deployment or additional production
test traffic occurred during that activation. The subsequent frontend
deployment and controlled confirmation-flow test are recorded in the
[Driving Range golfer confirmation release](#driving-range-golfer-confirmation-ux-production-release-2026-10-31).
The receiver and notifier identities remain those in the
[notification production baseline](#notification-recovery-production-baseline-2026-10-30)
and [Service Suspended Request release](#service-suspended-request-production-release-2026-10-29).

## Notification recovery production baseline (2026-10-30)

**CPO-reported field operation; notification incident closed.** The approved
source baseline is `79940e63c03b0ef5bc3c55173607032e050289e7` on `main` in
`josh-fairwayrefresh/fr-main`. The CPO reported on 2026-10-30 that the deployed
notification corrections appeared to be operating correctly in the field.
This confirms the CPO's field assessment; no independently captured
device-level notification test artifact was provided or verified for this
baseline. The incident is closed on the CPO's confirmation, not on a claim of
independently observed iPad/Safari notification presentation.

### Production identities

| Surface | Deployed identity | Build / release | Verification |
|---|---|---|---|
| Cart Operator Hosting | Version `137b7cb36f21b327`; release `1793394269175000` at `2026-10-30T21:04:29.175Z` | Production build from approved source `79940e63c03b0ef5bc3c55173607032e050289e7` | 140 prepared application files match byte-for-byte on both production origins; Hosting reports 142 files including two Firebase-managed initialization files |
| Request notifier | `fairway-request-notifier-00009-seg` | Cloud Build `f40a1fad-fc39-4279-b6b1-cd0921cd65c9`; image `sha256:b7538283dcd23891f7af8af9b2f7d10b4f7af90390e31a06b1e22f6541c00b45` | Ready and healthy; 100% service traffic |

Production project is `savvy-kit-496703-r5`. The Hosting release is live at
`https://app.fairwayrefresh.com/` and
`https://savvy-kit-496703-r5.web.app/`. All 134 files from the preceding
Hosting version were retained, with six new fingerprinted assets and the
updated `index.html`; cache configuration was preserved. The approved app
bundle is `assets/index-UsHk4CXl.js`, SHA-256
`82e2cebe5c780084dc0857c51a3f0451d94b3be15780a94e1b7d773f8f35e7d6`.
The root, request deep link and `sw.js` returned HTTP 200 on both origins, and
all 140 prepared artifact files matched byte-for-byte on both origins.

Notifier runtime remains Node.js 22 with entry point `fairwayRequestNotifier`
and runtime identity
`fairway-notifier-prod@savvy-kit-496703-r5.iam.gserviceaccount.com`. The
Firestore `requests/{requestId}` created-event trigger remains
`projects/savvy-kit-496703-r5/locations/nam5/triggers/fairway-request-notifier-108760`
with its existing trigger identity and retry policy. The existing
`qr-release` tag remains mapped to prior revision `fairway-request-notifier-00007-yes`;
the latest serving revision is `fairway-request-notifier-00009-seg`. No
production request, preference, subscription or service-state data was changed
for deployment verification. No `ERROR` log entries were found for the new
notifier revision during the post-release check.

### Automated validation and field evidence

- Backend regression suite: `npm test` passed; all 65 reported Node test cases
  across the backend test files passed.
- Cart Operator frontend unit suite: **84/84 passed**.
- Focused Refresh-triggered subscription-recovery browser test: **1/1 passed**.
- Production frontend configuration validation and `npm run build:production`
  passed. The build emitted the existing advisory about a minified JavaScript
  chunk exceeding 500 kB.
- Post-release checks confirmed Hosting availability, exact served bundle and
  full prepared-artifact hashes on both origins; notifier readiness and
  100%-traffic routing; receiver CORS preflight HTTP 204; and unauthenticated
  operator bootstrap HTTP 401.
- The CPO's 2026-10-30 report that the corrections appeared to operate
  correctly in the field is the field-validation evidence closing this
  notification incident. Independent device-level test evidence (including
  independently observed notification presentation on iPad/Safari) was not
  captured in this release record. Automated/mocked browser tests do not
  replace that evidence. No synthetic production request or push was created
  for verification.

The existing Refresh icon remains the sole subscription-recovery interaction.
It reconciles subscriptions for enabled Customer/Course preferences without
changing saved preferences or adding recovery/status UI. The notification
behavior and incident closure are summarized in the
[UX specification](UX_SPECIFICATION.md); the accepted source commit remains
the reproducible implementation baseline. The notifier rollback revision is
`fairway-request-notifier-qr-db9001e`; the prior Hosting version is
`2f7936fc2d731f71`. No deployment rollback was required.

## Service Suspended Request production release (2026-10-29)

**CPO-authorized integrated production deployment; CPO product acceptance is
pending.** Source is accepted main
`e31b4a963c88639c3277d5c38ff7b6351104c140` in
`josh-fairwayrefresh/fr-main`. Production project is
`savvy-kit-496703-r5`, region `us-central1`.

### Deployed identities and rollback

| Surface | Deployed identity | Image / release | Traffic / health | Immediate rollback |
|---|---|---|---|---|
| Receiver | `fairway-button-receiver-00031-5mx` | `sha256:7c31478ef9b4010b63b3e3d8fc36762e8c643412fb647b9ad07d3c7331a483e9`; Cloud Build `ae517634-88b9-48f7-a99b-e158a42bb4b9` | Ready, Active, ContainerHealthy; 100% | `fairway-button-receiver-qr-db9001e` |
| Notifier | `fairway-request-notifier-00007-yes` | `sha256:5c8815befcd8bd566660764f298dc654d15c0bf3446d266ed1c752a91d8177e9`; Cloud Build `b3d594f4-56f9-4c52-9901-e53fed36306d` | Ready, Active, ContainerHealthy; 100% | `fairway-request-notifier-qr-db9001e` |
| Cart Requests Hosting | Version `2f7936fc2d731f71`; release `1793322691774000` at `2026-10-30T01:11:31.774Z` | 134 application files; 134/134 SHA-256 verified on both production origins | Live at `https://app.fairwayrefresh.com/` and `https://savvy-kit-496703-r5.web.app/` | Version `2e923bc2314454f4`; release `1793289751660000` |

Receiver source archive generation `1793322058582488` and notifier source
archive generation `1793322118169230` each contain 67 uploaded tracked files
that byte-match accepted main. The notifier runs Node.js 22 with entry point
`fairwayRequestNotifier`; its source lockfile resolves `body-parser@1.20.9`.
The existing trigger
`projects/savvy-kit-496703-r5/locations/nam5/triggers/fairway-request-notifier-108760`
retains its Firestore `requests/{requestId}` created-event filter, retry policy,
destination and trigger identity
`fairway-notifier-trigger@savvy-kit-496703-r5.iam.gserviceaccount.com`.
The notifier runtime identity remains
`fairway-notifier-prod@savvy-kit-496703-r5.iam.gserviceaccount.com`; the
receiver runtime identity remains
`936892386735-compute@developer.gserviceaccount.com`. The notifier service
invoker binding remains limited to the trigger identity.

The Hosting artifact was composed from the verified immediately prior release
plus the accepted production build. All 127 prior public files remain; seven
new fingerprinted bundles and the updated `index.html` publish the increment.
All 134 composed files hash-match on both Hosting origins. All 107 files under
`driving-range-signs/`, including the permanent bay signs, mapping and
installation PDF, plus other non-bundle public resources, service worker, and
cache policy are preserved. Entry/deep-link and
service-worker responses return `Cache-Control: no-cache`; fingerprinted
assets retain `public,max-age=31536000,immutable`.

### Staging artifact correction

The first zero-traffic staging attempts created receiver
`fairway-button-receiver-00030-ttw` and notifier
`fairway-request-notifier-00006-nur` from the working directory. Inspection
found that each uploaded source archive also contained the untracked
763-byte Firestore emulator `firestore-debug.log`. The file contained emulator
markers; targeted checks found no authorization header, private-key marker,
access/refresh-token marker, email address, production project ID, or
request/user document path. Neither initial revision received traffic; both
were superseded by the tracked-source-only revisions above. The initial
revisions were confirmed retired with no traffic or tags; both services
remained at 100% on the accepted revisions, and the previous rollback revisions
were preserved. On 2026-10-30, the two retired staging revisions and their
exact source object generations
(`1793321881436564` and `1793321700909882`) were deleted. Before deletion, the
archives were copied to session evidence storage and SHA-256 recorded as
`aa7591aea4f2088b83619d034fabc83aa65f2adc9e5fdb8e0c16ab285a156c1a` and
`17d2e87b3344084d4ff3afc46307d3bb81d32ad25f2b80b8f73ee9dedb8759479`.
No active service, Eventarc trigger, production data, or rollback target was
changed.

### Validation and operational state

- Before deployment, backend tests passed **62/62**, frontend tests passed
  **83/83**, the production-configured build passed, and the focused
  service-suspended browser regression passed **1/1**. The backend production
  dependency audit had zero high-severity findings; 12 moderate advisories
  remain. During engineering closeout, the serial browser suite passed
  **23/23 executed tests**, with **3 sandbox-dependent QR tests skipped** unless
  a private synthetic fixture is supplied. The fixture-enabled run passed the
  QR appearance check, but the two QR integration tests did not match the
  fixture/current sandbox: it contains bay numbers without A/B side data, and
  the Course operator flow rendered Requests rather than the Email sign-in
  field expected by the test. The browser suite's public-menu test had one
  target-closed failure in a fixture-enabled full run; it passed in isolation
  and in the subsequent serial default suite. No product defect or persistent
  Vite contention was demonstrated. The service-suspended browser regression
  passed.
- Both newly deployed Cloud Run revisions are Ready, Active and healthy at
  100%. No `ERROR` log entries were found for either revision during final
  verification. Receiver preflight returned HTTP **204** and unauthenticated
  operator bootstrap returned **401**, both before and after cutover.
- An authenticated, read-only production Requests session rendered at
  375/430/768/1024/1440-pixel viewport widths with zero document horizontal
  overflow and zero clipped interactive controls. The visible Cart service
  remained **OFF** and its active queue was empty. No service control, request,
  preference, shift, inventory, or history mutation was performed.
- Read-only Firestore checks before and after deployment confirmed Tony Lema
  Course `CUST-0001/COURSE-0001` remained suspended and its On-premise service
  remained inactive. No production request or notification was generated.
- Existing source tests establish rejected-request persistence, HTTP 503,
  clear-only action/history behavior, reporting exclusion, and shared
  notification dispatch with delivery-time Course authorization and
  notification-preference checks. Those live paths were not triggered in
  production: doing so would create operational records or push notifications.
  Consequently, live HTTP 503 behavior, a rejected card and its clear/history
  lifecycle, accepted Complete/Cancel, and post-deployment push delivery were
  not demonstrated. Delivery-time authorization/preference enforcement is
  deployed but still needs a controlled test subscription/event for production
  acceptance. No physical device or golfer interaction was used.

### Release artifact note and remaining acceptance

Private evidence is retained under the session artifact directory
`service-suspended-request-prod-20261030/`: prepared file manifest, exact
Hosting-only config, deployment result, and post-release file verification.
The live release is healthy and rollback targets remain available. No rollback
was required. Closeout removed the inspected
`fairway_backend/cloudrun_receiver/firestore-debug.log` and
`scripts/__pycache__/` bytecode files; `.gitignore` now excludes generated
logs, Python cache directories and bytecode. The serial browser command is
`npm run test:browser` from `fairway_webapp/cart_operator_dashboard/`.
Production acceptance remains pending controlled production request and
notification validation and review of the unexecuted checks above. The
fixture-dependent QR integration flows remain unverified until their synthetic
fixture and expected sign-in/course data are aligned.

## Refresh App header icon - production release (2026-10-29)

**CPO-authorized presentation-only refinement; Hosting-only released.**
The prior release below remains the behavior/cache baseline and rollback.

- Baseline main `40afee7296a9b87b5470dc7f7d34f333df9b3467`.
  Implementation **`dd063350c72971f4f97b030242201fad969683ab`**, merged
  through [PR #31](https://github.com/josh-fairwayrefresh/fr-main/pull/31).
  **Deployed main `be70a5e3064624d23709bd48187f4ce2f79f89bc`** has exactly
  the validated tree; current main had not diverged before integration.
- **Hosting `2e923bc2314454f4`**, release **`1793289751660000`**,
  at **https://app.fairwayrefresh.com/**. All **127** live files hash-match
  published artifacts. Permanent signs and all non-bundle public resources
  remain byte-identical. Entry/deep-link/service-worker `no-cache` and
  fingerprinted-asset immutable caching were reverified unchanged.
- The same shared refresh owner now renders an 18-pixel circular-arrow icon
  in each topmost header row, immediately left of the available Admin/Sign out
  controls. No visible label; accessible name and tooltip remain **Refresh App**,
  with an exposed busy state and 44-by-44-pixel targets. Existing responsive
  flexible branding yields on very narrow phones rather than wrapping controls.
  Refresh logic, workflow guards, session ownership and push worker are unchanged.
- The prior **102/102** passing checks and production build apply to this exact
  source tree. After integration, **12/12** focused refresh/banner/operator
  checks and a fresh production-configured build pass. Existing bundle warnings
  remain. Coverage includes Admin/non-Admin control order, icon/accessibility,
  touch targets, desktop/iPad/mobile, warning placement, open-shift reload,
  persisted identity/drafts and interruption guards.
- Authenticated nondestructive production smoke used the actual icon in both
  interfaces. Inventory retains account/context/stored session and its **93**
  products, with Export enabled. Requests retains scoped URL, read-only operator,
  notification preferences and service state; Requests/History navigation passes.
  Both top headers show Refresh App, Admin, Sign out in that order, with no text
  inside the refresh button. At 320/375/430/768/1024/1440, controls align on
  one account row with 44-pixel targets and no clipping or document overflow.
  Bundle **`index-AIk2tkds.js`** is served. No new application/API errors observed.
- No production transactions, shift selection/closeout, stock/audit changes,
  preference writes, service toggles or sign-out were performed. Backends remain
  `fairway-admin-report-5396b69`, `fairway-button-receiver-qr-db9001e` and
  `fairway-request-notifier-qr-db9001e`. No backend/data/firmware/credential or
  unrelated infrastructure changes.
- **Rollback: `8d70fcfa6287e4cb`**, release **`1793288702309000`**,
  source **`818e0dae4f9c6c0b43c7efd6b60510acf55074a2`**. All **127**
  actual previous files were downloaded and hash-verified before publication.
  Use Hosting Release history rollback, or the retained Hosting-only recovery
  config with those exact bytes and the same no-cache/immutable policy.
  Rollback was not executed; no operational-data rollback is needed.
- Private `refresh-header-release` evidence retains production manifests,
  verified rollback bytes, deployment/build/integrated-test logs and cache
  checks; `refresh-header-icon` retains the 102-check gate and rendered screenshots.
  The original working copy remains clean and unchanged. After release, the CPO
  confirmed "looks good. approved" on 2026-10-29 at 09:06 PDT, closing the
  requested final visual acceptance. The consolidated
  [UI-ALIGN-01 milestone](#ui-align-01--cross-form-factor-ui-alignment--operational-stability-2026-10-29)
  distinguishes that acceptance from broader physical Safari/push testing.

## User-initiated Refresh App - production release (2026-10-29)

**CPO-authorized frontend and Hosting-cache correction; live for acceptance.**
This supersedes earlier entry-cache limitations and Hosting identity, not
Inventory ownership, notification architecture or operational contracts.

- Baseline main `de7fcc26589c54914597265fcf134a99bce9e074`.
  Implementation **`9b953f2f363acaa8c167817a6253fea6348d6a24`**, merged
  through [PR #29](https://github.com/josh-fairwayrefresh/fr-main/pull/29).
  **Deployed main `818e0dae4f9c6c0b43c7efd6b60510acf55074a2`** has exactly
  the tested implementation tree. Production-configured builds pass before
  and after integration; existing large-bundle warnings remain.
- **Hosting `8d70fcfa6287e4cb`**, release **`1793288702309000`**,
  **`2026-10-29T15:45:02.309Z`** (08:45 AM PDT),
  **https://app.fairwayrefresh.com/**. All **127** live files hash-match
  published artifacts. Permanent signs and all non-bundle public resources,
  including the existing push-only `sw.js`, remain byte-identical.
- Entry/deep-link responses previously had `Cache-Control: max-age=3600`.
  They now have **`Cache-Control: no-cache`**: browsers may store an entry
  but must revalidate before reuse. Fingerprinted `/assets/**` responses use
  **`public,max-age=31536000,immutable`**. Actual root, scoped Inventory,
  Admin, request deep-link, service-worker and versioned-asset headers were
  checked after publication. Only Hosting was deployed. The private release
  configuration is asserted equal to tracked `firebase.json`'s Hosting owner,
  apart from the isolated publication-directory path.
- One `AppRefresh` component owns the user-initiated network probe, guarded
  same-URL reload and explicit failure UI in both Inventory and Cart Requests.
  Existing workflow state supplies interruption guards; `InventorySession`
  checks this account's persisted pending submissions across Courses.
  Open shifts are allowed without closeout. No storage clearing, logout,
  subscription removal, shift mutation or automatic reload is introduced.
  [UX ownership and safety behavior](UX_SPECIFICATION.md#user-initiated-refresh-app)
  are canonical.
- **102/102** relevant frontend regressions pass. New evidence includes a
  warm-browser two-release entry/versioned-asset transition with simulated
  standalone mode, retained URL/auth cookie/Inventory UUID/open shift/draft,
  storage/preferences, offline/HTTP-error retention, safety recheck after
  a delayed network probe, corrupt storage and another Course's pending
  submission. Actual Inventory guards protect product edits and closeout;
  actual Requests guards protect request, service and notification mutations.
  Existing reporting, request, operator/closeout/sign-out, notification and
  responsive mouse/touch workflows pass unchanged.
- Authenticated nondestructive production smoke passes the actual Refresh App
  button in **both interfaces** without cache disabling or reinstall.
  Inventory retains the same scoped URL, account and stored session, loads
  **93** products and enables Export. Requests retains scoped URL, read-only
  attribution, notification checkbox preferences and service state.
  Requests/History, Inventory and Admin Button Activity report navigation remain
  accessible. Phone/iPad/desktop checks at 375/390/430/768/1024/1440 show no
  overflow or clipped controls and maintain 44-pixel targets. New bundle:
  **`index-Ccrjmwgi.js`**. No new application/API errors observed.
- No production operator selection, closeout, stock/audit mutation, request
  completion/cancellation, service toggle, preference change or sign-out was
  used for smoke. Open-shift and interruption behavior is isolated automated
  evidence, not a live operational transaction. Backend revisions remain
  `fairway-admin-report-5396b69`, `fairway-button-receiver-qr-db9001e` and
  `fairway-request-notifier-qr-db9001e`. No backend, database, Auth configuration,
  firmware or infrastructure outside the authorized Hosting policy changed.
- **Rollback:** prior finalized Hosting **`192d0bce8df085dd`**, release
  **`1793251411572000`**, application source
  **`376350de83a6acdcd3a92313737d60224264209b`**. All **127** actual
  previous files were downloaded and hash-verified before publication.
  Hosting Release history rollback restores that version's original content
  **and cache configuration**; the retained Hosting-only recovery configuration
  can alternatively republish those exact bytes with the original policy.
  No data rollback is required. Rollback was not executed.
- Private `app-refresh-release` artifacts retain before/after Hosting manifests,
  hashes/recovery files, cache-header evidence, build/test/deploy logs and
  Hosting-only release/recovery configurations. The original working copy
  remains unchanged and clean; its former seven optional harness/stale-note
  edits were already abandoned under separate CPO direction.
- **Remaining physical acceptance:** on the actual installed iPad/Safari app,
  obtain this increment once, then use Refresh App across a subsequent release
  without reinstalling. Check authentication, Course, push delivery and an open
  shift under normal CPO operations. Also check offline retention and interrupted
  work guards. Desktop automation simulates standalone mode; it is not iOS
  installation, lifecycle or physical push-delivery proof. An already-running
  pre-increment client cannot show the new control until it first loads the new
  entry. No claim is made that technical smoke closes physical CPO acceptance.

## Responsive Inventory banner - production release (2026-10-28)

**CPO-approved and Hosting-only released.** The CPO confirmed physical
iPad/Safari validation completed before authorizing commit, push, integration
and deployment. This record supersedes the previous Hosting identity, not
notification, operator, backend or data contracts.

- Baseline main `eb370a77d5c2044afd4af89486bd8f4f823dc09e`.
  Implementation **`a90e5adf7507ec4c34981b90d08101ae36c28b09`**, merged
  through [PR #27](https://github.com/josh-fairwayrefresh/fr-main/pull/27).
  **Deployed main: `376350de83a6acdcd3a92313737d60224264209b`.**
  Merge tree equals the tested implementation tree; no intervening main work
  or conflict resolution was incorporated.
- **Hosting `192d0bce8df085dd`**, release **`1793251411572000`**,
  **`2026-10-29T05:23:31.572Z`** (October 28, 10:23 PM PDT), at
  **https://app.fairwayrefresh.com/**. An explicit production project and
  Hosting-only configuration publish the integrated production build.
  All **127** served files match the published artifacts. The former unused
  stacked-logo bundle asset is no longer emitted; all existing non-bundle
  public resources, permanent Driving Range signs, mapping and installation
  PDF are preserved byte-for-byte.
- One Inventory header implements the approved desktop, iPad and mobile
  white/gold/green design with horizontal branding. Course selection, scoped
  Cart Operations navigation, entitled Admin, account email and guarded
  sign-out remain intact. Export uses the same handler and pending/unresolved
  guards. Sales Today/operator selection, closeout and audit remain in the
  existing workspace panel. Cart Requests and its notification strip are not
  redesigned. The [UX owner](UX_SPECIFICATION.md#persistent-cart-stock-staff-audits-and-shift-close)
  records accepted presentation and responsibilities.
- **100/100** relevant frontend regressions pass, including 320-1920 CSS pixel
  Inventory banner geometry, long Customer/Course names and account email,
  entitlement/single-Course variants, scope navigation and existing trusted
  mouse/touch drag workflows. Existing notification, request, operator,
  closeout, guarded sign-out and reporting regressions pass.
  Production-configured builds pass before and after integration; existing
  bundle-size warnings remain. No source diagnostics or diff whitespace errors.
- Authenticated nondestructive production smoke passes session restoration,
  Inventory layout at 375/390/430/768/1024/1440, controls at least 44 pixels
  tall with no document overflow/clipping, the existing **93** product
  articles, idle operator and scoped Cart Operations return. Requests/History,
  read-only operator attribution, approved notification heading and Admin
  Button Activity report generation pass on the new bundle
  `index-CO5im2Qf.js`. No new observed application errors or failed API responses.
  Navigation-aborted Firestore listeners are not application/API failures.
  Existing entry caching may require refresh/revalidation, as documented below;
  smoke used cache-disabled navigation to verify the released bundle.
- **No production transactions or preference changes:** no operator selected,
  shift opened/closed, audit submitted, stock changed, request completed,
  service toggled or account signed out. Those mutation flows retain passing
  isolated regressions. CPO-confirmed physical iPad/Safari validation is recorded
  as supplied; automated smoke is not a new physical-device delivery test.
- Backends unchanged: Admin **`fairway-admin-report-5396b69`**, Receiver
  **`fairway-button-receiver-qr-db9001e`**, notifier
  **`fairway-request-notifier-qr-db9001e`**. No schema, Auth, firmware or
  infrastructure changes.
- **Rollback:** prior finalized Hosting **`8e2bb1f419075003`**, release
  **`1793249285768000`**, application source
  **`26f8927a634f373ec2f5927f5b8a162a7c2f0864`**. It retains the accepted
  notification and operator workflows. All **128** actual prior served files
  were downloaded and hash-verified before publication. Use the existing
  Hosting Release history rollback for that version; a retained Hosting-only
  recovery configuration can alternatively republish those exact bytes.
  No data rollback is required. Rollback was not executed.
- Private `inventory-banner-release` evidence retains before/after Hosting
  manifests, verified recovery/published files, tests/build/deploy logs and
  explicit Hosting-only production/recovery configurations. All seven unrelated
  dirty harness/release-note files and prior worktree checkouts are preserved.

## Responsive notification strip - production release (2026-10-28)

**Hosting only; the newer CPO-approved notification prototypes are implemented
and live, not merely static review artifacts.** This record supersedes older
frontend review-only status and Hosting identities below. It does not change
backend, firmware, operational data or physical-device acceptance.

- Authorized baseline: main `31b0a352cbf71c7cb48f73a17edb74433562be7f`,
  merged through [PR #24](https://github.com/josh-fairwayrefresh/fr-main/pull/24)
  with accepted operator dependency `59384bbda49445f160273576249fa598f25d7824`
  and responsive banner `496a6f726485c66d157ba17e5d62c50d6bbdca8d`.
  The prior Hosting **`f44449d61317858e`**, release **`1793247486180000`**,
  served the exact approved banner artifacts. The integration itself correctly
  did not redeploy equivalent artifacts.
- Notification implementation `f57a83f4bb12d006a689385f656f69f9af83afca`
  is merged through [PR #25](https://github.com/josh-fairwayrefresh/fr-main/pull/25).
  **Deployed application source: `26f8927a634f373ec2f5927f5b8a162a7c2f0864`.**
  Its tree equals the tested implementation tree. The compact desktop/iPad
  row and stacked mobile preferences have one `NotificationSetup` owner;
  presentation is owned by the [UX specification](UX_SPECIFICATION.md#cart-operator-push-notifications-source-behavior-and-dated-physical-validation).
  No new notification delivery or dismissal lifecycle is introduced.
- **Hosting `8e2bb1f419075003`**, live release **`1793249285768000`**,
  **`2026-10-29T04:48:05.768Z`** (October 28, 9:48 PM PDT), at
  **https://app.fairwayrefresh.com/**. Firebase Tools deployed **Hosting only**
  with an explicit project and Hosting-only configuration. All **128** served
  files match the integrated production build and preserved public resources.
  Permanent Driving Range signs, mapping and installation PDF are unchanged.
- **99/99** relevant frontend regressions pass. Coverage includes 320-1920 CSS
  pixel notification geometry, approved 56-pixel desktop/iPad and 146-pixel
  two-Course mobile examples, label/checkbox order, 44-pixel Course targets,
  long/additional Courses, unavailable/permission/error/retry transitions,
  unchanged preference/subscription contracts, banner/navigation, reporting,
  requests and Inventory-owned operator/closeout/sign-out workflows.
  Production-configured builds pass before and after integration; existing
  large-bundle warnings remain.
- Nondestructive authenticated production smoke passes session restoration,
  notification layout at 375/390/430/768/1024/1440, Requests/History navigation,
  Inventory's existing **93** product articles, idle read-only operator
  attribution and Admin Button Activity report generation. Capability guidance
  appears on focus and disappears on blur without changing preferences.
  No new observed application errors or failed API responses. No preferences,
  service state, requests, inventory, staff or shift records were changed.
  Live account sign-out/shift transactions and physical iPad/Safari push
  delivery were not exercised; isolated functional coverage is not physical
  device acceptance.
- Existing entry-page HTTP caching is **`max-age=3600`**. One previously visited
  query URL initially reused its pre-release browser-cached entry bundle;
  explicit revalidation/reload loaded the new bundle. Fresh/revalidated live
  files match the release. Users with an already-open/cached page may need a
  refresh with cache revalidation. No cache/infrastructure change was made.
- Admin remains **`fairway-admin-report-5396b69`**, Receiver
  **`fairway-button-receiver-qr-db9001e`**, notifier
  **`fairway-request-notifier-qr-db9001e`**. No backend, schema, Auth,
  infrastructure or firmware deployment; no synthetic production transactions.
- **Rollback:** retained finalized Hosting **`f44449d61317858e`**,
  source **`496a6f726485c66d157ba17e5d62c50d6bbdca8d`**, compatible with the
  accepted operator workflow. Use the existing Hosting Release history rollback
  for that exact version. All 128 actual previous served files were downloaded
  and hash-verified before publication; an explicit Hosting-only recovery
  configuration permits republishing those exact bytes if needed. No data
  rollback or backend change is required. Rollback was not executed.
- Private release evidence is retained in the session's
  `notification-strip-release` directory: before/after Hosting manifests,
  verified recovery and published bytes, production build/test logs, responsive
  screenshots, Hosting-only configurations and release script. All seven
  unrelated dirty harness/release-note files and existing worktree checkouts
  are preserved; they were not included in the release.

## Inventory-owned operator workflow - local implementation review (2026-10-28)

**Review-branch source only, undeployed; not CPO acceptance.**
The accepted reporting baseline and verified remote main are
`3ec5a8df4a0da4c992f850be567839b95c21f32e`. Local isolated branch
`fix/inventory-owned-operator` starts there. Abandoned PR #23 was not merged,
cherry-picked or incorporated wholesale; its branch/history are preserved.

- Inventory alone owns operator selection/change and shift closeout. Requests
  displays its scoped name read-only and remains actionable without selection
  or successful inventory-status/staff loading. Existing session storage key,
  UUID, backend transactions, attribution, independent audit approval, accounting
  and report owners remain intact. Closeout before stock activity is available
  so the sign-out requirement cannot trap a newly selected operator.
- One authentication boundary guards all application sign-out controls,
  including Admin and access-status views. The existing authorized session
  read verifies every recorded Course session for this UID/browser session.
  Active shifts and pending operations link to their scoped Inventory page;
  read/storage errors prevent unverified sign-out. No shift is implicitly
  closed and no recovery state is cleared by sign-out. Cancelled checks cannot
  later sign out. This does not introduce account-wide shifts/cross-tab identity,
  nor prevent externally expired/revoked Auth or deliberate browser-data removal.
- Isolated frontend regression gate: **98/98 pass**, serial local tests.
  Eight focused workflow/wiring cases exercise actual Requests/Inventory links,
  reload and existing UUID restoration; independent Customer/Course/deep-link
  scope; no Range inventory context; Inventory-only correction/closeout;
  no-operator Complete/Cancel; cached/failed/corrupt session recovery;
  open/empty/pending/error sign-out including Admin and another Course;
  cancellation, 4xx rejection, lost close response and exact same-operation
  recovery; delayed reads/draft preservation and closed-shift non-resurrection.
  Existing stock, audit, attribution, exported workbook and pointer/touch
  workflows also pass. Widths 375/430/768/1024/1440 remain within the viewport.
  Three deployed-sandbox browser suites were intentionally not run.
- In-memory backend regressions: **13 report cases**, **36 Inventory/API
  cases**, and **2 release-compatibility cases** pass (17 top-level Node runner
  entries, with the Inventory suites reporting their own inner cases).
  The original retained-export fixture still matches **116 suspended attempts,
  63 completed requests**, all daily totals and 179 original plotted records;
  PDF output remains landscape Letter. No reporting or backend source changes.
- Production-configured frontend validator/build pass with the existing bundle
  size warnings. Editor diagnostics and whitespace checks pass. Private local
  evidence is retained in session artifacts named
  `inventory-owned-operator-regression-final.log`,
  `inventory-owned-operator-backend.log` and
  `inventory-owned-operator-build-final.log`.
- CPO authorization permits one commit and push of this review branch only.
  No merge, deployment, runtime/IAM/configuration change,
  production transaction or physical-device action is performed. Production
  remains exactly at the reporting release below. No physical iPad/Safari/PWA,
  real Firebase sign-out, customer-device or browser-restart acceptance is
  claimed; automated checks use synthetic users/APIs and preserved session
  storage/reload. Existing browser-session persistence is not replaced.

## Admin Button Activity Report controlled production release - 2026-10-28

**Released through merged [PR #21](https://github.com/josh-fairwayrefresh/fr-main/pull/21).**
This record supersedes the earlier report-review status and the previous
Admin/Hosting identities below, not the existing inventory, staff or
Course-operation contracts. Publication completed October 28 PDT
(`2026-10-29T00:38:20.546Z`). Only **Admin and Hosting** were deployed.

### Source, runtime and Hosting identities

- Accepted starting head `d6a990b3990f72ebf053a91efa856c10ac4b1bc7`;
  corrected review head **`eee363bfdafaf982e35bf68482d342d8a2edaaea`**.
  The sole presentation correction removes the uncertainty suffix from each
  legend label: device IDs only, unchanged stable colors and historical data.
  Verified main/origin main remained `94fafa7e95292e0aa11b210df807a3ecd57d3d42`
  before the exact-head guarded merge; no intervening integration was required.
- Merge and deployed application source:
  **`5396b69366c8cbd64142fac1c0f0b8403295246d`**. Merge tree equals the
  validated corrected tree; candidate and merged production builds match.
  All **66** uploaded tracked backend files match that merge byte-for-byte;
  historical test fixtures are excluded from the runtime upload.
- Admin **`fairway-admin-report-5396b69`**, Ready at **100%**.
  Image:
  `us-central1-docker.pkg.dev/savvy-kit-496703-r5/cloud-run-source-deploy/fairway-admin@sha256:75d12aa9138a16f6a6c4f6127be83a2a44c6281429b3e18a9c664abf0ae03d6c`.
  Source:
  `gs://run-sources-savvy-kit-496703-r5-us-central1/services/fairway-admin/1793233316.798025-4ab50c3b002e4d169639577bfd079fdd.zip#1793233317049602`.
  Existing runtime identity
  `fairway-admin-prod@savvy-kit-496703-r5.iam.gserviceaccount.com`,
  production environment, origins, concurrency, timeout, resources, scaling,
  ingress and application-level Firebase authorization are unchanged.
  It was staged at **0%** with tag `button-report-release`; verified report
  generation and access denials preceded traffic cutover.
- Hosting **`e51a5e6d10cd84ac`**, live release **`1793234300546000`**,
  **`2026-10-29T00:38:20.546Z`**. All **128** served custom-domain files match
  the local merged production artifacts. Entry, installation PDF and register
  also match the secondary `web.app` origin. Existing CLI login/ADC refreshes
  were expired; publication used the existing authorized gcloud identity's
  short-lived access token through Firebase Tools with explicit production
  quota project. No credential, provider or runtime authorization replacement.
- Receiver **`fairway-button-receiver-qr-db9001e`** and notifier
  **`fairway-request-notifier-qr-db9001e`** remain unchanged at **100%**.
  No trigger, Rules, index, firmware, Auth, entitlement or sandbox deployment.
  The existing five request indexes are Ready; the report reuses
  `customer_id ASC, course_id ASC, received_at DESC` with implicit descending
  document name. Existing trigger identities and notification contracts remain.

### Actual-runtime permissions and release gates

The staged real Admin request initially failed explicitly, rather than
returning a zero report. The runtime lacked the documented Logging reads.
Only the following grants were added to its existing service account:

1. `roles/logging.viewAccessor` on exactly
   `projects/savvy-kit-496703-r5/locations/global/buckets/_Default/views/_AllLogs`.
2. Custom project role
   `projects/savvy-kit-496703-r5/roles/buttonReportRetentionReader`, containing
   only `logging.buckets.get`, with binding condition
   `resource.name == 'projects/savvy-kit-496703-r5/locations/global/buckets/_Default'`
   (title `button-report-default-retention`).

No project-wide log-reader, writer/Admin, impersonation, new view or ingestion
pipeline grant was added. Existing `_Default` retention is **30 days**.
After IAM propagation, generation through the **actual attached runtime**
and a normal existing authenticated Admin session returned **200**.
No impersonation or interactive user's Logging credential supplied runtime
access. Unsigned requests returned **401**; a normal signed-in ordinary
Customer returned **403 Admin access required**; a forged Customer/Course
pair returned **404**. The live canonical endpoint also rejects unsigned
requests with **401**. Access checks made no operational transactions.

- Reused accepted validation: 13 report tests, existing backend regressions,
  83 serial frontend checks, DST/pagination/failure/limit cases and rendered
  continuation layouts. Correction-specific tests, browser workflow and
  production-configured build pass. The original fixture still reconciles
  **116 / 63**, all 12 daily pairs and **179** receipt identities/coordinates
  at its original start/as-of boundaries. The committed sample now has
  device-only labels, not supplied hole labels.
- Before cutover, actual staged production PDF at
  **`2026-10-29T00:26:33.080Z`** reconciled **120 suspended attempts / 63
  completed requests** against independent read-only queries.
- After publication, normal Admin **Reports -> Customer -> Course -> dates ->
  Generate -> Download PDF** succeeded without a stubbed backend. The actual
  downloaded landscape Letter PDF is **792 x 612 points**, one page, 15,006
  bytes, as-of **`2026-10-29T00:38:52.006Z`** (October 28, 17:38:52.006 PDT).
  Monarch/Tony Lema, October 17-28: **120 / 63**. All **120** matching log rows
  and **83** request-source rows were retrieved (one request page); filtering
  yields **183** plotted records. Independently queried finished-model
  rendering has the identical complete 1600-pixel PNG hash as the actual
  runtime PDF, verifying every plotted point, daily count and label.
  Daily empty/completed pairs:
  `0/19, 8/12, 30/3, 2/1, 6/3, 4/3, 18/6, 10/9, 26/5, 6/1, 4/1, 6/0`.
  The four additional October 28 attempts occurred after the reference as-of;
  the UI also starts at local midnight, not the original deployment-time cutoff.
  These changed query boundaries are explicit, not a fixture mismatch.
- Device-only legends, six stable colors, dots/open circles, local receipt
  axis, retention/as-of/uncertainty notes and readability were visually
  inspected in the actual rendered PDF. All **280** words fit printable
  bounds. Live report form at **375/430/768/1024/1440 px** has no horizontal
  overflow or clipped input/select/button controls.

### Preservation, access and compatible recovery

- Consistent recovery snapshot: **`2026-10-29T00:19:18.884693Z`**;
  refreshed pre-cutover: **`2026-10-29T00:28:52.234032Z`**;
  closeout: **`2026-10-29T00:38:29.660043Z`**. All **31** other protected
  data/configuration surfaces match exactly, with unchanged document counts:
  97 products, 7 staff, 94 requests, 69 commands, 52 bays and 462 subscription
  descendants. The full stock/history/access/staff/service documents, Auth
  configuration, Receiver/notifier and both sandbox deployments are preserved.
  One existing Cart subscription's `updated_at` and `last_seen_at` changed
  through normal browser registration; its identity, creation time, endpoint,
  keys, status, preferences and all other fields are unchanged. No preference
  rewrite, new subscription, test request, sale, audit, shift or customer test
  notification was initiated. Do not roll back this legitimate heartbeat.
- Cart was **OFF** at this release's baseline and remains OFF; Driving Range
  remains **suspended**. Older records' Cart-ON observations are historical,
  not a directive to restore service state. Permanent installation files are
  byte-identical; PDF SHA256 remains
  `f52966769dc155e37097e43fd5df72a3aadee149224994bb3210a768b1f6f425`.
- Production access: **https://app.fairwayrefresh.com/admin**, normal Admin
  sign-in, **Reports -> Customer -> Course -> Start/End date -> Generate ->
  Download PDF**. Ordinary Customer users have no report access. Existing
  1-31-day, source/layout limits and retained-coverage caveats in the
  [UX owner](UX_SPECIFICATION.md#admin-button-activity-report-review-increment)
  apply. Older unavailable log dates are not evidence of zero pushes.
- Compatible recovery baseline: Admin **`fairway-admin-qr-db9001e`** and
  Hosting **`8ee4867beb77d9fa`**, with its exact installation directory.
  Retained `qr-release` tag points to the compatible prior Admin at **0%**;
  the report revision is **100%**. If recovery is required, route Admin to
  that compatible revision and republish the retained compatible Hosting
  artifact, or use a compatible forward fix. Keep current Receiver/notifier,
  stock/assignment/Course owners, all live records and permanent identities.
  A code rollback removes Reports; it does not restore data or require
  removing these bounded read grants. Never restore an old snapshot over
  legitimate post-release history or route to older incompatible writers.
- Restricted evidence/recovery: private session `button-report-release/`
  (`before/`, `precutover/`, `final/`, immutable previous Admin source,
  prior/merged Hosting, IAM snapshots, `verification.json`,
  staged/live PDFs and exact-as-of reconciliation records).
  These are local restricted artifacts, not a managed/off-machine data backup.
  Canonical records/source are GitHub-backed. No new physical-device,
  physical Safari/iPad/PWA, notification-delivery or print/scan acceptance is
  claimed; no customer-device test notification was sent.

## Operator Customer/service hierarchy correction — 2026-10-26

**Released through merged [PR #19](https://github.com/josh-fairwayrefresh/fr-main/pull/19).**
Bounded frontend follow-up to the Driving
Range release below, based on main
`ab5b394d699f05a2fb1376197485f128557a058a`. Admin Customer names and the
Customer-filtered existing Service selector derive from the authorized Course
list and one selected Customer/Course pair. No permissions/directory, account
entitlement, stored service-state or backend contract changes are included.
The [UX owner](UX_SPECIFICATION.md#driving-range-qr-requests-review-increment)
defines URL/deep-link, mutation-lock and stale-response behavior.

- Isolated frontend validation passes **86/86** checks (final serial runner),
  including Admin
  Monarch/Placeholder switching, ordinary-user isolation, exact deep links,
  stale dashboard delivery and History DOM removal, request/Resume/staff/
  notification mutation locks, unchanged notification choices on navigation,
  inventory operations and operator-tab regressions. Widths **375, 430, 768,
  1024 and 1440 px** have no horizontal overflow. Distinct per-context sibling
  React keys prevent old hidden Requests/History DOM surviving a switch.
  Overlapping explicit notification writes keep navigation locked until both
  finish. One concurrent inventory fixture run reached its fixed-time assertion
  while still RUNNING; the unchanged fixture passes in the serial release gate.
- The actual production configuration passes its validator and production
  build; sandbox review remains disabled. No backend tests are repeated for
  this frontend-only diff. Existing bundle-size warnings are unchanged.
- Read-only consistent recovery baseline captured at
  `2026-10-27T00:55:13.772163Z` under private session artifacts
  `customer-context-release/before/`; prior compatible Hosting version
  **`1be3937a43d1c771`** and all three `qr-db9001e` backend revisions at **100%**
  are retained. The complete catalog, staff, histories, accounts, preferences,
  subscriptions and service states are included in preservation checks.
- Publication order: commit/push, exact-head guarded merge, production build
  from merged source; retain the byte-identical installation-sign directory
  from the verified prior release, then deploy **Hosting only**. This sequence
  completed; all **128** custom-domain served files match local artifacts;
  entry/PDF/register also match the secondary `web.app` origin.
  No Admin/Receiver/notifier, Auth, Rules/indexes, firmware or sandbox
  publication, production transactions, preference writes or service actions.
- Recovery: republish the retained compatible previous Hosting artifact
  (including its permanent signs/register), or use a compatible forward fix.
  Keep all current stock/assignment/Course-aware backends and every live record.
  Never restore older writers or overwrite live history with a snapshot.
  Physical Safari/iPad/PWA delivery limits remain as documented below.

### Deployed identities and read-only closeout

- Reviewed feature head **`676da88662c4ca8183dfefb091f2dc8dd1fe6a1c`** merged
  as **`e8793db058bf34b8a9a976dbea07b7b91769b93e`**, the deployed frontend
  source. Merge tree equals the validated feature tree; merged and candidate
  production application builds are byte-identical.
- Hosting **`8ee4867beb77d9fa`**, release **`1793062793254000`**,
  **`2026-10-27T00:59:53.254Z`** (October 26 PDT).
  Operator: **https://app.fairwayrefresh.com/**.
  No backend publication: Admin **`fairway-admin-qr-db9001e`**, Receiver
  **`fairway-button-receiver-qr-db9001e`**, notifier
  **`fairway-request-notifier-qr-db9001e`** remain unchanged at **100%**.
- Normal existing authenticated Admin session restored on the new build.
  Monarch offers Cart/Driving Range; Placeholder Hills offers only its own
  service. Live dashboard reads for all three return **200**. Selection,
  History and inventory links stay scoped; only one Requests DOM remains.
  Live 375/430/768/1024/1440 viewport measurements equal document width.
  Selected phone labels fit their controls; this is browser evidence, not
  new physical-phone/Safari acceptance. Read-only staff picker displays Alex,
  Christina, Michael, Michaela and Wendy; it was cancelled without selection.
  Seven observed operator/inventory API calls in the settled live checks
  were **GET**; no production mutation or customer test push was performed.
  Cart remains **ON**, Driving Range **suspended**; notification choices
  remain Tony Lema on, Range/Placeholder off for the checked Admin session.
- Consistent snapshot at **`2026-10-27T01:00:03.302400Z`** matches the baseline
  exactly across **33** protected surfaces: document IDs, every stored field,
  create/update timestamps, full catalog, account access, staff, histories,
  preferences/subscriptions, Auth configuration, runtime configuration and
  both sandbox deployments. All **58** products are unchanged; Monarch's
  **57** remain **43 On Cart / 14 Sold Out / 0 In Inventory / 0 archived**.
  Missing quantities were neither initialized nor used to move tiles.
  The **94** inventory events, **4** historical menus, **5** staff,
  **91** requests, **68** commands and **441** subscription descendants remain.
- The prior permanent installation directory is byte-identical, including
  all 52 bay-side destinations/register and the 26-page
  [installation PDF](https://app.fairwayrefresh.com/driving-range-signs/driving-range-installation.pdf),
  SHA256 **`f52966769dc155e37097e43fd5df72a3aadee149224994bb3210a768b1f6f425`**.
  No new QR identity, PDF generation, entitlement addition or service activation.
- Detailed restricted artifacts: private session
  `customer-context-release/{before,final,merged-hosting}/`,
  `verification.json`, `production-build-verification.json`;
  final frontend gate `customer-context-regression-serial.log`.
  Recovery artifacts are retained locally, not a claimed off-machine data
  backup; source and canonical release records are GitHub-backed.

## Driving Range production integration and controlled release — 2026-10-26

**Released through merged PR #13.** Production publication completed at
`2026-10-27T00:19:45.305Z` (October 26 PDT). This establishes the current backend
and data baseline, superseding inventory/staff-only runtime identities below.
The bounded frontend correction above owns subsequent Hosting publication.
**Driving Range remains suspended; activation still requires explicit CPO
direction.** No production request, sale, audit, shift or test notification
was created by this release.

The CPO authorized integrating reviewed PR #13 head
`6e3afe55e55b0384dfa97c68bc7e6881dc843ce6` with current main
`3aa8106605910e040bd71369eb22abe36a237aec`, validating before merge/publication,
and provisioning Monarch's independent Driving Range Course and 52 permanent
production locations. **Keep Driving Range suspended until separate explicit
CPO activation.** Both existing sandboxes are protected from publication.

Integration retains current main's stock-aware/assignment-aware inventory,
staff editor and account owner rather than replacing them with older QR-branch
versions. Range capability gates Cart inventory-session initialization and
controls as well as Inventory/KPIs. The existing Course selector uses the
accepted operation labels. Account updates preserve extra stored fields through
the existing Admin access owner. Installation generation is an explicit mode
restricted to the permanent production origin and an explicit Customer/Course
mapping; default review generation remains sandbox-only.

### Source and deployed identities

- Reviewed QR/A-B head: **`6e3afe55e55b0384dfa97c68bc7e6881dc843ce6`**.
  Integration merge **`c749d18ce060eb515160bf030cdf166066598b34`** incorporates
  main **`3aa8106605910e040bd71369eb22abe36a237aec`**, preserving its inventory
  and staff owners. [PR #13](https://github.com/josh-fairwayrefresh/fr-main/pull/13)
  merged as **`db9001ecba79b88f6584a6d407de355dc0c63d75`**, the deployed source.
  The merge tree equals the validated integration tree; its production build
  is byte-identical to the validated candidate's 21 application files.
- All affected backends were staged Ready at **zero traffic**; their source
  archives each matched all 62 uploaded files against merged source. Prior
  revisions retained 100% until normal authenticated reads, unsigned-access
  gates, source/configuration and preservation checks passed. Each new
  revision was then explicitly routed to **100%**:

  | Surface | Current revision | Preserved runtime identity |
  |---|---|---|
  | Admin | `fairway-admin-qr-db9001e` | `fairway-admin-prod@savvy-kit-496703-r5.iam.gserviceaccount.com` |
  | Receiver | `fairway-button-receiver-qr-db9001e` | `936892386735-compute@developer.gserviceaccount.com` |
  | Notifier | `fairway-request-notifier-qr-db9001e` | `fairway-notifier-prod@savvy-kit-496703-r5.iam.gserviceaccount.com` |

  `qr-release` tags point to these revisions. The old Admin `staff-release`
  tag was removed so its Course-operation-unaware writer is not separately
  reachable. Existing resources, origins, ingress/invocation settings and
  environment remain unchanged except Receiver QR enablement and the
  production-only rate-secret reference.
- Immutable images:
  - Admin:
    `us-central1-docker.pkg.dev/savvy-kit-496703-r5/cloud-run-source-deploy/fairway-admin@sha256:a431901cc87198f1053ceae8813a1222ac706c11f3316fdd75d763156cacd530`.
  - Receiver:
    `us-central1-docker.pkg.dev/savvy-kit-496703-r5/cloud-run-source-deploy/fairway-button-receiver@sha256:c9024dd2017975040a1b66a16bda1f341637682540b22db95333a286fa9f0cca`.
  - Notifier:
    `us-central1-docker.pkg.dev/savvy-kit-496703-r5/gcf-artifacts/fairway-request-notifier@sha256:02e34559d106f4e646040238044db25b9a4c8f86837cbd6c3ba2e4c136e276ea`.
- Immutable source archives, each SHA256
  **`a108559ed42427eb602ef2c7afa60cf5d9ca963d5f3e84d3f85c640dc30c4f09`**:
  - Admin:
    `gs://run-sources-savvy-kit-496703-r5-us-central1/services/fairway-admin/1793059634.530355-a718d6aca33e4155acad0222bf870b8b.zip#1793059634745191`.
  - Receiver:
    `gs://run-sources-savvy-kit-496703-r5-us-central1/services/fairway-button-receiver/1793059770.355177-c38fdde5262446599ba1eb174195527f.zip#1793059770570491`.
  - Notifier:
    `gs://gcf-v2-sources-936892386735-us-central1/services/fairway-request-notifier/1793059634.237152-a265f45e981d45bc91bccc9ec4a96671.zip#1793059634513118`.
- Hosting: **`1be3937a43d1c771`**, release **`1793060385305000`**,
  `2026-10-27T00:19:45.305Z`. All **128** served files match the verified
  application/sign artifacts on the custom domain; entry, PDF and register
  also match on `savvy-kit-496703-r5.web.app`. Hosting-only publication
  did not deploy Rules, indexes or other Firebase surfaces.
- Existing Eventarc trigger
  **`projects/savvy-kit-496703-r5/locations/nam5/triggers/fairway-request-notifier-108760`**
  is unchanged, including timestamps, request-created filter, protobuf
  format, topic/subscription, Cloud Function destination and trigger identity
  `fairway-notifier-trigger@savvy-kit-496703-r5.iam.gserviceaccount.com`.
  The underlying existing Run function service was staged/published without
  replacing the trigger. Its existing Cloud Function audience and production
  VAPID secret/key were retained.
- Added only active-request index **`CICAgJjF9oIK`**, collection scope:
  `customer_id ASC, course_id ASC, status ASC, received_at ASC`
  (and implicit `__name__ ASC`). All five request indexes are **READY**;
  the four existing indexes and Rules are unchanged. TTL `expires_at`
  policies on `qr_request_limits` and `rate_windows` are both **ACTIVE**.
  Receiver alone references fresh production secret
  `fairway-qr-rate-key:1`; accessor grant is scoped to that secret and its
  unchanged runtime identity. No sandbox secret or credential was copied.

### Production Course, accounts and permanent sign register

- Monarch **`CUST-0001 / COURSE-0003`**, display name **Driving Range**,
  timezone `America/Los_Angeles`, explicit `operation_kind: driving_range`.
  Normal authenticated Admin Course creation at
  `2026-10-27T00:14:26.155Z` initialized its persistent suspension. No Resume
  action was issued. Tony Lema's existing service state is unchanged.
- Existing normal Admin account-access owner extended only:
  - `monarch_fnb@fairwayrefresh.com`
    (`OA9uda9K2HZodm2DQwz9vHkLe6Z2`);
  - `monarch_cart@fairwayrefresh.com`
    (`zfyFXF9GmQNeVEesqcbRSp8wEeu2`).

  Both remain non-Admin Monarch customer accounts. Their exact Course lists
  are now `COURSE-0001, COURSE-0003`; prior access and unrelated stored fields
  are preserved. No Auth account, password or provider was changed. Global
  Admins needed no entitlement update. The existing orphaned access record
  was not extended. No operational staff was created or reassigned:
  Alex, Wendy, Christina, Michaela and Michael remain Tony Lema-only.
- `qr_bays` contains **52 fresh production-only identities**, ordered
  `1A, 1B` through `26A, 26B`, owned by this Course. The existing QR owner
  rejects another register and transactionally creates missing records only.
  Repeated population returned the same 52-location register without changing
  claims/history; every final claim is null. No sandbox location, user,
  request, credential or operational record was copied.
- Operator:
  **https://app.fairwayrefresh.com/?customer_id=CUST-0001&course_id=COURSE-0003**.
  Use the existing email/password or existing Google sign-in, as applicable
  to the account; no new password/setup link is required. The existing selector
  offers **Cart service** and **Driving range service** for Monarch accounts.
  Global Admins retain their other authorized Courses. Normal authentication
  is required; sandbox review returns 404 and unsigned private APIs return 401.
- Installation download page:
  **https://app.fairwayrefresh.com/driving-range-signs/**.
  Final [26-page production installation PDF](https://app.fairwayrefresh.com/driving-range-signs/driving-range-installation.pdf)
  and [52-side permanent register](https://app.fairwayrefresh.com/driving-range-signs/driving-range-bay-mapping.json).
  Every destination is `https://app.fairwayrefresh.com/range/{permanentId}`.
  PDF SHA256:
  **`f52966769dc155e37097e43fd5df72a3aadee149224994bb3210a768b1f6f425`**.
  All 52 codes decoded from the rendered final 26 Letter portrait pages at
  100 dpi and matched the live private identity/Course records and anonymous
  suspended public responses. Exact accepted wording, A-left/B-right labels,
  246pt QR squares/four-module quiet zones and 48pt printer margins were
  checked; all-page contact sheet plus pages 9 and 26 were visually inspected.
  Approved logo proportions and camera artwork are unchanged; no test footer.

### Validation and preservation evidence

- Full integrated backend suite passed, including inventory/staff/API,
  attribution, legacy requests, authorization, notifications and QR ownership/
  concurrency contracts; **79** frontend checks passed.
- Native isolated Firestore integration under actual production runtime guards
  verified 52-location provisioning/repeat safety; 16 concurrent A intents
  and eight B intents produced exactly two requests; independent claims,
  duplicate-safe submission, lost-response receipt replay after completion,
  fresh later intent, competing terminal actions, suspension, Customer/Course
  isolation and zero QR physical commands. Four concurrent isolated dispatches
  produced one stubbed send; explicit opt-in, disabled/revoked access and Cart
  preference/state preservation were covered by the shared owner's tests.
  All **101 active requests** remained retrievable despite 105 newer closed.
- Production-configured candidate and exact merged build passed. Rendered
  inventory attribution/sale/retry/audit/shift-close, Cart queue/categories,
  public menu and integrated service-switch checks passed using isolated data.
  One initial concurrent browser-harness export timing failure passed when
  rerun independently, without an inventory-source change. Existing bundle-size
  warnings remain; there is no build or runtime-error blocker.
- Live normal signed-in Admin session verified both service views, Cart
  Inventory/performance/operator picker and Range's absence of inventory,
  inventory session and Cart KPIs. Both service views had no document overflow
  at 375/430/768/1024px. Tony Lema's normal picker showed exactly the five
  assigned staff; opening/cancelling it did not select a name or start a shift.
  Range notifications remained unchecked, existing Cart choice checked.
  The two customer account entitlement records were verified through normal
  Admin reads; their individual password sessions were not impersonated.
- Fresh ordinary browser verified normal production sign-in, retained signed-out
  deep-link path/Course and no anonymous-signup/review provisioning calls.
  Anonymous real 9A/9B pages were white, side-specific, suspended, without
  request buttons or overflow at all four widths. All 52 public identity reads
  returned the expected side, Driving Range name and unavailable state.
  Exact-side signed-in request/deep-link behavior reuses prior real isolated
  A/B browser evidence; isolated dispatch verified the Course-specific URL.
- Consistent restricted snapshots: initial
  `2026-10-26T23:57:54.329390Z`, refreshed precutover
  `2026-10-27T00:06:23.580143Z`, staged/backend-live checkpoints, provisioned
  `2026-10-27T00:18:43.347106Z`, final
  **`2026-10-27T00:27:28.693648Z`**. Every original document was compared by
  path/ID, all fields and updateTime. Only authorized original changes were
  the Course allocation counter and two Customer login access records;
  additions were exactly one suspended Course and 52 locations.
- All **58 production products** are unchanged, including Monarch's full
  **57**: **43 On Cart, 14 Sold Out, zero In Inventory/archived** at this
  baseline. No defaults, quantities, fields, IDs or columns were written/moved.
  All-column/archived representative behavior remains covered by isolated
  inventory tests. Existing **94 inventory events**, four historical menus,
  five staff/creation receipts, **91 requests**, **68 commands**, categories,
  sessions/shifts/audits, account permissions outside the authorized additions,
  Cart Course/service state and all **441 subscription descendant records**
  and existing Course preferences are unchanged.
- Existing golfer URL
  `https://app.fairwayrefresh.com/cartmenus/monarchbay_tony_lema_course`
  remains anonymous/usable, with six initially collapsed categories and no
  mobile overflow. Its canonical API slug is `monarch-bay`, not the legacy
  URL's underscore-separated route text. It returns exactly the original
  43 On Cart IDs and only the owner-defined public product fields. This
  filtered response never replaces or prunes the operator's complete catalog.
- Authentication provider/domain configuration, firmware and both sandbox
  Hosting identities are unchanged. Sandbox service revisions match their
  existing release records: inventory Admin `fairway-admin-sandbox-00024-4wb`
  and Receiver `fairway-button-receiver-sandbox-00026-qdp`; QR Admin
  `fairway-admin-sandbox-00002-zzf`, Receiver
  `fairway-button-receiver-sandbox-ab-c93aa1a` and notifier
  `fairway-request-notifier-sandbox-00002-riv`. No sandbox deployment occurred.
  No new-revision ERROR logs were present at final verification.

### Executed release gates and sequence

1. Verify integrated source against main, reviewed-head ancestry and existing
   production Admin `fairway-admin-staff-00ada00`, Receiver
   `fairway-button-receiver-00028-827`, notifier
   `fairway-request-notifier-00003-mah`, and Hosting `c2004110805c6599`.
   Preserve current service identities, configuration, VAPID keys/subscriptions,
   authentication providers and stock/assignment contracts.
2. Before production changes, retain restricted consistent snapshots and
   immutable prior source/image references. Refresh the snapshot before
   cutover. Stop on unexplained pre-existing-data or runtime divergence.
3. Validate integrated inventory/staff/Cart contracts, isolated native Firestore
   QR concurrency/retry/terminal races, Course/notification scoping, full active
   queues, normal-auth production entry and responsive service switching.
   The production-configured build must keep sandbox review disabled.
4. Merge using the established exact-head-guarded merge commit. Add only the
   missing active-request composite index and QR rate-counter TTL policies;
   preserve existing indexes/Rules. Create a production-only QR rate secret
   accessible only to the existing receiver runtime identity as needed.
5. Stage affected Admin, Receiver and notifier revisions at zero traffic,
   preserving runtime identities/configuration and notifier trigger. Receiver
   alone enables QR ingress and its server-only rate secret. Verify readiness,
   immutable source and staged normal-auth/public-read gates before routing.
   Keep the notifier's existing created-request Eventarc trigger and VAPID key;
   no production synthetic notification/request is needed or authorized.
6. Through normal authenticated Admin Course/account owners, create the
   independent Course suspended and extend only real authorized Monarch
   Customer accounts, preserving all current entitlements and fields. Existing
   global Admins need no change; orphaned access records are not login accounts
   and are not provisioned. Do not copy users or assign Tony Lema staff.
7. Generate fresh production-only location identities and provision through
   `lib/qr_requests.js` using `scripts/provision_qr_bays.js`. Provisioning requires
   suspended Course ownership, rejects alternate/conflicting registers and
   repeats without changing claims/history. Generate the 26-page installation
   edition, decode both codes on every rendered page and verify live identity,
   side, Course and permanent destination before Hosting publication.
8. Publish only the compatible production-configured Hosting build and
   installation artifacts. Verify served bytes, normal authenticated service
   views, public suspended pages, complete product/staff/history preservation,
   unchanged Cart service/preferences/subscriptions and both sandbox identities.
   Do not submit production requests, sales, audits or shifts.

### Recovery constraints

Restricted local evidence/recovery root:
`/Users/DuplexLoop/.copilot/session-state/937dc64a-d76a-44ab-9ebd-392a14f06f80/files/qr-production-release-20261026/`.
It retains consistent snapshots, all six prior/current backend source archives,
immutable image/service manifests, `source-verification.json`,
`provisioned-preservation.json`, `final-preservation.json`, final index/TTL/
trigger identities, production bay fixture, rendered PDF verification,
production build, served-file hashes and fresh-browser/menu evidence.
These private artifacts are **local-only**, not committed or a managed backup.
Current source is on GitHub, source/images remain in production artifact
storage and final installation files/register are on Hosting. Existing
inventory/staff recovery references below remain retained historical evidence.

After new Course entitlements/location records exist, retain stock-aware,
assignment-aware **and Course-operation-aware** backend behavior and every
record. Do not restore an older writer, remove new identities/entitlements,
overwrite live history from snapshots, reseed locations or enable service as
part of recovery. Prefer a compatible forward fix. Keep QR service suspended;
if needed disable new public ingress explicitly while retaining operator
handling of existing requests. Hosting may revert only to a compatible build
with normal authentication, with compatible backends retained. Preserve
notifier VAPID identity/subscriptions and the existing trigger. Snapshots are
restricted local recovery/evidence artifacts, not automatic restore inputs;
PITR remains disabled.

**Operational recovery:** keep `COURSE-0003` suspended and the verified current
backends/records; prefer a forward fix from deployed `db9001e`. If an ingress
containment change is needed, stage the same compatible Receiver source with
`FAIRWAY_QR_ENABLED=false`, preserve its existing secrets/configuration and
operator lifecycle, verify and route explicitly. Do not recover by restoring
the old inventory/staff-only writer, reseeding/removing permanent URLs,
revoking the authorized additions, rotating VAPID, resuming service or copying
a snapshot over legitimate history. The old Hosting version is a historical
baseline, not a preapproved Course-compatible rollback; use only a verified
compatible Hosting build while retaining compatible backends.

**Acceptance limits:** physical phone/iPad/Safari, installed-PWA/OS delivery,
laminated-sign scans and native office-print quality were not newly accepted.
Prior real sandbox Eventarc/Web Push/browser evidence is retained; isolated
dispatch plus unchanged production trigger/configuration do not claim new
production customer-device delivery. No customer test push was sent.
Existing inventory/Excel/firmware reliability limits remain unchanged.

## Public sandbox review access — shared scope

The CPO now authorizes no-sign-in public operation of both isolated review
sandboxes. This supersedes the private-only review instructions below.
Anyone with the URLs may change test inventory/sales, service state and requests.
No production access, passwords or permissions are changed.

- QR operator: https://fairway-refresh-sandbox-qr1.web.app/?customer_id=CUST-0001&course_id=COURSE-0002
- Inventory: https://fairway-refresh-sandbox-260930.web.app/inventory?customer_id=CUST-0005&course_id=COURSE-0007

Ordinary browsers automatically establish a persistent Firebase anonymous
session. The receiver verifies its token and transactionally provisions the
existing schema-v2 non-Admin access record, restricted to deployment-configured
synthetic Customer/Courses. Existing named accounts and their permissions are
unchanged. Normal authorization, Firestore Rules, attribution, operator-name
selection and per-browser notification preferences remain authoritative.
No shared password, custom credential or public Firestore rule is introduced.
Clearing browser storage creates a new review identity and notification choices.

Enable Anonymous sign-in only in these two sandbox Auth projects. Build with
`VITE_FAIRWAY_PUBLIC_REVIEW=true`; deploy the receiver with
`FAIRWAY_PUBLIC_REVIEW=true` and JSON `FAIRWAY_PUBLIC_REVIEW_SCOPE` containing
`customer_id` and an explicit nonempty `course_ids` list. QR scope is
`CUST-0001` / `COURSE-0001, COURSE-0002`; inventory scope is
`CUST-0005` / `COURSE-0007`. Server configuration refuses production and any
other project. Caller-supplied scope is never used. The frontend enables auto
entry only on the exact sandbox Hosting origin and operator/inventory routes.

## Course-assigned operational staff — 2026-10-26

**Released and populated with explicit CPO authority.** The CPO authorized
extending the existing Customer staff owner with explicit
Course assignments, publishing only affected production Admin/Hosting, and
populating Alex, Wendy, Christina and Michaela as `cart_operator`, and Michael
(Director of Food & Beverage) as `fnb_management`. Each is active and assigned
only to Monarch / Tony Lema (`CUST-0001` / `COURSE-0001`).

### Source and deployed identities

- PR #15 feature head `598a026b4b4bddcb44e94bae2ad1859fe031d3c0`
  merged as **`00ada007910d8b758e1b9d922eb937e49873bd43`**, the deployed
  source, from verified main `b3dd798dcd0447c9c5918a5d84129417de26d54a`.
  The merge tree exactly matches the feature head.
- Admin **`fairway-admin-staff-00ada00`**, Ready and explicitly routed to
  **100%** after zero-traffic staging. Runtime identity, environment, origins,
  ingress/invoker configuration and resources match the inventory-release
  baseline; public review remains disabled. The `staff-release` tag points to
  this revision. The obsolete `inventory-release` tag was removed so its
  assignment-unaware writer is not separately reachable through that URL.
- Image:
  `us-central1-docker.pkg.dev/savvy-kit-496703-r5/cloud-run-source-deploy/fairway-admin@sha256:8c99fa79013923d53a392eef231051f0843207d8809e6a5de65d8fdcc0a68bf7`.
- Immutable source:
  `gs://run-sources-savvy-kit-496703-r5-us-central1/services/fairway-admin/1793055963.906485-57bfa99c6542444e83f8eb4ee83f2a9b.zip#1793055964188078`.
  Archive SHA-256:
  `016b11aa2bc5aec41d1aed7dca2ced567825a43c6fcac5a0ac3e3d3f698ea724`.
  All 51 uploaded tracked backend files match merged source.
- Hosting **`c2004110805c6599`**, release **`1793056093222000`**,
  `2026-10-26T23:08:13.222Z`. The merged production-configured build matches
  the validated feature build; all 19 served files match on both production
  domains. Index SHA-256:
  `7f08297e22fa83fd3695d8430cfdc6ed13b438174fbace61522681e943cf6fd6`.
  Main asset `assets/index-CzJeWJy7.js`.

### Authorized population and verification

The existing production directory was empty. Five creates used the normal
authenticated Admin staff API, with stable operation IDs
`monarch-tony-lema-staff-20261026-{lowercase-name}`. Each exact request was
replayed successfully and returned the same staff ID and result; five records
and five Customer-level creation receipts exist, not ten staff records.

| Name | Existing role | Stable staff ID | Active Course assignment |
| --- | --- | --- | --- |
| Alex | Cart Operator | `XLhuzXaw42j0kUbmJQxl` | `CUST-0001 / COURSE-0001` only |
| Wendy | Cart Operator | `K5pCcUDdnMElWhDmYeih` | `CUST-0001 / COURSE-0001` only |
| Christina | Cart Operator | `h7itnB28KhciAM0UlnZM` | `CUST-0001 / COURSE-0001` only |
| Michaela | Cart Operator | `Z5GUboeyPmvDSaSG63IM` | `CUST-0001 / COURSE-0001` only |
| Michael, Director of Food & Beverage | F&B Management | `kIXoWaE3Q7fAr1ULAUWT` | `CUST-0001 / COURSE-0001` only |

Michael's directory name is `Michael`, role `fnb_management`; the other four
roles are `cart_operator`. No new title/role/account model was introduced.
No Driving Range or other-Course/Customer assignment was made.

Focused evidence: **29** inventory/staff/attribution tests, **7** inventory API
tests, **2** production read-preservation/isolation checks, the rendered
Admin Course-assignment create/edit plus existing operator/audit/close flows,
production build/configuration, diagnostics and whitespace checks passed.
Tests cover inactive/unassigned/foreign/future-Course filtering, malformed
assignments, legacy missing-field behavior, concurrent same-operation creation,
exact retries after unassignment, stale new-action rejection, unchanged
historical sale/shift/audit name/role snapshots and close after unassignment.

Normal production-authenticated read checks passed against staged and live
Admin before Hosting. After population, both actual Tony Lema operator and
approver pickers show Alex, Christina, Michael, Michaela and Wendy; the other
Customer's normal pickers show none. Dialogs were cancelled without confirming
an operator or audit. Admin's released editor shows all five and Michael's
F&B Management role with Tony Lema checked, inspected without saving.
Cross-Customer invalid scope returns 403; unauthenticated staff reads return
401. Existing login accounts, Auth configuration and all six `user_access`
records are unchanged.

A consistent before snapshot at `2026-10-26T23:04:37.744079Z` and final
post-picker snapshot at `2026-10-26T23:10:56.300219Z` verified every pre-existing
inventory/product ID/field/column/quantity/updateTime, category, key, state,
published menu, sale/event, shift, session, closure and audit unchanged.
There remain **58 products**, **94 events**, **4 published menus** and **zero
shifts/sessions/audits/closures**. The only added application documents are the
five authorized Customer staff records and five Customer creation receipts.
Customer/Course records and service state also match the fresh baseline.
Receiver/notifier specifications/traffic, both sandbox Hosting identities and
production Auth configuration remain unchanged. No Receiver, notifier,
Rules/indexes, firmware, notification/service-control or sandbox deployment
occurred. PR #13 remains independent and unmerged.

Initial observation found no new-Admin error/5xx log entries. Private restricted
snapshots, source archive, publication read-backs, build and provenance manifests
are retained locally in `staff-production-release-20261026/`; production data
and tokens are not committed. These data snapshots remain local-only; PITR is
still disabled. No physical Safari/phone acceptance or production stock/audit/
shift transaction is claimed; attribution behavior was verified with isolated
tests and actual picker reads, not manufactured operational history.

### Owner and controlled release procedure

Implementation extends existing staff records, Admin editor, Course staff
endpoint and the shared operational-role policy. No competing directory, login
account, role framework or account-access change is introduced. Existing
records without assignments retain legacy Customer-wide behavior without
migration; newly created records have explicit scope. The existing stable
operation receipt makes population retry-safe. Staff PATCH uses the existing
editable-field contract, not creation-only `operation_id`.

Pre-release source is main `b3dd798dcd0447c9c5918a5d84129417de26d54a`;
Admin recovery baseline is `fairway-admin-inventory-854e10c` and Hosting
`cf3ff61ae7b0254f`. Capture fresh consistent production inventory/history/access
and staff records before publication. Stage only `fairwayAdmin` without
traffic, preserve runtime identity/environment/authentication, verify readiness
and source, then explicitly route 100%. Publish production Hosting only after
read-only Admin gates pass. Populate the five names through the existing
authenticated Admin staff API, using retained operation IDs and repeating exact
requests to verify stable IDs. Do not select/submit a shift, sale or audit for
verification; inspect the normal operator/approver pickers and cancel.

Do not roll Admin back to an assignment-unaware writer after assignments are
populated: it would ignore Course scope. Retain the first verified
assignment-aware revision for compatible recovery/forward fixes. Retain all
stock-aware inventory contracts and historical records. A Hosting rollback can
use the baseline while keeping the assignment-aware Admin. Receiver, notifier,
Auth configuration, Rules/indexes, firmware, service controls, PR #13 and both
sandbox publications are excluded.

## Persistent inventory production release — 2026-10-26

**Historical inventory-only cutover, superseded by the
[Course-assigned staff release](#course-assigned-operational-staff--2026-10-26).**
Its revision, traffic and Hosting identities below describe that cutover, not
the current production baseline. The consolidated
[production milestone](#production-inventory-and-course-assigned-operators--2026-10-26)
identifies the current stock-aware and assignment-aware deployment.

**Released with explicit CPO authority after acceptance of the preparation
checkpoint below.** Only production Admin and Hosting were deployed. There
was no quantity initialization, migration, deletion, product copying, tile
movement or manufactured production sale/audit/shift.

### Reviewed source and publication identities

- Reviewed PR #12 head:
  `545bcf2249b1c967a6062266ebd2057fe75c5bab`.
- Pre-release main:
  `08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`.
- PR #12 was marked ready and merged using the established merge-commit method
  with an exact-head guard at `2026-10-26T22:37:08Z`.
  Merge/deployed source: `854e10cf2a825363ba448e57a47b6748db50007a`.
  Its parents are the preceding main and reviewed head; its tree is identical
  to the reviewed head. The PR description was updated before merge.
- Admin: **`fairway-admin-inventory-854e10c`**, Ready, explicitly routed to
  **100%** after no-traffic staging and verification. Target `fairwayAdmin`,
  Node.js 22; existing service account
  `fairway-admin-prod@savvy-kit-496703-r5.iam.gserviceaccount.com`.
  Runtime environment, origins, ingress/invoker configuration, resources and
  timeout match the retained baseline. Public review stays disabled/unset.
  At this cutover, the `inventory-release` tag pointed to this same revision;
  the subsequent staff release removed that assignment-unaware tag.
- Admin immutable image:
  `us-central1-docker.pkg.dev/savvy-kit-496703-r5/cloud-run-source-deploy/fairway-admin@sha256:9c0bc0e3d6a832839058672fb77006d834689fed70b3b449378c1511a656f0e2`.
- Admin source:
  `gs://run-sources-savvy-kit-496703-r5-us-central1/services/fairway-admin/1793054241.137973-639680995d8c479fbb1bdae707f422b2.zip#1793054241578294`.
  ZIP SHA-256:
  `3c134c75447f9b5f7ea1e80b53c887b9c10a0d7bcf9d55d2c39b555e0e9ea713`.
  All 51 uploaded tracked backend files match the merged source byte-for-byte;
  only the two upload-control ignore files are intentionally excluded.
- Hosting: **`cf3ff61ae7b0254f`**, release **`1793054758746000`**,
  `2026-10-26T22:45:58.746Z`. The production-configured build from merged source
  is byte-identical to the preparation build. All **19 served files** match on
  both `app.fairwayrefresh.com` and `savvy-kit-496703-r5.web.app`.
  Index SHA-256:
  `3a06cd83eef493580e25aa4ca0c28e1cc10819a7a2c62feb49b12e8256c02529`;
  main asset `assets/index-CSIiibWX.js`.

### Read-only preservation and access evidence

The pre-cutover consistent snapshot is
`2026-10-26T22:36:07.153488Z`. Production deployment specifications and
inventory documents matched preparation before merge. Restricted copies of
the preparation artifacts and fresh cutover snapshot were retained separately;
neither was overwritten or committed.

Staged, live-Admin-before-Hosting and post-Hosting comparisons checked the
complete inventory, not the public response. The final consistent read time
is `2026-10-26T22:49:46.636848Z`:

| Stored scope | Before and after |
| --- | --- |
| Monarch / Tony Lema | 57 product IDs: 43 On Cart, 14 Sold Out, 0 In Inventory, 0 archived |
| Placeholder Hills / Test Links 18 | 1 product ID, On Cart |
| All production products | 58; every ID, metadata field, column, stored quantity and document updateTime unchanged |
| Historical inventory | 94 events, 4 published-menu snapshots; unchanged |
| New stock-operation records | No staff, operations, shifts, sessions, audits or closures created by release verification |

All 58 products still lack stored quantities; reads display zero without writing
defaults or moving tiles. Exact ID/column maps and full document comparisons
include archived products and all three availability values; no In Inventory
or archived product existed in the actual snapshot. Their behavior remains
covered by accepted representative tests. Identity keys, categories,
subcategories, inventory state, slug mappings and `user_access` were unchanged.
The operator read includes the full active inventory and separate archived
array; it never replaces/prunes stock using the public On Cart response.

The CPO completed normal production sign-in in the shared browser. Authenticated
reads against the staged and then live Admin preserved all existing product
fields/IDs/columns and returned both authorized Courses. An unassigned Course
was denied with 403; unauthenticated access/bootstrap and inventory reads
returned 401. Fresh production Chrome required normal sign-in and made no
anonymous signup/review-provisioning calls. Existing signed-in state survived
the Hosting publication. Production Auth configuration and Course entitlements
remain unchanged; sandbox-origin requests are denied with 403. The preparation
evidence for genuine sandbox-token rejection and production-mode fail-closed
guards remains valid. An attempted IAM verification-session signer was denied;
no permissions were granted or token/account created through that route.
Verification instead used the CPO's ordinary sign-in.

The production operator UI renders 43 On Cart and 14 Sold Out tiles, no Publish
controls, no selected operator and no open dialog. Both existing public URLs
return 200 and load the same **43 committed active On Cart products**, not the
complete 57-product operator catalog:

- https://app.fairwayrefresh.com/cartmenus/monarchbay_tony_lema_course
- https://app.fairwayrefresh.com/cartmenus/monarch-bay

Public responses have the exact public-field allowlist, including only public
amount/currency price fields, and no quantities/revisions/staff/operational
records; `Cache-Control: no-store` is retained. Fresh 375px Chrome checks found
all six categories collapsed initially, successful selection/expansion and no
horizontal overflow on either URL. No public page mutates inventory.

One concurrent, intentional operational change was detected rather than
silently treated as deployment drift: the unchanged Receiver
`fairway-button-receiver-00028-827` accepted
`POST /api/v1/operator/service/resume` at `2026-10-26T22:46:23.561037Z`.
The CPO explicitly confirmed the Resume and instructed that it remain.
Only Tony Lema's `service_suspension`, `updated_at` and document updateTime
changed; all other captured Course fields and all inventory/history documents
matched. The release issued no service action and did not revert that state.

Receiver `fairway-button-receiver-00028-827`, notifier
`fairway-request-notifier-00003-mah`, both sandboxes' service specifications,
traffic and Hosting release identities remain unchanged. PR #13 remains draft,
unmerged at `8c547c68e0f7dd50c5837e5e3ebbc8745d39b26a`. Auth configuration,
Rules/indexes, firmware, notification owners and service-control code were not
deployed or modified. Initial new-Admin log observation found no error/5xx
entries. Valid preparation tests/emulator/Excel-print evidence was reused;
no artificial production transaction or physical-device test was performed.

### Retained recovery and limits

The first verified **stock-compatible recovery revision** is
`fairway-admin-inventory-854e10c` with the immutable image/source above.
Pin and retain it. After any new inventory writes, keep this stock-aware
backend and all records; use a compatible forward fix or verified compatible
revision if correction is needed. **Do not restore the old Admin writer or
overwrite live sales/history with a snapshot.**

Hosting rollback target remains **`79e31c865a6025cc`**, release
`1792797232817000`; the old UI's inventory edits fail explicitly against the
new backend, while the existing Cart presentation can return. Old Admin
`fairway-admin-00019-5hm` is only a pre-new-write fallback after a fresh proof
that no new-schema writes occurred, never the default post-release rollback.
The preparation section below retains the full data-compatible procedure and
baseline source archives. Never delete/reset products, quantities, operation
receipts, shifts, closures, audits or events, or retry uncertain operations
under new IDs.

Private local recovery/evidence is retained in
`inventory-production-cutover-20261026/` (directory mode 700, snapshots mode
600), alongside the restricted preparation archive
`inventory-preparation-recovery-retained-20261026.tar.gz`, SHA-256
`cf88943e8c149fc91f3dc630fa4e4c4f68661a7447414dccd1803c011035f46a`.
The separately restricted completed-release archive is
`inventory-completed-release-recovery-20261026.tar.gz`, SHA-256
`3e355a738b9ba9f2bed8f0a43ef9b77466c48f19012436ff8f107f37044be4b6`;
its manifest binds the reviewed head, merge, deployed identities and file hashes.
Raw production data and credentials are not committed. These private data
snapshots remain local-only; remote revision/image/GCS source/Hosting references
are retained independently. Production PITR remains disabled, not a recovery
guarantee. No live stock-operation smoke transaction, physical Safari/push
acceptance or new office-print acceptance is claimed. Existing chunk-size
warnings remain nonblocking.

## PR #12 production inventory release preparation — 2026-10-26

**Historical preparation checkpoint, subsequently accepted and released above.
At this checkpoint only, no merge, deployment, production
write, account change or artificial production transaction is authorized.**
This supersedes earlier release permission. Public review sandboxes remain live.

### Exact scope and verified baseline

The clean preparation worktree is `persistent-cart-inventory`, branch
`feat/persistent-cart-inventory`. Its initial remote HEAD was
`152a411709f30ed87333306ab9cc83672ca0df05`; freshly fetched accepted `main`
and PR base are `08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`, with no
main-only commits or merge conflict. Preparation adds release checks and
owner-document corrections, not different application behavior. The final
prepared commit is the release handoff/PR head, not an already-deployed identity.

The release diff is the existing inventory owner/API, operational staff policy
helper, Inventory/session/drag/quantity/report UI, Admin Customer staff editor,
public-menu read/presentation and focused tests/docs. Cart integration adds only
inventory session controls and the Admin API URL prop. ExcelJS and its new
dependencies are added; **all pre-existing dependency versions/integrities,
including Firebase, are unchanged**.

PR #13 remains independently draft/unmerged at
`8c547c68e0f7dd50c5837e5e3ebbc8745d39b26a`; it is neither a dependency
nor part of this diff. No QR bay/routing/assets, firmware/device code,
notification owners, service controls/categories/reporting owners, Firestore
Rules/indexes, Auth configuration or existing account/Course entitlement policy
changes are included. The inactive sandbox-only review helper remains in PR #12
so its existing public test sandbox can stay usable.

Read-back production identities in `savvy-kit-496703-r5`, `us-central1`:

| Surface | Retained production recovery identity |
| --- | --- |
| Receiver | `fairway-button-receiver-00028-827`, Ready / 100%; image `sha256:c83ca43dbfda1c3eb395afc808634b78f0a62e6acf9a7260c4f229862815406a` |
| Admin | `fairway-admin-00019-5hm`, Ready / 100%; image `sha256:a8bb3fccbee139ed40fc48060b4d221dfe044eeeb5d982022b3f42f47d2375dc` |
| Hosting | Version `79e31c865a6025cc`, release `1792797232817000` |
| Notifier, untouched | `fairway-request-notifier-00003-mah`, Ready / 100% |

The exact retained Receiver/Admin source archives are the versioned GCS
locations in the October 23 production publication entry below. Both were
downloaded read-only; each ZIP SHA-256 is
`7306e8e035a25179c8f4ecdc194ef0718f2a2316b88e72131c91510b2bbbae52`.
Their inventory/auth/notifier/service/reporting source matches accepted main.
The retained Hosting version has 18 ordinary files captured and checked against
the Hosting manifest's gzip hashes; its two reserved Firebase-generated files
are platform responses, not immutable application assets. Live public Firebase
configuration was cross-checked against the deployed JS and used to reconstruct
the production build inputs; no credentials were copied.

### Production data compatibility and access evidence

A consistent read-only Firestore snapshot at
`2026-10-26T22:16:40.839065Z` contains **58 products**: 57 in
`CUST-0001/COURSE-0001`, one in `CUST-0002/COURSE-0002`; 44 On Cart,
14 Sold Out. All 58 lack quantities. No positive-quantity Sold Out or invalid
quantity was found. There are no operational staff, shifts, audits, closures
or operation receipts yet. Existing categories/subcategories, identity keys,
94 legacy inventory events, slug mappings, state/publication metadata and
historical published-menu snapshots were captured without editing them.

The candidate's real read owner ran against an isolated copy of that snapshot:
every product ID and stored field, including custom metadata/price/availability,
was preserved; missing quantity/stock revision read as zero. A before/after
comparison of the entire copied document map proved no writes or tile movement.
There is no migration, reset, automatic stock count or historical-sale backfill.
The existing Monarch slug `monarch-bay` resolves to **43 active On Cart**
products; production's older published response currently has 57 products.
Removing Sold Out from the golfer menu is the accepted change, not deletion of
those products. The other Course's On Cart product has no public slug.

The existing branded and canonical URLs both return 200:
`/cartmenus/monarchbay_tony_lema_course` and `/cartmenus/monarch-bay`.
The unchanged alias maps to the same slug. The candidate's one public allowlist
excludes quantities, stock revisions, staff/account/shift/audit/operation data
and nested private price fields. Public reads are transactional and no-store;
they follow committed On Cart inventory, not retained published snapshots.

Production Auth configuration still has Email/Password enabled, approved
domains unchanged and no Anonymous provider enabled. A genuine anonymous
token issued by the inventory sandbox received **401** from production
access bootstrap, inventory bootstrap and Receiver operator bootstrap.
The present Receiver has no review endpoint (GET returns 405). A separate
test using the actual production runtime configuration proves the candidate
review endpoint returns 404 by default and refuses startup/configuration with
review enabled in production. Frontend checks cover both production origins
even with the review flag erroneously true. Actual production sign-in UI and
named-session entry were exercised in the isolated production-built browser;
no real production password exchange was performed.

The stock-aware Admin must precede any new UI: legacy mutators lack required
operation/shift context and are rejected without writes. Metadata ignores cached
quantity/availability and reads current stock within its transaction. Absolute
stock/moves require expected revisions; remaining sales are revision-bound;
ordinary sales are transactional deltas and cannot oversell. Replays remain
duplicate-safe after a shift closes. Retired publish/preview return 410 without
activity. These rejection paths are intentional refresh-required behavior for
old clients, not silent compatibility writes.

### Proportionate validation

- New release tests: 58-product field/ID/read-only preservation and actual
  production-runtime review isolation, **2 passed**. Broadened frontend
  production-origin review-isolation assertions passed.
- Current inventory operations suite **27 passed**, including stock races,
  duplicate/lost-response retries, missing-shift/cached-client rejection,
  stale revisions, metadata versus concurrent sales, Sold Out, immutable audits,
  shift close and live public-menu privacy. Inventory API and schema-v2
  authorization suites and sandbox review checks also passed.
- Focused frontend/entry/export plus rendered operational flows **20 passed**.
  Additional shared operator/category rendering plus review entry **4 passed**.
  No-operator audit, close-out cancellation/retry, idle completion and Excel
  audit history remain covered.
- Production build uses the exact live Firebase project, API key/app ID,
  auth domain, storage bucket and Receiver/Admin URLs, with public review false.
  Index SHA-256:
  `3a06cd83eef493580e25aa4ca0c28e1cc10819a7a2c62feb49b12e8256c02529`;
  main asset `assets/index-CSIiibWX.js`. Build passed; the existing lazy
  spreadsheet/main chunk-size warnings remain, not new failures.
- That actual built app was served to isolated Chrome at the production origin
  with **all network requests intercepted locally**. A 58-product fixture
  verified normal sign-in rather than anonymous entry, authenticated inventory,
  zero-default/unmoved legacy tiles, no-operator audit without starting a shift,
  an actual downloaded two-sheet XLSX, historical approver history, both menu
  aliases, collapsed categories, no focus/16-second polling, and a committed sale
  disappearing from the golfer menu only after reload. No production operation
  was submitted. Source tests, diagnostics and whitespace checks passed.
- Reused evidence: the last inventory-owner publication's real isolated
  Firestore emulator **26 passed / 1 unit-only skip**, browser drag/touch cases,
  and actual 58-product spreadsheet-engine one-page print. These owners are
  unchanged; no new emulator/physical-device/office-print claim is made.
- Final read-back compared all captured inventory-related collections,
  Customer/Course records and deployment identities to their pre-check values:
  unchanged. No production Auth/account/notification/service/device mutation.

### Proposed rollout, only after separate authorization

1. Reconfirm reviewed PR head, resulting authorized merge provenance, unchanged
   production baseline, available baseline artifacts and the production
   environment. Retain a fresh, securely held inventory snapshot immediately
   before cutover; do not rely on this preparation snapshot for later live data.
2. **Admin only**, target `fairwayAdmin` on existing `fairway-admin`, preserving
   runtime identity, production project, allowed origins and environment. Public
   review stays unset/false; no sandbox scope/provider/config is copied.
   Stage a Ready revision without traffic, inspect the exact source/image and
   settings, then explicitly route to it and read back 100% traffic (the current
   service is pinned to a named revision). Do not treat Ready alone as released.
3. Before Hosting, use read-only checks for normal authorization, stable
   inventory IDs/metadata/zero defaults, existing public links and field privacy.
   Cached inventory clients may receive explicit refresh-required errors during
   this short server-first interval. No synthetic production transactions.
4. **Production Hosting only**, from the reviewed production build/configuration,
   after the Admin checks pass. Preserve existing domains/URLs; verify served
   assets against that build, normal sign-in, read-only Course access, menu
   contents and absence of anonymous provisioning.
5. Observe errors, 401/403/409/410 patterns and legitimate authorized user
   activity during the release window. Stop for unexpected writes, ID/metadata
   drift, permission bypass, stock inconsistency, private public fields, stale
   overwrites or unrelated request/service regressions.

**Not proposed:** Receiver, notifier, Rules/indexes, Auth, firmware, QR PR #13
or either sandbox deployment. All changed inventory routes execute in Admin;
the Receiver diff's added review endpoint is irrelevant/disabled in production.
Do not redeploy unaffected surfaces merely because they share a source package.

### Recovery compatible with new inventory records

- Before any new-schema inventory mutation, if the live snapshot is confirmed
  unchanged, restore the named baseline Admin revision/100% traffic and retained
  Hosting version above. Never assume there were no writes solely because the
  new UI was not published; an authorized caller may have used the API.
- **After any new records exist**, do not restore the old Admin inventory
  writer: it lacks stock attribution/revision/idempotency and audit/shift
  semantics. Keep the verified stock-aware Admin revision and its data. Roll
  Hosting back to retained version `79e31c865a6025cc` if necessary to recover
  the previously accepted Cart/Admin presentation. Old inventory writes will
  fail explicitly against the new Admin, and old publish returns 410: inventory
  editing is deliberately degraded until the corrected UI is available.
  Requests/History and service controls retain their existing contracts.
- Record and pin the first verified stock-aware Admin revision/image at cutover.
  A backend correction after new writes must be a reviewed compatible forward
  fix from this contract, or another verified stock-aware revision, not blind
  reversion to `fairway-admin-00019-5hm`. This preparation does not claim an
  already-deployed compatible stock-aware production revision exists.
- Never delete/reset products, quantities, staff, events, operation receipts,
  sessions, shifts, closures or audits as part of code rollback. Preserve exact
  uncertain operation IDs and restore duplicate-safe retry when service returns.
  A pre-release data snapshot must not overwrite legitimate post-release sales
  or immutable history. Any data repair/reconciliation requires separate
  explicit authority and retained evidence.

Private, local-only recovery/evidence files are in the session's
`inventory-production-release-baseline/` directory: consistent Firestore wire
snapshot, manifest/hashes, deployment descriptions/revisions, verified Hosting
files, versioned backend source ZIPs, public Auth configuration and compatibility
read-back. Production data is not committed or uploaded. Retained Cloud Run
revisions, GCS source generations and Hosting version are the remote recovery
references; the data snapshot/build/download/browser evidence exists only
locally and must be safeguarded for release. Production PITR is **disabled**
(one-hour version retention), not a durable rollback mechanism. No backup/PITR
configuration change was made. Release authorization is still pending;
physical phone/Safari/push/office printing has not been reaccepted by this
preparation, and no unrelated deferred issue is claimed resolved.

## Public sandbox review access

The CPO authorizes no-sign-in public review of the inventory sandbox at
https://fairway-refresh-sandbox-260930.web.app/inventory?customer_id=CUST-0005&course_id=COURSE-0007.
Anyone with this URL may operate its test inventory, sales, audits and shifts.
This is restricted to the verified CPO TEST Customer/Course, not other sandbox
records or production.

The browser automatically establishes a persistent Firebase anonymous session.
The receiver verifies its token and transactionally provisions existing
schema-v2 non-Admin access restricted to `CUST-0005` / `COURSE-0007`.
Normal authorization, Firestore Rules, operator attribution, unresolved-operation
recovery and inventory behavior remain unchanged. No password, named-account
permission, production configuration or public Firestore rule is changed.

Enable Anonymous sign-in only in this sandbox Auth project. Build with
`VITE_FAIRWAY_PUBLIC_REVIEW=true`; deploy the receiver with
`FAIRWAY_PUBLIC_REVIEW=true` and
`FAIRWAY_PUBLIC_REVIEW_SCOPE={"customer_id":"CUST-0005","course_ids":["COURSE-0007"]}`.
Server configuration refuses production and projects outside the two authorized
review sandboxes. The frontend requires the exact sandbox Hosting origin and
operator/inventory route. Caller-supplied scope is ignored.

To revoke public review, disable both build/runtime flags and Anonymous
sign-in, and remove the specifically identified anonymous reviewers' access
records (or disable those sandbox Auth identities). Disabling the entry flag
alone does not revoke already-issued access. Do not remove named users or
broaden this into production configuration.

### QR public-review publication — 2026-10-26

- QR source `645ee899d80f466d7937692583ecc3a848ed2fee`; receiver
  `fairway-button-receiver-sandbox-00003-z59`, Ready with 100% traffic.
  Hosting version `52eadcbe3996a79d`, release `1793040054264000`
  (`2026-10-26T18:40:54.264Z`).
- The existing Admin `fairway-admin-sandbox-00002-zzf`, notifier, Rules,
  bay identities and printed QR destinations are unchanged. The published
  PDF is byte-identical, SHA-256
  `4e727aa9bfbb8d518c333055cf5df63a0b908687c68a98c44b283b359610e436`.
  All 75 live Hosting assets matched the validated build byte-for-byte.
- Focused backend authorization checks: 11 passed per branch; QR frontend
  entry checks: 16 passed; inventory frontend entry checks: 13 passed.
  Both sandbox builds and edited-frontend diagnostics passed.
- Fresh Chrome contexts entered both actual URLs without credentials,
  received only the configured Course lists, reloaded and reopened with
  persisted anonymous sessions at phone/tablet widths. QR Course switching
  and per-identity notification preference write/read were verified.
  Anonymous reviewers received 403 for Admin, other-Course inventory and
  private direct Firestore reads; requests without tokens still received 401.
- This increment verifies entry, access scope and notification preference
  persistence, not a new physical-phone push-delivery acceptance. Browser
  permission and iOS Home Screen requirements remain. No merge or production
  changes; both PRs remain draft.
### Inventory public-review publication — 2026-10-26

- Source `d810b0f3c2d5347cdc87dfcfe8c03e66541d7e40`; receiver
  `fairway-button-receiver-sandbox-00026-qdp`, Ready with 100% traffic.
  Hosting version `749f980670c63cd1`, release `1793040054068000`
  (`2026-10-26T18:40:54.068Z`).
- Existing Admin `fairway-admin-sandbox-00024-4wb`, notifier and Rules
  remain unchanged. Production and named accounts are untouched.
  All 19 live Hosting assets matched the validated build byte-for-byte.
- Focused backend authorization checks: 11 passed; frontend entry checks:
  13 passed; sandbox build and edited-frontend diagnostics passed.
- Fresh Chrome entered the actual inventory URL without credentials,
  displayed the current test inventory and attribution controls, and
  retained its anonymous session after reload and reopening at phone/tablet
  widths. Bootstrap returned only the intended Course. Admin, other-Course
  inventory and private direct Firestore reads were denied (403); requests
  without tokens were denied (401). Notification preference write/read
  remained scoped to this identity. No inventory/sales/audit/shift mutation
  was needed for the access verification.
- PR #12 remains draft/unmerged. The QR sandbox was independently published
  from PR #13; no branch merge or production deployment occurred.


## Driving Range QR isolated review sandbox — 2026-10-24

This review increment branches from accepted main
`08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`. Driving Range is an
independent Course asset, not an additional Cart category or permission tier.
The UX owner defines product behavior; this section owns environment,
provisioning, verification and release boundaries.

### Current A/B bay-side review publication — 2026-10-26

The CPO changed each of the 26 Letter portrait sheets to serve two independent
practice locations: **A on the left, B on the right**. The CPO explicitly
selected retaining all original URLs as side A, adding only side B URLs.
The existing `qr_bays` owner now contains **52** identities, `1A/1B` through
`26A/26B`, using numeric `bay_number` plus `bay_side`. There is no second
register or request lifecycle. Historical unsuffixed request snapshots remain
unchanged; new golfer pages, requests, operator History and notification labels
identify the side. One outstanding request is enforced independently per side.

- Deployed application/generator source:
  **`c93aa1a0b221e96e29b9a03757ba8154c8469ff0`**.
  Later browser-test/documentation commits do not change deployed runtime bytes.
- Receiver **`fairway-button-receiver-sandbox-ab-c93aa1a`**, Ready at **100%**,
  after zero-traffic staging. Runtime settings, service account, secrets and
  authentication match the prior isolated revision; `bay-sides` targets the
  new revision. Both staged and live public reads verified all 52 identities
  and their minimal allowlists.
- Hosting **`36cb8474ec83e15b`**, release **`1793057725746000`**,
  `2026-10-26T23:35:25.746Z`. All **127 local publication files** match their
  served bytes, including the PDF, register, 52 PNGs and 52 SVGs.
- [Review/download page](https://fairway-refresh-sandbox-qr1.web.app/qr-review/index.html)
  and [26-page sandbox-URL PDF](https://fairway-refresh-sandbox-qr1.web.app/qr-review/sandbox-url-bay-signs.pdf).
  [Verified 52-side mapping register](https://fairway-refresh-sandbox-qr1.web.app/qr-review/sandbox-bay-mapping.json).
  PDF SHA-256:
  `36572eb5cd6e7355b27a8d44460c69a536314466b6b9a7632a008db15a766906`.
- The approved logo banner and top camera instructions remain unchanged.
  Each side has a prominent label and **246pt (3.42in)** square QR, including
  the four-module white quiet zone; page margins remain 48pt. All **52 codes
  decoded from the 26 rendered PDF pages** at 100dpi to the register.
  Instructions, A/B positions and safe text/ink bounds passed. Bay 9 and the
  all-page overview were visually inspected without clipping or distorted logos.
  As previously authorized, no printed test footer is added; filename/download
  page explicitly identify sandbox URLs. This is not a production installation
  edition or production-launch authority.
- **14 focused tests passed**, covering paired generation/rejected malformed
  mappings, repeat-safe population, preserved claims/URLs, independent A/B
  duplicate prevention, Complete/Cancel, legacy snapshots, Course scoping,
  suspended service, retries and side-aware notification payload/deep links.
  The deployed white-page/appearance browser check passed at
  375/430/768/1024px in light/dark settings. The new deployed A/B browser
  check passed: both public labels/Yes/No, repeated submissions, independent
  queue entries, exact-side deep links, A Complete/B Cancel and History.
  Early runner attempts exposed only test synchronization and unaccepted
  confirmation-dialog issues; the corrected runner completed and closed its
  synthetic requests. Original queue count was restored.
- Before/after comparison preserved all **27 pre-existing requests**, all
  original bay fields/claims except the intentional `bay_side: A` addition,
  existing account access, Customer/Course records and service state.
  Live browser verification added three terminal synthetic Bay 26 requests
  (two A Complete, one B Cancel), including recovery of interrupted runner
  attempts, and three ordinary narrowly scoped anonymous-review sessions.
  No original request was actioned. Admin, notifier, Rules/indexes, production,
  inventory sandbox, firmware and physical-device commands were not deployed
  or changed. PR #13 remains draft and unmerged.

The repeat-safe `scripts/assign_qr_bay_sides.js` requires the original private
26-bay fixture and exact isolated sandbox project. It transactionally adds
only `bay_side: A` to existing records and creates stable B identities, refusing
missing originals or assignment conflicts. It never replaces existing URLs,
claims, receipts or history. New sandbox seeding creates all 52 sides directly.
Private before/staged/publication/renderer evidence is retained in session
artifacts prefixed `qr-ab-`; original fixture credentials are not published.
Recovery must preserve the 52 identities and side-aware receiver/page behavior;
retain this publication and use a compatible forward fix, not an unsuffixed
26-location rollback or reseed. Earlier records below are historical evidence.
Physical laminated-sign scanning/phone notification acceptance has not been
rerun; prior real notification evidence remains distinct from the new passing
payload/lifecycle checks. Production Course/access setup and permanent
production print links remain separately authorized.

### Isolation and configuration

- Separate project `fairway-refresh-sandbox-qr1` (number `125189268671`),
  Firestore `(default)` in `nam5`, Firebase Auth/web application and Hosting.
  It shares no application data, Auth accounts, service revisions, VAPID key
  or Hosting releases with inventory project `fairway-refresh-sandbox-260930`.
  PR #12 was unmerged at initial provisioning and has since been independently
  released to production; its separate inventory sandbox remains protected
  from QR deployments.
- Hosting: https://fairway-refresh-sandbox-qr1.web.app.
  `firebase.qr-sandbox.json` is the explicit deployment target; do not use
  `firebase.sandbox.json`, whose site belongs to PR #12.
- Receiver/Admin services run in `us-central1` using the existing environment
  guards, Node 22 and `fairway-qr-sandbox` project-local runtime identity.
  The receiver alone enables `FAIRWAY_QR_ENABLED=true`, with server-only
  `FAIRWAY_QR_RATE_KEY` from Secret Manager `qr-rate-key:1`.
- A separate generation-2 `fairway-request-notifier-sandbox` consumes created
  `requests/{requestId}` events from this database. Its Eventarc identity has
  Eventarc receive and service-scoped Run invoke permission. The notifier is
  not public. It uses explicit matching runtime environment configuration and
  Secret Manager `qr-vapid-private:1`; no production secrets are reused.
- Runtime data access is project-local. Counter collection groups
  `qr_request_limits` and `rate_windows` use `expires_at` TTL; immutable
  submission receipts do not expire into fresh intents. The ingress permits
  120 fresh intents per network/minute and 60 per bay/minute; a salted HMAC,
  not raw IP, identifies the network bucket. Receipt replay is idempotent.
  Shared networks may hit this coarse limit; static QR URLs do not enforce
  physical presence.
- Deploy Rules and indexes before UI acceptance; wait until the active
  customer/Course/status/received-time composite index is READY.
  No new direct public Firestore access is granted.

### Synthetic review fixtures and signs

#### Historical private passwordless operator review access

The CPO initially selected private passwordless access rather than public operator
access after password setup proved inconvenient. Only project
`fairway-refresh-sandbox-qr1` enables Firebase Email Link sign-in alongside
existing Email/Password sign-in. The two existing identities were resolved
from authorized Auth records as `josh@fairwayrefresh.com` and
`admin@fairwayrefresh.com`. Their separate sandbox identities have schema-v2,
non-Admin access restricted to the synthetic Cart and Driving Range Courses.
No production password hash, credential or authorization is copied.

For tomorrow's phone/iPad review, open the clean operator URL
https://fairway-refresh-sandbox-qr1.web.app/?customer_id=CUST-0001&course_id=COURSE-0002.
Enter `josh@fairwayrefresh.com` or `admin@fairwayrefresh.com` in **Review email**
and select **Email me a sign-in link**. Firebase sends a fresh private link
on demand; check inbox/spam. Open it in the desired Safari/Chrome browser,
enter the same email and select **Finish private sign-in**. Use a normal,
not private/incognito browser to retain the session. Revisit the clean URL
afterward; sign-out or a different browser can request another fresh email.
No local file, pre-issued expiring link or VS Code session is required.
Mail delivery/inbox receipt and physical iPad behavior must be distinguished
from successful Firebase send responses and fresh-browser source verification.

Authorized project administration can also generate Firebase `EMAIL_SIGNIN` action
links for these accounts. Deliver them privately, never through Hosting,
Git, PR text or printed signs. The review URL carries email and the action
link in its fragment so Hosting requests do not receive the sign-in code.
The UI accepts this entry only on the exact isolated QR project/host and root
operator route, removes the fragment immediately, and exchanges the single-use,
time-limited code through Firebase `signInWithEmailLink`. Existing backend
authorization, Rules and per-user notification preferences remain authoritative.
Invalid/expired/reused links show an explicit error; they never grant a public
session. Issue a fresh private link when needed. Browser sessions persist
normally; sign-out or a different browser may require a new link.

This is not anonymous operator access or a bypass. Ordinary unauthenticated
visitors still see sign-in. Other sandbox projects, PR #12, production Auth,
accounts, permissions and deployments are unchanged.

Passwordless review publication: frontend source
`d293df3725806420d10989bfd5a51bdb3614cf0e`, Hosting version
`1dfd6e1740a2f939`, release `1792901425189000`
(`2026-10-25T04:10:25.189Z`). Backend, notifier, Rules and indexes remain at
the earlier QR publication below. All 71 frontend checks and sandbox build
passed. Real deployed Chrome verified private link sign-in, Course switching,
session persistence after reload, immediate fragment removal, ordinary
anonymous sign-in protection and reused-link rejection. The actual Josh
identity opened the operator workspace in the CPO's shared integrated browser;
the Admin identity also completed real passwordless sign-in. That integrated
browser reports notification permission blocked, which is a browser/platform
acceptance limit, not an authentication failure. Fresh unconsumed review links
are retained in a mode-600 local file, never in Hosting or the PR.

`scripts/seed_qr_sandbox.js` creates only synthetic Customer/Courses/account
fixtures in a separate sandbox and explicitly refuses the inventory sandbox.
It retains permanent bay identities and refuses to replace a completed seed.
Its private credential output must stay outside Git; tooling may use ADC or
an explicitly supplied short-lived authorized access token.

The review Customer is **SYNTHETIC QR Review Club**, with **TEST Cart Course**
and independent **TEST Driving Range**. The test account is not the intended
production Monarch account. No production Course or account was changed.
Driving Range Course creation requires `operation_kind: driving_range`;
existing Courses default to Cart and are not converted by ordinary edits.
The existing authenticated Admin Course-creation API accepts this configuration.
New Range Courses start suspended; synthetic review was explicitly resumed.

`scripts/qr_signs.js` generates only sandbox artifacts, requires exactly 26
unique ordered bay identities, decodes every generated QR back to its expected
URL, and emits a 26-page Letter PDF plus numbered PNG/SVG files and the mapping.
Review links/signs: https://fairway-refresh-sandbox-qr1.web.app/qr-review/index.html.
For the CPO-authorized Monarch field-testing checkpoint, printed review pages
omit **TEST — NOT FOR INSTALLATION**. The download page and filename
`sandbox-url-bay-signs.pdf` explicitly identify sandbox URLs. All 26 existing
bay destinations remain unchanged. Pages are US Letter portrait
with 48-point (2/3-inch) margins, approved proportional logo banner, centered
headline (**WANT FOOD OR DRINKS?** at 30 points), followed by the centered
22-point instruction **Use your [camera icon] and point it at the code to
request a server.** on two lines with a vector camera icon, 64-point bay
identification and a 4.5-inch QR
including its four-module white quiet zone. No destination URL or extra
instructions are printed. Rendered PDF pages must be checked for clipping,
readability and correctly decoded bay destinations, not just raw QR images.
The generator continues to reject production origins; enabling an installation
edition requires separately authorized launch work and approved permanent
production destinations, with test markings removed only for that edition.
Production Course/access
provisioning, permanent production URL binding, final production signs and
launch remain separately authorized. Do not print sandbox signs for launch.

Field-layout review refinement (2026-10-25 UTC): generator source
`ac42e206ede561f1e6c656e499ede43586c02bd9`, QR Hosting version
`f98e0fa3c882ef34`, release `1792902563443000`
(`2026-10-25T04:29:23.443Z`). The two focused generator checks passed,
including exactly 26 Letter pages, white four-module quiet zones and rejection
of production destinations and duplicate/missing bay identities. All 26 PDF
pages were rendered at 100 dpi and decoded to the existing exact bay mapping.
Text bounding boxes and rendered margins were checked on every page; full-page
Bay 1/Bay 26 and the all-page overview were visually inspected for readable
type, proportional logos, clipping and consistent spacing. The served PDF
SHA-256 is `d30ed08fe97c3627a47a9f98b7df8faf6c97d6bcaf30560167da5e4338e80411`;
all 75 served files matched local output. QR backend/notifier revisions,
PR #12 backend revisions and its Hosting version were unchanged. Physical
printer/lamination/phone-scan acceptance remains pending. Only review Hosting
changed; no installation edition or production artifact was generated.

### Verification and recovery boundaries

#### Camera instruction and white bay page — 2026-10-26 UTC

Reviewed frontend/generator source `cc6f87706285634d47cdd72e15c35c3f8e0be812`
(incorporating generator refinement `e5d38d0e86eb7f8ab2f68d5918be8387a221c71c`).
Only QR Hosting changed: version `ca10c5b38c55348b`, release
`1793037616161000`, `2026-10-26T18:00:16.161Z`.
Firebase publication initially failed on expired credentials, then succeeded
after the CPO reauthenticated the existing Firebase CLI account.

- The 26-page PDF retains its sandbox-only filename/destinations and no printed
  test footer. It now reads **Use your [vector camera icon] and point it at the
  code to request a server.** below **WANT FOOD OR DRINKS?**. Approved logo
  banner, 64-point bay labels and 4.5-inch QRs are unchanged.
- All 26 final PDF pages rendered at 100 dpi decoded to the existing bay mapping;
  exact instruction text, safe margins and absent footer passed. Bay 1/Bay 26
  full-page renders were visually inspected for camera alignment, clipping and
  readability. Served PDF SHA-256:
  `4e727aa9bfbb8d518c333055cf5df63a0b908687c68a98c44b283b359610e436`.
- Bay-only root styling is applied before lazy loading, so the loading screen,
  page and surrounding viewport stay white, including dark-device appearance.
  No operator or request-lifecycle behavior changes. The deployed browser
  appearance test passed light/dark settings at 375/430/768/1024px, blocked-module
  loading, real No interaction and stubbed confirmation/unavailable/error states
  without creating requests. A screenshot of the actual public Bay 1 page
  confirmed the white background and readable controls.
- 71 frontend checks, two focused sign-generator checks, two rendered existing
  operator/category regression cases, sandbox build and diagnostics passed.
  Existing bundle-size warning remains. All 75 served files match local build
  hashes. QR backends, notifier, Rules and access records were not redeployed or
  changed. PR #12 remains untouched; its Hosting version was rechecked as
  `7c21c25b1899c0e6`. No merge or production action occurred.

#### Saved Monarch testing checkpoint — 2026-10-25 UTC

CPO confirms the feature works. Saved reviewed frontend/generator source:
`a92998c32fbdf11c669d4f60d595f23ad3c83a54`. The following evidence-only
documentation commit is not a different application build. QR Hosting version
`855e24c6db9ca420`, release `1792903551153000`
(`2026-10-25T04:45:51.153Z`); all 75 served files matched local output.
This is a sandbox testing checkpoint, not a production release.

- Clean operator URL:
  https://fairway-refresh-sandbox-qr1.web.app/?customer_id=CUST-0001&course_id=COURSE-0002.
  In ordinary Safari/Chrome, use **Review email** with
  `josh@fairwayrefresh.com` or `admin@fairwayrefresh.com`, then **Email me a
  sign-in link**. Open the fresh email in the intended browser, enter the same
  email, and choose **Finish private sign-in**. No sandbox password is needed.
  Return to the clean URL while signed in; a new browser or signed-out session
  can request another link at any time. Do not rely on an old expiring link.
- Both actual identities completed fresh-browser hosted-email-action sign-in,
  selected both synthetic Courses, and retained their sessions across a full
  browser close/restart. This used the established Firebase Email Link
  capability with unchanged schema-v2 Course access and protected operator APIs.
  New user-delivered email links were requested through the rendered page for
  both addresses and left unconsumed. Firebase accepted both sends; inbox/spam
  receipt and physical phone/iPad acceptance are not independently verified.
- Review PDF:
  https://fairway-refresh-sandbox-qr1.web.app/qr-review/sandbox-url-bay-signs.pdf.
  **All destinations are still sandbox URLs.** The CPO-authorized footer removal
  affects all 26 pages, not production-launch authorization. Existing logo
  banner, two-line headline, bay labels, QR size and safe margins are unchanged.
  All 26 PDF pages rendered and decoded to the original bay destinations;
  exact headline, safe bounds and absence of test/footer text passed.
  Full-page samples were visually inspected. Downloaded/build PDF SHA-256:
  `10bdae83f09c22d120175af9db0f2a54f8d9f72c732b50a437d94aaad041c755`.
- 71 frontend checks, two focused generator checks and sandbox build passed.
  Only affected Hosting was rebuilt/redeployed. Receiver remains
  `fairway-button-receiver-sandbox-00002-d26`, Admin
  `fairway-admin-sandbox-00002-zzf`, notifier
  `fairway-request-notifier-sandbox-00002-riv`; their shipped backend source
  remains `0a5b153399c5e3c8a90cf53c273172a9c7833913`.
  Rules/indexes, account permissions and bay data were not changed.
- PR #13 remains draft/unmerged. PR #12 remains unchanged: receiver
  `fairway-button-receiver-sandbox-00025-9lr`, Admin
  `fairway-admin-sandbox-00024-4wb`, Hosting `7c21c25b1899c0e6`.
  No production deployment, account/credential change, firmware work or
  physical-device command occurred.

Two-line headline refinement (2026-10-25 UTC): generator source
`5b2b2556b6e1c3462a2ff26852e446a9ed1f7566`, Hosting version
`c0c07ab2925d2248`, release `1792903107379000`
(`2026-10-25T04:38:27.379Z`). All 26 rendered pages retain safe margins,
correct bay QR destinations and test markings; both focused generator checks
passed. Full-page Bay 1/Bay 26 were visually inspected. The downloaded PDF
matched local SHA-256 `c43fc82fbdce7ec67d7d4de5de1bdbb4d9c6c40f8abbaf57991e43eb0bee33d0`.
Only sign wording/type hierarchy and owner documentation changed; application
behavior and backends were not changed. PR #12 Hosting remained
`7c21c25b1899c0e6`; no production action or installation edition occurred.

- Local suites retain Cart request, category, reporting, access and command
  correlation regressions, plus transactional QR acceptance/lifecycle tests.
- Deployed HTTP/Firestore checks cover all 26 public allowlists/mappings,
  concurrent scans, one outstanding request, terminal races, same-action
  retries, receipt replay after completion, Course isolation, suspension,
  deny-by-default private data and zero device commands.
- `npm run test:qr:browser` uses private synthetic fixture input and real
  Chrome touch/mouse input against the isolated deployment: Yes/No,
  Course selection, Complete/Cancel, History, independent service controls,
  notification destination routing, safe lost-response/reload retries and
  375/430/768/1024px layout. It must not target production or PR #12.
- Real Web Push reached the persistent Chrome service worker and produced
  its notification with the correct Course/request URL. An incognito attempt
  was rejected by Chrome; that is not delivery evidence. Physical phone/iPad
  display, installed-PWA user enablement and laminated-sign scans remain CPO
  acceptance limits. Source tests are not substitutes for those observations.
- Rollback/recovery is confined to this project. Suspend the Range Course to
  reject new intents while leaving existing requests actionable. Preserve bay
  IDs, receipts and outstanding claims; do not reset identity/data or deploy
  older non-QR-aware lifecycle code against active QR requests.

Exact reviewed source and publication identities are recorded with the
completed review release evidence below. No production deployment, merge,
firmware work or physical-device command is authorized by this record.

### Completed isolated publication evidence — 2026-10-25 UTC

Application source: `0a5b153399c5e3c8a90cf53c273172a9c7833913`.
The subsequent evidence-only commit changes documentation, not shipped code.
Each ready backend revision records this source in `FAIRWAY_SOURCE_REVISION`
and serves 100% of its service traffic.

| Surface | Final publication identity |
| --- | --- |
| Receiver | `fairway-button-receiver-sandbox-00002-d26`; image digest `sha256:8fa785d16755bdbe28717b8a4c684db11411996d25746c8846766632cfdc7542` |
| Admin/access | `fairway-admin-sandbox-00002-zzf`; image digest `sha256:d485e0aa313c574807433a39f3bf905c301ee5ce084bef2ba308ad7373288f20` |
| Notifier | `fairway-request-notifier-sandbox-00002-riv`; image digest `sha256:18104fe422599680ae675c072942c385f02bbd56e672995bfecdbe9547eb4404` |
| Hosting | Version `efe009c66f88c365`; release `1792899908273000`, `2026-10-25T03:45:08.273Z` |
| Rules | `projects/fairway-refresh-sandbox-qr1/rulesets/dbd64cd3-e67d-49d2-bfeb-ff56bcd84710`; source matched |
| Eventarc | `projects/fairway-refresh-sandbox-qr1/locations/nam5/triggers/fairway-request-notifier-sandbox-003147`; created `requests/{requestId}`, `(default)`, retry enabled |

- Receiver: https://fairway-button-receiver-sandbox-125189268671.us-central1.run.app.
  Admin: https://fairway-admin-sandbox-125189268671.us-central1.run.app.
  Notifier remains private; trigger/runtime identity is
  `fairway-qr-sandbox@fairway-refresh-sandbox-qr1.iam.gserviceaccount.com`.
- Operator review:
  https://fairway-refresh-sandbox-qr1.web.app/?customer_id=CUST-0001&course_id=COURSE-0002.
  Synthetic `qr-review@example.test` credentials are delivered privately,
  never in this document, the PR or printed signs.
- Local checks: 145 backend checks, 68 frontend checks and two existing
  real-rendered Cart/category regression cases passed; sandbox build passed.
  Existing large-bundle warning remains; no new build error.
- Final deployed verification passed: 16 concurrent fresh intents produced
  one request; simultaneous terminal actions returned 200/409; retries,
  suspension, Course access, public field allowlists, all 26 bay mappings,
  no QR device commands, and all 101 active records behind 105 newer closed
  records were checked against real Firestore/Rules.
- Real Chrome touch/mouse acceptance passed Yes/No, Course switching,
  Complete/Cancel, History, independent service control, deep-link routing,
  lost response followed by reload/retry after completion, and no overflow
  at 375/430/768/1024px. Range inventory/KPI exclusion passed.
- Final headed persistent Chrome received **Server requested — Bay 11** via
  Eventarc and Web Push with the correct Customer/Course/request destination.
  No synthetic PushEvent was used. Incognito rejected registration and a
  headless repeat timed out despite transport acceptance; browser/platform
  limits are not passing physical delivery evidence.
- All 75 served files matched local SHA-256, including the 26-page Letter
  PDF and the 26 decoded QR mappings. Five composite indexes were READY;
  both counter TTL policies were ACTIVE. Synthetic active requests were
  closed through the shared authorized lifecycle after testing.
- Read-only preservation check: PR #12 stayed draft/open at
  `4a02b47a4d5a63bc61cd877f3b3901ff04386bfa`, with a clean worktree.
  Its receiver `fairway-button-receiver-sandbox-00025-9lr`, Admin
  `fairway-admin-sandbox-00024-4wb` and Hosting version `7c21c25b1899c0e6`
  were unchanged. Accepted remote main remained `08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`.

Remaining acceptance: physical phone/iPad/installed-PWA notification
enablement and display, laminated-sign scans and CPO review. Production
Monarch Driving Range Course creation, intended-account access, final
production signs, release integration with PR #12 and launch are not done
or authorized by this sandbox publication.

## Latest verified production alignment — 2026-10-23

This summary reflects the production release and read-only checks recorded
below; it is not a claim of later live status. Resolve apparently competing
revisions by service and evidence date, not by selecting an older "stable"
label or assuming accepted source was deployed.
Earlier release identities remain in their dated records below. The latest
queue/category release retains persistent service control, combined KPIs,
and On-course-only Active Cart Hours.

| Surface | Latest established evidence / remaining limit |
| --- | --- |
| Accepted repository baseline | Merged `main` `b3e1a53c47f5ffc52389666517876c5b1634e07d`, containing PRs #7/#8/#9 and the authorized Amenity Areas single-owner refinement. |
| Receiver / Admin | Receiver `fairway-button-receiver-00028-827` / Admin `fairway-admin-00019-5hm`, both Ready with 100% traffic; exact digests/builds/source archives below. |
| Current Hosting release | Version `79e31c865a6025cc`, release `1792797232817000`; custom domain and default Hosting serve byte-identical merged-main build assets below. |
| Notifier | Last-inspected production revision `fairway-request-notifier-00003-mah`, source archive generation `1790840128801876`; delivery-time entitlement/preference checks in accepted source were absent. No sandbox notifier/VAPID delivery deployment. |
| Firmware / commissioning | Per-device recovery manifests and execution records establish artifacts, not inconsistent registry `firmware_generation` labels. FRB-0001 through FRB-0005 physical validation complete; FRB-0006 reliability acceptance pending. One-time debug-key recoveries do not resolve production signing. |
| Field power | V25/V50/V75 VBUS architecture supersedes external 6106/5580/LiPo. Current field-idle consumption and autonomy are not measured; solar sufficiency is an operating assumption. |
| Cleanup | October 20 permanent deletion and October 21 CPO acceptance complete; official pilot history from the protected cutoff retained. No rerun. |

## Field-safe release readiness

Apply [Engineering Guide readiness and DoD](ENGINEERING_GUIDE.md#field-safe-readiness-validation-and-release)
and [Kaizen ownership](Continuous_improvement_Kaizen_1.0.md); this section owns
release execution, not a second approval process. Each authorized release
identifies the exact reviewed source commit, configuration and environment,
artifact identities/digests, service/Hosting targets, and deployed contract
versions. Do not equate an accepted source commit with runtime deployment.

Before rollout, validate affected modular contracts in approved sandbox
resources, including deployed firmware, older/cached clients, concurrent or
retried operations, failure isolation, authorization, and data compatibility.
Document any unavailable delivery/device coverage as a release gap.
Choose release-specific rollout order, observation window/signals, success
criteria, and stop conditions, plus an available compatible recovery target.
Include credentials, signing/trust anchors, and irreversible data transitions
in recovery reasoning; reverting code alone may not restore compatibility.
Stop on mismatched identity, failed acceptance/safety checks, unexpected
mutations, or incompatible recovery. Publication/merge does not authorize
deployment, credentials, device operations, or production-data changes.

### Queue selection and Amenity Areas production release — 2026-10-23

The CPO accepted the queue/category increment after the final display-name
refinement and explicitly authorized production release. Stable category IDs
remain `on_course` and `on_premise`; only the latter's single-owner
`display_name` changed from Driving Range to Amenity Areas. Admin options,
Cart headings, confirmation prompts, and accessible names inherit it.
Individual marker locations remain independent.

#### Reviewed source and merge provenance

- PR #7 documentation head `a2b72931b2fce183aef5c547b05728e94ad8611d`
  merged as `b2637efd300e8887d8edb9f482ad86331ff0ef3b`.
- PR #8 Architect-reviewed head
  `d33f86091673149479148c9d44d6582c95d7e105` merged as
  `8468053efb7a2e762c578f24bc01b3427ac37957`.
- PR #9 reviewed head `e2ba61f57e71d6b498f5fe205bdf7ecdbdb09311`;
  authorized single-owner refinement `0cf6b6a` and PR #7 documentation
  reconciliation produced head `5097ba56c80c8f657261d4535362ca6a9dca68ec`.
  PR #9 was retargeted to main after its prerequisites merged.
- **Merged/deployed main:** `b3e1a53c47f5ffc52389666517876c5b1634e07d`.
  Its tree exactly matches reconciled PR #9. All three PRs are merged.
  Subsequent release-evidence commits are documentation only, not a different
  deployed application.

#### Production publication identities

Project `savvy-kit-496703-r5`, region `us-central1`. The documented source
deployment commands were run from an isolated worktree at merged main,
Receiver/Admin first, then production Hosting. Existing production runtime
accounts and environment values were preserved exactly. Both services had
pinned old traffic: source deployment created Ready but inactive revisions,
so traffic was explicitly routed to the exact new revisions and re-read.

| Surface | Previous retained identity | Published identity |
| --- | --- | --- |
| Receiver | `fairway-button-receiver-00027-z7l` | `fairway-button-receiver-00028-827`, Ready / 100%; image `sha256:c83ca43dbfda1c3eb395afc808634b78f0a62e6acf9a7260c4f229862815406a` |
| Admin | `fairway-admin-00018-76r` | `fairway-admin-00019-5hm`, Ready / 100%; image `sha256:a8bb3fccbee139ed40fc48060b4d221dfe044eeeb5d982022b3f42f47d2375dc` |
| Hosting | Version `a4ac0d25fe2b84b6`, release `1792728841214000` | Version `79e31c865a6025cc`, release `1792797232817000`, `2026-10-23T23:13:52.817Z` |

Receiver build `c9218315-2413-470d-9b18-656641d85b82`, source archive:
`gs://run-sources-savvy-kit-496703-r5-us-central1/services/fairway-button-receiver/1792797096.373179-52061c6221e24ef6a5db4de953628003.zip#1792797096674671`.

Admin build `598240ae-c952-4358-81ca-849843d04d07`, source archive:
`gs://run-sources-savvy-kit-496703-r5-us-central1/services/fairway-admin/1792797098.298116-90007c5bcc8d42e984e9853a5d2db3ed.zip#1792797098589132`.

Downloaded deployed archives each matched 47 tracked backend files byte for
byte, including the shared Amenity Areas owner. Receiver retains
`936892386735-compute@developer.gserviceaccount.com`; Admin retains
`fairway-admin-prod@savvy-kit-496703-r5.iam.gserviceaccount.com`.

The production build used the existing registered Firebase web-app config,
with all six Firebase values checked against the previous served bundle and
the established production Receiver/Admin URLs. No Auth configuration changed.
Both `https://app.fairwayrefresh.com/` and
`https://savvy-kit-496703-r5.web.app/` served exact build HTML and:

- `assets/index-CYpCzFE_.js`, SHA-256
  `201d9fa50cee7cbe65c3b1a84d6342eb79c11f307fc469ba6baee6e434678ef5`;
- `assets/index-Ct0ENonq.css`, SHA-256
  `c0774bd2d456dc1c8887d72e557272126d44a242345a5f51c33c9d0fc1f4c569`.

The served entry bundle contains Amenity Areas, not the former Driving Range
category name. Both protected backend routes returned 401 without credentials,
not a missing-route response.

#### Verification and production preservation

Reused the recorded sandbox service-combination/reassignment/retry/command
checks below. From merged main, the full backend `npm test` suite, frontend
65/65, rendered browser name/queue/tab variants 2/2, and validated production
build passed. The rendered variants use Amenity Areas and a test-only alternate
name to verify all naming consumers without changing IDs or marker labels.
The isolated worktree initially lacked dependencies; restored locked
dependencies after those explicit missing-module failures and reran green.
Existing dependency audit, Node engine, and bundle-size advisories remain;
no dependency manifest or application calculation was changed.

Production observations were read-only. Before/after fingerprints of all six
Courses' service/schedule fields, all six devices' assignment/group/location
fields, 58 On-course service events, and zero additional-category events were
identical. Monarch remained ON (`service_suspension: null`); additional-group
state was not initialized or reset. All 62 pre-existing requests, including
their full historical fields/outcomes, retained their exact fingerprint
`b158c91a4761ed8fa3f17b19dd57a7b8611ae4b83bccb28e5c1f965c44136482`.

An initial total-request comparison detected 63 rather than 62 documents;
closeout paused for read-only diagnosis. The sole addition was legitimate
device traffic: FRB-0006 request `TSOkS44iX2tzaBkVPqNa`, source `nrf9151`,
received `2026-10-23T23:12:45.521Z` on old Receiver `00027-z7l`, before
traffic activation. Logs confirm its HTTP 200 button request. Excluding this
new arrival exactly restores the 62-document baseline fingerprint. It was
preserved, not completed/cancelled or backfilled with a category snapshot.
This observation does not identify the person pressing the device or claim
acceptance of the new category path.

An existing authorized production session became available during verification.
Authenticated Admin loaded the six-device fleet and FRB-0006 detail with
On-course / Amenity Areas options using stable values; no form was saved.
Cart loaded Monarch with Service ON, its two existing requests, and existing
Day KPI/History data. Selecting non-oldest Hole 2 updated the card; History
computed the entire Requests layout as `display: none`, with actions hidden.
Returning to Requests retained Hole 2. History and the refreshed KPI panel
showed one completion, 216.6 min average, 0.5 requests/hour and 1.85 active
hours at that observation (active hours advance while service remains ON).
At 375/430/768/1024/1440 px, production document width did not exceed viewport
width and both request actions stayed within its horizontal bounds. No
Complete, Cancel, Suspend or Resume action was invoked. All production device
groups still defaulted to On-course, so live dual headings/prompts were not
forced; rendered two-group name propagation is covered by the green tests.
Push permission was blocked; no delivery claim is made.

No production requests were generated by the release agent. No assignment,
service toggle, historical-field change, outcome change, credential rotation,
firmware operation, or physical-device command was performed. No fixtures,
rules/index migrations, notifier, or unrelated services were deployed.

#### Recovery and remaining limits

Retained revisions exist as the pre-release recovery identities. Ordinary
traffic recovery, if separately required:

```sh
gcloud run services update-traffic fairway-button-receiver \
  --project=savvy-kit-496703-r5 --region=us-central1 \
  --to-revisions=fairway-button-receiver-00027-z7l=100
gcloud run services update-traffic fairway-admin \
  --project=savvy-kit-496703-r5 --region=us-central1 \
  --to-revisions=fairway-admin-00018-76r=100
```

Hosting recovery uses Console **Release history -> Roll back**, after
verifying retained version `a4ac0d25fe2b84b6`. These previous backends already
use persistent, schedule-independent On-course service control, but do not
understand independent Amenity Areas eligibility/assignment. Do not treat them
as category-compatible after reassignment; evaluate current assignments/state
before any recovery. Older pre-CPO_stats_fix schedule-driven revisions have
the different semantics documented in the October 22 record below. No
migration or compatibility machinery is introduced.

#### CPO production acceptance and closeout — 2026-10-23

The CPO confirms the production FRB-0006 test passed and accepts the released
queue-selection and independent Amenity Areas controls. This CPO-confirmed
production evidence closes the release's outstanding FRB-0006 validation and
product-acceptance handoff; it is not a claim of additional agent-run testing.
The queue-selection/category increment and its prerequisite reporting/service
control work are complete, not open backlog work. The stale CPO_stats_fix
backlog entry was removed; current behavior remains owned by the UX
Specification and exact publication evidence remains in this release record.

This closeout changes documentation only. No further testing, deployment,
device assignment, service-state action, request action, or history change
was performed. Deployed source and publication identities above remain
unchanged. Unrelated queue-volume truncation, physical-phone/Safari,
push-delivery, and sustained network-reliability work remain open; this
acceptance does not establish those separate claims.

### CPO_stats_fix production release — 2026-10-22

The CPO accepted CPO_stats_fix, including persistent Resume/Suspend state and
reporting, and authorized production release. PR #5 and PR #6 were merged in
order. Reviewed feature SHA
`4b879f714e3170f8fe521be030a3da29158768be` is contained in merged `main`
`dd1b905ebb1d322df9f21809899f7214588dbe81`.

The existing production indexes were inspected first. Only the missing
`requests` composite index on `customer_id`, `course_id`, and `completed_at`
was created; it is READY as `CICAgJim14AK`. No Firestore documents, requests,
or service events were changed by this release.

Production services and identities:

| Service | Previous retained identity | Deployed identity |
| --- | --- | --- |
| Receiver | `fairway-button-receiver-00026-kg5` | `fairway-button-receiver-00027-z7l`, 100% traffic; image `sha256:f2c3e57e914f1025cda52f0bd030a49a8c4d81bd1c6f2afc2aa6c79a947d6fc4` |
| Admin | `fairway-admin-00017-dvk` | `fairway-admin-00018-76r`, 100% traffic; image `sha256:9363ba0b414d1bb08dbe2efdcdce56e08c6a2ffc896876ac22c2a7ba963310ab` |
| Hosting | Version `995c6b063a9af3c5` (recorded in the Alignment Register) | Version `a4ac0d25fe2b84b6`, release `1792728841214000` |

The deployed Hosting version serves JS asset `index-BId3qvO1.js` (SHA-256
`bed2a8f6789298658d183880ae60e9a5533f6341bba7d21ed49f59190e84d786`) and CSS
asset `index-CemshsGK.css` (SHA-256
`3940050eaffd32e84aa7ba18d1e78dce6169673c7549b026c229a37f9a88b042`).
Both `https://app.fairwayrefresh.com/` and
`https://savvy-kit-496703-r5.web.app/` served the same hashes as the production
build from merged `main`. Unauthenticated backend routes returned 401 rather
than 404.

#### Custom-domain sign-in correction and verification

In production project `savvy-kit-496703-r5`, Firebase Auth's
`authorizedDomains` was updated with the single additional entry
`app.fairwayrefresh.com`. The three pre-existing entries
(`localhost`, `savvy-kit-496703-r5.firebaseapp.com`, and
`savvy-kit-496703-r5.web.app`) were preserved. A subsequent read confirmed
the complete four-domain list; no provider, user, permission, or other Auth
setting was changed.

After reloading `https://app.fairwayrefresh.com/`, selecting Google sign-in
reached Google's OAuth authorization endpoint (HTTP 302) and returned through
the Firebase Auth handler (HTTP 200). The browser observed no
`auth/unauthorized-domain` error. No credentials were entered. The application
remained at its signed-out Cart access screen, so authenticated production
Cart, History, and KPI verification is still incomplete; no authorized Cart
Operator account/session was available in this browser session to complete
that verification.

#### Monarch preservation and current state observation

Monarch (`CUST-0001/COURSE-0001`) requests, service events, schedules, and
other records were preserved. No service-state action was issued by the
release agent. The CPO confirmed that a concurrent test caused the observed
state change and directed its preservation. A subsequent read-only
read found a `service_suspension` record with `suspended_at`
`2026-10-23T04:17:03.484Z` and no `until` field; the record was not normalized
or overwritten. No
synthetic production requests were generated and no existing outcomes were
changed.

#### Recovery behavior

The previous Hosting version `995c6b063a9af3c5` is recorded as the release
identity in the Alignment Register; that recorded identity is distinct from
present availability, which was not separately established here. Firebase
Hosting recovery is through Console **Release history → Roll back** after
verifying the retained version. Cloud Run traffic can be returned to retained
revisions using the established command form:

```sh
gcloud run services update-traffic fairway-button-receiver \
  --project=savvy-kit-496703-r5 --region=us-central1 \
  --to-revisions=fairway-button-receiver-00026-kg5=100
gcloud run services update-traffic fairway-admin \
  --project=savvy-kit-496703-r5 --region=us-central1 \
  --to-revisions=fairway-admin-00017-dvk=100
```

These are retained identities, not a rollback recommendation. The previous
backend gates request eligibility by stored Course schedules and expires
suspensions using its legacy timed semantics. The deployed application
preserves operator Resume/Suspend state independently of schedules and elapsed
time. Returning to the older backend therefore changes operating behavior;
in particular, a persistent suspension without the former `until` value is
not equivalent to a legacy timed suspension. Hosting-only rollback does not
change backend state semantics. No rollback was performed.

### CPO_stats_fix sandbox review publication — 2026-10-22

The CPO review application is published only in project
`fairway-refresh-sandbox-260930` at
https://fairway-refresh-sandbox-260930.web.app. The reviewed source is
`270587c0988e10fd4a3bdd8bbd07b9d66c8b093a`. Hosting live version
`e9b005a1eba692b4` (release `1792702082090000`, finalized
`2026-10-22T20:48:02.380884Z`) serves asset `index-Bw9Jycl8.js`, SHA-256
`5a2819d123d8db858803a7fc6fdca754a52558f883a679e5960a93e85c6d972f`.
The served asset hash matches the reviewed local build. The bundle's active
Firebase project and Receiver/Admin endpoints target this sandbox; the
production project identifier is also present as an environment-guard
constant, but the active runtime configuration targets the sandbox.

The bundle is configured for Firebase project
`fairway-refresh-sandbox-260930`, Receiver
`https://fairway-button-receiver-sandbox-269424081919.us-central1.run.app`,
and Admin
`https://fairway-admin-sandbox-269424081919.us-central1.run.app`.
Receiver revision `fairway-button-receiver-sandbox-00020-trp` is Ready and
serves 100% of sandbox Receiver traffic. Its image digest is
`sha256:08b8a70e47b00085125268a7a6c0199abb9b3c0da11b9e98d8c8ff6547e1be6d`.
The existing sandbox service account was retained. No Admin backend
deployment was made. The reporting composite index on
`customer_id`, `course_id`, and `completed_at` is READY as
`CICAgJim14AK`.

The following frontend routes returned HTTP 200 with
`Cache-Control: max-age=3600`: `/`, `/admin`, `/index.html`,
`/manifest.webmanifest`, and `/sw.js`. Authenticated browser review confirmed
the Cart Operator dashboard renders at the two approved Course links:

- `/?customer_id=CUST-0004&course_id=COURSE-0003`
- `/?customer_id=CUST-0004&course_id=COURSE-0004`

Use the existing authorized sandbox operator account and select the indicated
Course; no account or credential was created. The browser displayed Service ON
for both Courses after preparation. Course 4's stored display name still
contains “Service OFF,” so rely on the current in-app status rather than that
legacy name.

The CPO authorized resetting only the PR #4 synthetic service data for these
two Courses after compatibility inspection found it did not match the
candidate contract. Sixteen service-state/event documents under Course 3 and
one under Course 4 were removed; rejected service schema/status fields were
cleared and `service_suspension` was initialized to `null`. No rejected schema
was migrated or reconciled. No other sandbox records were reset or modified by
this data-preparation operation. Course 3 currently has one completed and one
cancelled request and no open request; Course 4 has no requests. No request
was generated for this review, so COMPLETE/Cancel actions are not currently
available. The browser
reports notification permission blocked; push notification delivery has not
been verified.

No tests, simulated requests, or device actions were run. Production and
Monarch were not accessed or changed. The build was used to prepare the review
application; its chunk-size warning remains a build warning, not a test
result.

### CPO_stats_fix reporting/History refresh correction — 2026-10-22

The reporting correction was built from feature commit
`69c76efd6b3a8b5c67cec899612d2416fb7c0905` and published only to the sandbox.
Receiver revision `fairway-button-receiver-sandbox-00022-td8` is Ready and
serves 100% of traffic in `fairway-refresh-sandbox-260930`; its image digest
is `sha256:ad5da2c11197ceae1b63e43a1db7002e67ba88700e64733314c57c6b9b1c5215`.
The existing sandbox service account and Admin revision were retained.

Hosting `dist` was published using `firebase.sandbox.json` and
`--only hosting`. The live-channel listing reports its latest release at
`2026-10-22 14:20:38`; it does not expose the finalized version ID. A direct
read of the Firebase Hosting releases API returned 403, so the version ID is
not established here. The served JavaScript is
`/assets/index-DRg9B-sO.js`, SHA-256
`e6ad3301e8affa355a91bba310ff5c8964ad3dde374e9bde6e640c126e1a3cd2`,
matching the local build. Its active Firebase project is the sandbox and its
only compiled Cloud Run endpoints are the sandbox Receiver and Admin URLs;
the production project ID remains present only as an environment-validation
guard. `/`, `/admin`, `/index.html`, `/manifest.webmanifest`, and `/sw.js`
each returned HTTP 200 with `Cache-Control: max-age=3600`.

Authenticated browser inspection of Course `CUST-0004/COURSE-0003` showed
Course-period History and KPI values together. The observed Day summary was
2 completed requests, 2.65 active hours, 5.5 minutes average completion, and
0.8 requests/hour; Week showed 3, 4.62 hours, 5.3 minutes, and 0.6/hour;
Month showed 4, 6.58 hours, 9 minutes, and 0.6/hour. Active hours advanced
between observations while the service remained ON. Cancelled entries appeared
in History but were not counted as completed. The Requests view showed the
existing synthetic open request `CPO REVIEW SYNTHETIC - Hole 11` with both
Complete and Cancel actions; neither action was activated.

One History navigation immediately after deployment logged a transient
browser fetch/CORS error and displayed a metrics-unavailable alert. Subsequent
preflight checks against both sandbox Receiver hostnames returned HTTP 204
with `Access-Control-Allow-Origin: *`, and a full page reload followed by
History navigation rendered the current metrics and rows. Treat the isolated
failure as a reported transient observation; its cause was not established.

No automated tests, simulated request outcomes, or device actions were run.
The only frontend validation was the sandbox-configured build and the
authorized read-only UI inspection above. The synthetic Course and its open
request were not modified. Production and Monarch were not accessed or
changed; no Admin deployment, merge, or production release occurred.

### Complete selected-period History correction — 2026-10-22

Feature commit `e206818cdbd65e8bd80eec29b47e4ec0b6379e0b` removes silent
History truncation from the existing reporting path. Receiver revision
`fairway-button-receiver-sandbox-00023-rcx` is Ready and serves 100% of traffic
in `fairway-refresh-sandbox-260930`; its image digest is
`sha256:66e58f19c7f59a86e4b0eab6b21057a3e472ff787a15df5f86e942e17af7dbd0`.
No Hosting deployment was needed because the Cart UI rendering did not change.

`historyRequestsInRange` and `aggregateCourseReports` now return every
selected-period History row without a 100-row slice. The backend Course
request query no longer caps its candidate input at 5,000, ensuring older
cancellations are not omitted before period filtering. KPI counting remains
unchanged and continues to count all in-period completions. No pagination
mechanism is used or required for this response. Browser inspection of the
existing synthetic Course after deployment showed its current History rows
and KPIs loading from the new Receiver revision; no review data was changed.

A focused regression test now covers Course and aggregate History with more
than 100 rows. It was not run, consistent with the CPO-first test instruction.
JavaScript syntax checks and `git diff --check` passed. No tests, synthetic
requests, database changes, production or Monarch access, Admin deployment,
merge, or production release occurred.

### Persistent service-state and schedule-free Course correction — 2026-10-22

Sandbox Admin revision `fairway-admin-sandbox-00016-jwv` was built from the
CPO_stats_fix candidate and is Ready at 100% traffic in
`fairway-refresh-sandbox-260930`. Its image digest is
`sha256:ac1d3eac3949e4d996cf60f7a2ccc59ae22f6472d7c4fd86cb06e7c7d30277ca`.
The deployed backend source is represented by feature commit
`85ebf1ea1a502a776a54d8b2ee1334e8bf10b163`. The existing sandbox service
account was retained. The Receiver remained at
`fairway-button-receiver-sandbox-00023-rcx`; Hosting was not redeployed.

Authenticated sandbox Admin UI verification created and edited
`CUST-0004/COURSE-0005` with only Course name, timezone, and comments; neither
form exposed schedule controls. The stored legacy schedule of existing Courses
was not changed by the Admin update path. Cart Operator verification suspended
and resumed `CUST-0004/COURSE-0003`; OFF remained displayed after page reload
and reauthentication, and Resume returned it to ON. The existing open review
request remained available with Complete and Cancel controls while OFF; those
actions were not activated, and no synthetic request was generated.

Focused backend checks passed: Admin API (29), service-state unit checks, and
Receiver request handling (39), including request rejection while OFF and
COMPLETE/CANCEL behavior while OFF. These checks used isolated test handlers;
no sandbox request outcome or Device command was generated. Production and
Monarch were not accessed or changed. No merge or production deployment
occurred.

## Pilot Test-Data Cleanup Execution — 2026-10-20

Under explicit CPO authorization, the one-time cleanup in production project
`savvy-kit-496703-r5`, Firestore database `(default)`, permanently deleted
498 pre-pilot requests (312 modern-tenant and 186 legacy), 307 correlated
COMPLETE commands, and 728 notification-dispatch subscription descendants,
without request-content archival. No dispatch parent documents existed;
descendants were enumerated independently of parent existence.

Selection was valid `received_at` strictly before
`2026-10-17T16:39:35.270Z`, with no tenant or status filter and explicit
protection of request `bUgIybnJz0Xv7YMdz2Pm`. Monarch Bay is Customer
`CUST-0001`; its retained deployment records begin at this established
boundary: October 17, 2026 at 9:39:35.270 a.m. PDT
(`2026-10-17T16:39:35.270Z`, `America/Los_Angeles`). The protected
FRB-0003 / Hole 12 request marks this boundary. These are Monarch deployment
records, not a separate “pilot history” dataset. The protected request and
all at-or-after-cutoff requests were retained regardless of incomplete
historical operator on/off evidence.

Existing database records may be read for the CPO_stats_fix reporting
requirements; no conversion or transfer into Git is needed or authorized.
The completed cleanup remains a one-time operation. No rerun is authorized.

Preflight snapshot `2026-10-20T20:59:41.016Z` matched the approved inventory.
Synthetic guards passed; expired demand windows, notifier delivery horizon,
queue/worker evidence, and version checks were verified before 498 atomic
request-specific transactions. Final repeated verification at
`2026-10-20T21:07:43.256Z` found zero candidates or matching dependencies
remaining, 46 retained requests, 35 retained commands, and 230 retained
dispatch descendants. All 311 retained request/dependency versions and 509
inventoried protected operational versions were unchanged.

The accepted reporting handler returned HTTP 200 with 46 history rows and
the cutoff included, using real read-only data with locally stubbed token
verification and actual access/course authorization. This was not
authenticated-browser acceptance; synthetic tests were not concurrency
stress tests, and protected-version checks covered inventoried Firestore
records rather than every external system.

The CPO relayed completed Lead Architect review of immutable evidence commit
`af5bd53304a8d42c7859c282891ec1b99ac642d6`: no material source/evidence
discrepancy requiring another production operation; published hashes matched
and independent isolated synthetic tests passed. On October 21, 2026, the CPO
accepted the completed pilot cleanup and canonical workflow clarification,
confirmed completed Lead Architect review of documentation commit
`f7810df96f6394cf551c486da98ee2303222adea`, and explicitly authorized
documentation finalization and normal merge of PR #2 only.
The [detailed evidence and provenance](https://github.com/josh-fairwayrefresh/fr-main/tree/af5bd53304a8d42c7859c282891ec1b99ac642d6/docs/evidence/2026-10-20-pilot-cleanup)
and one-time scripts remain branch-only historical review artifacts in
[draft PR #1](https://github.com/josh-fairwayrefresh/fr-main/pull/1), not
material intended for main or reusable production tooling. This record does
not authorize rerun, deployment, device operations, or infrastructure changes.

## Read-only Production Alignment Check — 2026-10-17

Cloud Run serves receiver revision `fairway-button-receiver-00026-kg5` and
Admin revision `fairway-admin-00017-dvk`, each at 100% traffic. Their image
digests are respectively
`sha256:556427bdc2cc428072caa73b6376211d9184049829901c11bfe9eb82b556867f`
and
`sha256:36a2146248fc485cf55906db09f9a161db5bf0a27ca4090a615cbcd296a8e5e8`.
The production Admin source archive matched the tracked backend source at the
time of inspection. The receiver's 2026-10-13 source archive differs from
current tracked source in five files limited to Admin user-access and
credential-lifecycle code/tests (`index.js`, `lib/user_access.js`,
`lib/fleet/devices.js`, `test/admin_api.test.js`, and
`test/user_access.test.js`). The later code is served by the separate Admin
target; inspection found no button-request or COMPLETE-poll/ack contract change
in those differences. This is a service-specific release-age difference, not
authorization to redeploy the receiver.

The public Cart Operator HTML referenced JavaScript asset
`index-B_OqSsPI.js`; its SHA-256
`53f740897566d54a9b293cd9933fd0918f04eeaef89f07d53db368d0c87cd41f` matched
the asset from a clean production build of baseline commit
`97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38`. The validated custom-location
correction in this worktree was not part of that build and was not deployed.
The Firebase Hosting management API returned 403, preventing verification of
present Hosting availability. The Alignment Register records finalized
production version `995c6b063a9af3c5` and the associated release and asset
hashes; that historical identity is not a live-availability claim. No
production deployment was performed.

Read-only Firestore inspection confirmed all six device records remained in
state `deployed`; no record was changed. Existing `firmware_generation`
metadata does not consistently identify the recovered images (FRB-0001 and
FRB-0002 retain older labels, while FRB-0003 through FRB-0006 have no value).
Per-device recovery evidence and the accepted firmware baseline, not this
legacy metadata, establish firmware provenance.

## FRB-0003 Recovery Execution — 2026-10-17

The CPO-authorized FRB-0003 recovery used the complete device-specific
MCUboot + TF-M + application image from accepted provisioning commit
`97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` and accepted Pilot 1.1 firmware
baseline `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`. The local build used NCS
3.1.1, toolchain bundle `561dce9adf`, West 1.4.0, board target
`circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. Build and image
verification used the committed device-specific builder with an owner-only
FRB-0003 input. The replacement was prepared through the deployed Admin
lifecycle; its plaintext was neither printed nor committed.

The independent artifact verifier confirmed device identity, protected
credential-input match, manifest, and checksum; MCUboot signature verification
passed against the configured NCS-distributed `root-ec-p256.pem` debug key.
The protected merged HEX was 522,444 bytes with SHA-256
`2596e7daa35877a63bf4c7571c31385b086369b22416f75a644c81ca545fe93f`.
Because this was a CPO-authorized complete replacement, `probe-rs` performed
chip erase, programmed the full merged image, and verified read-back. Fresh
post-reset UART output confirmed `STATE_IDLE`, the ready/idle message, modem
initialization, certificate handling, and LTE connection startup.

Credential operation `272fc891-91d4-47d3-9571-c5d175ea1a5c` was then confirmed
`activated` by redacted Admin status. The registry state remains `deployed`.
The CPO later confirmed the same Hologram SIM was reinstalled and FRB-0003
passed physical button, LED, cellular, and Cart Operator request-delivery
testing using its replacement credential.
The existing receiver and other devices were unchanged.
The credential-bearing artifact remains protected locally and is not approved
for reuse or distribution. No deployment, commit, or push occurred.

This one-time use of the NCS debug signing key and full merged image does not
resolve the production-signing security concern or authorize future real
device images. Production signing and trust-anchor approval remain separate
engineering work.

## FRB-0001 Recovery Execution — 2026-10-17

The CPO-authorized FRB-0001 recovery used the complete device-specific
MCUboot + TF-M + application image from accepted provisioning commit
`97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` and accepted Pilot 1.1 firmware
baseline `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`. The local build used NCS
3.1.1, toolchain bundle `561dce9adf`, West 1.4.0, board target
`circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. Independent
artifact verification confirmed the FRB-0001 identity, protected input match,
manifest, and checksum. MCUboot's signed application cryptographically
verified with the configured NCS-distributed `root-ec-p256.pem` debug key.
The protected merged HEX was 522,444 bytes with SHA-256
`1706c474d590f76dbaa8edd95ed21282236039ed251eff3793214166ee1b0408`.

With the CPO confirming the SIM removed and all external power disconnected,
`probe-rs` performed chip erase, programmed the complete merged image, and
verified read-back. After normal reset, fresh UART output confirmed
`STATE_IDLE` and the ready/idle message. Credential operation
`aaba226b-57b8-4096-9f44-d582a02f8cb7` was confirmed `activated` by redacted
Admin status; the device's Admin state remained `deployed`, and its SIM
association and assignment were preserved. The temporary plaintext input was
removed. The CPO may reinstall the same SIM after powering down and
disconnecting USB and all other power, then restore approved field power.
The CPO subsequently confirmed physical button, LED, cellular, and Cart
Operator request-delivery validation. No other device, receiver, or backend
infrastructure was changed. No deployment, commit, or push occurred.

This one-time use of the NCS debug signing key and full merged image does not
resolve production-signing security or authorize future real-device images.
The protected credential-bearing artifact remains local and is not approved
for reuse or distribution.

## FRB-0002 Recovery Execution — 2026-10-17

The CPO-authorized FRB-0002 recovery used a fresh complete device-specific
MCUboot + TF-M + application image from accepted provisioning commit
`97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` and accepted Pilot 1.1 firmware
baseline `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`. The build used NCS 3.1.1,
toolchain bundle `561dce9adf`, West 1.4.0, board target
`circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. The cancelled
initial credential and its image were not reused. Independent device/input,
manifest, and SHA-256 verification passed; the signed application passed
MCUboot cryptographic verification with the configured NCS-distributed
`root-ec-p256.pem` debug key. The new protected merged HEX was 522,444 bytes
with SHA-256
`0714de9f54b05717691bfdb6285e3e9d7f675976c99fd573b55d984f8392c00d`.

The CPO confirmed the SIM removed and external power disconnected. When
`probe-rs` reported the Nordic core locked and required erase-all, the
CPO explicitly authorized that complete erase scope. The exact-probe
`probe-rs download` with `--chip-erase --allow-erase-all --verify` completed
successfully and read-back verification passed. After normal reset, fresh UART
output confirmed NCS 3.1.1, `STATE_IDLE`, the ready/idle message, modem
initialization, CA certificate provisioning, and LTE connection startup;
fresh LTE registration was not established in the captured output.

New credential operation `d3b6eef5-bcae-4441-863e-b9406e1dab56` was confirmed
`activated` through redacted Admin status. FRB-0002's Admin state remains
`deployed`; its SIM association and course assignment remain intact. The
temporary plaintext input was removed. The CPO later confirmed FRB-0002 passed
physical button, LED, cellular, and Cart Operator request-delivery testing
using its replacement credential. No other device or backend infrastructure
was changed. No deployment, commit, or push occurred. The protected
credential-bearing image remains local and is not approved for reuse or
distribution.

This one-time use of the NCS debug signing key and full merged image does not
resolve production-signing security or authorize future real-device images.

## FRB-0006 Recovery Execution — 2026-10-17

The CPO identified the connected physical board as FRB-0006 and confirmed the
SIM removed and external field power disconnected. The sole connected CMSIS-DAP
probe was `2e8a:000c-0:E66550A14773AB35`; SWD inspection identified the Nordic
Cortex-M33 target. Production Admin confirmed FRB-0006 has a valid active
credential and no pending rotation before this recovery, with state `deployed`
and the existing SIM association and assignment intact. The original Admin
configuration was preserved. Prior current-state text claiming all six
devices were physically commissioned was unsupported and is corrected in the
current summaries; this recovery does not claim FRB-0006 physical
commissioning.

A fresh MCUboot + TF-M + application image was built from accepted provisioning
commit `97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` and Pilot 1.1 firmware
baseline `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`, using NCS 3.1.1, toolchain
bundle `561dce9adf`, West 1.4.0, board
`circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. The independent
artifact verifier confirmed FRB-0006 identity, the protected credential-input
match, manifest, and checksum. MCUboot cryptographic verification passed
against the configured NCS development `root-ec-p256.pem` key. The protected
merged HEX is 522,444 bytes with SHA-256
`e9036b887220eb1d6bfbe7c3c5343a9e5fc45fb9865f3f86a7c808fd91531afb`.

`probe-rs download` used `--chip-erase --allow-erase-all --verify` with the
identified probe and completed successfully, including read-back verification.
After reset, fresh serial output confirmed NCS 3.1.1, `STATE_IDLE`, modem
initialization, Cloud Run certificate readiness, and LTE connection startup.
LTE registration was not required or validated because the SIM remained
removed.

New credential operation `5e3c0718-58ea-4dde-8143-cbbef359e60d` was confirmed
`activated` only after programming, read-back verification, and boot
verification. Post-activation Admin reads confirmed state `deployed`, the
existing SIM association and assignment unchanged, and operation status
`activated`. The local FRB-0006 provisioning input was replaced with the
activated credential; the temporary credential-transfer input and loopback
receiver were removed/stopped. The CPO may power down the device, disconnect
USB and all other power, reinstall the same SIM, then restore approved field
power for physical button, LED, cellular, and Cart Operator request-delivery
testing.
No other device or backend infrastructure was changed. No deployment, commit,
or push occurred. The protected credential-bearing firmware artifacts remain
local and are not approved for reuse or distribution.

## FRB-0006 Intermittent Communications Evidence — 2026-10-17

After the recovery record above, the CPO reported intermittent LTE registration
and HTTPS failures, including immediate-red button outcomes. The captured
serial trace showed registration status `90` (UICC failure), then `2`
(searching), then `5` (registered roaming). A subsequent button transaction
received HTTP 200; later COMPLETE polls logged TLS connect/handshake timeout
`-116`. No signal-quality value was captured, and no serial trace ties a
particular immediate-red indication to a specific request error.

Without intervening firmware or configuration changes, the CPO later observed
another successful button request followed by a COMPLETE command that returned
the device to ready. Read-only Cloud Run logs corroborate a stored request at
`2026-10-17T08:17:43Z` and a later request `2flYDQaeAylst5YbciOQ` whose
COMPLETE poll was matched at `08:25:16Z` and acknowledged at `08:25:19Z`.
These records establish that request ingestion and COMPLETE correlation,
delivery, and acknowledgement succeeded at least once; they do not establish
sustained reliability or identify the cause of individual failures.

The button request, COMPLETE poll, and acknowledgement use the same
modem-offloaded HTTPS transport. The source creates and closes a TLS socket per
operation. The application requests PSM when field power is active; the
interaction-awake policy keeps the application CPU awake but does not itself
withdraw modem PSM. These are plausible shared device/network failure
conditions, not confirmed causes. The NCS LTE API documents automatic network
reconnection, and the observed status recovery is consistent with that, but
the logs do not establish the recovery mechanism. No firmware, backend,
credential, or production configuration change is justified from this evidence.
Keep FRB-0006 under supervised validation; require a longer representative
run with timestamp-correlated registration, signal, TLS-stage, HTTP, and LED
state logs before considering reliability acceptance.

## FRB-0005 Recovery Execution — 2026-10-16

The CPO identified the connected physical board as FRB-0005 and confirmed the
SIM removed and external field power disconnected. The sole connected CMSIS-DAP
probe was `2e8a:000c-0:E66550A147969135`; SWD inspection identified the Nordic
Cortex-M33 target, and the probe serial matches prior FRB-0005 identification
evidence. Production Admin confirmed an active credential, no pending rotation,
state `deployed`, the existing SIM association and assignment intact. No Admin
state or assignment was changed.
Earlier deployment/commissioning references do not establish physical
end-to-end validation for FRB-0005; none is claimed by this recovery record.

A fresh MCUboot + TF-M + application image was built from accepted provisioning
commit `97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` and Pilot 1.1 firmware
baseline `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`, using NCS 3.1.1, toolchain
bundle `561dce9adf`, West 1.4.0, board
`circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. Independent
verification confirmed the FRB-0005 identity, protected credential-input
match, manifest, and checksum. MCUboot cryptographic verification passed
against the configured NCS development `root-ec-p256.pem` key. The protected
merged HEX is 522,444 bytes with SHA-256
`dec9a1f4bb9b46c9af92582975db366db86682a855903b93784fbdb41ee3fbaf`.

`probe-rs download` used `--chip-erase --allow-erase-all --verify` with the
identified probe and completed successfully. After normal reset, serial output
confirmed NCS 3.1.1, `STATE_IDLE`, modem initialization, certificate
provisioning/readiness, and LTE connection startup. LTE registration was not
validated because the SIM remained removed.

New credential operation `ba4ee44e-7b49-451c-88d1-91f8cb74bf90` was confirmed
`activated` only after programming, read-back verification, and boot
verification. Admin still reports state `deployed`; the existing SIM
association and course/location assignment remain unchanged. The temporary
plaintext input and loopback transfer service were removed/stopped. The CPO may
power down the device, disconnect USB and all other power, reinstall the same
SIM, then restore approved field power for physical button, LED, cellular, and
Cart Operator request-delivery testing. No other device or backend
infrastructure was changed. No deployment, commit, or push occurred. The
protected credential-bearing firmware artifact remains local and is not
approved for reuse or distribution.

## FRB-0004 Recovery Execution — 2026-10-16

The CPO authorized FRB-0004's complete development-device recovery and confirmed
the SIM removed and all external power disconnected. The sole attached
CMSIS-DAP probe was `2e8a:000c-0:E66550A1472AB633`; SWD inspection identified
the Nordic Cortex-M33 target. This probe serial matches prior FRB-0004
identification evidence. Production Admin confirmed the permanent Device ID,
an active credential, no pending rotation, state `deployed`, the existing SIM
association and course/location assignment remain intact.
The registry identity-source and firmware/hardware-revision fields were
unavailable or marked stale; no state or assignment change was made.

A fresh MCUboot + TF-M + application image was built from accepted provisioning
commit `97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` and Pilot 1.1 firmware
baseline `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`, using NCS 3.1.1, toolchain
bundle `561dce9adf`, West 1.4.0, board
`circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. Independent
verification confirmed the FRB-0004 identity, protected credential-input
match, manifest, and checksum. MCUboot cryptographic verification passed
against the configured NCS development `root-ec-p256.pem` key. The protected
merged HEX is 522,448 bytes with SHA-256
`ff439f88f17f52cfced832d970c8710fe818cf9cbd71cbe8ebf74e13a49c1da2`.

`probe-rs download` used `--chip-erase --allow-erase-all --verify` with the
identified probe and completed successfully. After normal reset, serial output
confirmed NCS 3.1.1, `STATE_IDLE`, modem initialization, certificate readiness,
and LTE connection startup. The modem reported LTE registration status `90`;
this value is not interpreted as registration success, and the SIM was removed
during this check.

New credential operation `a0305705-dcda-467e-bbca-989f6ccf688a` was confirmed
`activated` only after programming, read-back verification, and boot
verification. Admin still reports state `deployed`; the original SIM
association and course/location assignment remain unchanged. The one-time
plaintext input and temporary loopback transfer service were removed/stopped.
The CPO may power the device down, disconnect USB and all other power, reinstall
the same SIM, then restore approved field power for physical button, LED,
cellular, and Cart Operator request-delivery testing. No other device or
backend infrastructure was changed. No deployment, commit, or push occurred.
The protected credential-bearing firmware artifact remains local and is not
approved for reuse or distribution.

## Increment 3C Readiness — FRB-0003 (historical; synthetic validation before recovery)

This readiness assessment records the state before the CPO-authorized
2026-10-17 recovery above. Its “not deployed,” authorization-gate, and
bootloader-preservation conclusions are historical for FRB-0003 and do not
supersede the completed recovery record.

The Increment 3B firmware-image discrepancy is resolved. The original two
synthetic FRB-9801 image hashes and firmware-source archive hash still match
their recorded manifests. A third pristine synthetic build was independently
verified; all three images have identical signed payloads, matching image
SHA-256 and public-key-hash TLVs, and cryptographically valid MCUboot
ECDSA-P256 signatures. The 70-byte/five-region difference between builds 01
and 02 is within the MCUboot signature TLV at the end of the unsigned
application ELF. DER-encoded signature lengths are 70, 71, and 70 bytes for
builds 01, 02, and 03. This is expected ECDSA signing nondeterminism and does
not change executable code, TF-M content, device identity, or credential
selection. Exact checksums and source/build details remain in the protected
Increment 3B/3C manifests. Diagnostic build 03 is synthetic FRB-9801,
530,004 bytes, SHA-256
`44f114e6bfe567d1e5edfb8fc6fce5592a7d182167bdb6b342398f6297e66017`.

**Signing-security blocker:** all three synthetic images were signed with
MCUboot's NCS-distributed `root-ec-p256.pem` debug key. MCUboot documents this
widely distributed key as insecure and not for production. Signature
verification with that key does not establish production trust; none of these
images may be flashed or promoted. No approved production signing key or
matching bootloader trust anchor was established, and this investigation did
not establish which key signed the currently deployed Pilot 1.1 firmware.
Resolve and verify the production signing configuration before any real
FRB-0003 build.

**Committed-builder follow-up (synthetic only):** the committed provisioning
builder at `97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` completed a fresh
FRB-9801 build with NCS 3.1.1, toolchain bundle `561dce9adf`, West 1.4.0,
the accepted board target, and `prj_a.conf`. Its protected artifact was
522,444 bytes with SHA-256
`0185d1fa044acf67ee49dd95e3355c189e9d891b7a0a11845d732ffd61f840ae`;
the independent artifact verifier confirmed the synthetic identity,
credential-input match, manifest, and checksum. The 30-test provisioning
suite passed. The build worktree was marked dirty, so this is validation
evidence, not a release artifact. The build again selected the insecure NCS
debug key and emitted nonfatal Kconfig assignment warnings; neither result
establishes production signing compatibility.

**Installed-bootloader preservation blocker:** the builder emits a full
sysbuild `merged.hex`, not an application-only artifact. Address inspection
of the synthetic merged image confirmed MCUboot data beginning at
`0x00000000` and the signed system image beginning at `0x00010000`. The
documented `probe-rs download ... <merged.hex>` command therefore programs
the included bootloader as well as the signed system image; it is not a
preserve-the-installed-bootloader update. FRB-0003's installed trust anchor
is still unknown. Do not use this full merged artifact for FRB-0003 under the
current recovery scope. A separately validated application-only artifact
path is required to preserve the installed bootloader; if that cannot be
established, a bootloader replacement requires separate CPO authorization.

The CPO confirms that FRB-0003 has one removable Hologram SIM as its only
active cellular identity, permits its temporary removal for maintenance, and
approves an offline credential transition using the existing single-active-
credential contract. The maintenance exception is documented in
`docs/HARDWARE_ASSEMBLY_GUIDE.md`; the normal installed-SIM startup checklist
is unchanged. No production service, credential, Firestore record, firmware,
or physical device was changed in Increment 3C.

| Readiness stage | Increment 3C status | Required gate |
|---|---|---|
| Admin backend deployment | Completed 2026-10-17; the reviewed candidate is ready and receives 100% traffic. Source, test-count reconciliation, deployment, and post-deployment evidence are recorded below. | Lead Architect review of this evidence. Any production credential lifecycle operation still requires separate CPO authorization. |
| FRB-0003 credential preparation/activation | Not performed or authorized; no production verifier or device registry record was accessed or changed. | Separate CPO authorization; confirm FRB-0003 identity/eligibility and preserve existing registry fields; activate only after a verified flash. |
| FRB-0003 firmware build | No real credential or real-device image was built. | Approve/configure the production signer and bootloader trust anchor; then use the authorized device input and independently verify identity, credential match, provenance, image integrity, and signature. |
| Physical flashing | Not authorized or performed. | Separate physical-operation authorization; remove the SIM only under the documented FRB-0003 maintenance exception; flash only the verified artifact. |
| End-to-end validation | Not performed. | Separate validation authorization; verify boot, LTE, authenticated request, request attribution, Cart Operator actionability, and correlated COMPLETE; record evidence. |

### FRB-0003 Recovery Stage 1 — Admin deployment (2026-10-17)

**Source identity:** the isolated candidate is the accepted Admin baseline
`a07e9080473a92631a00d499482d37f35a5ca481` plus the eight-file
credential-lifecycle delta declared in
`backend-increment3b-source.manifest.json`. The candidate archive SHA-256 is
`3081b5d5bfdcfd2936be3d1da546d0cbd3e411bc66f7fa80df00faae6bff2537`.
It was deployed from the isolated release candidate, not the dirty `main`
checkout. Cloud Build `34afe3b0-5512-4fdc-b77e-4915453fab63` succeeded using
Node.js 22.23.3.

**Test-count reconciliation:** a clean lockfile install and the complete
candidate backend suite passed **118/118** tests. Re-running the accepted
baseline produced **106** tests; the candidate adds 12 tests (one Admin API
test and 11 lifecycle tests). The earlier 103 `PASS:` lines count only output
with that prefix, not all test cases. The prior 105/105 baseline count was not
reproduced. The synthetic Firestore Emulator suite passed **8/8**, including
transaction contention and retries. The local install used Node.js 24.15.0
and emitted an engine-range warning for locked `cloudevents@8.0.3` (maximum
Node.js 22); the deployed Cloud Build runtime, Node.js 22.23.3, satisfies that
range.

**Production deployment:** `fairway-admin-00017-dvk` is Ready and receives
100% of `fairway-admin` traffic in `us-central1`. Its image digest is
`sha256:36a2146248fc485cf55906db09f9a161db5bf0a27ca4090a615cbcd296a8e5e8`.
The existing service account, timeout, maximum scale, CPU, memory, concurrency,
and environment-variable names were preserved. No production IAM, Firestore
rules/indexes, receiver, firmware, or device configuration was changed.
The receiver remains `fairway-button-receiver-00026-kg5` at 100% traffic.

**Post-deployment verification:** unauthenticated GET requests to the
FRB-0003 lifecycle-status route and existing `/api/v1/admin/users` route
returned HTTP 401. Build and revision logs had no ERROR/FATAL entries; the
credential-shaped log matches were limited to Cloud Build source-object
identifiers and image digests. No authenticated production Admin request was
made, so authorized lifecycle-status behavior and authenticated existing
Admin behavior were not independently exercised in production; existing
behavior is covered by the passing backend regression suite.

No production credential lifecycle operation was invoked. No credential,
verifier, device registry record, receiver, firmware, or physical device was
changed. This deployment makes the Admin capability available; it does not
authorize FRB-0003 credential preparation, activation, firmware build, or
physical recovery. At this historical stage, FRB-0003 credential recovery had
not occurred and no physical recovery had been demonstrated. Its removable Hologram SIM was
its only active cellular identity; temporary removal for offline maintenance
is authorized by the CPO as documented in
`docs/HARDWARE_ASSEMBLY_GUIDE.md`. The production-signing key and matching
bootloader trust anchor remain an independent unresolved blocker for a real
FRB-0003 image.

The full recovery order and failure handling are owned by
`docs/DEVICE_PROVISIONING_GUIDE.md`. Byte-for-byte equality is not required
when the signed payload and key provenance are established and each exact
artifact passes integrity and signature verification. A matching source
fingerprint alone is insufficient.

## Increment 3B Release Readiness — FRB-0003 (2026-10-16; not deployed)

**Disposition:** release candidates and procedures are prepared for independent
review only. No production service, credential, Firestore record, firmware, or
physical device was changed. The CPO has approved a short FRB-0003
authentication interruption in principle; that does not authorize deployment
or physical recovery.

This section preserves the Increment 3B findings as historical evidence.
Increment 3C above supersedes its firmware-discrepancy and SIM-isolation
uncertainties; neither section authorizes deployment or physical recovery.

### Verified production backend baseline

Read-only Cloud Run metadata showed:

| Service | Active revision | Traffic | Image digest | Created |
|---|---|---:|---|---|
| Admin (`fairway-admin`, `us-central1`) | `fairway-admin-00016-fs9` | 100% | `sha256:1f1cc7d1f55d373ee796786de34dd0323b746c8007e1c18617f2458a4a20a407` | `2026-10-13T09:04:06.695225Z` |
| Receiver (`fairway-button-receiver`, `us-central1`) | `fairway-button-receiver-00026-kg5` | 100% | `sha256:556427bdc2cc428072caa73b6376211d9184049829901c11bfe9eb82b556867f` | `2026-10-13T06:57:39.670699Z` |

The Admin runtime identity is
`fairway-admin-prod@savvy-kit-496703-r5.iam.gserviceaccount.com`, with the
existing `roles/datastore.user` and `roles/firebaseauth.admin` grants. The
receiver uses the project compute service account with its existing
`roles/datastore.user` and `roles/run.builder` grants. Inspection exposed only
environment-variable names, not values. No lifecycle routes are deployed.
Existing Admin mode, allowed origins, service identities, ingress, invoker,
scale limits, and timeout are retained by the candidate. The Admin lifecycle
uses the existing server Firestore client and authorization; no new
environment variables, IAM grants, Firestore rules, indexes, or infrastructure
are indicated.

### Deployed-source provenance correction

The 2026-10-13 deployment used repository `main` at
`e388e9a6dcc855136693aec2f39c39eb32bb12a1`. A byte-for-byte comparison of the
deployed source archives against Git found that the 37 comparable Admin files
match the accepted `a07e9080473a92631a00d499482d37f35a5ca481` source, while the
37 comparable receiver files match `e388e9a6dcc855136693aec2f39c39eb32bb12a1`.
Neither deployed archive contains the credential-lifecycle routes. Thus the
repository revision used for that deployment must not be read as evidence that
the Admin lifecycle implementation was deployed.

### Candidate provenance and validation

At the time of this Increment 3B entry, the backend candidate was based on
accepted repository commit `a07e9080473a92631a00d499482d37f35a5ca481`; its
complete 8-file delta was recorded in the protected source manifest. The
candidate `npm test` run emitted 103 `PASS:` lines and no failures, and the
isolated Firestore Emulator suite passed 8/8, including the three
competing-transaction cases with observed callback overlap and retries. The
test-count discrepancy was still unresolved at that point. The 2026-10-17
Stage 1 release verification reconciled it: the accepted baseline rerun
contained 106 tests, the candidate passed 118/118, and 103 counted only
`PASS:`-prefixed output; the earlier 105/105 count was not reproduced. See the
Stage 1 record above for deployment and production-validation limits. Emulator
evidence does not establish production IAM or authenticated production
behavior.

The firmware candidate starts at accepted Pilot 1.1 firmware source
`6a19f83c5bd5d1d390efd937daa1c38c0e837eb0` and includes only the
device-specific provisioning integration; the temporary HTTPS trust-resilience
changes are excluded. Provisioning/artifact tests passed 30/30. Two protected
synthetic `FRB-9801` builds passed artifact verification, but their merged
images differ by 70 bytes across five address regions and by two bytes in
length despite matching source fingerprints. At the time of Increment 3B the
cause was unresolved; Increment 3C above identifies the differences as
expected MCUboot ECDSA-P256 signature-TLV nondeterminism. No real-device
credential or FRB-0003 firmware was built.

At the time of Increment 3B, physical recovery was blocked by the unresolved
SIM-removal and pre-power-checklist questions described above. The CPO's
subsequent Increment 3C confirmation and authorized maintenance exception
supersede that blocker; current procedure and remaining readiness gates are
recorded in the Increment 3C section above.

Normalized source snapshots and exact manifests are retained in the private
Increment 3B session artifacts, not in this repository:

| Candidate | Source archive SHA-256 |
|---|---|
| Backend | `3081b5d5bfdcfd2936be3d1da546d0cbd3e411bc66f7fa80df00faae6bff2537` |
| Firmware | `d298d5518c711af752e327f22c7e4e60422c45c541a71c664ecae84ec8be3051` |

The manifests list exact changed files, build/tool inputs, synthetic artifact
checksums, test results, and release limitations. The firmware archive was
built with NCS 3.1.1, toolchain bundle `561dce9adf`, West 1.4.0, board
`circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`.

### Admin-only deployment and recovery gates

After independent review and separate CPO authorization, the candidate
deployment command structure is:

```sh
gcloud run deploy fairway-admin --project=savvy-kit-496703-r5 \
  --region=us-central1 \
  --source=<reviewed-backend-candidate>/fairway_backend/cloudrun_receiver \
  --function=fairwayAdmin --quiet
```

Deploy the Admin service only; do not redeploy the receiver or Hosting. Before
deployment, recheck the active revision, runtime identity, configuration,
traffic allocation, and candidate test results. After deployment, confirm the
new revision is Ready at 100% traffic with the existing identity/configuration.
After separate authorization, use an authenticated global-Admin, redacted
read-only FRB-0003 operation-status request to verify route availability.
Unauthenticated/non-Admin requests must fail closed. Do not prepare, activate,
or cancel a production credential as a deployment smoke test. Verify that the
receiver revision is unchanged and observe only naturally occurring,
aggregate authentication/request health; do not induce device traffic or read
unrelated device records. Deployment itself must not change active credentials.

Before any rotation is pending, code rollback may restore the previous Admin
revision. If a rotation is pending, resolve or cancel it while lifecycle routes
are still available before rolling back; cancellation is a production write
and needs separate authorization. After activation, Admin code rollback does
not restore the old verifier. Keep the lifecycle routes available through
activation and device validation; any post-activation recovery requires a
separately authorized replacement rotation and firmware cutover. The complete
FRB-0003 sequence and failure handling are owned by
`docs/DEVICE_PROVISIONING_GUIDE.md`.

## Admin Button Activity Report — Implementation Review (2026-10-28)

**Historical review evidence; production release is recorded
[above](#admin-button-activity-report-controlled-production-release---2026-10-28).**
The accepted presentation correction shows only device IDs in the legend,
preserving stable colors and separate original/replacement IDs. No historical
location evidence or counting definition changes. The sample and assertions
are regenerated accordingly; all 116/63 records, 12 daily pairs and 179 original
point coordinates still reconcile. The actual rendered device-only sample
retains all coverage/history notes. Production publication must pass the
staged actual-runtime/authenticated-read gates before traffic.

The original implementation authorization was isolated validation only.
Branch `feat/admin-button-activity-report` began from clean main and matching
`origin/main`, **`94fafa7e95292e0aa11b210df807a3ecd57d3d42`**. The production
alignment at that original review stage was unchanged.
The originally draft [PR #21](https://github.com/josh-fairwayrefresh/fr-main/pull/21)
is now merged;
implementation and committed sample source is
**`4f6af99d0fa28fc42bd7a0b0724016d0a4864dd7`**. Later review-record-only commits
do not change that validated implementation.

### Owners and isolated evidence

- `lib/button_activity_report.js` is the report model/counting owner;
  `lib/button_report_sources.js` reads the existing sources and retrieves all
  pages; `lib/button_report_pdf.js` renders only the finished model.
  `POST /api/v1/admin/reports/button-activity` uses the existing stored Admin
  access owner, strict Customer/Course validation and `Cache-Control: no-store`.
- Logs: direct `entries:list` against the runtime project's
  `locations/global/buckets/_Default/views/_AllLogs`, filtered to receiver
  Cloud Run rejections, exact Course and receipt window. Empty continuation
  pages are followed. Log identity deduplicates retrieval, not distinct retries.
  Bucket `get` supplies current retention metadata; no sink, view, pipeline
  or reporting store is created. Legacy messages lack Customer identity, so
  the existing globally allocated Course-ID contract is checked for unique
  ownership before attribution; ambiguity or over 10,000 directory records
  fails rather than mixing Customers.
- Requests: root `requests`, exact Customer/Course and receipt range, descending
  receipt/document-ID cursor pages of 500, projected report fields only, within
  one read-only transaction pinned to generation as-of. This reuses the tracked
  `customer_id ASC, course_id ASC, received_at DESC` collection index (document
  name inherits descending order). No new index definition/deployment is needed;
  confirm the existing index is Ready during an authorized release.
- `test/fixtures/button_activity_reference.json` contains sanitized retained
  exports, original SVG point coordinates and explicitly attributed CPO
  location-label evidence. Credentials, account actors and raw request payloads
  are excluded. Fixtures are excluded from Cloud Run source upload.
- Exact reference boundaries: **2026-10-17T16:39:35.270Z** through
  **2026-10-28T17:30:04.899Z**, inclusive. This is the original post-deployment
  receipt interval and as-of boundary, not the later Firestore export read time.
  Reconciliation reproduces **116 suspended attempts / 63 completed requests**,
  all 12 daily pairs and all **179 original point coordinates**, preserving
  receipt-time grouping and the original six colors.
  Daily pairs (empty/completed), October 17–28:
  `0/19, 8/12, 30/3, 2/1, 6/3, 4/3, 18/6, 10/9, 26/5, 6/1, 4/1, 2/0`.
- Thirteen isolated report tests cover Admin denial, parent validation/ambiguous ownership,
  all-page retrieval, token loops/caps, source failures, snapshot/cursor arguments,
  DST/invalid dates/exclusive midnight, as-of completions, retry/duplicate handling,
  wrong Customer/Course and QR/open/cancelled exclusion, retention and PDF limits.
  Existing backend regression suite passes, including stock, staff, QR/lifecycle
  and authorization owners.
- Production-configured frontend build passes; **83 frontend checks** pass
  serially including actual Admin Reports generation/download, stale/error
  handling and operator Customer/service regression. Browser checks cover
  375/430/768/1024/1440 px without unintended overflow.
- Reference PDF is 792 × 612 points, one page; the 31-day layout continues across
  three pages. Poppler rendering/text inspection verifies legend, circles/dots,
  daily counts, exact boundary text and all explanatory notes without clipping.
  Reproduce the sample with `BUTTON_REPORT_SAMPLE_DIR=<private-output>` and the
  report test under the established sandbox test environment. The initial review
  sample used supplied hole labels as **reference fixture only**. The CPO's
  controlled-release correction supersedes that presentation: the committed
  sample and product now show device IDs only; historical label evidence
  remains unchanged in the fixture JSON and explanatory notes.
  The [committed sample PDF](../fairway_backend/cloudrun_receiver/test/fixtures/button_activity_reference.pdf)
  is review evidence, not a separately generated production report. All extracted
  words in the reference, uncertainty, 31-day and 18-device samples fit within
  the 792 × 612 point printable bounds; no notes or legend text are clipped.

### Precise future runtime permissions and publication scope

At the original isolated review stage, no grants, production reads through
the new endpoint, deployment, merge, production writes or customer notifications
were performed. Actual authorized runtime grants/publication are recorded
in the current production release above; the requirements below explain
their original review rationale.

For production runtime
`fairway-admin-prod@savvy-kit-496703-r5.iam.gserviceaccount.com`, verify:

1. `logging.views.access` on
   `projects/savvy-kit-496703-r5/locations/global/buckets/_Default/views/_AllLogs`
   for this view-scoped `entries:list` request. The bounded predefined grant is
   `roles/logging.viewAccessor` **on this view**, not all project views.
2. `logging.buckets.get` for that `_Default` bucket's retention metadata,
   through a narrowly scoped custom read role on the owning project if absent.
   No logging writer/admin, private-log project-wide reader or IAM administration
   privilege is required. Project-container `logging.logEntries.list` is an
   alternative query authority, not a reason to grant broad access when the
   implementation explicitly targets the view.
3. Existing Firestore Customer/Course/list/query and read-only transaction
   permissions remain necessary; this feature performs no Firestore writes.
   ADC uses the attached runtime identity and cloud-platform OAuth scope;
   never use an interactive user's credentials or expose Logging access to
   the browser.

IAM semantics: [entries.list](https://cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list),
[log-view access](https://cloud.google.com/logging/docs/logs-views#control-access),
and [bucket get](https://cloud.google.com/logging/docs/reference/v2/rest/v2/projects.locations.buckets/get).
Live runtime permission verification is a **future release gate**, not claimed
by isolated adapter tests.

Affected publication surfaces are **Admin Cloud Run and Hosting only**.
`pdfkit` and `google-auth-library`, already present at the same locked versions,
are runtime dependencies for Admin PDF/ADC execution. Receiver, notifier,
Eventarc, firmware, Firestore Rules, Auth/entitlements, permanent signs and both
sandboxes are unchanged. No new index is proposed. Before any separately
authorized release, capture the then-current compatible recovery baseline,
stage Admin without traffic and verify normal Admin authorization, retained
reads and actual PDF generation before shifting traffic; publish compatible
Hosting afterward. Preserve stock/assignment/Course-aware writers and every
legitimate post-release record. Recovery must not restore data or older
inventory/staff writers; use a compatible forward correction or the captured
compatible Admin/Hosting versions. No migration or backfill is required.

### Acceptance limits

No new production endpoint/IAM acceptance is claimed. Current retention cannot
recover already expired attempts, prove historical log exclusions or establish
unreceived physical pushes. Verified historical assignments are unavailable
in the retained source contract; current placement is intentionally unused.
The fixture's CPO labels are not a production assignment timeline. Native
office printing and physical Safari/iPad/PWA acceptance remain unverified.
The existing Vite chunk-size warning remains; dependency promotion does not
change locked package versions. Existing dependency-audit findings are not
remediated by this bounded report increment.

## Alignment Register

The Alignment Register preserves historical release evidence and provenance;
its entries describe the state at their recorded dates. It does not supersede
the current subsystem owner Sources of Truth or newer accepted evidence
summarized above. New entries are placed at the TOP of this register.

### Prototype 4.0 — CPO Field-Validated Stable Firmware Baseline (2026-11-11)

**Status:** CPO-accepted stable firmware baseline for the Prototype 4.0
architecture: common credential-free MCUboot + TF-M images with TF-M PSA
protected identity, production-signed autonomous OTA, and authenticated
running-version confirmation. Field-validated on FRB-0005 only.

- **Source rollback reference:** annotated tag `prototype-4.0-field-validated`
  on the `main` merge commit that integrates the reviewed branch
  `review/frb0005-increment-1.0-source-checkpoint-20261105` (merge-preparation
  commit `1e6e96d6f30a5bdc7e1696f68185bb0a5ce3768d`, which contains
  `main` `609664ef97883764ebcd34065cc73c94f3be934a`). The tag is immutable;
  do not move or recreate it.
- **Validated firmware:** `OTA-1.0-r4`, version `1.0.0+4`, nightly schedule;
  signed SHA-256
  `cd1ecbdf6072a5ad72b2ed1e86d6fe207c12717d5f057c6f8f1437b29db9e26e`
  (281659 bytes), production ECDSA-P256 fingerprint
  `sha256:be1c125733db97148309513e75282736024bec3e2b47beb44b7aa3008f4f88eb`.
  Built from base `cfc98efde2db49e6190c769064c5e587c2076a10`; firmware source
  digest `831cf3b9a2eadc52e6b6c425e2c3bf8377a0f7fb63a3644e1535c5f998eb69c9`,
  identical in the tagged source. Original manifest
  `docs/releases/OTA-1.0-r4-manifest.json`; CPO exact-hash acceptance and
  publication under
  [OTA-1.0-r4 correction](#ota-10-r4-correction--cpo-acceptance-and-publication-authorization-2026-11-10);
  production GCS generation `1794365611041915`.
- **Companion releases (same firmware source):** USB-only bootstrap
  `OTA-0.1-r4` (`0.1.0+6`, `00a33f9f06056e3468ad7165af51a255ffad40574d9a14570cccd78c030717e1`)
  and nightly `OTA-0.1alt-r4` (`0.1.0+7`,
  `e05e67f4b5b060658badd1881fd0189be1b53f3019df67ee29c0a221a45849f2`),
  accepted under
  [r4 discovery parsing correction](#r4-discovery-parsing-correction--cpo-acceptance-and-publication-authorization-2026-11-10).
- **Platform:** Circuit Dojo nRF9151 Feather,
  `circuitdojo_feather_nrf9151@1/nrf9151/ns`, Nordic NCS 3.1.1, `prj_a.conf`,
  MCUboot move-swap with the production trust anchor, TF-M.
- **CPO field acceptance (2026-11-11), FRB-0005:** clean USB install of
  `OTA-0.1-r4`; autonomous OTA to `0.1.0+7` (2026-11-10 18:20 Pacific) with
  CPO-confirmed post-OTA request and COMPLETE; then scheduled nightly OTA to
  `1.0.0+4`: download, verification, staging, activation, reboot and
  authenticated running confirmation at 12:32:45 AM, displayed in Admin
  Firmware OTA and the device registry. Records:
  [r4 installation and first OTA](#r4-publication-frb-0005-installation-and-first-verified-ota--2026-11-10)
  and [OTA-1.0-r4 field installation](#ota-10-r4-field-installation--cpo-field-validation-2026-11-11).
- **Automated validation (merge preparation, 2026-11-10):** full backend
  suite (including 30 OTA API and 34 fleet/governance cases), 100 frontend
  unit tests, 29 browser tests (3 private-fixture skips), production build
  with 107 verified Driving Range assets, 119 Python release/provisioning
  tests (1 skip), and the OTA host suite including the real NCS JSON decoder
  regression and concurrent registration test.
- **Supersedes as current baseline:** earlier Prototype 4.0 development
  checkpoints and readiness records, and the original, r2 and r3 OTA
  artifacts. Those remain immutable history; r3 images contain the 32-bit
  discovery defect and must not be reassigned.
- **Limitations and qualifications:** validated on FRB-0005 only; the rest of
  the fleet remains on Pilot 1.1 images with no verified OTA capability.
  Routine USB service still requires PV8. A clean reinstall restarts the
  running-confirmation sequence, which the backend rejects until a higher
  sequence arrives. Rollback, interrupted-download recovery and a
  post-`1.0.0+4` request/COMPLETE were not exercised. Pack autonomy and fleet
  power behavior are unqualified.
- **Rollback meaning:** the tag recovers source and records only. Reverting
  source is not a validated device rollback; firmware downgrade, MCUboot
  trust and security-counter compatibility, re-signing and production
  redeployment remain separately authorized operations.

### Running-confirmation successors — CPO acceptance and publication authorization (2026-11-10)

- The CPO accepts USB-only `OTA-0.1-r3` (`0.1.0+4`), signed SHA-256
  `a93b4620d119a7d08b253ca76e1dcbe697557f329d2bf262246b742d58d6986d`;
  nightly `OTA-0.1alt-r3` (`0.1.0+5`), signed SHA-256
  `79e53b5643fcc78cabb152e89eeac4fc1377587dd58b71c51d41c0cb7637275d`;
  and nightly `OTA-1.0-r3` (`1.0.0+3`), signed SHA-256
  `2869c2f47cb1b6a35665235e6b24bacd401aaafe8dfa59f632514d0cf0ebd41d`.
- All signatures, production trust, generated layout/capacity, common-image
  credential exclusion and matching current firmware-source digest are verified.
  Bootstrap pairing with the existing commissioner is independently verified.
  Local host, wire-contract and release/provisioning tests are recorded above.
  This acceptance is not physical autonomous OTA qualification.
- The CPO authorizes VSC publication of the two nightly successors for FRB-0005
  only and required source/release commits and push on the existing review
  branch to `origin`, without merge. Source checkpoint
  `00530a1a5875c3217e1de7e0368cd8b323fe1173` is remotely verified at
  `https://github.com/josh-fairwayrefresh/fr-main/commit/00530a1a5875c3217e1de7e0368cd8b323fe1173`.
  This entry recognizes the release revision in the Alignment Register.
- Publication must use the existing authenticated Admin engineering contract,
  exact accepted bytes, original manifests and real remote-backed release
  evidence. The old r2 releases remain immutable and usable by existing
  assignments; each becomes unselectable for new assignments only once its
  governed r3 replacement is actually published. Bootstrap remains USB-only.
- Publication creates no assignment and authorizes no implicit cancellation,
  rearming, credential operation or physical flash. FRB-0005's unresolved old
  assignment and consumed one-time schedule require explicit reconciliation
  before a new 900-second commissioning attempt. The CPO will make the next
  OTA assignment personally.
- Original manifests and release acceptance records are remotely backed up at
  `fd631ecf9d9479ada8f11c937e072093b80797a5`, independently verified on the
  designated review-branch remote before enabling the approval catalog.
  Default production validation accepts the exact two final artifact/manifest
  pairs and the complete release-specific governance evidence.

### Prototype 4.0 corrected successor publication (2026-11-10)

- Published the CPO-accepted, production-signed `OTA-0.1alt-r2` and
  `OTA-1.0-r2` exact hashes to the private bucket and Admin catalog. Source
  approval records/manifests are backed up at
  `f06cde9e441a3824a9acc6c63cffacf6f2dee5db`; the reviewed release-catalog
  code is backed up at `cb02beb08b8ab5f1876194e753d0deef1bfe6a6e`.
- Receiver `fairway-button-receiver-ota-r2-cb02` and Admin
  `fairway-admin-ota-r2-cb02` are Ready at 100%; the previous delivery-enabled
  revisions remain rollback anchors. Private GCS object size and release/hash
  metadata match both accepted manifests. Admin shows both releases
  published/assignable for FRB-0005 only; deployment inventory is empty.
- No assignment, review, valid device authorization token, download, flash or
  physical commissioning occurred. Current Fleet eligibility still rejects
  FRB-0005 because sufficient verified physical OTA initialization/trust
  evidence is not present in the production authorization record, despite the
  documented USB OTA 0.1 installation. Resolve through the separately
  authorized canonical evidence operation before assignment; do not infer
  capability or rearm the persisted one-time timer. See the current readiness
  section above.

### Prototype 4.0 artifact delivery enablement (2026-11-10)

- Independently verified organization `284487864580` has only enabled
  `_Default` and `_Required` sinks, neither with child-resource inclusion.
  The project `_Default` sink's unsampled artifact URL exclusion remains active;
  `_Required` routes audit/system logs, not request URLs.
- Reverified the private bucket's uniform access/public-access prevention,
  least-privilege Admin publisher and Receiver reader roles, and the unchanged
  production image/runtime identities. Staged and promoted Receiver
  `fairway-button-receiver-00051-dad` then Admin `fairway-admin-00062-zuv`,
  each Ready at 100%, changing only
  `FAIRWAY_OTA_DELIVERY_ENABLED=false` to `true`.
- Staged and production negative tests reject an invalid artifact token with
  `403 download_not_authorized`; unauthenticated production Admin access remains
  `401`. All six OTA collections were read-only counted at zero after promotion.
  No valid token, release publication, real-device assignment or download was
  created; no firmware was delivered/flashed and no physical commissioning
  occurred. Corrected-release acceptance/governance/publication and physical
  commissioning authorizations remain separate.
- Rollback anchors are the prior delivery-disabled revisions
  `fairway-button-receiver-ota-delivery-43b4da0` and
  `fairway-admin-ota-delivery-43b4da0`.

### Prototype 4.0 OTA security evidence and source backup (2026-11-10)

- The CPO manually inspected the organization Logs Router for
  `284487864580`: only `_Default` and `_Required` were displayed as enabled,
  neither including child-project logs, and no other organization sinks were
  displayed. This is CPO-observed console evidence, not an independently
  retrieved organization API response; VSC's `gcloud` credentials required
  interactive reauthentication, which was unavailable in the noninteractive
  execution context.
- This was an earlier same-day checkpoint before interactive CLI
  reauthentication and delivery activation. Its limitation has been superseded
  by the immediately preceding API-verified enablement record.
- The qualified immutable candidates remain `OTA-0.1alt-r2` (`0.1.0+3`,
  280,387 bytes, SHA-256
  `2f146c14586740fd7b0097e6a67ef2be3e82b20aa7d6b4d8cd792f39ef667844`) and
  `OTA-1.0-r2` (`1.0.0+2`, 280,387 bytes, SHA-256
  `21fe0f3df7cf775631b1d0af5f534ba35927e099e72b1b3184ee4713c4ba594c`).
  They remain unaccepted and unpublished; existing OTA 0.1 bootstrap and
  historical release identities are unchanged.
- Corrected source, tests and owner documentation are backed up on
  `review/frb0005-increment-1.0-source-checkpoint-20261105` at source commit
  `685cf648fed4e366be37cb8f9861490ec9a31e39`. This source backup satisfies
  neither release-specific CPO acceptance nor publication authorization. The
  OTA catalog and assignment collections were last verified empty on
  2026-11-09. FRB-0005 physical OTA commissioning remains unperformed and
  separately gated.

### Prototype 4.0 delivery infrastructure and corrected candidates (2026-11-09)

- Authorized private bucket/runtime IAM, project log exclusion, delivery-off
  backend deployment and local signed successor qualification completed.
  Resource/image/build/source identities, actual access tests and rollback
  anchors are recorded in the bounded current-readiness subsection above;
  firmware hashes/capacity/provenance are owned by the Firmware Specification.
- Organization `284487864580` sink visibility remains denied. Delivery stays
  explicitly disabled; this entry is not organization logging clearance,
  CPO firmware acceptance, publication authorization or physical OTA acceptance.
- All six OTA collections remain empty; Hosting and original firmware artifacts
  unchanged. No publication, real-device assignment, physical operation, Git
  commit or push occurred. Corrected source/release records still need separately
  authorized remote backup and all release-specific publication gates.

### Prototype 4.0 empty-catalog OTA Administration production release (2026-11-09)

- CPO-authorized no-traffic staging, receiver-then-Admin promotion and Hosting
  publication completed. Current source/archive, image/build and Hosting
  identities are recorded in the production deployment subsection above.
- Runtime/secret/origin contracts and existing tags retained; complete
  127-file Hosting artifact and all 107 accepted Driving Range assets verified
  on both origins. Authenticated read-only OTA/fleet/Inventory/Cart/reporting
  checks pass; actual empty-catalog OTA UI passes five responsive widths.
- All six OTA collections remain empty. No business mutations, Firestore
  rules/index or IAM changes, firmware build/signing/publication/delivery,
  real-device assignment, physical operation, Git commit or push occurred.
- Prior production versions remain available as rollback anchors. Firmware
  publication/infrastructure and physical commissioning remain separate gates;
  this deployment does not establish Prototype 4.0 physical OTA completion.

### Prototype 4.0 production/OTA source alignment (2026-11-09, local only)

- Integrated the demonstrated production application delta against the existing
  OTA worktree, preserving credential protections, OTA contracts and corrected
  local scheduler source. Reports, Inventory/QR, notification recovery and
  responsive Cart behavior are no longer absent from the candidate.
- Reconciled production Hosting routing/cache headers, retained accepted public
  assets and restored production dependency/build contracts. Publication
  approvals remain empty; accepted firmware artifacts remain untouched.
- Backend regressions, 97 frontend unit/config checks, 13 selected browser
  regressions and production compilation/107-public-asset verification pass.
  The current alignment subsection above owns rollout identities, configuration
  preservation and rollback anchors. No new firmware tests or production
  preflight were performed.
- Source/configuration is ready for separately authorized staged empty-catalog
  deployment. No deployment, cloud write, firmware build/signing/publication,
  real-device assignment, physical operation, Git commit or push occurred.

### Prototype 4.0 Admin OTA integration completion (2026-11-09, local only)

- **CPO decision reconciliation:** headquarters timezone is approved as
  `America/Los_Angeles`, superseding the unresolved-HQ status of the preceding
  local checkpoint. Course IANA zones still govern deployed assets; the fixed
  update window remains local 00:30. OTA 0.1 remains USB-only.
- **Source integration:** runtime HQ default, shared catalog/assignment
  eligibility, post-authorization placement/trust/timezone binding, private
  noncacheable device responses, sanitized application transport-error logging,
  and a prepared Cloud Logging exclusion complete the remaining local gaps.
  Existing fleet selection/review/confirmation and publication separation are
  preserved. No new release approvals or production records were fabricated.
- **Validation:** full backend operational regressions pass after the shared
  receiver response/error changes; focused OTA coverage includes 17 API and
  20 fleet/governance tests plus the logging-exclusion configuration test.
  Eight focused frontend/authorization tests and production frontend compilation
  pass. Prior firmware and unrelated frontend tests are reused, not repeated.
  Full-Admin-shell browser validation demonstrates exact four-device
  confirmation and authenticated **simulated** confirmed/downloading/failed
  reports, with a fourth device remaining assignment-only and firmware unknown.
  Phone/tablet/desktop checks at 375/430/768/1024/1440 px pass without overflow.
  Rules and exclusion configuration checks validate local source shape, not
  deployed rules, live Log Router efficacy or physical installation.
- **Deployment boundary:** local validation supports review of the Admin
  capability with an empty governed catalog. Live bucket/IAM, log routing,
  revision/Hosting rollback preflight and CPO deployment authorization remain
  required. Firmware acceptance/publication and physical commissioning remain
  independently gated; this entry is not authorization for any cloud operation.

### Prototype 4.0 OTA artifact recognition and local recurrence/fleet correction

- **Recognized immutable artifacts:** OTA 0.1 `0.1.0+1` (USB initialization
  only), OTA 0.1alt `0.1.0+2` and OTA 1.0 `1.0.0+1`, CPO-accepted
  2026-11-09. Exact package hashes, original dirty-build provenance and
  source-only checkpoint `0f21f5ebf849695b40898253136d4589b525a6a4`
  are recorded at the top of this Guide. This entry does not change that
  provenance, authorize publication or assert remote backup of current edits.
- **Discrepancy:** both accepted nightly packages contain source-confirmed
  recurrence defects. Local real-worker host tests establish corrected
  mode-sensitive completion and repeat-check/retry behavior; no accepted image
  was rebuilt/re-signed/replaced. Corrected successors need separately approved
  identities and complete acceptance. OTA 0.1 remains physically installed and
  unchanged; the remaining pending/consumed one-time check state is unknown.
- **Local integration:** fixed-local-00:30 exact-ID review/confirmation,
  canonical fleet hierarchy including Inventory/Maintenance, server-governed
  publication and truthful lifecycle reporting replace engineering controls
  in the CPO dashboard. Fictional loopback validation is not production
  publication/assignment or device installation.
- **Publication/readiness status:** blocked. Current source/record edits are
  uncommitted, the reviewed publication catalog is empty, HQ timezone policy
  needs CPO confirmation, production infrastructure/log protections require
  verification, and physical autonomous transitions/continued operation remain
  unaccepted. Existing artifact acceptance and any earlier artifact-specific
  publication authorization do not authorize corrected successor artifacts.
  No production deployment, firmware build, flash, publication, assignment,
  commit or push occurred in this increment.

### UI-ALIGN-01 — Cross-Form-Factor UI Alignment & Operational Stability (2026-10-29)

- **Status: COMPLETE — implemented, integrated, deployed and CPO-accepted for
  the coordinated UI alignment scope.** The final Refresh App icon refinement
  was deployed before the CPO's **2026-10-29 09:06 PDT** confirmation,
  **"looks good. approved"**. This confirmation closes its final visual
  acceptance condition for the demonstrated UI scope. Authorization to deploy,
  passing tests and Hosting publication are not physical acceptance evidence.
- **Consolidated scope:** Cart Requests, Driving Range and Inventory share
  responsive desktop/tablet/mobile presentation standards, consistent
  Customer/Course navigation and authorized controls. The shared Requests
  interface retains the Driving Range's Course-owned request/history/service
  behavior without introducing Inventory, operator management or Cart KPI
  panels into Range. Inventory alone owns operator selection and shift
  management; Requests attribution stays read-only. Reporting, authentication,
  request handling and notification ownership remain intact.
- **Accepted implementation and release references:** the
  [Driving Range integration](#driving-range-production-integration-and-controlled-release--2026-10-26)
  (PR #13, source `db9001ecba79b88f6584a6d407de355dc0c63d75`) and
  [Customer/service hierarchy correction](#operator-customerservice-hierarchy-correction--2026-10-26)
  establish the service/navigation dependencies. The
  [responsive Requests banner and notification release record](#responsive-notification-strip---production-release-2026-10-28)
  records accepted operator workflow `59384bbda49445f160273576249fa598f25d7824`,
  banner `496a6f726485c66d157ba17e5d62c50d6bbdca8d` integrated through
  PR #24, and compact responsive notification strip through PR #25.
  The [Inventory banner release](#responsive-inventory-banner---production-release-2026-10-28)
  (PR #27) completes the corresponding Inventory presentation.
  [Refresh App](#user-initiated-refresh-app---production-release-2026-10-29)
  (PR #29) adds one guarded, user-initiated reload owner and entry revalidation;
  its [final header-icon release](#refresh-app-header-icon---production-release-2026-10-29)
  (PR #31) places the accessible icon immediately left of available Admin/
  Sign out controls in both top header rows. These dated owner records retain
  exact provenance and evidence; this entry is not another release register.
- **Current deployed functionality:** frontend source
  **`be70a5e3064624d23709bd48187f4ce2f79f89bc`**, Hosting
  **`2e923bc2314454f4`**, release **`1793289751660000`**, at
  **https://app.fairwayrefresh.com/**. Main
  `b080efa2089a2a29f38b76a60d817725dfe77892` adds release documentation
  only over that deployed application. Refresh retains authentication, scope,
  persisted operator/shift state and notification settings; open shifts do
  not require closeout. Existing owners block interruption of edits, in-flight
  operations and unresolved Inventory submissions. No automatic reload,
  implicit logout, shift close or service-state mutation is introduced.
- **Validation evidence:** the final exact application tree has **102/102**
  relevant passing frontend regressions; **12/12** focused checks and a
  production-configured build pass after integration. All **127** live files
  match published artifacts. Responsive automation covers desktop, iPad and
  phones, including 320-1920-pixel banner checks, Admin/non-Admin order,
  44-pixel targets and no clipping/overflow. Isolated workflows cover operator
  selection, request actions, notification mutations, shift/closeout recovery,
  protected sign-out, unsaved edits and two-release standalone-mode refresh.
  Authenticated nondestructive production smoke verifies both actual refresh
  controls, scope/session/preferences/service preservation, Inventory's **93**
  products and Export availability, and Requests/History navigation.
- **CPO physical/visual evidence and limits:** the CPO explicitly confirmed
  completed physical iPad/Safari validation before the Inventory banner
  release, as recorded there. The subsequent 09:06 PDT approval accepts the
  deployed final refresh-icon presentation after publication; it is not an
  explicit report of a new physical iPad/Safari test. The earlier Inventory
  physical validation was predeployment evidence, not proof of physical
  acceptance of every subsequent deployed increment. Neither approval asserts an unreported
  second-release physical iOS update test, live shift transactions, all-phone/
  Safari qualification, physical push delivery or QR scan/print validation.
  Automated standalone simulation is not physical-device proof. Those
  narrower existing evidence limits remain in their owner records and are
  not reopened as blockers to this accepted UI milestone. Driving Range
  service activation remains a separately authorized operational decision.
- **Preservation/recovery:** current backends remain
  **`fairway-admin-report-5396b69`**, **`fairway-button-receiver-qr-db9001e`**
  and **`fairway-request-notifier-qr-db9001e`**. The final release's verified
  rollback remains Hosting **`8d70fcfa6287e4cb`**, release
  **`1793288702309000`**, with all **127** previous files retained and the
  same entry-revalidation/immutable-asset policy. Follow its release record;
  no backend or operational-data rollback is implied. Existing production
  identities, recovery references and historical register entries are retained.
- **Remaining milestone acceptance condition: none.** This documentation-only
  closeout changes no application behavior, production infrastructure, data,
  firmware, credentials or independent product/field qualification status.

### Inventory-owned operator workflow - review branch only (2026-10-28)

- **Source:** `fix/inventory-owned-operator`, based on
  `3ec5a8df4a0da4c992f850be567839b95c21f32e`, containing only the reviewed
  source/test/doc increment. Its single feature commit identifies the review
  source; no merge SHA exists. PR #23 is not incorporated and remains preserved.
- **Scope/evidence:** Inventory-only shift management, read-only Requests
  attribution display, centralized application sign-out protection; 98 local
  frontend checks, scoped in-memory Inventory/report regressions and production
  build pass. The [local review record](#inventory-owned-operator-workflow---local-implementation-review-2026-10-28)
  owns evidence, persistence boundaries and unperformed operational acceptance.
- **Production:** unchanged from the verified reporting release immediately
  below. No publication or data/configuration/IAM changes are authorized by
  this review entry. Existing compatible recovery remains unchanged.

### Production Admin Button Activity Report - 2026-10-28

- **Source:** accepted PR #21 head `d6a990b3990f72ebf053a91efa856c10ac4b1bc7`,
  device-only label correction reviewed at
  **`eee363bfdafaf982e35bf68482d342d8a2edaaea`**;
  merge/deployed application **`5396b69366c8cbd64142fac1c0f0b8403295246d`**.
- **Runtime/Hosting:** Admin **`fairway-admin-report-5396b69`**, Ready,
  **100%** after zero-traffic actual-runtime gates; Hosting
  **`e51a5e6d10cd84ac`**, release **`1793234300546000`**,
  **`2026-10-29T00:38:20.546Z`**. Receiver/notifier remain their
  **`qr-db9001e`** revisions at **100%**; existing indexes/triggers, firmware
  and both sandboxes are unchanged.
- **Authorization:** existing stored Admin access and Customer/Course owner.
  Added only exact-view `logging.viewAccessor` and a bucket-conditioned
  custom role containing solely `logging.buckets.get` to existing Admin
  runtime. Actual staged Admin **200**, ordinary Customer **403**, unsigned
  **401**, invalid parent **404**; live unsigned **401**.
- **Evidence:** original fixture **116/63**, all daily/point matches;
  live normal Admin UI Generate/Download **120/63** at
  `2026-10-29T00:38:52.006Z`, exact-as-of independent query/render match.
  Device-only legend, stable colors, landscape Letter, all 280 words within
  printable bounds, live 375-1440 px controls without clipping/overflow;
  all 128 served files match the merged production build.
- **Preservation/recovery:** operational records, full inventory, staff,
  service state, entitlements, preferences, permanent signs and both sandboxes
  preserved; one normal subscription heartbeat changed only timestamp fields.
  Cart remains **OFF** as observed at this release; Range **suspended**.
  Compatible recovery is Admin **`fairway-admin-qr-db9001e`** plus Hosting
  **`8ee4867beb77d9fa`**, never old incompatible writers/stale-data restore.
  The [release record](#admin-button-activity-report-controlled-production-release---2026-10-28)
  owns image/source/IAM identities, query boundaries, detailed preservation,
  recovery and existing physical-device/notification acceptance limits.

### Admin Button Activity Report — Draft Review Only (2026-10-28)

Historical pre-release checkpoint, superseded by the production entry above.

- **Source scope:** `feat/admin-button-activity-report` from verified main
  `94fafa7e95292e0aa11b210df807a3ecd57d3d42`. Admin reporting only; no merge or
  production publication. [Draft PR #21](https://github.com/josh-fairwayrefresh/fr-main/pull/21)
  identifies the exact review head; implementation/sample source is
  `4f6af99d0fa28fc42bd7a0b0724016d0a4864dd7`.
- **Evidence:** 116/63 accepted-reference reconciliation, all daily/point
  records, existing backend regressions, 83 frontend checks, actual
  production-configured build and rendered landscape Letter/continuation PDFs.
  [The implementation review record](#admin-button-activity-report--implementation-review-2026-10-28)
  owns reproduction, permissions, future publication and acceptance limits.
- **Production preserved:** Hosting `8ee4867beb77d9fa` and all three existing
  `qr-db9001e` backends remain the recorded deployment baseline. No runtime
  IAM, data, service state, entitlement, notification or sandbox changes.

### Production Operator Customer/Service Hierarchy — 2026-10-26

- **Current frontend:** Admin Customer names and Customer-scoped authorized
  services share the existing selected Course context. Ordinary-user scope,
  deep links, Cart inventory/staff and Driving Range behavior are preserved.
  Mutation locks and scoped async/DOM updates prevent cross-Customer context.
- **Source/Hosting:** [PR #19](https://github.com/josh-fairwayrefresh/fr-main/pull/19),
  reviewed head `676da88662c4ca8183dfefb091f2dc8dd1fe6a1c`, merged/deployed
  **`e8793db058bf34b8a9a976dbea07b7b91769b93e`**; Hosting
  **`8ee4867beb77d9fa`**, release **`1793062793254000`**,
  **`2026-10-27T00:59:53.254Z`**. This supersedes only the prior Hosting
  identity, not the current Driving Range backend/data baseline below.
- **Preservation/limits:** all three `qr-db9001e` backends remain at **100%**;
  normal authentication, entitlements, full inventory/history, five Tony Lema
  staff, preferences/subscriptions, permanent signs, firmware and both sandboxes
  are unchanged. Cart remains ON; Driving Range remains suspended.
  No production transactions or customer test notifications. Existing physical
  phone/Safari/PWA/OS delivery/print acceptance limits remain.
- **Evidence and recovery:** the
  [bounded release record](#operator-customerservice-hierarchy-correction--2026-10-26)
  owns 86 passing checks, actual production build, live authenticated/viewport
  checks, 128 served-file matches, exact 33-surface preservation and compatible
  Hosting-only recovery to `1be3937a43d1c771`. Preserve current stock-aware,
  assignment-aware and Course-operation-aware writers and every live record.

### Production Driving Range QR and Service Switching — 2026-10-26

- **Current production milestone:** independent Monarch Driving Range Course
  **`CUST-0001 / COURSE-0003`**, still **suspended** pending separate CPO
  activation; 52 permanent production bay-side locations on 26 paired Letter
  signs, A left/B right. Existing Course selector, Requests/Complete/Cancel,
  History, independent service state and explicit Course notification choices
  are reused; Range has no Inventory/session/Cart KPI panels.
- **Source/provenance:** reviewed PR #13 head
  `6e3afe55e55b0384dfa97c68bc7e6881dc843ce6` integrated current main
  `3aa8106605910e040bd71369eb22abe36a237aec` in
  `c749d18ce060eb515160bf030cdf166066598b34`; merged/deployed source
  **`db9001ecba79b88f6584a6d407de355dc0c63d75`**. PR #13 is merged, no
  longer a separate unmerged review increment. Accepted PRs #12/#14/#15/#16/#17
  inventory/staff ownership and recovery contracts survive integration.
- **Runtime:** Admin **`fairway-admin-qr-db9001e`**, Receiver
  **`fairway-button-receiver-qr-db9001e`**, notifier
  **`fairway-request-notifier-qr-db9001e`**, each Ready at **100%** after
  zero-traffic verification. Hosting **`1be3937a43d1c771`**, release
  **`1793060385305000`**, `2026-10-27T00:19:45.305Z` (October 26 PDT).
  Existing trigger/VAPID/runtime identities retained; one active-query index
  added READY and two scoped QR TTL policies ACTIVE; Rules unchanged.
- **Account/staff boundary:** only existing `monarch_cart@fairwayrefresh.com`
  and `monarch_fnb@fairwayrefresh.com` gained `COURSE-0003` alongside their
  existing Tony Lema entitlement. No Admin/password/provider changes,
  orphan provisioning or staff reassignment. Alex, Wendy, Christina,
  Michaela and Michael (F&B Management) remain assigned only to Tony Lema.
- **Preservation and checks:** all original product IDs/fields/columns/
  quantities, staff/history, Cart service state/preferences/subscriptions,
  normal authentication, firmware and both sandboxes are preserved.
  Shared lifecycle/notification isolation, retries/races, full active queues,
  production build, authenticated service switching, public-menu compatibility
  and all 52 rendered production QR destinations passed proportionate checks.
  No artificial production operational records or customer test pushes.
- **Links, detailed evidence and recovery:** the
  [canonical release record](#driving-range-production-integration-and-controlled-release--2026-10-26)
  owns exact source/images, Course/account scope, 128 served-file matches,
  consistent preservation snapshots, operator URL and
  [final installation PDF](https://app.fairwayrefresh.com/driving-range-signs/driving-range-installation.pdf).
  Retain stock-aware, assignment-aware and Course-operation-aware backends,
  all new identities/entitlements and legitimate history; no old-writer or
  stale-snapshot restore. Private recovery artifacts are local-only; physical
  scans/phone/PWA/OS delivery/print acceptance and existing inventory/firmware
  limits remain explicit rather than implied by publication.

### Production Inventory and Course-Assigned Operators — 2026-10-26

Historical milestone: its runtime identities and unmerged-PR #13 status are
superseded by the Driving Range production milestone above. Its accepted
inventory/staff behavior, detailed evidence and recovery requirements remain.

- **Accepted production scope:** persistent inventory, attributed sales,
  immutable audits, session-specific shift close, genuine Excel export and the
  live committed On Cart golfer menu. The public On Cart filter applies only
  to the golfer menu; it never replaces, synchronizes or prunes the operator's
  complete catalog. Accepted behavior remains owned by the
  [UX specification](UX_SPECIFICATION.md#persistent-cart-stock-staff-audits-and-shift-close).
- **One operational staff owner:** the existing Customer staff directory,
  Admin editor and operator/approver pickers use explicit Course assignments,
  independently of login accounts and account permissions. Monarch's active
  Alex, Wendy, Christina and Michaela are Cart Operators; Michael is F&B
  Management (Director of Food & Beverage). All five are assigned only to
  Tony Lema (`CUST-0001 / COURSE-0001`), not Driving Range or other Courses.
  Stable IDs, repeat-safe population, legacy compatibility and immutable
  attribution evidence remain in the
  [staff release record](#course-assigned-operational-staff--2026-10-26).
- **Verified source and merged provenance:** reviewed
  [PR #12](https://github.com/josh-fairwayrefresh/fr-main/pull/12) head
  `545bcf2249b1c967a6062266ebd2057fe75c5bab` merged as
  `854e10cf2a825363ba448e57a47b6748db50007a`;
  [PR #14](https://github.com/josh-fairwayrefresh/fr-main/pull/14) recorded
  its release evidence in merge `b3dd798dcd0447c9c5918a5d84129417de26d54a`.
  [PR #15](https://github.com/josh-fairwayrefresh/fr-main/pull/15) head
  `598a026b4b4bddcb44e94bae2ad1859fe031d3c0` merged/deployed as
  **`00ada007910d8b758e1b9d922eb937e49873bd43`**;
  [PR #16](https://github.com/josh-fairwayrefresh/fr-main/pull/16) recorded
  its closeout in merge `4f92f55a01a3cf34cddf5f41df0b3496e2383d40`.
  These documentation merges do not change deployed application bytes.
- **Baseline at this milestone (now historical):** Admin **`fairway-admin-staff-00ada00`**,
  Ready at **100%**, with `staff-release` pointing to it; Hosting version
  **`c2004110805c6599`**, release **`1793056093222000`**
  (`2026-10-26T23:08:13.222Z`). Source/image identities and all 19 served-file
  comparisons are retained in the staff release record. The inventory-only
  revision `fairway-admin-inventory-854e10c` and Hosting
  `cf3ff61ae7b0254f` are historical cutover identities, not the current baseline.
- **Preservation and isolation:** the
  [inventory release evidence](#persistent-inventory-production-release--2026-10-26)
  proves complete Monarch preservation by product ID, field and column:
  57 products (43 On Cart, 14 Sold Out; no In Inventory or archived records
  existed), with archived/all-column behavior covered by representative tests.
  Missing quantities read as zero without default writes or movement.
  The staff follow-up reverified all 58 production products, 94 events and
  four historical published menus unchanged; only the five authorized staff
  and their five creation receipts were added. Existing authentication,
  account/Course access, Receiver, notifier, firmware and both sandboxes are
  unchanged. The separately recorded CPO-confirmed service Resume remains
  intentional operational activity, not a release mutation.
  [PR #13](https://github.com/josh-fairwayrefresh/fr-main/pull/13) remains a
  separate draft, open and unmerged.
- **Recovery and acceptance limits:** retain both stock-aware transaction/
  idempotency contracts and Course-assignment enforcement. Do not restore
  either the pre-inventory writer or the assignment-unaware inventory-only
  Admin after population. Keep the current compatible Admin and all records;
  use a compatible forward fix, or the documented Hosting-only recovery.
  Never reset live stock/history from a stale snapshot. Detailed recovery,
  retained private local-only artifacts and disabled PITR are owned by the
  staff and inventory release records above. Their existing limits remain:
  no new physical phone/Safari or office-print/native Excel acceptance,
  and no manufactured production sales, audits or shifts; isolated attribution
  tests and normal authenticated picker reads do not claim those transactions.

### Approver-only audits, final-sales confirmation and audit-history export — PR #12 Sandbox (2026-10-24 UTC)

- **Authority/source:** CPO final refinements within draft PR #12, sandbox only.
  Application source `6380c238a58ad4c94b7ec352198fcb1c11505780` on
  `feat/persistent-cart-inventory`, based on unchanged main
  `08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`. Evidence-only documentation
  commits do not alter deployed bytes. No merge, production deployment/data,
  receiver, firmware or physical-device operations.
- **Audit ownership:** the existing audit transaction/idempotency owner now
  requires only the active selected approver, authorization attestation,
  coherent revision and authenticated submitting UID. It does not require,
  start, lock or mark an operator shift active. Stock/catalog mutations retain
  their shift requirement. Audits still snapshot only current On Cart products;
  immutable historical records retain their original names and scope.
- **Close-out:** submitting the entered dollar total first displays
  **Are you sure?** with the exact amount. Cancel restores entry without
  clearing the draft/operator or closing. Confirm uses the existing duplicate-safe
  close operation; failure/uncertainty preserves amount/name and recovery,
  while confirmed success clears only the submitting session and stays idle.
- **Export:** the authorized `GET .../audits` reads durable summaries for the
  selected Course's current local date plus the preceding 13 dates, through
  read time. A bounded timestamp query and local-date filter preserve midnight/
  DST boundaries without a composite index. The separately named **Audit History**
  worksheet includes period/timezone, Course context, every audit date/time and
  historical approver-name snapshot, regardless of current inventory filters.
  No audits has an explicit empty state; failed history retrieval blocks
  download with an actionable error. Portrait Letter print area, repeated
  headings, margins and fit-to-width pagination keep history readable without
  changing Inventory Report's existing one-page landscape layout.
- **Checks:** full backend **160 passed**; focused inventory **27 passed**.
  Real isolated Firestore emulator **26 passed, 1 unit-only fault-injection
  skip** (passed in-memory). Frontend **71 passed**, full browser **6 passed**;
  sandbox configuration/build, diagnostics and `git diff --check` passed.
  Coverage includes no-operator audit and lost-response retry without shift
  selection, concurrent audit replay, unchanged idle/other-session behavior,
  exact fourteen-date start boundary and DST/midnight exclusion, historical
  names, Course authorization, empty history and export-read failure, confirmation
  cancellation, uncertain close/reload/reconfirmation and duplicate-safe retry.
  Prior stock, drag, menu/privacy, queue and service coverage remains passing.
- **Workbook evidence:** the real browser-download regression reads both
  worksheets from the saved `.xlsx`. The deployed filtered workbook was captured
  from the exact Blob generated by Export and read back as genuine OOXML:
  Inventory Report identifies **CPO TEST Beverages**, Not selected and its
  existing print area; Audit History contains **all seven** Course audit rows,
  period **2026-10-11 through 2026-10-24**, `America/Los_Angeles`, historical
  approvers and PDT date/times including October 23 evening rows. Native download
  events are unavailable in the shared browser, so this deployed check verifies
  the generated artifact, while the standalone browser regression verifies an
  actual filesystem download. A representative **58-product** Inventory Report
  worksheet XML is byte-identical to the prior implementation whose actual
  one-page print was verified; audit history is an independent second worksheet.
  No new physical/office print acceptance is claimed.
- **Admin publication:** `fairway-admin-sandbox-00024-4wb`, explicitly routed
  **100%**, verified Ready/Active. Image
  `sha256:8166a5172428d3c351e7afeabab0147ff54f206b9210149277cdbb2551e8c565`;
  build `3f53626d-2105-47f7-a0f3-e723a56d1240`; source
  `gs://run-sources-fairway-refresh-sandbox-260930-us-central1/services/fairway-admin-sandbox/1792884132.60338-dd874bb0b27049fa8267bfb09ee8556b.zip#1792884132820463`.
  Service account, sandbox environment/project and origin matched predeployment.
  Receiver remained `fairway-button-receiver-sandbox-00025-9lr` at **100%**,
  not redeployed.
- **Hosting publication:** **`7c21c25b1899c0e6`**, release
  **`1792884212706000`**, **2026-10-24T23:23:32.706Z**. Exact served index and
  all **11** assets matched the committed-source build. Existing large lazy
  Excel chunk warning remains nonblocking.
- **Live audit:** trusted browser mouse input submitted
  `E6pAHqitOn2F6SQIHkNW` at **2026-10-24T23:25:12.113Z**, approved by
  CPO TEST F&B Manager, while the isolated session was Not selected. Request,
  durable audit and event have Auth attribution but no operator/shift identity.
  No chooser opened and no shift existed for that session at audit submission.
  On Cart snapshot/revision protection remains intact.
- **Live close/data accounting:** a subsequent explicit zero-to-zero quantity
  adjustment on labeled `CPO TEST Sold Out Invariant 118a0bb` resumed after
  staff selection, creating the isolated test shift
  `ItSu2talDHU7lly7pVzA`; no stock balance or sale tally changed.
  Trusted entry of **$12.34**, submission and Cancel returned to the retained
  amount/name. Reconfirmation closed it at **2026-10-24T23:26:13.397Z**.
  Browser response-interception timing was inconclusive as a lost-response
  simulation; controlled local rendered tests establish that failure/reload
  retry path. Exact live replay of operation
  `ee4ba2cf-b34b-4db4-b55e-29089e41bc06` returned the same close; durable readback
  verified **one** closure/event and 1234 cents. UI remains Not selected/no dialog.
  The pre-existing CPO session/shift `aREoDUGaVGqmoZ6dn4m7` remained active and
  untouched; testing used a separate tab/operator session. No inventory selection,
  quantity, sales, historical audit or other-session close was manufactured.
- **Review:** <https://fairway-refresh-sandbox-260930.web.app/inventory?customer_id=CUST-0005&course_id=COURSE-0007&inventory_review=6380c23>.
  PR #12 remains open/draft; production and main remain unchanged. Physical
  iPad/Safari acceptance remains with the CPO.

### Sold Out invariant, On Cart audits and idle completion — PR #12 Sandbox (2026-10-24 UTC)

- **Authority:** CPO correction within draft PR #12. No merge, production data
  repair/deployment, firmware or physical-device operations. Current requirements
  are owned by the UX specification; earlier entries retain historical evidence.
- **Published source:** `118a0bbb232ccf21f52d7cd8c220966f0eb52ba5` on
  `feat/persistent-cart-inventory`, based on main
  `08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`. Subsequent evidence-only commits
  do not change deployed application bytes.
- **Contract correction:** positive On Cart **or In Inventory** to Sold Out
  uses the existing sale mutation with explicit `state: sold_out`, exact remaining
  units and required `expected_stock_revision`. The transaction validates current
  revision/count, records one attributed sale and writes zero/Sold Out together.
  Ordinary sales remain On Cart-only; availability-only moves cannot bypass the
  invariant, and positive Sold Out creation is rejected. Cancel changes nothing.
  Stale confirmation requires refresh/reconfirmation; identical retries reuse
  the original operation. No zero-unit sales, clamping or fabricated corrections.
- **Audit/UI correction:** new immutable audits contain only nonarchived current
  On Cart products. Old audits remain unchanged. The dialog says exactly
  "Record your cart inventory at the start and end of a shift." without revision
  commentary. Audit is directly beneath Close out / Enter final sales inside
  the operator/Sales Today panel. Golfer-View Menu remains on the filter-row right
  with matching typography and a new-tab selected-Course link.
- **Idle completion:** successful stock/audit submissions cannot re-enter during
  their post-save refresh. Successful close invalidates older session reads,
  clears only that scoped session's name/draft/continuation and leaves no dialog.
  Failure/uncertainty retains explicit retry recovery. A subsequent attributed
  user action, not completed audit/close callbacks, prompts for a name.
  The initial live pre-fix audit/close sequence did not reproduce the CPO's exact
  popup. Deterministic regressions reproduced repeated audit completion during
  refresh and a delayed pre-close session result restoring the closed identity;
  removing either respective guard reproduces its failure. Physical iPad cause
  and acceptance are not claimed from those tests.
- **Verification:** backend **158 passed**; isolated Firestore emulator
  **24 passed, 1 unit-only fault-injection case skipped** (passed in-memory);
  frontend **69 passed**; full browser **6 passed**. Final two affected browser
  tests were rerun after the scoped-generation/audit-loading refinements and
  passed, then sandbox configuration/build passed. Editor diagnostics and
  `git diff --check` passed. Existing stock concurrency, retry, immutable/stale
  audit, shift recovery, public privacy, export, queue and service regressions
  remain covered. The existing large lazy Excel chunk warning is nonblocking.
- **Admin publication:** `fairway-admin-sandbox-00023-hsd`, explicitly routed
  **100%**, verified Ready/Active. Image
  `sha256:fd519297b92da6f53212c1e28294ce9429c7edadb93aadc97bee264ff9946805`;
  build `6f0b12fb-62b8-4dfc-ab98-08e9303c57fa`; source
  `gs://run-sources-fairway-refresh-sandbox-260930-us-central1/services/fairway-admin-sandbox/1792879489.086242-355b700cc08d47338cbbb028b7452031.zip#1792879489428230`.
  Runtime service account, sandbox project/env, allowed origin and service-control
  setting matched the predeployment description. Receiver remained
  `fairway-button-receiver-sandbox-00025-9lr` at **100%**, not redeployed.
- **Hosting publication:** version **`a26dc30c32e60f4f`**, release
  **`1792882873237000`**, **2026-10-24T23:01:13.237Z**. Exact served index and
  all **11** asset files matched the committed-source local build.
  Firebase credentials were refreshed before successful publication.
- **Deployed interaction:** browser-generated mouse dragging from In Inventory
  opened the remaining-two confirmation on its first gesture; Cancel retained
  revision 71, quantity 2 and daily total 7. The selector opened the same dialog;
  Confirm committed In Inventory 2 -> Sold Out 0 and total 9. Confirmed loading
  restored On Cart 2. Browser-generated touch input then opened remaining-two
  confirmation on its first gesture. An attributed test adjustment to 1 made
  that confirmation reject with 409; refresh displayed remaining-one, and Confirm
  committed On Cart 1 -> Sold Out 0, total 10. Replaying the exact successful
  operation changed neither inventory nor tally and persisted only one sale.
  These were trusted browser input, not synthetic `dispatchEvent` drag proof.
  Physical iPad/Safari acceptance remains for the CPO.
- **Deployed audit/close:** the exact explanation and only Tea 4 / Automatic Menu
  Updated 2 appeared in the audit; Sold Out and In Inventory were absent.
  Audit `FX7ZQ4mylGv79M2Ia3yE` durably snapshots those two On Cart products at
  revision 75, manager approval, operator identity, Auth account and server time.
  Success left no chooser. Test shift `D0kmQ06UJmDPLBsBUPCV` closed for **$0.00**;
  after a delay and focus refresh the name remained Not selected with no dialog.
  Only a subsequent explicit quantity-confirm action prompted for staff; both
  dialogs were cancelled, leaving the UI idle and inventory unchanged.
- **Data accounting:** scope was labeled `CUST-0005 / COURSE-0007` only. New
  `CPO TEST Sold Out Invariant 118a0bb` product `PwwYVkfzoSgbRrWCYl6Q` remains
  Sold Out 0 with two genuine test sale records (2 + 1 units), one loading event
  and one explicit 2 -> 1 adjustment used to test stale confirmation.
  Existing five products' quantity/state/stock revisions were unchanged; other
  sessions were not closed or reassigned. Final Course revision is 76.
  Pre-fix investigation audit `yuka2lA1ot77BJ8CDNl1` at revision 69 retained its
  then-valid three-product scope; its test shift `0acqXFukAHX5AZyOmMLG` closed
  for $0.00. Neither historical record was rewritten.
- **Existing-data scan:** before testing, all **65** sandbox inventory products
  contained **zero** positive-quantity Sold Out records. Final **66**-product
  scan again found zero; no legacy correction or invented sale was required.
  Durable readback verified both attributed test sales, exactly one record for
  the replayed operation, the two-product audit and the closed shift.
  Production was not inspected or silently repaired.
- **Responsive/live preservation:** deployed geometry at **1440/1024/768/430/375
  px** showed no horizontal overflow, clipped relevant controls or lost grouping.
  Audit remained beneath the session action inside its panel, menu typography
  matched, and relevant targets remained at least 44 x 44 pixels. Public response
  still contained only the two committed On Cart products with no quantities or
  private operational records. Review:
  <https://fairway-refresh-sandbox-260930.web.app/inventory?customer_id=CUST-0005&course_id=COURSE-0007&inventory_review=118a0bb>.

### Open/reload menu and Excel inventory report — PR #12 Sandbox (2026-10-24 UTC)

- **Authority:** CPO refinement within existing draft PR #12, superseding the
  prior public polling/focus behavior and CSV format. No merge, production,
  firmware or physical-device authority. The existing committed-inventory API,
  field allowlist, stable links and accepted operational transactions remain
  unchanged. Prior entries below are dated evidence, not current UI guidance.
- **Published application source:** `67076f0b0de0d48b1bba5a9011878ecb3eaeb6fa`,
  branch `feat/persistent-cart-inventory`, based on main
  `08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`. Subsequent documentation-only
  evidence commits do not change deployed assets.
- **Changes:** the golfer menu fetches on open/manual reload or explicit
  initial-error retry, not on a timer or focus. All categories start collapsed,
  including Canned Cocktails. View Menu opens the selected Course in a new tab,
  stacked directly above Confirm Inventory Audit on the right of the filters,
  with matching typography and 44-pixel targets. Excel replaces CSV without
  changing export scope or introducing an operational API.
- **Workbook:** genuine zipped OOXML `.xlsx`, ExcelJS 4.4.0 loaded only when
  Export is used, patched scoped UUID 11.1.1 dependency. Customer/Course names
  and IDs, Course-local export time/timezone, operator, explicit filters/archive
  scope and confirmed revision precede two side-by-side inventory tables.
  Literal string cells cannot become formulas; quantities and sales units are
  numeric whole units. The Course-wide daily product/unit tally and full
  On Cart total remain included. Print area, landscape Letter, quarter-inch
  margins and fit-to-one-page are explicit. Pending/unresolved writes disable
  Export; a changed confirmed/submission/filter context during generation
  rejects the download with an actionable error.
- **Checks:** frontend **69 passed**, browser **6 passed**, sandbox
  configuration/build, editor diagnostics and `git diff --check` passed.
  Browser regressions retain trusted mouse/touch/keyboard/selector movement,
  remaining-sale confirmation/cancel, stock conflicts, staff resumption,
  sales/audit/shift retries, numeric controls, read-only export and queue/category
  behavior. New checks cover real `.xlsx` download/readback, literal formula-like
  names, typed numbers, filters, print configuration, no focus/interval fetch,
  collapsed categories and manual-reload freshness. Changed filter context
  during generation correctly prevents a stale download without an API request.
  Backend source was unchanged; earlier backend/emulator evidence remains
  retained, not claimed as rerun for this presentation/export refinement.
- **Rendered and live evidence:** local rendered Inventory and deployed DOM
  geometry at **1440/1024/768/430/375 px** have no horizontal overflow or clipped
  actions; View Menu remains above Audit, with identical computed font and
  targets at least 44 pixels high. Live legacy Monarch menu began with all six
  populated categories collapsed, including Canned Cocktails; a browser-generated
  mouse click expanded it. Focus plus **16.5 seconds** produced no extra public
  fetch; manual reload fetched once and restored collapsed categories.
- **Actual workbook/print evidence:** a real Chromium pointer-triggered file
  download used the byte-verified deployed workbook module and representative
  inputs: 57 existing catalog names/categories plus one representative product,
  varied availability/quantities, and seven daily sales rows (28 units).
  LibreOffice **26.8.1.1** opened the downloaded workbook and rendered
  **one 792 x 612 pt landscape Letter page**. Text extraction retained all
  **58 product names** and the sales summary; visual PDF inspection found
  readable tables and no cropped names, quantities or headings. Worksheet body
  text is 10 pt before one-page scaling. This is spreadsheet-engine print
  evidence, not merely OOXML page flags or a physical printer/Excel acceptance.
  The actual authenticated sandbox Export additionally generated an inspected
  7,906-byte `.xlsx` payload: Customer CUST-0005 / Course COURSE-0007,
  America/Los_Angeles, operator Not selected, all five products, revision63,
  daily seven units and cart stock two. It also rendered one Letter page;
  tile/session text remained unchanged. The integrated VS Code browser did not
  expose a native download event, so its exact Blob payload was captured at
  the download boundary; filesystem download was verified separately in Chrome.
- **Sandbox publication:** project/site `fairway-refresh-sandbox-260930`,
  Hosting version **`8a1ddec5ac14bb5a`**, release **`1792843432480000`**,
  **`2026-10-24T12:03:52.480Z`**. Hosting only; all served JS/CSS and index bytes
  matched the sandbox build.
  - `index-BDo7btIQ.js` SHA-256:
    `5eb9127eb5412d12b8a3ca39953671ad4669401a4b3ae3d85fc974015627666e`
  - `InventoryApp-DdVpy77A.js`:
    `ce0c0c345bb60f977e7760e4dddf1eadd73fe12071add1fbdbcd232cf7a99cad`
  - `PublicMenuApp-BhC69WXt.js`:
    `f910dcd810bb351978066bfb58996e39cf5ae0efcf45664d68a61acf06df8330`
  - `inventoryExport-BoKso6Gb.js`:
    `6a8f2d1c83a29525bd81292e44472bfbc6590ab588c411913084e81f4b70dba5`
- **Unchanged services/data:** Admin `fairway-admin-sandbox-00022-9gn` and
  Receiver `fairway-button-receiver-sandbox-00025-9lr` remain at100% traffic,
  read back after Hosting publication. New and legacy public APIs returned
  200/no-store; recursive inspection found no quantity, staff, sales, shifts,
  audits or actor fields. The existing public version counter remains part
  of its accepted response, not a quantity. Synthetic review Course stayed at
  revision63 with one public On Cart product; no stock, staff, shift, audit,
  assignment, request or service mutation was needed for this follow-up.
- **Review:** [Inventory](https://fairway-refresh-sandbox-260930.web.app/inventory?customer_id=CUST-0005&course_id=COURSE-0007&inventory_review=67076f0)
  and [golfer menu](https://fairway-refresh-sandbox-260930.web.app/cartmenus/cpo-test-persistent-inventory).
  Physical iPad/Safari and native Microsoft Excel/physical-printer acceptance
  remain CPO checks. Existing Firebase dependency advisories remain unchanged;
  the added ExcelJS UUID advisory was eliminated by the scoped override.
  The lazy export chunk adds a nonblocking build size warning without adding
  that download to the initial Inventory/public-menu load.

### Automatic current On Cart menu and compact sales — PR #12 Sandbox (2026-10-24 UTC)

- **Authority/current requirement:** the CPO superseded the explicit
  Preview/Publish workflow with automatic current On Cart serving, compact
  Sales Today and prominent two-line Close out. This remains draft PR #12,
  sandbox-only; no merge or production deployment/data authority. The earlier
  publication entries below are dated history, not current instructions.
  UX owns behavior; the Engineering Guide owns the single-state architecture.
- **Published application source:** `698443fc10e042eb603cd5016a7ef546c7791ac8`,
  branch `feat/persistent-cart-inventory`, based on canonical main
  `08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`. Evidence-only commits do not
  change these deployed artifacts.
- **Implementation:** anonymous public reads use one read-only Firestore
  transaction over the existing slug/Course/inventory state/products, selecting
  active On Cart records through one public-product field allowlist. Nested
  price fields are explicitly projected too. There is no second menu balance,
  asynchronous projection, publication pointer dependency, or snapshot write.
  Historical snapshots/fields remain untouched, never served. Successful
  stock/metadata transactions immediately determine subsequent API reads.
  Failed/cancelled/not-yet-confirmed operations do not change those records;
  exact operation replay cannot resurrect an older public projection.
  Existing URLs/slugs remain valid. Generic configured Course slugs render
  returned Course name/timezone without borrowing Monarch branding.
  No-store responses/fetches, 15-second/focus refresh and abort/ignore of
  superseded requests prevent stale client refreshes replacing newer results.
  Retired preview/publish endpoints return explicit 410 without mutation or
  shift activity and tell cached clients to refresh.
- **UI:** Sales Today displays only the Course-local day's total units;
  individual sales/product tallies remain durable and available to export.
  Selected operator stays clear; prominent Close out / Enter final sales uses
  the existing close/attribution/recovery operation. Removed manual publication
  controls, preview dialog and publication-status instructions. View golfer menu
  opens the selected Course's configured public link in a new tab; unconfigured
  Courses get an explicit Admin-configuration explanation rather than a wrong
  Course link.
- **Validation:** full backend 154 passed; real Firestore emulator 20 passed,
  one unit-only fault-injection scenario skipped there (passed in-memory).
  Frontend 68 passed, browser six passed, final focused pointer/public-menu
  checks and sandbox config/build passed; editor diagnostics/diff checks clean.
  Coverage includes transaction-consistent public reads during concurrent sales,
  metadata edits, zero-stock removal, no snapshot dependency, exact replay,
  rollback, nested privacy allowlisting, public no-store/access boundary,
  generic/legacy URLs, stale client response suppression, compact totals,
  two-line close-out and 44-pixel responsive controls. Existing stock/retry/
  audit/shift/export/drag/queue/category regressions pass. A test that previously
  waited on removed publication/revision UI now waits for fetched state and
  asserts the actual reopened audit revision. Existing build chunk-size warning
  remains nonblocking.
- **Admin sandbox:** `fairway-admin-sandbox-00022-9gn`, Ready/Active and 100%
  traffic after explicitly switching from the prior pinned `00021-wbd`.
  Runtime identity, environment/origin settings and no-invoker-IAM-check setting
  preserved. Image
  `sha256:ce0dabd00872425a7b7adf0df430168bf318c5a5a748047ee3020bc9b3fda883`,
  build `8d26138b-b501-4187-9a6c-34b6c2b53bcc`, source archive
  `gs://run-sources-fairway-refresh-sandbox-260930-us-central1/services/fairway-admin-sandbox/1792837661.407273-73ac1bf8b7c6483aae9de87d9f2597a6.zip#1792837661714515`.
  Receiver remains `fairway-button-receiver-sandbox-00025-9lr` at 100%;
  it was not redeployed.
- **Hosting sandbox:** project/site `fairway-refresh-sandbox-260930`,
  version `ce56795b6f985177`, release `1792837661141000`,
  time `2026-10-24T10:27:41.141Z`. All served JS/CSS matched local build SHA-256.
  Main `index-BQyjHHfx.js`:
  `3fc9ecd44d222eb10407a4a085425b64ba41567e379846478f87fd2ec1d623dc`;
  Inventory `InventoryApp-Bw1sS1xd.js`:
  `e137ba420af65858ff8f45dbc63e1d5cb35395643fededa2b1b7c0e6ca669649`;
  Public menu `PublicMenuApp-BZTABOtZ.js`:
  `8b08285dfc83846b6caaf4b7ea0edd310dfd42ab7b18fe215184db51aec75db6`;
  Inventory CSS `InventoryApp-DaMtxS05.css`:
  `5c97bff6fb596290227f39056b81864840997040586826c5bb2040aa6962d643`;
  shared CSS `index-CCL6HDYj.css`:
  `86ec62871ea5df22898440dbe25851f3672d3a3eb4aac7ce0dd5e20524888a3d`.
- **Deployed end-to-end evidence:** in synthetic
  `CUST-0005` / `COURSE-0007`, configured the previously absent public slug
  `cpo-test-persistent-inventory` through the existing Admin API. Created the
  clearly named synthetic product `92R4cReFFo6b9Cci84zm`
  (CPO TEST Automatic Menu, later CPO TEST Automatic Menu Updated).
  Its initial On Cart record appeared on the actual public page without
  publishing. Return to In Inventory removed it automatically; pending loading
  and Cancel left the menu empty. Confirmed loading of three restored it.
  Autosaved name/description/price 2.50->3.75 appeared on the open public page.
  A further return preserved quantity three and excluded it publicly;
  confirmed reload preserved three. Excessive sale of four rejected 409 with
  stock three and public item unchanged. Remaining-three sale confirmation
  Cancel left the exact public response, stock and daily tally unchanged.
  Reconfirmed remaining-three sale created one attributed record, moved to
  Sold Out/zero and removed the item from the actual open public page.
  Public-page checks observed automatic polling, not just forced API refresh.
- **Durable review state:** sale `3LnvJ6AUZpTkW5UUx58g`, operation
  `cc31f917-bcc0-4981-afe1-131db01c2328`, before three/after zero, units three,
  revision 62, timestamp `2026-10-24T10:32:19.712Z`. Staff/shift/authenticated
  account attribution verified. Course-local tally rose four->seven; both
  individual product tallies remain in the authenticated API. Afterwards
  confirmed loading of two leaves the new synthetic product On Cart for review,
  revision 63. The four existing products/quantities/states remain unchanged.
  Selected CPO TEST F&B Manager and active shift preserved; opened/cancelled
  the existing final-sales dialog without closing it. No audit was submitted.
  ADC SDK readback was blocked by expired reauthentication; active gcloud
  credentials successfully verified the exact durable event through the
  Firestore read API instead. No credential or Auth configuration changed.
- **Public boundary/rendered evidence:** anonymous synthetic slug and existing
  `monarch-bay` API links both return 200/no-store; the latter retains 57 active
  products. Exact public envelope fields are course_id, course_name, timezone,
  inventory_revision, updated_at and products; exact product fields are
  product_id, name, category, subcategory, brand, description, price and state.
  Recursive live response inspection found no quantities, staff, sales, shift,
  audit, actor or idempotency fields. Anonymous Inventory remains 401.
  Actual public content contains product details/price/Available, not quantities.
  Rendered Inventory measurements at 1440/1024/768/430/375 pixels confirm the
  total-only box, stacked close-out wording, selected-Course menu link, no
  publication controls, clean wrapping, no horizontal overflow and >=44x44
  catalog/audit/session controls. Physical iPad/Safari is not claimed.
- **Review links:** Inventory
  `https://fairway-refresh-sandbox-260930.web.app/inventory?customer_id=CUST-0005&course_id=COURSE-0007&inventory_review=698443f`;
  golfer menu
  `https://fairway-refresh-sandbox-260930.web.app/cartmenus/cpo-test-persistent-inventory`.
  Refresh old Inventory tabs. No production deployment/data, merge, requests,
  service/device state, firmware or physical-device operations occurred.

### Inventory organization refinement — PR #12 Sandbox (2026-10-24 UTC)

- **Acceptance/boundary:** the CPO accepts current inventory functionality and
  requested presentation refinement in the existing draft PR #12. This is not
  merge or production authorization. README/backlog now distinguish accepted
  functionality from pending presentation review. Product layout requirements
  are owned by the UX specification.
- **Published source:** `3dcbf33ecaf397ad509204ca695ec31f96b40c41`,
  branch `feat/persistent-cart-inventory`. Main grouping change
  `178248595e807169bc075f0b2d63418ee4af2baa`; final source additionally bounds
  the tablet account label so a multi-Course banner does not orphan Sign out.
  The earlier intermediate Hosting version `e91674fbc7193a90` is superseded by
  the final publication below.
- **UI:** logo displayed dimensions increased exactly 50% at each breakpoint
  (desktop/iPad 104x64->156x96; phones 72x48->108x72; smallest phone width
  60->90 with 72-pixel height). Admin uses the familiar accessible shield.
  Export is in the banner without explanatory wording; confirmed CSV data,
  download and unresolved-submission gates are unchanged. Sales Today sits
  beside the dashboard title at iPad/desktop widths, with selected operator,
  Close shift and submission-recovery controls inside the same panel.
  Add Category/Add Product/Preview Draft/Publish Menu form one action row
  immediately above filters. Audit sits on the filter row, visually separated.
  Routine move/archive/export/audit/publication success boxes are removed;
  persisted tiles/quantities/tally/shift/publication revision convey success.
  Failures/conflicts/unknown outcomes remain visible with alert semantics.
- **Verification:** final frontend 68 unit checks and five browser checks pass,
  sandbox config/build, diff checks and editor diagnostics pass. Browser
  regression now measures actual layout at 1440/1024/768/430/375 CSS pixels,
  including multi-Course/account context, accessible working shield, exact logo
  dimensions, banner Export, adjacent title/sales panel, operator/Close shift
  inside panel, catalog row ordering, separated audit, clean phone wrapping,
  no clipped controls/document overflow and >=44x44 regrouped touch targets.
  Existing real mouse/touch dragging, remaining-sale confirmation/stale refresh/
  retry, return/load, staff, audit/shift-close failure recovery, CSV download/
  contents, unresolved-export protection and queue/tab/category regressions pass.
  An initial isolated browser run hit a profile-cleanup ENOTEMPTY race; bounded
  removal retries on the exact temporary profile fix cleanup, and final runs
  pass. Backend code unchanged: prior 154 backend / 20 emulator scenarios are
  retained evidence, not represented as a new backend run.
- **Final sandbox publication:** Hosting only, project/site
  `fairway-refresh-sandbox-260930`, version `c22a708a990a6ab2`,
  release `1792836258363000`, time `2026-10-24T10:04:18.363Z`.
  Admin `fairway-admin-sandbox-00021-wbd` and Receiver
  `fairway-button-receiver-sandbox-00025-9lr` remain unchanged at 100% traffic;
  neither was redeployed.
- **Served identities:** all built JS/CSS assets were fetched and SHA-256
  matched. Main `index-CSOyOyeK.js`:
  `b8dff5bc246cc792f7ba81b8cbf0f151b2a2b3975440d2716ca621ce51ed62f1`;
  inventory `InventoryApp-ClrTJOO0.js`:
  `eb1e399115947b9ab4d9db5307f788a2128f83b9bf5c267250551855c20f7006`;
  inventory CSS `InventoryApp-BFYufh36.css`:
  `699f63a4900094936af7d26518e8759aa2f5d2f7e52a57b4732f4ec5ad494a0c`;
  shared CSS `index-Dy1gy2s_.css`:
  `38d532de4f2dff50f80d3ecc9d4d8c00b772fb62972fa5b6e3d7365e1db32906`.
- **Deployed rendered review:** authenticated sandbox at 1440x1000 desktop,
  1024x768 iPad landscape, 768x1024 portrait, 430x932 and 375x812 phone.
  Measured all new groupings, exact logo sizes, >=44x44 controls, no clipping
  or horizontal document scroll. Catalog actions remain one row at 768 and
  above and wrap into two on phones; title/Sales Today remain horizontal on
  iPad/desktop and stack on phones. Actual screenshots inspected at desktop,
  iPad portrait and small phone. Relocated Close shift and Audit dialogs opened
  and cancelled normally, preserving selected manager; neither was submitted.
  Revision 55 was observed from existing review data; this presentation
  follow-up performed no stock/sale/staff/shift/audit/publication mutation.
- **Review:** `https://fairway-refresh-sandbox-260930.web.app/inventory?customer_id=CUST-0005&course_id=COURSE-0007&inventory_review=3dcbf33`.
  Refresh old tabs. Chromium rendered evidence does not substitute for physical
  iPad/Safari review. No merge, production deployment/data, requests, service/
  device changes, firmware or physical-device operations occurred.

### Remaining-sale confirmation and full-height drop targets — PR #12 Sandbox (2026-10-24 UTC)

- **Authority/source:** CPO feedback supersedes positive On Cart-to-Sold Out
  availability-only behavior. Application source
  `8b57602475dc21cff20f5d9b1380fb9ffbd40071`, existing isolated branch
  `feat/persistent-cart-inventory`, draft PR #12. No merge or production work.
  UX/Engineering owners record the new contract.
- **Behavior:** drag, keyboard Move here and selector share one intent owner.
  Positive remaining stock opens "Confirm that you sold the remaining X units
  of [product name]." Confirm reuses the existing attributed sale transaction,
  sale event, Course-local tally and idempotency replay. Expected stock revision
  binds the displayed amount; intervening changes reject without another sale.
  Explicit Refresh confirmation updates the displayed amount but does not
  submit; another Confirm is required. Cancel makes no operation. Zero On Cart
  stock uses availability only, not a zero-unit sale. Restaurant returns retain
  quantity; loading still confirms a positive Quantity. Cached availability-only
  clients cannot bypass a remaining sale; the server rejects that positive-stock
  transition explicitly.
- **First-attempt drag investigation:** actual previous served layout had
  `align-items:start`; at 768x1024, a lower Return Cycle tile started at y728
  while Sold Out ended at y720. Its straight-across point at y753 hit no column.
  Real mouse down/move/up reproduced no highlight/no move, without mutations.
  Stretching adjacent columns to full grid-row height closes that target gap.
  Accepted noninteractive mouse regions also prevent competing native
  text/HTML dragging; interactive children and normal touch scrolling remain.
  This is a confirmed failure mechanism, not a claim to have observed the
  CPO's exact physical gesture.
- **Verification:** full backend suite 154 passed. Isolated real Firestore
  emulator 20 passed, one in-memory-only rollback fault injection skipped;
  that rollback passes in the unit suite. Existing installed Java 21 was
  explicitly added to PATH after default Java discovery failed; no dependency
  installation. Frontend 68 unit checks and five rendered/browser regressions
  passed; sandbox configuration/build, editor diagnostics and diff checks pass.
  New backend checks cover attributed exact remaining sale, concurrent
  same-operation replay, stale sale/adjustment revisions (including restored
  original quantity), positive availability bypass rejection and zero-stock
  non-sale transition. Normal concurrent quick sales retain delta behavior.
- **Rendered input coverage:** browser-generated mouse at 1024x900 and trusted
  touch at 768x900/375x900, repeated first-drop confirmations, lower-card
  horizontal drops, selected noninteractive text, keyboard activation,
  selector parity, Cancel, stale confirmation/explicit refresh, response-loss
  retry with exactly one sale, tally update and zero-stock availability.
  Existing return/load, touch scrolling/edge scrolling, staff resumption,
  cancellation, stock/retry/audit/shift, CSV and queue/tab/category checks pass.
  One old virtual-time browser harness run ended RUNNING rather than PASS;
  the complete rerun passed. No synthetic handler execution is used as drag
  acceptance evidence.
- **Publication:** sandbox Admin `fairway-admin-sandbox-00021-wbd`, Ready/100%
  after explicit traffic activation (source deployment initially retained
  pinned 00020 traffic). Image digest
  `sha256:eda27f71dfa12bfec027d77eae5de5970ca451fb108d18e5f063717bfcdae397`,
  build `caa05db9-49ca-4e67-90b1-542ffa87f8e6`, source archive
  `gs://run-sources-fairway-refresh-sandbox-260930-us-central1/services/fairway-admin-sandbox/1792809750.687911-3d2968d66bf8400c9037d825495559d1.zip#1792809751075769`.
  Hosting project/site `fairway-refresh-sandbox-260930`, version
  `166bc5e1aad1e2c7`, release `1792809869472000`,
  time `2026-10-24T02:44:29.472Z`. Receiver unchanged at
  `fairway-button-receiver-sandbox-00025-9lr`/100%; no Receiver deployment.
- **Served artifact verification:** every built JS/CSS file fetched and matched
  SHA-256. Main `index-BqTwjrSr.js`:
  `0262361b0a2a755f07c4c6cf091128b0879c7e1d3e5bc7c181d40208425a52cf`;
  inventory `InventoryApp-DD6cXk9p.js`:
  `9916d463df1ed5cda23c13e3bdc217301731a3b46115f1a04e0b23888c55c5b0`;
  inventory CSS `InventoryApp-BLowayP0.css`:
  `c97400c7395e5cd448b0244f47e31fdd159711922aee3af0de32ce4d89ce87d6`.
- **Live sandbox evidence:** dedicated synthetic Return Cycle only. Three
  consecutive real Playwright mouse horizontal drops at 768x1024 each
  highlighted Sold Out and opened the exact 3-unit confirmation on the first
  attempt; Cancel left On Cart/3 and the 2026-10-23 tally 25 unchanged.
  Trusted Chromium CDP touch input in the visible independent session opened
  the same confirmation on its first drop, with `isTrusted:true` pointerdown/up.
  A separate session's attributed adjustment to 4 invalidated the open 3-unit
  confirmation: HTTP409 `stock_revision_conflict`, Confirm disabled, explicit
  refresh displayed 4 without submitting. Reconfirmation returned HTTP200,
  zero stock/Sold Out, and survived reload.
- **Durable result:** sale event `HGeY1Eg6nlLBC3y9J1C8`, operation
  `14d6aef2-b88a-4b6f-b1b1-e2c0814b5815`, four units, stock 4->0,
  On Cart->Sold Out, stock revision 14/inventory revision 54, selected synthetic
  manager, shift and authenticated UID. Live testing crossed Course-local
  midnight; this sale belongs to 2026-10-24 and the displayed new-day tally is
  four, not a claim that the previous day's 25 was erased. Final Return Cycle
  remains Sold Out/0; no artificial restock/reset after the sale. Other CPO
  product changes observed during review were preserved. Public menu remains
  version zero/no slug. No audit confirmation, shift close, request/service/
  device operation or production change was performed.
- **Review:** `https://fairway-refresh-sandbox-260930.web.app/inventory?customer_id=CUST-0005&course_id=COURSE-0007&inventory_review=8b57602`.
  Refresh cached tabs. Chromium-generated pointer/touch evidence is not
  physical iPad/Safari acceptance, which remains with the CPO.

### Inventory Pointer Drag Correction — PR #12 Sandbox (2026-10-24 UTC)

- **Defect/evidence correction:** the CPO confirmed native inventory dragging
  still failed. Prior synthetic DragEvents below proved handler/backend routing
  only, not a working drag gesture. That evidence was insufficient for drag
  acceptance. The whole-card HTML draggable implementation lacked a shared
  touch interaction and competed with interactive children/browser gestures;
  previous mouse automation also failed to reach its intended target.
- **Implementation:** one Pointer Events owner handles mouse/touch/pen, a
  visible product-name/grip, eight-pixel initiation threshold, pointer capture,
  coordinate-based nested column hit testing, feedback and viewport-edge
  scrolling. Touch scrolling remains normal outside the grip. Interactive child
  buttons/selectors do not start dragging. Escape, lost capture, browser
  cancellation, scope change and outside drops clear the interaction without
  stock writes. Select-name/Move here is an accessible alternative, not a
  requirement to use the availability dropdown. All moves call the existing
  attributed availability owner; staff resumption and confirmed loading remain.
- **Published application source:** `8624ce76f19c05cf45cb7edbf4fab5739e366ab6`,
  branch `feat/persistent-cart-inventory`, draft PR #12. Hosting-only publication:
  project/site `fairway-refresh-sandbox-260930`, version `d3fc2920cf9ab00a`,
  release `1792808391856000`, time `2026-10-24T02:19:51.856Z`.
  Admin remains `fairway-admin-sandbox-00020-rkt` at 100%; Receiver remains
  `fairway-button-receiver-sandbox-00025-9lr` at 100%. Neither was redeployed.
- **Automated verification:** 68 frontend unit checks and five browser checks
  pass; sandbox configuration/build and editor diagnostics pass. The added
  real-input browser check uses Chromium CDP mouse/touch input, verifying
  browser-trusted Pointer Events at 1024x900 mouse, 768x900 touch and 375x900
  touch. It covers deliberate drops onto nested column headers, no write before
  drop, first-action staff prompt/resumption, quantity-preserving return,
  persisted reload, positive Quantity loading/Confirm, interactive child
  controls, outside drop/Escape/pointer cancellation, normal non-grip touch
  scrolling and phone edge scrolling in both directions. No synthetic
  DragEvents/PointerEvents provide its drag evidence. Existing operation,
  response-loss retry, audit/shift, CSV-download and queue/tab/category
  regressions pass. Backend code is unchanged; previously passing 151 backend
  checks and 17 real-emulator scenarios remain the retained backend evidence,
  not a claim of a new backend run.
- **Deployed verification:** actual Playwright mouse down/move/up moved only
  synthetic `CPO TEST Return Cycle` from On Cart to In Inventory (HTTP 200,
  quantity 3->3, no quantity payload/dialog). Reload retained that state; opening
  but not confirming the audit excluded it. Chromium CDP touch start/move/end
  at 768x1024 then opened Load onto cart; state stayed In Inventory until
  explicit Confirm and survived another reload. A fresh independent operator
  session used trusted touch input to return the same product, prompted for
  staff with no Quantity dialog, then resumed exactly that move after selecting
  the existing synthetic manager. Touch loading again required Confirm.
- **Durable evidence:** availability event `mp3PClmpk2iI8oZUMa3Y` (mouse return),
  `KKq3Iep0QzIzOaPgLzpT` (confirmed reload), `KfaRxmtbrnpD97CxcLF3` (fresh-session
  touch return), and `35e9yodISFAlcsFqY6nz` (confirmed reload) each preserve
  quantity 3->3, staff ID/name, shift ID and authenticated submitting UID.
  Final observed revision 44; Return Cycle finishes On Cart at 3. Existing CPO
  changes to other products were preserved; the displayed daily sales tally
  remains 25, publication version zero/no slug. No sale, audit confirmation,
  shift close or public-menu publication was performed by this drag follow-up.
- **Served artifacts:** every built JS/CSS asset was fetched and SHA-256 matched.
  Main `index-CKGZuGqy.js`:
  `bc1f3b68b1de1f0b4bf2ff91d77c1f8ae22a3f5fe19295630fecbd33e4fedd07`;
  inventory `InventoryApp-Gffc13--.js`:
  `c07a6fefdead34c677a730fbc842c451a581faea6246db35b10c7cdb95578622`;
  inventory CSS `InventoryApp-C4GCjd6Z.css`:
  `8a50d349422e5dc1243168dbd1f172d8856b32d91088a20d73a6fd0d66784420`.
- **Review:** `https://fairway-refresh-sandbox-260930.web.app/inventory?customer_id=CUST-0005&course_id=COURSE-0007&inventory_review=8624ce7`.
  Refresh old tabs to receive the new product-name/grip controls.
  Browser-generated trusted touch input is not a physical iPad/Safari test;
  physical iPad acceptance remains with the CPO. No merge, production
  deployment/data, request generation, service/device changes or physical
  operations occurred.

### Persistent Cart Inventory / Staff / Audits / Shift Close Sandbox Increment (2026-10-24 UTC)

- **CPO feedback follow-up:** PR #12 retains all prior work and adds confirmed
  current-view CSV export and shared 48 by 48 CSS-pixel quantity controls.
  On Cart-to-In Inventory uses the same attributed availability operation from
  drag-and-drop and selector, with no quantity payload/prompt. A prepublication
  live positive-quantity selector return succeeded (HTTP 200, unchanged
  quantity); a blanket route failure was not reproduced. Confirmed defects:
  zero adjustment incorrectly forced restaurant-held products to Sold Out,
  and conflicted moves did not refresh the stale view. Both are corrected.
  Backend full suite: 151 passed; real-emulator inventory scenarios: 17 passed,
  one unit-only rollback scenario skipped. Frontend: 68 unit checks and three
  rendered regressions passed; sandbox configuration/build passed.
  New rendered evidence covers drag return with first-action Custom selection,
  no off-cart Quantity prompt, excluded audit stock, reload/loading, zero
  restaurant quantity, step minima/no-submit/target sizes, filtered read-only
  export, export disabled during unresolved operations and stale-move recovery.
  A fourth browser check saved an actual Chromium CSV file and verified its
  filename/content (not just generated text). Final frontend totals: 68 unit
  checks and four browser checks passed.
- **Prior feedback publication (superseded by pointer correction above):** application source
  `1cca8d7ea5766d040c05e6be8246623166e6a75c`, same draft PR #12.
  Admin `fairway-admin-sandbox-00020-rkt`, Ready/100% after explicit traffic
  activation; image
  `sha256:3b6bc9773c047b91a1aed2afbe25d7de8feb31c8cf4271b9efb5a5abf2b403a6`,
  build `b6efa178-b15e-4c5b-805a-4fa2ea20a36a`, source
  `gs://run-sources-fairway-refresh-sandbox-260930-us-central1/services/fairway-admin-sandbox/1792806516.741978-ac79bb74a1df4c89adfc0e81ce5a7919.zip#1792806517110223`.
  Hosting version `ba1ef0c48bc2f21a`, release `1792806518503000`,
  released `2026-10-24T01:48:38.503Z`. Receiver unchanged at
  `fairway-button-receiver-sandbox-00025-9lr`/100%. Later changes to tests and
  publication evidence do not alter these served application artifacts.
- **Feedback live verification:** isolated fresh browser session in the same
  synthetic Course, with new product `G9NzFbmSsUZtLJ4uZvab`
  (`CPO TEST Return Cycle`, category `CPO TEST Returns`). Rendered HTML
  dragstart/drop events reached the actual backend, prompted for staff, resumed
  the move without Quantity confirmation and preserved five units. Reload,
  subsequent audit exclusion and zero restaurant adjustment/reload passed.
  Loading with plus controls required Confirm; selector returns also preserved
  quantities and resumed after staff selection. Durable return events
  `bTPTRb5AIFYITzrV5nlD` (5->5), `xgJ4m9GTqKKujd2Gd6aO` (3->3), and
  `WDStFzqFl9A4jnGYbwg1` (4->4) contain staff, shift and authenticated UID.
  Each path excludes returned stock from totals/audits until explicitly loaded.
  At 768 CSS pixels, sale/loading/adjustment step buttons measured 48 by 48;
  minima, direct entry and draft-only stepping passed.
- **Feedback export/retry evidence:** fresh-session export succeeded with
  operator Not selected and without inventory writes. Filtered live CSV names
  Customer/Course, `CPO TEST Returns`, Course-local time in
  `America/Los_Angeles`, operator, revision, sole displayed product and the
  explicitly Course-wide tally. Unsubmitted quantity 99 was excluded in favor
  of confirmed three. A synthetic committed sale response loss disabled Export;
  unchanged retry produced exactly one successful one-unit sale record. The
  Course had 24 units sold before this follow-up sale and 25 afterward; existing
  CPO sandbox activity was preserved. Revision 36, publication version zero/no
  slug, no menu publication or audit confirmation by this follow-up.
- **Prior served hashes:** main `index-v1GxKmK1.js` SHA-256
  `f8d48d38392075f768059e93a31ff60574da5b18ac074b3d78470a3e6e4a65a8`;
  inventory `InventoryApp-D-ogljpK.js`
  `b083772025d50f93660989a42a3407f260c744b0486573939bbdfab199818408`;
  shared CSS `index-3jx2LLq3.css`
  `84b2e92aeaf71fa67366d9458db4bddc7278dc1609993c84a96b8b85a4df8556`.
  All three served hashes match local build bytes.
- **Prior review URL:** `https://fairway-refresh-sandbox-260930.web.app/inventory?customer_id=CUST-0005&course_id=COURSE-0007&inventory_review=1cca8d7`.
  Physical iPad/Safari drag gestures and its native download UI remain CPO
  device checks: integrated-browser pointer drag automation did not land on the
  intended column, so live drag-route evidence uses rendered DragEvents. The
  integrated browser also did not emit a download event; generated deployed
  Blob contents were inspected and a separate real Chromium file-download
  regression passed. These limits are not claims of physical-device validation.
- **Authority/source:** CPO-approved readiness and implementation on isolated
  `feat/persistent-cart-inventory`, based on verified canonical main
  `08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`. No merge or production
  deployment/data/device operations are authorized. Product requirements are in
  the UX owner; engineering ownership is in the Engineering Guide.
- **Resolved transitions:** quantities are nonnegative whole units; an excessive
  sale rejects atomically and asks for a corrected quantity first. Moving to
  In Inventory preserves quantity without an adjustment. Loading into On Cart
  requires confirmed Quantity. Stock totals select On Cart; audits additionally
  include Sold Out. One active shift per operator session/Course permits a name
  correction before activity and requires successful close before a different
  operator after activity. No multiple carts, restaurant balance, automatic
  zeroing, negative stock, overselling or offline queue.
- **Compatibility/publication:** absent quantity reads as zero without a bulk
  migration or changed initial product state. Metadata autosaves do not own
  stock/state. Existing published public-menu snapshots remain unchanged until
  explicit publication; internal quantities, staff and operation records are
  omitted by the public field allowlist. Request queue, service categories,
  device protocol and request KPIs are not changed.
- **Initial application source (superseded above):** `9c240333983a9e9971334e9df2b58672f75b7b6b`,
  draft PR #12, targeting main. Subsequent evidence-only documentation commits
  do not change the published application. Prior sandbox evidence below remains
  dated history, not an alternative identity for this increment.
- **Initial sandbox publication (superseded above):** project/site `fairway-refresh-sandbox-260930`;
  Admin `fairway-admin-sandbox-00019-r29`, Ready/Active at 100% traffic.
  Source deployment retained the previous pinned revision initially; traffic
  was explicitly moved to the verified new revision. Image digest
  `sha256:58f004cddb47ca18aa83b8cdcf24776cd65307e8c1babb7340b1386319a0cd55`,
  build `ed8f6179-4409-47b6-9e00-37badc1b12b2`, source archive
  `gs://run-sources-fairway-refresh-sandbox-260930-us-central1/services/fairway-admin-sandbox/1792804858.954006-1deb6733a4aa4c68a0dda5d732f36aaf.zip#1792804859249405`.
  Hosting version `d5a3a7ac740a9958`, release `1792804928794000`
  (`2026-10-24T01:22:08.794Z`).
  Receiver remained `fairway-button-receiver-sandbox-00025-9lr` at 100%;
  no Receiver publication was necessary.
- **Frontend evidence:** 65/65 unit checks, 3/3 rendered browser regressions,
  sandbox configuration validation and build pass. New rendered checks cover
  first-action Custom attribution/resumption, sale response-loss replay without
  a second deduction, excessive-sale rejection, quantity-preserving In Inventory
  moves, confirmed loading, revision-conflicted audit reconfirmation, and
  uncertain shift close with name/amount retained across a full remount.
  Existing select-any queue, History visibility/selection and category-owner
  rename checks remain passing. These mock-network checks are UI evidence, not
  a substitute for authoritative stock/concurrency verification.
- **Authoritative backend evidence:** full suite 150 passed. Sixteen actual
  handler scenarios passed against isolated loopback Firestore emulator
  transactions; the rollback fault-injection scenario is unit-only and skipped
  in emulator mode. Coverage includes simultaneous sales, concurrent replay,
  stock-revision conflicts, stale cached metadata, session/Course isolation,
  exact replay after close, immutable audits, local-midnight sales, more than
  1,000 sale records, public-field exclusion and explicit publication.
  Inventory GET reads state/products in one transaction; audit submission
  verifies that revision before capturing the immutable baseline.
- **Synthetic review context:** sandbox-only Customer `CUST-0005`, Course
  `COURSE-0007` (`CPO TEST Persistent Cart Inventory`, `America/Los_Angeles`).
  Before publication, the previous Admin API created labeled Water/Tea/Juice
  products respectively On Cart/Sold Out/In Inventory, without quantity fields,
  at inventory revision 4 and publication version 0. This provides a real legacy
  initialization baseline; no devices, requests, service state or production
  records were changed.
- **Live sandbox verification:** legacy quantities read zero with all three
  original states, descriptions and prices preserved. Actual UI Custom
  selection resumed a pending adjustment. Sale default one and excessive-sale
  rejection worked. Concurrent two-unit sales plus duplicate replay deducted
  four units once; stale absolute edits and audit confirmations returned 409.
  A cached full metadata payload could not overwrite stock/state. Confirmed
  loading, quantity-preserving In Inventory moves, zero-to-Sold-Out and
  Sold-Out replenishment all passed. Admin created a separate F&B Management
  staff entry; free pre-activity name correction, Course switching and shared
  Cart/Inventory banner context passed.
- **Durable evidence:** four sale records total eight units (Water five, Tea
  three), with staff/shift/authenticated-account attribution. Audit
  `fB8D7xeKRVSAneI1OJy1` confirmed revision 13, Water seven and Sold Out Tea
  zero, excluding In Inventory Juice. A later Water adjustment to eight did
  not change that audit baseline. Two session-specific closes persisted once
  each: `9Quqj8r5gsYBxbk1PF0s` ($12.34) and
  `wByuZtbsnZBYTZcEZcpO` ($24.50). The latter was committed with an intercepted,
  interrupted response; reload retained name/$24.50 despite the server having
  no active shift, and exact retry cleared only that session. Closing the
  second session left the first active; replay after close did not deduct again.
  Final review stock: Water eight On Cart, Tea zero Sold Out, Juice five In
  Inventory; inventory revision 15, eight units sold, publication version zero.
- **Responsive/served evidence:** deployed Cart and Inventory checked at 375,
  430, 768, 1024 and 1440 CSS pixels without document overflow or clipped new
  stock/session actions. Served JS SHA-256 matched the committed build:
  `index-CzMm4Q55.js` =
  `7947f456a77821abccf133e45ad153f15a74508f0ec4e32ec589caf898c35f95`;
  `InventoryApp-CjE5UqhL.js` =
  `0a790a88bd81f9f496f250430f277846e3e13186e739ce90406c2d567a9814fb`.
  An already-open Admin page initially reused old cached HTML; a fresh
  cache-busting navigation loaded the verified publication and staff controls.
- **Review URL:** `https://fairway-refresh-sandbox-260930.web.app/inventory?customer_id=CUST-0005&course_id=COURSE-0007&inventory_review=9c240333`.
  Sign in with an account authorized for this synthetic Course (or global
  Admin); new staff names do not create login/access accounts.
- **Limits:** CPO acceptance remains pending. Browser evidence is desktop
  Chromium with responsive viewports, not physical Safari/phone testing.
  No cross-day waiting test was performed; Course-local midnight is covered
  deterministically. No production deployment/data changes, merge, firmware,
  physical-device actions, service toggles or generated requests occurred.

### Queue Selection / Amenity Areas Production Release (2026-10-23)

- **CPO closeout:** production FRB-0006 test passed; the CPO accepts the released
  queue selection and independent Amenity Areas controls. Release acceptance
  and its FRB-0006 validation handoff are complete. Documentation-only closeout;
  no further tests, deployment, or production-data/device operations.
- **Accepted source:** PRs #7, #8, #9 merged in dependency order; deployed main
  `b3e1a53c47f5ffc52389666517876c5b1634e07d` retains the reviewed queue/tab
  regressions, independent category contracts, shared naming owner, combined
  completion KPIs and On-course-only Active Cart Hours.
- **Runtime:** Receiver `fairway-button-receiver-00028-827`, Admin
  `fairway-admin-00019-5hm`, both Ready/100%. Hosting version
  `79e31c865a6025cc`, release `1792797232817000`. Exact digests, build/source
  archives, served hashes, preservation findings, recovery commands and limits
  are in the production release record above.
- **Boundary:** final Amenity Areas display wording only; stable category IDs,
  marker locations, assignments, independent state and existing history
  preserved. No production data/device actions authorized or performed.

### PR #9 Shared Category Owner and Driving Range Presentation (2026-10-23)

- **Published source:** `0d8d8e1d805f78103928077b305efbf0ad55f66d`,
  `feat/independent-service-groups`, draft PR #9 dependent on reviewed PR #8.
  This replaces the intermediate scattered-label implementations
  `e99f39ae99fcdc0796327ed40c4a840571d31fc8` /
  `987da48bd063f8e4979c17c9cf5c071861776ab8`, retaining their adjacent
  category cards, short Suspend/Resume buttons, and navigation-spacing fix.
- **Single owner:** `fairway_backend/cloudrun_receiver/lib/service_categories.json`
  defines stable IDs and editable display names once. Backend validation
  derives category identity constants from it; frontend
  `src/lib/serviceCategories.mjs` exposes the same definition to Admin options,
  Cart headings, confirmation text, accessible names, and category iteration.
  The additional category displays Driving Range but keeps `on_premise`.
  No independent frontend/backend label maps, state/data migration,
  management UI, categories, or framework were added. Marker location labels,
  assignments, request snapshots, historical records, service state, and
  accepted Course-wide reporting calculations remain unchanged.

| Sandbox surface | Published identity |
| --- | --- |
| Receiver, Ready / 100% traffic | `fairway-button-receiver-sandbox-00025-9lr`, image SHA-256 `b0b514f573a849db347beeaf6929baade1fc504e6793dd9189e8a3355ed2174b` |
| Admin, Ready / 100% traffic | `fairway-admin-sandbox-00018-c4f`, image SHA-256 `803752eabf94856efcbe8387d9489622b269b1f5ebf521fbe4d1e04c32105144` |
| Hosting live | Version `cfb9fe3042d64a62`, release `1792795920303000`, released `2026-10-23T22:52:00.303Z` |
| Served JS, matching local build | `assets/index-DtTuJlkC.js`, SHA-256 `57d248226cb46ca5cdab026b13139490995e2d752cba5b6ed5ec9132020ddd8b` |
| Served CSS, matching local build | `assets/index-Ct0ENonq.css`, SHA-256 `c0774bd2d456dc1c8887d72e557272126d44a242345a5f51c33c9d0fc1f4c569` |

Receiver source archive:
`gs://run-sources-fairway-refresh-sandbox-260930-us-central1/services/fairway-button-receiver-sandbox/1792795804.72363-06b82668549c4d8ea762eceab9fbbe9f.zip#1792795805020462`,
build `08ddb118-acb3-4425-96a5-386bfc56f828`. Admin source archive:
`gs://run-sources-fairway-refresh-sandbox-260930-us-central1/services/fairway-admin-sandbox/1792795804.650325-e37a035e5f6f4e79aa71e47bd29984d0.zip#1792795804950351`,
build `bbc7cde7-80f0-420e-8828-67a24879d1fb`. Both services retain the existing
sandbox service account. As before, Admin's pinned traffic required explicit
activation of its newly created Ready revision; both final traffic identities
were verified.

- **Rename proof:** the rendered browser check runs twice, with the owner's
  actual Driving Range name and a test-only `Practice Area Review` name
  substituted at the same JSON module boundary. It changes no tracked owner,
  sandbox data, or production configuration. Actual Admin DeviceDetail options,
  Cart category headings, Resume/Suspend confirmation prompts and accessible
  labels all follow the owner, while option values remain `on_premise`,
  marker location stays independent, and buttons remain short. A backend
  owner-only rename test verifies unchanged IDs, validation, default states,
  all four service-state combinations, and no mutation of Course state.
- **Checks:** full backend suite passed, including rename invariance 1/1,
  independent service contracts 4/4, and accepted combined reporting 10/10.
  Frontend suite passed 65/65; rendered browser variants passed 2/2, retaining
  select-any-request, non-oldest completion callback, History visibility,
  preserved selection, dual/single controls, and empty-queue behavior.
  Sandbox config/build passed; the existing large-bundle advisory remains.
- **Deployed UI:** refreshed Admin shows Driving Range selected for the
  existing synthetic `on_premise` assignment with unchanged custom location.
  Cart shows adjacent On-course and Driving Range control cards, short
  Suspend buttons, and category-specific accessible names. Measurements at
  375, 430, 768, 1024, 1181, 1280, and 1440 CSS pixels verified heading/action
  alignment without horizontal overflow or overlap with navigation.
  Selecting the non-oldest synthetic request, opening History, and returning
  preserved selection; the hidden Requests layout had no rendered controls.
  Both original open review requests remain available at
  https://fairway-refresh-sandbox-260930.web.app/?customer_id=CUST-0004&course_id=COURSE-0006.
- **Recovery / scope:** prior Receiver `fairway-button-receiver-sandbox-00024-nps`,
  Admin `fairway-admin-sandbox-00017-kll`, and Hosting version
  `8154766958147e16` are retained identities. The prior backend supports the
  same stable category IDs/state semantics; prior Hosting has equivalent
  Driving Range labels but lacks the single-owner implementation. Ordinary
  explicit sandbox traffic selection / Hosting release-history recovery
  applies; no rollback occurred. No service-state actions, request outcome or
  historical-data changes, physical-device commands, firmware changes,
  merge, production deployment, or Monarch changes were made in this naming
  follow-up. Physical phone/Safari and push delivery remain outside its
  verification.

### PR #9 Reporting Decision and Test Correction (2026-10-23)

- **CPO decision:** both groups' completed requests count equally in the
  existing Course-wide KPI totals. Shared queue and History include both
  groups. Active Cart Hours remains On-course-only; the CPO accepts combined
  completion counts against that denominator. No filters, separate KPIs,
  reporting UI, or calculation changes. Current requirements are recorded in
  the UX owner and summarized in the Engineering Guide.
- **Test-only correction:** the cross-midnight fixture allocates one hour
  after local midnight to the new day, while Week/Month remain four hours.
  Zero-activity expectations now include the existing `active_cart_minutes`,
  `completed_transactions`, and `transactions_per_cart_hour` fields.
  The added mixed-group reporting check verifies one completion per group,
  cancellation exclusion from both groups, combined count/rate/duration
  totals, and shared History across Day/Week/Month and the aggregate result.
- **Validation:** the complete backend `npm test` command passed, including
  reporting 10/10 and independent-service-group contracts 4/4. Relevant
  frontend operator/Course regressions passed 16/16; the rendered browser
  regression passed 1/1, retaining PR #8 selection/tab visibility and dual
  service controls. This supersedes the stale-expectation failures recorded
  at initial sandbox publication below.
- **Publication scope:** only owner documentation and the reporting test
  changed from review head `5b21251e1cc322a7c03ec95b40e2a9f6437aed8c`.
  Application/calculation source is unchanged, so no sandbox build or
  republication was required or performed. The sandbox identities below
  remain the last published evidence. No merge, production deployment,
  service-state action, or request/data change was performed.

### Sandbox Increment: Independent Service Groups (2026-10-23)

- **Source / dependency:** `c8028744d1c7cab952ae620389a3ce79ef6b76cc`
  on `feat/independent-service-groups`, draft PR
  [#9](https://github.com/josh-fairwayrefresh/fr-main/pull/9), stacked on
  `feat/cart-request-selection` / PR #8's Architect-reviewed head
  `d33f86091673149479148c9d44d6582c95d7e105`. PR #8's selection,
  tab-visibility correction, and evidence below are retained. Receiver/Admin
  were built from `af819b549b2863c91df3bb7c73d2f89d4c5412c8`; their
  backend subtree is unchanged at the final source above. The later source
  corrects On-premise-only empty-queue messaging and adds rendered coverage.
- **Review:** https://fairway-refresh-sandbox-260930.web.app/?customer_id=CUST-0004&course_id=COURSE-0006.
  This is the dedicated synthetic `CPO TEST Independent Service Groups
  20261023` Course, not Monarch. New sandbox-only devices `FRB-0005` and
  `FRB-0006` have explicit `CPO TEST SYNTHETIC ... NO PHYSICAL DEVICE`
  comments and custom labels `CPO TEST Patio cart` / `CPO TEST Restaurant
  runner`. These sandbox records do not identify or command production
  devices with the same IDs. The first record deliberately omits
  `service_group` to exercise legacy On-course behavior. Final review state:
  both groups ON, with open requests `H9Ar1QubNUcENVnPmqUn` (On-course)
  and `O5TzAKlvXxEsIchxRHVl` (On-premise). These are dated setup facts,
  not a claim that later reviewer actions leave them unchanged.

| Sandbox surface | Published identity |
| --- | --- |
| Receiver, 100% traffic / Ready | `fairway-button-receiver-sandbox-00024-nps`, image SHA-256 `25d0ece42b7294734ef85e6452b98a230eaaa362da9f3c1ddc0b676b186a2277` |
| Admin, 100% traffic / Ready | `fairway-admin-sandbox-00017-kll`, image SHA-256 `500bc5640bda0780592aa00b945b52fc68af4d913711805fb016d2acf5b6747f` |
| Hosting live | Version `620465e60c69ee7c`, release `1792790477648000`, released `2026-10-23T21:21:17.648Z` |
| Served JS, matching local build | `assets/index-BExdrnC-.js`, SHA-256 `2179f621cc6c81dcfd1e7789c467ecb62f0b9c808c88101ef47b6c6873badee0` |
| Served CSS, matching local build | `assets/index-rXYVsfdu.css`, SHA-256 `9a3ec395295c58e258c88f64feaa9ee2ebd2819b73761f3caeb925c55b38e45b` |

Receiver source archive:
`gs://run-sources-fairway-refresh-sandbox-260930-us-central1/services/fairway-button-receiver-sandbox/1792789827.092204-56b3dfb9dd974a0ca4ca4d13e35bee00.zip#1792789827326996`,
build `385e945f-9ea0-4ac9-8cfb-8dcf99fcec6a`. Admin source archive:
`gs://run-sources-fairway-refresh-sandbox-260930-us-central1/services/fairway-admin-sandbox/1792789827.219415-5377062345d04b8c9ce7cda6b065e8bf.zip#1792789827503265`,
build `bd7372db-101d-4050-90dc-dd9eddbbf04f`. Both retained
`fairway-backend-sandbox@fairway-refresh-sandbox-260930.iam.gserviceaccount.com`.
Admin's pre-existing pinned traffic was explicitly switched to its new Ready
revision after source deployment; latest-revision creation alone did not
activate it. No new infrastructure or notifier deployment was introduced.
An initial Hosting republish invocation used the wrong configuration directory
and stopped before publication; rerunning from the frontend directory with
the existing explicit sandbox configuration succeeded.

**Deployed eligibility:** real authenticated synthetic device calls supplied
the opposite firmware `service_group`; only the authenticated stored group
controlled eligibility. Every accepted press was immediately retried and
returned the same request with `duplicate: true`.

| On-course | On-premise | On-course call | On-premise call |
| --- | --- | --- | --- |
| OFF | OFF | 503 | 503 |
| OFF | ON | 503 | 200 |
| ON | OFF | 200 | 503 |
| ON | ON | 200 | 200 |

- **State / assignment:** first-time On-premise was OFF. Concurrent group
  transitions persisted independently, including On-course actions omitting
  the group. At the retry checkpoint, same-state retries and assignments left
  event counts unchanged at 3 On-course / 4 On-premise. Moving the last
  On-premise device away removed dual controls without resetting its state;
  assigning it back restored that state. Cached Admin assignment payloads
  omitting the group preserved it. The deployed Admin form saved each group
  independently of the unchanged custom location. Reload and a second
  authenticated browser app session read the persisted states; both sessions
  used the same existing authorized account, not a newly created identity.
- **Actions / shared history:** selected and completed the non-oldest
  On-premise request `BmBLQQfa8BSeBW1dufob` after reassignment to On-course
  while both groups were OFF. Only that request disappeared; the older
  On-course request remained and was then cancelled through the UI while
  OFF. The completed request retained its `on_premise` snapshot;
  `devices/FRB-0006/commands/complete__BmBLQQfa8BSeBW1dufob` contains
  that request/device correlation. The command exists only under the new
  synthetic sandbox device; no physical device received a command. Shared
  History showed both groups' completed/cancelled outcomes. No existing
  non-synthetic requests or outcomes were changed.
- **UI:** History computed `display: none` for the entire mounted Requests
  layout; returning restored the selected non-oldest card. A subsequent new
  arrival preserved selection. Both groups' status/actions and Complete/Cancel
  stayed within 375, 430, 768, 1024, and 1440 CSS-pixel viewports, with
  document scroll width equal to viewport width. The final served bundle's
  empty queue correctly advertises incoming requests with only On-premise ON.
  This is browser verification, not physical phone/Safari acceptance.
- **Checks / limits:** frontend suite passed 65/65 before the final
  empty-message correction; final focused operator checks passed 7/7,
  rendered browser regression passed 1/1, and sandbox configuration/build
  passed. The browser fixture retains PR #8's mounted selection, hidden
  controls/focus, and completion regression and checks dual/single controls
  plus On-premise-only empty state. New actual-handler service-group
  contracts passed 4/4; the separately run access and migration checks passed
  6/6 and 4/4. Existing backend suites preceding reporting passed, but the
  initial complete backend command was not green: two reporting assertions
  also failed unchanged on PR #8 (cross-day interval count expects 2, receives 1; the
  zero-period expected shape omits existing summary fields). Reporting code
  and definitions were not changed to conceal those baseline failures.
  The later test-only correction and green suite are recorded above.
  Existing bundle-size/dependency advisories remain. Browser push permission
  was blocked; push delivery and physical firmware were not exercised.
- **Accepted reporting decision (CPO, 2026-10-23):** shared queue and History
  include both groups, and all completed requests count equally in the
  existing Course-wide KPI totals; cancellations do not count as completions.
  Active Cart Hours uses only On-course events. The CPO accepts combined
  completion counts against that denominator for Requests per Hour. Retain
  current calculations, with no group filters, separate KPIs, or reporting UI.
  On-premise-only Resume left its displayed 0.02 hours unchanged while
  On-course stayed OFF. See the UX owner.
- **Retained recovery / scope:** prior sandbox Receiver
  `fairway-button-receiver-sandbox-00023-rcx`, Admin
  `fairway-admin-sandbox-00016-jwv`, and Hosting version
  `f45300a90dc8e073` remain recorded. Ordinary recovery is explicit sandbox
  Cloud Run `services update-traffic --to-revisions=<revision>=100` with
  `--project=fairway-refresh-sandbox-260930 --region=us-central1`, plus the
  retained Hosting Release history rollback. These older backends ignore
  service groups and gate every device by On-course state; this is not
  equivalent recovery of independent controls and requires an operating
  decision. No rollback was performed. No merge, production deployment,
  production/Monarch inspection or change, firmware change, or physical-device
  command occurred.

### Sandbox Correction: Requests/History Visibility (2026-10-23)

- **Source**: `fb7b295f4ba03da90977d5f5c0db9742b38d082c` on `feat/cart-request-selection`, PR [#8](https://github.com/josh-fairwayrefresh/fr-main/pull/8). Added `.op-layout[hidden] { display: none; }` so the grid display rule cannot expose the mounted Requests view during History. Selection remains mounted and unchanged.
- **Publication**: Hosting only, project/site `fairway-refresh-sandbox-260930`, version `f45300a90dc8e073`, release `1792788619696000`, released `2026-10-23T20:50:19.696Z`. Review URL: https://fairway-refresh-sandbox-260930.web.app/?customer_id=CUST-0004&course_id=COURSE-0003. Served assets match the local sandbox build: `assets/index-8Pam1jtl.js` SHA-256 `9931d6fd0f07d05e35e7c821be008deca2c9a90267c3ed13d3eb165c032e3781`; `assets/index-CVfgjmlQ.css` SHA-256 `efa7c0953dc650851ce2013444e3a351e8a0268d0cc71e7f2c1b17f5754fa58c`. Existing Google Cloud/Firebase sign-ins were refreshed after the first publication attempt stopped on expired credentials.
- **Rendered regression**: `npm run test:browser` uses the actual OperatorApp and stylesheet in headless Chrome/Chromium, without new dependencies or backend calls. It checks computed display, zero rendered boxes for the entire hidden layout and its controls, keyboard-focus exclusion, preserved mounted card/selection on return, and the selected non-oldest completion callback. It failed with the old CSS (`History must hide Requests despite grid styling`) and passed with the correction. Set `BROWSER_BIN` if Chrome/Chromium is outside the runner's standard paths. The browser check plus focused operator/location/course checks passed 18/18; sandbox configuration validation/build and `git diff --check` passed. The existing large-bundle advisory remains.
- **Deployed verification**: Selected `CPOREVIEW-REQUESTSELECT-20261023-ARRIVAL-01`, opened History, and measured `.op-layout` as hidden with computed `display: none`, zero layout boxes, and zero boxes for Complete, Cancel, queue selection, and View full history controls. The History accessibility snapshot contained no Requests controls. Returning to Requests restored the same selected request. Completing it removed only that newer request; the older `CPOREVIEW-20261022-OPEN-01` remained selected. The completed record and `devices/CPO-REVIEW-NO-PHYSICAL-DEVICE/commands/complete__CPOREVIEW-REQUESTSELECT-20261023-ARRIVAL-01` identify the correct request and dummy device; the device document was confirmed absent before the action. No physical device was commanded.
- **Scope**: No new synthetic records, backend/schema/firmware changes, service-state changes, merge, or production deployment. Production and Monarch were untouched.

### Sandbox Publication: Cart Operator Request Selection (2026-10-23)

- **Source and Review**: Feature source `4c98ffda67cf515f5315c7d6b5426abfef661fff` on `feat/cart-request-selection`; draft PR [#8](https://github.com/josh-fairwayrefresh/fr-main/pull/8). The published change lets operators select any active request while preserving oldest-first queue order and uses the existing request-specific action path. No backend, schema, firmware, or production change was included.
- **Sandbox Hosting**: Project/site `fairway-refresh-sandbox-260930`, review URL https://fairway-refresh-sandbox-260930.web.app. Live Hosting version `f2e6cce7e53e94fd`, release `1792731173298000` (released `2026-10-23T04:52:53.298Z`). The served assets are `assets/index-DLamqpDF.js` (SHA-256 `7daa8cf955b2f772a5c63e647510ead31765e2ed484f016f0f541c4f534f3620`) and `assets/index-Cs8gHFnn.css` (SHA-256 `010e0fdf83caad892a96a6ff9219c3b6a6ab831a6bce78eb7ac493ce5aeea0ed`); both match the local sandbox build.
- **Interactive Request Verification**: In `CUST-0004/COURSE-0003`, three active requests were shown oldest-first. Keyboard Enter selected the middle request; selecting and completing `CPOREVIEW-REQUESTSELECT-20261022-NEWEST` removed only that request and left the two older requests in order, with the oldest selected. Firestore recorded that request as completed and created command `devices/CPO-REVIEW-NO-PHYSICAL-DEVICE/commands/complete__CPOREVIEW-REQUESTSELECT-20261022-NEWEST`, whose fields identify the same request and dummy device. The device document lookup returned 404; the command remained isolated under the unregistered dummy ID and was not sent to a physical device.
- **Refresh, Course, and Notification Behavior**: With the middle request manually selected, a later labeled arrival appeared without changing the selection. Switching to Course 4 and back reset selection to the oldest remaining request. Opening the active-request link `/requests/CPOREVIEW-REQUESTSELECT-20261023-ARRIVAL-01` selected its target. After the middle request was completed from a second Cart Operator browser session, the first session observed its removal and fell back to the oldest remaining request. Custom labels appeared in both the selected card and queue.
- **Responsive Check**: Browser measurements at 375, 430, 768, 1024, and 1440 CSS pixels showed document and body scroll widths equal to viewport width. Complete and Cancel controls remained inside the 375-pixel viewport; no horizontal overflow was observed. This is browser-based layout verification, not physical-phone/Safari or CPO acceptance. Browser push permission was blocked, so push delivery itself was not tested.
- **Automated Checks**: Focused operator/location/course tests passed 17/17; `npm run build:sandbox` succeeded with the existing large-bundle advisory; `git diff --check` passed. No merge or production deployment occurred.
- **Synthetic Data and Scope**: The review requests use `CPO-REVIEW-NO-PHYSICAL-DEVICE` and labels beginning `CPO TEST`; this device ID has no `devices` record. Two labeled requests were completed through the operator UI for request-action verification. Existing FRB-associated records, other sandbox resources, production, and Monarch were not changed.

### Production Deployment: Cart Operator Mobile Responsiveness (2026-10-15)

- **Source and Target**: Merged and pushed to `main` at `713528e7fae687057b23f7ecb19c0461f35ee4e6` from feature commit `6b12c4919b1590216a13eeb13d977e12ab81fa6d`. Production Firebase project and Hosting site: `savvy-kit-496703-r5`.
- **Hosting**: Live release `projects/savvy-kit-496703-r5/sites/savvy-kit-496703-r5/channels/live/releases/1792037695879000`; finalized version `projects/savvy-kit-496703-r5/sites/savvy-kit-496703-r5/versions/995c6b063a9af3c5`, released `2026-10-15T04:14:55.879Z`. The custom domain and Firebase Hosting origin serve `assets/index-B_OqSsPI.js` (SHA-256 `53f740897566d54a9b293cd9933fd0918f04eeaef89f07d53db368d0c87cd41f`) and `assets/index-CSksNdOy.css` (SHA-256 `6557df96a561960ec6ee7100aa484c3c85b4b7f1e16bc9d25d20c99f98cba6a0`), byte-identical to the local production build.
- **Rollback Readiness**: Previous accepted version `a630f4c391d769a9` was confirmed as the live release before promotion and is retained in Firebase Hosting Release history after promotion. Its recorded assets are `assets/index-B3rmwrpN.js` (SHA-256 `5aa666a9d0a7847812ca3e7187b2a7a94751566c3bf2a5891fb115559e9c79b5`) and `assets/index-DIsJ6e8N.css` (SHA-256 `f596d3f8f1532e4528f7dd616ecc31313a779f2255e794efcfdcef3f7339cbc9`). Recovery: in Firebase Console, open this production site's Hosting **Release history**, select the retained `a630f4c391d769a9` release, choose **Rollback**, confirm, then verify the new live release points to that version. The target's Release history menu exposed the Rollback action. This restores Hosting content only; it does not modify backend services or application data. The rollback itself was not executed.
- **Validation**: Frontend tests passed 59/59; production configuration validation and build passed with the existing large-chunk advisory. Production `/`, `/admin`, and `/inventory` returned HTTP 200 and displayed their expected unauthenticated sign-in entry points. Deployed JavaScript/CSS hashes matched the local production build. No authenticated Cart Operator session or physical phone/Safari validation was performed; CPO mobile acceptance remains pending.
- **Scope**: Deployment used Firebase CLI `deploy --only hosting` for the production project, uploading the frontend Hosting site only. Cloud Run, Firestore rules/indexes/data, Firebase Authentication data/configuration, and firmware were not deployed or changed.

### Production Deployment: Firebase Authentication User Directory Reconciliation (2026-10-13)

- **Target and Source at Deployment**: Production project and Hosting site `savvy-kit-496703-r5`; deployed from `main` at `e388e9a6dcc855136693aec2f39c39eb32bb12a1` with the nine authorized implementation/documentation changes.
- **Admin Backend**: `fairway-admin-00016-fs9` is Ready at 100% traffic for `fairway-admin` in `us-central1`. Image digest: `sha256:1f1cc7d1f55d373ee796786de34dd0323b746c8007e1c18617f2458a4a20a407`. The production project IDs, Admin mode, allowed origins, service account, ingress, invoker setting, scale limit, and timeout were retained. The receiver was not redeployed.
- **Cloud Run Source Provenance**: The deployed Admin archive is byte-identical across 37 comparable files to accepted commit `a07e9080473a92631a00d499482d37f35a5ca481`; the receiver archive is byte-identical across 37 comparable files to repository commit `e388e9a6dcc855136693aec2f39c39eb32bb12a1`. Neither archive contains the credential-lifecycle routes. The repository revision recorded above is not proof that the Admin lifecycle source was deployed.
- **Hosting**: Live release `projects/savvy-kit-496703-r5/sites/savvy-kit-496703-r5/channels/live/releases/1791882385471000`; finalized version `projects/savvy-kit-496703-r5/sites/savvy-kit-496703-r5/versions/a630f4c391d769a9`, released `2026-10-13T09:06:25.471Z`. The custom domain and Firebase Hosting origin serve `assets/index-B3rmwrpN.js` (SHA-256 `5aa666a9d0a7847812ca3e7187b2a7a94751566c3bf2a5891fb115559e9c79b5`) and `assets/index-DIsJ6e8N.css` (SHA-256 `f596d3f8f1532e4528f7dd616ecc31313a779f2255e794efcfdcef3f7339cbc9`), byte-identical to the local production build. The compiled Firebase project and Receiver/Admin URLs are production values; sandbox project and Admin API values are absent.
- **Preflight**: Backend test suite passed; frontend tests passed 58/58; production configuration validation and build passed. The build emitted only the existing large-chunk advisory.
- **Runtime Validation**: `/`, `/admin`, and `/inventory` return HTTP 200 from both production origins. Unauthenticated `GET /api/v1/admin/users` returns HTTP 401; production-origin CORS preflight returns HTTP 204. In an existing authenticated global-Admin browser session, refreshing User Management returned HTTP 200 with `complete: true`, `next_page_token: null`, and four users: three `PROVISIONED`, one `NOT PROVISIONED`. The UI displayed all four Authentication accounts, including the unprovisioned account. No `CONFIGURATION ERROR` or `ORPHANED RECORD` entries were present in this directory. No access Save action was used.
- **CPO Acceptance (2026-10-13)**: The CPO accepted production User Management reconciliation and confirmed existing permissions, Customer/Course assignments, and the course-user workflow. The production directory retrieval is operational. The CPO also confirmed that deleting an Authentication user leaves its access record visible as `ORPHANED RECORD`; cleanup is explicitly deferred until after the Monarch Bay pilot. No additional pilot-blocking User Management work remains.
- **Data and Scope**: The authenticated directory GET was read-only; no Auth identity or Firestore access record was intentionally created, changed, or deleted during deployment or closeout. Firestore rules/indexes, the receiver, and firmware were not changed.

### Sandbox Deployment: Firebase Authentication User Directory Reconciliation (2026-10-13)

- **Target**: Firebase project and Hosting site `fairway-refresh-sandbox-260930`; production project `savvy-kit-496703-r5` was not targeted.
- **Source**: `main` at `e388e9a6dcc855136693aec2f39c39eb32bb12a1` with the nine authorized, uncommitted implementation files. No commit or push was made.
- **Admin Backend**: `fairway-admin-sandbox-00012-zr2` is Ready and serves 100% of `fairway-admin-sandbox` traffic in `us-central1`. Image digest: `sha256:c2978a2777de0c2ab142510c048ced12db6b653b009e072f0ab2a5b4cc60b580`. The existing sandbox runtime service account, Admin mode, project IDs, allowed origin, ingress, invoker setting, scale limit, and timeout were retained.
- **Hosting**: Live release `projects/fairway-refresh-sandbox-260930/sites/fairway-refresh-sandbox-260930/channels/live/releases/1791881709368000`; finalized version `projects/fairway-refresh-sandbox-260930/sites/fairway-refresh-sandbox-260930/versions/d2f9f8000f8ef0e7`, released `2026-10-13T08:55:09.368Z`. It serves `assets/index-g6Pbl5DF.js` (SHA-256 `7716e66f635a8b3df5cb73fba1b5b7d74bb7c94cecc09b58efe76e7cd47970a3`) and `assets/index-DIsJ6e8N.css` (SHA-256 `f596d3f8f1532e4528f7dd616ecc31313a779f2255e794efcfdcef3f7339cbc9`), byte-identical to the sandbox build. The configured Firebase project and Receiver/Admin API URLs in the bundle are sandbox values. Production project identifiers are present only in the existing environment-validation guard; production Receiver/Admin API URLs are absent.
- **Automated Preflight**: Backend test suite passed; frontend tests passed 58/58; sandbox configuration validation and build passed. The build emitted only the existing large-chunk advisory. `git diff --check` passed.
- **Unauthenticated Runtime Checks**: `/`, `/admin`, and `/inventory` return HTTP 200. The Admin page renders the standard sign-in screen. The directory endpoint returns HTTP 401 without an identity, and its CORS preflight from the sandbox Hosting origin returns HTTP 204 with the expected origin and methods.
- **Authenticated Validation Boundary**: No authenticated global-Admin browser session was available. Therefore live directory completeness, observed reconciliation states, non-admin denial, and before/after Auth or `user_access` data comparison are not claimed as verified. These behaviors are covered by the backend and frontend automated tests; the CPO must perform the authenticated browser acceptance below. No Auth identity or Firestore record was intentionally changed, and no receiver, rules, indexes, or production service was deployed.
- **CPO Browser Acceptance**: Sign in at `https://fairway-refresh-sandbox-260930.web.app/admin` using an existing authorized sandbox global Admin. Open and refresh User Management; verify the complete list and displayed statuses/access summaries. Verify any existing Auth-only, malformed-access, and orphaned-record states where present; do not create exceptional records for the test. Then verify explicit access editing only if separately intended. No password or credential was requested or handled during deployment validation.

### Production Deployment: Pilot 1.1 Frontend and Cart Identity Correction (2026-10-13)

- **Project and Hosting Site**: Firebase project and Hosting site `savvy-kit-496703-r5`.
- **Source and Configuration**: Production was built from the CPO-accepted integration `fc24a65ab309500dc9b4d80ae285d957ab32041f` plus the frontend-only Cart identity correction in the authorized worktree based on `de8381af6b10f397fbfad53fd69e5b2732bd2753`; no backend source or authorization contract changed. `firebase.json` explicitly targets production, and `firebase.sandbox.json` separately targets `fairway-refresh-sandbox-260930`.
- **Hosting History**: The original pre-Pilot version `b0e4564f1de48554` contains the known Map-constructor Cart defect. Initial Pilot 1.1 promotion finalized version `bb3bcf402a24e501` (release `sites/savvy-kit-496703-r5/channels/live/releases/1791877277092000`) and served `assets/index-DJRR5VMX.js` (SHA-256 `0cf7980709eb477aaceb56c3e84e7306a21403cedcceba6253c8ecfba1cc98eb`); its first acceptance check found the dashboard-refresh customer-label defect.
- **Current Hosting Release**: Release `sites/savvy-kit-496703-r5/channels/live/releases/1791879406956000`; finalized version `bc271173b93745dc`, released `2026-10-13T08:16:46.956Z`.
- **Current Frontend Artifact**: `assets/index-DTrz6HSa.js`, local and deployed SHA-256 `7b7477e944877ecb7ffe97f74f41f840b12ebbea9584ad7cd317c092842ac271`. The fresh production build validated project `savvy-kit-496703-r5` and the production Receiver/Admin API endpoints; the artifact contains no sandbox Firebase or API endpoint values.
- **Automated Validation**: Frontend tests passed 54/54; production configuration validation and build passed. The existing MapIcon/native Map/Set regression test passed.
- **CPO-Confirmed Sandbox Acceptance**: The CPO confirmed the corrected Monarch Bay customer/course identity before and after browser refresh, Cart request-queue operation, Inventory and Admin operation, and customer-scoped Cart/Inventory access with Admin and out-of-scope course denial. The accepted sandbox build was `assets/index-KSHg7kba.js` (SHA-256 `789bf1d4a0e8b2ab1c7145ac5cf69e4329965bd22fc094f89021d8a35d970c4c`); its Hosting live-channel release was observed at `2026-10-13 01:03:15`.
- **Production Verification**: Both `https://savvy-kit-496703-r5.web.app/` and `https://app.fairwayrefresh.com/` serve the exact current artifact. `/`, `/admin`, and `/inventory` return HTTP 200 on both origins. An existing authenticated global Admin session loaded Cart on both origins; the header displayed `Monarch Bay GC · Tony Lema Course` after reload, and the existing one-request queue rendered. Inventory displayed 57 products and Admin loaded its Fleet Overview/User Management navigation. Browser checks after reload recorded no JavaScript runtime exceptions or console errors; the Map constructor defect did not recur.
- **Production-Specific Acceptance Limitations**: The available production identity was a global Admin. Customer-scoped production access and cross-customer denial were not independently retested; those permission outcomes are CPO-confirmed in sandbox, not claimed as production checks. A previously open Hosting-origin tab initially displayed the old `undefined` label; reloading fetched the current asset and corrected the display. The original tab's loaded asset was not captured, so the cause of that stale view is unconfirmed. To perform customer-scoped production acceptance, sign in at `https://app.fairwayrefresh.com/` with an existing authorized customer-scoped operator account; no production user or access record was created or changed.
- **Backend and Data**: Receiver `fairway-button-receiver-00026-kg5` and Admin `fairway-admin-00015-l2g` remained Ready at 100% traffic after Hosting deployment. No backend, rules, indexes, Auth, Firestore, DNS, or custom-domain changes were made. The original Hosting promotion preceded the authorized release commit; this entry records that historical sequencing without implying the final correction remains uncommitted.

### Baseline: FAIRWAY REFRESH — STABLE PILOT 1.1 (CPO-Accepted Sandbox, 2026-10-12)

- **Product Acceptance**: The CPO accepted the integrated sandbox behavior: global Admin access to User Management, Cart, and Inventory; authorized customer access to Cart and Inventory; denial of Admin and other-customer/course access to non-Admins; shared-session navigation and course context; and corrected application initialization.
- **Integration Source Commit**: `fc24a65ab309500dc9b4d80ae285d957ab32041f` on `main`.
- **Firmware Baseline (unchanged)**: Embarrassingly Small Runtime `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`; NCS 3.1.1, Nordic toolchain `561dce9adf`, board `circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. The FRB-0003 / Prototype 3.3 build and validation evidence is owned by `docs/FIRMWARE_SPECIFICATION.md`; Pilot 1.1 introduces no firmware change or new firmware validation.
- **Backend Source Baseline**: The integration source at `fc24a65ab309500dc9b4d80ae285d957ab32041f` implements schema-v2 `user_access/{uid}` as the runtime authorization authority; global Admin and customer/course-scoped Cart and Inventory access; fail-closed handling of missing or malformed access; project-specific protected System Administrator UIDs; and the Cart dashboard `customer_id` response needed for compound Customer/Course identity.
- **Sandbox Backend Deployment**: Receiver `fairway-button-receiver-sandbox-00016-8wn` and Admin `fairway-admin-sandbox-00011-jd6` remained the accepted sandbox services. These deployed revisions and the source baseline are recorded separately; no backend deployment was part of the release-candidate Hosting promotion.
- **Web Application Source and Artifact**: Integration source commit `fc24a65ab309500dc9b4d80ae285d957ab32041f`; CPO-accepted sandbox asset `assets/index-ulUPzeaM.js`, SHA-256 `527946650c2bdbce4b8452a78e4a326987e3a8cbea2974e5c8ad4067db5d6656`. The CPO-confirmed runtime acceptance and executable initialization regression are recorded above. Automated validation: backend 96 checks, frontend 50 tests, sandbox frontend build passed.
- **Integration Contracts**: Firmware continues to submit its existing authenticated button-event contract to the receiver. The backend remains authoritative for request persistence and access decisions; Cart request identity uses the `(customer_id, course_id)` pair. Admin, Cart, and Inventory use the shared Firebase Authentication session and schema-v2 access contract. Inventory remains a Cart feature, not an additional application entry point or authorization model.
- **Production Status at this entry's 2026-10-12 snapshot**: Production preflight was blocked at that time. This historical status is superseded by the 2026-10-13 production deployment entry above; it is not current deployment state.
- This Stable Pilot 1.1 product-baseline entry records the CPO-accepted sandbox integration. The production deployment entry above records the later Hosting release and currently active backend revisions.

### Release: Pilot 1.1 — User Management & Inventory Integration (2026-10-12)

- **Release Designation**: `pilot-1.1-with-inventory-management`
- **Accepted Git Commit SHA**: `d169b88` (integrated into `main` and tagged `pilot-1.1-with-inventory-management`)
- **Firmware Baseline**: `6a19f83` (Embarrassingly Small Runtime / FRB-0003 Prototype 3.3, unchanged)
- **Production Backend Revision (Receiver)**: `fairway-button-receiver-00025-mln` (100% traffic, Cloud Run `us-central1`)
- **Production Admin Revision**: `fairway-admin-00014-8cv` (100% traffic, Cloud Run `us-central1`, `PUT` in CORS allowlist)
- **Production Hosting Release**: Version `2f795b8a3e7b0430b9ac11af3582e0e9f9d506b23a95f9b1d09a92626e1c69aa` (serving `assets/index-CK0CNlkc.js` on `app.fairwayrefresh.com` and `savvy-kit-496703-r5.web.app`)
- **Firestore Rules & Indexes**:
  - Rules: Schema-v2 server-side rules deployed and active (`hasV2Access()`, customer/course isolation, browser writes denied).
  - Composite Indexes: 3/3 in `READY` state on `savvy-kit-496703-r5` (including `requests` customer_id/course_id/received_at).
- **Notification Sender Revision**: `fairway-request-notifier-00003-mah` (Eventarc Firestore-triggered push sender in `us-central1`, unchanged)
- **Authorization Schema Version**: `schema_version: 2` server-authoritative (`user_access/{uid}`).
  - Global Admins (`admin: true, customer_id: null, course_ids: []`): `admin@fairwayrefresh.com` (`8ChxN9ikI3Zi4H4Tq4cS1dJSAQH3`), `josh@fairwayrefresh.com` (`ALri7tjCy1XsXz0TcYQ6oyQs9of2`), `curry@fairwayrefresh.com` (`IquGn8YoKJRq6OgupiCG3BqAHjq1`).
  - Safe rollback compatibility: legacy fields (`user_type: fairway_staff`, `enabled: true`, `courses: []`) preserved on records.
- **Validation Evidence**:
  - Automated Suites: Backend 94/94 passed, Frontend 47/47 passed, production build passed.
  - Production Authorization & APIs: Admin CORS preflight advertises GET, POST, PUT, PATCH, DELETE (`204`); unauthenticated Admin access returns `401`; unauthenticated device ingestion returns `404` (fail-closed); public menu `/api/v1/public/menus/monarch-bay` serves accepted 57 products in version 2.
  - Production Hosting: Returns HTTP 200 with new production bundle `index-CK0CNlkc.js`.
- **Known Limitations / Notes**:
  - Google Sites embedding verification for public cart menu remains open.
  - Monarch Bay customer staff accounts (`monarch_fnb@fairwayrefresh.com`, `monarch_cart@fairwayrefresh.com`) will be configured via Admin User Management.

### Sandbox Integration Validation (2026-10-12)

- **Source**: `cb3d255ecaa7b7cb54d215e30bc4f0ac37278580` plus the six preserved
  uncommitted worktree changes; no commit was created.
- **Sandbox Cloud Run**: receiver `fairway-button-receiver-sandbox-00016-8wn`
  and Admin `fairway-admin-sandbox-00011-jd6`, each serving 100% of traffic
  from `fairway-refresh-sandbox-260930`.
- **Sandbox Hosting**: `https://fairway-refresh-sandbox-260930.web.app`;
  deployed assets `index-r8ZjWkb8.js` and `index-tMy6U3Ia.css` match the
  sandbox production-mode build.
- **Predeployment checks**: 92 backend tests and 49 frontend tests passed.
  Production and sandbox frontend builds passed with the existing large-chunk
  advisory. The four existing sandbox `user_access` records are schema-v2 and
  valid. The configured protected sandbox UID matched the enabled
  `admin@fairwayrefresh.com` Auth identity and its global schema-v2 access
  record. No Auth identity or Firestore record was changed.
- **HTTP checks**: `/`, `/admin`, and `/inventory` returned `200`.
  Unauthenticated receiver operator bootstrap, Admin Inventory bootstrap,
  access bootstrap, and User Management returned `401`.
- **Authenticated acceptance**: not verified. The available browser had no
  authenticated session. The standard Cart login rendered, but the browser
  reported `TypeError: wN is not a constructor` at
  `assets/index-r8ZjWkb8.js:33:33917` and remained at “Checking session…”.
  Admin, Cart Operations, Inventory, customer-scope, and protected-demotion
  browser scenarios remain unverified; CPO acceptance is outstanding.
- No production deployment, sandbox account change, authorization-data write,
  migration, commit, or push was performed.

### Frontend Initialization Failure Correction (2026-10-12)

- **Cause**: `main.jsx` imported the `lucide-react` icon as `Map` and also
  constructed `new Map()` for Cart request aggregation. The imported React
  icon shadowed the native constructor; the deployed bundle attempted
  `new wN()` on that non-constructor. No source maps were available in the
  build, so the deployed bundle was matched byte-for-byte to the local
  artifact and inspected at the reported stack location.
- **Correction**: renamed the icon import to `MapIcon`; the request
  aggregation continues to use the native `Map`. A focused regression test
  protects the distinction.
- **Sandbox Hosting**: frontend-only deployment succeeded to
  `fairway-refresh-sandbox-260930.web.app`, serving
  `assets/index-whmuq-yY.js` and `assets/index-tMy6U3Ia.css`. Backend services
  were not redeployed for this correction.
- **Validation**: frontend tests passed **50/50** and `npm run build:sandbox`
  passed with the existing large-chunk advisory. Browser checks loaded the
  new bundle on `/`, `/admin`, and `/inventory` with no page errors. An
  authenticated global Admin session loaded User Management, Cart Operations,
  and the Tony Lema Inventory containing 57 On Cart products; the Cart and
  Inventory routes retained the same session. After sign-out, all three
  routes completed unauthenticated initialization and displayed their
  expected login presentation without remaining at “Checking session…”.
- At the time of this 2026-10-12 snapshot, customer-user isolation and a live
  protected-UID demotion attempt remained unverified. On 2026-10-13 the CPO
  subsequently confirmed customer-scoped Cart/Inventory access, Admin denial,
  and course-scope enforcement in sandbox; see the current Pilot 1.1 production
  alignment entry above. No Auth identity or `user_access` record was changed.

### CPO-Confirmed Sandbox Acceptance and Release Candidate (2026-10-12)

- The CPO confirmed successful sandbox operation of global Admin access to
  User Management, Cart, and Inventory; customer-scoped Cart and Inventory
  access; denial of Admin and another customer's course to non-Admins; shared
  session/course-context navigation; and frontend initialization without the
  constructor exception.
- The accepted deployed Hosting asset remains
  `assets/index-whmuq-yY.js` at
  `https://fairway-refresh-sandbox-260930.web.app`; it includes the accepted
  `MapIcon` initialization correction. The locally tested release candidate
  additionally extracts Cart request-state initialization into
  `src/lib/courseRequestState.mjs` with an executable regression test. That
  release-candidate source was not deployed and is not claimed to be
  byte-identical to the accepted artifact.
- The release-candidate validation passed 96 backend checks, 50 frontend
  tests, and the sandbox frontend build. No deployment was performed for this
  commit.
- The CPO has not approved a privileged System Administrator revocation
  procedure. Any exceptional revocation requires a separately approved,
  controlled procedure recorded through the appropriate owner documentation.
  This release candidate authorizes no privileged Firestore modification;
  existing UID protection remains in force, and no revocation was performed.

---

## Purpose and Operational Procedures

This document is the canonical deployment and operational guide for Fairway Refresh.

It owns deployment configuration, environment configuration, hosting configuration, and deployment workflow information.

It does not own hardware implementation, firmware implementation details, UX behavior definitions, or feature planning.

---

## Deployment Architecture

The documented deployment architecture consists of:

- Firmware running on nRF9151 hardware that sends HTTPS button events to a Cloud Run endpoint.
- A Cloud Run backend service that validates lifecycle, per-device credentials, hierarchy, and service availability, then writes request records to Firestore.
- A Firebase-hosted operator web application.
- Firestore for request state and operator workflow state transitions.
- Operator actions in the web application that call Cloud Run status endpoints.
- A Firestore document-created Eventarc trigger that invokes a dedicated Web
  Push sender for authorized course subscriptions.

Current source-defined Device API scope is `button_press` plus correlated COMPLETE poll/ack. Battery-health checks/reporting and Device Health ingestion are abandoned: stable firmware emits no Health reports and current receiver source does not ingest them. Existing Firestore Health records remain historical. Active restored Admin/Hosting still includes a legacy Health-history reader, a source/deployment divergence described below, not current monitoring functionality. FRB-0003 Prototype 3.3 operational validation is recorded in `docs/DEVICE_PROVISIONING_GUIDE.md`; it introduced no backend deployment or API change.

Context references:

- Firmware owner document: docs/FIRMWARE_SPECIFICATION.md
- Hardware owner documents: docs/HARDWARE_BOM.md and docs/HARDWARE_ASSEMBLY_GUIDE.md
- UX owner document: docs/UX_SPECIFICATION.md

---

## Current Environment

### Current Validated Deployment Environment

| Item | Source | Value |
|------|--------|-------|
| Google Cloud Project | Repository configuration and deployment evidence | `savvy-kit-496703-r5` |
| Project Number | Repository/deployment evidence | `936892386735` |
| Firebase Project | Repository configuration | `savvy-kit-496703-r5` |
| Cloud Run Region | Deployment evidence | `us-central1` |
| Receiver service | Deployment evidence | `fairway-button-receiver` |
| Receiver URL | Repository/deployment evidence | `https://fairway-button-receiver-936892386735.us-central1.run.app` |
| Primary Production Application Origin | CPO/deployment evidence | `https://app.fairwayrefresh.com` |
| Firebase Hosting URL | Repository/deployment evidence | `https://savvy-kit-496703-r5.web.app` |
| Firestore Database | Deployment evidence | `(default)`, Native mode, `nam5` |

These are configured production identifiers. Current serving Admin and
receiver revisions and the Hosting version are recorded in the Current
Deployment and OTA Readiness table above. Verify current readiness, traffic,
image digests, and Hosting version immediately before any production
operation. Earlier revision records below remain historical.

WP3 deployment validation on 2026-09-18 established that Cloud Run revision
`fairway-button-receiver-00009-c5j` was healthy and receiving 100% of service
traffic. That revision identifies the historical validation event only.
Deployment procedures normally target the durable service name; the separate
Stable Pilot Baseline 1.0 record below identifies a historical known-good
receiver revision and source provenance, not a currently qualified rollback.
Revision identification is a production traffic safeguard, not a restriction
on source changes, builds, tests, or authorized Git commits.

### WP5-S1 Isolated Sandbox Environment

WP5-S1 established a dedicated non-production environment on 2026-09-30. It
does not reuse production Auth users, Firestore data, counters, credentials,
claims, sessions, or runtime identities.

| Item | Established Sandbox Value |
|------|---------------------------|
| Google Cloud / Firebase Project | `fairway-refresh-sandbox-260930` |
| Project Number | `269424081919` |
| Region | `us-central1` |
| Firestore Database | `(default)`, Native mode |
| Cloud Run Service | `fairway-button-receiver-sandbox` |
| Cloud Run Revision | `fairway-button-receiver-sandbox-00002-vh7` (100% traffic at WP5-S1 validation; superseded by a later revision recorded in "Cart UI / Inventory Integration" below. Verify actual serving revision before any operation.) |
| Cloud Run API URL | `https://fairway-button-receiver-sandbox-269424081919.us-central1.run.app` |
| Runtime Identity | `fairway-backend-sandbox@fairway-refresh-sandbox-260930.iam.gserviceaccount.com` |
| Firebase Hosting URL | `https://fairway-refresh-sandbox-260930.web.app` |

The backend requires `FAIRWAY_ENV=sandbox`, matching
`FAIRWAY_GCP_PROJECT`/`GOOGLE_CLOUD_PROJECT` values, and a project ID beginning
with `fairway-refresh-sandbox-` before initializing Firestore. Frontend build
and runtime guards require the same sandbox prefix and the separately named
sandbox Cloud Run service. Missing, mismatched, or production-targeted values
fail before deployment/runtime traffic. The local `.env.sandbox` deployment
configuration is gitignored; `.env.sandbox.example` is the tracked template.

The sandbox has a distinct Firebase web application and email/password Auth
configuration. The sandbox Auth record for `admin@fairwayrefresh.com` has a
historical `admin: true` custom claim, but current authorization ignores custom
claims and uses the schema-v2 Firestore access record. This is a sandbox-local
UID and does not establish or modify a production claim. Firestore rules and
indexes were deployed from the repository. The runtime identity has
`roles/datastore.user`; the sandbox
build identity has `roles/run.builder`. Organization policy rejected an
`allUsers` IAM binding, so the sandbox Cloud Run service uses the supported
no-invoker-IAM-check service setting while application authentication remains
enforced on device, operator, and Admin routes.

Validation established: unauthenticated Admin API `401`, authenticated
non-admin `403`, admin `200`; direct unauthenticated fleet-document access
`403`; unknown Device ingestion `404`; concurrent credential recovery and
first-Customer assignment each produced exactly one `200` and one `409`; Health
history returned the newest 100 of 105 observations in descending order; the
stored Device credential contained SHA-256 verifier metadata only; and the
hosted bundle contained the sandbox API identity and no production project,
number, Hosting, or Cloud Run identifiers. Temporary validation users and data
were removed.

The retained dataset is synthetic only: one Customer, one Course, Device
`FRB-0002`, one Health observation, one request, and sandbox-local counters.
The Device is explicitly marked `WP5-S1 SYNTHETIC SANDBOX DATA - NOT A PHYSICAL
DEVICE`; its plaintext generated credential was discarded. Numerical FRB ID
overlap has no relationship to a physical or production Device.

The sandbox remains available for synthetic workflow testing. Its Hosting build
now calls only the isolated sandbox backend; it no longer reads production data.

### WP5 Production Fleet Administration

The CPO accepted the live production-data information architecture and
presentation during the WP5 read-only review. On 2026-09-30, that accepted UI
was advanced to a dedicated production Admin API supporting the approved WP5
read and write workflows without exposing Firestore or service credentials to
the browser.

| Item | Production Value |
|------|------------------|
| Primary Application Origin | `https://app.fairwayrefresh.com` |
| Firebase Hosting | `https://savvy-kit-496703-r5.web.app` |
| Cloud Run Admin Service | `fairway-admin` |
| Latest recorded Admin Revision | `fairway-admin-00017-dvk` (Ready, 100% traffic as of 2026-10-17; credential-lifecycle capability) |
| Latest recorded Receiver Revision | `fairway-button-receiver-00026-kg5` (100% traffic as of 2026-10-17) |
| Admin API URL | `https://fairway-admin-936892386735.us-central1.run.app` |
| Runtime Identity | `fairway-admin-prod@savvy-kit-496703-r5.iam.gserviceaccount.com` |
| Runtime IAM | `roles/datastore.user`, `roles/firebaseauth.admin` |
| Allowed Browser Origins | `https://savvy-kit-496703-r5.web.app`, `https://app.fairwayrefresh.com` |

The production services use the canonical fleet modules in
`fairway_backend/cloudrun_receiver/lib/fleet/` through dedicated Admin and
receiver targets. Runtime initialization requires `FAIRWAY_ENV=production`, an
explicit supported `FAIRWAY_SERVICE_MODE`, and both project variables equal to
`savvy-kit-496703-r5`. Admin mode additionally requires the exact production
origin allowlist (Firebase Hosting and `app.fairwayrefresh.com`); receiver mode
rejects any Admin browser origin. The Admin target exposes only
`/api/v1/admin/*`, and the receiver returns `404` for that surface.
**Latest recorded production authorization state (2026-10-17):** Admin revision
`fairway-admin-00017-dvk` and receiver revision
`fairway-button-receiver-00026-kg5` were recorded serving 100% of traffic.
This is not a live check. Admin and Cart
authorization use the shared Firestore user-access record; legacy
`admin:true` claims and separate Operator/Inventory collections are not
runtime authorization sources. The old Admin-claim and separate-assignment
checks are historical deployment behavior only. Responses use `no-store`,
exact-origin CORS, allowlisted fleet DTOs, and credential-verifier redaction.

Fairway Refresh has exactly two application entry points: the customer-facing
**Cart UI** and the administrative **Admin UI**. Inventory Management is a
modular feature within the Cart UI, not a third application. Both entry points
use the existing Firebase Authentication session. One server-authoritative
Firestore record, `user_access/{uid}`, controls Admin entitlement and
customer/course access; there is no separate Inventory login, membership, or
role tier.

The active record uses schema version 2:

```json
{
  "schema_version": 2,
  "admin": false,
  "customer_id": "CUST-0001",
  "course_ids": ["COURSE-0001"]
}
```

`admin: true` grants global Admin, Cart, and Inventory access across all
Customers and Courses; its `customer_id` is null. For `admin: false`, one
existing `customer_id` is required. A non-empty `course_ids` list restricts the
user to those Courses within that Customer. An empty list deliberately grants
all Courses belonging to that Customer. Missing, unsupported, or malformed
schema fields deny access; a missing `user_access/{uid}` record never defaults
to unrestricted access. Customer users cannot enter Admin UI or call protected
Admin APIs. Email addresses and Firebase custom claims do not determine
authorization.

The record is server-read and is neither browser-readable nor browser-writable
under Firestore Rules. Admin User Management edits the authorization settings
for existing Firebase Auth users. It does not create Auth accounts or manage
passwords. Onboarding creates an Email/Password Auth account first, then an
Admin uses **User Management** to assign Admin access or select a Customer and
Courses. Until a valid version-2 record is saved, the account is denied.
Disabling an Auth account and revoking tokens are enforced independently of
the access record.

Normal Admin User Management writes cannot set `admin: false` for the
project-specific protected system-administrator UIDs. The receiver source
maps the verified production UIDs for `admin@fairwayrefresh.com` and
`josh@fairwayrefresh.com`, and the verified sandbox UID for
`admin@fairwayrefresh.com`; the sandbox has no `josh@fairwayrefresh.com` Auth
identity. At the time this note was recorded, this source change had not yet
been deployed; see the later Sandbox Integration Validation entry above.
The missing record fails closed. Do not use email matching or normal User
Management as a revocation bypass. The CPO has not approved direct privileged
Firestore modification as an operational revocation procedure. Any
exceptional revocation requires a separately approved, controlled procedure;
this release candidate does not authorize or perform such an operation, and
existing protected-UID enforcement remains in force.

Runtime services and Firestore Rules accept only schema version 2. The
one-time, sandbox-restricted `migrate_authorization_v2.js` script reads
well-formed schema-v1 records only to migrate them; the old class and assignment
fields remain on migrated documents solely to support a coordinated rollback.
Separate legacy Operator and Inventory membership collections never grant
runtime access. A rollback must restore a matching service-and-rules revision;
the retained fields are not an active second authorization model.

`/admin` is allowed only when the authoritative record has `admin: true`.
`/` and `/requests/{requestId}` enter the Cart UI and require either global Admin
access or a valid Customer/Course entitlement. `/inventory` is a feature route
inside Cart UI and uses the same Firebase session and entitlement. The
backend rechecks the exact Customer and Course for every protected operation;
the public menu remains anonymous and read-only. The conditional Inventory
navigation remains in Cart Operations, and Inventory navigation returns to
Cart Operations without another sign-in.

#### Pilot 1.1 Authorization — Sandbox Deployment and Validation (2026-10-12)

Schema-v2 is the current source authorization contract and is deployed to the
sandbox only. The sandbox receiver revision
`fairway-button-receiver-sandbox-00014-69d` and Admin revision
`fairway-admin-sandbox-00010-8rp` each serve 100% of traffic. Firestore Rules
compile and require schema-v2; unversioned records cannot authorize Firestore
request reads. All three sandbox composite indexes are `READY`, including the
Customer/Course/received-time index used by Cart queries.
The sandbox backend service account (`fairway-backend-sandbox@fairway-refresh-sandbox-260930.iam.gserviceaccount.com`)
has `roles/datastore.user` and `roles/firebaseauth.admin` (for Auth user listing).
Firebase ID token verification performs local JWT validation and explicit project binding.
CORS preflight advertises GET, POST, PUT, PATCH, and DELETE on Admin routes.

A read-only Auth/Firestore audit found four sandbox Auth accounts and four
matching, valid schema-v2 access records: one global Admin and three customer
accounts scoped to `CUST-0003` / `COURSE-0002`. The migration script's
sandbox-only dry run reported zero remaining records to migrate. No account,
password, production record, or published menu was changed by this release.
The scoped course is Monarch Bay GC / Tony Lema Course. Its Inventory
collection contains 57 active On Cart products and three retained archived
products; the active Inventory view therefore presents the accepted 57 items.
Unauthenticated smoke checks returned `401` from the Admin access-bootstrap,
Inventory bootstrap, Admin user-management, and receiver operator-bootstrap
endpoints; the receiver continues to return `404` for the Admin fleet API.
The sandbox Hosting Cart, Inventory, and Admin routes each returned `200`.

Validation on this source: 94 backend tests and 47 frontend tests passed;
`npm run build:sandbox` passed with the existing large-chunk advisory.
The production Cloud Run revisions remain receiver
`fairway-button-receiver-00024-659` and Admin `fairway-admin-00012-52t`, each
serving 100% of traffic; no production deployment, traffic change, Rules
change, or account change was made. The anonymous production menu endpoint
returned `200` with published snapshot version 2 and 57 products, all `on_cart`.
The sandbox public-menu endpoint remains unpublished (`404`); no menu was
published.

Automated authorization and notification tests pass. CPO authenticated sandbox
acceptance confirmed Admin authentication, User Management, customer-user
authorization, customer-user denial from Admin, and course assignment updates
and persistence. Sandbox has no Web Push notifier/VAPID deployment, so
delivery-time notification filtering is test-verified only. The accepted
implementation is integrated and pushed to `origin/main`. At the time of this
2026-10-12 snapshot, production remained on its prior authorization deployment;
the 2026-10-13 production deployment entry above records the later schema-v2
backend state and frontend release. No production release tag was created as
part of that deployment; the source, test, configuration, and release-record
commit and push were separately authorized after final production verification.

#### Historical Schema-v1 Authorization Rollout — 2026-10-12 (Superseded)

The following records document the initial rollout and are not the current
authorization contract. The Pilot 1.1 schema-v2 implementation and deployment
state are recorded in the section below.

The shared `user_access/{uid}` contract is deployed. The migration is
dry-run-by-default, requires an explicit Firebase project, unions enabled
legacy Operator and Inventory Course assignments, classifies existing
email-bearing accounts, and does not overwrite an existing access document.
The one-time `monarch*` email-prefix classifier was used only to seed existing
accounts; future user classes are set explicitly in Firestore Studio.

- **Sandbox initial rollout (2026-10-12):** migration created four access records (one
  `fairway_staff`, three `customer_staff`) and carried forward three assigned
  Courses. Firestore Rules, receiver revision
  `fairway-button-receiver-sandbox-00008-xpf`, Admin revision
  `fairway-admin-sandbox-00004-9jp`, and Hosting were deployed. Hosting
  `/` and `/inventory` returned `200`; unauthenticated access-bootstrap,
  operator-bootstrap, and Inventory bootstrap returned `401`. The sandbox
  public-menu API remained unpublished (`404`).
- **Production (2026-10-12):** migration created four access records (three
  `fairway_staff`, one `customer_staff`) and carried forward the one existing
  Course assignment. Firestore Rules, receiver revision
  `fairway-button-receiver-00024-659`, Admin revision `fairway-admin-00012-52t`,
  and Hosting were deployed; both Cloud Run revisions serve 100% of traffic.
  Receiver build `f71514c0-2dd1-4765-a4b7-3bb8d417745f` produced image
  `sha256:a45a89f9f173b7d137980d944af39df282b7edf10d2834c50afccda31842782f`;
  Admin build `e914f870-0534-42dc-b9be-3ad594641847` produced image
  `sha256:3e614cbc3bec5422dd3befc3512d45d5a97c91c42bdd3e29d3fceafcf15424df`.
  Hosting live version is `98089aa083c1c03d`, released at
  `2026-10-12T08:30:06Z`.
  Smoke checks returned `200` for the Cart, Admin, Inventory, and published
  menu routes; unauthenticated access-bootstrap, operator-bootstrap, Inventory
  bootstrap, and Admin fleet API returned `401`; the anonymous production menu
  API returned `200`.

The production deployment used the working source tree at Git HEAD `c641a6c`
plus its then-uncommitted implementation changes; this deployment identity is
not asserted as a Git commit. The CPO has clarified that production revision
pinning does not constrain source development, tests, builds, or authorized
commits. Source changes made after that deployment do not change live traffic.

The pre-authorization Admin revision `fairway-admin-00011-8ks` remains
identifiable as the preceding production release (Cloud Build
`e25836ea-212b-4e55-8c98-d231a9a458d4`, image
`sha256:a5631d4992c01ae8ca7c7c049eb30b361ff055709f069d24e18a42a15ff48358`).
It is not the Pilot 1.0 receiver pin; the known-good receiver rollback target
is `fairway-button-receiver-00022-wxk` as documented below.

At the 2026-10-12 rollout, one existing customer-class test account had no
legacy Course assignment and the second expected Monarch test account was not
present. By later CPO direction, the one remaining Monarch-prefixed production
test account and its empty `user_access` document were deleted. The three
Fairway staff Auth accounts were rechecked as enabled and left unchanged.
Customer account creation and Course assignment remain explicit onboarding
steps; email prefixes are not a runtime authorization rule.

#### Historical Authorization and Notification Source Snapshot — 2026-10-12

This records the earlier schema-v1 implementation and deployment evidence as
it stood on 2026-10-12. Production subsequently moved to schema-v2 with the
Pilot 1.1 backend deployment; see the current production deployment entry and
production fleet state above. This snapshot remains historical and must not be
used as the current production authorization contract.

The accepted source now gives enabled `fairway_staff` global Cart and
Inventory access by resolving Courses from the canonical Customer/Course
catalog. `customer_staff` continues to be restricted to explicit Course
assignments, and only `fairway_staff` passes the Admin boundary. Cart request
listeners and backend dashboard queries now handle one Course at a time, so
global staff access does not depend on a Firestore `in` query's course-count
limit. Firestore Rules allow enabled Fairway staff request reads globally and
keep customer reads Course-scoped.

Saved notification preferences are per-user and per-Course. The Cart UI
separates a saved preference from browser permission and installed-app support.
Delivery checks both the subscriber's current `user_access` Course entitlement
and saved preference; legacy active subscriptions without a preference keep
their existing enabled behavior until explicitly changed. Push failures remain
asynchronous to Cart request handling.

Validation on this source tree: 80 backend tests and 44 frontend tests passed;
the sandbox frontend configuration validation and Vite build passed. The build
reported the existing large-main-chunk advisory.

- **Sandbox source validation (2026-10-12):** receiver revision
  `fairway-button-receiver-sandbox-00010-lh8` and Admin/Inventory revision
  `fairway-admin-sandbox-00006-74x` each serve 100% of traffic. Firebase Rules
  compiled and were released; Hosting deployed to
  `https://fairway-refresh-sandbox-260930.web.app` (the CLI live-channel record
  reports 2026-10-12 01:56:20). Cart `/`, Inventory `/inventory`, and Admin
  `/admin` returned `200`. Unauthenticated operator bootstrap, Inventory
  bootstrap, and Admin fleet API returned `401`.
- **Production state last verified for this source snapshot (2026-10-12):**
  served receiver revision `fairway-button-receiver-00024-659` and Admin revision
  `fairway-admin-00012-52t`, each at 100% traffic. No production source,
  Hosting, Firestore Rules, Cloud Run configuration, or traffic was changed.
  The production code correction remains pending separate deployment
  authorization.

Authenticated browser validation was not performed: the Monarch test account
was deleted by CPO direction and no replacement customer account was created.
The Fairway staff accounts were not used to impersonate users for browser
validation. Automated handler tests cover the customer Course boundary and
Fairway staff global access; live staff/customer session acceptance remains
outstanding. The new delivery-time filtering is committed and test-verified,
but the production-only notifier has not been redeployed, so production push
delivery does not yet enforce saved notification preferences or recheck
current user access. Updating that function is part of the separately
authorized production rollout; no sandbox notifier or VAPID secret was
created.

The accepted Pilot 1.0 receiver revision remains a retained rollback target,
not the current traffic pin after the explicitly authorized authorization
deployment. The prior known-good revision is
`fairway-button-receiver-00022-wxk` (Cloud Build
`6a448151-0523-4009-a1a1-f6ebe33967fe`, image
`sha256:535fe5e874dbc0a4aefc95981b35073b49a68fd4b21069e6fa7dc3fbb77dd8cf`,
source archive recorded above). To restore its traffic, with separate CPO
authorization:

```sh
gcloud run services update-traffic fairway-button-receiver \
  --project=savvy-kit-496703-r5 --region=us-central1 \
  --to-revisions=fairway-button-receiver-00022-wxk=100
```

Admin revision `fairway-admin-00007-znz` corrected the custom-domain CORS
configuration after mobile Admin requests from `app.fairwayrefresh.com` were
rejected while the Firebase Hosting origin succeeded. Production now reflects
only the exact matched canonical origin. Preflight returns `204` for both
canonical origins and `403` for an arbitrary origin; unauthenticated requests
from either canonical origin retain the expected `401` boundary. The receiver
was not deployed or changed by this correction. The CPO refreshed the existing
authenticated mobile Admin session on `app.fairwayrefresh.com` and confirmed
that the production fleet loaded without the prior `Load failed` state.

At the time of the 2026-10-06 restoration, the active production Admin/Hosting
artifacts predated the Health-retirement source checkpoint and retained a
legacy Health-history read surface over old records. This is historical
deployment state, not a restriction on repository source changes. The
2026-10-12 authorization deployment replaced those Admin/Hosting artifacts
with the current Cart/Admin source; it did not delete the old Health data.

The current Admin source supports Customer/Course create and edit, Course
timezone and service schedule, permanent Device provisioning and bounded
one-time credential recovery, atomic Customer/Course/location deployment
assignment, lifecycle state, SIM/comments, service and commissioning records,
read-only verified hardware/firmware identity, and Device-to-SIM export.
Hardware revision and firmware generation start unknown at provisioning and may
be established only by controlled verified provenance. Neither field can be
changed through an administrative metadata route. Battery-health checks and
Device Health reporting are abandoned; current source has no active Health
workflow. Historical Health data remains untouched.

### Restored Matched Stable Deployment — 2026-10-06

Following rejection of the unvalidated firmware transport candidate, production
Admin and Hosting were restored to the retained 2026-10-01 stable revisions that
were current before the 2026-10-06 Admin/Hosting redeployments. Firestore was not
modified. The restored UI again reads the persisted FRB-0002
`device_health`-provenance identity, commissioning metadata, and the existing
Device health-history endpoint. The receiver was not rolled back; it remains on
the accepted `9775842`-matched backend revision with additive COMPLETE
correlation logging.

Previously unresolved deployment/source divergence, accepted by the CPO on
2026-10-10: the restored Oct 1
Admin API and Hosting artifacts predate the `0daf02d` Health-retirement source
checkpoint and include the legacy Health-history read surface. Exact
Admin/Hosting source correspondence to current repository source remains
unverified at that historical point. The CPO accepted the deployed Pilot 1.0
state unchanged as of 2026-10-10; that acceptance controlled production traffic
and did not freeze source development, testing, builds, or Git progression.
Battery-health checks and reporting are abandoned, and the stable
firmware/receiver source produces no new Health samples. The old history
reader/data were residual legacy capability, not current monitoring. There is
no requirement to retain or host that legacy Health data; removal/refinement
is deferred to a future sprint. Any production deployment or traffic change
still requires explicit CPO authorization.

| Surface | Production identity at the 2026-10-06 restore (historical rollback context) | Provenance |
|---------|---------------------------------------|------------|
| Receiver | `fairway-button-receiver-00022-wxk`, 100% traffic | Image SHA-256 `535fe5e874dbc0a4aefc95981b35073b49a68fd4b21069e6fa7dc3fbb77dd8cf`; Cloud Build `6a448151-0523-4009-a1a1-f6ebe33967fe`; logging-only COMPLETE correlation deployment described below. Source change is committed as `8686eeb`; the 2026-10-06 deployment immediately preceded that commit. |
| Admin API | `fairway-admin-00008-sjt`, 100% traffic | Retained Oct 1 image SHA-256 `d1341c1dc6ccd9b9542f90df4ecbfb57524310bad42b6c014d3cb1606ed199f2`; Cloud Build `b9620a32-2c87-4791-b9a2-d89957fef0d0`. No source commit is asserted because the retained revision provenance records its Cloud Build source archive, not a verified Git SHA. |
| Firebase Hosting live | Version `23488f2b47f307e0` | Exact retained immutable Oct 1 version, restored by a Firebase Hosting rollback release on 2026-10-06. It serves `assets/index-DXzzUJ_N.js`, SHA-256 `e7b45ecd4b8b495a63951fafa5c86e4dbb21ee94f5c12d95e294c304d17e47ea`. |

The 2026-10-06 current pre-rollback identities and source archive/image
references were saved locally, redacted of environment values, at
`/tmp/fairway-rollback-deployment-provenance.json` to preserve undo context.
FRB-0002 identity fields (`hardware_revision`, `firmware_generation`,
`system_identity`), commissioning metadata, device `health_history`, and Course
`service_events` were verified present before restoration; none were changed.

### Stable Pilot Baseline 1.0 — Verified Receiver Correspondence

Read-only production/Git verification on 2026-10-10 established the receiver
component of **Fairway Refresh Stable Pilot Baseline 1.0**:

- At baseline acceptance, production traffic was 100% on
  `fairway-button-receiver-00022-wxk`; latest-ready `00023-dff` received no
  traffic. Existing FRB-0003 activity is recorded on `00022-wxk`.
- Revision annotations identify Cloud Build `6a448151-0523-4009-a1a1-f6ebe33967fe`; its successful output matches the serving image digest `535fe5e874dbc0a4aefc95981b35073b49a68fd4b21069e6fa7dc3fbb77dd8cf` recorded above.
- The revision pins source archive `gs://run-sources-savvy-kit-496703-r5-us-central1/services/fairway-button-receiver/1791276191.783936-5af0e81b6f4f4957867829a308b0db45.zip#1791276191998024`, SHA-256 `63adb75dbf293772cfc211a1e06345276aeb2a1314f55c7a37d0373e06a51f40`. All 29 packaged files match `8686eeb:fairway_backend/cloudrun_receiver` byte-for-byte, with no extras; only tracked `.gcloudignore` is omitted from the archive. `9775842` has the same backend tree.
- The baseline pairs that receiver with accepted `6a19f83` firmware and
  CPO-confirmed Prototype 3.3 / FRB-0003 operation. Naming it is not a new
  deployment. Receiver correlation logging is retained; later undeployed
  demand-window source introduced in `62a2122` is excluded from the baseline.

**Pin scope and source progression:** the Pilot 1.0 pin identifies the
production revision and source archive that must remain available as the
known-good rollback target. It governs which revision receives production
traffic; it does not freeze repository source or prevent authorized source
changes, builds, tests, or commits. The user-authorization deployment on
2026-10-12 moved receiver traffic from the Pilot 1.0 revision
`fairway-button-receiver-00022-wxk` to
`fairway-button-receiver-00024-659` under explicit CPO authorization. The
baseline revision, image, build, and source archive above remain identified
and retained. Restoring traffic to it is possible, but requires explicit CPO
deployment authorization; no rollback was performed as part of the subsequent
pin clarification.

This baseline record verifies receiver source correspondence only. The
Admin/Hosting divergence described above was historical; the authorization
release below deployed the current repository's Admin/UI source. Admin/Hosting
deployments remain separate from the Pilot 1.0 receiver pin and require their
own authorization. Do not silently substitute deployed artifacts to reconcile
source differences.

### Cart Inventory and Golfer Menu — Increment 1 Backend Contract

The Inventory backend foundation below was implemented in repository source
first and is now deployed to the isolated sandbox (see the Sandbox Inventory
Integration and Cart UI / Inventory Integration sections below); it does not
change the accepted Pilot 1.0 device/request path. It is implemented within
the existing dedicated `fairway-admin` handler/runtime; this source
integration is not evidence that the currently deployed production Admin
image matches the repository source.

Customer feature operations authenticate a Firebase ID token and authorize the
requested Customer/Course against a valid schema-v2 `user_access/{uid}`.
Customer users have one Course restriction list shared by Cart Operations and
Inventory; an empty list means all Courses belonging to the selected Customer.
There is no separate Inventory membership or editor-role tier. The `admin`
boolean grants global Admin, Cart, and Inventory access when true; when false,
the record must name one Customer and is restricted to that Customer. Firestore
Rules require a valid schema-v2 record, scope request reads by Customer and
Course, deny unversioned legacy records, and remain closed to browser writes.

| Source route | Access | Contract |
|---|---|---|
| `GET /api/v1/access/bootstrap` | Any user with valid schema-v2 access | Returns `admin`, `customer_id`, and `course_ids` (plus a compatibility-only `user_type` response field); the UI uses `admin` to gate Admin entry. |
| `GET /api/v1/operator/bootstrap` | Admin or user entitled to at least one Course | Returns only authorized Courses and push configuration. |
| `GET /api/v1/inventory/bootstrap` | Admin or user entitled to at least one Course | Returns only authorized Courses; same entitlement as Cart Operations. |
| `GET /api/v1/inventory/courses/{customerId}/{courseId}` | Admin or user entitled to the exact Customer/Course | Returns course-level products, categories, archives, revision, configured public slug and operational summaries. |
| `POST .../audits` | Course member | Active selected approver, explicit authorization and exact inventory revision commit an immutable On Cart snapshot with submitting Auth UID; no operator or shift requirement/activity. Existing operation IDs provide safe retry. |
| `GET .../audits` | Course member | Durable audit date/time and historical approver summaries for today plus the previous 13 Course-local dates, through read time. Independent of inventory filters; used by the separate Excel Audit History worksheet. |
| `POST .../categories`; `POST .../categories/{categoryId}/subcategories` | Course member | Creates normalized labels; equivalent normalized names reuse their existing IDs. |
| `DELETE .../categories/{categoryId}` | Course member | Deletes an empty category (and its own empty subcategory labels); rejects with `409 category_not_empty` if any product still references it. Never deletes products. |
| `POST .../products`; `PATCH .../products/{productId}`; `POST .../products/{productId}/archive` | Course member | Persists product state and actor. Exact normalized name/category/subcategory/brand duplicates are rejected. |
| `GET .../preview`; `POST .../publish` | Course member | Retired, returns `410 manual_publication_retired` without mutation; cached clients must refresh and use Golfer-View Menu. |
| `GET /api/v1/public/menus/{slug}` | Public, read-only | Transactionally reads current committed active On Cart products through the single public allowlist; no quantity or internal operational fields, no-store. |
| `PATCH /api/v1/admin/customers/{customerId}/courses/{courseId}/inventory-menu` | `admin: true` | Reserves the stable menu slug. |
| `GET /api/v1/admin/users` and `PUT /api/v1/admin/users/{uid}/access` | `admin: true` | Lists existing Firebase Auth accounts and manages their schema-v2 authorization; it does not create Auth users or manage passwords. |

Data is owned by the existing nested Course. `inventory/state` stores a
monotonic inventory revision and public slug. `inventory_products`
stores authoritative records; `inventory_categories` and nested `subcategories` store
canonical labels; `inventory_product_keys` protects exact product identity;
`inventory_events` records actor/action/revision; and
`published_menus/{version}` and old publication state fields are retained
historical records only, never a serving source after the 2026-10-24 CPO
automatic-menu decision in PR #12.
`user_access/{uid}` is the sole user-class and Course-entitlement authority;
`public_menu_slugs` is a public-routing index, not an alternate catalog
authority. `operator_course_assignments` and `inventory_course_memberships`
are legacy migration inputs only and are not read at runtime.

Each save transaction serializes on the course state document and increments
the revision. The persistent-stock sandbox increment extends this owner with
atomic stock/event operations, expected stock revisions for absolute edits,
and idempotent operation identities. Metadata autosaves no longer own
stock/availability, and cached writes cannot bypass the stock contract.
This supersedes the prior last-write-wins stock/state behavior; ordinary
metadata edits retain their existing synchronization. The public route reads
the slug mapping, Course, state/revision and products in one consistent
transaction. It selects only non-archived On Cart products through the single
public-product allowlist, including explicit nested price fields. It performs
no writes, does not need staff authorization and never reads a publication
pointer/snapshot. Successful stock/catalog transactions immediately determine
subsequent public responses; failed/cancelled/unconfirmed actions and stale
idempotent retries cannot replace newer public state. Anonymous responses and
client fetches are no-store. Public pages fetch only when opened/manually
reloaded or an initial error is explicitly retried, not on a timer or focus.
All categories initially collapse, including Canned Cocktails.
Superseded requests are aborted and ignored. Existing branded URLs and
configured slug routes use the same API owner; unbranded Courses display their
own returned Course name/timezone without another Course's branding.

The API/data contract is source-defined, locally tested, and deployed as
recorded above. The Inventory and public-menu React routes are deployed.
Current sandbox alignment is recorded in the latest Alignment Register entry;
dated production publication remains the separate release evidence.

#### Increment 2 Local UI and Public Route

Historical implementation record below. Manual preview/publication and
snapshot serving were superseded in PR #12 by the 2026-10-24 CPO automatic-menu
decision and current contract above; they are not current operator instructions.

- `/inventory` uses the existing Inventory bootstrap/course APIs. Firebase
  authentication is followed by the same assigned-Course authorization as
  Cart Operations; it does not require the Fairway staff class or a separate
  Inventory membership.
- Inventory edits call the existing course-scoped API and refresh the server
  response after accepted mutations. The three state columns support drag and
  drop plus a tap-based state selector, product create/edit/archive, category
  and subcategory creation, draft preview, and explicit publication. A
  horizontal All Products/top-level category filter applies across all three
  columns; inventory products are not nested under category groups. The optional
  price editor accepts dollars and writes USD minor units to the existing API.
  Automatic 15-second/focus refresh keeps other staff edits visible while open
  forms preserve local dirty fields.
- `/cartmenus/{presentationSlug}` is an anonymous, read-only React route. It
  requests only `/api/v1/public/menus/{apiSlug}` and renders the published
  snapshot. Course-specific presentation settings, including canonical
  Customer/Course IDs, course timezone, API slug mapping, and approved static
  logos, are in
  `fairway_webapp/cart_operator_dashboard/src/lib/courseMenuConfig.js`;
  Customer/Course Register schemas are unchanged. The pilot mapping is
  `monarchbay_tony_lema_course` to API slug `monarch-bay`.
- The public menu displays only the snapshot's `published_at`, formatted in the
  configured Course timezone. It does not use page-load time or inventory-edit
  time.
- The intended Google Sites page remains
  `https://www.fairwayrefresh.com/cartmenus/monarchbay_tony_lema_course`. Embed
  the app route from the existing `app.fairwayrefresh.com` application origin;
  that origin is already in the production Admin API CORS allowlist. The
  browser request originates in the app iframe, not the parent Google Sites
  document, so no broader API CORS allowance is added.
- Firebase Hosting's existing catch-all rewrite serves the React route. The
  repository config defines no frame-deny header, and the local Vite response
  had no `X-Frame-Options` or `Content-Security-Policy` header. Production
  response headers, actual Google Sites embedding, iframe height/scrolling, and
  mobile/tablet sizing inside Google Sites remain unverified. Before release,
  validate the deployed route in the canonical Sites page at mobile and tablet
  widths, including scroll behavior and the production frame response headers.

authentication is now established, but pilot Auth identities, the Monarch Bay
Earlier UI interaction tests used a mocked Firebase identity and in-memory API
responses; those remain separate from the real sandbox Firestore evidence below.
They are not represented as proof of deployed browser authentication or Google
Sites integration. ADC authentication is established and the sandbox records,
pilot identities, memberships, and catalog have since been created as recorded
in the following validated integration section.

#### Sandbox Inventory Integration — 2026-10-11

Real sandbox setup and validation used ADC for server-side Firestore/Auth
administration. No production resource or receiver configuration was changed.

- `fairway-admin-sandbox` revision `fairway-admin-sandbox-00001-9xs` is deployed
  in `fairway-refresh-sandbox-260930` / `us-central1` using the existing
  `fairway-backend-sandbox@fairway-refresh-sandbox-260930.iam.gserviceaccount.com`
  identity and Admin handler mode. Its API URL is
  `https://fairway-admin-sandbox-269424081919.us-central1.run.app`. Exact-origin
  CORS preflight from sandbox Hosting returned `204`; unauthenticated Inventory
  bootstrap returned `401`; the configured but unpublished public slug returned
  `404`.
- The accepted sandbox receiver remains `fairway-button-receiver-sandbox-00002-vh7`
  at 100% traffic and
  `https://fairway-button-receiver-sandbox-nrnjihmmxq-uc.a.run.app`.
- No Monarch Bay records existed. The existing synthetic `CUST-0001` / `COURSE-0001`
  and empty `CUST-0002` (“Next One GC”) were preserved. The canonical allocators
  created `customers/CUST-0003` (“Monarch Bay GC”) and nested `COURSE-0002`
  (“Tony Lema Course”) with the production-verified `America/Los_Angeles`
  timezone and Sunday-Saturday 00:00-23:59 service schedule.
- Firebase Auth identities `monarch_fnb@fairwayrefresh.com` and
  `monarch_cart@fairwayrefresh.com` reused their original UIDs and were
  activated with CPO-entered hidden terminal passwords. Both have enabled
  Inventory membership for only CUST-0003 / COURSE-0002; neither has global
  Admin privileges. Firebase password sign-in was verified for each UID, and
  memberships/claims were rechecked after activation. No password, token, or
  reset link is stored in this repository or report.
- The approved CSV at `docs/catalogs/monarch-bay-inventory-import.csv` was
  dry-run against the actual Course: zero active/archived products existed and
  57 additions were planned. Import created exactly 57 products: Craft Beers 25,
  Cocktails 5, Shots 7, Craft Cocktails 1, Canned Cocktails 9, Non-Alcoholic 7,
  Food 3. All are On Cart with null brand/description/price and unique stable
  product IDs. A repeat-import dry run found zero additions and 57 identity
  matches. No other Course was changed.
- Actual Firestore authorization reads allow both memberships and deny an
  unassigned UID. Two simultaneous `updateProduct` transactions from the pilot
  UIDs both committed, advancing the revision by two; the temporary test values
  were restored. Draft preview returns the 57 On Cart items; the anonymous public
  read still returns `menu_not_found`. `published_version` remains zero.
- The initial catalog was not published, as required for CPO hands-on first
  publication. Real commit-failure rollback was not induced because doing so
  requires a prior successful publication and would violate that boundary. The
  backend in-memory atomic-failure test remains separate evidence, not a claim
  of real Firestore rollback validation.
- Sandbox frontend build succeeds with separate receiver/Admin URLs. Firebase
  CLI reauthentication completed using the CPO's existing authorized Google
  identity. Hosting was deployed with `firebase.sandbox.json`, explicitly
  targeting site `fairway-refresh-sandbox-260930`; both SPA routes return HTTP
  200. The deployed URLs are:

- Inventory: `https://fairway-refresh-sandbox-260930.web.app/inventory`
- Public menu: `https://fairway-refresh-sandbox-260930.web.app/cartmenus/monarchbay_tony_lema_course`

The deployed Inventory API returns 401 without Firebase authentication; the
public API returns 404 until the first explicit publication. Sign in with
`monarch_fnb@fairwayrefresh.com` or `monarch_cart@fairwayrefresh.com` using the
passwords the CPO set through the hidden terminal flow.

The refinement was deployed to sandbox Hosting after the initial Increment 2
release. Post-release HTTP smoke checks returned `200` for `/inventory` and
`/cartmenus/monarchbay_tony_lema_course`, `401` for unauthenticated Inventory
bootstrap, and `404` for the public API before first publication. Production
and the sandbox receiver were not changed. The public menu remains unpublished
until the CPO signs in and explicitly publishes from Inventory.

No Google Sites, DNS, production Hosting, production Cloud Run, production
Firestore, or IAM changes were made. Actual embedding inside Google Sites
remains outstanding.

#### CPO Acceptance and Remaining Work — 2026-10-11

- **CPO-observed acceptance:** the CPO reviewed the current deployed Inventory
  UI and accepts its present functionality as the stable development baseline.
  This is not a declaration that the Inventory sprint is Done. The first menu
  remains unpublished, and Google Sites embedding has not been accepted.
- **Automated evidence:** frontend 26/26 and backend 71/71 tests passed; sandbox
  build/config validation passed. These results are distinct from CPO-observed
  behavior and real Firestore integration evidence.
- **Real sandbox evidence:** both permanent pilot UIDs authenticate, have equal
  Course-scoped Inventory membership, and have no global Admin claim. The 57
  On Cart products are in Firestore. Authorization, concurrent committed saves,
  persistence, and draft/public isolation were exercised. Real commit-failure
  rollback was not tested because no first publication has been made.
- **Cart UI integration remains open:** source includes a preliminary
  Operator-side membership lookup and conditional Inventory navigation link.
  Customer-scoped Cart UI access/navigation has not been separately accepted;
  this increment must not be treated as closing that next work package.

#### Cart UI / Inventory Integration — Phases 1-3 Completed, CPO Browser Acceptance Pending

This phase closed the "Cart UI integration remains open" gap above. It did
not change the accepted Inventory dashboard, catalog, or backend contracts.

**Phase 1 — sandbox test identity.** The CPO created one new Email/Password
user directly in the `fairway-refresh-sandbox-260930` Identity Platform
project (the Firebase Console's Authentication product does not list users
for this project because it was upgraded to full Identity Platform; Google
Cloud Console's Identity Platform Users page is the correct management
surface — `https://console.cloud.google.com/customer-identity/users?project=fairway-refresh-sandbox-260930`).
Only the resulting Firebase UID was shared; no password was handled or
stored. VSC verified the UID was distinct from both existing Monarch Bay
pilot accounts, then provisioned matching `inventory_course_memberships/{uid}`
and `operator_course_assignments/{uid}` records scoped only to
`CUST-0003`/`COURSE-0002`, using the exact existing schema (including the
`course_ids` field the deployed Firestore Rules require). Running the actual
production authorization functions (`inventory.getInventoryBootstrap`,
`inventory.requireCourseAccess`, `getOperatorAssignment`) against real
sandbox Firestore confirmed: bootstrap returns only the assigned course,
access to that course is allowed, and access to an unrelated course
(`CUST-0001`/`COURSE-0001`) is denied with `403`. A full HTTP-level check
with a live Firebase ID token was not performed in this phase: minting one
requires `iam.serviceAccounts.signBlob` on the sandbox's service account,
which the CPO's Owner identity does not hold (deliberately excluded by
Google); the CPO chose to defer that proof to their own final browser
sign-in rather than grant the extra IAM permission. Neither existing
Monarch Bay account was read, modified, or exposed.
- **Sandbox-only test identity provisioned:** UID `UKQ8UlrZy9N00dbs5IeEa7Jzzb53`
  (`monarchbay_fnb@fairwayrefresh.com`), Course-scoped Inventory and Operator
  access to `CUST-0003`/`COURSE-0002` only, no `admin:true` claim.

**Phase 2 — minimal frontend integration.** `/`, `/requests/{requestId}`, and
`/inventory` now render the identical standard Cart login when signed out;
the separate "Inventory staff access" copy, the Inventory-only password-reset
UI, and the "Inventory Staff Login" nav link were removed. `/admin` keeps its
distinct Admin UI entry and login copy, preserving the two-entry-point
architecture above. The Inventory header's existing brand link now carries an
explicit "Return to Cart Operations" title, and a new adjacent
`Cart Operations` text link (with a back arrow) was added for clarity; both
still navigate to `/` as a full-page request, which the persisted Firebase
Auth session survives without re-authentication. The conditional Inventory
link in the Cart Operator banner, the `/inventory` route, and all independent
backend authorization were preserved unchanged. The accepted Inventory
dashboard, catalog, and workflow were not redesigned.

**Phase 3 — tests and sandbox deployment.** The Operator assignment test
fixture in `fairway_backend/cloudrun_receiver/test/index.test.js` now
includes `course_ids` consistent with `courses`, matching the Firestore
Rules contract, with a dedicated regression test. Focused frontend
regression tests were added/updated for the unified login presentation, the
shared logged-out-to-authenticated flow across Cart Operator and Inventory
modes, the Cart Operations return link, and the preserved Cart banner link.
Full suite results: **frontend 30/30 and backend 72/72 tests passed**;
`npm run build:sandbox` succeeded. Only sandbox Hosting was redeployed (via
`firebase.sandbox.json`, matching the established sandbox-site-targeted
command) to `fairway-refresh-sandbox-260930`; no backend/Cloud Run revision
was redeployed, no production resource was touched, and no Firestore data
beyond the new UID's two course-scoped records was written. Post-deploy
checks confirmed `/`, `/inventory`, and `/admin` Hosting routes return `200`;
unauthenticated receiver and Admin API bootstrap routes still return `401`;
the deployed JS bundle contains the new unified login and Cart Operations
link text and no longer contains the removed Inventory-specific strings; and
`published_version` remains `0`.

**Sandbox receiver VAPID configuration gap found and fixed during CPO
acceptance.** The CPO's first sandbox sign-in attempt returned `503 Push
notifications are not configured` from `/api/v1/operator/bootstrap` for
Cart Operations — a pre-existing gap unrelated to Inventory or to this
account: the sandbox receiver had no `FAIRWAY_VAPID_PUBLIC_KEY` or
`FAIRWAY_VAPID_KEY_VERSION` configured at all, which 503s that endpoint for
every operator regardless of authorization. With CPO authorization, VSC
generated one sandbox-only VAPID key pair and set
`FAIRWAY_VAPID_PUBLIC_KEY`/`FAIRWAY_VAPID_KEY_VERSION` (key version
`sandbox-v1-2026-10-11`) as Cloud Run environment variables on
`fairway-button-receiver-sandbox`, redeploying only that env-var change (no
code or image change). The corresponding private key was initially also set
on the receiver, then removed in a follow-up update once source inspection
confirmed the receiver never reads it — only the separate, production-only
`fairway-request-notifier` function does, and that function already refuses
to run outside the production project; the private key was discarded
locally and is not stored anywhere. The sandbox receiver currently serving
100% of traffic is revision `fairway-button-receiver-sandbox-00007-dkv`
(superseding the `-00002-vh7` revision recorded in earlier sections of this
guide, and the `-00005-tjc` revision that was serving before this fix); this
guide's receiver revision references above are reconciled to flag that
drift rather than silently overwritten. Re-running the real production
`getOperatorBootstrap` code path (ID-token verification stubbed, as in
Phase 1, against real sandbox Firestore and the real deployed env values)
confirmed a `200` response with the correct course and push configuration
for the new UID. No production resource, Secret Manager entry, or
production VAPID material was touched.

**CPO browser acceptance — 2026-10-11.** The CPO signed in at the sandbox
Cart URL with `monarchbay_fnb@fairwayrefresh.com`, signed out, and signed
back in; Cart Operations loaded normally; the Inventory link from the Cart
banner opened the Inventory dashboard without a second sign-in; and the CPO
navigated back and forth between Cart Operations and Inventory successfully.
This accepts the Cart UI / Inventory integration work in this section (AC1-
AC5, AC9 preserved: the first public menu remains unpublished). It does not
by itself constitute full Inventory sprint closure: first public menu
publication, Google Sites embedding, and validating the two existing
Monarch Bay staff accounts through this same integration remain separate,
not-yet-accepted items per the "CPO Acceptance and Remaining Work" section
above.

#### Post-Acceptance Corrections — Cart-First Entry, Category Management, Product Button, Subcategory Filters

During acceptance testing the CPO identified four remaining issues with the
accepted integration. The accepted integration milestone above (shared
session, Cart Operations access, Inventory access, Cart-to-Inventory
navigation, explicit return navigation, sandbox receiver VAPID
configuration, course-scoped authorization) was preserved unchanged; these
are additive corrections, not a redesign.

1. **Cart UI as the permanent customer entry point.** A sign-in completed
   while on the Inventory route previously resolved directly to Inventory
   instead of Cart Operations. `fairway_webapp/cart_operator_dashboard/src/main.jsx`
   now sets a `sessionStorage` marker (`fairway.freshSignIn`) immediately
   before both the email/password and Google-redirect sign-in actions, and
   checks it exactly once when `onAuthStateChanged` reports a signed-in
   user. The marker survives the full-page navigation used by Google
   redirect sign-in and is consumed (removed) on every auth-state
   transition, including sign-out. If a sign-in just completed (marker
   present) and the route is Inventory, the browser is redirected to `/`
   before any Inventory-specific state is set; the pure decision
   (`shouldRedirectFreshSignInToCartOperations`, added to
   `src/lib/appEntry.mjs`) only applies to the Inventory route — Admin keeps
   landing directly on Admin as the legitimate second application entry,
   and Operator/request deep links are unaffected. An already-authenticated
   session continuing a direct or Cart-banner Inventory visit (no sign-in
   action on that page load) is unaffected and keeps resolving directly to
   Inventory, preserving the accepted navigation. The existing explicit
   Inventory-to-Cart-Operations return control is unchanged.
2. **Category management and deletion.** Each category filter chip now has
   an adjacent management trigger that opens a card showing the category
   name, its product count, and its existing subcategories, with a Delete
   Category action. Deletion requires an explicit in-dialog "Are you sure
   you want to delete the '{name}' category?" confirmation (naming the
   category), is disabled in the UI when the category still has products,
   and is independently enforced server-side: a new `deleteCategory`
   function in `fairway_backend/cloudrun_receiver/lib/inventory.js`, reached
   via a new `DELETE /api/v1/inventory/courses/{customerId}/{courseId}/categories/{categoryId}`
   route in `index.js`, rejects nonempty categories with `409
   category_not_empty` and never deletes products; it only removes the
   category document and its own (necessarily also-empty) subcategory label
   documents. The Admin API's CORS preflight now allows `DELETE`. Category
   filters refresh from the server after a successful deletion, and the
   active filter resets to "All Products" if the deleted category was
   selected.
3. **Add Product button.** The button previously rendered a `Plus` icon
   immediately before literal "+ Product" text, showing two plus signs. It
   now renders exactly "+ Add Product" with no icon, in the same place and
   style as before.
4. **Subcategory filters.** A second filter row appears directly below the
   category filters and above the unchanged three-column board only when a
   specific category (not "All Products") is selected and that category's
   products include at least one subcategory. It lists "All" plus the
   distinct subcategory names found on that category's own products (read
   from existing product data; no new classification or catalog migration
   was introduced), with per-chip counts. Selecting a subcategory filters
   the visible products client-side only; switching categories resets the
   subcategory selection to "All". This composes with the existing category
   filter via a new pure `filterInventoryBySubcategory` helper in
   `src/lib/inventoryModel.mjs` and does not call the backend.

**Validation.** Backend: 73/73 tests passed, including a new case that
exercises course-scoped authorization, the empty/nonempty deletion rule, the
409 explanation, category-filter refresh after deletion, and that the
nonempty category's product is never touched. Frontend: 39/39 tests passed,
including the new fresh-sign-in redirect behavior (pure-function and
source-level), the subcategory pure-function tests, and the Add Product/
category-management/subcategory-filter UI assertions. `npm run build:sandbox`
succeeded. Beyond the automated suite, the category-deletion protection and
success path were additionally verified by running the real
`inventory.deleteCategory`/`listInventory` functions against real sandbox
Firestore (ID-token verification stubbed, as in earlier phases): an attempt
to delete the real, populated "Canned Cocktails" category was correctly
rejected with `409 category_not_empty` and left untouched, and a throwaway
empty category was created, deleted, and confirmed gone with no residue.
The real catalog was reconfirmed unchanged afterward: 57 active products, 3
archived, 8 categories, `published_version` still `0`.

**Deployment.** Both affected sandbox services were redeployed: the Admin
API (`fairway-admin-sandbox`, new revision `fairway-admin-sandbox-00002-g5p`,
same env vars, `FAIRWAY_ALLOWED_ORIGIN`, ingress, and
`invoker-iam-disabled` setting as before, explicitly reconfirmed after
deploy) for the new category-deletion route, and sandbox Hosting for the
frontend changes. No other service was touched; no production, firmware, or
Firebase Auth user/password change was made. Post-deploy checks confirmed
`/`, `/inventory`, and `/admin` still return `200`; the deployed bundles
contain all four corrections (`+ Add Product`, the category-management/
deletion strings, the subcategory filter class, and the fresh-sign-in
marker); and the Admin API's unauthenticated `DELETE` route returns `401`
(reaching the auth check, not a stale `404`).

**Bug found during CPO acceptance testing and fixed — category deletion
blocked by an archived product.** The CPO's own "THC Drinks" test category
(0 active products) repeatedly failed to delete with "This category still
has products," contradicting the dashboard's own displayed count. The
automated test suite had not caught this because it only exercised active
products; it had not been checked against real data showing the discrepancy
between what the UI counts (active products only) and what the original
`deleteCategory` check counted (active and archived). Read-only inspection
of real sandbox Firestore confirmed the root cause directly: one archived
product ("Seniorita") still referenced the category's id. `deleteCategory`
in `lib/inventory.js` now counts only active (non-archived) products when
deciding whether a category is empty, exactly matching the count shown in
the Inventory UI; an archived product may still carry a deleted category's
id as a harmless historical reference, since archived products display
using their own already-cached `category_name` string and are never
re-resolved through the live category collection. A new backend regression
test reproduces this exact scenario (a category whose only product is
archived) and asserts deletion succeeds while the archived product is
completely untouched. Backend suite: 74/74 passed. `fairway-admin-sandbox`
was redeployed again (revision `fairway-admin-sandbox-00003-6kd`, same env
vars, ingress, and `invoker-iam-disabled` setting reconfirmed after deploy).
Using the corrected, deployed code, the CPO's actual stuck "THC Drinks"
category was deleted directly (not just a throwaway test category this
time): the category is gone, the real catalog is unchanged at 57 active /
3 archived products, and the archived "Seniorita" product remains present
and unmodified with its `category_name` still reading "THC Drinks."

**Subcategory filter row — real-data finding.** Direct inspection of the
real Monarch Bay catalog found that only the "Craft Beers" category (25
products) has any subcategory assigned; all seven other categories have
zero subcategorized products. The subcategory row is therefore expected to
appear only when "Craft Beers" is selected, by the original design
("Selecting a category displays its applicable subcategories" — only when
applicable); selecting any other category correctly shows no second row
because there is nothing to filter by, not because the feature is broken.
This was confirmed by replaying the exact frontend filtering/derivation
logic against the real "Craft Beers" product set (25 products, 8 distinct
subcategory names) and by diffing the live deployed bundle byte-for-byte
against the local build to rule out a stale deployment. This data
distribution was not checked before the correction pass was first reported
as validated; it should have been.

**CPO final acceptance — 2026-10-12.** The CPO performed a full sandbox
browser acceptance pass of all four corrections above (Cart-first entry,
category management/deletion including the "THC Drinks" fix, the Add
Product button, and subcategory filtering) and confirmed the functionality
works. This closes the Cart UI / Inventory integration increment, including
the post-acceptance corrections and the archived-product deletion bug fix,
as CPO-accepted.

#### Final Baseline and Production-Readiness Status

This CPO-accepted increment was established as the new canonical Git
baseline on `main` (superseding `d4dd48db9e3bcdc6814d2d902519a7e8593e5bd0`
with commit `db183a17197e2659132759d1115420c1a7cc1181`); see
`docs/feature_backlog.md` for the accepted commit record. The
two-application-entry-point architecture above (Cart UI, Admin UI; Inventory
as a Cart UI feature with no separate login) is now the permanent canonical
architecture, not a point-in-time correction.

Google Sites embedding validation and validating the two existing Monarch
Bay staff accounts (`monarch_fnb@fairwayrefresh.com`,
`monarch_cart@fairwayrefresh.com`) through this Cart-to-Inventory
integration remain separately open; see the first-release record
immediately below for what has now shipped to production.

**Production public-menu state (last verified 2026-10-12):** published
version 2 is live at
`https://app.fairwayrefresh.com/cartmenus/monarchbay_tony_lema_course`.
It contains 57 products in six categories, with "Seltzers" under Canned
Cocktails and no Craft Cocktails category. The live page displays
"LAST UPDATED: 10/12/2026 12:49 AM PDT." The release and correction history
follows; earlier pre-release sections record the state at the time of those
sandbox deployments.

#### First Live Public Menu Release — Monarch Bay GC / Tony Lema Course (2026-10-12)

CPO-authorized production release of the public Cart food and beverage menu,
executed as one systematic workflow from the already CPO-accepted commit
`db183a1` (no source changes beyond this release were made or committed).

**Production data gap found and resolved.** The entire Inventory catalog
built during the sprint existed only in the sandbox Firestore project
(`fairway-refresh-sandbox-260930`), under sandbox's own independently
allocated `CUST-0003`/`COURSE-0002`. Production Firestore
(`savvy-kit-496703-r5`) had zero Inventory products for its Monarch Bay
course. Critically, production's real Monarch Bay GC / Tony Lema Course
already exists as **`CUST-0001`/`COURSE-0001`** (production's own first
customer, allocated before the sandbox project existed) — not
`CUST-0003`/`COURSE-0002`. With explicit CPO authorization in response to
this finding, the approved `docs/catalogs/monarch-bay-inventory-import.csv`
(57 rows, unchanged) was imported directly into production's real
`CUST-0001`/`COURSE-0001` via the same `inventory.createProduct` function
the authorized API route uses (dry-run confirmed 0 existing products before
import; all 57 created with 0 failures), reproducing the same 7
categories/8 Craft Beers subcategories as sandbox. No Firebase Auth account
or `inventory_course_memberships`/`operator_course_assignments` record was
created or modified for this release; the import, slug configuration, and
publish were performed as direct, attributed backend actions
(`vsc-engineering-release-2026-10-12`), not through a new user permission
grant, consistent with the release authorization's exclusion of "existing
production user or permission changes."

**Publication:** `inventory.configurePublicMenuSlug` reserved slug
`monarch-bay` for `CUST-0001`/`COURSE-0001` (previously unconfigured in
production); `inventory.publishMenu` created the first published snapshot —
**version 1**, `inventory_revision` 57, all 57 products (all imported as
`on_cart`, matching the CSV; no product outside On Cart exists yet to
exclude). This is the course's first-ever production publication.

**Production deployment — smallest scope the existing architecture
supports.** The public menu is one route within the same single-bundle Cart
UI SPA and is served by the same `fairwayAdmin` Cloud Run service as the
rest of the Admin API; neither can be deployed independently of their
respective existing codebases. Deployed: (1) production Hosting
(`savvy-kit-496703-r5`, `npx firebase-tools deploy --only hosting --project
savvy-kit-496703-r5`) with the production build of the accepted `main`
commit; (2) production Admin API (`fairway-admin`,
`gcloud run deploy fairway-admin --project=savvy-kit-496703-r5
--source=fairway_backend/cloudrun_receiver --function=fairwayAdmin`). The
production receiver (`fairway-button-receiver`, Cart Operator/device path)
was not touched; its live revision before and after this menu release was
`fairway-button-receiver-00022-wxk`. Revision `00023-dff` was a later
diagnostic revision and received no traffic.

At the start of this menu release, the Admin service was serving the restored
`fairway-admin-00008-sjt` revision from the 2026-10-06 deployment. This was an
Admin deployment state, not the Pilot 1.0 receiver pin. The Pilot 1.0 pin
identified receiver revision `fairway-button-receiver-00022-wxk`; it did not
freeze either service's source code or Git history. The newly built Admin
revision (`fairway-admin-00011-8ks`) was first verified healthy via a
temporary Cloud Run traffic tag (`candidate`) and tested in isolation
— public menu `200` with 57 products, unauthenticated Inventory/Fleet routes
still correctly `401`, CORS preflight from `https://app.fairwayrefresh.com`
correct including the new `DELETE` method — before deliberately migrating
100% of traffic to it and removing the temporary tag. Cart Operator
functionality is served entirely by the separate, untouched receiver
service and was not implicated.

**Target address finding:** the task's stated target,
`https://www.fairwayrefresh.com/cartmenus/monarchbay_tony_lema_course`, is a
Google Sites property (confirmed via its Google-specific CSP/frame headers),
not Firebase Hosting; that exact path currently returns `404` there because
the corresponding Google Sites page/embed has never been created — a
content/CMS action on a third-party site builder, outside this engineering
deployment's reach, consistent with "Actual embedding inside Google Sites
remains outstanding" recorded earlier in this document. The smallest viable
supported alternative, already fully live and verified below, is the
existing production Fairway Refresh application origin:
**`https://app.fairwayrefresh.com/cartmenus/monarchbay_tony_lema_course`**
— Firebase Hosting's existing catch-all rewrite serves this route with no
routing or hosting configuration change.

**Live validation (real browser, unauthenticated, 2026-10-12):**

The checks below record state at the public-menu release, before the
subsequent, separately authorized user-authorization migration and deployment.
They are release-time evidence and do not describe current authorization data.

The following category breakdown records the initial version 1 validation;
the corrected version 2 state is recorded in the post-release correction
below.

| Check | Result |
|---|---|
| AC1 loads without login | Confirmed — no auth UI after load; a `Sign out` button only appears momentarily as the shared loading fallback's incidental artifact, not part of the rendered public menu |
| AC2 identifies course | "Tony Lema Course" / Monarch Bay Golf Club branding confirmed |
| AC3/AC4 On Cart only | All 57 rendered products show "Available" (On Cart); none excluded since none are Sold Out/In Inventory/Archived yet |
| AC5 names/categories/subcategories/prices | Verified against the CSV: 7 categories (Canned Cocktails 9, Cocktails 5, Craft Beers 25, Craft Cocktails 1, Food 3, Non-Alcoholic 7, Shots 7 = 57) and all 8 Craft Beers subcategories exactly match; all prices blank as approved |
| AC6 mobile rendering | 390×844 viewport: no horizontal overflow, category cards and product lists render cleanly |
| AC7 draft/public separation | Structural guarantee verified by source/test inspection (immutable `published_menus/{version}` snapshot; public read only resolves the `published_version` pointer, never live draft state) — not re-validated by making a live draft edit against this first real publication |
| AC8 Cart Operations unaffected | Receiver service untouched (`fairway-button-receiver-00023-dff`, unchanged); unauthenticated operator bootstrap still `401` |
| AC9 no existing data modified | `CUST-0001`/`COURSE-0001` document `updated_at` timestamps confirmed unchanged by this release (only new Inventory subcollections were added); no Firebase Auth account, `operator_course_assignments`, or `inventory_course_memberships` record was created or modified |
| AC10 existing architecture only | Served via the existing `/cartmenus/{slug}` route, existing Admin API, existing public-menu-slug mechanism; no third application entry point or new menu system introduced |

**Known limitations:** Google Sites embedding at the originally-targeted
`www.fairwayrefresh.com` path remains outstanding (separate, non-engineering
action). The two existing Monarch Bay staff accounts have not been
validated against production Inventory access as part of this release (no
membership grant was made, consistent with this release's "no existing
production user or permission changes" boundary); that remains a distinct,
separately authorized activity if production Inventory-dashboard access for
those accounts is wanted.

**Post-release correction — 2026-10-12.** The CPO identified a catalog
error immediately after reviewing the live menu: "Seltzers" was miscategorized
under a "Craft Cocktails" category that should not exist at all; it belongs
under "Canned Cocktails". Corrected in the approved
`docs/catalogs/monarch-bay-inventory-import.csv` (moved the row), in
production (`CUST-0001`/`COURSE-0001`: `updateProduct` moved Seltzers to
Canned Cocktails, then `deleteCategory` removed the now-empty "Craft
Cocktails" category — the same archived-product-aware emptiness check
proved out again), and in sandbox (`CUST-0003`/`COURSE-0002`, for
consistency; its one archived "Michele" product under the old category did
not block deletion, and the sandbox menu's `published_version` correctly
remained `0`, unaffected). Production was republished as **version 2** (57
products across six categories: Canned Cocktails 10, Cocktails 5, Craft
Beers 25, Food 3, Non-Alcoholic 7, Shots 7; Craft Cocktails removed) and
reverified live in a real browser at
`https://app.fairwayrefresh.com/cartmenus/monarchbay_tony_lema_course`:
Canned Cocktails correctly lists all 10 items including Seltzers, and no
Craft Cocktails category or products remain. The live menu displays
"LAST UPDATED: 10/12/2026 12:49 AM PDT." No product was deleted; no other
category or product was affected.


### Backend Release Register — Device Firmware Compatibility

This register maps production `fairway-button-receiver` revisions to firmware
compatibility evidence. It does not register Admin or Hosting releases, which do
not define the Device wire protocol. Firmware source, build configuration, and
artifact provenance remain owned by the Firmware Generation Registry in
`docs/FIRMWARE_SPECIFICATION.md`.

Compatibility status is evidence-based: **Proven operational** requires a
matched firmware generation and successful end-to-end Device request evidence;
**Partial / historical** applies only to the specifically verified API path;
**Observed diagnostic only** is not product acceptance; **Unverified** means
the existing release record does not identify a matched firmware artifact or
end-to-end outcome. Revision traffic/readiness alone is not compatibility proof.

| Receiver revision | Release record | Firmware pairing evidence | Compatibility status |
|---|---|---|---|
| `fairway-button-receiver-00009-c5j` | WP3 production validation; healthy at 100% traffic. Exact image/build provenance is not in the current record. | FRB-0001 per-device-authenticated request acceptance is recorded in `docs/DEVICE_PROVISIONING_GUIDE.md`, but the exact firmware artifact is not linked to this revision. | **Unverified exact pairing**; functional request evidence exists, but the firmware/revision mapping is not traceable. |
| `fairway-button-receiver-00013-zhj` | Original WP5 rollout-validation checkpoint; exact image digest/source is not recorded here. | The WP5 checklist records backend/admin route and authorization tests, not a specific physical firmware artifact paired with this revision. | **Unverified**. |
| `fairway-button-receiver-00016-djx` | WP5 system-metadata deployment record; full image/source provenance is not recorded here. | The same closeout records FRB-0002 system-identity firmware and an authenticated Device Health update. | **Partial / historical**: Device Health compatibility was observed for that exchange; Device Health is retired and this does not prove the current button/COMPLETE contract. |
| `fairway-button-receiver-00019-c8h` | Option C service-schedule production rollout; exact image/source provenance is not recorded here. | No exact physical firmware artifact or end-to-end Device result is paired with this revision in the deployment record. | **Unverified**. |
| `fairway-button-receiver-00022-wxk` | Stable Pilot Baseline 1.0 receiver, 100% traffic; byte-for-byte archive/Git, image, and build verification is recorded above. The change from its predecessor is logging-only with no response-shape change. | Receiver tree `8686eeb` (also identical at `9775842`) paired with accepted `6a19f83` firmware. FRB-0003 button/LED and cart UI receipt are CPO-confirmed; earlier COMPLETE evidence retains its original device/context in `docs/FIRMWARE_SPECIFICATION.md`. | **Proven operational** for the designated baseline; not new FRB-0003 COMPLETE or endurance/power/fleet validation. |
| `fairway-button-receiver-00023-dff` | Later diagnostic revision; image/source provenance is not recorded in this deployment guide. | One authenticated FRB-0002 request and subsequent COMPLETE polls succeeded with a temporary diagnostic firmware image; the event is recorded in `docs/FIRMWARE_SPECIFICATION.md`. | **Observed diagnostic only**; not an accepted operational firmware pairing and superseded by the rollback to `00022-wxk`. |

For each new receiver release evaluated for operational compatibility, record
its immutable revision, firmware generation under test, validation scope,
evidence reference, and compatibility determination. Reference existing
release and firmware provenance rather than duplicating it.

### Historical WP5 System-Metadata Deployment Record

The WP5 system-metadata closeout deployed Admin revision
`fairway-admin-00004-mz5`, receiver revision
`fairway-button-receiver-00016-djx`, and Hosting asset
`assets/index-0JzD1L0J.js`. The receiver now requires explicit fail-closed
production mode and project configuration and accepts the build-owned identity
pair on authenticated Device Health. The Admin DTO exposes only redacted
provenance source/time. FRB-0001 retains `verified_provenance` for its installed
legacy image. FRB-0002 was flashed with the exact artifact recorded in the
Firmware Generation Registry; authenticated Device Health at
`2026-10-01T03:57:38.827Z` replaced its bridge atomically with `device_health`
provenance and the build-owned `Monarch Bay Pilot v3.2` / `Prototype 3.2 for
Pilot — Working Button and Lights` identity pair. The CPO confirmed normal boot
and the resulting available identity/provenance in production Admin. The flash
required separately authorized canonical erase-all after the non-destructive
physical-RESET service-entry response failed to restore Memory AP access.
The authorized two-record provenance reconciliation and subsequent runtime promotion left
all unrelated production Customer, Course, Device, and counter facts unchanged:
their normalized SHA-256 fingerprint was
`c330b8df195c2de5c6aaacf6d4fe21fd6ba39e6534e1cf8addaa682933333ade`
both before and after the transaction. That checkpoint passed 91/91 backend
tests, exact-origin CORS, route isolation, receiver unknown-device rejection,
and byte-identical Hosting artifact verification.

The final WP5 lifecycle/assignment correction deployed Admin revision
`fairway-admin-00006-n87` at 100% traffic and Hosting asset
`assets/index-Bn8RWJ55.js` (SHA-256
`d72c456eb2ab190fe0fdeaaa30fa92c6def1ce244f05b5ce890090bb73987925`). The
backend now atomically clears Customer, Course, and location when a Device enters
`in_inventory`, requires a valid Customer, a Course belonging to that Customer,
and a valid location before accepting `deployed`, and prevents a deployed
assignment from being cleared independently. New provisioning creates a
completely unassigned inventory Device. That deployment passed 91/91 backend tests; the production
bundle is byte-identical to the validated local artifact, and Admin
authorization/CORS checks return the expected `401`, `403`, and `204`.
FRB-0002 was reconciled through the corrected lifecycle primitive to
`state = "in_inventory"` with null `customer_id`, `customer_name`, `course_id`,
`course_name`, and `location`. Its SIM, credential verifier, system identity,
Health, commissioning metadata, and unrelated fleet data were preserved. The
normalized seven-record preservation fingerprint, excluding those authorized
assignment fields and their write timestamp, remained
`833e0c9765cac04202a1ef7f939444c43dddf560ee3e4483928e4677d190649b` before and
after correction. No errors were logged for the Admin revision, and the receiver
remained on revision `fairway-button-receiver-00016-djx`.

The original WP5 rollout validation established: 88/88 backend tests; exact production and sandbox
frontend configuration validation/builds; production Hosting artifact equality;
unauthenticated `401`; authenticated non-admin `403`; wrong-origin `403`;
approved preflight `204`; non-Admin route `404`; authenticated fleet, FRB-0002
Health history, and Device-to-SIM export `200`; authenticated malformed Customer
creation and invalid lifecycle state `400` with no write; two authoritative
production Devices and two export rows; no credential digest in the fleet
response; and zero retained temporary validation users. The dedicated Admin
identity has only `roles/datastore.user`; the receiver revision at that original
validation checkpoint was `fairway-button-receiver-00013-zhj`.

Production validation created no Customer, Course, Device, credential, counter,
service, commissioning, metadata, assignment, state, or Health mutation. The
fleet hash changed from 105 to 109 documents only because four authenticated
real Device Health observations arrived while validation was in progress;
allocation counters remained exactly `CUST=2`, `COURSE=2`, and `FRB=3`. No
legitimate deployed-device fact was altered for testing.

The temporary sandbox production-read broker, its Cloud Run service, production
`roles/datastore.viewer` binding, sandbox runtime identity, frontend review
configuration/routes, and source package were removed after production rollout.

The CPO accepted the production-backed Admin experience and the final ownership
boundary between administrative data and system/device truth. Acceptance does
not require a fictitious or audit-distorting production write. Integrated-browser
visual/network automation was unavailable during the original rollout; the CPO's
direct review is the visual acceptance evidence on record. WP5 is complete.

### Historical Deployment Environment (Pending Independent Revalidation)

- Historical deployment workflow and environment details are captured in the Working State document.
- Historical statements that have not been independently revalidated are explicitly labeled throughout this guide.

---

## Repository Locations

- Firmware: samples/fairway_power_sandbox/
- Backend: fairway_backend/cloudrun_receiver/
- Operator Dashboard: fairway_webapp/cart_operator_dashboard/

---

## Required Services

Current deployment depends on:

- Google Cloud Project (Cloud Run and Firestore)
- Cloud Run
- Firebase Hosting
- Cloud Firestore
- Hologram (LTE-M SIM/provider dependency)

---

## Environment Configuration

| Item | Source | Status | Notes |
|------|--------|--------|-------|
| Per-device ID and credential | Local provisioning material | Required | `FAIRWAY_DEVICE_ID` and the per-device `FAIRWAY_DEVICE_KEY` macro are supplied by the local gitignored provisioning header; values are intentionally omitted. |
| Hardware/firmware system identity | Historical Device Health build contract | Not emitted by stable baseline | Firmware `6a19f83` does not define or transmit `FAIRWAY_HARDWARE_REVISION` / `FAIRWAY_FIRMWARE_GENERATION`. Previously stored identity values and the legacy Admin display are historical/deployment evidence, not a runtime prerequisite or current telemetry path. |
| Firebase web configuration | Repository | Repository-managed | Web app configuration is maintained in source; this guide does not duplicate values. |
| TLS CA chain certificates | Repository | Repository-managed | Firmware trust material is maintained in the firmware certificate directory. |
| Cloud Run service account IAM | Historical Working State | Pending Live Verification | Historical source reports Firestore write role assignment; exact service account identity is not recorded in current repository-controlled artifacts. |
| Secrets management system of record | Live Verification Required | Not Documented | Secrets system of record, ownership, and rotation workflow are not documented in current repository-controlled deployment artifacts. |

The backend has no fleet-wide `FAIRWAY_DEVICE_KEY` requirement. Button-event
authentication uses the claimed Device's own Firestore-stored verifier, and
the obsolete Cloud Run environment variable has been removed.

---

## Firmware Deployment

Firmware deployment procedures are owned by this document.

Firmware implementation is owned by docs/FIRMWARE_SPECIFICATION.md.

### Abandoned Course-Configurable Demand-Window Candidate

The matched backend/firmware rollout procedure for this candidate has been
withdrawn. CPO abandoned the feature because it did not deliver an accepted
working result; automated checks and a clean build do not authorize deployment.
Production remains on the fixed five-minute contract. Candidate source and tests
are preserved on `archive/firmware/modular-golfer-demand-window` for provenance
only; do not use the former rollout/rollback procedure or its experimental
protocol as current operational guidance.

### Authorization Control

Fairway firmware work follows this authorization sequence:

PLAN
-> CPO APPROVAL
-> IMPLEMENT / CODE
-> BUILD
-> CPO AUTHORIZATION TO FLASH
-> FLASH
-> CPO AUTHORIZATION TO RUNTIME / MANUAL TEST
-> MANUAL TEST
-> CHECK

Build authorization does not authorize flashing.
Flash authorization does not authorize runtime or manual testing.

The technical procedure below describes how an already-approved operation is performed; it does not grant authorization to perform that operation.

### Production MCUboot signing-key custody

The current OTA release builder does not accept an implicit signing-key
default. Every release build must be given a Fairway-controlled ECDSA-P256
private key outside the source checkout and output directory. Do not use
NCS's distributed `root-ec-p256.pem` key for production. Existing images
signed by that development key are not valid commissioning candidates.

The CPO owns and authorizes creation and custody of the actual production
key. The CPO may explicitly authorize a trusted local engineering assistant
to generate and store it on the CPO-controlled workstation when the private
key and passphrase remain local and are never displayed, logged, uploaded, or
transmitted. This delegation does not authorize release generation or signing.
Use a dedicated local directory outside the source checkout and all
automatically synchronized folders, with directory mode `0700`. Generate the
key using the installed NCS 3.1.1 MCUboot `imgtool`:

```sh
KEY_DIR=/Volumes/FairwaySigning/production
KEY="$KEY_DIR/fairway-mcuboot-production.pem"

mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR"
test ! -e "$KEY"
umask 077
python3 "$NCS_INSTALL_DIR/bootloader/mcuboot/scripts/imgtool.py" keygen \
  --type ecdsa-p256 --key "$KEY" --password
chmod 600 "$KEY"
```

Use a unique, strong passphrase entered only at the hidden prompts; never put
it in a command, environment variable, chat, source file, or build log. Store
the password-protected key on encrypted offline media and keep at least one
separately stored encrypted offline backup. Retain the passphrase separately
under the CPO's approved secret-custody process. Verify the backup by
deriving the public-key fingerprint without disclosing or exporting the
private key. Do not put either copy in Git, a cloud drive, email, CI, an OTA
artifact bucket, or the release output directory.

The builder enforces an owner-only private-key file (`0600`), rejects a key
inside the checkout or release output, passes the configured key explicitly
to NCS sysbuild, checks the generated MCUboot public-key bytes against the
key fingerprint, verifies the image signature, and requires rejection by
NCS's distributed development key. MCUboot's NCS 3.1.1 build generates
`autogen-pubkey.c` from the supplied key and compiles the public verification
key into the bootloader; the private key is used only by local build/signing
tools. The builder does not copy it into the release artifacts or manifest,
and redacts the local key path from manifest configuration and command
metadata. The public-key fingerprint is SHA-256 over MCUboot's
DER-encoded ECDSA-P256 SubjectPublicKeyInfo bytes, matching NCS imgtool's
generated MCUboot public-key hash.

NCS 3.1.1 MCUboot imgtool prompts for an encrypted-key passphrase with
`getpass` and has no noninteractive password option. The Fairway release
builder therefore requests the passphrase once in the interactive terminal
before invoking West, unlocks the existing encrypted key in memory, and
writes a temporary unencrypted PEM in a system temporary directory with
directory mode `0700` and file mode `0600`. That temporary key is supplied to
sysbuild/imgtool, checked against the compiled MCUboot public-key fingerprint,
and checked for leakage into both release artifacts. The temporary directory
is removed on normal completion, handled build errors, and SIGINT/SIGTERM/
SIGHUP/SIGTSTP/SIGTTIN/SIGTTOU. This is best-effort cleanup, not guaranteed
secure erasure: SIGKILL, power loss, OS failure, filesystem snapshots, swap,
or crash dumps may leave recoverable plaintext on disk or in memory. Keep the
workstation access restricted during signing and do not treat the temporary
file as safely erased after cleanup.

Loss of every private-key copy prevents future OTA images from authenticating
to devices using that trust anchor. The current bootloader configuration has
no remote key-rotation path; recovery would require a separately authorized
physical USB recovery that installs a replacement MCUboot trust anchor and
firmware. Treat total key loss as a fleet-recovery event. Do not assume that
reflashing preserves TF-M identity data without separately verifying the
recovery procedure.

On 2026-11-07, following explicit CPO authorization and the local-agent
delegation above, the encrypted production ECDSA-P256 key and separate
passphrase file were created on the CPO-controlled workstation. Their
fingerprint is
`sha256:be1c125733db97148309513e75282736024bec3e2b47beb44b7aa3008f4f88eb`.
The key was validated with NCS 3.1.1 imgtool and independently checked as
ECDSA-P256. The private key and passphrase were not copied into the checkout
or displayed. The CPO confirmed the encrypted offline backup and separate passphrase
custody on 2026-11-07. Local production release generation and signing are
authorized by the current task; this does not authorize OTA publication,
device assignment, deployment, or physical commissioning.

### Build Procedure

Fairway `nfed` operates as a freestanding product repository built against the separately installed official NCS v3.1.1 SDK. A second Fairway-owned West/NCS reconstruction (`west init`/`west update` against `nfed`) is not required and is not the validated procedure.

On macOS, install the nRF Connect for VS Code extension and use **Install SDK** or **Manage SDKs** to install nRF Connect SDK v3.1.1 with its matching Nordic toolchain. NCS v3.1.1 is the validated canonical deployment SDK baseline. As an equivalent supported command-line alternative, use nRF Util SDK Manager with Nordic's release-specific v3.1.1 installation flow. Do not use the deprecated nRF Connect for Desktop Toolchain Manager for NCS 3.x.

Create a clean workspace directory, then clone the Fairway recovery repository into `<workspace>/nfed`:

```sh
git clone https://github.com/josh-fairwayrefresh/fr-main.git <workspace>/nfed
```

Before building, activate or otherwise configure the Nordic-installed toolchain environment that matches the approved NCS SDK, then verify the shell before invoking West. The durable requirement is the matching Nordic-installed toolchain environment for the approved NCS version; the toolchain bundle identifier is installation evidence, not a permanent Fairway architecture constant.

For the current validated local installation, the mapping is:

```sh
NCS_INSTALL_DIR=/opt/nordic/ncs/v3.1.1
NCS_TOOLCHAIN_DIR=/opt/nordic/ncs/toolchains/561dce9adf

export PATH="$NCS_TOOLCHAIN_DIR/bin:$NCS_TOOLCHAIN_DIR/usr/bin:$NCS_TOOLCHAIN_DIR/usr/local/bin:$NCS_TOOLCHAIN_DIR/opt/bin:$NCS_TOOLCHAIN_DIR/nrfutil/bin:$NCS_TOOLCHAIN_DIR/opt/zephyr-sdk/arm-zephyr-eabi/bin:$NCS_TOOLCHAIN_DIR/opt/zephyr-sdk/riscv64-zephyr-elf/bin:$PATH"
export ZEPHYR_TOOLCHAIN_VARIANT=zephyr
export ZEPHYR_SDK_INSTALL_DIR="$NCS_TOOLCHAIN_DIR/opt/zephyr-sdk"

command -v west
west --version
grep -Fx '3.1.1' "$NCS_INSTALL_DIR/nrf/VERSION"
test -x "$NCS_TOOLCHAIN_DIR/bin/python"
test -x "$NCS_TOOLCHAIN_DIR/opt/zephyr-sdk/arm-zephyr-eabi/bin/arm-zephyr-eabi-gcc"
```

The verification must show that `west` resolves from the Nordic-installed environment, `west --version` succeeds, the SDK is NCS v3.1.1, and the selected toolchain is the one installed for that SDK. If `west` is not on `PATH`, activate or configure the matching Nordic-installed environment and repeat these checks. Do not search for or create a Fairway-owned West workspace, run `west init`/`west update` to reconstruct one, or create a second SDK workspace.

The current local evidence above used NCS v3.1.1 with Nordic toolchain bundle `561dce9adf` and West 1.4.0. A future SDK Manager installation or update may use a different bundle identifier; that does not change the requirement to use the matching Nordic-installed toolchain environment.

#### Current common OTA release build

Use the common-image builder for the original releases or distinct corrected
successors. The image
does not contain a Device ID or credential. Select one supported release ID,
the CPO-provided local key path, and a fresh output directory outside the
checkout. Build only the specifically authorized release(s), using the existing
installed trust anchor, and verify fingerprints across their manifests.
Do not rebuild installed OTA 0.1 merely to qualify nightly successors:

```sh
RELEASE_ID=OTA-0.1
OUTPUT_DIR="$HOME/fairway-builds/ota-${RELEASE_ID}-validation-01"
MCUBOOT_SIGNING_KEY="$KEY"

python3 <workspace>/nfed/scripts/build_ota_release.py \
  --release-id "$RELEASE_ID" \
  --output-dir "$OUTPUT_DIR" \
  --ncs-install-dir "$NCS_INSTALL_DIR" \
  --signing-key "$MCUBOOT_SIGNING_KEY"

python3 <workspace>/nfed/scripts/verify_ota_release.py \
  --manifest "$OUTPUT_DIR/${RELEASE_ID}-manifest.json" \
  --ncs-install-dir "$NCS_INSTALL_DIR" \
  --signing-key "$MCUBOOT_SIGNING_KEY"
```

For corrected nightly candidates choose `OTA-0.1alt-r2` (`0.1.0+3`) or
`OTA-1.0-r2` (`1.0.0+2`); original IDs remain supported for historical
verification, not overwriting accepted packages. The builder binds each release
ID to its exact semantic version and schedule, writes a release Kconfig overlay and explicitly configures the same supplied key and
ECDSA-P256 algorithm for the application signer and MCUboot trust anchor. It
verifies that both generated configurations use that key and version,
validates the generated bootloader public key fingerprint, checks the signed
MCUboot header, compiled move-swap capacity and 424 KiB signed-image maximum,
and rejects an image that verifies with the
NCS development key. The manifest records the SHA-256 public-key fingerprint
and generated Partition Manager map, fixed partition device tree, signer
configuration, redacted build command, source state, artifact sizes, and
hashes. The independent verifier requires the matching local private key,
checks its fingerprint and signature, confirms the development key rejects
the image, and checks that the private key is absent from both artifacts.
OTA 0.1's merged HEX contains the bootloader with the CPO key's public trust
anchor and is the initial USB commissioning image; OTA 0.1alt and OTA 1.0 are
signed common OTA artifacts using the same key.

The output directory is owner-only and outside the source checkout. It contains no
credential-bearing build header or private signing key. Keep private-key
access on the authorized local signing workstation. Successful signature
verification proves image integrity under the identified public key; it does
not authorize physical flashing or production service deployment. Never flash
or deploy these images without the separate approvals and prerequisites above.

#### Legacy device-specific artifact verification

`scripts/build_device_firmware.py` and
`scripts/verify_device_artifact.py` describe the retired per-device-image
workflow. Do not use that workflow for the current source or any OTA release:
the application now reads identity/credentials from PSA Protected Storage,
and per-device values must not be compiled into a common image. The verifier
remains available to inspect older, retained per-device artifacts where
required by their historical provenance.

The old builder's embedded-header checks and secrets-directory contract apply
only to images built from the corresponding historical source. Do not treat
its acceptance of a historical image as a check of the current OTA release
builder or current common image.

The application `samples/fairway_power_sandbox/sysbuild.cmake` propagates the tracked Fairway board root to the MCUboot child image. This is required for the custom `circuitdojo_feather_nrf9151` board to resolve consistently during the sysbuild build.

### Historical OTA Increment 1 foundation — superseded by current delivery implementation

This dated record documents the earlier OTA-manager-only checkpoint. Its
statements that no downloader, caller, or assignment service existed and its
491,520-byte partition map are historical. The current source, 432 KiB layout,
and common release artifacts are described in the OTA commissioning section
above and in `docs/FIRMWARE_SPECIFICATION.md`.

The source-only OTA foundation was built from source checkpoint
`29b8d8556e9ac7ab228967d74d79d1b994285cb6` on
`review/frb0005-increment-1.0-source-checkpoint-20261105`. The worktree was
dirty; the exact application/board source fingerprint is recorded in the
protected manifest. No generated image was flashed or deployed.

The protected output directory is
`/Users/DuplexLoop/fairway-builds/fairway-FRB-0005-ota-increment-1-20261106-final3/`.
The complete output contains per-device credentials and must remain owner-only:

| Artifact | Size | SHA-256 |
|---|---:|---|
| `fairway-FRB-0005-merged.hex` | 550,732 bytes | `c6285f104b175ec909295371a007dcc38c4c6bde89d926e1eff0bf0783541747` |
| `fairway-FRB-0005-ota.signed.bin` | 152,455 bytes | `d4e034102417d18a7c1f7e8ba03f7fc0e3ec5277623c1d286af3bc4a810541b9` |

The OTA artifact is the signed MCUboot image produced from the TF-M-merged
application, version `0.0.0+0`; it fits the generated 491,520-byte secondary
slot. The generated Partition Manager map matches the board's static
`circuitdojo_feather_nrf9151_pm_static.yml`. The DTS still records older
fixed-partition slot addresses; current OTA staging and MCUboot flash-map
selection use Partition Manager. The source-level discrepancy and its scope
are described in `docs/FIRMWARE_SPECIFICATION.md`.

The build used NCS 3.1.1, Nordic toolchain bundle `561dce9adf`, West 1.4.0,
board `circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. MCUboot
uses ECDSA-P256 and swap-using-move, signed with NCS's distributed
`root-ec-p256.pem` development key. For this final rebuild, `imgtool verify`
accepted the signed OTA image and rejected a payload-mutated copy. The build
emitted Kconfig assignment warnings for `UART_CONSOLE`, `I2C`, and
`DNS_RESOLVER`; no OTA-source compiler warning was observed. This is
cryptographic validation against the development key only, not production
trust or proof that FRB-0005's installed bootloader has the same key or
partition map.

The protected builder/verifier suite was rerun against the final source and
passed **37/37** tests. The OTA policy test is declared as Zephyr `ztest`, but
Twister statically filters `native_sim` on this macOS host because Zephyr's
POSIX native architecture requires Linux; a direct native build reports the
same platform restriction. A temporary host-only assertion run executed the
seven policy test cases, but is not a Zephyr Twister pass. The complete OTA
firmware build and both protected artifacts verified successfully.

The build and image checks do not prove compatibility with FRB-0005's
installed bootloader, physical staging, trial activation, confirmation,
reversion, or power-loss recovery. Cellular download, release assignment,
caller authorization, signed hardware-compatibility metadata, anti-rollback
policy, production signer, and matching production trust anchor are not
implemented or approved. No physical update test is authorized by this
record. See `docs/FIRMWARE_SPECIFICATION.md` for the device-side ownership
boundaries and remaining architecture limitations.

### OTA Blocker 1 — boot health and service-mode protection (2026-11-07; not flashed)

The approved Blocker 1 correction was implemented on
`review/frb0005-increment-1.0-source-checkpoint-20261105`, based on rollback
checkpoint `29b8d8556e9ac7ab228967d74d79d1b994285cb6`. The application now
selects PV8 service mode before enabling a normal-mode trial deadline. Only a
normal-mode trial gets the one-shot 300-second deadline. Service mode does not
confirm the image, start modem/golfer runtime, or arm that deadline. If the
service debugger rail fails to initialize during a trial, the application
requests a reset before a programming session can begin.

In normal operation, confirmation follows successful local button/indicator,
power-policy, and UART initialization, then successful modem-library startup,
PSM setup, CA-chain validation/provisioning, and acceptance of the asynchronous
LTE connection-start request. The main thread waits for that result by sharing
its existing wake semaphore; it continues processing golfer-button events
while modem setup runs. Registration, DNS, backend transactions, and
synthetic requests are not boot-health gates. A local bootstrap failure
prevents confirmation; if health has not passed by the one-shot deadline, the
application requests a reset while the trial remains unconfirmed. A failed
MCUboot confirmation likewise leaves the trial unconfirmed for the bounded
timeout path.

The 300-second deadline is supported by NCS 3.1.1's
`nrf_modem_lib_init()` API documentation, which states that initialization can
take a few minutes when modem firmware update work is already scheduled.
Registration is asynchronous and excluded. This is a conservative source-based
bound, not an observed FRB-0005 boot-time measurement.

The final protected output is
`/Users/DuplexLoop/fairway-builds/fairway-FRB-0005-ota-blocker-1-20261107-final5/`.
The builder completed for NCS 3.1.1, Nordic toolchain bundle `561dce9adf`,
West 1.4.0, board `circuitdojo_feather_nrf9151@1/nrf9151/ns`, and
`prj_a.conf`. The signed OTA image passed NCS `imgtool verify` with the
distributed development key; that key is not production-qualified.

| Artifact | Size | SHA-256 |
|---|---:|---|
| `fairway-FRB-0005-merged.hex` | 552,436 bytes | `603c1b6334722ae31b7b453e0751434757fbb5cf76ce285ce551315cfaf3d315` |
| `fairway-FRB-0005-ota.signed.bin` | 153,075 bytes | `af150455c86c440d15e6907b838da0c182a92d4a115c1ed26a52dc991fdac446` |

Validation: the protected builder/verifier suite passed **37/37** tests, and
seven direct host assertions passed for service-mode deadline exclusion and
the confirmation gates. The Zephyr OTA ztest suite was selected by Twister but
statically filtered on macOS because `native_sim` requires Linux; zero Zephyr
test cases ran. The final firmware build succeeded. It emitted the existing
`UART_CONSOLE`, `I2C`, and `DNS_RESOLVER` Kconfig assignment warnings and
MCUboot's warning that the default signing key is for debug use. No OTA source
compiler warning was observed.

No firmware was flashed, and no physical startup, confirmation, MCUboot revert,
debugger programming, or service-session continuity was tested. Before field
OTA use, physically verify test-image activation and confirmation timing,
rollback after injected mandatory-init failure and timeout, service mode held
for longer than the deadline without interruption or confirmation, and the
authorized wired erase/program/read-back recovery procedure. These checks must
use the installed bootloader and the established debugger/security controls;
this build's source and host assertions do not prove physical recovery.

### Flash Procedure

Use the [single commissioning entry point](./DEVICE_PROVISIONING_GUIDE.md#usb-only-commissioning)
for clean installation or compatible storage-preserving maintenance.
Firmware is credential-free; per-device identity and credential installation
uses TF-M Protected Storage, not device-specific firmware headers.
Disconnect field power and measurement supplies before USB service as
specified by the [Assembly Guide](./HARDWARE_ASSEMBLY_GUIDE.md#current-field-power-and-service-isolation).

**Destructive-operation gate:** complete erase destroys existing firmware and
device-local credentials. It requires separate target-specific authorization
and a prepared replacement credential/rotation. No FRB-0005 authorization
applies to another device. Normal maintenance must not erase protected
storage. Verify the approved artifacts and production signing trust before
programming; the NCS debug signing key is not production-qualified.

The current low-power firmware disables BUCK2 during normal operation, which
removes power from the Feather's RP2040 debugger. To enter its explicit
development/service mode, keep the PV8 button pressed while applying USB
service power or pressing RESET, and hold it through startup. The firmware
then keeps BUCK2 enabled and does not start LTE or golfer-request runtime.
This explicit physical service entry is retained for separately authorized
board recovery, not automated or presented as routine PV8-free maintenance.
Wait for stable exact-probe enumeration; release PV8 before the final
operational reset. FRB-0005's one successful recovery is recorded below.
Do not repeat USB reconnects to catch a brief startup window. If access is
absent, the host stops without erasing. The remaining service-access
architectural decision is owned by the
[Firmware Specification](./FIRMWARE_SPECIFICATION.md#unresolved-routine-usb-debugger-access).
The board's PMIC setup and two-second startup initialization are unchanged.

### USB-only commissioning build and flash

The replacement uses the existing CMSIS-DAP and CDC-ACM interfaces on one USB
cable. The commissioning application itself does not require PV8; access to
previously installed field firmware is a separate recovery prerequisite.
Provisioning lifecycle and protocol are owned
by the [Device Provisioning Guide](./DEVICE_PROVISIONING_GUIDE.md#usb-only-commissioning).
Keep field power disconnected during USB service.

#### FRB-0005 physical commissioning evidence — 2026-11-10

The CPO authorized one PV8-assisted recovery, destructive erase, installation,
provisioning, and production credential activation. All previous processes
were confirmed stopped. With PV8 held through USB connection, exact probe
`E66550A147969135` remained visible across checks five seconds apart. No
early-erase listener was used. PV8 was released before normal-operation reset.

The already production-signature-verified artifacts were reused without
rebuilding; their signed and merged hashes were rechecked, along with matching
TF-M payloads, protected-storage layout, and production trust:

- Commissioner: external build `usb-commissioning-20261110-r2`, signed SHA-256
  `8e01f246360cc5709eededf5630988d1c30121a9542550a02c9dd058644ca475`.
- Operational OTA 0.1 (`0.1.0+1`): external build
  `ota-OTA-0.1-production-20261109-r2`, signed SHA-256
  `98687914b7ff0b7ab9116a7fff34d525b67c96955f84d06a24bd349538240f40`.

The exact-probe `probe-rs erase --allow-erase-all` completed with exit zero.
Complete commissioner HEX download with `--verify` completed successfully
(20.94 seconds). The existing assigned identity and retained replacement
credential were installed through the commissioner; both installation and
verification succeeded, followed by another successful verification after
reset. No plaintext credential was displayed.

OTA 0.1 signed binary was then downloaded at `0x10000` with
`--verify --restore-unwritten`, without another full erase (20.32 seconds).
Only after device-side persistence verification and successful final flashing,
the existing authenticated Admin rotation lifecycle activated the matching
prepared rotation (HTTP 200, state `activated`). The device was reset normally.
Permanent registry identity, assignment, and history were preserved.

The CPO pressed the physical request button and confirmed normal device
behavior and delivery to the Cart UI. The CPO then selected COMPLETE and
confirmed the normal device completion indication. This supplies physical
end-to-end authentication/operation evidence, not merely build or flash
evidence. It does not establish automatic USB detection, repeatable
button-free recovery, OTA scheduling, or OTA capability registry initialization.
No commit, push, OTA assignment, or power-policy redesign was performed.

At the CPO's subsequent explicit request, a conditional, field-only update
recorded `devices/FRB-0005.ota_capability` in production: `verified: true`,
hardware `circuitdojo_feather_nrf9151@1/nrf9151/ns`, production fingerprint
`sha256:be1c125733db97148309513e75282736024bec3e2b47beb44b7aa3008f4f88eb`,
and `schedule_mode: one_time`, with the physical evidence above referenced.
Read-back verified the complete capability and unchanged lifecycle/assignment.
Admin Firmware OTA then showed FRB-0005 selectable, no missing-trust warning,
and no pending release. No assignment was created; subsequent update
authorization remains with the CPO through Admin.

At approximately 14:23 Pacific, after the CPO reported authorizing the next
update, refreshed production Admin showed pending `OTA-0.1alt-r2` with last
reported result `assigned`. No OTA check-in or confirmed version was reported
at that checkpoint. Assignment is not proof of download or installation; the
one-time 900-second interval is measured by the device, not from the time of
the commissioning report.

Build the credential-free commissioning application through the established
NCS 3.1.1 toolchain and production-signing environment:

```sh
python3 scripts/build_ota_release.py \
  --release-id OTA-0.1 --usb-commissioning \
  --output-dir <fresh-external-output-directory> \
  --ncs-install-dir "$NCS_INSTALL_DIR" \
  --signing-key "$MCUBOOT_SIGNING_KEY"
```

The hidden passphrase and key-cleanup controls above remain unchanged.
`USB-commissioning-manifest.json` records `image_role: usb_commissioning`;
these images are commissioning tools, not OTA releases. The independent
verifier rejects this role unless explicitly called with `commissioning=True`.
The common build selects `CONFIG_UART_INTERRUPT_DRIVEN`, `CONFIG_CRC`, and
`CONFIG_FAIRWAY_USB_COMMISSIONING`; CMake replaces the operational entry point
with the commissioner, retaining the shared power policy and identity storage.

Complete merged-HEX programming (the clean-installation path) writes every
address range in the image, including the MCUboot bootloader. It is not
approved for FRB-0003 while preserving its installed bootloader; that path
requires a separately validated application-only artifact, and replacing
FRB-0003's bootloader requires separate CPO authorization.

Before any physical operation, the host verifies signatures/hashes and
commissioning/operational role separation, matching partition/storage maps,
production trust, and byte-identical TF-M payloads. Normal helper/final
programming writes signed primary-slot images at `0x10000` with
`--verify --restore-unwritten`, without `--chip-erase` or `--allow-erase-all`.
The bootloader, secondary slot, TF-M ITS, NV counters, Protected Storage, and
KMU are not selected for final-image programming. Never substitute a full
erase after provisioning.

For explicitly authorized clean installation, `--erase` requires an already
accessible exact probe and prepared, activatable rotation. It performs one
`probe-rs erase --allow-erase-all`, then installs the complete verified
commissioning HEX with `--verify`. It never repeats an uncertain erase or
flash, polls for debugger reconnection, or captures early boot. All later
programming preserves protected storage. Without `--erase`, compatible
existing bootloader/TF-M infrastructure and credentials are retained.

The approved OTA 0.1 signed artifact and trust anchor remain unchanged.
After acknowledged provisioning and successful verification following a
commissioner reboot, the utility flashes/read-back-verifies that artifact,
activates only its matching backend rotation, and resets. The operational
image retains its accepted low-power behavior; subsequent USB access to this
image still requires independently established stable service access. Do not claim that a
commissioning image makes unchanged field firmware permanently USB-accessible.
Do not erase a commissioned unit without a separately authorized credential
recovery plan.

Current build evidence: production-signed commissioning build r2
succeeded on the established toolchain. Its secure TF-M payload, complete
partition layout, protected-storage configuration, and trust fingerprint
matched the accepted OTA 0.1 package. Subsequent source changes require their
own build verification. FRB-0005's physical commissioning, authentication,
and COMPLETE evidence is recorded above. OTA successor download,
installation, and confirmation remain pending; commissioning does not prove
autonomous OTA field operation.

#### Local cleanup qualification — 2026-11-10

The post-commissioning cleanup removes the abandoned early-erase listener,
startup-capture retries, associated recovery tests, and stale workspace task
invocation. The single host entry point now requires an already accessible
exact probe. Explicit `--erase` retains the demonstrated erase/full-HEX
sequence; default maintenance and the final operational installation retain
primary-only storage-preserving programming. No firmware, board power policy,
wire protocol, backend contract, or production state was changed in cleanup.

Local validation:

- Python provisioning/release/shared-builder suite: 116 tests run, one skipped;
  all executed tests passed. Coverage includes pseudo-terminal burst transport,
  actual C PSA storage logic, clean-install/maintenance ordering, no replay
  after failed erase/flash, activation gates, signing-role checks, and
  low-power/service source regressions.
- Six isolated backend test files passed: credential lifecycle, provisioning,
  OTA API, OTA fleet authorization, artifact store, and deployment logging
  configuration. Only fake/sandbox test data was used.
- Existing OTA firmware host runner compiled the real policy, manager,
  scheduler, and delivery sources with warnings as errors: 34 checks passed
  in each of bootstrap and nightly configurations.
- Unchanged commissioner r2 and OTA 0.1 artifacts passed signed/merged hash,
  pinned MCUboot public-key fingerprint, SHA-256 TLV, ECDSA-P256 signature,
  debug-key rejection, and TF-M compatibility checks. No signing private key
  or credential was needed for these local public-key checks.
- Editor diagnostics and `git diff --check` passed. Firmware source/build
  inputs are unchanged by this cleanup, so no Nordic image rebuild or
  physical test was performed.

These are local regression results, not new physical or autonomous OTA
evidence. The last observed OTA status remains the CPO-created
`OTA-0.1alt-r2` assignment; field validation is pending. The unresolved
routine PV8-free service-access decision remains a review item, not an
implemented capability.

### Manual Validation

After separate CPO authorization for runtime/manual testing, perform only the validation appropriate to the approved operating mode.

For the functional field path (application idle/dormant state below does not
mean measured low-power current):

1. Disconnect Feather USB before connecting the installed generation's approved field supply; Prototype 3.3 uses a V25/V50/V75 pack through the distribution rail directly to J1/3 VBUS. PPK2 consumption characterization remains deferred and must isolate other supplies. Follow `docs/HARDWARE_ASSEMBLY_GUIDE.md`; do not treat the historical VBAT measurement boundary as a 3.3 result.
2. Cold-boot the approved production image.
3. Confirm expected startup and dormant behavior described by `docs/FIRMWARE_SPECIFICATION.md` and `docs/UX_SPECIFICATION.md`.
4. Press the Fairway button once.
5. Confirm the expected request and LED sequence.
6. Confirm the device returns to its expected dormant state.

No current VXX/VBUS field dormant-current or autonomy result is established.
The retained legacy VBUS awake policy and measurement boundary are owned by
`docs/FIRMWARE_SPECIFICATION.md`; historical VBAT results do not establish
low-power field operation.

### FRB-0005 Low-Power Increment 0.5 Validation Record (2026-11-05)

This is a device-specific development-candidate record, not a fleet release.
The restored working image first completed a CPO-confirmed button-to-Cart UI
transaction under normal field power. Increment 0.5 then removed only the
unconditional VBUS CPU-awake hold; LTE PSM policy, BUCK2 policy, button
handling, HTTPS, identity, credentials, and LED implementation were preserved.

The candidate was built from the October 17 firmware source baseline
`97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` on
`validation/firmware-oct17-baseline`, using NCS 3.1.1, toolchain bundle
`561dce9adf`, board `circuitdojo_feather_nrf9151@1/nrf9151/ns`, and
`prj_a.conf`. The protected FRB-0005 artifact is
`/Users/DuplexLoop/fairway-builds/fairway-FRB-0005-increment0.5-20261105-1954/fairway-FRB-0005-merged.hex`,
522,048 bytes, SHA-256
`1755cff058f8890cb29118fa6e12a7f69cf1503d53c8c09c4a2240f6c47f356b`.
Independent verification confirmed the device identity and protected-input
credential match. The artifact-builder regression suite passed 30/30 tests.
The known-working recovery image was preserved and independently reverified:
SHA-256
`d6cb053267f390b7158d731f182c0339b98e5b775568406806b24a26f58b0213`.

The identified FRB-0005 probe (serial `E66550A147969135`) was locked. At that
time, the recovery utility's `--unlock-only` action was recorded as performing
erase-all; probe-rs then programmed and read-back verified the complete merged
image with `--verify`, and reset succeeded. This is a historical record of
that tool sequence, not validation of the utility as an AP-FAULT recovery
method; the current programming/recovery procedure is the probe-rs
erase-all/full-image procedure above. The CPO subsequently reported a
successful field-powered button transaction. The exact LED sequence and a
request-correlated post-test UI record were not separately captured.

The CPO-provided `baseline11_4.csv` contains 60,001 samples over 60.000
seconds: mean 27.725 mA, median 27.262 mA, minimum 8.364 mA, maximum
76.286 mA, and standard deviation 4.133 mA. The Increment 0.5 file named
`increment0.5-idle-60s.csv` contains 16,368 samples over only 16.367 seconds:
mean 14.024 mA, median 13.834 mA, minimum 10.263 mA, maximum 36.893 mA, and
standard deviation 1.925 mA. The CPO considers this capture sufficient for
the Increment 0.5 review; its filename does not represent its actual duration.
The shorter candidate trace indicates lower observed average current, but the
duration differs from the later Increment 1.0 capture. The CPO's subsequent
confirmation that both captures used the same electrical setup is recorded
with the Increment 1.0 results below.

The candidate trace contains repeatable current pulses approximately every
1.264 seconds. The CPO notes that earlier abandoned-build traces lacked the
periodic tick; those traces are not this candidate and do not establish its
cause. Do not claim the tick is eliminated or attribute it to CPU, modem, or
LTE behavior from these data. Source inspection confirms the VBUS awake hold
is removed, but the current trace alone does not prove CPU WFI entry.
Debugger/recovery accessibility after field operation was not tested.
Increment 0.5 remains an unaccepted development candidate pending CPO
acceptance; the remaining evidence limits are explicit rather than inferred.

### FRB-0005 Low-Power Increment 1.0 Validation Record (2026-11-05)

Increment 1.0 applies LTE PSM decoupling to the Increment 0.5 source: modem
service configures the existing PSM parameters and requests PSM independently
of VBUS; power policy no longer stores VBUS for PSM or calls modem-service PSM
controls. VBUS continues to control only the existing BUCK2 policy in that
module. The bounded interaction-awake behavior is unchanged. The modem event
handler logs network-reported PSM TAU and active-time values when a PSM update
event is received; a successful request log alone is not evidence that the
network granted PSM.

The FRB-0005 candidate was built from source commit
`97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` plus the current uncommitted
Increment 0.5 and Increment 1.0 changes. Build source fingerprint:
`2a1d5ee563a53a1fc078df0fca74322a6a56c92fd5748606fb4fa9be6335862c`.
The original fingerprint included two ignored generated HEX files under
`samples/fairway_power_sandbox/artifacts/`:
`frb0002_runtime_reliability_candidate_merged.hex` and
`fairway_system_identity_candidate_merged.hex`. They are not part of this
checkpoint. The fingerprint is retained as build-time provenance, but must
not be represented as reproducible from the committed source tree alone.
The build used NCS 3.1.1, Nordic toolchain bundle `561dce9adf`, West 1.4.0,
board `circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. The
protected complete image is
`/Users/DuplexLoop/fairway-builds/fairway-FRB-0005-increment1.0-20261105-2120/fairway-FRB-0005-merged.hex`,
521,656 bytes, SHA-256
`9555cc03eb39c3d90e6d533381fd8ebf9be186941c5d8b0d8268005b1bd7c935`.
The builder's independent artifact verification passed for FRB-0005 identity,
protected-input credential match, and artifact integrity. Builder regression
tests passed 30/30. The build used the NCS-distributed `root-ec-p256.pem`
MCUboot debug signing key; its standard warning means this artifact is for the
established device-development workflow only, not a production release.

The known-working recovery image remains preserved at
`/Users/DuplexLoop/fairway-builds/FRB-0005-https-recovery-20261105-1639/fairway-FRB-0005-merged.hex`,
SHA-256
`d6cb053267f390b7158d731f182c0339b98e5b775568406806b24a26f58b0213`.

The correct FRB-0005 probe was identified as CMSIS-DAP serial
`E66550A147969135`. `probe-rs download` used the established full-image
`--chip-erase --allow-erase-all --verify` procedure and completed successfully
after 31.38 seconds; a normal `probe-rs reset` also succeeded. No Circuit Dojo
AP-FAULT recovery utility was used.

A protected USB diagnostic capture at
`/Users/DuplexLoop/fairway-builds/fairway-FRB-0005-increment1.0-20261105-2120/runtime-usb-boot-20261105-2119.log`
recorded: modem library initialization succeeded; PSM request returned
success with `RPTAU=default`, `RAT=0 s`; LTE registration progressed from
status 2 to registered status 5; and the modem reported a network PSM update
of `TAU=3600 s`, `active_time=0 s`. The capture credential scan found no
device credential in the log. This was captured over USB/debug power, not the
field-power configuration; the PSM update demonstrates a network-reported
configuration but does not establish actual PSM entry or equivalent field
behavior.

For field validation, the CPO confirmed FRB-0005 was returned to normal
field-power configuration and pressed the physical button once. The CPO
observed orange then green success feedback and reported successful delivery
to the Cart Operator UI. The UI was on `Placeholder Hills / Test Links 18`,
service ON; its request queue increased from two existing requests to three,
with one new `Hole 1` request. No second button press was made. This confirms
the field-powered end-to-end request path for this test.

The COMPLETE flow was not tested: by the time the new request was isolated in
the UI, its displayed age had reached approximately five minutes, so it was
not counted as a valid in-window COMPLETE test. The request was left untouched.
Field-mode modem registration/PSM logs, direct observation of the idle-hold
release, and COMPLETE behavior were not directly observed. A subsequent
CPO-supplied PPK2 CSV, `increment 1.csv`, contains 60,001 samples over 60.000
seconds. It records a mean of 25.168 mA, median 25.316 mA, minimum 17.685 mA,
maximum 25.570 mA, and standard deviation 0.750 mA. The digital channels were
all zero. The trace has no observed high-current pulses recurring at the
Increment 0.5 capture's approximately 1.264-second interval; its maximum
remains below 25.6 mA over the full capture. This is evidence that the pulse
was absent in this sampled interval, not proof it can never recur.

The Increment 1.0 mean is 11.144 mA (79.5%) higher than the Increment 0.5
16.367-second capture's 14.024 mA mean. The Increment 1.0 maximum is lower
than that shorter trace's 36.893 mA maximum, but the current average did not
improve relative to the available Increment 0.5 result. The Increment 0.5
capture was deliberately stopped early. The CPO confirmed that both captures
used exactly the same power supply, wiring, PPK2 measurement boundary, and
operating setup. The higher observed mean is therefore a real difference
under the same electrical setup, while the 16.367-second and 60.000-second
capture durations remain unequal and limit direct comparison of their
averages. These measurements do not by themselves attribute the difference
to PSM. The Increment 1.0 capture was supplied after the field request and
after its five-minute demand window had expired; it is consistent with
settled idle, though the field runtime log was not captured.

No PPK2 evidence establishes why the periodic pulse is absent in this trace,
whether the modem entered PSM during this exact field capture, or whether the
higher average is due to the measurement boundary, modem state, or another
load. No corrective changes outside Increment 1.0 were made.

#### Follow-up modem functional-off isolation (2026-11-06)

A temporary diagnostic image, built from the Increment 1.0 source with a
one-time modem-off diagnostic, was programmed for this investigation. Its
complete image is
`/Users/DuplexLoop/fairway-builds/fairway-FRB-0005-lowpower-diagnostic-20261105-2215/fairway-FRB-0005-merged.hex`,
SHA-256
`02320635c0242574648069110d8d0839df5aa8fd6c851df3838423cfe10e476b`.
After LTE registration, it waited 360 seconds and then requested
`LTE_LC_FUNC_MODE_POWER_OFF`. The protected UART log recorded registration,
network-reported `TAU=13200 s, active_time=0 s`, registration loss, and
successful LTE functional-mode power-off at about 6:16 after boot. This
forced functional-mode shutdown is not evidence that the network granted PSM
or that the normal firmware entered PSM.

The CPO reports that the field-powered PPK2 observation ran for more than five
minutes, included this modem-off event, and remained in the 23–25 mA range,
with no discernible current reduction at the event. This supports the
conclusion that active LTE/radio operation is not the dominant source of the
sustained approximately 25 mA draw. It is a CPO-reported observation; the
supplied CSV `ppk-20261106T064005.csv` (SHA-256
`5ce688f8caf8b4550c2d89cc488342ebe7a4b4669c4f54b34664a6ad8dcb3dd6`) contains
only 60,001 samples from 0 to 60,000 ms and does not itself include the
six-minute modem-off event. In its settled portion from 22 to 60 seconds, the
CSV mean is 24.740 mA, median 24.891 mA, minimum 19.608 mA, maximum 25.087 mA,
and standard deviation 0.755 mA. Its first approximately six seconds precede
device startup, so the full-file average is not an idle-current estimate.

At the time of this diagnostic, field VBUS enabled BUCK2 and powered the
RP2040 debugger service domain. The application source has no scheduled
background networking outside a bounded active golfer demand window; the
main, modem-service, and transaction threads otherwise wait on their
synchronization events. The CPO subsequently authorized removing the VBUS
dependency; the BUCK2 correction and its validation are recorded below.

The normal Increment 1.0 image was rebuilt after removing the temporary
diagnostic instrumentation and independently verified for FRB-0005 identity;
SHA-256
`e241bc7d32dd45f2c3b86832a00e1475f56d3ed389367673213deba3b78e1f5c`.
After the CPO confirmed field power and PPK2 were disconnected and USB service
power was connected, the complete image was programmed with
`probe-rs download --chip-erase --allow-erase-all --verify`; probe-rs reported
the target locked, initiated erase-all, and completed programming and
verification in 31.47 seconds. `probe-rs reset` then succeeded. This normal
Increment 1.0 image is now the last image confirmed programmed to FRB-0005.
Field-powered request behavior and PPK2 current were not retested after this
restoration.

### FRB-0005 Low-Power Increment 2.0 — CPO acceptance and closeout record

Increment 2.0 builds on the published Increment 1.0 source checkpoint
`cd9d0831aa2b6494c54d7ef138dafc7039664c57` on branch
`review/frb0005-increment-1.0-source-checkpoint-20261105`. Its five-file
firmware delta and two owner-document updates were published together at
checkpoint `1a937562f8025cea13e5c9ce7c92a1fca4dacb88` on that review branch.
The firmware delta is:

- `samples/fairway_power_sandbox/src/button_ux.c` and `button_ux.h` add a
  checked read of the PV8 state at boot to select normal or service mode.
- `samples/fairway_power_sandbox/src/main.c` initializes the button before
  power policy, selects service mode from the held-at-boot button, and in
  service mode keeps the debugger rail on without starting modem or golfer
  runtime. Normal button/request orchestration is otherwise unchanged.
- `samples/fairway_power_sandbox/src/power_policy.c` and `power_policy.h`
  remove VBUS sensing and callbacks. The power-policy owner disables BUCK2
  for normal operation and enables it only for explicit service mode.

There are no Increment 2.0 changes to `modem_service.c/.h` or to the
interaction-awake keeper. The published checkpoint already contains the
CPU-awake correction: no unconditional VBUS hold prevents CPU idle/WFI outside
bounded interactions. It also contains modem-service-owned LTE PSM requested
independently of VBUS. Increment 2.0 changes neither behavior. In the current
source, VBUS does not control CPU idle, PSM, or BUCK2; only the held-at-boot
PV8 service-mode choice enables the debugger rail. No golfer protocol,
transaction scheduling, HTTPS, LED implementation, demand-window, or COMPLETE
implementation was changed.

The low-power correction removes VBUS detection and VBUS callbacks from
`power_policy`. Normal operation disables the nPM1300 BUCK2 debugger service
rail irrespective of VBUS. To preserve deliberate development access, holding
the PV8 button through boot selects service mode: BUCK2 remains enabled and
the modem/golfer runtime does not start. Outside that mode, the existing
bounded golfer interaction-awake hold remains unchanged, CPU idle/WFI remains
available, and modem-service continues to own LTE PSM independently. The
button, HTTPS, LED, demand-window, and COMPLETE protocol implementations were
not changed.

The device-specific build used NCS 3.1.1, Nordic toolchain `561dce9adf`,
West 1.4.0, board
`circuitdojo_feather_nrf9151@1/nrf9151/ns`, `prj_a.conf`, and the established
FRB-0005 builder/verifier and protected device-specific provisioning input.
Artifact:
`/Users/DuplexLoop/fairway-builds/fairway-FRB-0005-lowpower-buck2-20261105-2340/fairway-FRB-0005-merged.hex`,
521,204 bytes, SHA-256
`e051d16bfd3901dcc7e99f040f1a7c01bf01164ec1be30600c559fc108c35e90`.
The manifest records source commit `cd9d0831aa2b6494c54d7ef138dafc7039664c57`,
and the dirty source tree.
Artifact identity and embedded credential verification passed. Builder
regression tests passed 30/30 and the COMPLETE/demand-window host suite passed
16/16. The known-working recovery image remains preserved at
`/Users/DuplexLoop/fairway-builds/FRB-0005-https-recovery-20261105-1639/fairway-FRB-0005-merged.hex`,
SHA-256
`d6cb053267f390b7158d731f182c0339b98e5b775568406806b24a26f58b0213`.
The build emitted the standard NCS Kconfig warnings and MCUboot default debug
signing-key warning. This is a development-validation image, not a production
release or production-signing qualification.

The manifest records `source_worktree_dirty=true`; its source fingerprint is
`f991ec4dd8a62d465fff01371fe0a14e66ec8f3d56f9a78285879906df164a96`.
The current application/board source tree was re-fingerprinted and matches
this manifest value exactly. Unlike the earlier Increment 1.0 fingerprint
recorded above, this Increment 2.0 fingerprint is reproducible from the
current application/board tree: the two HEX files named in the Increment 1.0
record are no longer present under `samples/fairway_power_sandbox/artifacts/`.
The builder hashes all regular files under the application and `boards/`,
including ignored files if present, while excluding secrets and build
directories. The seven-file Increment 2.0 source/documentation checkpoint is
published at `1a937562f8025cea13e5c9ce7c92a1fca4dacb88`. Building for FRB-0005
also requires authorized access to its protected, untracked credential input.
The manifest records that input's filename and successful embedded-input
verification without exposing the credential.

After the CPO confirmed USB service power only, the complete image was
programmed using probe-rs erase-all, full-image programming, read-back
verification, and reset. The operation completed successfully in 30.83
seconds. After normal boot, the CMSIS-DAP debugger disappeared from USB and
`probe-rs list` found no probes, consistent with BUCK2 powering down the
debugger service domain. This establishes the expected debugger power-state
change in that normal-mode observation.

On 2026-11-06, the CPO physically confirmed service-mode entry by holding PV8
through USB-powered boot. The CPO observed no LED activity, consistent with
the service-mode path disabling golfer runtime and indicators. `probe-rs list`
detected a CMSIS-DAP probe at VID:PID `2e8a:000c`, serial
`E66550A147969135`; macOS USB enumeration independently showed a
`Debug Probe (CMSIS-DAP)` with the same VID:PID and serial. This matches the
previously recorded FRB-0005 debugger identity. No reset, erase, unlock, flash,
or recovery operation was performed. Probe enumeration confirms USB probe
availability and identity, but does not establish successful target
identification or target programming in service mode. The earlier complete
Increment 2.0 image installation and read-back verification are recorded
separately above.

After disconnecting USB and restoring field power, the CPO confirmed that the
golfer button operated normally and a request successfully reached the Cart
Operator UI. The CPO accepts FRB-0005 Increment 2.0 as closed. This physical
return validates normal request operation after the observed service-mode
cycle. The precise Increment 2.0 golfer LED sequence and one-request
correlation evidence were not separately captured in the engineering record.
Current normal boot and LTE registration logs were not captured after BUCK2
shutdown; successful field request delivery is the direct end-to-end evidence
that the necessary connectivity worked for that request.

The first CPO-supplied field-power PPK2 capture,
`/Users/DuplexLoop/Downloads/2point0 5min.csv`, has 30,001 samples at 100 Hz
over 300 seconds; SHA-256
`fb19cb7e8029aa3f853c6328b3ad1d8d4a0c4831432dd48b7e990d427bc07268`.
All digital channels were zero. Full-capture mean was 9.215 mA, median
4.131 mA, minimum 2.488 mA, maximum 81.259 mA, and standard deviation
8.933 mA. During seconds 10–300, mean was 8.861 mA and median was 3.992 mA;
about 20.9% of those samples exceeded 20 mA. The trace contains recurring
multi-second high-current periods, so its full mean is not a clean
steady-idle estimate. The low baseline is substantially below Increment
1.0's 25.168 mA mean, but the capture is not directly duration- or
state-matched to that result.

During the subsequent five-minute capture, the CPO-provided live PPK2 screen
showed 3.46 mA window average and 3.73 mA maximum at approximately 86.8
seconds. The CPO confirms these were the steady-state readings and that the
remaining interval did not change. The screenshot is a CPO-confirmed
observation, not a complete exported dataset; no raw export for this second
interval is available. The CPO reports Increment 1.0's 25.168 mA baseline was
measured under the previously confirmed measurement configuration. The
3.46 mA reported settled-current average is a 21.708 mA (86.3%) reduction
from that baseline. This settled interval is distinct from the first capture's
burst-containing five-minute measurement; the two capture means should not be
conflated. The CPO accepts the settled-current result. Do not infer CPU or
modem sleep residency from these current measurements.

The BUCK2 power-state change is confirmed by the loss of CMSIS-DAP enumeration
in normal mode; service-mode probe enumeration and return to normal field
request operation were physically confirmed by the CPO. CPU sleep residency
and actual modem PSM residency remain unverified. The host suite validates
COMPLETE/demand-window module behavior, but a field COMPLETE interaction and
five-minute demand-window behavior were not demonstrated for Increment 2.0.
The precise golfer LED sequence was not captured. Service-mode target
identification and target programming were not tested. The second PPK2
interval has no raw export, so the 3.46/3.73 mA values cannot be recomputed
from samples.

Circuit Dojo's [nRF9151 Feather low-power report](https://www.circuitdojo.com/posts/chasing-microamps-nrf9151-feather-active-sleep)
describes a regulator reference-counting concern associated with a low-VBAT
power-failure event that may prevent `regulator_disable()` from actually
turning BUCK2 off. This remains a future robustness risk, not an observed
FRB-0005 defect; see `docs/FIRMWARE_SPECIFICATION.md`. No further
investigation or implementation is implied by this closure.

### USB/VBUS Service-Mode Debug and Recovery Evidence

Historical Fairway firmware prevented Zephyr idle/WFI while USB/VBUS was
present to protect debugger access on Errata-36-family silicon. Increment 0.5
removes that unconditional CPU-awake behavior while preserving BUCK2 and the
board startup initialization. Use the programming and recovery procedure
above; do not infer permanent non-destructive debugger access from the startup
delay.

A bounded investigation into a separate field→USB debug-access gap (probe-rs access unavailable after actual field-powered operation, before USB was reconnected) found that a Fairway-owned TF-M secure-service reapply mechanism does not close this gap: it was implemented, built, and hardware-tested, and failed its physical acceptance criterion even after separately confirming `UICR.APPROTECT`/`UICR.SECUREAPPROTECT` were provisioned `HwUnprotected` on the test device. That experimental implementation has been fully removed from the codebase and is not current firmware architecture.

#### Historical Non-Destructive Service-Entry Validation

Historical CPO-confirmed validation found that a physical RESET press after
USB service entry could restore Memory AP access on two tested instances.
This remains useful diagnostic context, but is not a prerequisite or
replacement for the programming/recovery procedure above:

1. Connect USB using the installed generation's safe power-isolation procedure in `docs/HARDWARE_ASSEMBLY_GUIDE.md`: for Prototype 3.3, disconnect V25/V50/V75 field power first. The 6106/J4 isolation instruction applies only to the historical 3.2 architecture; its solar/LiPo side may remain connected to the 6106 when following that historical procedure.
2. Attempt the normal `probe-rs` operation (for example `probe-rs reset --chip nRF9151_xxAA`).
3. If the established AP/DRW access fault occurs (for example "Failed to read register DRW"), press the Circuit Dojo nRF9151 Feather physical RESET button once.
4. Verify recovery using a non-resetting check rather than another reset, for example:

```sh
probe-rs info --chip nRF9151_xxAA
```

A successful CoreSight/AP walk (including the AP that previously faulted)
confirmed recovered access in those tests.

Do not repeatedly issue `probe-rs reset` solely to test whether access has
recovered; use the non-resetting check in step 4 instead. If access remains
unavailable, use the established programming/recovery procedure above.

These tests required no erase, reflash, or UICR modification during
service-entry troubleshooting. They do not establish non-destructive debug
access after every field-to-USB cycle.

An earlier FRB-0005 validation record documents use of the recovery utility's
`--unlock-only` command before probe-rs programming. That is historical
evidence only; it is not the current procedure and does not establish that the
utility is appropriate for every access fault. Use the complete-image
probe-rs erase-all, program, and verify procedure above. Do not substitute the
recovery utility for that procedure.

#### USB Runtime UART Console — Verified Development Connection

The CPO confirmed on 2026-11-05 that the Feather's existing single USB
development connection is the authorized runtime-diagnostics connection; no
additional UART cable or hardware modification is required. A live FRB-0005
capture verified that this connection exposes the firmware's Zephyr console
through the CMSIS-DAP probe's USB CDC-ACM interface.

The verified console configuration is `uart0`, selected by
`zephyr,console` in the board DTS and enabled by `CONFIG_UART_CONSOLE` and
`CONFIG_LOG_BACKEND_UART` in `prj_a.conf`. The board pin configuration is
UART0 TX P0.11 / RX P0.10; the console is 115200 baud, 8 data bits, no parity,
1 stop bit, with hardware flow control disabled. Modem trace uses the separate
UART1 at 1,000,000 baud and is not the Zephyr log console.

Identify the interface on each connection; do not rely on an old numeric port
suffix:

1. Run `system_profiler SPUSBDataType -detailLevel full` and identify the
   Raspberry Pi `Debug Probe (CMSIS-DAP)` by its USB serial number. For FRB-0005
   the verified serial is `E66550A147969135` (VID:PID `2e8a:000c`).
2. Run `ioreg -r -c AppleUSBACMData -l -w0`. Select the CDC-ACM data interface
   whose VID:PID is `11914:12` (hex `2e8a:000c`), then map its `IOTTYSuffix` to
   `/dev/cu.usbmodem<SUFFIX>`. In the verified session this was
   `/dev/cu.usbmodem1102`. The other two `/dev/cu.usbmodem...` nodes were the
   Nordic PPK2 (VID:PID `1915:c00a`, serial `DE864DA734D0`) and are not the
   target console. Host suffixes are ephemeral.
3. Open only the port mapped to the identified probe. A tested capture used
   Python's standard-library `termios` at 115200 baud in raw mode, writing the
   unmodified bytes to a newly created mode-0600 log outside the repository.
   The following equivalent capture loop uses no extra package; Ctrl-C closes
   the log and port:

   ```sh
   PORT=/dev/cu.usbmodem<SUFFIX>
   LOG="$HOME/fairway-builds/FRB-0005-runtime-$(date +%Y%m%d-%H%M%S).log"
   python3 - "$PORT" "$LOG" <<'PY'
   import os, select, sys, termios, tty

   fd = os.open(sys.argv[1], os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
   tty.setraw(fd)
   attrs = termios.tcgetattr(fd)
   attrs[4] = attrs[5] = termios.B115200
   attrs[2] &= ~(termios.CSIZE | termios.PARENB | termios.CSTOPB)
   attrs[2] |= termios.CS8 | termios.CLOCAL | termios.CREAD
   if hasattr(termios, "CRTSCTS"):
       attrs[2] &= ~termios.CRTSCTS
   termios.tcsetattr(fd, termios.TCSANOW, attrs)
   log = os.open(sys.argv[2], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
   try:
       while True:
           ready, _, _ = select.select([fd], [], [], 1.0)
           if ready:
               data = os.read(fd, 4096)
               if data:
                   os.write(log, data)
                   os.write(1, data)
   except KeyboardInterrupt:
       pass
   finally:
       os.close(log)
       os.close(fd)
   PY
   ```

The 2026-11-05 FRB-0005 capture established this as a working runtime console.
One button event was detected; DNS resolved the production receiver hostname
to `34.143.78.2`; the TLS connect/handshake returned `-116` (`ETIMEDOUT`)
after the transaction's approximately 15-second attempt budget; the
application entered `STATE_FAILURE` and then `STATE_IDLE`. The firmware did
not log a successful socket connection or HTTPS request send. The capture
started after boot, so it did not establish modem initialization or LTE
registration state. A normal probe reset could not be used to capture startup:
`probe-rs` reported the core locked and requested `erase_all`; no erase or
recovery was performed. Cloud Run log correlation was unavailable because
the local `gcloud` session required interactive reauthentication. The
corresponding Cart Operator queue remained empty. This proves a TLS handshake
timeout as the first observed transaction failure, but does not establish
whether its underlying cause is radio/link quality, modem state, transport
behavior, or receiver-side connectivity.

Historical note: the earlier WP4 investigation found no readable console in
the interfaces it tried at that time. That evidence is retained as a record of
those attempts; it is superseded for the CPO-confirmed FRB-0005 single-USB
development connection by the device-identified, readable capture above.
Never hunt-and-peck across unrelated serial nodes or baud/framing combinations;
identify the CMSIS-DAP parent and console interface as described here.

#### Functional Validation Evidence Rule

UART/serial logs are useful diagnostic evidence but are NOT automatically a required gate for Fairway end-to-end functional validation when the required behavior can instead be established directly through CPO-observed physical device behavior, authenticated Cloud Run traffic, Firestore state/history, operator-dashboard behavior, and timing evidence. Do not block a functional validation campaign solely because UART logging is unavailable when those other evidence sources can establish the acceptance criterion. UART becomes necessary when the specific question requires internal device state that cannot be established externally. This does not permit unsupported inference: each acceptance criterion must still be supported by direct evidence, whether that evidence is UART-based or externally observed.

---

## Backend Deployment

Current Backend Deployment Facts:

- Runtime libraries indicate Node.js function-style service using @google-cloud/functions-framework.
- Documented deployed service name: fairway-button-receiver
- Documented deployed URL: https://fairway-button-receiver-936892386735.us-central1.run.app
- Button-event ingestion currently enforces `X-Fairway-Device-Key` authentication, verified per-device against each claimed device's own stored SHA-256 verifier (see `docs/DEVICE_PROVISIONING_GUIDE.md`, "Credential Architecture"); this is not a single fleet-wide shared key. The obsolete fleet-wide `FAIRWAY_DEVICE_KEY` Cloud Run environment variable has been removed following WP3 per-device credential validation.
- The deployed backend requires a Firebase bearer ID token on operator mutations, verifies it with Firebase Admin, and records the verified UID as `operator_id`. The active Cart Operator workflow has no CONFIRM interaction; COMPLETE, Cancel, Suspend/Resume, and dashboard-summary calls require the current server-side user-access entitlement. Production and sandbox use schema-v2 `user_access` authorization with `admin` and Customer/Course settings. Firebase custom claims do not grant Admin access. The Admin API returns HTTP 403 before protected reads or writes for authenticated non-admins.
- Backend request parsing currently accepts compatibility aliases/defaults (`device_id` or `device`, `event_type` or `event`, with defaults when absent) beyond the canonical payload contract; formal acceptance or removal of this behavior remains unresolved.
- Supported request routes:
  - POST /
  - POST /api/v1/button-events
  - POST /api/v1/requests/{requestId}/confirm
  - POST /api/v1/requests/{requestId}/complete
  - POST /api/v1/device-commands/poll
  - POST /api/v1/device-commands/{commandId}/ack
  - GET /api/v1/operator/bootstrap
  - POST /api/v1/operator/push-subscriptions
  - POST /api/v1/requests/{requestId}/cancel
  - GET /api/v1/operator/dashboard
  - POST /api/v1/operator/service/suspend
  - POST /api/v1/operator/service/resume

### Backend release procedure

Before deploying, obtain approval for the specific service and source
revision. Confirm the production project, region, service name, currently
serving revision/image digest, runtime identity, environment configuration,
and traffic allocation. Do not print secret environment values. Run the
backend tests against the reviewed source:

```sh
npm --prefix fairway_backend/cloudrun_receiver test
```

The repository package defines tests but no deployment script. The established
Cloud Run deployment commands below explicitly name each service, project,
region, source directory, and function target; run them from the repository
root only after independent review and separate authorization:

```sh
gcloud run deploy fairway-button-receiver --project=savvy-kit-496703-r5 \
  --region=us-central1 --source=fairway_backend/cloudrun_receiver \
  --function=fairwayButtonReceiver --quiet
gcloud run deploy fairway-admin --project=savvy-kit-496703-r5 \
  --region=us-central1 --source=fairway_backend/cloudrun_receiver \
  --function=fairwayAdmin --quiet
```

Deploy only the service in the approved scope. Admin-only changes must not
redeploy the receiver; receiver-only changes must not redeploy Admin. After
deployment, verify the new revision is Ready, the intended revision receives
the approved traffic share, the image digest and non-secret configuration
match the release record, and service-specific health/authentication checks
pass. Use designated test identities and avoid creating production requests,
credentials, or device traffic as smoke tests. Stop if a service target,
runtime identity, traffic allocation, or behavior differs from the approved
plan.

The Option C production rollout on 2026-10-01 deployed receiver revision
`fairway-button-receiver-00019-c8h` and Admin revision
`fairway-admin-00008-sjt`, each ready with 100% traffic and its prior runtime
identity preserved. Before activation, Tony Lema Course was migrated with an
explicit Course-local `service_schedule` covering Sunday through Saturday,
10:00–19:00 in `America/Los_Angeles`. The migration used a one-field update
mask; the normalized non-schedule Course fingerprint remained
`078fe6c87dc2e8532fd169d5edc184a20304d600130d57775a2c04647e6d7d19`.

The validated backend production deployment commands are:

```sh
gcloud run deploy fairway-button-receiver --project=savvy-kit-496703-r5 \
  --region=us-central1 --source=fairway_backend/cloudrun_receiver \
  --function=fairwayButtonReceiver --quiet
gcloud run deploy fairway-admin --project=savvy-kit-496703-r5 \
  --region=us-central1 --source=fairway_backend/cloudrun_receiver \
  --function=fairwayAdmin --quiet
```

### Cart Operator Web Push

The production Cart Operator notification path uses the standards-based Push
API, Notifications API, a root service worker, and VAPID. It does not use FCM,
a native application, Apple ID addressing, or an Apple account as a push
destination.

- `user_access/{uid}` is the server-owned schema-v2 entitlement. `admin: true`
  grants global access; otherwise `customer_id` and `course_ids` scope Cart and
  Inventory. Empty `course_ids` means all Courses belonging to that Customer.
  Legacy/unversioned records and separate Operator assignments do not grant
  runtime access.
- `course_push_subscriptions/{courseId}/subscriptions/{subscriptionId}` stores
  endpoint and encryption material server-side. Browser bootstrap responses are
  redacted and never return stored subscription secrets.
- `notification_dispatches/{requestId}/subscriptions/{subscriptionId}` records
  deterministic delivery state. Request-created trigger retries cannot produce
  a second dispatch for an already accepted request/subscription pair.
- The `fairway-request-notifier` generation-2 function runs in `us-central1` and
  is triggered from Firestore events in `nam5`. The trigger identity is
  `fairway-notifier-trigger@savvy-kit-496703-r5.iam.gserviceaccount.com`; it has
  Eventarc receiver permission and service-level invoke permission only on the
  notifier. The sender identity is
  `fairway-notifier-prod@savvy-kit-496703-r5.iam.gserviceaccount.com`; it has
  Firestore access and Secret Manager access only to the private VAPID key.
- The VAPID private key is stored in Secret Manager. The public key and key
  version are supplied through operator bootstrap and may be present in public
  client configuration.
  - `user_notification_preferences/{uid}/courses/{pairId}` stores each user's
    explicit enable/disable choice independently for each authorized
    Customer/Course pair. `pairId` is the SHA-256 digest of the JSON pair
    `[customer_id, course_id]`; the document also stores both IDs. The former
    Course-ID-only preference is read only when that Course ID is unambiguous
    across the user's authorized Courses. Browser notification permission and
    installed-app support are separate device conditions, not substitutes for
    the saved preference.
  - Current repository source rechecks the subscriber's active
    `user_access/{uid}` entitlement and the current Customer/Course preference.
    Revoked access or an explicit disabled preference excludes a subscription
    even while its stored push endpoint remains active. Existing active
    subscriptions without a preference retain their prior enabled behavior
    until the user changes the choice. These checks are covered by backend
    tests; the production notifier remains on its earlier deployed revision and
    does not yet enforce the new preference behavior.
  - Push delivery runs asynchronously from request creation; delivery failure
    does not affect Cart request persistence or operator access.
  - The existing notifier function is production-only and validates the
    production project ID. Sandbox has no notifier/VAPID delivery deployment;
    delivery-time preference and entitlement filtering is therefore validated
    by backend tests, not by a sandbox Web Push delivery.
- Firestore document events are delivered as `application/protobuf`; the sender
  obtains the request document path from the CloudEvent `subject` envelope.

WP5 admin routes (implemented, test-verified, and deployed to the isolated sandbox and dedicated production Admin service):

- `GET /api/v1/admin/fleet`
- `GET /api/v1/admin/devices/{deviceId}/health-history`
- `GET /api/v1/admin/export/device-sim`
- `POST|PATCH /api/v1/admin/customers...` for Customer/Course creation and configuration
- `POST /api/v1/admin/devices` for permanent-ID allocation and one-time credential issuance; this retains the established request contract and has no automatic provisioning-request idempotency or duplicate prevention. If the outcome is uncertain, inspect the authoritative Device registry before another provisioning request.
- `POST /api/v1/admin/devices/{deviceId}/credential-recovery` to issue or replace the credential on that exact in-inventory Device record without changing its permanent ID, assignment, or history
- `PATCH /api/v1/admin/devices/{deviceId}/{assignment|state|metadata}`; metadata permits only SIM association and comments after provisioning
- `POST /api/v1/admin/devices/{deviceId}/{service|commission}`

The Admin UI calls these backend routes with the current Firebase ID token. It does not read or write fleet collections directly, and the repository Firestore rules continue to deny browser access to those collections. Admin responses redact credential verifier digests; new-device provisioning returns the plaintext credential only in the one successful creation response.

#### Admin User Management Directory Contract

- `GET /api/v1/admin/users` is restricted by the existing global-Admin
  authorization guard. The Admin backend enumerates Firebase Authentication
  pages with the Firebase Admin SDK and reconciles them by UID against
  `user_access/{uid}`. Browser code does not enumerate Authentication users or
  read the access collection directly.
- The complete response retains the `users` property and includes
  `complete: true` and `next_page_token: null`. Each row reports `PROVISIONED`,
  `NOT PROVISIONED`, `CONFIGURATION ERROR`, or `ORPHANED RECORD`, along with
  validated schema-v2 authorization metadata when available. `access_record_present`
  and `access_record_valid` distinguish missing, valid, and invalid records;
  an orphan with invalid access remains classified as orphaned and has
  `access_record_valid: false`.
- Directory reconciliation performs reads only. It never creates, updates,
  repairs, or deletes Auth identities or `user_access` records. Authentication
  pages, the merged entry count, and the serialized response are bounded at
  10,000 entries and 8 MiB. If enumeration fails or a bound is exceeded, the
  endpoint returns HTTP 503 with an explicit error and no partial directory.
- `PUT /api/v1/admin/users/{uid}/access` remains the explicit access-write
  operation. It requires an existing Firebase Authentication UID and retains
  schema-v2, Customer/Course, protected-System-Administrator, and
  last-administrator validation. It does not create an Authentication account.
- The complete-directory behavior is deployed to WP5 sandbox Admin revision
  `fairway-admin-sandbox-00012-zr2` and production Admin revision
  `fairway-admin-00016-fs9`; automated coverage passed. Production authenticated
  retrieval returned `complete: true` with four entries (three provisioned and
  one not provisioned). The CPO accepted the production behavior and the
  Customer/Course user workflow on 2026-10-13. Orphan-record cleanup is deferred
  until after the Monarch Bay pilot; no pilot-blocking User Management work
  remains.

The command routes use the existing per-device `X-Fairway-Device-Key` authentication. COMPLETE transactionally creates one deterministic per-device command correlated to the originating request; poll returns only the exact active, pending, unexpired command, and acknowledgement transactionally rechecks backend-owned expiry while preserving idempotent replay of an already-acknowledged command. The demand-window query requires the repository-controlled composite index in `fairway_webapp/cart_operator_dashboard/firestore.indexes.json`. The backend, dashboard, and index were deployed and validated during Stage B2; FRB-0002 acknowledged an exact correlated COMPLETE and ended its local demand window early.

On 2026-10-06, receiver revision `fairway-button-receiver-00022-wxk` was deployed (100% traffic, logging-only, no behavior or response-shape change) adding structured correlation logging to the COMPLETE command routes. Prior to this, `pollDeviceCommand` and `acknowledgeDeviceCommand` returned an identical response for every non-match reason with zero logging, making it impossible to tell from Cloud Run logs alone why a demand window expired without an acknowledgement. The deployed logging emits:

- `COMPLETE command correlation` — on every Complete-click command-creation attempt (`request_id`, `command_id`, `device_id`, `created` true/false for the idempotent-skip case).
- `COMPLETE poll correlation` — on every device poll, with `reason` one of `request_not_found`, `request_device_mismatch`, `no_command_doc`, `status_<status>`, `expired`, `field_mismatch`, or `matched`.
- `COMPLETE ack correlation` — on every device acknowledgement, with `reason` one of `not_found`, `mismatch`, `expired`, or `acknowledged`.

This closed a diagnostic gap found while investigating FRB-0002 demand windows that polled reliably (internal gaps never exceeding ~53 seconds across dozens of polls) for up to the full window but expired with no acknowledgement ever recorded; root cause is not yet established, see `docs/feature_backlog.md`.

Operational lesson (established during WP3 per-device credential deployment): read-only Cloud Run inspection commands (for example `gcloud run services describe`) return full container environment variable values, including secrets, unless the output is field-restricted. Always use a field-restricted `--format=value(...)` (or equivalent) query that excludes environment variable values when inspecting a service that may hold secret-bearing configuration; only request variable names, never values, unless a value is explicitly required and authorized.

Deployment process status:

The source-deployment commands above are production-validated. No automated
repository CI deployment pipeline is currently established.

### Backend Deployment Validation

Backend deployment validation is scoped to the backend being changed. It
includes service health, expected authentication/authorization responses, and
request persistence behavior where applicable. WP3 validated per-device
authentication and creation of exactly one correctly attributed FRB-0001
request through a physical button press. It did not independently visually
validate the operator webapp or its request-action flow.

---

## Web Application Deployment

Repository-Derived and Historical Web Deployment Facts:

- Web app source path: fairway_webapp/cart_operator_dashboard/
- Production build command: npm run build:production
- Sandbox build command: npm run build:sandbox (package.json)
- Sandbox local dev command: npm run dev:sandbox (package.json)
- Production Hosting config: `firebase.json`, with explicit site
  `savvy-kit-496703-r5`, `public: dist`, and SPA rewrite to `/index.html`.
- Sandbox Hosting config: `firebase.sandbox.json`, with explicit site
  `fairway-refresh-sandbox-260930` and the same `dist` SPA content.
- Primary production application origin: `https://app.fairwayrefresh.com`
- Firebase Hosting origin: `https://savvy-kit-496703-r5.web.app`
- First-class entry routes:
  - `https://app.fairwayrefresh.com/admin` for authorized Admin users
  - `https://app.fairwayrefresh.com/` and `/requests/{requestId}` for
    authorized users; customer users require their assigned Course scope
  - `https://app.fairwayrefresh.com/inventory` for the Inventory feature within
    Cart UI, using the same global or Customer/Course entitlement
- Firebase Authentication sessions are shared across routes, but each route
  uses the authoritative schema-v2 `user_access/{uid}` record; Admin entry
  requires `admin: true`, while customer routes require global Admin access or
  a valid Customer/Course assignment.
- Sandbox Hosting deployment (run from `fairway_webapp/cart_operator_dashboard/`):
  - `npx firebase-tools deploy --config firebase.sandbox.json --only hosting --project fairway-refresh-sandbox-260930 --non-interactive`
- Production Hosting deployment (run from `fairway_webapp/cart_operator_dashboard/`):
  - `npx firebase-tools deploy --config firebase.json --only hosting --project savvy-kit-496703-r5 --non-interactive`
- Always pass the explicit config, project, and `--only hosting`. The production
  config pins the production site; the sandbox config pins the sandbox site.
  The production command deploys only `dist` Hosting content and does not
  deploy the Firestore rules/indexes also declared in `firebase.json`, Functions,
  or other Firebase resources.

### Production Hosting release integrity

Firebase Hosting publishes a complete snapshot of the configured `public`
directory; for this application, that directory is `dist`. A Hosting-only
deployment limits which Firebase product is deployed. It does not merge only
changed application files or preserve live files omitted from the candidate
artifact.

Before recommending a production Hosting deployment:

1. Identify the accepted live production release and the complete affected
   deployment boundary.
2. Assemble a complete, reproducible candidate artifact from controlled
   inputs. Required production assets must be part of those controlled inputs;
   they must not depend on implicit carry-forward from Hosting or on
   unversioned local or session-only files. Establish candidate completeness
   from accepted, version-controlled source inputs and their build checks before
   considering the live production inventory.
3. As secondary drift detection, compare the candidate against the complete
   live production file inventory by path and content hash. Report every
   addition, modification, and removal. Live files may expose a discrepancy
   and block release, but must never be copied into or used to assemble the
   candidate.
4. Block deployment when a required existing resource would be removed or
   modified outside the explicitly authorized scope.
5. Provide the complete production delta, artifact identity, preservation
   invariants, validation evidence, and verified recovery release to the Lead
   Architect for independent review. Obtain separate CPO authorization for
   production deployment.
6. Deploy the exact reviewed artifact. Do not rebuild it or substitute another
   artifact between review and deployment.
7. Verify the resulting live release identity, intended feature behavior, and
   preservation of unrelated production resources. Retain the verified
   previous release identity for recovery; use the supported Hosting Release
   history rollback procedure when restoration is required.

Candidate completeness is established upstream from controlled source, not
reconstructed from live Hosting. The production frontend build verifies that
the version-controlled Driving Range sign assets match the accepted mapping,
installation PDF, complete file count, and content fingerprint; an incomplete
or altered asset set fails the build before deployment. Live comparison remains
a secondary drift and preservation check only. Passing this build check does
not itself authorize deployment or replace independent Lead Architect review,
separate CPO authorization, exact-artifact deployment, and post-deployment
verification. The documented Hosting command remains the deployment
mechanism, not evidence of authorization.

### Hosting release procedure

Obtain approval for the exact Hosting site, source revision, and release
contents. From the repository root, run the focused frontend tests and
production build:

```sh
npm --prefix fairway_webapp/cart_operator_dashboard test
npm --prefix fairway_webapp/cart_operator_dashboard run build:production
```

The build script runs `validate:production` before Vite builds `dist`. Review
the build output and confirm the production configuration before deployment.
Then run the production Hosting command from
`fairway_webapp/cart_operator_dashboard/`:

```sh
npx firebase-tools deploy --config firebase.json --only hosting \
  --project savvy-kit-496703-r5 --non-interactive
```

For sandbox, substitute `firebase.sandbox.json` and
`fairway-refresh-sandbox-260930`; never omit explicit config, project, or
resource selector. Do not deploy Firestore rules/indexes or backend services
with a Hosting-only release. After release, verify the live site/release ID,
SPA routes, loaded assets against the approved build, unauthenticated entry
behavior, CORS/API target, and relevant authenticated workflows with
designated test users. A successful build or HTTP 200 response does not prove
authenticated workflow acceptance or physical-phone usability. The latest
mobile release evidence and its unperformed authenticated phone/Safari checks
are recorded at the top and in the Alignment Register.

Deployment process status:

Repository-controlled artifacts define web build behavior and the production
Hosting config/targeting was validated on 2026-10-13. A production
Hosting-only release was subsequently recorded on 2026-10-15, with deployed
assets matching the validated build. The exact Firebase CLI version used is
not recorded. Sandbox Hosting remains separately targeted.

Deployment Verification:

- The full-surface logged-out entry cleanup deployed Hosting asset
  `assets/index-DXzzUJ_N.js` (SHA-256
  `e7b45ecd4b8b495a63951fafa5c86e4dbb21ee94f5c12d95e294c304d17e47ea`).
  The custom-domain and Firebase Hosting copies were byte-identical to the
  validated local production build. `/`, `/admin`, a request deep link, the
  manifest, and the service worker returned `200`. Isolated logged-out
  production inspection confirmed no simulated phone shell or horizontal
  overflow at 1440x900, 1024x768, and 390x844; the primary email sign-in
  reached Firebase Authentication, and Admin Login reached `/admin`.
- The redundant operator queue-header cleanup deployed Hosting asset
  `assets/index-ClNsEp5w.js` (SHA-256
  `fb45582f004521105279141e5347b9c0671dc7d229fe9f4f1d8b61e3e8834e7f`).
  The custom-domain and Firebase Hosting copies were byte-identical to the
  validated local production build. `/`, `/admin`, and a request deep link
  returned `200`, and authenticated production inspection confirmed that the
  queue count remains while the duplicate `NEXT REQUEST` and top-level hole
  fields are absent.
- The CPO-accepted Option C rollout deployed Hosting asset
  `assets/index-B-HgnZrQ.js` (SHA-256
  `efcc091e392d4c27db704f17bdf61aae4049a70de70140b258456b4e9d2f7f37`).
  The custom domain and Firebase Hosting copies were byte-identical to the
  validated local production build. `/`, `/admin`, request deep links, the
  manifest, and root service worker returned `200` through
  `app.fairwayrefresh.com`. Authenticated production acceptance established the
  Option C queue, Complete advancing transactions exactly once, guarded Cancel,
  Course schedule display/edit controls, and independent Operator/Admin paths.
  With Tony Lema Course authoritatively suspended, one FRB-0002 press produced
  orange followed by red blink-blink-solid; receiver revision `00019-c8h`
  returned two bounded `503` attempts with explicit service-unavailable logs,
  and no request document was created. Resume then cleared the Course suspension
  and restored Service Active.

- Production Hosting, manifest, service worker, and 180/192/512 icons were verified
  byte-for-byte against the validated production build on 2026-10-01.
- The independent Admin/Operator entry release deployed production asset
  `assets/index-B7nqMQ1i.js` (SHA-256
  `e1ac15b62ccacbea179dd33eb08de943ba90d87e53ebe8f3db3981c10c74716d`).
  The live index and JavaScript were byte-identical to the validated local
  build. Direct `/admin` and `/requests/{requestId}?course=...` requests returned
  the SPA, and browser inspection confirmed role-specific logged-out entry,
  preserved operator deep-link URLs, and no horizontal overflow at a 390 by 844
  viewport. The deterministic frontend test suite passed 7/7 and the
  unchanged backend authorization/receiver suite passed 101/101.
- The initially deployed entry release omitted the imported `X` icon while
  retaining deferred references in Device and Course overlays. Opening either
  overlay therefore raised `ReferenceError: X is not defined` and left only its
  dark backdrop visible. The corrected asset above restores that dependency;
  production Chrome acceptance confirmed that Device and Course overlays open
  normally after the browser loads the corrected bundle.
- Real-account production acceptance confirmed the independent role paths.
  `admin@fairwayrefresh.com` loaded the live fleet from `/admin` with Admin API
  requests and zero operator-bootstrap requests; the same persistent session
  received `Operator course access required` at `/` and returned to `/admin`
  without reauthentication. `josh@fairwayrefresh.com` retained the complete
  `/requests/{requestId}?course=...` URL through sign-in, completed operator
  bootstrap, and rendered the Monarch Bay Cart Operator queue with zero Admin
  API requests; `/admin` then returned `Administrator access is required` with
  zero Admin API and zero operator-bootstrap requests.
- The iPhone Home Screen application was physically validated for authenticated
  queue access, push subscription registration, notification display, and
  notification-click deep linking.

---

## Firestore Configuration

Repository-Derived Firestore Configuration:

- Rules file path: fairway_webapp/cart_operator_dashboard/firestore.rules
- Current rule behavior in repository:
  - requests are readable only when the authenticated UID has a valid
    schema-v2 `user_access/{uid}` record and is global Admin or the request
    matches the record's Customer and Course scope; an empty `course_ids` list
    permits all Courses belonging to that Customer
  - Browser writes are denied by rules
  - Catch-all deny for other document paths

Repository-Derived collection usage in repository code:

- `customers/{CUST-XXXX}` (Customer records)
- `customers/{CUST-XXXX}/courses/{COURSE-XXXX}` (Customer-owned Course records)
- `devices/{FRB-XXXX}` (Device registry, metadata, state-derived communication permission, and credential verifier)
- `counters/CUST`, `counters/COURSE`, and `counters/FRB` (central ID allocation)
- `requests/{requestId}` (request creation, lookup, and status updates)
- `user_access/{uid}` (server-owned schema-v2 Admin/customer-course entitlement)
- `operator_course_assignments/{uid}` and
  `inventory_course_memberships/{uid}` (legacy migration inputs; not runtime
  authorization sources)
- `course_push_subscriptions/{courseId}/subscriptions/{subscriptionId}` (private push subscription material)
- `notification_dispatches/{requestId}/subscriptions/{subscriptionId}` (effective-once dispatch state)

Collection schema is owned by the backend implementation.

Indexes:

- `fairway_webapp/cart_operator_dashboard/firestore.indexes.json` defines the deployed `requests` composite index required by demand-window-aware duplicate suppression (`device_id`, `status`, and `demand_window_expires_at`).
- The CPO_stats_fix branch adds a `requests` composite index on `customer_id`, `course_id`, and `completed_at` for the bounded course-local reporting query. It is deployed and READY in the CPO review sandbox as index `CICAgJim14AK` in `fairway-refresh-sandbox-260930`. This is an additive query index only; it does not migrate or modify records. Verify READY in any separately authorized target environment before deployment.

Firestore rules and indexes are separate production resources. The production
`firebase.json` declares both, but a Hosting-only deploy does not publish
them. Only when a separately reviewed change explicitly includes rules or
indexes, deploy the approved selector from
`fairway_webapp/cart_operator_dashboard/` with an explicit project:

```sh
npx firebase-tools deploy --config firebase.json --only firestore:rules \
  --project savvy-kit-496703-r5 --non-interactive
npx firebase-tools deploy --config firebase.json --only firestore:indexes \
  --project savvy-kit-496703-r5 --non-interactive
```

The sandbox config `firebase.sandbox.json` declares Hosting only; it does not
declare Firestore rules or indexes. For a separately authorized sandbox
rules/index deployment, use `firebase.json` with the explicit sandbox project
and only the approved Firestore selector. Review the exact rules/index diff,
validate against the intended code and data contract, and verify the deployed
resource after change. Do not bundle these selectors into an unrelated
Hosting release. Rules/index deployment does not back up, restore, migrate,
or roll back Firestore documents.

```sh
npx firebase-tools deploy --config firebase.json --only firestore:rules \
  --project fairway-refresh-sandbox-260930 --non-interactive
npx firebase-tools deploy --config firebase.json --only firestore:indexes \
  --project fairway-refresh-sandbox-260930 --non-interactive
```

---

## Device Provisioning Dependencies

Device provisioning procedures are out of scope for this deployment owner document.

Owned by:

- `docs/DEVICE_PROVISIONING_GUIDE.md`

Related planning reference:

- docs/feature_backlog.md

### Existing-Device Credential Recovery

Device identity is the permanent `FRB-XXXX` ID and its existing
`devices/{FRB-XXXX}` record. When a provisioning response leaves the outcome
uncertain, inspect the authoritative Device registry before retrying creation.
If the Device exists, recover that Device; do not delete and recreate it.
Credential recovery retains the same FRB ID and its associations; the
established lifecycle invalidates the superseded credential when replacement
activation commits.

The recovery implementation is scoped to the existing Device and credential
lifecycle records. It does not update historical requests, inventory or
service records, Customer/Course records, or user access. Recovery is distinct
from creating a new Device and from firmware build/deployment. The detailed
eligibility, authorization, response-loss behavior, and operator procedure
are owned by `docs/DEVICE_PROVISIONING_GUIDE.md`.

For active-credential recovery, the backend prepares and activates in
separate Firestore transactions. While a rotation is pending, the
device-level rotation route can return the pending operation ID, which can
then be checked or cancelled through the authorized API. The combined Admin
UI does not expose that operation ID or pending-operation controls. If
activation committed but its response was lost, and the operation ID was not
retained, the device-level pending query cannot establish the completed
operation's result or recover its one-time plaintext credential. Do not retry
Device creation; keep the device offline and follow the provisioning owner's
recovery guidance.

---

## Operational Verification

Current Cart Operator acceptance has no separate CONFIRM interaction. When
full-system or pilot operational validation is authorized, establish each
step:

1. Firmware boots and reaches network-ready state.
2. Device sends request to Cloud Run endpoint.
3. Backend stores request document in Firestore.
4. Operator dashboard receives live request update.
5. COMPLETE succeeds and updates status/removes the active item, with the
   correlated device acknowledgement where applicable. No operator CONFIRM
   action is part of the accepted UI.
6. Cancel remains available with its guard and closes only the request,
   without sending a device command; exercise it only on a separately
   authorized test request.

Full-system or pilot operational validation is complete only after all six
steps succeed. A bounded backend deployment may be validated against its own
approved backend criteria without claiming unperformed Cart UI acceptance.
The six-step sequence above is the current workflow. Historical acceptance
entries below remain dated evidence and do not add steps to this procedure.

The first production Cart Operator Web Push workflow was physically accepted on
2026-10-01, one authoritative request
`clBCgv0UGm9jsBL1DIy6` was persisted at `07:32:36.169Z`; its one active iPhone
subscription dispatch was accepted on attempt 1 at `07:32:36.692Z`, 0.523
seconds later. The CPO observed exactly one visible notification, and tapping it
opened/focused the authenticated application at the actionable Hole 2 request.
A second physical press during the same demand window produced no additional
request or visible notification. The original request remained actionable.

---

## Rollback Procedure

Hosting rollback restores web content only, and Cloud Run traffic restoration
selects a backend revision only. Neither operation restores device firmware or
changes MCUboot's installed, trial, or confirmed image state. Device-side OTA
trial activation, confirmation, and reversion contracts are owned by
`docs/FIRMWARE_SPECIFICATION.md`; this guide's local image verification is not
evidence of physical OTA rollback readiness. Any physical recovery remains
subject to the approved, target-specific procedure and authorization.

### Pilot 1.1 controlled recovery

**Historical release-specific procedure; not exercised, not a current blanket
rollback instruction.** Revalidate targets and compatibility for each newly
authorized release. No production rollback was
performed to prepare this procedure. It is not evidence that the Pilot 1.1
release or any rollback target has been operationally validated.

The targets below are historical to the 2026-10-13 Pilot 1.1 readiness
investigation. Later records show a Hosting release on 2026-10-15 and Admin
revision `fairway-admin-00017-dvk` on 2026-10-17. Do not treat this table as a
current rollback plan; establish the actual release-specific pre-change state
and revalidate every target, digest, retained Hosting version, and data/rules
compatibility before any recovery.

The recorded production pre-release state for the Pilot 1.1 readiness
investigation was:

| Surface | Pre-release target | Recorded immutable identity |
| --- | --- | --- |
| Firebase Hosting live site `savvy-kit-496703-r5` | Version `b0e4564f1de48554` | Confirmed retained in release history after the 2026-10-13 promotion; serves the known-defective pre-release frontend and is an emergency previous-state target only. |
| Cloud Run receiver, `us-central1` | `fairway-button-receiver-00025-mln` | Image digest `sha256:4d51a3835e6293a0f524ac45761926f1d23b4a76baebd33fb9e160ac8b2aa75a`. |
| Cloud Run Admin, `us-central1` | `fairway-admin-00014-8cv` | Image digest `sha256:0841f3bc7cf5e86a131138653d6b710279c05a169c2bdec0e604ff2fbaca4051`. |

These are investigation-time identities, not a guarantee that the targets
remain available or safe. In particular, the pre-release Admin revision
predates the protected-System-Administrator demotion guard. **Do not direct
production Admin traffic back to `fairway-admin-00014-8cv` after deploying the
guard.** A safe Admin rollback target must first be identified and verified to
preserve server-side protected-Admin enforcement and the active authorization
contract. If no such revision is available, stop and escalate; do not trade
away the safeguard to complete a rollback.

#### Pre-release verification gate

Before each release, the release owner must capture the then-current Hosting
version, Cloud Run traffic allocations, revision IDs and image digests, active
security-rule state, and the release's authorization/data compatibility
assumptions. Store this release-specific record with the approved change
evidence. Do not rely on a revision name alone.

Immediately before any recovery:

1. Obtain incident-command and production-change authorization. Confirm the
   project is `savvy-kit-496703-r5`, the intended Hosting site is the default
   site for that project, and the Cloud Run region is `us-central1`. Use a
   second operator to review each target and command.
2. Read current service traffic without displaying environment values:

   ```sh
   gcloud run services describe fairway-button-receiver \
     --project=savvy-kit-496703-r5 --region=us-central1 \
     --format='yaml(status.traffic)'
   gcloud run services describe fairway-admin \
     --project=savvy-kit-496703-r5 --region=us-central1 \
     --format='yaml(status.traffic)'
   ```

3. Confirm each proposed Cloud Run revision still exists, is ready, and has
   the recorded image digest. The format intentionally excludes environment
   variables:

   ```sh
   gcloud run revisions describe fairway-button-receiver-00025-mln \
     --project=savvy-kit-496703-r5 --region=us-central1 \
     --format='value(metadata.name,status.conditions[0].status,spec.containers[0].image)'
   gcloud run revisions describe fairway-admin-00014-8cv \
     --project=savvy-kit-496703-r5 --region=us-central1 \
     --format='value(metadata.name,status.conditions[0].status,spec.containers[0].image)'
   ```

   Compare the reported image digests with the approved release record.
   Do not print or export secret environment configuration.
4. In Firebase Console, open **Hosting & Serverless → Hosting** for project
   `savvy-kit-496703-r5`. Confirm the live site, release history entry, version
   ID, and retained content for the intended Hosting target. Do not assume a
   version remains restorable just because its ID is recorded here.
5. Verify that the target frontend and backend combination is compatible with
   the current Firestore rules and authorization/data state. In particular,
   establish that any records created or changed since release are readable
   and safely handled by the proposed target code. The presence of retained
   legacy fields alone does not prove this compatibility.

If any identity, readiness, digest, traffic, or compatibility check differs
from the approved record, stop and escalate before changing traffic.

#### Recovery sequence

Hosting and Cloud Run traffic changes are separate operations, not an atomic
transaction. Use the release-specific, reviewed order to minimize the interval
in which clients and services are mismatched. The usual frontend recovery is
to restore the pre-release Hosting version first, then move only those Cloud
Run services for which a compatible, security-preserving target has been
verified. Keep the Admin service on a revision that enforces protected
System-Administrator safeguards; the pre-release Admin revision listed above
is not such a target.

For Hosting, use Firebase Console **Release history → Roll back** on the
verified retained pre-release release and confirm that the new live release
points to the expected version ID. Firebase documents this operation in
[Manage Hosting releases and versions](https://firebase.google.com/docs/hosting/manage-hosting-resources).
The documented `firebase hosting:clone` command clones a source channel; it
does not select an arbitrary historical version by version ID, so do not use
it as a substitute for verifying and rolling back the exact release.

For a Cloud Run service with an approved target, route 100% of traffic to that
revision (example for the receiver target above):

```sh
gcloud run services update-traffic fairway-button-receiver \
  --project=savvy-kit-496703-r5 --region=us-central1 \
  --to-revisions=fairway-button-receiver-00025-mln=100
```

Use the same command form for another service only after substituting a
separately approved, ready revision. Do not run the corresponding command for
`fairway-admin-00014-8cv` unless a later independent review establishes that
it preserves the protected-Admin guard and all current authorization
contracts. Confirm the resulting service traffic and active revision with
`gcloud run services describe` before proceeding.

After restoration, run the release-approved health checks for `/`, `/admin`,
Cart deep links, receiver readiness, and the Admin/Cart authorization
bootstrap/API contracts using designated test identities. Confirm that
unauthenticated requests remain denied, an unauthorized course remains denied,
protected Admin demotion is rejected, and permitted Cart operations remain
available. Inventory UI availability may intentionally revert with the
pre-release frontend; inventory documents and other business data must remain
untouched and must be verified through an authorized compatible client before
resuming operations.

#### Data, rules, and stop conditions

Hosting rollback and Cloud Run traffic changes do not roll back Firestore
documents or security rules. Do not restore, delete, migrate, or weaken
Firestore data/rules as part of this procedure. Keep the active rules in place
unless a separate reviewed and authorized recovery explicitly requires a
rules change. If the chosen code cannot operate safely with current records
and rules, stop; escalate for a coordinated, separately authorized recovery
plan.

Stop and escalate if the retained Hosting content is unavailable, a Cloud Run
revision is missing/not ready or has a different digest, the Admin target
cannot preserve protected-Admin enforcement, current data/rules compatibility
is unproven, service health fails after a change, or the rollback would require
an unapproved data, security-rule, account, or infrastructure change. Do not
continue by selecting a merely older revision or by changing production state
outside the approved recovery plan.

---

## Troubleshooting

Troubleshooting procedures are owned by other Source of Truth documents.

References:

- docs/HARDWARE_ASSEMBLY_GUIDE.md
- docs/FIRMWARE_SPECIFICATION.md

Deployment-specific troubleshooting entries should be added here only after they are verified from repository-controlled deployment artifacts.

---

## Notes

Ownership boundaries:

- Hardware: docs/HARDWARE_BOM.md
- Hardware Assembly: docs/HARDWARE_ASSEMBLY_GUIDE.md
- Firmware: docs/FIRMWARE_SPECIFICATION.md
- UX: docs/UX_SPECIFICATION.md
- Device Provisioning: docs/DEVICE_PROVISIONING_GUIDE.md
- Engineering: docs/ENGINEERING_GUIDE.md
- Feature Backlog: docs/feature_backlog.md

---

## Source Provenance

This document was initially reconciled from:

- Repository source code
- Repository configuration
- Historical Working State document

Historical information that has not been independently revalidated is explicitly identified throughout this document.
