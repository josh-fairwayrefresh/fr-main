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
Prototype 1.0 stopped functioning while the battery pack measured approximately 3.0 V at rest. Replacing the cells with fresh batteries measuring approximately 4.0 V restored operation. This indicates that resting voltage alone is insufficient to establish operational readiness. At the accepted 5.0 V PPK2 boundary, CPO validation measured an LTE transaction peak of approximately 250 mA. This LP 1.0-era validated sequence was dormant -> button wake -> LTE/HTTPS request -> LED feedback -> return to approximately 23.5 uA dormant current; see the Firmware Generation Registry below for the current LP 1.2 dormant-current result. The supporting PPK2 waveform has been retained as reference validation evidence.

Current Implementation
----------------------
- Architecture: single application image managing a compact state machine for user interaction and network operations.
- Hardware architecture boundary: the current approved pilot-build battery-health architecture (Adafruit 5580 / MAX17048 with the onboard J4 VBAT/GND feed refinement) is a hardware design decision owned by `docs/HARDWARE_BOM.md` and `docs/HARDWARE_ASSEMBLY_GUIDE.md`. It does not change the validated LP 1.2 firmware generation or the runtime firmware implementation described in this document.
- The Circuit Dojo nRF9151 Feather physical header-to-signal/nRF9151 mapping is owned by `docs/HARDWARE_ASSEMBLY_GUIDE.md`; current source and DTS own implementation pin configuration and consumption.
- Modem provisioning: current firmware provisions a Cloud Run CA chain into the modem credential store, performs a single LTE connect call on startup, then polls registration status until home or roaming registration is reached.
- Payload and auth: current firmware sends a minimal JSON payload including `device_id` and `event_type`, and sets an `X-Fairway-Device-Key` header for backend authentication. Both the `device_id` value and the credential are read from `FAIRWAY_DEVICE_ID`/`FAIRWAY_DEVICE_KEY` macros provisioned in one local, gitignored per-device header (`secrets/fairway_device_key.h`); firmware source no longer hardcodes a device identity literal. The backend verifies the presented credential against that exact claimed device's own stored verifier; see `docs/DEVICE_PROVISIONING_GUIDE.md` for the credential architecture.
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
| LP 1.2 (West SDK Offloaded, NCS 3.1.1 Upgrade) | `3e3e724aa6bcb098d8fda98f45af78d299b9da62` (nPM1300 → nPM13XX Kconfig/API compatibility patch, plus removal of the ineffective stale `CONFIG_PDN_DEFAULT_APN` assignment) | Validated artifact `merged.hex`, SHA-256 `e2acecc0c0c958b448c8d399935e343e8d83cd0da1f27e1e18859d55c4c5c48f`, 500,228 bytes | 2026-09-12 | Validated production generation | Fairway `nfed` built as a freestanding product repository against the separately installed official NCS v3.1.1 SDK and matching Nordic toolchain, with explicit `BOARD_ROOT`; no second Fairway-owned West/NCS reconstruction required. Validated button transaction over LTE-M/HTTPS with backend/webapp acceptance. Field dormant current measured at 23.25 uA versus the approximately 23.5 uA LP 1.0 baseline; no regression demonstrated. A green RGB LED observed while USB was connected during service/debug mode is the nPM1300 PMIC's autonomous hardware charging-status indicator and is not evidence of a field-mode power regression. TF-M secure-image flash utilization observed at 97.90% (31,580 / 32,256 bytes); retained as a watch item, not a demonstrated blocker. |

Firmware-bearing roadmap work uses sprint branches named `sprint/<category-slug>`, for example `sprint/button-behavior`, `sprint/device-provisioning`, `sprint/device-reliability`, `sprint/infrastructure`, `sprint/operator-ux`, `sprint/power-battery`, and `sprint/pilot-release`. The lightweight lifecycle is: approved roadmap sprint -> sprint branch -> implementation and validation -> approved merge to `main` -> canonical firmware registry update. Future generation names are selected for meaningful roadmap milestones; no rigid numeric sequence is required. OTA/FOTA and remote fleet firmware distribution are deferred and are not required for the current pilot strategy.

WP3 per-device identity/credential source provenance: commit `82be49dd8cd935c3500e519351f636f9f189cc20` (`Implement per-device fleet identity and authentication`) records the LP 1.2-compatible source used for the accepted WP3 work. The reference device was built under NCS 3.1.1, provisioned as `FRB-0001`, flashed, and physically validated end-to-end before that commit; the final post-validation firmware-source remediation was comment-only. See `docs/DEVICE_PROVISIONING_GUIDE.md` ("Existing Reference Device: FRB-0001") for the validation record. No `merged.hex` was rebuilt from commit `82be49dd8cd935c3500e519351f636f9f189cc20`, and this note does not claim artifact equivalence with the LP 1.2 artifact recorded above or designate a new firmware generation.

Modem Firmware — CPO-Confirmed Physical-Device Validation
-----------------------------------------------------------
The validated LP1.2 device was confirmed by the CPO using Nordic nRF Connect for Desktop to be running nRF9151 modem firmware 2.0.2. This is CPO-confirmed physical-device validation evidence, not a repository-derived or Git-established fact.

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
- In validated field mode at the accepted 5.0 V boundary, LP 1.2 production dormant current settled at approximately 23.25 uA, versus the approximately 23.5 uA LP 1.0 baseline; no field-power regression was demonstrated. Button wake, the normal LTE/HTTPS request sequence, LED feedback, and return to dormant current after the transaction were validated with BUCK2 disabled.
- USB/VBUS-present service mode retains BUCK2 so the onboard USB/debug service domain remains powered. USB service mode and field-power mode are separate operating configurations.
- I2C2 remains enabled because the board DTS instantiates the nPM1300 PMIC and LIS2DH on that bus. Fairway main.c performs no I2C2 transaction while waiting in STATE_IDLE. The nPM1300 MFD driver can submit work in response to its host-interrupt GPIO, and that work uses the normal I2C APIs. LIS2DH is present in devicetree but its sensor subsystem is not enabled in Build A, so it has no active trigger, polling, timer, or work path.

USB/VBUS Service-Awake Behavior (Validated)
--------------------------------------------
- The reference nRF9151 package marking is CPO-confirmed as LACA A1, which is within the silicon family covered by Nordic Errata 36 ("Debug and Trace: Access port gets locked in WFI and WFE"). During development, probe-rs debug access was observed to become unavailable after the device entered its runtime low-power WFI behavior.
- Fairway firmware implements a dedicated service-awake keeper thread running at `K_LOWEST_APPLICATION_THREAD_PRIO`, the lowest application priority, strictly above the Zephyr idle thread. While USB/VBUS is present, this thread remains continuously runnable, which prevents Zephyr from selecting its idle thread and therefore prevents the application CPU from entering WFI/System-On-idle for as long as VBUS remains present. Every normal higher-priority Fairway, system-workqueue, and LTE/modem thread continues to preempt the keeper normally.
- While USB/VBUS is present, modem PSM is withdrawn (`lte_lc_psm_req(false)`); while USB/VBUS is absent, PSM remains requested exactly as in the existing field policy described above.
- BUCK2 continues to follow its existing VBUS-present-ON / VBUS-absent-OFF policy, unchanged by this behavior.
- This is a service/development-mode behavior only. Field/dormant behavior when USB/VBUS is absent is unchanged: the CPU may enter WFI, the modem may use PSM, and BUCK2 follows the existing field policy described above.
- Direct hardware validation (commit `c720f8069b514d28c97bf80c47b9e4b39399a0eb` on sprint branch `sprint/device-reliability`) confirmed: VBUS detected at boot, the keeper enabled, PSM withdrawn, normal STATE_IDLE reached with no false button/request event, and ordinary probe-rs access remained available after two separate approximately 5-minute USB-connected intervals with no recovery workaround required. This validates the prevention behavior across the tested interval; it does not establish multi-hour/day debug-session reliability, and it does not establish that every historical AP-access loss was caused by Errata 36.

Device Health Diagnostics (Validated)
--------------------------------------
- The existing request-flow health snapshot captures, per attempt: registration state, HTTPS result, HTTP status, transaction attempt count, modem internal temperature, LTE connection-evaluation results (RSRP, RSRQ, SNR, serving cell ID, serving band), and PSM context where available.
- Battery-health acquisition uses the native NCS 3.1.1 fuel-gauge API (`fuel_gauge_get_props()`) against the installed Adafruit 5580 / MAX17048 on I2C2 at address 0x36, requesting `FUEL_GAUGE_VOLTAGE` and `FUEL_GAUGE_RELATIVE_STATE_OF_CHARGE`. Battery voltage is the primary battery-health measurement; SOC is supplementary.
- Direct hardware validation on the reference device confirmed live acquisition of all current Device Health fields in a single snapshot, including modem internal temperature, RSRP, RSRQ, SNR, serving cell ID, serving band, registration/HTTP/attempt tracking, and battery voltage/SOC.
- Battery-voltage validation: the MAX17048 reported 4.0125 V; a CPO DMM measurement directly at the LiPo node was approximately 4.0 V; the difference was approximately 12.5 mV (approximately 0.31%), accepted by the CPO as adequate out-of-box battery-voltage calibration for the prototype. This validates voltage acquisition only; SOC accuracy has not been independently calibrated, and long-term SOC model behavior has not been validated.
- This diagnostics work does not yet include persistence, backend transmission, or an admin-facing view; the snapshot is currently logged locally only.

Device Health Transport and Scheduling (Approved Target, Not Yet Implemented)
------------------------------------------------------------------------------
- Current firmware acquires the Device Health snapshot listed above but does not yet transport it: the outgoing request body remains `{"device_id":..., "event_type":"button_press"}` and carries no health fields. No autonomous scheduled wake exists today; the application currently blocks indefinitely in WFI for a button interrupt only. `latest_health` and health history are not currently persisted by the backend.
- Approved sprint target: every `deployed` marker shall autonomously wake and transmit a Device Health report at approximately 09:00 and approximately 17:00 Course-local time, independent of golfer button activity, with accuracy within approximately +/- 1 minute.
- Approved sprint target: each scheduled report permits exactly two total transmission attempts (the initial attempt plus one retry), with the retry occurring within 90 seconds of the failed first attempt. This scheduled-report attempt policy is distinct from the existing button-request `REQUEST_MAX_ATTEMPTS`/`REQUEST_ATTEMPT_TIMEOUT_MS` retry policy described above.
- Approved sprint target: the Device shall possess valid authoritative time before trusting a scheduled-wake calculation. On first provisioning/boot, and after any reboot/reset where valid time cannot be trusted, the Device shall establish LTE as necessary to obtain/synchronize valid time rather than waiting indefinitely for button activity before doing so.
- Approved sprint target: every successful authenticated Device communication shall provide the Device with its current effective backend configuration needed for scheduled health operation (at minimum, the effective Course timezone and health-report schedule), and the Device shall cache that effective configuration for later autonomous use.
- Approved sprint target: scheduled health transport shall use a transport/event concept semantically distinct from an ordinary golfer `button_press`. `health_report` is the current approved architectural event-name direction.
- The exact nRF9151/NCS timekeeping and low-power scheduled-wake mechanism (for example whether an application timer, modem-assisted time source, or another current-NCS-supported approach is used) is not yet established and is not documented here as implemented fact; it is unresolved implementation work for WP4. An external calendar RTC is not currently assumed necessary, but the actual mechanism must be verified during implementation before being described as current behavior.
- Approved-target backend semantics for `latest_health`, health history, health thresholds, and alert lifecycle are owned by `docs/DEVICE_PROVISIONING_GUIDE.md` and are not duplicated here.

FUTURE ARCHITECTURAL OPTION
- A substantially deeper application-core power architecture could be investigated using nRF9151 System OFF / power-off behavior. Conceptually, the possible future path is `running -> System OFF -> wake event -> reset/reboot -> initialize -> resume Fairway service`.
- System OFF is not approved for implementation. The current product architecture intentionally retains WFI/resume-in-place behavior: `running -> WFI -> button interrupt -> resume execution`.
- System OFF must be evaluated experimentally before any design decision. Evaluation must include achievable current reduction, button wake capability, boot/wake latency, modem initialization and network-registration consequences, preservation or reconstruction of application state, request responsiveness, reliability, recovery behavior, and the energy cost of reboot/reinitialization versus idle savings. System OFF must not be assumed to improve overall battery life before measurement.

Planned Enhancements / Feature Backlog
-------------------------------------
This section owns firmware implementation backlog only. Product-level planning is maintained separately in the Roadmap to MVP.

- Watchdog timer and reset-reason logging.
- Battery-under-load characterization and safe-transmit thresholds.
- Device Health transport and scheduling implementation for the approved WP4
  target described above under "Device Health Transport and Scheduling
  (Approved Target, Not Yet Implemented)"; backend persistence, thresholds,
  alerts, and admin presentation are owned by `docs/DEVICE_PROVISIONING_GUIDE.md`
  and later work packages. The existing local acquisition snapshot is already
  implemented and validated.
- Explicit LTE reconnect strategy with bounded retry/backoff behavior.
- Explicit power-optimization audit.

Engineering rationale
--------------------
- Firmware design should prioritize reliable LTE communication and maximum battery lifetime. Modem activity, retries, peripheral usage, and user feedback should all be evaluated for their power impact, with preference given to predictable field behavior under worst-case operating conditions.
