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
- The behavior below is implemented and physically validated on FRB-0002, including Stage B2 early window termination after the marker learns of and acknowledges an exactly correlated operator COMPLETE. Repeat-press transport/persistence remains deferred; see `docs/FIRMWARE_SPECIFICATION.md` and `docs/feature_backlog.md`.

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
- Successful acceptance starts a fixed five-minute demand window, measured from the initial accepted physical button press.

### 4. Failed request
- If the transaction reaches terminal failure within the 15-second budget, orange ends.
- Red performs a blink-blink indication, followed by approximately 5 seconds of solid red.
- A failed transaction does not start a five-minute demand window.
- After the failure indication completes, the button is enabled again; the next valid press begins a completely new bounded golfer transaction.
- There is no long retry lockout.

## Five-Minute Golfer Demand Window (Implemented and Validated Locally)

For the Monarch Bay Pilot, a fixed five-minute window from the initial accepted press is the canonical operational proxy for presses attributable to the same golfer group at that marker. This is a pilot product assumption, not a claim that every group occupies every tee box for exactly five minutes; per-hole, par-specific, or administrator-configurable windows are not introduced at this stage.

After the originating request has succeeded, any subsequent valid physical button press during that five-minute window:

- immediately gives the golfer green feedback;
- does not show orange;
- does not initiate another network service-request transaction;
- does not create another operator-facing service request;
- remains locally associated with the originating accepted transaction;
- increments the firmware-local repeat-press count by one.

The firmware-local window and count are implemented. Transporting a repeat press and persisting it against the originating request are not yet implemented. The approved persisted factual metric remains `repeat_press_count`; "Frustration Presses" is a possible Admin-facing product interpretation/KPI label, not the canonical stored event meaning.

Operator CONFIRM does not alter this five-minute marker behavior. Operator COMPLETE creates a best-effort command for the exact originating request. If the marker learns of and acknowledges that matching command while the window is active, it terminates the window early and returns to normal eligibility for a fresh golfer request. Until then, or if the command is missing, delayed, stale, expired, mismatched, or unreachable, the validated in-window behavior continues and the local five-minute expiry remains authoritative.

### Approved End-to-End Example

- T=0:00 Group A initial press → orange → Request A accepted → green → five-minute window begins.
- T=0:30 operator CONFIRMS Request A → no marker-behavior change.
- If Request A is not completed, an in-window press at T=1:15 gives immediate green and remains associated with Request A; the local window expires at T=5:00, and a later press follows the normal orange transaction path.
- Alternatively, if the operator COMPLETES Request A at T=0:45, the marker ends Request A's local window after learning of and acknowledging that exact matching command.
- The next valid press after that acknowledgement follows the normal orange transaction path and may create a fresh Request B before T=5:00.

Request A may still be CONFIRMED but not COMPLETE when Request B is created; that is valid. The operator may have multiple legitimate requests from successive golfer groups at the same marker/hole in the queue simultaneously.

## Product / Data Semantics (Approved End-to-End Target)

- The canonical analytical demand unit remains one successfully accepted golfer service request.
- Internal transport retries and repeat presses within the originating five-minute demand window must not inflate service-request volume.
- `repeat_press_count` belongs to the originating accepted request. The cart operator does not need to see each repeat press as a new request or notification.
- How repeat presses are communicated from the marker and persisted against the originating request is an engineering/implementation decision, not specified by this document; see `docs/feature_backlog.md`.

## Cart Operator Push Notifications (Implemented and Physically Validated)

- The Cart Operator installs Fairway from Safari as an iPhone Home Screen web
   application, signs in with an approved Fairway account, and explicitly enables
   notifications.
- One newly accepted golfer request produces one visible notification for each
   active, authorized course subscription. The notification identifies the
   request location.
- Tapping the notification opens or focuses the authenticated Fairway
   application at the originating request and course. The request remains
   actionable through the normal operator workflow.
- A press suppressed by the marker's active five-minute demand window does not
   produce another request or notification.
- Physical production acceptance on 2026-10-01 used FRB-0002 at Hole 2. The CPO
   observed exactly one notification for one authoritative request, successful
   deep-link focus, and no notification for the in-window duplicate press.

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
