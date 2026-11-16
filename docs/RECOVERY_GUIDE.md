# Fairway Refresh Recovery Guide

## Purpose and authority

This is the canonical operational recovery guide for Fairway Refresh digital
systems. Start here during an incident to identify the affected system, choose
a supported recovery path, and verify restoration. The
[Deployment Guide](DEPLOYMENT_GUIDE.md#production-change-safety) owns production
change safety, deployment, release verification and deployment rollback.
Subsystem documents retain implementation, configuration and lifecycle
contracts; their dated execution records are evidence, not competing runbooks.

**Evidence baseline: 2026-11-16.** The Digital Recovery Readiness increment
includes the isolated native restore and the subsequently CPO-authorized
independent recovery project, daily exports, sensitive custody and isolated
recovery verification. The measured capabilities and remaining limits are
recorded below; isolated recovery is not production failover.
Instructions describe how an authorized operation is performed; they do not
authorize production changes, downtime, role grants, record repair, credential
rotation, physical-device work or destructive operations.

## Identify the incident and select the path

First establish the affected environment, actual serving identities, failure
time and scope using the current deployment record and bounded, authorized
reads. Preserve evidence without logging tokens, keys, private subscriptions
or raw Customer data. Protect unaffected resources; do not redeploy the whole
stack because one component fails.

| Observed failure | Recovery path | Evidence classification |
|---|---|---|
| Missing/corrupt Firestore records or history | [Database and historical records](#firestore-database-and-historical-records) | **Verified:** managed backup restored and 4,485 scoped records matched; PITR clone/production reconnection not tested |
| Sign-in succeeds but access is denied, or Auth identities are missing | [Authentication and access](#firebase-authentication-and-user-access) | **Verified:** six production identities recovered in restricted independent Auth with exact UIDs, attributes and password material; production login/cutover not rehearsed |
| Frontend release is broken or missing content | [Hosting and frontend](#firebase-hosting-and-frontend-applications) | **Verified:** retained-version rollback, with historical production evidence; targets must be revalidated |
| Backend release fails while data remains intact | [Cloud Run services](#cloud-run-backend-services) | **Verified:** retained Admin revision restoration; not proof of whole-service or whole-project reconstruction |
| Missing OTA objects or other stored assets | [Cloud Storage](#cloud-storage-assets) | **Verified:** all 11 accepted OTA packages downloaded from independent storage and freshly hash/signature-verified; serving-bucket replacement not performed |
| Authentication/signing/integration configuration is lost or mismatched | [Secrets and integrations](#secrets-credentials-and-external-integrations) | Signing backup custody confirmed; lifecycle operations demonstrated; **gaps:** comprehensive secret restore and total-key-loss recovery |
| Checkout/configuration source is lost | [Source and configuration](#github-source-and-configuration-recovery) | **Verified:** remote fetch and Git object/source integrity; not backup of uncommitted/local-only material |
| Backend is restored but field devices cannot communicate | [Backend-to-device connectivity](#backend-to-device-connectivity) | Authenticated request/COMPLETE demonstrated on specific devices; not blanket fleet recovery evidence |

Use the smallest path that restores the complete affected workflow. Source
rollback restores code, service recovery restores a serving component, and
database recovery restores records: none substitutes for the others.

### Safety and recovery-point selection

Apply [Production Change Safety](DEPLOYMENT_GUIDE.md#production-change-safety)
before any production mutation. Obtain incident-specific authority and have a
second operator review deployment rollback targets/commands as required by the
existing rollback procedure. No instruction here waives separate authorization
for data repair, IAM, secrets, device operations, backup deletion or recovery
database deletion.

Preserve permanent Customer, device, menu/QR and request identities and all
inventory, service, shift, sales, audit, access and idempotency history. A
snapshot predating an incident may also predate legitimate activity. Never
overwrite newer records, reactivate old credentials, replay requests or restore
balances from an old plan without explicit, reviewed reconciliation authority.
If the failure window, source identity or safe destination is uncertain, stop
before writes rather than inventing a recovery point.

## Firestore database and historical records

**Managed backup isolated restore verified; PITR configured, not clone-tested.** Production is
`projects/savvy-kit-496703-r5/databases/(default)`, location `nam5`, Standard
edition, Native mode. Native protection was enabled by separate CPO authority
on November 16. A completed backup is available; restore completion must be
distinguished from historical-value verification.

### Configured protection and recovery evidence

| Item | Last verified value |
|---|---|
| Source database UID | `0abf014d-fcda-4bf7-b75c-59faa1f0b4b3` |
| Daily schedule | `projects/savvy-kit-496703-r5/databases/(default)/backupSchedules/f99a3226-e90e-4de3-939a-0e254c4287de` |
| Effective since | `2026-11-16T16:36:13.489140Z` (08:36:13 Pacific) |
| Recurrence / retention | `dailyRecurrence: {}` / `2592000s` (30 days) |
| PITR | `POINT_IN_TIME_RECOVERY_ENABLED`; `versionRetentionPeriod: 604800s` (seven days) |
| PITR update / completed operation | `2026-11-16T16:36:13.452643Z` / `projects/savvy-kit-496703-r5/databases/(default)/operations/BhAB1-uRuBAG1-zh_QgMChAa` |
| Earliest readable version at verification | `2026-11-16T15:37:00Z` |
| First completed backup | `243d89d7-e6ad-4229-82d9-bd9a69994ea4`, `READY`, source UID matches production |
| Snapshot / expiration | `2026-11-16T16:41:13.672381Z` / `2026-12-16T16:41:13.672381Z` |
| Isolated restore target | `recovery-verify-20261116`, `nam5`, UID `2d71947e-9570-4edb-91b4-fea34e3d88a9` |
| Restore operation | `projects/savvy-kit-496703-r5/databases/recovery-verify-20261116/operations/qYg9TqP-tJHbTnCVfpRxLRAqNW1hbgQiChAaGg` |
| Restore start / completion | `2026-11-16T18:15:08.720355Z` / `2026-11-16T18:29:14.791620Z`; `SUCCESSFUL`; **846.071 seconds (14m 6s)** |
| Historical comparison | **4,485 / 4,485** scoped records matched across 26 collection paths; zero mismatches or changed/deleted uncertainties |

Both settings were independently read back. Source identity, creation time,
location and concurrency mode were unchanged; delete protection remained
disabled. No production document write, maintenance fence, traffic change or
application deployment occurred. The
[configuration execution record](DEPLOYMENT_GUIDE.md#native-production-firestore-backup-and-recovery-2026-11-16)
retains the exact configuration commands and unchanged serving identities.

[The redacted verification record](../recovery/firestore-restore-verification-20261116.json)
includes 2 Customer records, 4 Course records, 437 requests and 94 reporting-state
history records; nested inventory/events/operations/audits, products, staff,
shifts/closures, service events/days, sales days, published menus and QR
submissions; and 7 access records. Verified creation dates span
`2026-09-18T23:50:48.679168Z` to `2026-11-15T23:41:47.795012Z`.
Counts and field equality were checked against unchanged source records at the
backup snapshot, not inferred from a live total or root-document count. This
demonstrates preserved representative values and historical/nested records
within the explicit scope, not credential or every-root verification.

After completion, valid unauthenticated document and query reads returned
**HTTP 403**. No real Firebase user token was acquired for an authenticated
mobile/web-client probe; project-level privileged IAM remains applicable.
Production UID, daily schedule and PITR were rechecked unchanged, all three
serving revisions remained at 100%, and the sole Eventarc trigger still targets
`(default)`. No production document write or integration traffic was introduced.
The recovery database and backup remain intact; deletion is not authorized.

Google controls the backup time. Daily recurrence uses UTC; the schedule API
exposes no exact time-of-day or next-run/completion timestamp. Expect an upcoming
managed daily run, but claim availability only after a matching backup reaches
`READY` and its `snapshotTime` and `expireTime` are recorded. The first backup
above is now available; an exact next daily completion time remains unspecified.
Independent daily native exports and isolated import verification are recorded
under [Digital Recovery Readiness](#digital-recovery-readiness-implementation).
No custom backup platform or continuously running standby is used.

PITR retains minute-granularity history going forward, not seven days
retroactively. A full seven-day lookback accumulates by approximately November
23, 08:36 Pacific. Always inspect current `earliestVersionTime` rather than
using that estimate as a permissible timestamp.

### Inspect protection and choose a backup

Under authorized read access, use explicit project/database/location selectors:

```sh
gcloud firestore databases describe \
  --project=savvy-kit-496703-r5 --database='(default)' --format=json
gcloud firestore backups schedules describe \
  --project=savvy-kit-496703-r5 --database='(default)' \
  --backup-schedule=f99a3226-e90e-4de3-939a-0e254c4287de --format=json
gcloud firestore backups list \
  --project=savvy-kit-496703-r5 --location=nam5 --format=json
gcloud firestore backups describe \
  --project=savvy-kit-496703-r5 --location=nam5 \
  --backup=BACKUP_ID --format=json
```

Replace `BACKUP_ID` only after listing. Require the exact source database and
UID above, intended location, `READY` state and suitable snapshot/expiration.
Stop for wrong identity, missing history or unavailable backup. Do not recreate
the schedule to try to force an immediate backup.

### Controlled isolated backup restore

1. Verify existing permissions and isolation. On November 16,
   `josh@fairwayrefresh.com` passed project `testIamPermissions` for backup
   get/list/restore, database create/getMetadata/list, operation get/list and
   document get/list. This is preflight, not a successful restore. Recheck at
   execution; stop on permission denial rather than granting roles.
2. Verify a new, unused destination with
   `gcloud firestore databases list --project=savvy-kit-496703-r5`.
   Use a named recovery database, for example `recovery-verify-20261117`,
   **never `(default)`**. Verify that no application or trigger targets it.
   The November 16 all-region Eventarc inventory found only the notifier
   trigger in `nam5`, restricted to `(default)` and `requests/{requestId}`.
   Recheck filters before execution:

   ```sh
   gcloud eventarc triggers list \
     --project=savvy-kit-496703-r5 --location=- \
     --format='json(name,eventFilters,destination)'
   ```

3. After restore authorization and backup selection, invoke native restore:

   ```sh
   gcloud firestore databases restore \
     --project=savvy-kit-496703-r5 \
     --source-backup=projects/savvy-kit-496703-r5/locations/nam5/backups/BACKUP_ID \
     --destination-database=recovery-verify-20261117
   ```

   The destination is newly created in the backup location; an existing
   destination is refused. Record the operation name and inspect it:

   ```sh
   gcloud firestore operations describe FULL_OPERATION_NAME \
     --project=savvy-kit-496703-r5 --format=json
   ```

   Require completion with no error and the intended destination response.
   The new database is unreadable until the restore operation finishes.
4. Keep production clients, routes, runtime configuration and triggers
   unchanged. Do not deploy application rules, TTL policies or active
   integrations to the verification database. Verify unauthenticated and
   mobile/web client reads are denied. A named database isolates the data
   target, not project-wide IAM or quotas; privileged project identities retain
   applicable access. Stop if that isolation cannot be established.
5. Using a read client explicitly bound to the recovery database or Google
   Cloud console, enumerate collections and nested histories. Record counts
   and representative old/recent Customer, Course, inventory, shift/sales,
   request, service-event and access records that actually exist. Include
   descendants below missing parents in coverage; a root-document count alone
   does not establish historical completeness. Compare identities and values
   at the backup snapshot using PITR reads where timestamp rules permit, or
   source records verified unchanged since that snapshot. Do not treat
   differences from a changing live database as corruption. Record unverified
   coverage and discrepancies without exposing raw records or credentials.
6. Recheck source identity, PITR, schedule and unchanged serving revisions.
   Record backup ID/times, restore operation/database, historical comparisons,
   isolation evidence and limitations here. Leave the recovery database and
   backups intact; manual deletion requires separate authorization. Approved
   30-day managed backup expiration remains automatic.

The read-only [restore verifier](../recovery/verify_firestore_restore.py)
implements nested enumeration, including descendants below missing parents,
and compares field hashes without writing record values to evidence:

```sh
python3 recovery/verify_firestore_restore.py \
  --recovery-database recovery-verify-20261116 \
  --snapshot-time 2026-11-16T16:41:13.672381Z \
  --source-read-time 2026-11-16T16:42:00Z
```

Run from the repository root with authorized application-data read access.
The source whole-minute PITR time is immediately after the fractional backup
snapshot; only records whose source `updateTime` does not exceed the exact
snapshot are asserted equal. Changed/deleted records are explicitly
unverifiable, not silently counted as recovered. Roots are `customers`,
`requests`, `user_access` and `qr_bays`; credential, subscription, command and
other excluded roots are not read or claimed verified. Record the emitted
counts, collection paths, historical time coverage, uncertainties and any
mismatch. A zero exit is scoped evidence, not proof of every database record.

### PITR recovery and return to service

**Configured, not clone-tested.** Google's native whole-database PITR path is:

```sh
gcloud firestore databases clone \
  --project=savvy-kit-496703-r5 \
  --source-database='projects/savvy-kit-496703-r5/databases/(default)' \
  --snapshot-time=APPROVED_WHOLE_MINUTE_TIMESTAMP \
  --destination-database=APPROVED_NEW_RECOVERY_DATABASE
```

These uppercase values are placeholders, not executable targets. Choose a past
whole-minute timestamp no earlier than current `earliestVersionTime` and within
the retained window. Apply the same isolation, operation-completion and
historical-data verification requirements as backup restore. No PITR clone was
run; it would not replace the required scheduled-backup restore test.

Managed backup restores documents and index configurations, **not** Security
Rules, TTL policies, Firebase Auth, IAM, Cloud Run/Hosting or GCS/OTA assets.
Current backend/web clients select `(default)`; a named restore does not
transparently reconnect them. Isolated verification is not a production
cutover. A real recovery requires a reviewed plan for compatible
data/rules/indexes, all writers and cached clients, integrations and retained
legitimate activity before reconnecting anything. No validated in-place
replacement or named-database application cutover procedure exists.

If Customer operational migration is interrupted, use its existing
[maintenance-fenced migration mechanism](DEPLOYMENT_GUIDE.md#customer-operational-ownership-correction):
resume the same exact plan/identity only while its checks permit; divergence
is a stop, not overwrite authority. After activation recover forward on
Customer paths; never replay the legacy plan over newer operations. Source
and target leftovers are not independent backups. Migration orchestration
remains with the Deployment Guide; disaster-data recovery remains here.

### Cost and pending acceptance

At `2026-11-16T16:28:00Z`, documents plus indexes were 52,960,942 bytes
(0.0493237 GiB). `nam5` USD list prices were $0.03/GiB-month per retained
backup, $0.18/GiB-month for PITR and $0.40/GiB per restore/clone. At unchanged
size, 30 retained daily backups plus PITR estimate **$0.0533/month**; a restore
estimates **$0.0197**. Retained recovery storage adds about $0.0089/month at
that size before applicable allowance, plus verification/read charges.
Estimates exclude taxes and ordinary usage and scale with growth.

First-backup usability and scoped isolated restore/history verification are now
demonstrated and ready for responsible platform-owner review. Native restore
time was 14m 6s; this is not whole-application RTO, which also includes approval,
configuration, data reconciliation and application verification. No production
reconnection or Customer cutover is authorized by this increment. Daily
snapshots do not guarantee zero data loss; actual snapshot time and PITR
coverage determine the recoverable point.

References: [managed backups](https://docs.cloud.google.com/firestore/native/docs/backups),
[schedule API / UTC recurrence](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.backupSchedules),
[PITR](https://docs.cloud.google.com/firestore/native/docs/pitr),
[native restore](https://docs.cloud.google.com/firestore/docs/reference/rest/v1/projects.databases/restore),
[regional pricing](https://cloud.google.com/firestore/pricing).

## Firebase Authentication and user access

Distinguish a failed Authentication sign-in from a successful sign-in with
denied application access. Verify the selected Firebase project/provider and
UID, then its server-owned `user_access/{uid}` record and actual deployed
authorization schema. Do not infer access from email domain, Customer
membership, an old Course assignment or a sandbox grant.

For an intact Auth identity with damaged access, compare retained entitlement
evidence against the current Customer/menu/service contract and obtain
explicit authority for the smallest corrective access mutation through the
established Admin path. Preserve the UID, Customer and effective grants;
verify allowed operations and denied cross-Customer/unauthorized operations.
The [authorization implementation](../fairway_backend/cloudrun_receiver/lib/user_access.js)
and [Admin account behavior](UX_SPECIFICATION.md#customer-menu-register-and-restaurant-menu)
remain subsystem-owned. Production schema must be inspected; accepted
schema-v3 sandbox source is not proof of a production migration.

The [Admin directory contract](DEPLOYMENT_GUIDE.md#admin-user-management-directory-contract)
provides a practical read-only distinction: `GET /api/v1/admin/users`, with an
authorized global-Admin ID token, reconciles Auth and access by UID and reports
`PROVISIONED`, `NOT PROVISIONED`, `CONFIGURATION ERROR` or `ORPHANED RECORD`.
Require a complete response; errors/partial enumeration are not proof that
accounts are absent. Directory reads never repair identities or grants.
`PUT /api/v1/admin/users/{uid}/access` is the separately authorized access
operation for an existing Auth UID, subject to deployed schema, protected-Admin
and last-administrator safeguards. Do not paste tokens or credentials into
commands, incident records or chat. If no valid Admin remains, there is no verified
break-glass repair path here; escalate rather than bypassing those safeguards.

**Evidence limit:** on November 16, the existing sandbox Admin's schema-v3
entitlement was restored after the disposable reset, and the shared browser
successfully opened Admin with its unchanged Auth identity/password.
Sandbox role/isolation checks also passed. This does not demonstrate
production sign-in/cutover recovery. The subsequent
[independent Auth rehearsal](#auth-access-relationships-and-critical-secret-custody)
demonstrates recovery of six production identities, their supported attributes,
password material and matching access relationships in a separate restricted
project. Firestore backup alone contains access documents, not Auth accounts.
Restoring an old access record can also reinstate revoked privileges; a
database restore is not authority to replace current grants.
Do not recreate a lost account with a new UID and assume old access/history
will reconnect, or use production passwords to seed a sandbox. Lost identities,
provider configuration, protected-Admin access or uncertain grants require
incident-specific authority and reconciliation; do not weaken authorization.

## Firebase Hosting and frontend applications

**Verified retained-release recovery, not arbitrary rebuild recovery.**
[October 6 production restoration](DEPLOYMENT_GUIDE.md#restored-matched-stable-deployment--2026-10-06)
restored Hosting version `23488f2b47f307e0` with Firestore untouched. This
demonstrates the mechanism, not the current safety/availability of that version.

Select the incident's retained compatible FINALIZED version using the current
release record and follow the Deployment Guide's
[exact-snapshot Hosting rollback](DEPLOYMENT_GUIDE.md#authenticated-hosting-rest-release-and-recovery)
and [rollback compatibility controls](DEPLOYMENT_GUIDE.md#rollback-procedure).
Those instructions own Console rollback and REST release creation; do not
duplicate uploads, reconstruct an old version from live files or use
`hosting:clone` as an arbitrary-version rollback.

Verify `/`, `/admin`, request deep links, public permanent menu/QR destinations,
cache/service-worker behavior, API origins and the complete reviewed asset
inventory on both production origins. Preserve all 107 accepted Driving Range
assets and Firebase-managed initialization resources, not just the changed
bundle. Use the actual release's complete inventory; older counts are evidence,
not permanent release manifests. Authenticate designated users and verify
role-specific workflows; HTTP 200 alone is insufficient. Preserve open shifts,
uncertain submissions and normal refresh guards.

Hosting rollback restores frontend content only. Auth, Firestore, backend,
custom-domain/DNS configuration and installed device firmware do not roll
back with it. Loss of retained versions or domain configuration has no
demonstrated disaster reconstruction here; stop for a reviewed compatible
forward release or domain recovery plan instead of improvising.

## Cloud Run backend services

**Verified Admin revision restoration.** The
[October 6 matched restoration](DEPLOYMENT_GUIDE.md#restored-matched-stable-deployment--2026-10-06)
returned Admin to `fairway-admin-00008-sjt` while leaving the receiver and
Firestore intact. It is historical evidence, not a safe current target.
Receiver/notifier deployments and readiness checks do not prove that every
rollback or deleted-service rebuild has been tested.

When a release caused the failure and data is intact, select a ready,
security-preserving revision with the recorded image digest, runtime identity,
secret references and current data/API compatibility. Use the existing
[Cloud Run traffic rollback procedure](DEPLOYMENT_GUIDE.md#rollback-procedure)
and incident-specific release order. Preserve unaffected services and tags;
do not use `--to-latest` to guess a good revision. The separately owned
[backend release procedure](DEPLOYMENT_GUIDE.md#backend-release-procedure)
applies if a reviewed forward fix is necessary.

Verify actual traffic, readiness, error behavior, allowed origins, ID-token
validation, protected Admin safeguards and designated operator/Admin reads.
Check the receiver's request/poll/ack contracts and notifier integration, not
only container readiness. Preserve the stock-aware transaction/revision,
idempotency, audit and shift semantics after inventory writes; the
[inventory rollback constraints](DEPLOYMENT_GUIDE.md#recovery-compatible-with-new-inventory-records)
prohibit reverting to the old writer. After Customer activation, all recovery
writers must understand Customer ownership and its maintenance marker.

Restoring traffic does not restore lost data, secrets, IAM, triggers or
credentials. Complete service/project reconstruction from source and
configuration has not been demonstrated; unavailable safe revisions or missing
dependencies are gaps requiring an authorized recovery plan.

## Cloud Storage assets

Production OTA artifacts are in `gs://savvy-kit-496703-r5-ota-artifacts`,
`US-CENTRAL1`, with uniform bucket-level access and enforced public-access
prevention. The [delivery infrastructure record](DEPLOYMENT_GUIDE.md#private-delivery-infrastructure-and-corrected-qualification-2026-11-09)
owns access roles and runtime identities. Publisher create/get and receiver
get were tested; generation-zero overwrite rejection and anonymous denial
passed. This is integrity/access evidence, **not a backup restore test**.

For an unavailable object, first distinguish access/configuration failure from
missing bytes. Under authorized reads, compare the exact object/generation,
size and SHA-256 with the accepted immutable manifest and release identity.
Preserve bucket privacy, runtime identity and log controls; do not make a
bucket public or expose bearer artifact URLs to restore access. If the bytes
remain intact, use a separately authorized correction to the broken access or
service configuration, then verify private authenticated delivery without
assigning an OTA or operating a device.

On November 16, [the local OTA recovery helper](../recovery/protect_ota.py)
recovered all **11** exact accepted releases into a new local directory,
including signed binaries, merged bootloader images, manifests and publication
provenance. It re-read the copies, checked accepted SHA-256 values from the
[existing release owner](../fairway_backend/cloudrun_receiver/lib/ota/accepted_releases.js),
extracted the public trust anchor from each merged image, matched its canonical
fingerprint and freshly verified each MCUboot image hash and ECDSA signature.
OpenSSL public-key verification is used because this SDK's `imgtool verify`
rejects the public-only key type; no private key was opened or unlocked.
No release was rebuilt, published, assigned or flashed.
The [dated OTA verification record](../recovery/ota-verification-20261116.json)
also records successful download from independent lifetime storage and fresh
recovery/hash/signature verification in a non-serving location.

Reproduce into a **new** local directory, preserving originals:

```sh
python3 recovery/protect_ota.py --source /approved/immutable-packages \
  --destination /approved/new-recovery-bundle
```

The helper requires Python, Node and OpenSSL; it copies only named credential-free
package files and canonical publication evidence, not whole build directories.
`recovery-inventory.json` records per-file hashes and fresh signature results.
The verified independent copy is at
`gs://fairway-refresh-recovery-accepted-artifacts/accepted/accepted-ota-recovered-again-20261116/`.
Download that prefix into a new private local directory with
`gcloud storage cp --recursive`, selecting recovery project
`fairway-refresh-recovery`, then run the helper with the downloaded bundle as
`--source` and another new directory as `--destination`. Verify all 11 accepted
hashes/signatures and the canonical public fingerprint before considering any
separately authorized serving-bucket repair. The artifact bucket has no
age-expiry rule or retention lock; retain releases for their supported lifetime.

No production lost-object replacement or immutable retention guarantee is
claimed. The historical default seven-day
soft-delete observation for a deleted harmless probe is not a verified restore
capability for firmware. Stop if accepted bytes cannot be located/verified;
do not overwrite release IDs, rebuild different bytes under an old identity,
or delete historical objects. Approved local immutable packages, source
archives and build buckets are evidence locations, not assumed independent
backups. Frontend/sign assets already included in a retained Hosting snapshot
follow the Hosting path, not an invented GCS restore.

## Secrets, credentials and external integrations

Recover the existing identity/configuration relationship before considering
rotation. Inspect only reference names, version identifiers, IAM bindings and
redacted state; never print secret values. Service revision rollback does not
undo Secret Manager destruction, active credential changes or external
provider state. No complete enterprise secret inventory or comprehensive
secret-version restore test has been established.

### Signing key and device credentials

The [production MCUboot custody procedure](DEPLOYMENT_GUIDE.md#production-mcuboot-signing-key-custody)
owns key storage, build-time handling and fingerprint verification. The CPO
confirmed encrypted offline backup and separate passphrase custody on
November 7; actual recovery from that backup has not been demonstrated.
For loss of the working copy, obtain CPO-controlled recovery from the retained
encrypted copy and verify the public fingerprint without displaying private
material before any separately authorized signing. Required fingerprint:
`sha256:be1c125733db97148309513e75282736024bec3e2b47beb44b7aa3008f4f88eb`.
Keep owner-only file/directory permissions (`0600`/`0700`); do not put keys or
passphrases in Git, chat, logs, cloud drives or OTA buckets.

Loss of every private-key copy prevents new OTA images authenticating to
that trust anchor. The current bootloader has no remote key-rotation path.
Total key loss is a fleet-recovery event requiring separately authorized and
verified physical USB replacement of the MCUboot trust anchor and firmware.
Do not assume reflashing preserves TF-M identity data. This is a recovery gap,
not a demonstrated remote recovery procedure.

For a device credential mismatch, follow
[the existing-device lifecycle](DEVICE_PROVISIONING_GUIDE.md#prepared-credential-rotation--backend-increment-1)
and the [connectivity path](#backend-to-device-connectivity). Plaintext is
one-time; a Firestore verifier cannot recover it. Do not create another FRB ID
or restore an old verifier to bypass an activated rotation.

### Notifications and other external dependencies

Preserve notifier VAPID identity, subscriptions, preferences, dispatch receipts,
Eventarc filters/invoke grants and its runtime Secret Manager reference.
The [Web Push contract](DEPLOYMENT_GUIDE.md#cart-operator-web-push) owns those
details. The existing Refresh icon reconciles permitted subscriptions without
rewriting saved preferences; the
[notification recovery baseline](DEPLOYMENT_GUIDE.md#notification-recovery-production-baseline-2026-10-30)
records CPO-confirmed field operation, with independent iPad/Safari presentation
evidence not captured. Do not rotate VAPID, replay old events or create
production notifications as an unapproved smoke test.

If the notifier fails but requests persist, restore that integration without
resetting request state. Verify event source `(default)`, destination,
entitlement/preference checks and normal authorized delivery; a `READY`
container alone does not establish notification recovery.

For Firebase provider/domain configuration, DNS/TLS, cellular/SIM/carrier
service or other external dependency loss, preserve existing identities and
consult its recorded configuration and responsible account owner. There is
no demonstrated end-to-end account/provider disaster restore. Do not copy
sandbox secrets into production, widen IAM, replace SIMs or change endpoints
as an inferred recovery step.

## GitHub source and configuration recovery

Canonical remote: `https://github.com/josh-fairwayrefresh/fr-main.git`.
**Verified remote-source integrity evidence:** the
[production-source checkpoint](DEPLOYMENT_GUIDE.md#accepted-local-production-package-and-source-checkpoint-2026-11-09)
records commit `11213b4ad0607486df12f28d764f6d6abd90cdb6`, fast-forward push,
independent fetch, matching 206 packaged source hashes and passing Git object
integrity. This is not a claim that today's dirty worktree is remotely backed up.

Recover into a fresh directory, never reset an incident worktree:

```sh
git clone https://github.com/josh-fairwayrefresh/fr-main.git /approved/new/path/nfed
git -C /approved/new/path/nfed rev-parse HEAD
git -C /approved/new/path/nfed fsck --full
```

The path is a placeholder for a new approved location. Select the reviewed
incident-specific commit/tag from the applicable release record, verify its
Git identity and packaged hashes where available, and inspect branch/upstream
and worktree before building. Current `main`, commit ancestry or a successful
clone alone does not prove equivalence to a deployed artifact.

Use the [deployment build environment](DEPLOYMENT_GUIDE.md#build-procedure)
and frontend/backend release procedures for separately authorized rebuilds.
Git recovers tracked source/configuration/history, not ignored environment
files, Auth users, database records, signing keys, credentials, uncommitted
edits, compiled releases or live IAM. Preserve surviving local material
securely; do not add secrets/artifacts to Git as a recovery shortcut. Loss of
the GitHub repository/account and all independent clones has no demonstrated
organization-level restore procedure here.

## Digital Recovery Readiness implementation

### Policy, ownership and authorization

The CPO approved daily independent Firestore and Firebase Authentication
exports, **30-day retention**, and an approximately **24-hour catastrophe RPO**
when the primary environment and its native recovery resources are both lost.
Retain accepted OTA artifacts for the supported device/release lifetime,
separately from expiring exports. Existing native daily backups and seven-day
PITR remain unchanged. No always-running standby or custom backup platform is
required.

The CPO is the custody/authorization owner. The release/platform engineer owns
daily-success and alert review, evidence, and rehearsals; a second authorized
custodian needs recovery-project and encrypted-secret access independent of
the production project's administrators. The actual operator and alert
destination are recorded below; additional custodians require explicit named
access grants, not an implied organizational role.

The subsequent CPO execution authorization covered independent project/billing,
restricted IAM/storage, jobs/schedules/alerts, sensitive exports/secret custody
and restricted isolated real-identity recovery. These operations are now
implemented. It did not authorize production data/identity replacement, endpoint
cutover, credential rotation, retention locks, resource deletion, devices,
Customer migration, application deployment or source publication.

### Independent storage and daily operation

The independent project is **`fairway-refresh-recovery`**, number
**`883080774039`**, in the existing organization and billing account. It is
outside production and outside the disposable acceptance sandbox, but not
independent of an organization/billing-account compromise. Project administration
is restricted to `josh@fairwayrefresh.com` plus native service agents and
narrowly scoped automation roles. A second human custodian remains unassigned;
do not describe two-person or separate-organization custody as established.
Use private uniform-access Storage buckets with
Google-managed encryption at rest and TLS in transit: one for 30-day exports,
another without age-based expiry for accepted lifetime artifacts. Restrict
administration; do not make the production runtime an administrator or give
it deletion authority over retained copies. Native Firestore exports require
the production Firestore service agent to write into the destination.

| Live resource | Configuration / demonstrated evidence |
|---|---|
| Export bucket | `gs://fairway-refresh-recovery-exports`, private, uniform access, public access prevention enforced, Google-managed encryption; global lifecycle Delete age 30, no retention lock; native seven-day soft-delete grace |
| Lifetime bucket | `gs://fairway-refresh-recovery-accepted-artifacts`, same privacy/encryption, no age-expiry policy |
| Worker | `digital-recovery@fairway-refresh-recovery.iam.gserviceaccount.com`; source Firestore export/metadata/operation reads and Auth user/config/hash reads only; no source import/account mutation |
| Bucket permissions | Worker metadata/create/get; native source Firestore agent metadata/create/get/list limited to `firestore/`; neither can delete retained objects or change bucket IAM |
| Jobs | `digital-recovery-firestore`, `digital-recovery-auth`, `us-central1`; one task/parallelism, 1 CPU/512 MiB, 14,400-second timeout, one retry |
| Immutable worker image | `us-central1-docker.pkg.dev/fairway-refresh-recovery/recovery/exports@sha256:8ac47603012c092b0e51f4eba1c48499695a5b57a271d5fbdf788e26acb1d489` |
| Scheduler | `digital-recovery-firestore-daily`, `digital-recovery-auth-daily`, `us-central1`, `0 9 * * *`, `Etc/UTC`, ENABLED; next daily slot November 17 at 09:00 UTC |
| Invocation | OAuth as `recovery-scheduler@fairway-refresh-recovery.iam.gserviceaccount.com`, job-scoped `roles/run.invoker`, HTTP POST `{}` to the corresponding Run v2 `:run` endpoint |
| Alerts | Failure policy `16303074341184205900`; per-action missing-success policy `11514975805709007987`; email channel `1512102899617742614` to `josh@fairwayrefresh.com`, all in recovery project |

Both jobs succeeded directly and through the actual Scheduler identity/path.
New-project Scheduler dispatch initially lagged activation; subsequent native
attempt records report HTTP 200 and both jobs emitted completion heartbeats.
The approved daily timing was restored/read back after a bounded clock-driven
dispatch test. A Scheduler HTTP 200 means launch accepted, not export completed:
check both the execution's successful condition and its new `completed.json`.

The [execution record](../recovery/independent-recovery-execution-20261116.json)
contains resource identities, privacy/retention, successful executions,
Scheduler attempts, alert incidents and unchanged production checks.

**Independent Firestore recovery verified:** the initial export selected exact
PITR snapshot `2026-11-16T19:37:00Z`, then completed natively. The approved
independent import into
`projects/fairway-refresh-recovery/databases/recovery-import-20261116`
ran `19:42:12.738961Z` to `19:43:40.523812Z` (**87.785 seconds**) and imported
**6,612 documents / 5,624,985 reported bytes**. The
[historical comparison](../recovery/independent-firestore-verification-20261116.json)
matched **4,486 records across 26 scoped collection paths**, including nested
operational history and seven access records, against that exact source
snapshot; zero mismatches/uncertainties. Excluded credential collections were
imported by the whole-database native operation but not value-inspected by the
scoped historical comparison. No production writes occurred.

To reproduce under incident-specific authority:

1. Select the newest appropriate successful Firestore completion marker in the
   independent bucket; verify source database, snapshot time and complete native
   operation. Do not select an uncompleted export prefix.
2. Create a new restricted, non-serving named database in the approved recovery
   project, with no production Eventarc/clients. Never import into `(default)` in
   production. Use native `gcloud firestore import EXPORT_URI --project=RECOVERY_PROJECT
   --database=RECOVERY_DATABASE --async`, replacing placeholders explicitly.
3. Read back the successful import operation and run
   [the independent comparison](../recovery/verify_independent_firestore.py) with
   `--recovery-project`, `--database`, `--operation`, `--export-prefix` and
   `--snapshot-time` from that operation/marker. It performs redacted exact-PITR
   comparison of the established historical scope. If production is lost or
   the source PITR point expired, source equality cannot be rerun: verify the
   recovered structure/values against retained evidence and disclose that limit.
4. Reconcile Auth/grants, chronology and application configuration before any
   separately approved serving reconnection. Keep recovery databases intact
   until deletion is separately authorized.

[The native cloud-plan generator](../recovery/prepare_cloud_plan.py) emits
review-only `gcloud` argument arrays and native Monitoring alert-policy bodies,
never executes them. It requires a preexisting approved independent project,
a digest-pinned job image in that project, and an approved notification channel.
It separates recovery-resource creation, production export-only IAM,
sensitive Auth access and final schedule activation. There is deliberately no
schedule in the initial provisioning phase.

```sh
python3 recovery/prepare_cloud_plan.py \
  --recovery-project APPROVED_RECOVERY_PROJECT \
  --job-image APPROVED_RECOVERY_IMAGE_AT_SHA256_DIGEST \
  --notification-channel APPROVED_RECOVERY_NOTIFICATION_CHANNEL \
  --output /approved/new-recovery-plan.json
```

Uppercase values are placeholders. Review each command and its approval gate;
do not bulk-execute the JSON. Materialize its lifecycle and alert-policy bodies
as separate controlled input files before using the corresponding native APIs.
Both daily jobs are active at 09:00 UTC after successful initial exports and
native failure-incident verification. Email inbox receipt is not established by
the native incident record. Object lifecycle age 30 is not an immutable lock;
provider soft-delete grace can add retained billing after lifecycle deletion.
The artifact bucket must not inherit that expiry policy.
When another OTA release is accepted, preserve its original accepted bytes and
provenance in lifetime storage and repeat the independent download verification.
The 11-release evidence is a dated inventory, not automatic protection of future
releases or a replacement for existing publication acceptance controls.

The export worker must hold source export/read permissions, not import,
database write or Auth account mutation. The Firestore writer's bucket-scoped
custom role permits metadata/get/list/create, not object deletion or IAM
changes; validate native service-agent requirements on the first authorized
run and stop on denial rather than silently granting Storage Admin. No user
download permission is granted to the general application.

The [Node export worker](../recovery/exports/cli.cjs), its
[locked dependency manifest](../recovery/exports/package-lock.json) and
[container definition](../recovery/exports/Dockerfile) prepare two independently
observable Cloud Run jobs, `digital-recovery-firestore` and
`digital-recovery-auth`. Each uses `RECOVERY_ACTION=firestore|auth` and
`RECOVERY_CONFIG_JSON`; the
[example configuration](../recovery/exports/config.example.json) defaults all
cloud/production gates to false. The cloud-plan output includes nonsecret
per-action environment-file bodies with those gates still false. Verify the
recovery project number, then enable `allowCloudOperations` and only that
action's explicitly approved production-export gate before its authorized run.
Never enable them merely to validate local configuration.

Firestore uses a past whole-minute PITR timestamp, normally two minutes before
execution, validates source retention coverage, starts the native export,
waits for completion and records a generation-zero completion manifest under
`firestore/`. Do not pin a dated snapshot into a recurring job. Auth writes
generation-zero pages, hash configuration and completion evidence under
`auth/`. Each object is downloaded and checksum/byte-verified; the worker's
bucket role therefore includes object get as well as create, but no delete.
Failure is nonzero with redacted `recovery_failed` JSON; success emits
`recovery_succeeded` with its action. Successful export is explicitly **not**
an import/restore verification.

Native log failure alerts and a missing-success metric alert are installed.
Each action sums success counts over a 25-hour window,
then alerts after one hour below one success (approximately 26 hours), treating
missing data as active. This avoids the native metric-absence policy's 23.5-hour
maximum. Detection needs an initial successful metric
stream. Actual failed Auth executions opened native failure incident
`0.of3anpxsi6b8` at `19:39:37Z`; missing-success incidents also opened during
initialization and auto-resolved when success arrived. This verifies error
detection/incident creation and recovery, not a 26-hour outage rehearsal or
human email receipt. Review the designated inbox and daily success age as part
of normal operations. A schedule or accepted
long-running-operation request is not successful recovery protection.
Each action has a separate missing-success condition so a successful Firestore
run cannot conceal a missing Auth export.

### Auth, access relationships and critical-secret custody

Firestore exports preserve `user_access/{uid}`, not Auth identities. Auth
recovery must preserve the exact UID and its access relationship, supported
provider/disabled/claims attributes and password hashing configuration. Do
not recreate identities under new UIDs, infer grants from email, silently drop
unsupported fields or treat partially successful imports as complete.
An old recovered grant is not authority to restore a revoked privilege.
Firestore and Auth exports are not an atomic cross-product snapshot. Retain
their start/end times and reconcile orphaned UIDs, newly created accounts and
revoked access before any separately approved production reconnection; default
to denied access where the relationship cannot be established.

Auth requires a separately approved source-matched native SCRYPT configuration
mounted as `RECOVERY_AUTH_HASH_CONFIG_FILE`, never a secret command argument
or environment value. Its JSON fields are `algorithm: "SCRYPT"`, base64 `key`,
base64 `saltSeparator`, integer `rounds` and integer `memoryCost`.
The deployed job mounts version `1` of recovery-project secret
`recovery-auth-scrypt`. The worker alone has secret access to this hash
configuration, not the other custody secrets. Each export checks it against
the live source configuration, including numeric project identity
`936892386735`; drift fails explicitly instead of producing an unusable export.
The automatic job does not rotate or replace that source configuration.
Missing hashes, non-SCRYPT password provenance, unsupported MFA, tenant users
or partial imports are not silently accepted as recoverable.
The source is legacy/default Firebase Auth: its authoritative configuration
does not enable tenants, so the unsupported tenant-list endpoint is not called.
Tenant enumeration is required if source configuration enables tenants. No
production Identity Platform upgrade was made. Native exported credentials
use URL-safe, sometimes unpadded base64; decoded bytes are preserved and
invalid encodings rejected.

Local adapter-based tests additionally exercise synthetic export/import, preserved UID,
disabled/provider/claim attributes and UID-to-access relationships, plus
partial-failure and isolation rejection. The import helper requires an empty
dedicated identity destination and never runs from the export CLI.
**Cloud verification:** six real backed-up identities were imported into
recovery-project Auth, not the general sandbox. The destination has no enabled
sign-in providers, authorized domains, client app, production grants or
notification triggers. The
[redacted result](../recovery/independent-auth-verification-20261116.json)
verifies all six UIDs, supported attributes, exact decoded password-hash/salt
bytes and six UID-to-recovered-Firestore access relationships. One additional
historical `user_access` record already has no source Auth identity; it was
preserved and reported, not silently deleted or granted to another user.
No actual password login, provider login, production token/permission workflow
or serving identity cutover was tested; recovery sign-in remains disabled.
Auth completion manifests retain `startedAt`, `completedAt` and
`atomicSnapshot: false` for cross-product recovery-point reconciliation.

For an approved recovery, select the matching independent Auth completion
marker, verify every page/hash-configuration SHA-256, restore into empty
restricted independent Auth and reconcile UIDs with the selected Firestore
point. [The isolated rehearsal command](../recovery/exports/rehearse.cjs)
keeps sensitive bytes in memory and rejects production/general-sandbox targets.
Its `--authorize-real-import` mode requires an empty destination;
`--verify-existing` checks the exact existing UID set without reimporting.
The dated rehearsal target is intentionally pinned in the command: a future
different target requires explicit review/update, not bypassing the guard.
Never rerun import against populated production or re-enable sign-in as a test.

Run the focused local validations without cloud credentials or operations:

```sh
npm --prefix recovery/exports ci --ignore-scripts --no-audit --no-fund
npm --prefix recovery/exports test
python3 -m unittest discover -s recovery -p 'test_*.py' -v
```

November 16 focused local validation passed **41 Node tests and 20 Python tests**.
Local validation and cloud evidence are distinct:
container builds, exports, native alert incidents, independent Firestore import,
real-identity attribute/hash recovery and independent OTA download were
demonstrated. Human email delivery, real password login and complete application
infrastructure reconstruction have not been demonstrated.

Authorized sensitive custody is established in recovery Secret Manager:
`recovery-auth-project-config:1`, `recovery-auth-scrypt:1`,
`custody-fairway-qr-rate-key:1`, `custody-fairway-vapid-private-key:1` and
`custody-fairway-vapid-public-key:1`, with automatic replication.
The [custody utility](../recovery/custody_secrets.py) transferred values directly
in memory and verified equality on readback; no local secret file, repository
value or production rotation was used. The nonsecret baseline retains actual
runtime references/aliases. Preserve
the private VAPID identity if existing browser subscriptions must survive;
public metadata alone cannot recreate it. For recovery, authorized custodians
read the pinned recovery versions directly into the new restricted destination,
verify value equality in memory, and remap baseline references under separate
serving-change authority. New rotations require updated custody/version mapping;
these application-secret snapshots are not automatically refreshed.
The utility now requires `--authorize-sensitive-custody` and creates new secret
versions; do not rerun it as a read-only status check or silently change the
job's pinned hash-configuration version.
No secret values belong in this repository,
build args, shell history, job logs, evidence or ordinary acceptance sandbox.
No full application-secret redeployment or external-account/provider credential
restore is claimed. Native Secret Manager custody is not proof of those flows.

The encrypted offline MCUboot key and separate passphrase custody remain
unchanged. This increment extracts only public keys from accepted bootloaders.
Firestore device verifiers and existing provisioned identities must be
preserved together; do not generate replacement credentials as a recovery
shortcut.

### Controlled infrastructure reconstruction

[The dated nonsecret baseline](../recovery/production-baseline-20261116-v2.json)
and [read-only capture utility](../recovery/capture_infrastructure.py) record
the three actual serving revisions and immutable image digests, runtime
identities, nonsecret environment values, secret references, service/project
IAM, enabled APIs, Eventarc, storage configuration, Firestore protection and
tracked Firebase/rules/index/lockfile hashes. `source_head` identifies the
capture checkout, **not** the source of every deployed image. Source archive
annotations and image identities retain the deployed provenance separately.

[The isolated reconstruction renderer](../recovery/prepare_reconstruction.py)
renders Cloud Run service JSON without contacting the cloud. Inputs are
`--baseline`, `--target-project`, `--mappings` and a new
`--output-directory`. Mapping JSON contains `images` (original digest URI to
the same digest copied into the target), `service_accounts` (old to target
identity), `secrets` (old reference/alias to isolated secret name), `ota_bucket`
and an isolated `vapid_public_key`. No secret values are accepted.
Use a distinct `fairway-refresh-sandbox-*` project because that is the
existing application environment boundary; the general acceptance sandbox
and production are rejected. Local rendering tests exercise the captured
three-service baseline, exact digest preservation and production-reference
rejection.

Specifications initially use internal ingress, no public invoker grants,
no Eventarc trigger, and disabled QR/OTA delivery. They are safe staging
specifications, not a fully connected recovered application. After separate
authorization, provision target APIs/identities/least-privilege grants,
independently copy exact images, supply synthetic integration secrets, create
an empty isolated Firestore/Firebase environment, and deploy the reviewed
specifications with explicit target selectors. Then deploy the compatible
tracked rules/indexes/Hosting build, reconcile the captured Eventarc filters
against the isolated database and exercise synthetic workflows before enabling
an integration. Do not copy production trigger targets or IAM wholesale.

**Independent infrastructure custody established:** the
[live configuration supplement](../recovery/production-live-config-20261116.json)
captures the actual Firestore ruleset and custom IAM-role definitions, rather
than assuming tracked candidates are live. Full Auth config is protected in
Secret Manager, not this nonsecret supplement.
All three serving images were copied byte-for-byte to recovery Artifact
Registry; [the mapping](../recovery/independent-image-mapping-20261116.json)
preserves each original digest. Their exact generation-selected native
build-source archives are in lifetime storage under
`infrastructure/20261116/source/`. No application was deployed.
The [Hosting inventory](../recovery/hosting-verification-20261116.json)
records live version `a2c3d800ffd65cde`, configuration and 129 independently
stored served files under `infrastructure/20261116/hosting-independent-20261116/`.
128 CDN-encoded hashes match native Hosting hashes; one PNG's CDN representation
does not match its native compressed hash. Its served bytes/checksum are retained,
but exact original upload-byte recovery for that file is not claimed.
The recorded live version stayed unchanged during capture.
The recovery implementation, locked dependencies (manifest/lockfile, not an
installed dependency directory), redacted evidence and owner-document snapshot
are independently archived under
`infrastructure/20261116/digital-recovery-readiness-final.tar.gz` with a SHA-256
manifest. This is a dated recovery snapshot, not another source of truth or a
claim that the unrelated dirty Customer work is committed/remotely published.

**Remaining reconstruction gaps:** DNS/registrar and external-provider custody,
live-rule compatibility with any future source revision, exact original Hosting
upload representation for the PNG above, and a connected whole-application
reconstruction rehearsal. Static rendering and recoverable images are not evidence that
the essential application can already be rebuilt after total project loss.
Production runtime is deliberately bound to the canonical production project;
a different-project production failover is not an implemented capability.
The renderer's sandbox environment is a rehearsal target, not authority to
remove that guard or claim the exact production images run there. Verify image
runtime compatibility during the approved rehearsal and surface any required
source change for architecture review.

### Acceptance and remaining controlled work

One [Digital Recovery Readiness backlog initiative](feature_backlog.md#digital-recovery-readiness)
owns completed protection and the remaining limits. Independent daily exports,
restricted 30-day storage, native incident detection, isolated data/real-identity
recovery and all 11 independent OTA recoveries are demonstrated.
This increment is presented for Architect review/CPO acceptance, not automatic
Customer cutover. Human email receipt, 26-hour stale-backup timing, real password
login, full application reconstruction/failover and second-custodian continuity
remain explicit limits; no extra approval is needed merely to review the evidence.

Estimated native backups/PITR remain **$0.0533/month** at the measured size.
Thirty independent 53 MB copies are approximately 1.48 GiB before export
overhead; at US Standard Storage pricing this is roughly **$0.04/month**.
Daily Firestore export reads cost approximately
`30 * exported_document_count / 100000 * regional_read_price`; for example,
10,000 documents/day at $0.06/100,000 reads is **$0.18/month**.
Actual first native export is about **5.5 MB / 6,612 documents**, excluding
rebuilt indexes; 30 such points are about 0.15 GiB before seven-day soft-delete
grace. At $0.06/100,000 reads, daily export reads are approximately **$0.12/month**.
Five active Secret Manager versions are approximately **$0.30/month** before
free allowances; two Scheduler jobs are **$0.20/month** before shared allowances.
Add Auth bytes, operations, soft-delete grace, regional transfer, image/build
storage, job runtime and Monitoring; budget **$1-5/month initially**, not a
verified invoice or bound. The retained recovery database and one restore
add the storage/restore estimates above. Native restore/import reads and builds
are one-time usage; scheduled resources now incur charges. Recheck actual
export counts, size, runtime and billing after a complete billing period and
periodically rehearse rather than operating a
standby system.

## Backend-to-device connectivity

**Demonstrated on specific devices, not a fleet-wide disaster test.**
[Provisioning evidence](DEVICE_PROVISIONING_GUIDE.md#authentication-contract)
records authenticated request/COMPLETE on field devices, with per-device
runtime limitations. The [current fleet handoff](DEPLOYMENT_GUIDE.md#version-6a-field-deployment-suspension-and-restart-2026-11-15)
remains authoritative: missing expected check-ins are unvalidated behavior,
not proof that credentials or firmware must be replaced.

Distinguish backend/DNS/TLS/service availability, cellular connectivity,
intentional service OFF, lifecycle/assignment denial and credential mismatch.
Use bounded redacted backend evidence and existing registry state first.
Preserve permanent Device ID, assignment, SIM association, active generation,
request/command correlation and actual installed-image evidence. Restoring
the backend must preserve compatible endpoints, authentication and
request/poll/ack behavior; code rollback cannot reinstall firmware or recover
PSA identity.

If backend or integration configuration caused the outage, use the relevant
service path above. Do not rotate credentials or assign an OTA merely because a
device is quiet. For uncertain provisioning responses, use the
[interrupted-response procedure](DEVICE_PROVISIONING_GUIDE.md#interrupted-provisioning-response):
inspect the exact registry identity before any retry; never delete/recreate
the device. For separately authorized credential cutover, use the
[prepare/install/activate lifecycle](DEVICE_PROVISIONING_GUIDE.md#prepared-credential-rotation--backend-increment-1)
and its target-specific physical procedure. A pending-operation query returning
empty does not prove activation failed; retained operation IDs and redacted
status are necessary to resolve an uncertain result. Keep an affected device
offline when credential activation/install outcomes are unresolved.

Corrupt PSA identity, KMU/HUK loss or a wrong write-once ID have no demonstrated
automatic recovery. See the [protected identity contract](DEVICE_PROVISIONING_GUIDE.md#identity-and-operational-data-continuity-contract)
and [firmware limitations](FIRMWARE_SPECIFICATION.md); do not infer that a
firmware reflash restores identity. Physical power, antenna, SIM and debug
work remain separately authorized under the hardware/provisioning owners.

## Verify restored operation and close the incident

Record the affected subsystem, approved action, source/recovery-point identity,
actual restored targets, preservation evidence and unresolved limitations.
Configuration enabled, operation accepted, container ready, HTTP 200 and a
successful isolated data restore are different outcomes; report each honestly.

Verify the complete affected application chain before declaring restoration:
correct production origins and frontend assets; normal Auth sign-in and
explicit grants; allowed operations and denied cross-Customer access;
Customer/history/reporting continuity; cart inventory and open-shift state;
restaurant/public menus and permanent QR destinations where deployed; service
ON/OFF and existing request lifecycle; notification and device correlation
where affected. Validate against the actual deployed architecture, not a
sandbox-only candidate. Preserve unaffected workflows and newer records.

Use designated identities and authorized reads first. Record unperformed
checks rather than creating sales, test requests, notifications or device
traffic without authority. When physical end-to-end validation is authorized,
follow the existing [operational verification sequence](DEPLOYMENT_GUIDE.md#operational-verification):
boot/network, authenticated request, persistence, actionable operator delivery,
correlated COMPLETE and separately authorized guarded Cancel. There is no
operator CONFIRM step. Without that evidence, claim only the verified digital
scope, not restored field operation.

Update this guide's capability evidence when recovery is demonstrated and
retain dated change/release evidence in the Deployment Guide. Outstanding gaps
remain explicit: production data reconnection beyond the verified isolated restore,
production identity/login cutover, serving-object/secret redeployment, complete
service/project reconstruction, total signing-key/PSA loss and organization/account
disaster recovery. Do not implement new infrastructure or
expand incident scope merely to eliminate a documentation gap.
