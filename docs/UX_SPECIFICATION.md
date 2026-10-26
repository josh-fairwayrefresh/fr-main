# UX Specification — Fairway Refresh Pilot 1.1

## Authorized public sandbox review

The isolated inventory review URL opens without entering an email/password
or following a private sign-in link. Anyone with that URL can operate the
CPO TEST inventory Course. An automatic anonymous Firebase session receives
only that explicit non-Admin Customer/Course scope; all existing inventory,
operator attribution and unresolved-submission behavior remains in force.
Named accounts, protected Admin access and production are unchanged.
Entry errors are explicit and can be retried by reload. See the Deployment
Guide for the exact URL, configuration and revocation procedure.

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
   user can view, add, edit, move and archive products for
   that course; another course remains inaccessible unless separately assigned.
- One course-level catalog is shared across staff and carts. Each active
   product has exactly one state: **On Cart**, **Sold Out**, or **In Inventory**.
   Archived products are retained outside active inventory.
- Metadata edits save automatically. The persistent-stock sandbox increment
   below supersedes last-write-wins for stock/availability: stale quantity
   edits must not overwrite intervening sales, and metadata autosaves must not
   restore stale availability. Product changes retain account
   attribution and gain operational staff/shift attribution.
- Saved inventory automatically determines the public menu. Failed saves and
   unconfirmed/cancelled operations never appear as saved public changes.
- Anonymous golfers scan a stable Course QR URL and see the current committed
   On Cart products. Sold Out, In Inventory and archived products are omitted.
   The menu is read-only and
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
   while open so other authorized staff edits become visible. The public menu
   automatically reflects saved active On Cart products; there is no separate
   preview/publish step.
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
- Catalog actions pair **Add Category** with **+ Add Product**. A clearly
   labeled **Golfer-View Menu** link for the selected Course opens in a new tab
   on the right of the filters, matching the audit button's font and text size.
   **Confirm Inventory Audit** sits directly beneath Close out / Enter final
   sales inside the same bounded Sales Today/operator panel.
   If no slug is configured, explain that Admin must configure the link
   rather than link to a different Course. The three state
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
- The anonymous Course menu reads the current committed inventory through one
   public-field allowlist. Only active On Cart products appear; Sold Out,
   In Inventory and archived products are excluded. Categories, product counts,
   descriptions, prices and Last Updated reflect that coherent current state.
   The timestamp uses the Course timezone. Existing public links keep working;
   the menu reads current committed inventory when opened or manually reloaded,
   with no polling or focus-triggered refresh. Every category tile starts
   collapsed, including Canned Cocktails, and expands only on golfer selection.

Implementation/deployment status and the CSV pre-import review items are owned
by `docs/DEPLOYMENT_GUIDE.md` and `docs/feature_backlog.md`.

### Persistent cart stock, staff, audits and shift close

Status on 2026-10-26: CPO-accepted behavior was merged through PR #12 and
released to production Admin/Hosting after explicit release authorization.
Every existing product ID, metadata field, column and stored quantity survives
unchanged across On Cart, Sold Out and In Inventory, including archived records.
The public On Cart response is never used to replace, synchronize or prune the
operator's full inventory. Missing quantities read as zero,
without an initialization write or automatic movement; an existing On Cart
product remains On Cart, including on the public menu, until an explicit
authorized stock operation changes it. Production continues using ordinary
Firebase sign-in and existing account/Course permissions, never automatic
sandbox review entry. Release verification and recovery are owned by the
[Deployment Guide](DEPLOYMENT_GUIDE.md#persistent-inventory-production-release--2026-10-26).

The CPO authorized this coherent increment on 2026-10-23, from accepted main
`08aa2cf0cb7d16b7bb6ab6d5900f15712e5060bf`, initially for sandbox review.
On 2026-10-24 the CPO accepted its current functionality and requested the
presentation refinement below within PR #12. A subsequent same-day CPO decision
supersedes explicit publication with an automatic current On Cart menu and
simplifies the sales header. Those initial sandbox decisions did not authorize
production; the separate 2026-10-26 release authorization superseded that limit
for Admin/Hosting only.

- The Inventory banner displays the Fairway Refresh logo at 150% of its prior
  displayed dimensions at each responsive breakpoint, an accessible Admin
  shield for entitled users, and Export without explanatory prose. Export
  retains the same confirmed-view report contents, download and pending/unresolved
  submission protection.
- Sales Today sits horizontally beside Cart Inventory Management Dashboard
  on iPad/desktop. The same compact panel clearly identifies the selected
  operator and contains Select operator/Close out and submission recovery.
  The sales box is labeled "Sales Today" and shows only today's total units
  sold, not date, cart-stock totals or per-product details. Individual sales
  and product tallies remain durable and available to the existing export.
  After activity, the prominent shift button has two stacked lines:
  "Close out" / "Enter final sales". Final-sales entry, attribution, safe
  retry, failure retention and successful-close clearing are unchanged.
  Add Category and Add Product share one action row immediately above the
  category filters. Golfer-View Menu remains on the right of the filter row.
  Confirm Inventory Audit is directly below the close-out control inside
  the same bounded panel, not on the filter row.
  Preserve grouping
  on iPad; wrap rows cleanly on phones with no document overflow or reduced
  touch targets (44 CSS pixels minimum for these controls).
- Routine success commentary boxes are omitted: confirmed tiles, quantities,
  tally and shift identity convey successful changes.
  Actionable failures, stock conflicts, unknown submission outcomes and retry/
  recovery controls remain visible. Sale/loading/audit confirmations remain
  explicit. Obsolete Preview Draft/Publish Menu controls, instructions and
  publication-status messaging are removed.

- One shared cart inventory per Course uses the existing Course catalog.
  Inventory ownership remains bounded for a future Course-to-Cart hierarchy;
  there is no multiple-cart UI, separate restaurant balance or transfer model.
  Existing products retain metadata, price, categories and initial availability.
  Missing quantities display zero without initialization moving any tile.
- Each card exposes an editable nonnegative whole-unit quantity. Quantities
  persist across days and shifts; no automatic reset occurs. Direct edits are
  attributed adjustments, never sales. Stock changes and immutable historical
  events commit in one authoritative operation.
- Cart-stock totals select only On Cart products. Moving to In Inventory changes
  availability only: preserve the recorded quantity and do not manufacture an
  adjustment. In Inventory means restaurant-held products available to load,
  not a tracked restaurant stock balance. Loading either state into On Cart
  requires a positive Quantity and explicit confirmation, committed together.
  Both drag-and-drop and the availability selector support On Cart to In
  Inventory, without a Quantity prompt. If operator selection is needed, resume
  the same move after selection. Record an attributed availability event with
  unchanged quantity; remove the product from cart totals and later cart audits.
  The state and quantity survive reload. Adjusting an In Inventory product to
  zero must leave it In Inventory, not move it to Sold Out.
- Sold Out always means quantity zero. Moving either an On Cart or In Inventory
  product with positive quantity X to Sold Out, by dragging,
  keyboard movement or availability selector, asks:
  "Confirm that you sold the remaining X units of [product name]."
  Confirm uses the existing attributed sale operation to sell exactly the
  displayed remaining units, set quantity zero and move to Sold Out atomically;
  the Course-local daily sales tally updates. Cancel changes no stock,
  availability, sale history or shift activity. Bind the confirmation to the
  displayed stock revision: intervening sales/adjustments require refreshed
  quantities and another explicit confirmation, never a silent amount change.
  Uncertain responses retain the exact intended operation for safe retry.
  A zero-quantity product moves to Sold Out as availability only,
  without creating a zero-unit sale. Other non-sale availability changes do not
  invent adjustments; quantity-preserving In Inventory returns and confirmed
  positive loading onto On Cart are unchanged.
  Enforce this on the server as well as all movement controls. Ordinary quick
  sales remain restricted to On Cart; only an explicitly targeted, exact
  remaining-units, revision-bound sale permits In Inventory as the source.
  Existing positive Sold Out records are identified, never silently repaired.
  Authorized corrections of labeled sandbox test records are attributed
  adjustments to zero, not invented historical sales. No production repair
  is authorized by this increment.
- Inventory dragging uses the visible product-name/grip control for mouse,
  touch and pen through one shared interaction. Touch scroll remains available
  outside that grip; sale, quantity, edit and selector controls do not initiate
  dragging. A movement threshold, visible destination highlight and viewport-edge
  scrolling support deliberate drops, including stacked phone columns. Dropping
  on a column or its children uses the same attributed availability operation.
  Escape, browser cancellation and dropping outside columns do not mutate stock.
  The grip also supports selection followed by a labeled Move here button
  without requiring the availability selector. This is not a separate stock path.
  Adjacent columns span the board's full row height so horizontal drops from
  lower tiles land in the visible destination area, not a gap beneath a shorter
  column. On stacked phones, viewport-edge scrolling reaches other columns.
- A sale icon opens positive whole units sold, default one, and Confirm. Server
  transactions validate against current On Cart stock. An excessive sale is
  rejected without deduction or successful sale event, explaining that the
  quantity must be corrected first. Zero is the minimum; negative stock,
  overselling, silent clamping and oversell-confirmation paths are excluded.
  A sale/quantity edit that makes an On Cart balance zero moves it to Sold Out;
  replenishing Sold Out above zero restores On Cart. Initialization alone does
  not apply those transition rules.
- Sales, adjustments and cart-loading Quantity dialogs share visible minus/plus
  controls with at least 44 by 44 CSS-pixel targets and spacing, accessible names
  and direct numeric entry. Minimum is zero for adjustments and one for sales
  and loading. Buttons never submit a transaction; explicit Confirm remains
  required.
- The compact Course-local daily tally shows only total units sold across all
  sessions. Individual sales, product tallies and adjustments remain durable
  beyond the day; hiding header details does not delete records. Connectivity is
  required; failed/uncertain submissions never appear confirmed. Retried intended
  operations cannot duplicate deductions or durable records. Stale absolute
  edits require fresh review; metadata autosaves cannot overwrite stock/state.
- Export downloads a genuine Excel `.xlsx` workbook of the confirmed displayed inventory view:
  selected Customer/Course, explicit category/subcategory filters, displayed
  product names/availability/quantities, selected operator if any, revision,
  and export time in the configured Course timezone. Filtered reports are
  prominently marked as not the complete inventory. If the archived section
  is expanded, include those displayed rows and mark their separate scope.
  Include the displayed Course-wide daily product/unit sales tally and full
  On Cart total, explicitly not narrowed by product filters. Unsubmitted edits
  are excluded; export is unavailable during pending/unresolved submissions or
  failed inventory loading. Export does not require operator selection, make
  shift activity, mutate stock, confirm an audit or publish a menu.
  The manager-facing report has Customer, Course, Course-local export time and
  selected operator at the top, clear headings and product, category,
  availability and numeric whole-unit quantity columns. Two side-by-side tables
  keep a representative 58-product report readable on one landscape Letter
  page, with explicit print area, quarter-inch margins and one-page scaling.
  Preserve all report rows, archived scope and daily product tallies rather
  than truncating content to fit. Validate actual workbook contents and rendered
  one-page printing, not only page-setup flags. If confirmed data or submission
  state changes during workbook generation, require a fresh export.
  A separate **Audit History** worksheet reads completed durable audits for the
  selected Course's past 14 local calendar dates (today and the preceding 13
  dates, through export). Include the reporting period/timezone and each audit's
  Course-local date/time and historical approver-name snapshot, independent of
  current product/category filters. Show an explicit no-audits empty state.
  Use readable columns, repeated headings, margins and fit-to-width printing;
  history may span pages without shrinking the inventory report. Keep the
  Inventory Report worksheet's existing readable one-page print layout.
  History is an authorized read, not an audit/shift mutation; retrieval failure
  prevents download with an actionable error rather than presenting empty history.
- Admin's Customer register contains a staff directory with stable person IDs,
  free-text names, and Cart Operator / F&B Management roles. Both roles have
  equal operational rights through one policy. These are operational identities,
  separate from Firebase users; adding a name grants no login or Admin access.
  Custom operator entry adds a Cart Operator to that Customer directory.
- Cart's banner and Inventory's Sales Today panel share a session/Course operator selection, isolated
  from other sessions/accounts and Customer/Course contexts. The first inventory
  action requiring operator attribution without a selection prompts and resumes
  that action; audit submission is expressly exempt. One shift is active
  per operator session and Course. Before inventory activity, the name can be
  corrected freely; after activity, selecting a different person requires
  successful shift close. Operational records preserve selected staff snapshots
  and the authenticated submitting UID.
- An explicit audit says "Record your cart inventory at the start and end of a shift."
  Its backcheck displays and snapshots only current On Cart products, independent
  of filters, excluding Sold Out, In Inventory and archives. Revision details
  remain internal to stale-confirmation protection, not the explanation.
  Select a Customer staff approver
  and require: "Confirm you are authorized to approve this inventory count audit."
  Commit a coherent immutable snapshot, approver and submitting account, revision
  and authoritative timestamp. Concurrent changes invalidate the reviewed
  revision and require reconfirmation. Later product/staff edits cannot rewrite it.
  Historical audits are not rewritten to the new scope. Successful audit
  submission closes the dialog without triggering operator selection. The
  selected approver, authorization checkbox and Confirm audit suffice even with
  no operator selected. Record approver and submitting Auth account without
  requiring, starting, locking or altering an operator shift solely for an audit.
- Shift close accepts a nonnegative USD total in dollars, stores exact cents and
  attribution, and supports multiple shifts per Course/local day. Submission
  follows an **Are you sure?** step showing the exact entered dollar
  amount. Confirm uses the existing duplicate-safe close operation; Cancel
  returns to the entered amount without closing or clearing the operator. Only
  success closes that session's shift and clears its name. Failure or uncertainty
  preserves the name and amount, with idempotent retry/recovery. Stock, daily
  sales, other sessions and history are unaffected. Successful close leaves
  Not selected and no dialog, including after delayed refresh or repeated
  completion callbacks. Only a subsequent user-initiated attributed action
  prompts for a name; completed work never resumes a new action implicitly.
- Successful confirmed changes into/out of On Cart automatically change the
  golfer menu, including a sale/adjustment that moves zero stock to Sold Out.
  Saved public-facing metadata for On Cart products also appears automatically.
  Failed, cancelled, stale or unconfirmed operations do not change public data.
  Public reads use one coherent transaction over committed inventory, not
  asynchronous copies or older publication snapshots. Concurrent transactions
  and exact idempotent retries cannot replace a newer menu with older state.
  One authoritative public-menu field allowlist excludes quantities (including
  nested price fields), staff, sales, shifts, audits and other operational data
  from anonymous API responses as well as visible content. Existing snapshot
  records may remain as history but are never a serving source. No POS/payment processing,
  offline queue, trend screens, speculative role framework or physical-device
  changes are included. Accepted request queue, service categories and request
  KPIs remain unchanged.

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
- The active queue remains ordered by request age, oldest first. Initially the
   oldest active request is selected in the action card. Each other row is an
   accessible selection button under “Other active requests”; choosing one
   displays it in the “Selected request” card with its existing Complete and
   Cancel actions. The list continues to include the former oldest request
   when a newer request is selected, and retains age order.
- A selected request remains selected across refreshes and new arrivals. If it
   is completed, cancelled, or otherwise leaves the active queue, selection
   falls back to the oldest remaining request. Changing Courses resets the
   selection to that Course's oldest active request. A notification targeting
   an active request selects it; a later manual selection is not overridden by
   subsequent refreshes.
- History hides the entire Requests view, including Complete and Cancel
   controls. Returning to Requests restores the prior active selection.
- **CPO-accepted, production-deployed increment (2026-10-23, PRs #8/#9):**
   Admin Device assignment includes
   `service_group`, either `on_course` (On-course) or `on_premise`
   (Amenity Areas). The CPO refined the displayed category from On-premise
   through Driving Range to Amenity Areas on 2026-10-23; existing stored/API identifiers remain
   `on_premise` without migration or service-state changes.
   Category wording is defined only in the shared
   `fairway_backend/cloudrun_receiver/lib/service_categories.json` owner.
   Admin options, Cart headings, confirmation prompts, and accessible names
   consume that definition, never independent label maps. Editing its
   `display_name` changes wording only, not the stable category identity or
   individual marker location labels.
   Missing fields on existing devices mean On-course. Group is
   independent of hole/custom location; changing it does not change the label.
   Cached Admin saves that omit the field preserve an existing assignment.
- Courses without assigned Amenity Areas devices retain the single Cart service
   presentation. When any Course-associated device is Amenity Areas, show
   separately labeled status and Suspend/Resume controls for both groups,
   regardless of queue contents. Each group stays ON/OFF until an explicit
   operator transition. Each category has an adjacent, visually bounded control
   set with its status and short Suspend/Resume button aligned beneath the
   On-course or Amenity Areas headline. Visible buttons do not repeat category
   names; accessible button names and confirmation prompts identify the group.
   First-time Amenity Areas state is OFF. Reassignment uses
   the destination state and does not resume either group. States persist even
   when no devices remain assigned and controls disappear.
   The empty shared queue advertises incoming requests when either displayed
   group is ON, including Amenity Areas-only service.
- Request eligibility uses the authenticated device registry group, not a
   firmware-provided value. Newly created requests retain that group as a
   snapshot; reassignment never rewrites requests. Both groups share the same
   queue, History, age order, permissions, labels, selection, and actions.
   Suspension/reassignment does not prevent Complete or Cancel of existing
   requests.
- **CPO-accepted reporting decision (2026-10-23, PR #9):** all completed
   requests count equally in the existing Course-wide KPI totals, regardless
   of service group; cancelled requests do not contribute to completion
   totals. The shared queue and History include both groups. Retain the
   existing calculations: Active Cart Hours uses only the On-course event
   stream, and Amenity Areas transitions contribute no cart hours. The CPO
   explicitly accepts combined completion counts against that On-course-only
   denominator for Requests per Hour. Do not add group filters, separate KPIs,
   or reporting UI.
- While a request action is in flight, queue selection and duplicate request
   actions are disabled. Action errors remain associated with the request that
   produced them. Completion continues to use the selected request's existing
   request-specific action, preserving request/device correlation.
- The intended active queue is oldest first. Current retrieval first takes the latest 100 requests
   before active filtering, so older open requests can be omitted. Complete
   visibility is a known defect, not established behavior at all volumes.
- Each request displays its configured location: numbered locations use the
   `Hole N` label, and custom locations use the configured text unchanged.
   Older requests without a display label fall back to their valid numbered
   hole; requests without valid location data use `Location unknown`.
- The queue summary shows the active-request count. The selected request card
   displays its request location; all other rows display their own configured
   location using the same numbered/custom/unknown labels.
- COMPLETE is the primary request action. It closes the selected request,
   preserves the existing request-correlated marker command behavior, and
   shows a brief, nonblocking confirmation before selection falls back to the
   oldest remaining request if the selected request leaves the queue.
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

## CPO Stats Fix Reporting Requirements

The preceding Option C acceptance record describes its historical
schedule-driven behavior. CPO_stats_fix supersedes those schedule controls:
Resume/Suspend is the persistent
operational control, independent of schedules, midnight, and elapsed time, and
the Beverage Service Schedule is removed from active Admin configuration UI.
The existing stored schedule fields are retained. The CPO accepted this
behavior and authorized its production release on 2026-10-22; it remains in
the 2026-10-23 queue/category release. Dated runtime evidence is owned by the
Deployment Guide.

- Resume turns service ON until Suspend; Suspend turns service OFF until
  Resume. Schedules, midnight, and elapsed time do not change that state.
  Suspension has no expiry; only an explicit Resume turns service ON.
  One operational owner supplies current service state and records operator
  transitions. Request eligibility reads that state directly. Reporting
  consumes transition/request records and is never a prerequisite for
  accepting requests.
- Remove the Beverage Service Schedule from active control/configuration UI.
  Course create/edit operations do not validate, expose, or write schedule
  fields. Ignore schedule fields sent by older cached Admin clients. Existing
  stored schedule data is left untouched and has no operational effect; do not
  delete it or introduce PR #4 migration/cutover machinery.
- Preserve request handling, COMPLETE/Cancel, notifications, permissions,
  device protocol, and firmware contracts.
- **Active Cart Hours** are calculated from existing operator Resume/Suspend
  actions. Include ongoing active time through the present and allocate elapsed
  time across course-local days. Sum duration and round it to the nearest
  minute for reporting; display hours with at most two decimal places.
- **Completed Requests** are counted by completion timestamp within the
  course-local calendar day. Exclude open and cancelled requests.
- **Average Completion Time** is receipt-to-completion elapsed time averaged
  over those completed requests. Refresh it after each completion.
- **Requests per Hour** equals Completed Requests divided by Active Cart Hours.
- Show these four KPIs on the Cart UI's calendar Day, Week, and Month tabs.
  Weeks begin Monday. Weekly and monthly Requests per Hour use total
  completions divided by total active hours. Average Completion Time for a
  multi-day period is total completion duration divided by the total completed
  request count, not an unweighted average of daily averages.
- History rows use the same selected Course and calendar period as the KPIs:
  completed rows are selected by completion time and cancelled rows by
  cancellation time. Refresh reporting when request outcomes change, including
  changes made by another operator, and at minute-level intervals so ongoing
  active time and local calendar-period boundaries become current. Return every
  matching outcome for the selected period; do not silently truncate History.
  If pagination is introduced later, it must expose the total and provide access
  to every matching row.
- Started periods with no activity display 0. Zero Active Cart Hours produces
  0 for Requests per Hour. Do not restore a mandatory "Rate unavailable"
  display.
- Do not fabricate historical operating hours. Missing operating evidence
  must not erase factual request counts or be described as measured activity.
- Monarch Bay is Customer `CUST-0001`. Preserve its deployment records,
  beginning at the established October 17, 2026, 9:39:35.270 a.m. Pacific
  boundary. Existing database records may be read for reporting; they need no
  conversion or transfer into Git.
- For this increment, the CPO tests first. Neither agent runs tests until the
  CPO has completed testing. This is increment-specific and does not change
  Kaizen or the general verification workflow.
- Production remains unchanged until CPO acceptance and explicit release
  authorization. Prompt return to the stable application is a release
  requirement. No destructive data conversion is authorized.

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
