# Firmware Specification — Fairway Refresh Pilot 1.1

## Purpose and current baseline

This document describes the accepted firmware implementation. Pilot 1.1 is an integrated product milestone, not a firmware generation.

- Original firmware milestone base: `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`; not an exact identity for all installed images.
- Nordic NCS: 3.1.1.
- Board: `circuitdojo_feather_nrf9151@1/nrf9151/ns`.
- Configuration: `prj_a.conf`.
- Image architecture: MCUboot + TF-M + non-secure application.
- Device identity and unique credential are supplied through a local, gitignored per-device provisioning header. Never commit or document plaintext credentials.

The firmware build, flashing, and deployment procedure is owned by `docs/DEPLOYMENT_GUIDE.md`. Device provisioning and commissioning evidence is owned by `docs/DEVICE_PROVISIONING_GUIDE.md`.

The incorporated HTTPS recovery correction is
`b05a1814155fc607dfd7b2a0095a0fc6892c6699` (`1.1_tempfix`), an ancestor of
accepted main. Recorded FRB-0001 through FRB-0005 recovery images used
device-specific builder source
`97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38`, which includes that correction.
Use per-device manifests and dated provisioning/deployment evidence for exact
artifact, build, credential-input verification, and signing identities; do not
infer an installed image from a branch name or original milestone alone.

## Runtime behavior

- The local button and indicator hardware initializes before modem/network work; local button readiness does not wait for LTE registration.
- An accepted press begins immediate orange sending feedback and one bounded golfer transaction. The transaction has a 15-second absolute budget from acceptance; sequential internal attempts share that deadline and do not extend it.
- The authenticated request identifies the device and sends `event_type = button_press`. The per-device credential is sent in `X-Fairway-Device-Key` over HTTPS.
- The CPO-confirmed physical labels are orange “Sending…”, green “Success!”, and red “On break”. Successful acceptance gives green blink-blink followed by approximately five seconds solid; terminal failure gives the corresponding red pattern; orange pulses while the transaction is unresolved. Red is shared by failure behavior and therefore does not uniquely diagnose service suspension. These labels do not change firmware behavior or timing; exact user-facing behavior is owned by `docs/UX_SPECIFICATION.md`.
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
| `power_policy.c` | VBUS/BUCK2 and Errata-36 awake-keeper policy |

The board device tree and current source define the pins consumed by the implementation. Physical pin mappings are owned by `docs/HARDWARE_ASSEMBLY_GUIDE.md`.

## Explicit non-features and limits

### Field-power policy and measurement boundary

Current field power enters VBUS, so the retained legacy VBUS service-awake
policy in `power_policy.c` also applies during field operation: it keeps the
CPU runnable and disables requested modem PSM while VBUS is present. It is
not a demonstrated low-power field idle policy. Historical VBAT dormant
results do not establish V25/V50/V75 idle consumption. Idle-power correction,
field-current measurement, and autonomy/solar energy balance remain open;
solar sufficiency is an operating assumption, not measured validation.

### Other runtime limits

- The current application does not include Health or battery-health reporting.
- The golfer demand window is fixed at five minutes.
- Repeat-press transport and persistence are not implemented.
- No MQTT, LwM2M, firmware-over-the-air, persistent socket, or background Health network path is part of the accepted runtime.
- LTE registration or one successful transaction is not evidence of pack autonomy, endurance, PPK2 consumption, or a statistical request-reliability guarantee.

## Pilot 1.1 validation status

The CPO confirms FRB-0001 through FRB-0005 passed firmware provisioning and physical end-to-end testing. FRB-0006's authorized firmware replacement and credential activation completed on 2026-10-17. Subsequent field testing demonstrated a successful button request and COMPLETE rearm, but intermittent LTE/HTTPS failures remain unresolved; sustained reliability acceptance is pending. Device-specific build, flash, and runtime evidence remains in the deployment audit record. No per-device secrets or course/marker assignments are recorded here.

## Device-specific provisioning implementation — Increments 2, 3B, and 3C

**Historical pre-recovery validation.** Statements below about excluding
temporary HTTPS changes and blocking a real FRB-0003 image describe this
stage only. The subsequent integrated correction and completed per-device
recoveries are recorded above and in the provisioning/deployment owners.
Those recoveries used separately authorized full replacements with the NCS
debug signing key. They do not resolve production signing/trust-anchor
security or authorize reuse of one-time exceptions for future releases.

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
configuration was not established by this investigation. At that stage, a real
FRB-0003 artifact was blocked pending an approved production signing key,
matching bootloader trust anchor, and signature verification. The subsequent
one-time recovery exception is recorded separately; it did not close the
future-release signing concern. No real-device credential or physical device
was used in this synthetic investigation.

## Incorporated HTTPS recovery baseline: `1.1_tempfix`

This originally local recovery baseline, now incorporated into accepted source
and the recorded recovery builds above, applies the reviewed changes in
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
