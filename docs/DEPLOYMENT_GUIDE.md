# Deployment Guide

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
alone does not revoke already-issued access. Do not remove named users.
Clearing browser storage creates a new reviewer identity.

### Public-review publication — 2026-10-26

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

## Current Pilot 1.1 Operating State

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

## Alignment Register

The Alignment Register is the canonical record mapping release milestones across source control, production services, web applications, authorization models, and firmware baselines. New entries are placed at the TOP of this register.

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

## Purpose

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
| Google Cloud Project | Current Operational Evidence | savvy-kit-496703-r5 |
| Project Number | Repository + Historical Working State | 936892386735 |
| Firebase Project | Repository + Historical Working State | savvy-kit-496703-r5 |
| Cloud Run Region | Current Operational Evidence | us-central1 |
| Cloud Run Service | Current Operational Evidence | fairway-button-receiver |
| Cloud Run URL | Repository + Current Operational Evidence | https://fairway-button-receiver-936892386735.us-central1.run.app |
| Primary Production Application Origin | CPO Physical Acceptance | https://app.fairwayrefresh.com |
| Firebase Hosting URL | Current Operational Evidence | https://savvy-kit-496703-r5.web.app |
| Firestore Database | Current Operational Evidence | `(default)`, Native mode, `nam5` |

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
| Cloud Run Revision | `fairway-button-receiver-sandbox-00002-vh7` (100% traffic at WP5-S1 validation; superseded by a later revision not deployed as part of this work — see "Cart UI / Inventory Integration" below for the currently serving revision) |
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
| Current Admin Revision | `fairway-admin-00015-l2g` (100% traffic as of 2026-10-13; schema-v2 authorization and protected-System-Administrator safeguard) |
| Current Receiver Revision | `fairway-button-receiver-00026-kg5` (100% traffic as of 2026-10-13; schema-v2 authorization and additive dashboard `customer_id`) |
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
**Current deployed production authorization state (2026-10-13):** Admin revision
`fairway-admin-00015-l2g` and receiver revision
`fairway-button-receiver-00026-kg5` serve 100% of traffic. Admin and Cart
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
- **Production after source validation:** still serves receiver revision
  `fairway-button-receiver-00024-659` and Admin revision
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

**Current production public-menu state (verified 2026-10-12):** published
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

With the environment verified, build from the canonical checkout using the device-specific provisioning workflow. Select a fresh output directory outside both the checkout and local secrets directory; the command refuses to reuse an existing path. Replace `FRB-XXXX` with the intended permanent Device ID and choose a unique output-directory name:

```sh
DEVICE_ID=FRB-XXXX
SECRETS_DIR=<workspace>/nfed/samples/fairway_power_sandbox/src/secrets
OUTPUT_DIR="$HOME/fairway-builds/fairway-${DEVICE_ID}-validation-01"

python3 <workspace>/nfed/scripts/build_device_firmware.py \
  --device-id "$DEVICE_ID" \
  --secrets-dir "$SECRETS_DIR" \
  --output-dir "$OUTPUT_DIR" \
  --ncs-install-dir "$NCS_INSTALL_DIR"

python3 <workspace>/nfed/scripts/verify_device_artifact.py \
  --device-id "$DEVICE_ID" \
  --artifact "$OUTPUT_DIR/fairway-${DEVICE_ID}-merged.hex" \
  --manifest "$OUTPUT_DIR/fairway-${DEVICE_ID}-manifest.json" \
  --secrets-dir "$SECRETS_DIR"
```

The builder invokes West against the installed NCS v3.1.1 SDK and preserves the established board target, explicit `BOARD_ROOT`, `prj_a.conf`, debug-thread build options, and sysbuild/MCUboot board-root propagation. It requires an exact target-named input `FRB-XXXX-fairway_device_key.h`; it never silently falls back to a generic header. A retained legacy generic input may be selected only by explicitly adding `--input-file "$SECRETS_DIR/fairway_device_key.h"` to both commands; the tool validates its ID and rejects competing target-named input.

The builder checks input identity, uniqueness, credential format, permissions, and symlink/path constraints before build; then verifies the credential and Device ID in the actual merged Intel HEX image. It writes a manifest containing the source revision/state, firmware-source SHA-256, build command, toolchain/configuration, and artifact hash/size, without recording the credential or its digest. The verifier rereads the selected protected input and independently checks artifact bytes and embedded identity/credential. This comparison does not establish a production backend-verifier match.

The output directory is created with mode `0700`, and its files are restricted to owner access. During the build it contains credential-bearing generated headers and intermediates; after successful artifact verification the builder removes that intermediate build tree and retains only the merged image, manifest, and checksum. Handle the complete retained output as secret material, keep it outside `nfed`, and do not commit or broadly distribute it. A failed build may leave a protected partial tree; use a new output path for a retry. Existing output directories are rejected, so a known-good image cannot be silently overwritten. Do not flash or activate a pending backend credential as part of this local build procedure.

The firmware application includes the generated selected header ahead of other include paths. CMake also requires an explicit target Device ID and target-named or explicitly selected generic input, checks for duplicate/invalid definitions and rejects symlinks. Use the builder rather than invoking `west build` directly so permission, provenance, output-protection, and artifact checks are not bypassed.

The device-specific builder uses a fresh, private build directory for each run and removes it only after artifact verification succeeds. Retain the final protected artifact and its provenance/hash in the existing Firmware Generation Registry only when required as canonical validation evidence; do not retain or reuse a build tree as an evidence record.

The builder produces `$OUTPUT_DIR/fairway-${DEVICE_ID}-merged.hex` and its manifest/checksum. Treat the manifest as the build provenance record and retain it with the exact artifact. Before any separately authorized flash, rerun the verifier command above against that exact output path; do not substitute an artifact from another build directory.

The application `samples/fairway_power_sandbox/sysbuild.cmake` propagates the tracked Fairway board root to the MCUboot child image. This is required for the custom `circuitdojo_feather_nrf9151` board to resolve consistently during the sysbuild build.

### Flash Procedure

The current Fairway programming path is probe-rs. In USB/debug/service mode, disconnect V25/V50/V75 field power and PPK2 before connecting Feather USB. Prototype 3.3 field and USB development/service configurations are mutually exclusive, as specified by `docs/HARDWARE_ASSEMBLY_GUIDE.md`.

After separate CPO authorization to flash, program the verified Intel HEX artifact:

```sh
probe-rs download --chip nRF9151_xxAA --binary-format hex <merged.hex>
```

This whole-image command programs every address range present in the merged
HEX, including its MCUboot bootloader. It is not approved for FRB-0003 while
preserving the installed bootloader; use only a separately validated
application-only artifact for that path. Replacing FRB-0003's bootloader
requires separate CPO authorization.

Successful programming is indicated by probe-rs completing erase and programming and reporting completion. After successful programming, a normal reset may be issued:

```sh
probe-rs reset --chip nRF9151_xxAA
```

Debug-access recovery for this procedure (including the non-destructive service-entry response and the exceptional destructive erase-all) is owned by the "USB/VBUS Service-Mode Debug-Lock Prevention and Exceptional Recovery" section below; there is no separate normal recovery-diagnostic step as part of ordinary flashing.

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

### USB/VBUS Service-Mode Debug-Lock Prevention and Exceptional Recovery

The current accepted engineering strategy is prevention, not recovery. The implementation is owned by `docs/FIRMWARE_SPECIFICATION.md`: the reference nRF9151 device is within the silicon family covered by Nordic Errata 36, and Fairway firmware keeps the application CPU out of Zephyr idle/WFI for as long as USB/VBUS is present. This was directly validated to preserve ordinary probe-rs access across the tested service interval. Ordinary Fairway flashing remains the normal `probe-rs download` procedure above; no separate recovery architecture is part of normal development workflow.

A bounded investigation into a separate field→USB debug-access gap (probe-rs access unavailable after actual field-powered operation, before USB was reconnected) found that a Fairway-owned TF-M secure-service reapply mechanism does not close this gap: it was implemented, built, and hardware-tested, and failed its physical acceptance criterion even after separately confirming `UICR.APPROTECT`/`UICR.SECUREAPPROTECT` were provisioned `HwUnprotected` on the test device. That experimental implementation has been fully removed from the codebase and is not current firmware architecture.

#### Non-Destructive Service-Entry Response

Direct CPO-confirmed physical validation established a non-destructive response to this specific condition, validated on a second tested instance during the WP4 physical-validation campaign in addition to the original tested instance:

1. Connect USB using the installed generation's safe power-isolation procedure in `docs/HARDWARE_ASSEMBLY_GUIDE.md`: for Prototype 3.3, disconnect V25/V50/V75 field power first. The 6106/J4 isolation instruction applies only to the historical 3.2 architecture; its solar/LiPo side may remain connected to the 6106 when following that historical procedure.
2. Attempt the normal `probe-rs` operation (for example `probe-rs reset --chip nRF9151_xxAA`).
3. If the established AP/DRW access fault occurs (for example "Failed to read register DRW"), press the Circuit Dojo nRF9151 Feather physical RESET button once.
4. Verify recovery using a non-resetting check rather than another reset, for example:

```sh
probe-rs info --chip nRF9151_xxAA
```

A successful CoreSight/AP walk (including the AP that previously faulted) confirms recovered access without needing to issue and risk-reproducing another reset.

Do not repeatedly issue `probe-rs reset` solely to test whether access has recovered; use the non-resetting check in step 4 instead. Do not escalate automatically to destructive erase/recovery/APPROTECT-unlock actions when this non-destructive response succeeds; destructive recovery remains exceptional and separately authorized, as described below.

This response required no erase, no reflash, and no UICR modification during service entry, and used no recovery utility. This is not a recovery architecture; it is the current non-destructive first response to this specific condition. It has now been validated on two tested instances; reliability across repeated field→USB cycles is not yet established.

If a development reference Feather nevertheless remains AP-inaccessible after the above response, destructive erase-all is an exceptional, manually authorized recovery action only, using the currently established command:

```sh
~/.zephyrtools/recovery/recovery --unlock-only
```

This command is destructive and requires explicit authorization before use. After an authorized erase-all, normal Fairway flashing and provisioning is required to restore the device.

#### Serial/UART Console — Current Truth

No canonical host USB serial-console path has yet been established for the current Mac + CMSIS-DAP composite-probe arrangement. During the WP4 physical-validation campaign:

- The composite CMSIS-DAP probe enumerates multiple serial nodes (for example, distinct `/dev/cu.usbmodem...` entries) in addition to its debug/SWD function.
- The numeric `/dev/cu.usbmodem...` suffixes are assigned by the host per connection/enumeration and are ephemeral; they must NOT be treated as a canonical, stable interface identity across sessions.
- One such interface was unavailable/busy (held by another process) at the time of investigation.
- One accessible interface produced no output at 115200 8N1 across a reset.
- Another reset-reactive interface (i.e., one that produced activity correlated with a device reset) produced binary/non-console data at 115200 8N1, not readable Zephyr log text.
- Enumeration and reset-reactivity alone therefore do NOT prove a given host interface is the Feather's Zephyr UART console; none of the interfaces tried were confirmed as a working console path.

Canonical operational rule: do not hunt-and-peck across arbitrary `/dev/cu.*` ports, arbitrary baud rates, or parity/framing combinations to find a working console, and do not attempt to work around this by changing `.vscode` settings or shell configuration. If direct UART logs are genuinely required for a task, first verify the physical UART bridge/wiring between the debug probe and the Feather console UART with the CPO. Only after a readable console is physically established should this Guide be updated with the exact Feather UART pins, bridge wiring, probe interface identity, baud, data bits, parity, stop bits, flow control, a deterministic macOS interface-selection rule, and the exact known-good console command. An unverified current USB serial path must not be documented here as canonical.

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
- `POST /api/v1/admin/devices` for permanent-ID allocation and one-time credential issuance
- `POST /api/v1/admin/devices/{deviceId}/credential-recovery` only when a partial provisioning event left that exact Device without a credential
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

Deployment process status:

Repository-controlled artifacts define web build behavior and the production
Hosting deployment commands above were validated on 2026-10-13. The final
production release and verification evidence are recorded in the Pilot 1.1
alignment entry above; sandbox Hosting remains separately targeted.

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

---

## Device Provisioning Dependencies

Device provisioning procedures are out of scope for this deployment owner document.

Owned by:

- `docs/DEVICE_PROVISIONING_GUIDE.md`

Related planning reference:

- docs/feature_backlog.md

---

## Operational Verification

Full-system or pilot operational validation is broader than backend deployment
validation. When that scope is authorized, the sequence is:

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

A full-system or pilot operational validation is complete only after all six
steps succeed. A bounded backend deployment can be validated against its own
approved backend acceptance criteria without claiming unperformed operator UI
validation.

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

### Pilot 1.1 controlled recovery

**Historical release-specific procedure; not exercised, not a current blanket
rollback instruction.** Revalidate targets and compatibility for each newly
authorized release. No production rollback was
performed to prepare this procedure. It is not evidence that the Pilot 1.1
release or any rollback target has been operationally validated.

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
