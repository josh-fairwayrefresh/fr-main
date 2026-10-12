# Feature Backlog

This document is the canonical engineering feature backlog for Fairway Refresh.

Detailed truth for completed features belongs in the appropriate owner
documents. Completed work packages may remain in the Current Sprint table
through sprint closeout for status traceability; they are removed when they no
longer serve current sprint tracking and do not remain indefinitely as future
backlog items.

## Completed: Embarrassingly Small Runtime — Stable Pilot Baseline 1.0

The accepted runtime retains the Prototype 3.2 golfer UX, scoped-awake execution, authenticated bounded HTTPS, fixed five-minute demand window, exact correlated COMPLETE, Cart Operator behavior, and fleet/lifecycle/provisioning Admin. Battery-health checks/reporting and Device Health firmware/backend ingestion are abandoned. CPO-confirmed Prototype 3.3 hardware uses interchangeable Voltaic V25/V50/V75 regulated-output packs; FRB-0003 operation was validated with V75. Continuous VBUS uses the existing service-awake policy, accepted for the initial pilot. Detailed baseline evidence belongs in the hardware, firmware, deployment, and provisioning owners.

| WP | Work Package | Status | Notes |
|----|---------------|--------|-------|
| WP1 | Current-state architecture inspection | Complete | Read-only investigation; findings reconciled into `docs/DEVICE_PROVISIONING_GUIDE.md`. |
| WP2 | Fleet data foundation (Customer -> Course -> Device) | Complete | Canonical Customer/Course/Device schema and centralized ID allocation (`fairway_backend/cloudrun_receiver/lib/fleet/`); see `docs/DEVICE_PROVISIONING_GUIDE.md`. Supersedes former backlog items "Multi-device provisioning," "Device-to-SIM registry," and "Course configuration." |
| WP3 | Per-device credentials spike | Complete | Per-device credential generation/verification and canonical identity implemented (`fairway_backend/cloudrun_receiver/lib/fleet/credentials.js`); Device schema normalized to remove duplicate `device_id`/`hole`/`label`/`active` fields (derived from the Firestore document ID, `location`, and `state` instead); Customer/Course hierarchy corrected to nested `customers/{customerId}/courses/{courseId}` storage with `customer_name`/`course_name` synchronized display copies on Device. Live migration completed: `customers/CUST-0001`, `customers/CUST-0001/courses/COURSE-0001`, and `devices/FRB-0001` (with issued production credential) now exist in production Firestore; legacy `devices/frb-0001` and `devices/pv4` removed; obsolete fleet-wide `FAIRWAY_DEVICE_KEY` Cloud Run environment variable removed. Physically validated end-to-end via a real button press producing a successful, correctly-attributed persisted request. See `docs/DEVICE_PROVISIONING_GUIDE.md` ("Existing Reference Device: FRB-0001") for the full record. Supersedes former backlog item "Device authentication." |
| WP4 | Historical Device Health work | Abandoned | Historical validation remains recorded in owner documents. Battery-health checks/reporting and current-source Health acquisition/ingestion are abandoned; the active restored Admin/Hosting legacy history reader is a deployment divergence, not a feature in progress. |
| WP5 | Fleet/device administration UI | Complete | Customer/Course hierarchy, provisioning, deployment assignment, lifecycle, SIM/comments, commissioning/service, verified identity provenance, and export remain. Health workflows are retired from current source; the active restored Admin/Hosting deployment retains a legacy Health-history reader as recorded in `docs/DEPLOYMENT_GUIDE.md`. |
| WP6 | Alert engine | Retired | Health-derived thresholds, missed-report detection, and notifications are not current product scope. |
| WP7 | Second-device deployment spike | Complete | FRB-0002 remains the validated Prototype 3.2 field reference. Historical Health commissioning evidence does not imply a current Health runtime. |
| WP8 | Firmware modular decomposition + physical validation | Complete | `main.c` decomposed into single-responsibility modules (`button_ux.c`, `golfer_txn.c`, `golfer_protocol.c`, `http_transport.c`, `modem_service.c`, `power_policy.c`, `transaction_scheduler.c`; `command_protocol.c` extended to own both directions of the COMPLETE wire protocol); no protocol or product-behavior change. CPO-confirmed physical validation on FRB-0002: golfer button press reached the operator dashboard with a valid `request_id`, and a CPO-initiated COMPLETE command was polled, acknowledged, and cleared the active demand window. See the Firmware Generation Registry in `docs/FIRMWARE_SPECIFICATION.md` ("Embarrassingly Small Runtime (Health Retirement + Modular Rewrite)"). Repeat-press transport/persistence and Prototype 3.3 PPK2 consumption characterization remain outstanding; local five-minute repeat feedback has prior FRB-0002 validation. |

## Completed (Sandbox-Accepted): Cart Inventory Management & Golfer Menu — Increments 1–2

**Status:** Inventory backend/UI and the separate Admin API are deployed to the
isolated sandbox and tested against real Firestore. Sandbox Hosting is deployed
at `https://fairway-refresh-sandbox-260930.web.app`; direct route smoke checks
passed. Both permanent pilot Auth identities are activated using passwords
entered through the hidden local terminal flow, have equal course memberships,
and have no global Admin claims. The 57 imported active On Cart products and
stable public API slug are present in sandbox. The sandbox menu remains
unpublished. On 2026-10-11 the CPO reviewed and accepted the current deployed
Inventory UI as a stable development baseline; this is not sprint completion.
The Inventory board uses a
horizontal All Products/top-level category filter across the unchanged three
state columns, a USD-only Price ($) input, separate edit/publish action groups,
automatic server synchronization, and a title without internal IDs. Production
was unchanged at this sandbox-acceptance point; the subsequent live public-menu
release and catalog correction are recorded below.

**Final CPO acceptance — 2026-10-12:** following the Cart UI / Inventory
integration (unified Cart-first login, Cart-to-Inventory navigation), the
four post-acceptance corrections (Cart-first entry enforcement, category
management/deletion, the Add Product button fix, subcategory filtering),
and the archived-product deletion bug fix below, the CPO completed a full
sandbox browser acceptance pass and confirmed the functionality works. This
sandbox-accepted implementation is the new canonical Git baseline on `main`.
At sandbox acceptance, production deployment, Google Sites embedding, testing
the two existing Monarch Bay staff accounts, and public-menu publication were
still outstanding. The CPO subsequently authorized the first live menu release
and its catalog correction; current release state and remaining limitations
are recorded below and in `docs/DEPLOYMENT_GUIDE.md`.
Detailed deployment and validation evidence are in
`docs/DEPLOYMENT_GUIDE.md`; user behavior is owned by `docs/UX_SPECIFICATION.md`.

Real Firestore membership checks, product import/persistence, concurrent
last-committed-save-wins edits, and draft/public isolation were exercised.
At sandbox acceptance, actual commit-failure rollback had not been tested
against real Firestore because the CPO had reserved the first publication for
hands-on testing. The in-memory atomic-failure test is distinct evidence and
is not represented as a live transaction test.

Customer-scoped Cart UI authorization/navigation integration (unified Cart
login covering `/`, `/requests/{requestId}`, and `/inventory`; the Cart
banner's conditional Inventory link; and an explicit Inventory-to-Cart
Operations return control) is implemented, sandbox-deployed, automated/API-
verified, and CPO-accepted in the browser: see `docs/DEPLOYMENT_GUIDE.md`
("Cart UI / Inventory Integration" and "CPO browser acceptance —
2026-10-11"). A pre-existing sandbox receiver gap (missing VAPID
configuration, unrelated to Inventory) was found and fixed during this
acceptance pass. Existing Cart request behavior was preserved. This
integration milestone is accepted and preserved unchanged by the
corrections below.

During that acceptance pass the CPO identified four remaining corrections,
implemented additively on top of the accepted integration (not a redesign):
Cart UI is now enforced as the permanent customer entry point so a
completed sign-in on `/inventory` always lands on Cart Operations first; a
category management card with a protected, course-scoped Delete Category
action was added; the Add Product button's duplicate plus sign was
corrected to read exactly "+ Add Product"; and a second subcategory filter
row was added below the category filters. See `docs/DEPLOYMENT_GUIDE.md`
("Post-Acceptance Corrections — Cart-First Entry, Category Management,
Product Button, Subcategory Filters") for implementation, validation
(backend 74/74, frontend 39/39 tests; real-sandbox-data verification of the
deletion rule), and sandbox deployment detail. CPO acceptance testing then
found a real deletion bug (an archived product silently blocked deleting an
otherwise-empty category, contradicting the UI's own displayed count); this
was root-caused against real data, fixed so the backend's emptiness check
matches the UI's active-only count, covered by a new regression test, and
redeployed; the CPO's stuck test category was deleted using the corrected
code. The subcategory row was also confirmed, against real data, to be
working as designed but visible only for "Craft Beers" (the only category
with subcategorized products in the real catalog) — see
`docs/DEPLOYMENT_GUIDE.md` for full detail on both findings. These four
corrections, and the fix above, are sandbox-deployed, automated/API-
verified, and **CPO-browser-accepted (2026-10-12)**.

**First live public menu release — 2026-10-12.** The CPO authorized a
production release of the public Cart menu for Monarch Bay GC / Tony Lema
Course, completed as one workflow from the accepted commit `db183a1`. This
required discovering and resolving a real production data gap (the
Inventory catalog only existed in sandbox, and production's real Monarch
Bay course is `CUST-0001`/`COURSE-0001`, not sandbox's `CUST-0003`/
`COURSE-0002`); the CPO explicitly authorized importing the same approved
57-product CSV into production's real course. The initial publication was
version 1 (57 products, all On Cart); following the CPO-requested category
correction it was republished as version 2. Version 2 is the current live
snapshot, with 57 products across six categories, verified by real-browser
validation at
`https://app.fairwayrefresh.com/cartmenus/monarchbay_tony_lema_course`.
See `docs/DEPLOYMENT_GUIDE.md` ("First Live Public Menu Release — Monarch
Bay GC / Tony Lema Course") for full detail, including the Google Sites
embedding gap at the originally-targeted `www.fairwayrefresh.com` address
(a separate, non-engineering action) and confirmation that Cart Operations,
existing production data, and existing user/course permissions were
unaffected at the time of this menu release; the later shared user-access
migration and deployment are recorded below. Google Sites embedding and
validating the two existing Monarch Bay staff accounts through this integration
remain separate activities.

The CPO-resolved mappings are applied in
`docs/catalogs/monarch-bay-inventory-import.csv`: “Seltzers” is under Canned
Cocktails, Candy is under Food, and the stray leading “s” is discarded.
Product names are preserved exactly. The normalized file contains
57 product rows; every product starts On Cart, and no brands, descriptions, or
prices were invented. The source attachment is not copied into the repository.
USD currency code confirmation is still needed before entering any non-null
price; the current import leaves all price fields blank.

**Unified customer and staff authorization — deployed 2026-10-12.** The two
application entry points remain Cart UI and internal Admin UI; Inventory is a
Cart UI feature. Production and sandbox now use the shared
`user_access/{uid}` record for the two user classes (`customer_staff` and
`fairway_staff`) and explicit course assignments. Assigned customer users
receive all customer-editable Cart UI features for those courses; course
isolation remains enforced, and customer class never grants Admin access.
Legacy Operator and Inventory records were migrated into the new records and
remain only as historical migration inputs. Backend/frontend regressions
passed (80 backend, 40 frontend); production and sandbox builds passed.
Production services are serving receiver revision
`fairway-button-receiver-00024-659` and Admin revision `fairway-admin-00012-52t`;
sandbox serves receiver revision
`fairway-button-receiver-sandbox-00008-xpf` and Admin revision
`fairway-admin-sandbox-00004-9jp`. Hosting and Firestore Rules were deployed
in both environments. Existing Firebase Auth accounts, passwords, and claims
were not changed.

At migration time, production had one customer-class Monarch test account with
no Course assignment; the second expected test account was absent. By later
CPO direction, the remaining Monarch-prefixed account and its empty access
record were deleted. The three enabled Fairway staff Auth accounts were
verified and preserved. Future customer accounts require explicit Course
assignment; email prefixes do not authorize access.

**Authorization and notification source completion — 2026-10-12; sandbox
deployed, production deployment pending.** Fairway staff now resolve all Courses from the canonical catalog
for Cart and Inventory, while customer staff remain restricted to explicit
assignments. Admin remains internal-only. Per-user/per-Course notification
preferences are persisted independently; dispatch rechecks current course
entitlement and the saved preference before sending. Frontend request
listeners and backend dashboard reads operate course-by-course for global
staff, avoiding a multi-course query limit.

The source regression suites passed (80 backend, 44 frontend), and the
sandbox-configured frontend build passed with a large-bundle advisory.
Sandbox receiver `fairway-button-receiver-sandbox-00009-d4g`, Admin/Inventory
`fairway-admin-sandbox-00005-cff`, Firestore Rules, and Hosting were deployed.
Cart, Inventory, and Admin SPA routes returned `200`; unauthenticated operator,
Inventory, and Admin APIs returned `401`. Production still serves the
previously listed revisions; production deployment remains outstanding. The
separate production-only Web Push notifier was not redeployed, and no sandbox
notifier/VAPID configuration exists, so dispatch-time preference enforcement
is currently covered by tests rather than live delivery. The
deleted Monarch test account cannot be used for authenticated customer browser
acceptance; create and assign a new test identity when that check is needed.
No Fairway staff Auth account or production Rules/service traffic was changed.

## Future Backlog (Post Fleet Administration)

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
| 9 | Prototype 3.3 pilot-build validation / deployment | FRB-0003 has CPO-confirmed functional operation. Endurance, VXX pack autonomy, and five-device fleet validation remain outstanding; do not carry the superseded 5580/J4 battery-health path forward as a 3.3 rollout requirement. |
| 10 | NCS 3.4.0 migration — Post-Field Deployment | Retain the existing gate: current engineering/feature backlog complete AND pilot units deployed and operating successfully in the field. Then evaluate migration from NCS 3.1.1 to NCS 3.4.0 and reassess Nordic Errata 36 / AP-protect handling using supported newer-SDK mechanisms. Revisit VBUS-dependent BUCK2, awake-keeper, and modem PSM policies if measured evidence justifies it; preserve validated behavior. Erase-all/debug recovery improvements remain low priority unless they obstruct deployment. |
| 11 | Prototype 3.3 consumption and VXX pack autonomy | Measure actual idle and transaction consumption with PPK2 at an explicitly documented 3.3 boundary, isolating other supplies. Evaluate V25/V50/V75 pack runtime from measured evidence before deciding whether power optimization is necessary. Continuous VBUS currently retains BUCK2, the awake keeper, and PSM requested off; do not assume a dormant-current target or independent USB-host detection. Preserve the unresolved historical 5580/6106 idle regression (approximately an order of magnitude versus LP 1.2 ~23.25 uA) in its original 3.2-era context; it is not a measurement or diagnosed cause of 3.3 consumption. |
| 12 | Repeat-press transport and persistence | Transport firmware-local in-window repeat presses and atomically update the originating request's `repeat_press_count` and `last_repeat_press_at`. This is separate deferred work; Stage B2 COMPLETE is implemented and validated. |
| 13 | Pilot COMPLETE-check cadence reevaluation | Reevaluate the period between completion checks using pilot field evidence. The implemented 15-second active-window period is an explicit pilot hypothesis, not a permanently optimized production constant; active-window energy characterization is not an acceptance criterion for the Stage B2 implementation itself. |
| 14 | COMPLETE no-ack root cause (pending correlation log evidence) | FRB-0002 demand windows have been observed polling reliably (no internal gap over ~53s across dozens of consecutive polls) for up to the full five-minute window, then expiring with no acknowledgement ever recorded. The specific correlation-failure reason was not previously observable from existing logs. Structured correlation logging was added and deployed 2026-10-06 (`fairway-button-receiver-00022-wxk`; see `docs/DEPLOYMENT_GUIDE.md`) to capture the exact reason on the next occurrence. No root cause is established yet. |
| 15 | Later sprint: retire/refine residual battery-health apparatus and legacy Health history | Battery-health checks/reporting are abandoned. The CPO accepts Stable Pilot Baseline 1.0 unchanged now and has no requirement to retain old Health data or the ability to host/display it. In a later sprint, assess and remove or repurpose any residual 5580/MAX17048 apparatus as applicable, retire the legacy Admin/Hosting Health-history reader, and determine a bounded deletion approach for historical Health records. No physical, hosting, or data changes are authorized by this backlog entry; preserve current Pilot 1.0 operation until that later work is separately scoped and authorized. |
Historical alternatives (TMUX1101, MAX4544, switched-SAADC/divider paths) remain archived and are not active backlog items for the current pilot-build architecture.

## Abandoned Development

The Course-configurable golfer demand-window candidate and its supporting
backend/Admin contract and firmware protocol changes were abandoned by CPO
direction on 2026-10-10 after they did not deliver an accepted working feature.
Automated checks and a clean application build had passed, but did not establish
successful integrated operation. Source and tests are retained for provenance
on `archive/firmware/modular-golfer-demand-window`; they are not active backlog
work or approved for deployment. Temporary connectivity/LED diagnostic variants
are not product features; their relevant observations remain historical evidence
in `docs/FIRMWARE_SPECIFICATION.md`.
