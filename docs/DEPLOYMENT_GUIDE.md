# Deployment Guide

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
traffic. The revision identifies that validation event only; deployment and
operational procedures target the durable service name, not a permanent
revision ID.

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
| Cloud Run Revision | `fairway-button-receiver-sandbox-00002-vh7` (100% traffic at validation) |
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
configuration. The sandbox Auth record for `admin@fairwayrefresh.com` has the
`admin: true` custom claim; this is a sandbox-local UID and does not establish
or modify a production claim. Firestore rules and indexes were deployed from
the repository. The runtime identity has `roles/datastore.user`; the sandbox
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
| Current Restored Admin Revision | `fairway-admin-00008-sjt` (100% traffic as of 2026-10-06) |
| Admin API URL | `https://fairway-admin-936892386735.us-central1.run.app` |
| Runtime Identity | `fairway-admin-prod@savvy-kit-496703-r5.iam.gserviceaccount.com` |
| Runtime IAM | `roles/datastore.user` only |
| Allowed Browser Origins | `https://savvy-kit-496703-r5.web.app`, `https://app.fairwayrefresh.com` |

The production services use the canonical fleet modules in
`fairway_backend/cloudrun_receiver/lib/fleet/` through dedicated Admin and
receiver targets. Runtime initialization requires `FAIRWAY_ENV=production`, an
explicit supported `FAIRWAY_SERVICE_MODE`, and both project variables equal to
`savvy-kit-496703-r5`. Admin mode additionally requires the exact production
origin allowlist (Firebase Hosting and `app.fairwayrefresh.com`); receiver mode
rejects any Admin browser origin. The Admin target
exposes only `/api/v1/admin/*`, and the receiver returns `404` for that surface.
Every Admin request requires a production Firebase ID token with the
server-verified `admin: true` claim. Production `admin@fairwayrefresh.com`
retains its password provider and has that claim. Responses use `no-store`,
exact-origin CORS, allowlisted fleet DTOs, and credential-verifier redaction.

Web application entry is role-specific while sharing the same persistent
Firebase Authentication session. `/admin` is the first-class Admin entry: it
checks the signed-in user's `admin: true` claim and renders the Admin UI without
calling operator bootstrap. `/` and `/requests/{requestId}` are Cart Operator
entries: they call `/api/v1/operator/bootstrap` and require an enabled
`operator_course_assignments/{uid}` record. Entry path selects the initial mode;
neither role requires the other role's authorization. An authenticated Admin
without an operator assignment can therefore use `/admin`, while an operator
without the Admin claim receives an access-denied response at `/admin`. Login
and redirect flows retain the current path and query so Admin entry and operator
notification deep links return to their original destinations. Backend claim,
assignment, and Firestore Rules enforcement remain the security boundaries.

Admin revision `fairway-admin-00007-znz` corrected the custom-domain CORS
configuration after mobile Admin requests from `app.fairwayrefresh.com` were
rejected while the Firebase Hosting origin succeeded. Production now reflects
only the exact matched canonical origin. Preflight returns `204` for both
canonical origins and `403` for an arbitrary origin; unauthenticated requests
from either canonical origin retain the expected `401` boundary. The receiver
was not deployed or changed by this correction. The CPO refreshed the existing
authenticated mobile Admin session on `app.fairwayrefresh.com` and confirmed
that the production fleet loaded without the prior `Load failed` state.

The current Admin source supports Customer/Course create and edit, Course
timezone and service schedule, permanent Device provisioning and bounded
one-time credential recovery, atomic Customer/Course/location deployment
assignment, lifecycle state, SIM/comments, service and commissioning records,
read-only verified hardware/firmware identity, and Device-to-SIM export.
Hardware revision and firmware generation start unknown at provisioning and may
be established only by controlled verified provenance. Neither field can be
changed through an administrative metadata route. Battery-health checks and
Device Health reporting are abandoned; current source has no active Health
workflow. The active restored production Admin/Hosting artifacts predate the
Health retirement and retain a legacy Health-history read surface over old
stored records. It does not establish that current firmware is reporting health
or that the source/runtime owns an active Health product feature.

### Restored Matched Stable Deployment — 2026-10-06

Following rejection of the unvalidated firmware transport candidate, production
Admin and Hosting were restored to the retained 2026-10-01 stable revisions that
were current before the 2026-10-06 Admin/Hosting redeployments. Firestore was not
modified. The restored UI again reads the persisted FRB-0002
`device_health`-provenance identity, commissioning metadata, and the existing
Device health-history endpoint. The receiver was not rolled back; it remains on
the accepted `9775842`-matched backend revision with additive COMPLETE
correlation logging.

Previously unresolved deployment/source divergence, now accepted by the CPO (2026-10-10): the restored Oct 1
Admin API and Hosting artifacts predate the `0daf02d` Health-retirement source
checkpoint and include the legacy Health-history read surface. Exact
Admin/Hosting source correspondence to current repository source remains
unverified. The CPO accepts the deployed Pilot 1.0 state unchanged; this is not
a blocker requiring a source-matched redeployment. Battery-health checks and
reporting are abandoned, and the stable firmware/receiver source produces no
new Health samples. The old history reader/data are residual legacy capability,
not current monitoring. There is no requirement to retain or host that legacy
Health data; removal/refinement is deferred to a future sprint. Do not change
production or delete records as part of the accepted Pilot 1.0 state.

| Surface | Restored/current production identity | Provenance |
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

- Production traffic is 100% on `fairway-button-receiver-00022-wxk`; latest-ready `00023-dff` receives no traffic. Existing FRB-0003 activity is recorded on `00022-wxk`.
- Revision annotations identify Cloud Build `6a448151-0523-4009-a1a1-f6ebe33967fe`; its successful output matches the serving image digest `535fe5e874dbc0a4aefc95981b35073b49a68fd4b21069e6fa7dc3fbb77dd8cf` recorded above.
- The revision pins source archive `gs://run-sources-savvy-kit-496703-r5-us-central1/services/fairway-button-receiver/1791276191.783936-5af0e81b6f4f4957867829a308b0db45.zip#1791276191998024`, SHA-256 `63adb75dbf293772cfc211a1e06345276aeb2a1314f55c7a37d0373e06a51f40`. All 29 packaged files match `8686eeb:fairway_backend/cloudrun_receiver` byte-for-byte, with no extras; only tracked `.gcloudignore` is omitted from the archive. `9775842` has the same backend tree.
- The baseline pairs that receiver with accepted `6a19f83` firmware and CPO-confirmed Prototype 3.3 / FRB-0003 operation. Naming it is not a new deployment. Receiver correlation logging is retained; later undeployed demand-window source introduced in `62a2122` is excluded from the baseline.

This verifies receiver source correspondence only. The restored Admin/Hosting
source-equivalence and Health-surface divergence described above remain
unresolved; neither receiver verification nor successful cart UI receipt proves
their source trees equal the baseline repository. Do not silently substitute
Admin/Hosting versions or change production to reconcile that distinction.

### Cart Inventory and Golfer Menu — Increment 1 Backend Contract

The Inventory backend foundation below exists in current repository source
only. It has not been deployed and does not change the accepted Pilot 1.0
device/request path. It is implemented within the existing dedicated
`fairway-admin` handler/runtime; this source integration is not evidence that
the currently deployed Admin image matches the repository source.

Inventory staff operations authenticate a Firebase ID token and authorize the
requested Customer/Course against `inventory_course_memberships/{uid}`. The
membership grants the same editor/publisher capability to each assigned course;
it is separate from global `admin:true` and from operator request access. Only a
global Admin can provision/revoke membership or configure a public menu slug.
Firestore rules remain closed to browser writes.

| Source route | Access | Contract |
|---|---|---|
| `GET /api/v1/inventory/bootstrap` | Inventory member | Returns only the member's assigned Courses. |
| `GET /api/v1/inventory/courses/{customerId}/{courseId}` | Course member | Returns course-level working products, categories, archives, revision, publication pointer, and draft status. |
| `POST .../categories`; `POST .../categories/{categoryId}/subcategories` | Course member | Creates normalized labels; equivalent normalized names reuse their existing IDs. |
| `POST .../products`; `PATCH .../products/{productId}`; `POST .../products/{productId}/archive` | Course member | Persists product state and actor. Exact normalized name/category/subcategory/brand duplicates are rejected. |
| `GET .../preview`; `POST .../publish` | Course member | Preview reads saved working inventory. Publish atomically stores a snapshot and advances the published pointer. |
| `GET /api/v1/public/menus/{slug}` | Public, read-only | Returns only the latest published snapshot; no staff identity or draft fields. |
| `PATCH /api/v1/admin/inventory-course-memberships/{uid}`; `PATCH /api/v1/admin/customers/{customerId}/courses/{courseId}/inventory-menu` | Global Admin | Provisions/revokes course membership and reserves the stable menu slug. |

Data is owned by the existing nested Course. `inventory/state` stores a
monotonic inventory revision and last-published pointer. `inventory_products`
stores working records; `inventory_categories` and nested `subcategories` store
canonical labels; `inventory_product_keys` protects exact product identity;
`inventory_events` records actor/action/revision; and
`published_menus/{version}` contains immutable public snapshots. Top-level
`inventory_course_memberships` and `public_menu_slugs` are access/routing
indexes, not alternate catalog authorities.

Each save transaction serializes on the course state document and increments
the revision, so the last transaction committed wins without locking, stale
write rejection, conflict warnings, or client-clock ordering. Publish reads the
course revision and products in one Firestore transaction, snapshots only
non-archived On Cart/Sold Out items, and commits snapshot, audit event, and
pointer together. A failed commit therefore preserves the previous published
version. The read-only public route resolves only the slug and published pointer;
it does not query the editable catalog or require staff authorization. Snapshot
payloads are bounded below the Firestore document-size limit.

The API/data contract is source-defined and locally tested. Increment 2 now adds
the Inventory and public-menu React routes for local validation; neither the
backend source nor these routes have been deployed. Membership records, slug
configuration, CSV import, and first publication are not populated. Pilot
account provisioning and import remain separate operations.

#### Increment 2 Local UI and Public Route

- `/inventory` uses the existing Inventory bootstrap/course APIs. Firebase
  authentication is followed by course-membership authorization; it does not
  require `admin:true` or Operator bootstrap. The existing Operator application
  shows an Inventory entry only when Inventory membership is present.
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
  `monarch_cart@fairwayrefresh.com` were created without passwords or custom
  claims. Both have enabled Inventory membership for only CUST-0003 / COURSE-0002;
  neither has global Admin privileges. The existing sandbox Admin was used for
  membership/import audit attribution. Use the deployed Inventory sign-in
  screen’s password-reset email flow for secure first sign-in; no password or
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
public API returns 404 until the first explicit publication. Use each approved
account's “Set or reset password” action on the Inventory sign-in page. The
reset email is delivered directly to that account; no password or reset link is
stored in this repository or report. After setup, sign in with
`monarch_fnb@fairwayrefresh.com` or `monarch_cart@fairwayrefresh.com`.

The refinement was deployed to sandbox Hosting after the initial Increment 2
release. Post-release HTTP smoke checks returned `200` for `/inventory` and
`/cartmenus/monarchbay_tony_lema_course`, `401` for unauthenticated Inventory
bootstrap, and `404` for the public API before first publication. Production
and the sandbox receiver were not changed. The public menu remains unpublished
until the CPO signs in and explicitly publishes from Inventory.

No Google Sites, DNS, production Hosting, production Cloud Run, production
Firestore, or IAM changes were made. Actual embedding inside Google Sites and
CPO hands-on acceptance remain outstanding.

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

With the environment verified, build directly against the installed NCS v3.1.1 SDK directory (`<ncs-install-dir>`), passing `<workspace>/nfed` as an explicit board root:

```sh
cd <ncs-install-dir>
west build \
  --build-dir <new-build-dir> \
  <workspace>/nfed/samples/fairway_power_sandbox \
  --pristine \
  --board circuitdojo_feather_nrf9151@1/nrf9151/ns \
  -- -DBOARD_ROOT=<workspace>/nfed \
     -DEXTRA_CONF_FILE=prj_a.conf \
     -DDEBUG_THREAD_INFO=On \
     -DCONFIG_DEBUG_THREAD_INFO=y \
     -Dfairway_power_sandbox_DEBUG_THREAD_INFO=On \
     -Dmcuboot_DEBUG_THREAD_INFO=Off
```

`-DBOARD_ROOT` is required so the installed NCS v3.1.1 workspace (whose own manifest does not include `nfed`) can resolve the Circuit Dojo `feather_nrf9151` board and Fairway's `sysbuild.cmake`-propagated MCUboot board root.

Routine development, diagnostic, and validation builds shall use a disposable/reusable `<new-build-dir>` rather than creating a persistent, uniquely named top-level build directory for each investigation; reuse or `--pristine` the disposable location as appropriate between materially different builds. A generated build directory is not an evidence-retention mechanism: if a build produces an artifact that must be retained as canonical validation evidence, preserve that artifact and its provenance/hash in the existing artifact/provenance record (see the Firmware Generation Registry in `docs/FIRMWARE_SPECIFICATION.md`) rather than retaining the generated build tree itself.

The build must exit successfully and produce `<new-build-dir>/merged.hex`.
Record the artifact path, byte size, SHA-256, board target, configuration, and source commit in the build provenance record before flashing.

Before flashing, verify the selected artifact against that provenance record. Do not substitute an artifact from another build directory.

The application `samples/fairway_power_sandbox/sysbuild.cmake` propagates the tracked Fairway board root to the MCUboot child image. This is required for the custom `circuitdojo_feather_nrf9151` board to resolve consistently during the sysbuild build.

### Flash Procedure

The current Fairway programming path is probe-rs. In USB/debug/service mode, disconnect V25/V50/V75 field power and PPK2 before connecting Feather USB. Prototype 3.3 field and USB development/service configurations are mutually exclusive, as specified by `docs/HARDWARE_ASSEMBLY_GUIDE.md`.

After separate CPO authorization to flash, program the verified Intel HEX artifact:

```sh
probe-rs download --chip nRF9151_xxAA --binary-format hex <merged.hex>
```

Successful programming is indicated by probe-rs completing erase and programming and reporting completion. After successful programming, a normal reset may be issued:

```sh
probe-rs reset --chip nRF9151_xxAA
```

Debug-access recovery for this procedure (including the non-destructive service-entry response and the exceptional destructive erase-all) is owned by the "USB/VBUS Service-Mode Debug-Lock Prevention and Exceptional Recovery" section below; there is no separate normal recovery-diagnostic step as part of ordinary flashing.

### Manual Validation

After separate CPO authorization for runtime/manual testing, perform only the validation appropriate to the approved operating mode.

For the validated field/measurement path:

1. Disconnect Feather USB before connecting the installed generation's approved field supply; Prototype 3.3 uses a V25/V50/V75 pack through the Perma-Proto rail directly to J1/3 VBUS. PPK2 consumption characterization remains deferred and must isolate other supplies. Follow `docs/HARDWARE_ASSEMBLY_GUIDE.md`; do not treat the historical VBAT measurement boundary as a 3.3 result.
2. Cold-boot the approved production image.
3. Confirm expected startup and dormant behavior described by `docs/FIRMWARE_SPECIFICATION.md` and `docs/UX_SPECIFICATION.md`.
4. Press the Fairway button once.
5. Confirm the expected request and LED sequence.
6. Confirm the device returns to its expected dormant state.

The accepted production field dormant-current result and its implementation context are owned by `docs/FIRMWARE_SPECIFICATION.md`.

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
- The deployed backend requires a Firebase bearer ID token on operator mutations, verifies it with Firebase Admin, and records the verified UID as `operator_id`. The active Cart Operator workflow has no CONFIRM interaction; COMPLETE, Cancel, Suspend/Resume, and dashboard-summary calls are restricted by enabled Course assignment. The WP5 admin API continues to require the out-of-band-assigned Firebase custom claim `admin: true` on every `/api/v1/admin/*` route and returns HTTP 403 before fleet reads or writes for authenticated non-admins.
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

- `operator_course_assignments/{uid}` is the server-owned operator entitlement.
  Each enabled record contains canonical `courses` for backend authorization
  and `course_ids` for Firestore Rules query authorization.
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
validate the operator webapp or its confirm/complete flow.

---

## Web Application Deployment

Repository-Derived and Historical Web Deployment Facts:

- Web app source path: fairway_webapp/cart_operator_dashboard/
- Production build command: npm run build:production
- Sandbox build command: npm run build:sandbox (package.json)
- Sandbox local dev command: npm run dev:sandbox (package.json)
- Firebase Hosting config present in firebase.json with SPA rewrite to /index.html
- Primary production application origin: `https://app.fairwayrefresh.com`
- Firebase Hosting origin: `https://savvy-kit-496703-r5.web.app`
- First-class entry routes:
  - `https://app.fairwayrefresh.com/admin` for claim-authorized production administration
  - `https://app.fairwayrefresh.com/` and `/requests/{requestId}` for Course-assigned Cart Operators
- Firebase Authentication sessions are shared across routes, but each route
  invokes only its own authorization path; Admin entry never depends on
  operator bootstrap.
- Validated WP5-S1 sandbox deployment command:
  - npx firebase-tools deploy --only hosting --project fairway-refresh-sandbox-260930 --non-interactive
- Validated production deployment command:
  - npx firebase-tools deploy --only hosting --project savvy-kit-496703-r5

Deployment process status:

Repository-controlled artifacts define web build behavior and the production
Hosting deployment command above was validated on 2026-10-01.

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
  - requests are readable only when the authenticated UID has an enabled
    `operator_course_assignments` record containing the request's `course_id`
  - Browser writes are denied by rules
  - Catch-all deny for other document paths

Repository-Derived collection usage in repository code:

- `customers/{CUST-XXXX}` (Customer records)
- `customers/{CUST-XXXX}/courses/{COURSE-XXXX}` (Customer-owned Course records)
- `devices/{FRB-XXXX}` (Device registry, metadata, state-derived communication permission, and credential verifier)
- `counters/CUST`, `counters/COURSE`, and `counters/FRB` (central ID allocation)
- `requests/{requestId}` (request creation, lookup, and status updates)
- `operator_course_assignments/{uid}` (server-owned operator/course entitlement)
- `course_push_subscriptions/{courseId}/subscriptions/{subscriptionId}` (private push subscription material)
- `notification_dispatches/{requestId}/subscriptions/{subscriptionId}` (effective-once dispatch state)

Collection schema is owned by the backend implementation.

Indexes:

- `fairway_webapp/cart_operator_dashboard/firestore.indexes.json` defines the deployed `requests` composite index required by demand-window-aware duplicate suppression (`device_id`, `status`, and `demand_window_expires_at`).

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
5. Confirm action succeeds and updates status.
6. Complete action succeeds and updates status/removes active item.

A full-system or pilot operational validation is complete only after all six
steps succeed. A bounded backend deployment can be validated against its own
approved backend acceptance criteria without claiming unperformed operator UI
validation.

The first production Cart Operator Web Push workflow was physically accepted on
2026-10-01 with FRB-0002 at Hole 2. One authoritative request
`clBCgv0UGm9jsBL1DIy6` was persisted at `07:32:36.169Z`; its one active iPhone
subscription dispatch was accepted on attempt 1 at `07:32:36.692Z`, 0.523
seconds later. The CPO observed exactly one visible notification, and tapping it
opened/focused the authenticated application at the actionable Hole 2 request.
A second physical press during the same demand window produced no additional
request or visible notification. The original request remained actionable.

---

## Rollback Procedure

No verified rollback workflow is currently documented in repository-controlled deployment artifacts or in the extracted historical Working State evidence used for this document.
Rollback procedure remains undefined in canonical deployment documentation at this time.

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
