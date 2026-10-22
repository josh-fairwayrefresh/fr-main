# UX Specification — Fairway Refresh Pilot 1.1

## Purpose and scope

This document distinguishes current externally observable golfer, Cart Operator,
Inventory, and public-menu behavior from explicitly labeled approved future
targets. It excludes implementation details such as
GPIOs, timing constants, firmware modules, and backend transport mechanisms.
The CPO confirms FRB-0001 through FRB-0005 passed physical end-to-end testing.
FRB-0006's firmware replacement and credential activation are complete.
Subsequent field testing demonstrated a successful button request and COMPLETE
rearm, but intermittent LTE/HTTPS failures leave sustained reliability
acceptance pending.
Deployment evidence and environment-specific acceptance limits are owned by
`docs/DEPLOYMENT_GUIDE.md`.

Purpose of the button marker UX
-------------------------------
- Provide a simple, immediate way for a golfer in the field to create a service request.
- Give clear, unambiguous feedback to the golfer that a request was received, transmitted, and processed.

## Golfer Button and Indicator Behavior

Golfer-facing indicators: **orange** (SENDING), **green** (REQUEST RECEIVED), **red** (TRY AGAIN). Indicator hardware identity and wiring are owned by `docs/HARDWARE_BOM.md` and `docs/HARDWARE_ASSEMBLY_GUIDE.md` and are not duplicated here.

### 1. Idle
- All three indicators are off.
- The button is enabled for a new golfer demand event unless the marker is inside its five-minute demand window (below).

### 2. Initial valid press / transaction underway
- A valid press begins the bounded golfer transaction (existing hard 15-second budget, unchanged).
- Orange begins immediately as the golfer-facing acknowledgement and pulses while the transaction is unresolved.
- The button does not initiate additional requests while this transaction is unresolved; additional presses during the unresolved transaction do not create another service request or another transaction.
- Internal transport retries remain implementation detail and do not represent additional golfer requests.

### 3. Successful request
- When Fairway successfully accepts the service request, orange ends.
- Green performs a blink-blink indication, followed by approximately 5 seconds of solid green.
- Success means the accepted golfer service request is represented in the Fairway operator workflow/dashboard.
- Successful acceptance starts the fixed five-minute demand window, measured from the initial physical button press.

### 4. Failed request
- If the transaction reaches terminal failure within the 15-second budget, orange ends.
- Red performs a blink-blink indication, followed by approximately 5 seconds of solid red.
- A failed transaction does not start a demand window.
- After the failure indication completes, the button is enabled again; the next valid press begins a completely new bounded golfer transaction.
- There is no long retry lockout.

## Five-Minute Golfer Demand Window
The accepted product behavior uses a fixed five-minute duration.

For the Monarch Bay Pilot, the five-minute duration from the initial physical press is the operational proxy for presses attributable to the same golfer group at that marker. This is a pilot product assumption, not a claim that every group occupies every tee box for exactly five minutes; per-hole and par-specific windows are not introduced.

After the originating request has succeeded, any subsequent valid physical button press during the stable five-minute window:

- immediately gives the golfer green feedback;
- does not show orange;
- does not initiate another network service-request transaction;
- does not create another operator-facing service request;
- remains locally associated with the originating accepted transaction;
- increments the firmware-local repeat-press count by one.

The firmware-local window and count are implemented. Transporting a repeat press and persisting it against the originating request are not yet implemented. The approved persisted factual metric remains `repeat_press_count`; "Frustration Presses" is a possible Admin-facing product interpretation/KPI label, not the canonical stored event meaning.

Operator COMPLETE creates a best-effort command for the exact originating request. If the marker learns of and acknowledges that matching command while the window is active, it terminates the window early and returns to normal eligibility for a fresh golfer request. Until then, or if the command is missing, delayed, stale, expired, mismatched, or unreachable, the in-window behavior continues and local expiry remains authoritative. The device expires locally without relying on further backend communication; backend request expiry starts at receiver receipt and can outlast the local physical-press deadline by initial request transit time.

### Approved End-to-End Example

- T=0:00 Group A initial press → orange → Request A accepted → green → the five-minute window begins.
- If Request A is not completed, an in-window press gives immediate green and remains associated with Request A; after the local configured deadline, a later press follows the normal orange transaction path.
- Alternatively, if the operator COMPLETES Request A before expiry, the marker ends Request A's local window after learning of and acknowledging that exact matching command.
- The next valid press after that acknowledgement follows the normal orange transaction path and may create a fresh Request B before the configured deadline.

Request A may still be active when Request B is created; that is valid. The operator may have multiple legitimate requests from successive golfer groups at the same marker/hole in the queue simultaneously.

## Product / Data Semantics (Approved End-to-End Target)

- The canonical analytical demand unit remains one successfully accepted golfer service request.
- Internal transport retries and repeat presses within the originating demand window must not inflate service-request volume.
- `repeat_press_count` belongs to the originating accepted request. The cart operator does not need to see each repeat press as a new request or notification.
- How repeat presses are communicated from the marker and persisted against the originating request is an engineering/implementation decision, not specified by this document; see `docs/feature_backlog.md`.

## Cart Inventory Management and Golfer Menu (Approved Product Behavior)

The current implementation and deployment status are owned by
`docs/DEPLOYMENT_GUIDE.md` and `docs/feature_backlog.md`.

- There are exactly two application entry points: Cart UI and Admin UI.
  Inventory is a feature within Cart UI. Both use the existing Firebase Auth
  session; Inventory does not have a separate login.
- In Admin User Management, an existing Auth user can be granted global Admin
  access, or assigned to one Customer and selected Courses. Leaving the Course
  selection empty means all Courses belonging to that Customer. An account
  without a valid assignment is denied access. Fairway Refresh staff can use
  Admin, Cart, and Inventory across all Customers and Courses; customer users
  can use Cart and Inventory only within their Customer/Course entitlement and
  cannot access Admin. Email naming is not an authorization rule.
- The authoritative settings are stored in `user_access/{uid}` as schema
  version 2: `admin`, `customer_id`, and `course_ids`. Technical validation and
  onboarding details are owned by `docs/DEPLOYMENT_GUIDE.md`.
- Whenever a global administrator opens or refreshes User Management, the
  Admin UI retrieves the complete Firebase Authentication directory from the
  Admin backend and reconciles it read-only with `user_access/{uid}` by UID.
  Each row is identified as **PROVISIONED**, **NOT PROVISIONED**,
  **CONFIGURATION ERROR**, or **ORPHANED RECORD**. An Authentication user
  without valid access remains unprivileged; an orphaned access record is
  shown but is not automatically repaired or deleted.
- Only an explicit administrator **Save** action may provision or change
  access for an existing Authentication user. A successful Save refreshes the
  unified directory. If complete retrieval fails, User Management shows an
  error and retry action instead of presenting a partial list as synchronized.
- The CPO accepted production User Management reconciliation and the
  Customer/Course user-access workflow on 2026-10-13. Deleting an
  Authentication identity may leave its Firestore access record visible as
  **ORPHANED RECORD**; cleanup is deferred until after the Monarch Bay pilot.
- Course assignment is the shared entitlement for Cart Operations and
   Inventory. Inventory has no separate membership or user class. An assigned
   user can view, add, edit, move, archive, preview, and publish products for
   that course; another course remains inaccessible unless separately assigned.
- One course-level catalog is shared across staff and carts. Each active
   product has exactly one state: **On Cart**, **Sold Out**, or **In Inventory**.
   Archived products are retained outside active inventory.
- Edits save automatically. Last saved edit wins. There are no edit locks,
   conflict warnings, approval roles, or change notifications in the pilot.
   Product changes and publications are attributed to the acting account.
- Saved working inventory does not change the public menu. Preview shows the
   current saved draft; only explicit Publish Menu publishes a coherent snapshot.
   A failed save is not reported as saved, and failed publication leaves the
   prior published menu available.
- Anonymous golfers scan a stable course QR URL and see only the last successful
   publication. On Cart products appear available, Sold Out products are marked,
   and In Inventory or Archived products are omitted. The menu is read-only and
   does not support ordering, checkout, requests, POS, or quantity tracking.
- Public menu category badges use category-appropriate icons; the
   Non-Alcoholic badge retains the text "NA".
- Product name and category are required; subcategory, brand, description, and
   price are optional. Blank prices remain blank. Approved CSV imports begin On
   Cart and preserve accepted names/category relationships without fabricated
   details.
- The Inventory entry at `/inventory` is a feature within the Cart UI: it uses
   the same shared Firebase Authentication session and the same standard Cart
   login presentation as Cart Operations, with no separate Inventory login
   screen. It requires Firebase sign-in and an explicit assignment to the
   requested course, the same entitlement as Cart Operations; it does not
   require the Fairway staff class. Assigned customer users may enter Inventory
   from the Cart application's Inventory link. Course assignment does not
   grant Admin access. The Inventory header provides an explicit "Cart
   Operations" control that returns to Cart Operations without re-authenticating.
   A sign-in that completes while on `/inventory` always lands on Cart
   Operations first, never directly on Inventory, consistent with the
   two-application-entry-point architecture owned by `docs/DEPLOYMENT_GUIDE.md`;
   an already-authenticated session continuing a direct or Cart-banner
   Inventory visit is unaffected and opens Inventory directly as above.
- Inventory edits are sent to the backend and displayed as saved only after a
   successful response. Product fields autosave; availability can be changed
   with a state selector or drag-and-drop. The board refreshes from the server
   while open so other authorized staff edits become visible. Publish remains
   explicit; draft preview does not alter the public menu.
- The Inventory dashboard title is **CART INVENTORY MANAGEMENT DASHBOARD**.
   The Customer name appears above and the readable Course name below it;
   internal Firestore IDs are not displayed. A horizontal category-filter row
   contains **All Products**
   followed by the active Course's top-level categories; selecting one filters
   products across all three state columns, and All Products restores all active
   products. There is no free-text product search or nested category navigation
   on the inventory board. Each category also has a small management trigger
   that opens a card showing the category name, its product count, and its
   subcategories, with a **Delete Category** action. Deletion requires an
   explicit "Are you sure?" confirmation naming the category, succeeds only
   for an empty category, is disabled in the UI and rejected by the backend
   for a category with any product, explains that products must be
   reassigned or removed first, never deletes a product, and refreshes the
   category filters on success.
- When a specific category (not All Products) is selected and its products
   include a subcategory, a second filter row appears directly below the
   category filters and above the unchanged three-column board, listing
   **All** plus that category's distinct subcategories with counts. Selecting
   a subcategory filters the visible products only; it does not change
   inventory data. Switching categories resets the subcategory selection to
   All.
- Catalog actions pair **+ Category** with **+ Add Product**. **Preview Draft**
   and **Publish Menu** are a separate adjacent action group. The three state
   columns remain the sole product organization; subcategory remains product
   metadata and does not create nested inventory groups.
- The optional Inventory price control is **Price ($)**. It converts a valid
   dollar amount to the existing `{ amount_minor, currency_code: "USD" }`
   representation. Blank remains null. Existing non-USD values are preserved
   unchanged while other fields are edited.
- Inventory automatically synchronizes from the server while open and when the
   browser regains focus. An open editor adopts server changes in untouched
   fields while preserving that user's active field edits; there is no manual
   Refresh control, edit lock, or conflict warning.
- The anonymous course menu uses the last published snapshot. Its categories,
   product counts, states, optional descriptions/prices, and Last Updated value
   come from that snapshot; the timestamp is formatted in the configured Course
   timezone. In Inventory and archived products are not presented.

Implementation/deployment status and the CSV pre-import review items are owned
by `docs/DEPLOYMENT_GUIDE.md` and `docs/feature_backlog.md`.

## Cart Operator Push Notifications (Source behavior and dated physical validation)

- The Cart Operator installs Fairway from Safari as an iPhone Home Screen web
   application, signs in with an approved Fairway account, and independently
   enables new-request notifications for each authorized Course.
- The saved notification preference belongs to the authenticated user and
   Customer/Course pair. It is separate from browser/device notification
   permission; disabling one Course does not disable Cart access or another
   Course's preference.
- Accepted source sends one visible notification per newly accepted request for each
   active subscription whose user still has Course access and has enabled that
   Course's preference. The notification identifies the request location.
- In current accepted source, revoking a user's Course access or disabling their
   saved preference prevents subsequent delivery even if the push subscription
   remains stored. The last-inspected production notifier does not yet enforce
   those delivery-time checks; sandbox has no delivery deployment. Do not infer
   production revocation/preference enforcement from source tests.
   Push delivery failures are asynchronous and do not block Cart Operations.
- Tapping the notification opens or focuses the authenticated Fairway
   application at the originating request and course. The request remains
   actionable through the normal operator workflow.
- A press suppressed by the marker's active demand window does not
   produce another request or notification.
- Physical production acceptance on 2026-10-01 confirmed one notification for
   one authoritative request, successful deep-link focus, and no notification
   for an in-window duplicate press.
- Per-user/per-Course preference controls and delivery-time authorization
   filtering are implemented in source and covered by automated regression
   tests; their environment deployment status is owned by
   `docs/DEPLOYMENT_GUIDE.md`.

## Cart Operator Application (Accepted source behavior; deployment limits)

The October 1 acceptance below is dated evidence, not proof that every later
source change is deployed. In particular, configured custom-location display
was validated in source but was absent from the last-inspected Hosting artifact.
See the [latest-known deployment alignment](DEPLOYMENT_GUIDE.md#latest-known-alignment--not-a-live-status-claim)
and [open defects](feature_backlog.md#material-readiness-items).

- The logged-out Operator, Inventory, and Admin entries use the full
   responsive browser/PWA surface without a simulated phone or device bezel.
   Cart Operator sign-in is primary on `/` and is the identical standard Cart
   login shown at `/inventory`; both are one shared customer-facing
   experience with no separate Inventory login. `/admin` is the distinct
   Admin UI entry point, with an unobtrusive Admin Login link from the
    standard Cart login and a Cart Login link back from Admin. Inventory
    navigation returns to Cart Operations and preserves the authenticated
    session. All entry paths use the same Firebase Authentication session and
    preserve the intended route through sign-in.
- The Cart header identifies the selected authorized Customer and Course by
   readable names. Dashboard refresh preserves that identity; if a display
   name is unavailable, the UI shows an explicit unavailable label rather
   than `null` or `undefined`.
- The application is a full-surface, landscape-iPad-first responsive workspace. The responsive phone-layout release is live; authenticated physical-phone/Safari usability and CPO mobile acceptance remain pending as recorded in `docs/DEPLOYMENT_GUIDE.md` and `docs/feature_backlog.md`.
- The intended active queue is oldest first, with the oldest request receiving
   strongest focus. Current retrieval first takes the latest 100 requests
   before active filtering, so older open requests can be omitted. Complete
   visibility is a known defect, not established behavior at all volumes.
- Each request displays its configured location: numbered locations use the
   `Hole N` label, and custom locations use the configured text unchanged.
   Older requests without a display label fall back to their valid numbered
   hole; requests without valid location data use `Location unknown`.
- The queue summary shows the active-request count without repeating the oldest
   request's location above its card; the focused card is the single location
   display.
- COMPLETE is the primary request action. It closes the request, preserves the
   existing request-correlated marker command behavior, and shows a brief,
   nonblocking confirmation before the next oldest request moves into focus.
- Cancel Request is subordinate and requires operator confirmation. It closes
   the request without creating a marker command.
- There is no Cart Operator CONFIRM interaction.
- Course service availability follows the Course-owned recurring local schedule.
   An authorized operator may suspend new golfer requests until the next
   scheduled service start and may resume earlier. Existing requests remain
   actionable while suspended. A
   valid marker press rejected during suspension shows the normal red failure
   response and creates no operator request.
- Current Day/Week/Month summary selectors use rolling 24-hour/7-day/30-day
   periods, not local calendar periods. The history tally is the same last
   100 completed/cancelled requests, independent of the selected period;
   dashboard reads cap requests at 5,000 and service events at 500.
   Cart-hour metrics use scheduled service time minus scheduled-time
   overlap with operator suspensions; off-hours do not count as active cart time.
   The operator-facing transaction-rate label is "Transactions per hour."
- Existing Firebase Authentication, Course assignment authorization, Web Push,
   installed-app behavior, and request deep links remain part of the workflow.

This application behavior was CPO-accepted in the functional sandbox and
promoted to production on 2026-10-01. Production acceptance established the
full-surface Option C queue, completion feedback and transaction increment,
guarded Cancel action, empty state, schedule visibility/editability, and
independent Operator/Admin authorization paths at `app.fairwayrefresh.com`.
The schedule-based behavior above describes the last established production
release; it is not the behavior of the separate Operator Service Control
source increment described below. No deployment or Course cutover for that
increment is claimed here.

## Approved Operator Service Control and Intervals — source implemented, rollout pending

The CPO-approved requirements below are implemented in the current feature
branch source and local tests. They supersede schedule-based service control
for Courses after their explicit cutover. This source status is not a claim of
production deployment, remote sandbox validation, or CPO acceptance.

- Resume turns service on; Suspend turns service off. State persists until an
  authorized operator explicitly changes it. Midnight, a scheduled opening,
  reload, restart, or elapsed time cannot resume service after cutover.
  Existing Courses retain their effective legacy on/off state at the atomic
  cutover instant; an active baseline is migration evidence, not an operator
  Resume. New Courses start off. No earlier intervals or service hours are
  reconstructed.
- One backend-owned capability governs service state, transitions, interval
  accounting, and request eligibility. State, transition event, interval, and
  operation receipt commit atomically. Reporting is a read-only consumer;
  reporting failure cannot block controls or existing-request actions, while
  failure to persist required transition evidence aborts the transition.
  The operator reads service state through a separate authorized state
  interface, independent of dashboard reporting reads.
  Preserve Course authorization, notification behavior, request deduplication,
  and deployed-device request/COMPLETE wire contracts.
- The rollout activation gate does not migrate Courses on reads, requests, or
  process startup. While a Course awaits explicit cutover, its legacy schedule
  remains read-only for request eligibility. That compatibility path is
  transactionally serialized with per-Course cutover and is removed from
  operation for each Course when the migration commits. Production cutover
  requires verified fencing and draining of all old backend revisions and
  paths first.
- Existing open requests remain actionable while service is off. Same-course-
  local-day requests may be completed or cancelled after Suspend. An open
  request received on an earlier course-local calendar day must be manually
  cancelled; it is not automatically closed at midnight, and backend COMPLETE
  is rejected even if a stale client still displays the action. Cancelled
  requests count as zero Completed Requests. Preserve already-recorded pilot
  request history without retrospective rewriting.
- Active Cart Hours, Cart Hours, and Operating Hours mean elapsed time between
  authoritative Resume/Suspend transitions, not scheduled hours. Allocate
  ongoing and cross-midnight intervals using actual elapsed instants and
  course-local Day, Monday-start Week, and calendar Month boundaries; handle
  daylight-saving changes. No historical hours are fabricated.
- Completed Requests per Active Cart Hour is total completions divided by
  actual active hours within the same selected course-local Day, Week, or
  Month. Week/Month use period totals, not averages of daily rates. Count
  completion by `completed_at`; retain the existing Service History
  received-time attribution and ordering. Cancelled requests are excluded.
  A same-course-local-day request accepted while service was active may be
  completed after Suspend and counts at completion time. An open request
  received on a prior course-local calendar day cannot be completed; it must
  be manually cancelled. Preserve already-recorded pilot history without
  retrospective rewriting.
- Compute rates from unrounded values and round only for display. Known
  positive hours with zero completions produce rate 0. Zero, unknown, partial,
  or otherwise incomplete hours produce “Rate unavailable”; Completed Requests
  counts remain visible. A 5,000-request retrieval cap or a completed
  request without a valid completion time is surfaced as incomplete coverage
  rather than a complete-looking rate.
- Broader calendar navigation, complete historical retrieval, and full Service
  History/Performance & Outcomes redesign remain outside this increment.
  Preserve official pilot requests/counts; the completed test-data cleanup is
  recorded in [the Deployment Guide](DEPLOYMENT_GUIDE.md#pilot-test-data-cleanup-execution--2026-10-20)
  and does not authorize further cleanup.

## Responsive Cart Operator acceptance boundary

The current Cart Operator product preserves the accepted tablet/desktop queue,
request actions, service controls, authorization, and navigation behavior. The
production responsive-layout deployment passed automated/build and unauthenticated
route checks. Authenticated use and CPO acceptance on physical phone-sized
screens remain pending; the deployment record is authoritative for the exact
verification performed.

## Design principle

The user experience should favor confidence, legibility, and simple actions
without exposing technical details.
