# UX Specification — Fairway Refresh

Purpose
-------
- Describe the implemented and CPO-validated Monarch Bay Pilot externally
   observable golfer and Cart Operator behavior, and preserve the superseded
   interim behavior as historical provenance.

Scope
-----
- This document defines only observable product behavior (what a golfer or Cart
   Operator sees and does).
- It intentionally excludes implementation details such as GPIOs, timing constants, transistor driver circuits, interrupt names, PWM values, firmware function names, or backend transport/persistence mechanisms.
- The behavior below was physically validated on FRB-0002, including Stage B2 early window termination after an exactly correlated operator COMPLETE. On 2026-10-09 the CPO also confirmed normal button/LED operation and requests appearing in the cart UI on FRB-0003 / Prototype 3.3 with the accepted Embarrassingly Small Runtime. This does not add FRB-0003 COMPLETE or repeat-window validation; exact provenance and scope are owned by `docs/FIRMWARE_SPECIFICATION.md`. Repeat-press transport/persistence remains deferred; see `docs/feature_backlog.md`.

Purpose of the button marker UX
-------------------------------
- Provide a simple, immediate way for a golfer in the field to create a service request.
- Give clear, unambiguous feedback to the golfer that a request was received, transmitted, and processed.

## Final Monarch Bay Pilot Golfer UX (Implemented and Validated Locally)

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
- Successful acceptance starts the stable baseline's five-minute demand window, measured from the initial physical button press. Course-configurable duration was abandoned and is not an accepted product setting; no 60-second setting is accepted by this baseline.

### 4. Failed request
- If the transaction reaches terminal failure within the 15-second budget, orange ends.
- Red performs a blink-blink indication, followed by approximately 5 seconds of solid red.
- A failed transaction does not start a demand window.
- After the failure indication completes, the button is enabled again; the next valid press begins a completely new bounded golfer transaction.
- There is no long retry lockout.

## Five-Minute Golfer Demand Window
The accepted product behavior uses a fixed five-minute duration. A Course-configurable duration was explored but abandoned; it is not an approved product setting or Admin workflow. See `docs/feature_backlog.md` for the disposition and archive reference.

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

Product Brief v1.2 defines this capability. The current implementation and
deployment status are owned by `docs/DEPLOYMENT_GUIDE.md` and
`docs/feature_backlog.md`.

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

## Cart Operator Push Notifications (Implemented and Physically Validated)

- The Cart Operator installs Fairway from Safari as an iPhone Home Screen web
   application, signs in with an approved Fairway account, and independently
   enables new-request notifications for each authorized Course.
- The saved notification preference belongs to the authenticated user and
   Customer/Course pair. It is separate from browser/device notification
   permission; disabling one Course does not disable Cart access or another
   Course's preference.
- One newly accepted golfer request produces one visible notification for each
   active subscription whose user still has Course access and has enabled that
   Course's preference. The notification identifies the request location.
- Revoking a user's Course access or disabling their saved preference prevents
   subsequent delivery even if the device's push subscription remains stored.
  Push delivery failures are asynchronous and do not block Cart Operations.
- Tapping the notification opens or focuses the authenticated Fairway
   application at the originating request and course. The request remains
   actionable through the normal operator workflow.
- A press suppressed by the marker's active demand window does not
   produce another request or notification.
- Physical production acceptance on 2026-10-01 used FRB-0002 at Hole 2. The CPO
   observed exactly one notification for one authoritative request, successful
   deep-link focus, and no notification for the in-window duplicate press.
- Per-user/per-Course preference controls and delivery-time authorization
   filtering are implemented in source and covered by automated regression
   tests; their environment deployment status is owned by
   `docs/DEPLOYMENT_GUIDE.md`.

## Cart Operator Application (Implemented and Accepted in Production)

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
- The application is a full-surface, landscape-iPad-first responsive workspace.
- The active queue is oldest first. The oldest request receives the strongest
   visual focus while all remaining active requests stay visible in order.
- The queue summary shows the active-request count without repeating the oldest
   request's hole above its card; the focused card is the single location display.
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
- History provides day, week, and month summaries plus completed/cancelled
   outcomes. Cart-hour metrics use scheduled service time minus scheduled-time
   overlap with operator suspensions; off-hours do not count as active cart time.
   The operator-facing transaction-rate label is "Transactions per hour."
- Existing Firebase Authentication, Course assignment authorization, Web Push,
   installed-app behavior, and request deep links remain part of the workflow.

This application behavior was CPO-accepted in the functional sandbox and
promoted to production on 2026-10-01. Production acceptance established the
full-surface Option C queue, completion feedback and transaction increment,
guarded Cancel action, empty state, schedule visibility/editability, and
independent Operator/Admin authorization paths at `app.fairwayrefresh.com`.

## Superseded Single-Indicator Behavior (Historical)

The pre-Prototype-3.2 firmware used one indicator: three brief transmitting
blinks, three rapid success blinks, and a long solid failure indication. This
is retained only as historical provenance and is not current firmware or
current golfer guidance.

Historical interim interaction sequence
----------------------------------------
1. Button pressed
   - During request processing, the device performs three brief blinks
     before the first backend transmission attempt.

2. Request initiated
   - The device begins the first backend transmission attempt after the initial three-blink acceptance indication. Internal retry attempts are not shown.

3. Request acknowledged
   - The LED performs three rapid blinks to indicate the backend acknowledged the request and stored it.

4. Request failed
   - The LED holds a long solid illumination to indicate the request failed.

Historical LED meanings
-----------------------
- Initial three brief blinks: button press accepted and request processing begun.
- Three rapid blinks: success — the request has been acknowledged by the backend.
- Long solid illumination: failure — the request did not complete successfully.

Historical expected user behavior
---------------------------------
- Press the physical marker button once to create a request.
- Observe the LED sequence; only one press is needed for a single request when the device is idle.
- If the LED indicates success (three rapid blinks), no further action is required.
- If the LED indicates failure, press the button one additional time. If the second attempt also fails, continue playing. If another button marker is encountered before the cart arrives, another request may be attempted.
- The golfer should allow the device to complete its feedback sequence before pressing again to avoid duplicate requests.

Notes
-----
- Current timing constants and backend implementation status are intentionally
   omitted from this user-behavior document; implementation is owned by
   `docs/FIRMWARE_SPECIFICATION.md`, `docs/feature_backlog.md`, and source.
- This spec assumes the indicators are visible to the user in normal operating conditions.
- Indicator hardware identity and wiring are owned by `docs/HARDWARE_BOM.md` and `docs/HARDWARE_ASSEMBLY_GUIDE.md`.
- Firmware implementation details and constraints are owned by `docs/FIRMWARE_SPECIFICATION.md`.

Design principle
----------------
The final user experience should favor confidence and simplicity over exposing
technical details.
