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
- Architecture: single application image composed of small, single-responsibility modules (see "Runtime architecture" below) rather than one monolithic file; each module owns one concern and exposes an explicit interface to the others.
- Hardware architecture boundary: the current approved pilot-build battery-health and three-indicator architecture is owned by `docs/HARDWARE_BOM.md` and `docs/HARDWARE_ASSEMBLY_GUIDE.md`. Prototype 3.2 firmware drives that hardware as described below; physical wiring remains outside this document.
- The Circuit Dojo nRF9151 Feather physical header-to-signal/nRF9151 mapping is owned by `docs/HARDWARE_ASSEMBLY_GUIDE.md`; current source and DTS own implementation pin configuration and consumption.
- Runtime architecture: `main.c` is the orchestrator only (button/LED sequencing and module wiring); it owns no transport, power, or modem logic directly. `button_ux.c` owns the button GPIO/ISR and three indicator LEDs. `golfer_txn.c` owns the accepted-transaction handoff/completion state. `golfer_protocol.c` owns the golfer `button_press` wire protocol and its retry loop. `command_protocol.c` owns the COMPLETE wire protocol in both directions (build poll/ack requests, parse responses). `http_transport.c` owns the DNS cache/resolver and the bounded HTTPS socket/TLS primitive, parameterized by a `yieldable` flag rather than knowing which caller it serves. `power_policy.c` owns VBUS/BUCK2 detection and the Errata-36 awake-keeper; it has no dependency on the external battery/solar front-end, since the nPM1300 PMIC is onboard the Feather itself. `modem_service.c` owns modem/cert/LTE bring-up and is the sole owner of whether PSM is actually requested from the modem. `transaction_scheduler.c` is the sole owner of the shared transport for golfer and COMPLETE, auto-started via its own thread. Local button/LED hardware initializes before modem/network work. The dedicated 3,072-byte `transaction_thread` (in `transaction_scheduler.c`) is the sole owner of golfer and active-window COMPLETE HTTPS. `modem_service_thread` (in `modem_service.c`) owns modem initialization, PSM, certificate provisioning, asynchronous LTE startup, and registration-triggered DNS prewarm. `dns_resolver_thread` (in `http_transport.c`) isolates the unbounded modem-offloaded resolver call. No scheduled/background application networking exists outside an active golfer lifecycle.
- Modem provisioning: current firmware provisions a Cloud Run CA chain, starts LTE asynchronously with `lte_lc_connect_async()`, and signals `modem_service_thread` on registration. That thread preserves the physically validated asynchronous DNS prewarm and never gates local button readiness.
- Payload and auth: each golfer request sends `device_id` and `event_type = button_press`. `X-Fairway-Device-Key` authenticates the exact claimed Device using the gitignored per-device header (`secrets/fairway_device_key.h`).
- Golfer transaction budget and re-arm: an accepted golfer transaction has a single hard absolute deadline of 15 seconds (`GOLFER_TRANSACTION_BUDGET_MS`) from press acceptance to terminal SUCCESS or FAILURE; internal retries (`GOLFER_MAX_ATTEMPTS`) share that same deadline and never reset or extend it. The historical ~90-second physical-button lockout derived from `REQUEST_MAX_ATTEMPTS`/`REQUEST_ATTEMPT_TIMEOUT_MS` no longer exists; after terminal feedback the button re-arms after a short fixed settle interval (`BUTTON_REARM_SETTLE_MS`), and the physical switch's own debounce/level-check remains unchanged.
- Request retry and validation: within the 15-second budget the firmware performs up to `GOLFER_MAX_ATTEMPTS` sequential attempts without overlap. Each attempt retains the physically validated Prototype 3.2 bounded nonblocking send/receive and HTTP status/body parsing behavior.
- State machine: the device implements IDLE, TRANSMITTING, SUCCESS, FAILURE, and REPEAT_PRESS states in one state machine. REPEAT_PRESS is the local in-window feedback path; it does not create a second transaction scheduler or network flow.
- Golfer-facing indication (currently implemented): orange flashes three times at startup, remains off in IDLE, and pulses throughout an unresolved golfer transaction. SUCCESS stops orange and gives green blink-blink followed by approximately five seconds solid; FAILURE stops orange and gives the same pattern in red. Exact externally observable behavior is owned by `docs/UX_SPECIFICATION.md`.
- Course-configured Golfer Demand Window (implementation candidate, not deployed or physically validated): `Course.golfer_demand_window_ms` is the sole policy value. The backend snapshots policy and receiver-receipt-time expiry for NEW requests, returns an explicit NEW/DUPLICATE acceptance, and preserves the originating stored expiry for duplicate suppression and COMPLETE. Firmware protocol parses the contract; `golfer_txn` transports it with the original physical-press time; `demand_window.c` alone establishes NEW (press time + policy) or DUPLICATE (response time + remaining) local deadlines and repeat eligibility. A zero-remaining or already-expired valid acceptance is SUCCESS with no active window. Local expiry is monotonic and needs neither COMPLETE nor an asynchronous demand-window timer. NEW COMPLETE cadence remains anchored to the original press. Backend duplicate suppression can outlast the local physical-press deadline by initial request transit time. COMPLETE remains the existing 15-second early-completion path.
- Request identity: the stable backend suppresses a duplicate while the Device has an unexpired five-minute demand window and returns that request's ID. After expiry, a fresh press creates a fresh request even if the earlier request remains open. The fixed five-minute local window prevents ordinary in-window presses from creating transactions. Course-configurable policy remains an excluded candidate; repeat-press transport/persistence remains deferred.

Golfer Transaction Architecture
--------------------------------
- Governing priority invariant: golfer transactions are always primary. COMPLETE checks are subordinate and yield at bounded transport checkpoints when a new golfer transaction arrives.
- COMPLETE reuses the sole `transaction_thread`; no listener, persistent socket, MQTT, LwM2M, background Health, or FOTA path exists.
- Local acknowledgement: physical press -> debounce/level-check (unchanged) -> canonical local acknowledgement begins -> only then is the transaction handed to `transaction_thread`. No network, DNS, or telemetry call precedes this acknowledgement.
- Stale/late completion protection: each accepted golfer transaction is assigned a generation inside a single spinlock-guarded handoff structure (deadline, pending/done state, result, generation). A completion reported for an older generation cannot alter LED state or be attributed to a newer transaction.
- COMPLETE correlation protection: the successful response's `request_id` is part of that same generation-tagged handoff. Active-window state is spinlock-guarded, and a command can clear it only after exact request correlation and successful idempotent acknowledgement.
- DNS isolation: `zsock_getaddrinfo()` has no established NCS 3.1.1 application-level timeout and executes only in `dns_resolver_thread`; golfer/COMPLETE transport uses the bounded, age-limited cache accessor.
- Transport deadline enforcement: golfer connect/send/receive stages use a nonblocking socket plus `zsock_poll()` with an explicit remaining-time timeout, since NCS 3.1.1 does not document `SO_SNDTIMEO`/`SO_RCVTIMEO` as bounding `zsock_connect()`.
Transport deadline enforcement: connect/send/receive use a nonblocking socket plus `zsock_poll()` with an explicit remaining-time timeout, since NCS 3.1.1 does not document `SO_SNDTIMEO`/`SO_RCVTIMEO` as bounding `zsock_connect()`. Application waits can be bounded, but individual vendor calls and socket close cannot be preempted by an application deadline; this is not a verified hard wall-clock bound on the shared transport thread.

Accepted Restored Baseline — 2026-10-06
---------------------------------------
The accepted device state was restored from source commit `9775842aebfc5c5ec1cb15ede7329aa58f1709fe` on 2026-10-06 after the separately archived and rejected `sprint/complete-transport-foundation` candidate caused a physical regression. The rejected candidate is preserved locally, not merged or pushed, at archive commit `e19394faa0935cb73e4eec0b217e1ca33ec84367` on `archive/firmware/complete-transport-foundation`. The restored artifact was `/tmp/fairway-rollback-build/merged.hex`, SHA-256 `4c31d29437bc0f4d5937a19a0a395470629c7587671177d5ed16fefab710cc09`, 529,206 bytes; it was programmed with read-back verification and one normal reset. The CPO subsequently reported basic golfer behavior working again after a hard power cycle. This is a restoration of the accepted Embarrassingly Small Runtime source line, not a new firmware generation or a claim that the unresolved COMPLETE polling irregularity is fixed.

The deployed and physically validated `9775842` product state retains the five-minute behavior. The implementation candidate on `sprint/modular-golfer-demand-window` now makes the window Course-configurable while preserving 300,000 ms through one temporary backend fallback. The candidate has passed backend, Admin, macOS firmware-host tests, and a pristine NCS 3.1.1 application build. It has not been deployed or flashed and has not received physical validation. No Course value has been changed to 60 seconds. Deployment order and rollback compatibility are owned by `docs/DEPLOYMENT_GUIDE.md`.

Temporary FRB-0002 Connection Diagnostic — 2026-10-06
----------------------------------------------------
This is diagnostic evidence, not an accepted firmware generation or production fix.
The isolated `/tmp/fairway-golfer-demand-window-minimal` worktree is based on
`9775842aebfc5c5ec1cb15ede7329aa58f1709fe`, with the six-file minimal
Course-duration response patch plus an uncommitted `http_transport.c` diagnostic.
The normal image timed out during TLS-socket connect before sending HTTP.
The first diagnostic resolved `34.143.74.2` with an 80,986 ms cache age and
timed out on a three-second raw-TCP probe; TLS was not tested. The exact IPv4
subsequently accepted TCP and verified TLS from the Mac; this does not prove
device-side reachability. Additional physical presses are not assumed from
console wake events alone.

The enhanced one-shot diagnostic separately logs socket creation, TLS options,
nonblocking configuration, connect, poll events, SO_ERROR, and close. Raw TCP
has a 15-second budget; only a successful TCP probe proceeds to a separately
budgeted 15-second verified TLS probe. No HTTP request is sent. These temporary
diagnostic budgets do not change the product's 15-second golfer budget; the
diagnostic thread may continue after terminal LED feedback. Later probes are
suppressed until reboot. FRB-0002 is not operational for golfer requests while
this diagnostic is installed.

Enhanced build provenance: `/tmp/fairway-connect-diag-build/merged.hex`,
531,360 bytes, SHA-256
`06b7603fd3a9e9f62af41da2e333cc38c7f37319bd4a6a2fcada25ecc61694f6`;
NCS v3.1.1, Nordic toolchain `561dce9adf`, board
`circuitdojo_feather_nrf9151@1/nrf9151/ns`, explicit isolated-worktree
`BOARD_ROOT`, and `EXTRA_CONF_FILE=prj_a.conf`. Build/link and UART configuration
checks passed. On FRB-0002, the enhanced test used `34.143.77.2` with a
36,299 ms DNS cache age. Socket creation and nonblocking configuration
succeeded; connect reported in progress. Poll returned zero events after
15,000 ms; SO_ERROR retrieval succeeded with zero while the connection remained
pending. TCP timed out, TLS was not tested, and no HTTP was sent. This exact
IPv4 also accepted TCP and verified TLS from the Mac. No production fix is
established.

The follow-up diagnostic adds the destination port, read-only `AT+CGACT?`
and `AT+CGPADDR=0` observations, modem data-enabled state, and a native Nordic
socket/poll comparison against the same endpoint. It does not configure APNs
or SIM state. Each TCP path receives 15 seconds, so this diagnostic may run
beyond the normal LED failure indication. Follow-up artifact uses the same
source lineage, board and build configuration: 535,248 bytes, SHA-256
`3b6583158fcb4f300a9a147e346cb5720218b4efc1f040fd068e9e04eec4f483`
at `/tmp/fairway-connect-diag-build/merged.hex`. Build/link checks passed.
The physical comparison used `34.143.73.2:443` with a 30,517 ms cache age.
Modem data was enabled, the default context was active, and an IPv4 address
was assigned. Zephyr TCP completed successfully in 12,199 ms; native modem TCP
completed in 6,760 ms; verified TLS completed in 13,040 ms. Poll indicated
write readiness and SO_ERROR was zero for all successful connections. No HTTP
request was sent. Connectivity and verified TLS are demonstrably possible;
earlier 15-second TCP timeouts remain observed, so success is not a reliability
claim. Setup latency is material against the unchanged 15-second product
budget. A matched real-POST acceptance test and any product timing decision
remain pending at that diagnostic checkpoint.

After explicit restore/test authorization, FRB-0002 was restored to the exact
matched minimal artifact `/tmp/fairway-golfer-demand-window-minimal-build/merged.hex`,
SHA-256 `1dfbd5cbf981418c7ca1e3028ff3da023be7259447a871fa60b3c496c4078946`,
with normal programming and reset. It is no longer on the no-POST diagnostic.
The real request started at device uptime 59.005 s. The first DNS readiness
wait timed out after three seconds; the retry obtained an address and began
TLS connect at 64.597 s. The original 15-second deadline expired at 74.005 s
before connection or any HTTP send. DNS/retry therefore consumed approximately
5.6 seconds, leaving approximately 9.4 seconds for TLS and the HTTP exchange.
Separate diagnostics established possible TLS completion in 13.0 seconds,
not guaranteed completion within the original transaction deadline. No
backend rejection or successful real request was observed. Receiver log
verification was blocked by expired CLI authentication requiring interactive
reauthentication. A longer diagnostic transaction budget requires explicit
CPO approval; the product budget remains unchanged and no production fix is
claimed.

The CPO subsequently authorized a temporary 60-second real-POST diagnostic
build, flash, and one physical test. This is not acceptance of a changed
shipping deadline. The test disables preliminary TCP/native probes and uses
the matched minimal authenticated request/response path, with timing markers.
Artifact `/tmp/fairway-connect-diag-build/merged.hex`, 531,196 bytes, SHA-256
`8f4ff13000f78dc2abddf75f7f6ca59f1eb0b44b9d4d29e288d09dc9f446ec42`,
uses the same NCS/toolchain/board configuration. Build/link and source checks
passed. After CPO-completed CLI reauthentication, the authorized physical test
succeeded. A prior attach was rejected with EMM cause 11, then roaming
registration succeeded. This observation is not a diagnosed cause of the
earlier TCP timeouts.

The real request began at uptime 230.649 s, verified TLS connected in 2,547 ms,
273 request bytes were sent, HTTP 200 was received, and firmware entered
STATE_SUCCESS at 235.871 s (approximately 5.22 seconds after the press), then
STATE_IDLE. Receiver revision `fairway-button-receiver-00023-dff` recorded the
POST at `2026-10-07T00:54:01.927494Z` and persisted request
`t0SxgELtdn4DuM3AUOFz` for FRB-0002, CUST-0001, COURSE-0001. A read-only
Firestore check confirmed status `new`, event `button_press`, and a 90,000 ms
policy snapshot; the live nested Tony Lema Course likewise read 90,000 ms.
The diagnostic did not change Course configuration. Subsequent active-window
COMPLETE polls also returned HTTP 200.

This establishes authenticated device-to-backend acceptance and compatible
response parsing for one real request. It does not establish that the
temporary 60-second budget caused success: this transaction completed within
the original 15 seconds, while earlier transactions exhausted that deadline.
Variable DNS/connection latency and the extra post-rearm button event remain
unresolved. FRB-0002 remains on the explicitly authorized 60-second test image;
shipping-deadline acceptance and a production reliability fix are not claimed.

Follow-up green-output diagnostic image: `/tmp/fairway-connect-diag-build/merged.hex`,
531,686 bytes, SHA-256
`72f1db69af5b7cb425807a29b223ad3a6f1249b89e8ed075a7f8f2c6a3396480`.
Built from the same isolated source/configuration, with only diagnostic logging
added around green `gpio_pin_set()` calls and immediate `gpio_pin_get()` levels;
feedback timing, request budget, and HTTP behavior are unchanged. Build/link,
embedded marker, and source checks passed. One physical request succeeded;
`STATE_SUCCESS` followed by green set/off calls whose `gpio_pin_set()` results
were all zero. All `gpio_pin_get()` results were zero. Nordic's nrfx driver
confirms this API reads the GPIO input register, not its output latch; that
observation alone does not prove whether P0.29's output latch was set. The
device was observed by the CPO to show no green indication.

The next diagnostic build adds `nrf_gpio_pin_out_read()` alongside the input
read and connects P0.29's input buffer while retaining output mode. This lets
`gpio_pin_get()` sample the pad during the same unchanged green feedback
sequence. Artifact `/tmp/fairway-connect-diag-build/merged.hex`, 531,936 bytes,
SHA-256
`81596831e0427cf50ccb1c2c89f12194c74fe907dafc561dcc2dcdcf2223fa7b`.
Build/link and source checks passed. On the physical test at device uptime
24.194 s, HTTP 200 led to STATE_SUCCESS and the green feedback routine. For
each green pulse and the five-second hold, `gpio_pin_set()` returned 0, the
output latch read 1, and the input-connected pad read 1; after each clear,
both read 0. The CPO observed no visible green. Receiver revision
`fairway-button-receiver-00023-dff` accepted the corresponding POST at
`2026-10-07T01:30:36.737364Z`, persisting request `N0hPQcNGIYxNTwpxPLnY` for
FRB-0002; subsequent COMPLETE polling returned 200. This proves the firmware
commanded and electrically read a high P0.29 pad during the expected green
interval. The remaining discrepancy is downstream of the MCU pad or in the
visual observation; this evidence does not identify the specific transistor,
indicator, rail, or interconnect. The image remains temporary and is not a
production firmware generation.

Firmware Generation Registry
----------------------------

**Fairway Refresh Stable Pilot Baseline 1.0** (CPO designation, 2026-10-10)
selects the existing Embarrassingly Small Runtime firmware at `6a19f83`, not
the later undeployed Course-configurable demand-window candidate or temporary
diagnostic images. Firmware/application and board trees at `8686eeb` and
`9775842` are identical to `6a19f83`; the receiver tree at `8686eeb` is the
verified production pairing, as recorded in `docs/DEPLOYMENT_GUIDE.md`.
The FRB-0003 record below supplies its device-specific artifact and operational
validation scope. The product-baseline name does not create a firmware generation
or extend that scope to endurance, power/autonomy, COMPLETE/repeat-window, or
five-device fleet validation.

FRB-0003 / Prototype 3.3 operational validation — 2026-10-09:
device-specific build of the accepted Embarrassingly Small Runtime source
`6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`, using NCS 3.1.1, Nordic toolchain
`561dce9adf`, board `circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`.
The unique FRB-0003 credential was supplied only through its ignored isolated
header; provisioning/SIM and deployment evidence is owned by
`docs/DEVICE_PROVISIONING_GUIDE.md`. Artifact
`/tmp/fairway-frb3-embarrassingly-small-build/merged.hex`, 530,008 bytes,
SHA-256 `acf4d33ab36a59543f7ac2b2c9626d21ca9fb4a13c45da8b6ecc8e2ba53a2b56`,
was programmed normally with probe-rs, inline readback verification, and one
normal reset, without erase-all. UART established boot/idle-ready and modem
initialization; cellular connectivity and normal button/LED operation were
subsequently confirmed by the CPO. Physical LED wiring/polarity corrections
required no firmware changes. After deployment/assignment through the web app,
the CPO confirmed successful end-to-end requests appearing in the cart operator
UI. Prototype 3.3 is a hardware/operational milestone using this existing
firmware generation, not a new firmware generation. This does not establish
endurance, PPK2 consumption, battery/solar autonomy, five-device fleet validation,
or new FRB-0003 COMPLETE/repeat-window validation.

FRB-0001 firmware rebuild — 2026-10-06: device-specific build of the exact
currently working FRB-0002 isolated source/configuration. Source base commit
`9775842aebfc5c5ec1cb15ede7329aa58f1709fe`; source tree copied from
`/tmp/fairway-golfer-demand-window-minimal` and verified byte-identical to that
FRB-0002 source tree except `src/secrets/fairway_device_key.h`. NCS v3.1.1,
Nordic toolchain bundle `561dce9adf`, West 1.4.0, board
`circuitdojo_feather_nrf9151@1/nrf9151/ns`, `prj_a.conf`, and the same
`DEBUG_THREAD_INFO` CMake settings. The unchanged 60,000 ms transaction budget
and current UART/GPIO diagnostics are inherited exactly. The authorized
`replaceDeviceCredential` primitive replaced only FRB-0001's credential
verifier and `updated_at`; the one-time credential was captured only in the
ignored isolated header, and local verification matched the new Firestore
verifier without exposing the plaintext. Artifact
`/tmp/fairway-frb1-build/merged.hex`, 531,934 bytes, SHA-256
`a25b7936b128eff366fc57b16944cbea4654c9cf7e17504d58d7bba6baeba519`.
Build and identity/configuration checks passed. Before flash, probe-rs confirmed
the Memory AP inaccessible; the authorized `recovery --unlock-only` succeeded
on attempt 2/3. The artifact flashed with inline readback verification and one
normal reset. UART confirms the image reached idle-ready, the stored modem CA
was present and matched, and the unchanged 60-second budget was compiled in.
LTE registration currently reports status 4 (unknown), not registered; no
post-flash button press was made. FRB-0001 is ready for physical/LED checks,
but backend acceptance testing should wait until LTE registers.

The current pilot firmware lineage is recorded against exact Git provenance and validated artifact records.

| Firmware generation | Source commit | Checkpoint / artifact | Validation date | Status | Baseline |
|---|---|---|---|---|---|
| First build | `9d512875e46f550fdea3dff595383c3804dd8366` | Historical source identity | 2026-09-11 | Historical predecessor | Stable Fairway state before LP 1.0 promotion. |
| LP 1.0 (Low-Power 1.0) | `245e3ba62dcbbbae4930b94ed86be09fbade377a` | Accepted checkpoint `112916b008eec9352fa21fa78b4d442628901968` | 2026-09-11 | Validated production generation | VBUS-aware BUCK2 service-rail policy with validated field dormant current of approximately 23.5 uA at the accepted 5.0 V boundary and successful button transaction return to the dormant state. |
| LP 1.2 (West SDK Offloaded, NCS 3.1.1 Upgrade) | `3e3e724aa6bcb098d8fda98f45af78d299b9da62` (nPM1300 → nPM13XX Kconfig/API compatibility patch, plus removal of the ineffective stale `CONFIG_PDN_DEFAULT_APN` assignment) | Validated artifact `merged.hex`, SHA-256 `e2acecc0c0c958b448c8d399935e343e8d83cd0da1f27e1e18859d55c4c5c48f`, 500,228 bytes | 2026-09-12 | Validated production generation | Fairway `nfed` built as a freestanding product repository against the separately installed official NCS v3.1.1 SDK and matching Nordic toolchain, with explicit `BOARD_ROOT`; no second Fairway-owned West/NCS reconstruction required. Validated button transaction over LTE-M/HTTPS with backend/webapp acceptance. Field dormant current measured at 23.25 uA versus the approximately 23.5 uA LP 1.0 baseline; no regression demonstrated. A green RGB LED observed while USB was connected during service/debug mode is the nPM1300 PMIC's autonomous hardware charging-status indicator and is not evidence of a field-mode power regression. TF-M secure-image flash utilization observed at 97.90% (31,580 / 32,256 bytes); retained as a watch item, not a demonstrated blocker. |
| Golfer-First (Bounded Request Architecture) | `fde1aade63ac62650709e7ea6aead6f817b71b58` | Validated artifact `merged.hex`, SHA-256 `d5192031ea575e8c42b51f40f58f35b0723e3eebc4f5861ff001e96f41b04699`, 551,220 bytes | 2026-09-20 | Validated production generation (primary path physically validated; remaining scenarios source/desk-verified only) | Replaces the LP 1.2 blocking-registration/90-second-lockout button model with a golfer-first transaction scheduler: local button readiness independent of network/time/Health startup, a hard 15-second absolute golfer transaction deadline, Device Health always subordinate and yielding to an accepted golfer transaction, and isolated bounded DNS/connection-evaluation helpers (see "Golfer Transaction Architecture" above). CPO-confirmed physical validation: normal startup indication, immediate local acknowledgement, golfer SUCCESS within the 15-second budget with the request reaching the operator app, immediate re-press success, and absence of the historical ~90-second lockout. Forced-FAILURE timing, repeated RESET/power-cycle determinism, Health-vs-golfer concurrency, and PPK2 idle-power measurement remain source/desk-verified only and are outstanding physical validation, not blockers to WP4 functional closeout. A CPO-observed whole-device idle-power regression (approximately an order of magnitude versus the LP 1.2 ~23.25 uA baseline) was reported coincident with the 5580/6106 power-architecture integration; this is unresolved and deferred, not diagnosed or corrected by this generation — see `docs/feature_backlog.md`. |
| Prototype 3.2 for Pilot — Working Button and Lights | `ce25e0f0b3f21fcc0af6a79e2c4aa5c2677d2c1f`; Stage B2 follow-on at `b343811d5ff053fcf41764149a2dda59157a7b03` | Validated artifact `merged.hex`, SHA-256 `aeb701fa80c19f368755dc44b20982069b7b76bd8f2601f8a4f53eadcd2c9c26`, 552,886 bytes; pristine NCS v3.1.1 build with Nordic toolchain bundle `561dce9adf`, West 1.4.0, board `circuitdojo_feather_nrf9151@1/nrf9151/ns`, `BOARD_ROOT` set to `nfed`, and `prj_a.conf` | 2026-09-30 | Validated pilot generation | Preserves the golfer-first bounded transport architecture and adds the Monarch Bay Pilot PV8/three-indicator local UX plus the firmware-local five-minute demand window. CPO-confirmed physical validation on FRB-0002 covered orange startup indication and unresolved-transaction pulsing, green SUCCESS feedback with an operator-dashboard request, green-only in-window repeat behavior with no second service-request transaction, red terminal FAILURE feedback naturally encountered with the antenna absent, button re-arm, and expiry returning the next press to the normal orange transaction path. Stage B2 added status-independent post-window request creation and exact correlated COMPLETE; corrected firmware with the dedicated 3,072-byte transaction-thread stack cold-booted successfully, acknowledged the matching command, ended the active window early, and accepted a fresh request before fallback expiry. Repeat-press transport/persistence remains separate deferred work. No PPK2 idle-power measurement was performed for this generation. |
| Prototype 3.2 system-identity reporting | `4c8532f` (`Complete WP5 system metadata contract`) | Validated local artifact `samples/fairway_power_sandbox/artifacts/wp5-system-identity/fairway_system_identity_candidate_merged.hex`, SHA-256 `779caf8f2b3c469594fdb029b0b33770c86a14af0c063d6eb21563ad5b513f77`, 558,834 bytes; pristine NCS v3.1.1 build with Nordic toolchain bundle `561dce9adf`, West 1.4.0, board `circuitdojo_feather_nrf9151@1/nrf9151/ns`, explicit `BOARD_ROOT`, and `prj_a.conf` | 2026-10-01 | Flashed to FRB-0002 and runtime-validated | Embeds hardware revision `Monarch Bay Pilot v3.2` and firmware generation `Prototype 3.2 for Pilot — Working Button and Lights` and transmits both in authenticated Device Health. Build completed with application flash 122,484 B / 448 KB and RAM 40,000 B / 211,608 B; TF-M flash 31,580 / 32,256 B and MCUboot flash 47,784 / 48 KB. Normal pre-flash AP access was unavailable; the documented physical-RESET service-entry response did not restore Memory AP access, so the separately authorized canonical `recovery --unlock-only` erase-all was used and succeeded on attempt 2/3. The exact hash-verified artifact then flashed successfully, one normal reset completed, and the CPO observed the normal orange startup indication. Production accepted authenticated FRB-0002 Health at `2026-10-01T03:57:38.827Z`; backend and Admin promoted the embedded identity pair with `system_identity.source = "device_health"`. |
| Embarrassingly Small Runtime (Health Retirement + Modular Rewrite) | `6a19f83` on `firmware/embarrassingly-small-rewrite`, built on `0daf02d8335685aab92b682a8e7169d1c4c87074` (Health retirement, restored 05bd393 golfer/COMPLETE transport protocol) | Validated artifact `merged.hex`, SHA-256 `14320b03d549296afb8d71497924e56677feeaa76050ea87f87314200cf8b288`; pristine NCS v3.1.1 build with Nordic toolchain bundle `561dce9adf`, West 1.4.0, board `circuitdojo_feather_nrf9151@1/nrf9151/ns`, explicit `BOARD_ROOT`, and `prj_a.conf`. Application flash 111,708 B / 448 KB (24.35%), RAM 32,408 B / 211,608 B (15.32%) | 2026-10-05 | Flashed to FRB-0002 and physically validated | Device Health firmware, backend ingestion, and Admin surfaces retired; golfer transport and COMPLETE protocol restored to their exact physically validated 05bd393 shape (no `transaction_id`, no full-response-framing change). `main.c` subsequently decomposed from one file into single-responsibility modules (see "Runtime architecture" above); no protocol or product-behavior change accompanied the decomposition. CPO-confirmed physical validation on FRB-0002 after a destructive erase-all/recovery and reflash: golfer button press reached the operator dashboard with a valid `request_id`, and a CPO-initiated COMPLETE command was polled, acknowledged, and cleared the active demand window. An initial post-flash observation of repeated spurious transactions without a button press resolved after a physical unplug/replug power cycle; this is attributed to a transient electrical/physical condition at the button input, not a firmware defect — the GPIO configuration sequence is unchanged in logic from the prior generation. Demand-window repeat-press behavior and field-power (PPK2/battery) dormant-current measurement were not re-exercised in this session and remain outstanding for this generation. |

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
- Retry policy uses the configured sequential attempt limit within the golfer's single absolute 15-second transaction deadline; DNS resolution executes only inside an isolated helper thread with a bounded, cached accessor, so a slow or non-returning resolution cannot itself defeat the golfer transaction deadline (see "Golfer Transaction Architecture" above).

Debounce and duplicate behavior
-------------------------------
- Debounce is implemented in firmware today (physical switch level-check in the button ISR, unchanged).
- Duplicate suppression is enforced server-side (see `docs/DEVICE_PROVISIONING_GUIDE.md`); the device-side cooldown question is resolved: the golfer button re-arms after a short fixed settle interval following terminal feedback (`BUTTON_REARM_SETTLE_MS`), not a multi-attempt-derived lockout.

Power and sleep strategy
------------------------
- Current Prototype 3.3 field power continuously asserts nPM1300 VBUS. Tracked `samples/fairway_power_sandbox/src/power_policy.c` reads PMIC VBUS presence at boot and on events; it does not independently detect a USB host. Consequently V75 field operation uses the existing service-awake policy: BUCK2 enabled, Errata-36 awake keeper active, and modem PSM requested off. `modem_service.c` applies `lte_lc_psm_req(false)` after initialization when that VBUS hold is active. The CPO accepts this unchanged behavior for the initial pilot because FRB-0003 operates successfully; it is not a policy optimized for Prototype 3.3. Consumption and autonomy remain unmeasured; deferred work is owned by `docs/feature_backlog.md`.
- Application CPU: while IDLE, the main thread blocks indefinitely waiting for a button event. When VBUS and interaction awake holds are absent, the nRF9151 application Cortex-M33 can reach Zephyr idle/WFI (Wait For Interrupt). With continuous 3.3 VBUS, the keeper prevents that idle path. WFI preserves the application execution context and supports the existing button-wake architecture. Generic Zephyr system PM / `CONFIG_PM` is not enabled as a deeper resume-in-place CPU state; prior target-specific investigation did not establish a deeper resume-in-place state for this target beyond WFI.
- Cellular modem: with VBUS absent, the application requests LTE PSM after modem initialization and before LTE connection, using modem/network-default RPTAU (`-1`) and zero-second RAT (`0`); with VBUS present it requests PSM off. Automatic Kconfig PSM requesting is disabled so runtime is the single authority. Historical Prototype 1.0 PSM validation granted TAU `11,160 s` with active time `0 s`: registration, button/HTTPS activity, and modem sleep exit/re-entry succeeded. The earlier `13,800 s` grant remains historical; neither observation is a Prototype 3.3 power measurement.
- Wake-for-button events triggers the transmit sequence; firmware aims to minimize modem-on time.
- HTTPS handling retains the physically validated Prototype 3.2 single-send/single-receive behavior. HTTP 400, 401, 403, and 404 terminate retries; transport, TLS, timeout, malformed-response, and HTTP 5xx failures remain retryable within the attempt limit. DNS resolution runs only in `dns_resolver_thread`.
- eDRX is intentionally disabled in the current low-power design. Build A explicitly sets `CONFIG_LTE_EDRX_REQ=n`; the generated image leaves `CONFIG_LTE_LC_EDRX_MODULE` unset, and the application calls no eDRX API. PSM remains the intended modem idle mechanism because the current product does not require network-initiated reachability while sleeping. eDRX is not unsupported generally; it is simply not used by the current Fairway Refresh implementation.
- Profile A deferred logging remains event-triggered through the existing logger thread rather than an application polling loop; UART logging remains enabled for startup, request, and troubleshooting events.
- LTE modem PSM remains the VBUS-absent low-power architecture with historical runtime validation. `CONFIG_LTE_LC_MODEM_SLEEP_MODULE` supplies diagnostic visibility, not PSM authority. The application sets `lte_lc_psm_param_set_seconds(-1, 0)` and requests PSM according to VBUS presence; Prototype 3.3 holds the request off.
- Device runtime PM: Phase 1 enables `CONFIG_PM_DEVICE` and `CONFIG_PM_DEVICE_RUNTIME` for UART0/UARTE0 runtime ownership. The existing UART console and log backend acquire UART0 for legitimate output and release it afterward; the installed UART driver suspends the UARTE and applies its sleep pinctrl state, then restores default pinctrl on resume. The Phase 1 whole-device idle result was `917.75 uA` over a representative stable window versus an approximately `1.40 mA` pre-change baseline, a material reduction of approximately `34.4%`. This whole-device A/B measurement does not attribute the entire reduction specifically to UART0.
- Phase 2 adds explicit I2C2/TWIM2 runtime ownership. The Build A overlay suppresses `zephyr,pm-device-runtime-auto` for I2C2, and the installed TWIM transaction path acquires runtime PM before each I2C transfer and releases it afterward. The Phase 2 whole-device idle result was `901.12 uA`, only `16.63 uA` or approximately `1.8%` below Phase 1. This is classified as no material additional idle reduction; the small difference is not attributed necessarily to I2C2 rather than measurement variation.
- GPIO/GPIOTE remains active as the required physical button wake resource. The button ISR contains no UART or PM work, and the wake diagnostic log is emitted from the awakened main-thread path. Kernel timing/clocks and GPIO/GPIOTE are required infrastructure rather than ordinary peripherals to suspend.
- VBUS-absent idle model: `CPU -> WFI`; `modem -> LTE PSM`; `UART0 -> runtime PM`; `I2C2 -> runtime PM`; `GPIO/GPIOTE -> retained button wake resource`. Prototype 3.3 VBUS-present field operation instead keeps the CPU awake and PSM requested off; peripheral runtime-PM ownership is unchanged.
- The Phase 2 generated-build inventory found zero additional genuine application-side runtime-PM peripheral candidates. UART1-3, I2C0/1/3, the ADC/SAADC driver path, the SPI/external-flash application path, PWM, watchdog, USB application stack, and the LIS2DH sensor driver path are inactive or disabled in Build A. The nPM1300 PMIC remains part of the board power tree, and the modem/application interface remains required for LTE/PSM operation; neither is treated as an ordinary suspendable application peripheral.
- The existing policy disables nPM1300 BUCK2 when VBUS is absent and retains it when VBUS is present, including Prototype 3.3 field operation. BUCK2 powers the RP2040 USB/debug service domain; BUCK1 remains the always-on application +3V3 rail and is unchanged. Boot reads and subsequent PMIC VBUS events govern the policy, not field/service intent or independent USB-host detection.
- The historical LP 1.2 measurement boundary was PPK2 Source Measure at 5.0 V, 1 A range, 100 ksps, with AA batteries and Feather USB disconnected. This whole-device result does not characterize Prototype 3.3; its actual idle/transaction consumption requires new PPK2 evidence.
- In validated field mode at the accepted 5.0 V boundary, LP 1.2 production dormant current settled at approximately 23.25 uA, versus the approximately 23.5 uA LP 1.0 baseline; no field-power regression was demonstrated. Button wake, the normal LTE/HTTPS request sequence, LED feedback, and return to dormant current after the transaction were validated with BUCK2 disabled.
- CPO-confirmed physical observation following the approved pilot-build 5580/MAX17048 + Adafruit 6106 power-architecture integration (see `docs/HARDWARE_BOM.md`): whole-device idle/dormant current increased by approximately an order of magnitude relative to the LP 1.2 ~23.25 uA baseline above. This is reported as current physical evidence only; the cause has not been investigated, no replacement dormant-current target is adopted here, and this is deferred, unresolved power-optimization work (see `docs/feature_backlog.md`), not corrected or diagnosed by the golfer-first firmware architecture in this document.
- VBUS presence retains BUCK2 so the onboard USB/debug service domain remains powered, including V75 field operation. USB development/service and V75 field supplies are physically mutually exclusive; the firmware's VBUS policy does not distinguish them.
- I2C2 remains enabled because the board DTS instantiates the nPM1300 PMIC and LIS2DH on that bus. Fairway main.c performs no I2C2 transaction while waiting in STATE_IDLE. The nPM1300 MFD driver can submit work in response to its host-interrupt GPIO, and that work uses the normal I2C APIs. LIS2DH is present in devicetree but its sensor subsystem is not enabled in Build A, so it has no active trigger, polling, timer, or work path.

USB/VBUS Service-Awake Behavior (Validated)
--------------------------------------------
- The reference nRF9151 package marking is CPO-confirmed as LACA A1, which is within the silicon family covered by Nordic Errata 36 ("Debug and Trace: Access port gets locked in WFI and WFE"). During development, probe-rs debug access was observed to become unavailable after the device entered its runtime low-power WFI behavior.
- Fairway firmware implements a dedicated service-awake keeper thread running at `K_LOWEST_APPLICATION_THREAD_PRIO`, the lowest application priority, strictly above the Zephyr idle thread. While USB/VBUS is present, this thread remains continuously runnable, which prevents Zephyr from selecting its idle thread and therefore prevents the application CPU from entering WFI/System-On-idle for as long as VBUS remains present. Every normal higher-priority Fairway, system-workqueue, and LTE/modem thread continues to preempt the keeper normally.
- While USB/VBUS is present, modem PSM is withdrawn (`lte_lc_psm_req(false)`); while USB/VBUS is absent, PSM remains requested exactly as in the existing field policy described above.
- BUCK2 continues to follow its existing VBUS-present-ON / VBUS-absent-OFF policy, unchanged by this behavior.
- This is a VBUS-dependent behavior, not independent USB-host detection. It also applies continuously to Prototype 3.3 V75 field power. When VBUS and interaction holds are absent, the CPU may enter WFI, the modem may use PSM, and BUCK2 is disabled. The Errata-36 rationale and earlier validation remain applicable evidence for the keeper; successful FRB-0003 operation does not establish optimized field consumption or universal debug-lock prevention.
- Direct hardware validation (commit `c720f8069b514d28c97bf80c47b9e4b39399a0eb` on sprint branch `sprint/device-reliability`) confirmed: VBUS detected at boot, the keeper enabled, PSM withdrawn, normal STATE_IDLE reached with no false button/request event, and ordinary probe-rs access remained available after two separate approximately 5-minute USB-connected intervals with no recovery workaround required. This validates the prevention behavior across the tested interval; it does not establish multi-hour/day debug-session reliability, and it does not establish that every historical AP-access loss was caused by Errata 36.

Device Health Diagnostics (Historical Validation, Runtime Retired)
-------------------------------------------------------------------
- The scheduled Device Health snapshot captures registration state, HTTPS result, HTTP status, transaction attempt count, modem internal temperature, LTE connection-evaluation results (RSRP, RSRQ, SNR, serving cell ID, serving band), PSM context, and battery voltage/SOC where available. Device Health acquisition is not part of the golfer transaction: after the authoritative golfer HTTP result is known, completion is handed directly back to the UX owner without post-response temperature or battery reads.
- Battery-health acquisition uses the native NCS 3.1.1 fuel-gauge API (`fuel_gauge_get_props()`) against the installed Adafruit 5580 / MAX17048 on I2C2 at address 0x36, requesting `FUEL_GAUGE_VOLTAGE` and `FUEL_GAUGE_RELATIVE_STATE_OF_CHARGE`. Battery voltage is the primary battery-health measurement; SOC is supplementary.
- Direct hardware validation on the reference device confirmed live acquisition of the then-implemented Device Health fields in a single snapshot, including modem internal temperature, RSRP, RSRQ, SNR, serving cell ID, serving band, registration/HTTP/attempt tracking, and battery voltage/SOC.
- Battery-voltage validation: the MAX17048 reported 4.0125 V; a CPO DMM measurement directly at the LiPo node was approximately 4.0 V; the difference was approximately 12.5 mV (approximately 0.31%), accepted by the CPO as adequate out-of-box battery-voltage calibration for the prototype. This validates voltage acquisition only; SOC accuracy has not been independently calibrated, and long-term SOC model behavior has not been validated.
- These measurements are retained as historical hardware-validation evidence only. Current firmware does not acquire, schedule, or transmit Device Health, and current backend/Admin surfaces do not ingest or display it.

Device Health Runtime (Retired)
--------------------------------
- Device Health acquisition, scheduled wake/reporting, authoritative-time scheduling, effective-config parsing, telemetry helper work, and background Health HTTP are retired.
- Stable-baseline application networking occurs only for an accepted golfer transaction and its correlated COMPLETE poll/ack lifecycle while the fixed five-minute demand window is active.

FUTURE ARCHITECTURAL OPTION
- A substantially deeper application-core power architecture could be investigated using nRF9151 System OFF / power-off behavior. Conceptually, the possible future path is `running -> System OFF -> wake event -> reset/reboot -> initialize -> resume Fairway service`.
- System OFF is not approved for implementation. The architecture retains WFI/resume-in-place capability when awake holds are absent: `running -> WFI -> button interrupt -> resume execution`. Continuous Prototype 3.3 VBUS currently prevents WFI through the existing keeper.
- System OFF must be evaluated experimentally before any design decision. Evaluation must include achievable current reduction, button wake capability, boot/wake latency, modem initialization and network-registration consequences, preservation or reconstruction of application state, request responsiveness, reliability, recovery behavior, and the energy cost of reboot/reinitialization versus idle savings. System OFF must not be assumed to improve overall battery life before measurement.

Planned Enhancements / Feature Backlog
-------------------------------------
This section owns firmware implementation backlog only. Product-level planning is maintained separately in the Roadmap to MVP.

- Watchdog timer and reset-reason logging.
- Battery-under-load characterization and safe-transmit thresholds.
- Explicit LTE reconnect strategy with bounded retry/backoff behavior.
- Measure Prototype 3.3 idle/transaction consumption and battery/solar autonomy
  before deciding whether optimization is necessary. Future policy/SDK work and
  the unresolved historical 5580/6106 idle regression retain their scope and
  priority in `docs/feature_backlog.md`; no replacement current target is adopted.

Engineering rationale
--------------------
- Firmware design should prioritize reliable LTE communication and maximum battery lifetime. Modem activity, retries, peripheral usage, and user feedback should all be evaluated for their power impact, with preference given to predictable field behavior under worst-case operating conditions.
