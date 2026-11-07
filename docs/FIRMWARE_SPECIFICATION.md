# Firmware Specification — Fairway Refresh Pilot 1.1

## Purpose and current baseline

This document describes the accepted firmware implementation. Pilot 1.1 is an integrated product milestone, not a firmware generation.

- Accepted source commit: `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`.
- Nordic NCS: 3.1.1.
- Board: `circuitdojo_feather_nrf9151@1/nrf9151/ns`.
- Configuration: `prj_a.conf`.
- Image architecture: MCUboot + TF-M + non-secure application.
- Device identity and unique credential are supplied through a local, gitignored per-device provisioning header. Never commit or document plaintext credentials.

The firmware build, flashing, and deployment procedure is owned by `docs/DEPLOYMENT_GUIDE.md`. Device provisioning and commissioning evidence is owned by `docs/DEVICE_PROVISIONING_GUIDE.md`.

## Runtime behavior

- The local button and indicator hardware initializes before modem/network work; local button readiness does not wait for LTE registration.
- An accepted press begins immediate orange sending feedback and one bounded golfer transaction. The transaction has a 15-second absolute budget from acceptance; sequential internal attempts share that deadline and do not extend it.
- The authenticated request identifies the device and sends `event_type = button_press`. The per-device credential is sent in `X-Fairway-Device-Key` over HTTPS.
- Successful acceptance gives green blink-blink followed by approximately five seconds solid. Terminal failure gives the corresponding red pattern. Orange pulses while the transaction is unresolved. Exact user-facing behavior is owned by `docs/UX_SPECIFICATION.md`.
- The accepted request starts a fixed five-minute local demand window. Ordinary repeat presses during that window produce local green feedback and do not create a second service request. Transporting/persisting repeat-press counts is deferred.
- The backend may return the existing request identity when duplicate demand is suppressed. A fresh accepted request is possible after the demand window expires.
- Operator COMPLETE is correlated to the exact originating `request_id`. The firmware polls and acknowledges through the shared transaction worker; a matching acknowledged COMPLETE can end the active window early. Golfer transactions take priority and COMPLETE work yields at bounded transport checkpoints.
- Modem startup is asynchronous. The modem service owns LTE setup, certificate provisioning, PSM policy, and registration-triggered DNS prewarm. No scheduled/background application networking runs outside an active golfer lifecycle.

## Runtime ownership in source

The application is intentionally modular. In `samples/fairway_power_sandbox/src/`:

| Module | Responsibility |
|---|---|
| `main.c` | Application orchestration and module wiring |
| `button_ux.c` | Button GPIO/ISR and golfer-facing indicators |
| `golfer_txn.c` | Transaction handoff, deadline, and completion state |
| `golfer_protocol.c` | Authenticated golfer request and bounded retry loop |
| `command_protocol.c` | COMPLETE poll/ack request and response protocol |
| `http_transport.c` | DNS handling and bounded HTTPS transport |
| `transaction_scheduler.c` | Sole transaction worker shared by golfer and COMPLETE traffic |
| `modem_service.c` | Modem/certificate/LTE initialization and registration handling |
| `power_policy.c` | BUCK2 service-rail and bounded interaction-awake policy |
| `ota_update.c` | MCUboot image staging, update status, test activation, and trial confirmation |
| `ota_update_policy.c` | Transport-independent OTA descriptor validation and state transitions |
| `ota_update_staging.c` | Clean DFU-target initialization and offset-zero verification |

The board device tree and current source define the pins consumed by the implementation. Physical pin mappings are owned by `docs/HARDWARE_ASSEMBLY_GUIDE.md`.

## Explicit non-features and limits

- The current application does not include Health or battery-health reporting.
- The golfer demand window is fixed at five minutes.
- Repeat-press transport and persistence are not implemented.
- No MQTT, LwM2M, cellular OTA downloader or release-assignment service, persistent socket, or background Health network path is part of the accepted runtime. The device-side OTA foundation below is not an end-to-end update service.
- LTE registration or one successful transaction is not evidence of pack autonomy, endurance, PPK2 consumption, or a statistical request-reliability guarantee.

## Low-power Increment 1.0 — FRB-0005 development candidate

Increment 0.5 removed VBUS presence as a reason to keep the application CPU
continuously runnable. Increment 1.0 preserves that behavior: the awake keeper
is active only during a bounded golfer interaction; otherwise Zephyr may enter
its normal idle/WFI path whether VBUS is present or absent.

Increment 1.0 requests LTE PSM from `modem_service` independently of VBUS,
using the existing PSM parameters. `power_policy` retains VBUS detection only
for the then-existing nPM1300 BUCK2 service-rail policy and does not control
modem PSM. The later BUCK2 correction below supersedes that service-rail
behavior. The modem event handler records network-reported PSM timers when the
LTE link-control library provides a PSM update. This reports network
configuration; it does not by itself prove the modem entered PSM.

The candidate preserves modem lifecycle, button transaction, HTTPS transport,
credentials, bounded interaction-awake behavior, and LED feedback. The Circuit
Dojo board's existing two-second application startup initialization remains
unchanged.
Programming and recovery procedures, including the distinction between that
startup delay and vendor recovery timing, are owned by
`docs/DEPLOYMENT_GUIDE.md`.

Increment 1.0 is a device-specific development candidate, not an accepted
fleet firmware generation. FRB-0005 completed a CPO-reported field-powered
button-to-Cart UI transaction with orange then green feedback. A USB-powered
startup capture recorded LTE registration and a network PSM update of
`TAU=3600 s`, `active_time=0 s`; field-mode PSM grant was not directly logged.
After the five-minute demand window, a 60-second PPK2 trace showed no
approximately 1.264-second high-current pulse, but its 25.168 mA mean was
higher than the 14.024 mA mean from the shorter Increment 0.5 trace. The CPO
confirmed both captures used exactly the same supply, wiring, PPK2 measurement
boundary, and operating setup; the Increment 0.5 capture was deliberately
stopped early. The 11.144 mA observed increase is real same-setup evidence,
but the 16.367-second and 60-second captures have unequal durations and are
not equal-duration comparisons. This difference alone does not identify PSM
as its cause. See `docs/DEPLOYMENT_GUIDE.md` for exact capture and artifact
evidence.

PSM request success is not proof of network grant or actual modem sleep.
The observed network PSM update confirms reported timers in the USB capture,
not actual PSM entry during the field measurement. The pulse's absence cannot
be causally attributed to PSM without further evidence. Increment 1.0 remains
unaccepted pending CPO acceptance; complete device-specific evidence is in
`docs/DEPLOYMENT_GUIDE.md`.

In a subsequent FRB-0005 isolation diagnostic, a temporary image explicitly
requested LTE functional-mode power-off after registration. The CPO reports
that field-powered PPK2 current remained at 23–25 mA through that event, with
no discernible reduction. This weighs against active LTE/radio operation as
the dominant source of the sustained draw, but does not identify the
remaining load or prove PSM behavior. The supplied one-minute CSV excerpt
does not contain the modem-off event. At that time, VBUS enabled the
established BUCK2 service rail, so its contribution, including the board
debugger load, had not been isolated. The subsequent BUCK2 correction is
described below. See `docs/DEPLOYMENT_GUIDE.md` for the diagnostic image
identity and exact capture limits.

## FRB-0005 BUCK2 low-power correction — Increment 2.0

The current `power_policy` implementation disables BUCK2 during normal
operation regardless of VBUS; CPU idle/WFI remains available outside bounded
golfer interactions, and `modem_service` continues to own LTE PSM independently.
BUCK2 is enabled only in explicit debugger service mode, selected by holding
the PV8 button through boot. In service mode, the application leaves the
debugger rail on and does not start LTE or golfer-request runtime. The service
mode exists to preserve an intentional development/programming path; it is
not part of normal golfer operation. Exact build, programming, and field
validation evidence is owned by `docs/DEPLOYMENT_GUIDE.md`.

The CPO accepted this FRB-0005-specific Increment 2.0 outcome on 2026-11-06.
This device-specific acceptance does not change the accepted fleet firmware
baseline stated above. In the physical service-mode check, holding PV8 through
USB-powered boot produced no LED activity, as expected for the runtime-gated
service mode. `probe-rs list` and macOS USB enumeration both detected the
Circuit Dojo CMSIS-DAP probe, VID:PID `2e8a:000c`, serial
`E66550A147969135`. After USB was disconnected and field power restored, the
CPO confirmed normal golfer-button operation and successful request delivery
to the Cart Operator UI. This validates service-mode entry and return to normal
operation for the observed cycle; probe enumeration did not verify target
identification or programming in service mode.

The first five-minute FRB-0005 field-power PPK2 capture after this change had
a 4.131 mA median and 9.215 mA mean, with recurring multi-second current
bursts. During the subsequent interval, the CPO reports a stable displayed
average of 3.46 mA and maximum of 3.73 mA over approximately 86.8 seconds;
the CPO reports the same readings held for the rest of the five-minute
interval. A full raw export is unavailable. The displayed average is 86.3%
below Increment 1.0's 25.168 mA under the previously confirmed measurement
configuration. These results indicate substantially lower normal-operation
current, but the first capture's bursts and missing second export limit
full-window comparison. The 3.46 mA settled-current observation is distinct
from the first capture's burst-containing five-minute mean; it is not a
recomputed full-window average. The CPO accepted the reported settled-current
result. Neither current result proves CPU or modem sleep residency. See the
deployment record for capture checksum, distribution, build identity, and
validation limits.

Circuit Dojo's [nRF9151 Feather low-power report](https://www.circuitdojo.com/posts/chasing-microamps-nrf9151-feather-active-sleep)
describes a regulator reference-counting failure associated with a low-VBAT
power-failure event on Feather hardware, where `regulator_disable()` could
return success without turning BUCK2 off. This remains a future robustness
risk for the current regulator-API policy, not an observed FRB-0005 defect:
the reported event has not been demonstrated on FRB-0005 in its field-power
configuration, and the CPO-confirmed service-mode/normal-operation cycle
completed successfully. CPU sleep residency, modem PSM residency, and
service-mode target programming were not independently verified for this
increment. Further implementation or investigation is not implied by this
acceptance record.

## OTA Increment 1 — FRB-0005 local development foundation

This source-only increment starts from the accepted FRB-0005 Increment 2.0
checkpoint `29b8d8556e9ac7ab228967d74d79d1b994285cb6`. It does not change the
accepted Pilot 1.1 fleet firmware baseline, and it has not been flashed or
physically tested on FRB-0005.

`ota_update` owns a transport-independent MCUboot update lifecycle. A caller
supplies a descriptor containing a hardware identifier, image size, version,
and SHA-256. The module checks the descriptor against the configured board ID
and generated secondary-slot capacity, stages sequential image data through
NCS DFU Target's MCUboot backend, checks the MCUboot header magic, hashes the
received bytes, and matches the descriptor version to the staged image header.
It can schedule a test update, report in-memory status, cancel a transfer, and
confirm a trial image only after the normal-mode application and mandatory
local modem bootstrap are ready. The modem service reports success after modem
library initialization, PSM configuration, CA-chain validation/provisioning,
and successful start of the asynchronous LTE connection. LTE registration,
DNS, and backend availability are not confirmation requirements; the main
application remains responsive to golfer button events while modem bootstrap
runs.

The application reads PV8 and selects service mode before starting the normal
trial-health deadline. A normal-mode trial has a bounded 300-second deadline
by default. A mandatory startup failure prevents confirmation; if health has
not passed before the one-shot deadline expires, the application requests a
reset while the image remains unconfirmed. The value accommodates the NCS
3.1.1 modem library's documented possibility that initialization can take a
few minutes when modem firmware update work is already scheduled. It does not
wait for network registration. The deadline is not extended by retries or
golfer activity. Service mode never confirms a trial and does not arm the
health deadline; after BUCK2 debugger-rail initialization succeeds, the application
remains in service mode without modem or golfer runtime. If service-rail
initialization fails during a trial, the application requests a reset so
MCUboot can return to the previously confirmed image.

MCUboot's configured test-image behavior owns rollback after reset. The
application deadline and service-mode handling are source/build validated;
physical trial rollback, active debugger-session continuity, and wired
recovery have not been demonstrated on FRB-0005.
SHA-256 uses the PSA Crypto API; PSA initialization occurs when an OTA transfer
begins, not during ordinary application startup.

MCUboot's configured signature trust is enforced during boot; descriptor
SHA-256 is an integrity check, not authorization or authentication. The
hardware identifier is supplied by the caller and is not independently
authenticated from signed image metadata. The update module does not own or
start LTE, networking, persistent release assignment, download, or external
authorization. A trusted transport and release-policy integration, signed
hardware compatibility metadata, and an anti-rollback policy remain future
work before fleet OTA. Existing button-request, COMPLETE, modem, and power
ownership remain unchanged.

Each OTA transfer starts from a clean NCS DFU Target staging state. The OTA
module initializes the MCUboot target, resets it to discard retained progress,
initializes it again, and verifies the target offset is zero before accepting
bytes or entering `DOWNLOADING`. Failure to initialize, reset, or verify zero
offset fails the attempt closed. A failed active transfer calls
`dfu_target_done(false)` and then resets the target; a later attempt repeats the
clean-start sequence. Application byte counters and SHA-256 tracking are
initialized only after the clean staging check succeeds. Only a complete
transfer whose descriptor digest and MCUboot header/version checks pass can
enter `STAGED`; incomplete or invalid data cannot be scheduled for activation.
Downloads are not resumable, and a new attempt starts at byte zero. This
production-manager lifecycle is covered by the focused host suite at
`tests/ota_update/host/run_tests.py`, which compiles `ota_update.c` and the
production policy/staging modules with deterministic fakes at the Zephyr,
PSA, DFU Target, and MCUboot boundaries. It exercises successful multi-chunk
staging and activation scheduling; incomplete, invalid, and failed transfers;
clean retry; fail-closed staging errors; readiness-gated confirmation; trial
deadline reset; and service-mode deadline/confirmation exclusion. The PSA
hash fake validates manager data flow and integrity-gate behavior, not the
PSA implementation or cryptographic SHA-256. The Zephyr `ztest` policy and
staging suite remains separate; `native_sim` requires a supported Linux
environment and was not run on macOS.

The application currently has no production caller for the OTA begin/write/
finish/activation API, and it has no OTA downloader or release-assignment
service. These tests establish OTA-manager behavior, not operational remote
update capability. The application/modem startup integration is source
reviewed; it is not simulated by the host manager suite. Physical flash
recovery and full OTA integration qualification remain outstanding.

The generated NCS 3.1.1 Partition Manager report matches the board's
`circuitdojo_feather_nrf9151_pm_static.yml`: MCUboot occupies `0x00000–0x0C000`,
the primary slot is `0x10000` with size `0x78000`, and the secondary slot is
`0x88000` with size `0x78000` (491,520 bytes each). TF-M and the non-secure
application share the primary slot. The generated signed image is a combined
TF-M/application MCUboot image. The board DTS still contains the older split
`slot0`/`slot1` fixed-partition addresses; the current DFU Target and MCUboot
flash-map paths use Partition Manager (`PM_MCUBOOT_SECONDARY_ID` /
`USE_PARTITION_MANAGER`), so the generated PM map is the effective OTA slot
map for this build. The DTS/PM source descriptions remain inconsistent and
must not be treated as interchangeable by future code using fixed-partition
DTS labels.

The build uses NCS's distributed ECDSA-P256 `root-ec-p256.pem` development
signing key and swap-using-move mode. The local signed image passed
`imgtool verify`; a payload-mutated copy was rejected. This key is widely
distributed and is not suitable for production. The generated build map and
signature do not establish that FRB-0005's installed bootloader has the same
partition layout or trust anchor; both installed-device compatibility points
must be established before physical OTA activation. No bootloader upgrade,
image activation, rollback, power-loss recovery, installed-device key match,
or physical behavior has been demonstrated. See
`docs/DEPLOYMENT_GUIDE.md` for exact artifact provenance, local validation,
and deployment gates.

## Pilot 1.1 validation status

The CPO confirms FRB-0001 through FRB-0006 are fully commissioned and in operation. Device-specific build, flash, and runtime evidence remains in the deployment audit record. No per-device secrets or course/marker assignments are recorded here.

## Device-specific provisioning implementation — Increments 2, 3B, and 3C

The validated provisioning implementation starts at accepted Pilot 1.1 source
`6a19f83c5bd5d1d390efd937daa1c38c0e837eb0` and applies only the validated
device-specific provisioning integration. It preserves the existing request,
authentication, and runtime behavior. Temporary HTTPS trust-resilience
changes and other unrelated dirty-checkout changes are excluded. The exact
source delta, normalized archive identity, tool inputs, commands, and
NON-PRODUCTION artifact checksums are in the private Increment 3B release
manifest. This provisioning implementation is included in the credential-
recovery engineering baseline; the synthetic firmware images are validation
artifacts only and are not accepted for production or flashing.

Provisioning/artifact tests passed **30/30**. The synthetic test image used
identity `FRB-9801`; no production credential or physical device was used. The
build used NCS 3.1.1, Nordic toolchain bundle `561dce9adf`, West 1.4.0, board
`circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`.

Increment 3C added a third pristine synthetic build to investigate the two
earlier images. All three have identical signed payload bytes, matching
SHA-256 and public-key-hash TLVs, and valid MCUboot ECDSA-P256 signatures.
The 70-byte/five-region difference between builds 01 and 02 is confined to
the MCUboot signature TLV: the encoded signature lengths are 70, 71, and 70
bytes for builds 01, 02, and 03, respectively. The TLV begins at `0x00033580`,
immediately after the unsigned application ELF's final section; the differing
bytes are signature metadata, not executable code, TF-M content, identity, or
credential selection. This is expected ECDSA signing nondeterminism with
variable DER length, not a source or compiler defect. No source correction was
needed. Byte-for-byte equality is not a release criterion when the exact
artifact, signed payload, integrity metadata, signature, and signing-key
provenance are independently verified.

The diagnostic image is synthetic FRB-9801, 530,004 bytes, SHA-256
`44f114e6bfe567d1e5edfb8fc6fce5592a7d182167bdb6b342398f6297e66017`.
All three synthetic artifacts pass independent device-input verification and
cryptographic signature verification. However, the build used MCUboot's
NCS-distributed `root-ec-p256.pem` debug key. MCUboot documents this
widely-distributed key as insecure and not for production. These signatures
prove internal image consistency only; they do not qualify the images for
production or flashing. No production signing key or bootloader trust-anchor
selection has been approved or verified, and the deployed Pilot 1.1 signing
configuration was not established by this investigation. A real FRB-0003
artifact remains blocked until an approved production signing key is
configured and its corresponding bootloader trust anchor and artifact
signature are verified. No real-device credential or physical device was used.

## Temporary HTTPS recovery baseline: `1.1_tempfix`

This local firmware release baseline applies the reviewed changes in
`http_transport.c`, `modem_service.c`, and
`certs/google-run-ca-chain-cstr.pem` to accepted Pilot 1.1 commit
`6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`. It is not a new product
architecture or a fleet-wide deployment approval.

- The recovery uses blocking modem-offloaded TLS `connect()` with
  `SO_SNDTIMEO` bounded by the existing absolute transaction deadline,
  deadline-bounded send/receive operations, partial-write completion, and
  complete response accumulation. Peer-certificate and hostname verification
  remain required; the existing hostname/SNI and security-tag model,
  authenticated request format, transaction worker, and five-minute demand
  window are unchanged.
- The configured trust anchor is the GlobalSign Root CA (SHA-256
  `EB:D4:10:40:E4:BB:3E:C7:42:C9:E3:81:D3:1E:F2:A4:1A:48:B6:68:5C:96:E7:CE:F3:C1:DF:6C:D4:33:1C:99`).
  It validated the observed Google receiver chain during the authorized
  recovery tests. This supports the trust-path correction for the tested
  chain; it does not establish the exact event that triggered the October 15
  delivery outage.
- Existing provisioning handles absent credentials, matching credentials,
  positive mismatch, and the known `-E2BIG` compare-limit case separately.
  Other comparison, delete, and write errors are surfaced; no unverified TLS
  fallback is used. The trust anchor expires in January 2028, so chain
  changes and trust-material rotation require review before then.
- The FRB-0004 NCS 3.1.1 build used the
  `circuitdojo_feather_nrf9151@1/nrf9151/ns` board, `prj_a.conf`, and the
  existing local FRB-0004 provisioning header. The verified image SHA-256 is
  `4a45dcc6500c9a0fb64d62394268c185bb7bde42cab3077947297f97ac161fe0`.
  The image and all per-device credentials are local build inputs, not shared
  release files. Every other device requires its own existing identity and
  unique credential in a fresh device-specific build; never reuse the FRB-0004
  image.
- Device/build evidence records an authenticated FRB-0004 HTTPS POST, HTTP 200,
  and Firestore persistence. The CPO separately confirms Cart Operator
  visibility/actionability and successful repeated-button-request validation.
- A later automatic COMPLETE poll timed out during TLS connect with
  `-116` (`ETIMEDOUT`). The COMPLETE poll uses the shared transaction worker,
  yields at bounded transport checkpoints, and does not create a button
  request. Golfer work is selected first and retains its existing 15-second
  transaction budget. The timeout remains an intermittent reliability risk;
  it is not proof of a button-request failure. Continue to monitor it during
  any separately authorized staged rollout.

## Deferred firmware-related work

See `docs/feature_backlog.md` for repeat-press transport/persistence, COMPLETE polling cadence review, power characterization, and any future firmware reliability or SDK evaluation. These items do not change the accepted baseline without explicit authorization.
