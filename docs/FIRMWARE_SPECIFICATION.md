# Firmware Specification — Fairway Refresh
Primary Engineering Objective
---------------------------
Reliable operation with maximum achievable battery lifetime.

Engineering Philosophy
---------------------
Firmware is intentionally optimized for robustness, simplicity, and long unattended battery life rather than maximum responsiveness or feature richness. Whenever tradeoffs are required, preference should be given to predictable field behavior, recoverability, and energy efficiency.

Design Objective
----------------
Firmware should be optimized for maximum battery lifetime while maintaining reliable operation. Every user-visible behavior, modem activity, retry strategy, and future feature should be evaluated against its battery impact. A formal power optimization audit has not yet been completed.

Field Observation
-----------------
Prototype 1.0 stopped functioning while the battery pack measured approximately 3.0 V at rest. Replacing the cells with fresh batteries measuring approximately 4.0 V restored operation. This indicates that resting voltage alone is insufficient to establish operational readiness. At the accepted 5.0 V PPK2 boundary, CPO validation measured an LTE transaction peak of approximately 250 mA. The full validated sequence was dormant -> button wake -> LTE/HTTPS request -> LED feedback -> return to approximately 23.5 uA dormant current. The supporting PPK2 waveform has been retained as reference validation evidence.

Current Implementation
----------------------
- Architecture: single application image managing a compact state machine for user interaction and network operations.
- Modem provisioning: current firmware provisions a Cloud Run CA chain into the modem credential store, performs a single LTE connect call on startup, then polls registration status until home or roaming registration is reached.
- Payload and auth: current firmware sends a minimal JSON payload including `device_id` and `event_type` and sets an `X-Fairway-Device-Key` header for backend authentication.
- Button lockout: the firmware uses configurable `REQUEST_MAX_ATTEMPTS` and `REQUEST_ATTEMPT_TIMEOUT_MS` values, derives the physical-button lockout as their product, and ignores additional button activity during that lockout. A held button does not delay the first network attempt.
- Request retry and validation: the firmware performs sequential retry attempts without overlapping requests. Each attempt uses its own timeout window; valid HTTP 2xx responses succeed, HTTP 400, 401, 403, and 404 responses terminate retries, and other unsuccessful attempts use remaining configured attempts.
- State machine: the device implements IDLE, TRANSMITTING, SUCCESS, and FAILURE states and transitions between them in response to button events and network results.
- Duplicate suppression: the backend currently suppresses duplicates by checking for existing `requests` with status `new` or `confirmed`.

Firmware Generation Registry
----------------------------
The current pilot firmware lineage is recorded against exact Git provenance and validated artifact records.

| Firmware generation | Source commit | Checkpoint / artifact | Validation date | Status | Baseline |
|---|---|---|---|---|---|
| First build | `9d512875e46f550fdea3dff595383c3804dd8366` | Historical source identity | 2026-09-11 | Historical predecessor | Stable Fairway state before LP 1.0 promotion. |
| LP 1.0 (Low-Power 1.0) | `245e3ba62dcbbbae4930b94ed86be09fbade377a` | Accepted checkpoint `112916b008eec9352fa21fa78b4d442628901968` | 2026-09-11 | Validated production generation | VBUS-aware BUCK2 service-rail policy with validated field dormant current of approximately 23.5 uA at the accepted 5.0 V boundary and successful button transaction return to the dormant state. |
| NCS 3.1.1 Migration | This commit (nPM1300 → nPM13XX Kconfig/API compatibility patch, plus removal of the ineffective stale `CONFIG_PDN_DEFAULT_APN` assignment) | Validated artifact `merged.hex`, SHA-256 `e2acecc0c0c958b448c8d399935e343e8d83cd0da1f27e1e18859d55c4c5c48f`, 500,228 bytes | 2026-09-12 | Validated production generation | Fairway `nfed` built as a freestanding product repository against the separately installed official NCS v3.1.1 SDK and matching Nordic toolchain, with explicit `BOARD_ROOT`; no second Fairway-owned West/NCS reconstruction required. Validated button transaction over LTE-M/HTTPS with backend/webapp acceptance. Field dormant current measured at 23.25 uA versus the approximately 23.5 uA LP 1.0 baseline; no regression demonstrated. A green RGB LED observed while USB was connected during service/debug mode is the nPM1300 PMIC's autonomous hardware charging-status indicator and is not evidence of a field-mode power regression. |

Firmware-bearing roadmap work uses sprint branches named `sprint/<category-slug>`, for example `sprint/button-behavior`, `sprint/device-provisioning`, `sprint/device-reliability`, `sprint/infrastructure`, `sprint/operator-ux`, `sprint/power-battery`, and `sprint/pilot-release`. The lightweight lifecycle is: approved roadmap sprint -> sprint branch -> implementation and validation -> approved merge to `main` -> canonical firmware registry update. Future generation names are selected for meaningful roadmap milestones; no rigid numeric sequence is required. OTA/FOTA and remote fleet firmware distribution are deferred and are not required for the current pilot strategy.

Validated Prototype Behavior
----------------------------
- User-visible device behavior is defined by `docs/UX_SPECIFICATION.md`.
- This document defines the firmware implementation that supports that behavior.

HTTPS and LTE behavior
----------------------
- TLS: current implementation uses TLS with peer verification against the provisioned CA chain.
- Socket handling: firmware requires an explicitly parsed HTTP 2xx response for request success; transport, TLS, timeout, malformed-response, and non-success HTTP results are unsuccessful attempts according to the retry policy.

Failure handling (current vs future)
-----------------------------------
- Current implementation transitions to a FAILURE state after terminal network failure or exhausted retry attempts and displays failure feedback to the user.
- Retry policy uses the configured sequential attempt limit and per-attempt timeout; DNS remains a synchronous modem-offloaded operation without an application cancellation boundary.

Debounce and duplicate behavior
-------------------------------
- Debounce is implemented in firmware today.
- Duplicate suppression is currently enforced server-side; ownership of a device-side cooldown is to be decided.

Power and sleep strategy
------------------------
- CURRENT VALIDATED STATE
- Application CPU: while IDLE, the application blocks indefinitely waiting for a button event. The nRF9151 application Cortex-M33 reaches the Zephyr idle path and uses WFI (Wait For Interrupt). Conceptually, the current path is `running -> WFI -> interrupt -> resume execution`. WFI preserves the application execution context and supports the current Fairway button-wake architecture. This is not a separate deep Zephyr system-power state: generic Zephyr system PM / `CONFIG_PM` is not enabled as a deeper resume-in-place CPU state, and prior target-specific investigation did not establish another deeper resume-in-place CPU/system state for this nRF9151 target beyond WFI.
- Cellular modem: the application requests LTE PSM after modem initialization and before LTE connection, using modem/network-default RPTAU (`-1`) and zero-second RAT (`0`). Automatic Kconfig PSM requesting is disabled so the runtime request is the single application authority. PSM is validated current behavior on Prototype 1.0: the network granted a validated TAU of `11,160 s` with active time `0 s`; the modem entered sleep after registration, button/request activity caused modem sleep exit, the HTTPS request completed successfully, and the modem subsequently re-entered sleep. An earlier `13,800 s` grant is historical and is not the latest validated observation.
- Wake-for-button events triggers the transmit sequence; firmware aims to minimize modem-on time.
- HTTPS success requires an explicitly parsed HTTP 2xx response. HTTP 400, 401, 403, and 404 responses terminate network retries; transport, TLS, timeout, malformed-response, and HTTP 5xx failures remain retryable within the configured attempt limit. DNS continues to use the synchronous modem-offloaded resolver, whose exact per-attempt cancellation boundary is not controllable by the current API.
- eDRX is intentionally disabled in the current low-power design. Build A explicitly sets `CONFIG_LTE_EDRX_REQ=n`; the generated image leaves `CONFIG_LTE_LC_EDRX_MODULE` unset, and the application calls no eDRX API. PSM remains the intended modem idle mechanism because the current product does not require network-initiated reachability while sleeping. eDRX is not unsupported generally; it is simply not used by the current Fairway Refresh implementation.
- Profile A deferred logging remains event-triggered through the existing logger thread rather than an application polling loop; UART logging remains enabled for startup, request, and troubleshooting events.
- LTE modem PSM remains the modem low-power architecture and has already been runtime-validated. `CONFIG_LTE_LC_MODEM_SLEEP_MODULE` provides diagnostic modem-sleep notification visibility in temporary diagnostic builds; it is not the authority that enables PSM. The application PSM request remains `lte_lc_psm_param_set_seconds(-1, 0)` followed by `lte_lc_psm_req(true)`.
- Device runtime PM: Phase 1 enables `CONFIG_PM_DEVICE` and `CONFIG_PM_DEVICE_RUNTIME` for UART0/UARTE0 runtime ownership. The existing UART console and log backend acquire UART0 for legitimate output and release it afterward; the installed UART driver suspends the UARTE and applies its sleep pinctrl state, then restores default pinctrl on resume. The Phase 1 whole-device idle result was `917.75 uA` over a representative stable window versus an approximately `1.40 mA` pre-change baseline, a material reduction of approximately `34.4%`. This whole-device A/B measurement does not attribute the entire reduction specifically to UART0.
- Phase 2 adds explicit I2C2/TWIM2 runtime ownership. The Build A overlay suppresses `zephyr,pm-device-runtime-auto` for I2C2, and the installed TWIM transaction path acquires runtime PM before each I2C transfer and releases it afterward. The Phase 2 whole-device idle result was `901.12 uA`, only `16.63 uA` or approximately `1.8%` below Phase 1. This is classified as no material additional idle reduction; the small difference is not attributed necessarily to I2C2 rather than measurement variation.
- GPIO/GPIOTE remains active as the required physical button wake resource. The button ISR contains no UART or PM work, and the wake diagnostic log is emitted from the awakened main-thread path. Kernel timing/clocks and GPIO/GPIOTE are required infrastructure rather than ordinary peripherals to suspend.
- Current idle power model: `CPU -> WFI`; `modem -> LTE PSM`; `UART0 -> runtime PM`; `I2C2 -> runtime PM`; `GPIO/GPIOTE -> retained button wake resource`.
- The Phase 2 generated-build inventory found zero additional genuine application-side runtime-PM peripheral candidates. UART1-3, I2C0/1/3, the ADC/SAADC driver path, the SPI/external-flash application path, PWM, watchdog, USB application stack, and the LIS2DH sensor driver path are inactive or disabled in Build A. The nPM1300 PMIC remains part of the board power tree, and the modem/application interface remains required for LTE/PSM operation; neither is treated as an ordinary suspendable application peripheral.
- The current production whole-device dormant state disables nPM1300 BUCK2 when VBUS is absent. BUCK2 powers the RP2040 USB/debug service domain; BUCK1 remains the always-on application +3V3 rail and is not changed by the policy. At boot, firmware reads the nPM1300 charger VBUS-present state and retains BUCK2 for USB/VBUS service mode or disables it for field mode. The nPM1300 VBUS event path keeps that policy synchronized with later VBUS state changes.
- The accepted Fairway operating and measurement boundary is PPK2 Source Measure mode at 5.0 V, 1 A range, 100 ksps, with primary AA batteries disconnected and Feather USB disconnected. This is a whole-device measurement boundary, not a direct measurement of an individual peripheral.
- In validated field mode at the accepted 5.0 V boundary, production dormant current settled at approximately 23.5 uA. Button wake, the normal LTE/HTTPS request sequence, LED feedback, and return to approximately 23.5 uA dormant current after the transaction were validated with BUCK2 disabled.
- USB/VBUS-present service mode retains BUCK2 so the onboard USB/debug service domain remains powered. USB service mode and field-power mode are separate operating configurations.
- I2C2 remains enabled because the board DTS instantiates the nPM1300 PMIC and LIS2DH on that bus. Fairway main.c performs no I2C2 transaction while waiting in STATE_IDLE. The nPM1300 MFD driver can submit work in response to its host-interrupt GPIO, and that work uses the normal I2C APIs. LIS2DH is present in devicetree but its sensor subsystem is not enabled in Build A, so it has no active trigger, polling, timer, or work path.

FUTURE ARCHITECTURAL OPTION
- A substantially deeper application-core power architecture could be investigated using nRF9151 System OFF / power-off behavior. Conceptually, the possible future path is `running -> System OFF -> wake event -> reset/reboot -> initialize -> resume Fairway service`.
- System OFF is not approved for implementation. The current product architecture intentionally retains WFI/resume-in-place behavior: `running -> WFI -> button interrupt -> resume execution`.
- System OFF must be evaluated experimentally before any design decision. Evaluation must include achievable current reduction, button wake capability, boot/wake latency, modem initialization and network-registration consequences, preservation or reconstruction of application state, request responsiveness, reliability, recovery behavior, and the energy cost of reboot/reinitialization versus idle savings. System OFF must not be assumed to improve overall battery life before measurement.

Planned Enhancements / Feature Backlog
-------------------------------------
This section owns firmware implementation backlog only. Product-level planning is maintained separately in the Roadmap to MVP.

- Watchdog timer and reset-reason logging.
- Battery-under-load characterization and safe-transmit thresholds.
- Telemetry and device health metrics.
- Explicit LTE reconnect strategy with bounded retry/backoff behavior.
- Explicit power-optimization audit.

Engineering rationale
--------------------
- Firmware design should prioritize reliable LTE communication and maximum battery lifetime. Modem activity, retries, peripheral usage, and user feedback should all be evaluated for their power impact, with preference given to predictable field behavior under worst-case operating conditions.
