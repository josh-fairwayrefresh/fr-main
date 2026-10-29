# UX Specification — Fairway Refresh Pilot 1.1

## Authorized public sandbox review

The two isolated review sandboxes support ordinary-browser entry without
entering an email/password or following a private link. Anyone with their
operator URLs can operate the explicitly scoped test Courses. Automatic
anonymous Firebase sessions retain the existing non-Admin Course authorization,
operator attribution and per-browser notification preferences; they do not
grant production access. QR reviewers may switch between the synthetic Cart
and Driving Range Courses. Inventory reviewers are limited to the CPO TEST
inventory Course. Existing named sign-in remains available on protected routes.
Entry failures are explicit and can be retried by reload, never presented as
successful access. See the Deployment Guide for configuration and revocation.

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

## Driving Range QR requests (review increment)

**Released:** PR #13 is merged and published to production, including the
accepted A/B refinement and current inventory/staff integration. Monarch's
Driving Range remains suspended until separate explicit CPO activation.
Environment identities, verified production sign register and remaining
physical/browser-notification acceptance limits belong to the
[current release record](DEPLOYMENT_GUIDE.md#driving-range-production-integration-and-controlled-release--2026-10-26).
The heading's review-increment anchor is retained for existing document links.

- Driving Range is its own Course asset under a Customer, alongside golf
  Courses such as Tony Lema. All 26 bays belong to that Driving Range Course,
  with independently identified A and B sides (52 service locations).
  Explicit immutable-at-creation `operation_kind: driving_range` configuration
  identifies it; names, email addresses and IDs never determine behavior.
  Missing operation configuration preserves existing Cart behavior.
- Existing Customer/Course access and Course selection govern both operations.
  The existing main-operator Course selector labels its operation choices
  **Cart service** and **Driving range service**; it is not a second selector.
  Production release extends existing authorized Monarch customer login
  accounts to both Courses without Admin grants or provider/password changes.
  Individual Course restrictions remain in the existing account-access owner.
  Tony Lema's five operational staff assignments are not extended to the range.
  Production operator entry requires normal authentication; public sandbox
  anonymous/passwordless review cannot provision production access.
  There is no additional Restaurant selector, user Service Type, role or
  service-specific permission. Existing Course notification checkboxes permit
  either Course, both or neither; a preference never grants access.
- The Driving Range Course uses shared Requests, select-any-request,
  Complete, Cancel and History. It has no Inventory or cart performance
  controls. Its persistent Resume/Suspend state is independent of other
  Courses. New Driving Range Courses start suspended until explicitly resumed.
  Suspension rejects new submissions; existing requests remain actionable.
- The main operator context is one authorized Customer/Course pair. Admins
  first select a **Customer** by name; the existing **Service** selector shows
  only that Customer's authorized Courses, using **Cart service** and
  **Driving range service** labels. Ordinary Customer users have no Customer
  chooser and retain their existing authorized Course scope. Both selectors
  derive solely from the existing authorized Course list, not a second
  directory or permissions model.
  Valid URL/deep-link pairs are preserved; a valid Customer-only link selects
  an authorized Course within that Customer. Changing Customer selects a
  valid Course there and updates the URL. Previous requests, History,
  inventory context and late dashboard responses must not cross that boundary.
  Context navigation is blocked during request, Resume/Suspend, inventory/
  staff and explicit notification mutations, including browser-history
  navigation. Selection alone never writes notification preferences or
  subscriptions, account entitlements or stored service state.
- Each permanently identified bay side has its own static Fairway-hosted URL.
  In the existing sandbox, the original 26 links remain side A and side B has
  26 additional links. Production uses a fresh permanent 52-side register
  under its own Course, not copied sandbox identities.
  `qr_bays` remains the identity owner, with numeric `bay_number` and explicit
  `bay_side: A | B`. The
  anonymous mobile page identifies the Course and bay and asks:
  **"Would you like a server to come and take your order?"**
  The complete page uses a white background and dark readable text, including
  the surrounding viewport and loading, confirmation and error states,
  regardless of the phone's light/dark appearance setting.
  No creates nothing. Yes confirms only server-acknowledged acceptance.
  No golfer login, order entry or payment is required.
- One outstanding request exists per bay side until Complete or Cancel;
  A and B can request independently. Public pages, new request snapshots,
  operator queues/History and notifications identify the full side, e.g.
  **Bay 9A** or **Bay 9B**, including golfer acknowledgement. Historical unsuffixed snapshots remain unchanged.
  Concurrent
  scans and repeated Yes acknowledge that request without another request or
  notification. A lost-response retry retains its original submission identity,
  including across reload, completion or suspension; it cannot become a fresh
  request. An explicit later submission after a terminal outcome can create one.
  Failed/uncertain responses remain visible and provide safe retry.
- QR requests are not devices. Their completion never generates a device
  command. Terminal races have one winner; repeated identical actions are safe,
  while an opposite terminal action reports the authoritative conflict.
- Active queues retrieve all authorized active requests independently from
  closed History; newer closed work cannot hide old active work behind a cap.
  Restaurant requests and service time do not enter Cart performance metrics.
- Public responses contain only bay number/side, Course display name, availability,
  or a minimal acceptance acknowledgement. Private requests, account access,
  staff, endpoints and operation receipts are not public.
- Signs use 26 US Letter portrait pages, one numbered bay per page with
  two codes: A on the left and B on the right, white
  background, strong contrast and comfortable printer-safe margins. A centered
  banner reads Fairway Refresh logo / AT / Monarch Bay Golf Club logo, using
  approved assets without distorting their proportions. Below it, centered:
  **WANT FOOD OR DRINKS?** (larger headline), then
  **Use your [camera icon] and point it at the code to request a server.**
  (supporting instruction, centered across two lines with a drawn camera icon),
  then prominent side labels **BAY 1A / BAY 1B** through **BAY 26A / BAY 26B**,
  each above its large QR with a four-module white quiet zone. No extra instructions, URLs or technical information
  appear on the signs.
- CPO-authorized Monarch testing checkpoint: sandbox review pages omit the
  **TEST — NOT FOR INSTALLATION** footer. The filename and download page
  explicitly identify sandbox URLs. The verified mapping register contains
  all 52 side-specific destinations; the existing 26 URLs remain side A.
  Unmarked printed pages do not authorize production launch.
  An installation edition must use approved permanent production URLs and
  omit test markings, and may be generated only during authorized production
  launch. Sandbox field-review signs are not a production installation edition.
  The subsequent CPO-authorized production release completed Course/account
  provisioning and permanent-URL installation signs through the same owners.
  This does not activate Driving Range service or claim physical print/scan
  acceptance. Existing sandbox review signs and destinations remain unchanged.

## Admin Button Activity Report (Review Increment)

Released through merged PR #21; the
[current deployment record](DEPLOYMENT_GUIDE.md#admin-button-activity-report-controlled-production-release---2026-10-28)
owns source/runtime identities, production verification and recovery.
Existing global Admin authorization gates
**Admin → Reports → Customer → Course → date range → Generate → Download PDF**.
The selectors reuse Admin's existing Customer/Course directory; the backend
validates the Course's selected Customer parent before reading report sources.
Ordinary Customer accounts cannot call the report endpoint. No account,
entitlement, service state or operational data is changed.

- Preserve the accepted one-off scatterplot: dates horizontally, Course-local
  time vertically; device-colored filled dots for received service-unavailable
  rejection attempts, including each separate transport retry. Larger open
  circles represent accepted physical-button requests completed by the explicit
  as-of boundary, once per request, plotted at **receipt**, not completion.
  Cancelled/open requests and QR activity are excluded. This does not change
  existing Service History's completion-time metrics.
- The PDF is landscape US Letter, with a three-column device legend, daily
  empty/completed counts above date columns, observed totals, exact local
  window/as-of boundaries including milliseconds, timezone and explanatory
  notes. Original and replacement devices keep distinct identities/colors;
  numeric FRB colors preserve the reference and other IDs have deterministic
  colors independent of the selected date range. Overlapping events remain
  counted even when individual marks overlap.
- Location labels must not be inferred from current deployment or unverified
  request label snapshots. Current retained sources have no verified historical
  assignment timeline. Per the CPO's accepted release correction, legend labels
  show **only the device ID**, such as `FRB-0002`. Original/replacement units
  remain distinct through their separate IDs and stable colors. Historical
  uncertainty remains explained in the notes, not appended to each label.
  The CPO's supplied
  reference hole/replacement labels remain documented fixture evidence only;
  they are not application mappings or proof of historical effective dates.
- Dates are 1–31 inclusive Course-local calendar days using its IANA timezone,
  including daylight-saving changes. The end boundary is the next local
  midnight, exclusive, or the generation as-of instant, inclusive, if earlier.
  Future-only ranges fail. Subsequent future dates in a selected range are
  marked outside the window rather than counted as zero.
- Charts continue after 12 dates per landscape page, without dropping records.
  Up to 18 devices are supported subject to measured text/chart fit; excessive
  headings, labels or content fail explicitly rather than clip. Source caps
  are 20,000 records **per source**, 200 Logging pages and a 45-second source
  read budget. Exceeding a practical limit returns an error asking for a
  shorter range, never a partial successful PDF.
  The current standard PDF font supports Latin-1 and common typographic
  punctuation; unsupported name characters are an explicit error, never
  silently substituted or emitted as unreadable labels.
- Current bucket retention is read at generation time. Dates outside that
  window show **N/A**, not zero, for empty attempts; partly retained days use
  an asterisk. Any older records still returned are observed partial evidence,
  not proof of full coverage. Completion counts use the consistent as-of
  Firestore snapshot and can change on subsequent generation after additional
  completions. Retention does not prove historical routing/exclusion coverage;
  ingestion delay may omit attempts. Zero means no observed matching records,
  not proof that no physical pushes occurred or reached the server.
- A query, metadata, ownership or permission failure is an error, never a
  zero-activity report. Changing inputs clears the downloadable result;
  stale/unmounted generations cannot replace the selected report. Download
  uses the already generated PDF without querying again.

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

- **CPO-approved Inventory banner alignment (2026-10-28):** the CPO confirmed
  physical iPad/Safari validation completed and authorized commit, integration
  and production release. The approved desktop, iPad landscape/portrait and mobile
  prototype supersedes Inventory's enlarged stacked logo and dark banner.
  One Inventory header uses the same horizontal Fairway logo asset, white
  surface, thin gold accent and green navigation hierarchy as Cart Requests.
  Cart Operations returns to the scoped Requests page; Inventory is identified
  as the current page. Entitled Admin and guarded sign-out remain grouped on
  the right. Customer/Course identity, the existing combined Course selector,
  account email and Export sit in the context tier. Desktop/landscape use two
  tiers; up to 900 CSS pixels email/Export wrap below scope, and up to 740 pixels
  navigation sits below branding/account actions with stacked Course context.
  Names and email wrap without hiding controls; targets remain at least 44
  pixels tall. The horizontal logo replaces the prior 150%-sized stacked logo
  intentionally, as approved. No new Customer/service selection behavior or
  Inventory notification preferences are introduced. Export retains the same
  confirmed-view report contents, download and pending/unresolved submission
  protection. Sales Today/operator selection, closeout and audit remain in the
  existing workspace panel, without duplicated banner management controls.
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
  Staff have explicit `course_ids` within their owning Customer. Admin's existing
  staff editor assigns Courses; the operator and audit-approver pickers show only
  assigned active staff for the selected Course. Empty assignments mean no
  Courses. New Admin-created staff default to no assignments if omitted; custom
  operator entry adds an active Cart Operator assigned only to its source
  Course. No name is automatically assigned to another Customer or future Course.
  Legacy records without `course_ids` retain Customer-wide behavior without
  a migration; the editor labels that legacy scope and saves explicit selections.
  Course IDs are validated under the owning Customer. Server-side shift
  selection, new stock/catalog operations and audit approval enforce the same
  assignment policy, including stale clients. Removing an assignment blocks new
  actions, but does not prevent an existing shift closing with its original
  attribution or resolving an already-committed operation's exact retry.
  Name/role/assignment edits never rewrite historical sales, shifts or audit
  snapshots. Stable staff IDs and existing operation receipts make creation
  retries duplicate-safe; no login accounts or account permissions are involved.
- Inventory's Sales Today panel is the sole interface for operator selection,
  name correction and shift closeout. Cart Requests displays that same
  session/Course operator name read-only, with no selection, change, opening,
  closeout or inventory-retry controls. It does not create an operator identity
  or require staff-directory loading. Requests remain actionable without a
  selected operator or a successful operator-status read.
  Selection is isolated from other browser sessions/accounts and Customer/Course contexts. The first inventory
  action requiring operator attribution without a selection prompts and resumes
  that action; audit submission is expressly exempt. One shift is active
  per operator session and Course. Before inventory activity, the name can be
  corrected freely; after activity, selecting a different person requires
  successful shift close. Operational records preserve selected staff snapshots
  and the authenticated submitting UID.
- Application account sign-out is separate from inventory shift closeout.
  Every account sign-out control, including Admin and access-status screens,
  checks this authenticated browser session's recorded Course sessions against
  the existing server shift owner. An open shift or unresolved inventory
  submission prevents sign-out and links to the correctly scoped Inventory
  page for recovery/closeout; switching to another Course or Driving Range
  does not bypass this check. Sign-out never closes a shift or clears
  reconciliation, attribution or retry state. No open shift and no unresolved
  submission permit normal account sign-out. Read/storage failures explicitly
  prevent unverified sign-out; the operator can stay signed in or retry.
  Cancelling a delayed status check cannot sign out later.
  Existing browser-session storage/UUID persistence is retained across
  same-tab navigation, reload and browser session restoration; this does not
  introduce account-wide shifts or cross-tab identity sharing.
- An explicit audit says "Record your cart inventory at the start and end of a shift."
  Its backcheck displays and snapshots only current On Cart products, independent
  of filters, excluding Sold Out, In Inventory and archives. Revision details
  remain internal to stale-confirmation protection, not the explanation.
  Select an active Customer staff approver assigned to this Course
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
  Closeout is available in Inventory whenever a name is selected, including
  before stock/catalog activity, so an otherwise idle open shift does not
  trap account sign-out. Before activity, a separate Change operator control
  preserves free name correction. Audit approval remains independent.
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

- **CPO-approved responsive notification strip (2026-10-28):** one
   `NotificationSetup` owner presents the title and Course preferences in page
   flow immediately below the existing Requests banner, never as a floating
   desktop overlay. Desktop and iPad use a 56 CSS pixel single row for the
   standard two-Course example: title, Course label then checkbox, next Course
   label then checkbox. Compact widths up to 740 CSS pixels place the title
   above full-width Course rows, with right-aligned checkboxes, readable
   14-pixel labels and at least 44-pixel tap targets. Long names and additional
   authorized Courses wrap rather than clip or disappear.
   The approved references are the compact desktop, iPad portrait/landscape
   and stacked mobile prototypes. Permanent permission/installation subtitles
   are removed. Focusing or tapping a preference reveals relevant capability
   guidance only when needed; unavailable unchecked preferences remain
   disabled, with their labels keyboard-focusable for explanation. Explicit
   mutation errors remain visible. There is no new notification dismissal,
   automatic preference change or altered push permission/install lifecycle.
   The accepted banner, request, operator, Inventory and account flows are
   unchanged. Deployment identity is owned by the Deployment Guide.
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
- **CPO-approved Requests banner refinement (2026-10-28):**
   after approving the three-format visual prototype, the CPO explicitly chose
   its revised iPad banner as the reference and authorized the associated iPad
   visual changes. This supersedes the earlier requirement to preserve the
   previous live iPad banner pixel-for-pixel. Its subsequent authorized
   deployment/integration is recorded in the Deployment Guide; design approval
   alone is not deployment authorization.
   One Requests banner renders the same brand/navigation/context hierarchy
   at every width, with no device-specific business logic or duplicated views.
   The existing horizontal Fairway logo, warm white surface, green navigation
   and thin gold top accent identify the workspace. Requests/History lead;
   Inventory is a separate destination followed by the entitled Admin control
   and guarded account sign-out. Below, the Customer eyebrow and prominent
   readable Course name precede read-only operator attribution, authorized
   Customer/Service selectors and separate service status/actions.
   Desktop and landscape iPad use the two-tier composition. At intermediate
   widths the service controls wrap below scope; compact widths up to 740 CSS
   pixels put account actions beside branding, Requests/History and Inventory
   on the next row, then stack Course/operator, scope and service rows.
   Breakpoints are content-driven, not iPad/aspect-ratio detection.
   All banner controls retain at least 44 CSS pixel touch targets, including
   selectors slightly taller than the static prototype. Long names and errors
   remain readable without document overflow. Existing ordinary-user/Admin
   entitlement differences, independent On-course/Amenity Areas actions,
   pending-operation guards, scoped navigation, operator ownership, sign-out
   protection and request actions remain unchanged. Driving Range still has
   no inventory/operator controls. Inventory, authentication and Admin/report
   banners retain their legitimate existing page-specific presentation.
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
