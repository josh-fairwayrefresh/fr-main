# UX Specification — Fairway Refresh

Purpose
-------
- Describe the current externally observable behavior of the physical button
   and its feedback to users, and identify the boundary for the future final
   golfer experience.

Scope
-----
- This document defines only observable product behavior (what a golfer sees and does).
- It intentionally excludes implementation details such as GPIOs, timing constants, interrupt names, PWM values, or firmware function names.
- The behavior below is the accepted current interim implementation. It is not
   the final pilot UX and does not establish durable future blink counts,
   colors, durations, sequencing, feedback states, or button interaction logic.

Purpose of the button marker UX
-------------------------------
- Provide a simple, immediate way for a golfer in the field to create a service request.
- Give clear, unambiguous feedback to the golfer that a request was received, transmitted, and processed.

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

LED meanings (golfer-level)
---------------------------
- Initial three brief blinks: button press accepted and request processing begun.
- Three rapid blinks: success — the request has been acknowledged by the backend.
- Long solid illumination: failure — the request did not complete successfully.

Expected user behavior
----------------------
- Press the physical marker button once to create a request.
- Observe the LED sequence; only one press is needed for a single request when the device is idle.
- If the LED indicates success (three rapid blinks), no further action is required.
- If the LED indicates failure, press the button one additional time. If the second attempt also fails, continue playing. If another button marker is encountered before the cart arrives, another request may be attempted.
- The golfer should allow the device to complete its feedback sequence before pressing again to avoid duplicate requests.

Notes
-----
- Current timing constants and blink durations are intentionally omitted from
   this user-behavior document; current implementation detail is owned by
   `docs/FIRMWARE_SPECIFICATION.md` and source.
- This spec assumes the LED is visible to the user in normal operating conditions.
- Firmware implementation details and constraints are owned by `docs/FIRMWARE_SPECIFICATION.md`.

Future final golfer button / LED UX
-----------------------------------
- The current interim interaction will be replaced by a newly designed golfer
   button/light experience before pilot deployment.
- Future backlog priority #5, "Final Golfer Button / LED UX," owns that work.
- The future scheme is not yet canonically specified. Its colors, counts,
   durations, sequences, feedback states, and button interaction logic require
   separate CPO approval, implementation, and validation.
- Nothing in the current interim sequence defines or constrains that future
   scheme.

Design principle
----------------
The final user experience should favor confidence and simplicity over exposing
technical details. Its concrete behavior remains forthcoming under backlog
priority #5.
