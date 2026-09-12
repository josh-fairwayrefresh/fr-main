# UX Specification — Fairway Refresh

Purpose
-------
- Describe the externally observable behavior of the physical button and its feedback to users.

Scope
-----
- This document defines only observable product behavior (what a golfer sees and does).
- It intentionally excludes implementation details such as GPIOs, timing constants, interrupt names, PWM values, or firmware function names.

Purpose of the button marker UX
-------------------------------
- Provide a simple, immediate way for a golfer in the field to create a service request.
- Give clear, unambiguous feedback to the golfer that a request was received, transmitted, and processed.

User interaction sequence
-------------------------
1. Button pressed
   - The LED immediately performs three brief blinks to confirm the press was accepted and request processing has begun.

2. Request initiated
   - The device begins the first backend transmission attempt after the initial three-blink acceptance indication. Internal retry attempts are not shown.

3. Request acknowledged
   - The LED performs three rapid blinks to indicate the backend acknowledged the request and stored it.

4. Request failed
   - The LED holds a long solid illumination to indicate the request failed.

LED meanings (golfer-level)
---------------------------
- Initial three brief blinks: button press accepted and request processing begun.
- Initial three brief blinks: button press accepted and request processing begun — please wait.
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
- Timing and blink durations are intentionally omitted; implementations may tune them for power and human factors.
- This spec assumes the LED is visible to the user in normal operating conditions.
- Firmware implementation details and constraints are owned by `docs/FIRMWARE_SPECIFICATION.md`.

Design principle
----------------
The user experience intentionally favors confidence and simplicity over exposing technical details. The golfer should only need to understand whether the request is being processed, succeeded, or failed.
