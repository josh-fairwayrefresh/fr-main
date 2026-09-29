# UX Specification — Fairway Refresh

Purpose
-------
- Describe the CPO-approved final Monarch Bay Pilot externally observable
   golfer-facing behavior, and preserve the current interim firmware-
   implemented behavior as historical/provenance where it differs.

Scope
-----
- This document defines only observable product behavior (what a golfer sees and does).
- It intentionally excludes implementation details such as GPIOs, timing constants, transistor driver circuits, interrupt names, PWM values, firmware function names, or backend transport/persistence mechanisms.
- The final Monarch Bay Pilot behavior below is CPO-approved target product behavior. Firmware/backend implementation of this target is not yet complete; see `docs/FIRMWARE_SPECIFICATION.md` and `docs/feature_backlog.md` for the current implementation gap.

Purpose of the button marker UX
-------------------------------
- Provide a simple, immediate way for a golfer in the field to create a service request.
- Give clear, unambiguous feedback to the golfer that a request was received, transmitted, and processed.

## Final Monarch Bay Pilot Golfer UX (Approved Target)

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

## Five-Minute Golfer Demand Window (Approved Target)

For the Monarch Bay Pilot, a fixed five-minute window from the initial accepted press is the canonical operational proxy for presses attributable to the same golfer group at that marker. This is a pilot product assumption, not a claim that every group occupies every tee box for exactly five minutes; per-hole, par-specific, or administrator-configurable windows are not introduced at this stage.

After the originating request has succeeded, any subsequent valid physical button press during that five-minute window:

- immediately gives the golfer green feedback;
- does not show orange;
- does not initiate another network service-request transaction;
- does not create another operator-facing service request;
- remains associated with the originating accepted request;
- increments that request's repeat-press count by one.

The underlying factual metric is `repeat_press_count`. This is the observed fact; "Frustration Presses" is a possible Admin-facing product interpretation/KPI label for that metric, not the canonical stored event meaning.

Operator CONFIRM and COMPLETE actions do not alter this five-minute marker behavior; the marker's eligibility to create a new request after five minutes is independent of whether the previous request is NEW, CONFIRMED, or COMPLETE.

### Example

- T=0:00 Group A initial press → orange → Request A accepted → green → five-minute window begins.
- T=0:30 operator CONFIRMS Request A → no marker-behavior change.
- T=1:15 Group A presses again → immediate green; Request A `repeat_press_count = 1`; no new operator request.
- T=2:10 Group A presses twice more → immediate green each time; Request A `repeat_press_count = 3`; no new operator request.
- T=5:00 Request A's demand window expires.
- T=6:00 Group B presses → normal orange transaction → new Request B → green on success.

Request A may still be CONFIRMED but not COMPLETE when Request B is created; that is valid. The operator may have multiple legitimate requests from successive golfer groups at the same marker/hole in the queue simultaneously.

## Product / Data Semantics (Approved Target)

- The canonical analytical demand unit remains one successfully accepted golfer service request.
- Internal transport retries and repeat presses within the originating five-minute demand window must not inflate service-request volume.
- `repeat_press_count` belongs to the originating accepted request. The cart operator does not need to see each repeat press as a new request or notification.
- How repeat presses are communicated from the marker and persisted against the originating request is an engineering/implementation decision, not specified by this document; see `docs/feature_backlog.md`.

## Currently Implemented Interim Behavior (Historical/Current Firmware — Superseded as Target)

The following single-indicator interim behavior remains the current firmware-
implemented behavior, preserved here as historical/current-provenance. It is
superseded as the Monarch Bay Pilot target by the approved behavior above and
does not define the target's blink counts, colors, durations, sequencing,
feedback states, or button interaction logic.

Current interim interaction sequence
------------------------------------
1. Button pressed
   - During current request processing, the device performs three brief blinks
     before the first backend transmission attempt.

2. Request initiated
   - The device begins the first backend transmission attempt after the initial three-blink acceptance indication. Internal retry attempts are not shown.

3. Request acknowledged
   - The LED performs three rapid blinks to indicate the backend acknowledged the request and stored it.

4. Request failed
   - The LED holds a long solid illumination to indicate the request failed.

LED meanings (golfer-level, current interim implementation)
-------------------------------------------------------------
- Initial three brief blinks: button press accepted and request processing begun.
- Three rapid blinks: success — the request has been acknowledged by the backend.
- Long solid illumination: failure — the request did not complete successfully.

Expected user behavior (current interim implementation)
-----------------------------------------------------------
- Press the physical marker button once to create a request.
- Observe the LED sequence; only one press is needed for a single request when the device is idle.
- If the LED indicates success (three rapid blinks), no further action is required.
- If the LED indicates failure, press the button one additional time. If the second attempt also fails, continue playing. If another button marker is encountered before the cart arrives, another request may be attempted.
- The golfer should allow the device to complete its feedback sequence before pressing again to avoid duplicate requests.

Notes
-----
- Current timing constants and blink durations, and firmware/backend
   implementation of the approved target above, are intentionally omitted
   from this user-behavior document; implementation is owned by
   `docs/FIRMWARE_SPECIFICATION.md`, `docs/feature_backlog.md`, and source.
- This spec assumes the indicators are visible to the user in normal operating conditions.
- Indicator hardware identity and wiring are owned by `docs/HARDWARE_BOM.md` and `docs/HARDWARE_ASSEMBLY_GUIDE.md`.
- Firmware implementation details and constraints are owned by `docs/FIRMWARE_SPECIFICATION.md`.

Design principle
----------------
The final user experience should favor confidence and simplicity over exposing
technical details.
