# Firmware Specification — Fairway Refresh Pilot 1.1

## Purpose and current baseline

This document describes the accepted firmware implementation. Pilot 1.1 is an integrated product milestone, not a firmware generation.

- Accepted source commit: `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`.
- Nordic NCS: 3.1.1.
- Board: `circuitdojo_feather_nrf9151@1/nrf9151/ns`.
- Configuration: `prj_a.conf`.
- Image architecture: MCUboot + TF-M + non-secure application.
- Current OTA images are common signed images and contain no device identity or credential. Device identity and credential are provisioned separately into TF-M PSA Protected Storage; never commit or document plaintext credentials.

The firmware build, flashing, and deployment procedure is owned by `docs/DEPLOYMENT_GUIDE.md`. Device provisioning and commissioning evidence is owned by `docs/DEVICE_PROVISIONING_GUIDE.md`.

## Runtime behavior

- The local button and indicator hardware initializes before modem/network work; local button readiness does not wait for LTE registration.
- An accepted press begins immediate orange sending feedback and one bounded golfer transaction. The transaction has a 15-second absolute budget from acceptance; sequential internal attempts share that deadline and do not extend it.
- The authenticated request identifies the device and sends `event_type = button_press`. The per-device credential is sent in `X-Fairway-Device-Key` over HTTPS.
- Successful acceptance gives green blink-blink followed by approximately five seconds solid. Terminal failure gives the corresponding red pattern. Orange pulses while the transaction is unresolved. Exact user-facing behavior is owned by `docs/UX_SPECIFICATION.md`.
- The accepted request starts a fixed five-minute local demand window. Ordinary repeat presses during that window produce local green feedback and do not create a second service request. Transporting/persisting repeat-press counts is deferred.
- The backend may return the existing request identity when duplicate demand is suppressed. A fresh accepted request is possible after the demand window expires.
- Operator COMPLETE is correlated to the exact originating `request_id`. The firmware polls and acknowledges through the shared transaction worker; a matching acknowledged COMPLETE can end the active window early. Golfer transactions take priority and COMPLETE work yields at bounded transport checkpoints.
- Modem startup is asynchronous. The modem service owns LTE setup, certificate provisioning, PSM policy, and registration-triggered DNS prewarm. No persistent or always-on application networking runs; OTA uses bounded, event/schedule-driven requests outside the golfer/COMPLETE transaction worker.

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
| `device_identity.c` | PSA-backed Device ID and credential load, one-time provisioning, and protected replacement interface |
| `ota_update.c` | MCUboot image staging, update status, test activation, and trial confirmation |
| `ota_update_policy.c` | Transport-independent OTA descriptor validation and state transitions |
| `ota_update_staging.c` | Clean DFU-target initialization and offset-zero verification |
| `ota_update_scheduler.c` | PSA-persisted one-time/nightly schedule and deployment intent |
| `ota_update_discovery.c` | Authenticated assignment discovery and release descriptor validation |
| `ota_update_download.c` | Bounded HTTPS image download through the NCS downloader |
| `ota_update_reporting.c` | Authenticated update lifecycle and firmware-version reporting |
| `ota_delivery.c` | Scheduling, download/stage/activation orchestration, reboot, and boot outcome reporting |

The board device tree and current source define the pins consumed by the implementation. Physical pin mappings are owned by `docs/HARDWARE_ASSEMBLY_GUIDE.md`.

## Running-image confirmation revision — local, not yet published (2026-11-10)

The revised USB-only bootstrap is `OTA-0.1-r3` (`0.1.0+4`); its matching
nightly successor is `OTA-0.1alt-r3` (`0.1.0+5`). The CPO subsequently requested
the same revision for `OTA-1.0-r3` (`1.0.0+3`, nightly). These are new immutable
identities, not replacements of the bytes behind any earlier release ID.
All three operational images include the same change-driven running-image report.
The bootstrap retains exactly one persisted check at first normal boot +900
seconds; confirmation retries do not restart or repeat that check.

After the existing mandatory local boot-health evaluation and successful
MCUboot confirmation, a bounded reporting worker reads the primary-slot image
header and checks it against the compiled image version. It reports through
the existing authenticated OTA transport/status infrastructure, independently
of an OTA assignment, trusted UTC acquisition, or the discovery schedule.
No running-image confirmation is released from service mode or a failed
mandatory health path, including an already MCUboot-confirmed image.
Deployment `confirmed` lifecycle reporting also waits for this boot's
running-image acknowledgment, so it cannot bypass actual-version validation.

The scheduler module owns a separate PSA object (`0x46520004`) containing the
last observed healthy version, a monotonic change sequence and acknowledgment
bit. Its existing v2 schedule object, identity/credential objects, partitions,
trust anchor and rollback behavior are unchanged. A new healthy version,
including a return to a previous version, advances the sequence. Pending
reports retry after 300-second backoffs until the backend acknowledges the
exact Device/version/sequence; interrupted acknowledgment writes and reboots
retry the same evidence. An acknowledged unchanged image sends nothing more.
Storage corruption, counter exhaustion and write errors are explicit failures,
not resets or default evidence. This is not recurring telemetry or discovery
polling, and does not change power policy.
The existing LTE registration semaphore signal is passed on by a successful
waiter so both discovery and confirmation boot workers can proceed from one
registration event; this does not add registration polling or change power
policy. A real-function pthread boundary regression covers both simultaneous
waiters and reconnect.

The backend transaction stores last confirmed actual version and server
acceptance time in `ota_device_status`. Duplicate acknowledgment does not
refresh that time; lower sequences and same-sequence/different-version
reports are rejected. Older deployment lifecycle events cannot overwrite a
sequence-protected running-image confirmation. The existing Admin registry
firmware field displays that version/time, or explicitly unknown; historical
registry generation metadata and desired assignments are not actual-running
evidence. Device-authenticated reporting is not independent boot attestation.

For an OTA-installed image, the report also carries the existing persisted
deployment ID, but only when activation is pending and its target version
matches the healthy primary image. This is not a new assignment lookup or a
second inventory. The backend atomically records the confirmed deployment/event,
retains its last-result reference and deletes only the current assignment
matching that exact deployment and version. Missing intermediate lifecycle
events remain missing; they are not fabricated. Unbound USB reports and
different-version/deployment reports cannot clear an assignment, and duplicate
or stale evidence cannot clear a newer assignment. The existing authenticated
deployment-confirmed path also clears only its matching assignment when not
contradicted by newer running evidence. Confirmation retries survive reboot
with the same persisted binding until acknowledgment.

Publication and physical acceptance remain separate gates, owned by the
Deployment Guide. Original artifacts, physical-device state, golfer behavior
and field-power policy are unchanged. Deployment itself does not mutate an
assignment; subsequent matching device-confirmed success completes it as
described above.

## OTA delivery implementation — local, not physically qualified

The current branch implements the production OTA path for the Circuit Dojo
nRF9151 Feather using the existing MCUboot manager. This local work does not
change the accepted Pilot 1.1 fleet image, establish what is installed on
other devices, or prove physical update/rollback behavior. FRB-0005's separate
accepted OTA 0.1 USB installation is recorded in the Deployment Guide.

The accepted immutable commissioning artifacts are:

| Release | MCUboot/application version | Schedule |
|---|---|---|
| OTA 0.1 (USB only) | `0.1.0+1` | One check 900 seconds after first normal boot; deadline is stored in PSA and survives reboot; no retry or later scheduled check |
| OTA 0.1alt | `0.1.0+2` | Configured nightly at local 00:30; accepted worker has recurrence defects described below |
| OTA 1.0 | `1.0.0+1` | Configured nightly at local 00:30; accepted worker has the same recurrence defects |

A physical USB/debug installation is required to initialize OTA capability.
OTA 0.1 is already installed on FRB-0005 and must never be treated as an
OTA-distributed release. OTA 0.1alt proves the first autonomous transition;
OTA 1.0 proves a subsequent transition. This is the current validation sequence,
not a mandatory three-release chain for every future device.

The one-time deadline is derived from the captured first-boot uptime and the
first trusted UTC time, then persisted; a later reboot does not restart the
15-minute interval. The one-time check is marked complete before discovery,
including when no release is assigned. Nightly schedule timestamps are
computed by the backend from the deployed Device's authoritative Course IANA
timezone, or configured headquarters timezone for Inventory/Maintenance,
and persisted by the application. The fixed routine policy is 00:30 local;
the browser cannot customize it. The CPO has approved `America/Los_Angeles`
as headquarters time; the backend applies DST, without a firmware contract
change or change to the installed one-time bootstrap.

**Source-confirmed accepted-image discrepancy:** all three packages use the
same original delivery worker source. OTA 0.1 uses ONE_TIME mode, so its
commissioning behavior is not affected by the nightly defects. Both nightly
packages stop when migrated `one_time_complete` is true in schedule preparation
and worker entry, and exit after no-update/network or image-processing paths.
Thus OTA 0.1 → OTA 0.1alt discovery/installation is not disabled by these
recurrence defects, but OTA 0.1alt → OTA 1.0 and further nightly operation are
at risk. No physical recurrence failure has been demonstrated.

The local source correction in `ota_delivery.c` respects the active mode in
both completion guards and keeps the nightly worker alive across no-update,
retryable failure and image-processing outcomes. It persists server-provided
next windows; when schedule discovery is unavailable it sleeps for a bounded
24-hour offline recovery backoff and retries the canonical local policy.
This is not a replacement UTC daily schedule. Reboots retain the persisted
deadline and migration completion flag without disabling nightly operation.
Protected-state corruption/write failures still stop explicitly, without
repair. Storage format, rollback migration, lifecycle manager and power-policy
ownership remain unchanged; there is no continuous socket/background polling.

Host tests compile the actual delivery worker, persisted scheduler and existing
manager/reporting implementation in both modes. Regression coverage includes
one-time-complete migration, repeated no-update checks, initial schedule and
discovery network failures, reboot recurrence, image-processing failure,
unchanged 900-second/no-rearm semantics, and corrupt protected state.
The correction is now compiled and locally qualified in the distinct successors
below, not retroactively included in original accepted artifacts. CPO release
acceptance, publication and physical OTA qualification remain outstanding.
Original accepted artifacts/hashes remain intact. Release governance and
production configuration are owned by `docs/DEPLOYMENT_GUIDE.md`.

Permanent identity and credentials are stored as distinct PSA objects in
TF-M Protected Storage. The Device ID is write-once; provisioning refuses a
different existing ID, and the credential is not accepted from any firmware
build input. USB commissioning uses the dedicated
`CONFIG_FAIRWAY_USB_COMMISSIONING` application (`src/usb_commissioning.c`),
not boot-button entry in the operational runtime. It keeps the debugger
powered, receives interrupt-buffered CRC-protected requests, and verifies
the existing credential through the shared PSA writer/loader. It does not
run LTE, golfer transactions, or OTA scheduling. The former timed `FRBP`
provisioning implementation is removed from current source; accepted
operational binaries remain unchanged. Protocol, lifecycle, completion gates,
and physical-evidence limits are owned by the Device Provisioning Guide.
Updates and MCUboot rollback leave the protected-storage partitions
outside both image slots. A blank object after an interrupted initial
provisioning can be completed by retrying the same Device ID; malformed or
corrupted protected storage fails closed and requires separately authorized
physical recovery. No field recovery from corrupted PSA storage has been
demonstrated.

The generated NCS 3.1.1 configuration enables TF-M Protected Storage rollback
protection, the hardware-unique-key provider, and random on-device key
generation. NCS TF-M startup writes random keys to the nRF91 KMU when the
required slots are blank; PSA storage derives its protection keys from this
device-specific material. The release manifest records the generated HUK,
Protected Storage, NV-counter, and rollback-protection configuration. This
establishes build configuration only: initial KMU provisioning, survival
across physical power loss, and corrupted-storage recovery still require
device-level validation.

The generated NCS 3.1.1 map for the current source is:

| Region | Address | Size |
|---|---:|---:|
| MCUboot | `0x00000` | `0x0C000` |
| Alignment gap | `0x0C000` | `0x04000` |
| MCUboot primary (TF-M + application) | `0x10000` | `0x6C000` (432 KiB) |
| MCUboot secondary | `0x7C000` | `0x6C000` (432 KiB) |
| TF-M ITS | `0xE8000` | `0x08000` |
| TF-M NV counters | `0xF0000` | `0x08000` |
| TF-M Protected Storage | `0xF8000` | `0x08000` |

The non-secure application occupies `0x30000–0x7C000`; TF-M occupies the
remaining primary-slot range. The fixed-partition DTS, static Partition
Manager map, and generated map are aligned for this layout. The secondary
slot provides 442,368 raw bytes, not 442,368 usable signed-image bytes.
The installed MCUboot move-swap layout reserves trailer and workspace as
quantified below. The external-flash
LittleFS region remains separate from the on-chip protected-storage and
MCUboot regions.

### OTA image capacity — existing accepted artifacts (2026-11-09)

No new firmware build was used for this measurement. Accepted manifests record
the effective generated PM/DTS layout, 512-byte header and
`CONFIG_BOOT_SWAP_USING_MOVE=y`, not just board defaults. The retained
`ota-OTA-0.1-production-20261109-r1/build/` contains `pm.config`, MCUboot
`.config` and `zephyr.dts`: both slots are `0x6C000`, erase sectors are
4,096 bytes, flash writes are 4 bytes and `CONFIG_BOOT_MAX_IMG_SECTORS=256`.
Every one of its 47,824 bootloader HEX data bytes matches the boot region of
accepted installed OTA 0.1 r2; r2 has no additional non-erased boot-region
bytes. This binds the retained effective boot configuration to the installed
bootstrap, despite the final accepted package directories not retaining builds.

NCS 3.1.1 MCUboot `boot/bootutil/src/swap_move.c::app_max_size` subtracts a
sector-aligned trailer from both slots and one additional move sector from
primary. Swap status is `256 * 3 * 4 = 3,072` bytes; trailer metadata/magic adds
48 bytes, so the 3,120-byte trailer occupies one 4,096-byte sector.
With equal-sized slots, primary is limiting:
`442,368 - 4,096 - 4,096 = 434,176 bytes (424 KiB)`.
This maximum includes the image header, combined TF-M/non-secure payload and
signature TLVs; do not subtract the 512-byte header a second time.
The 16 MiB external LittleFS partition is not additional MCUboot image capacity.

| Accepted artifact | Signed OTA bytes | KiB | Usable capacity consumed | Remaining bytes | Remaining KiB |
|---|---:|---:|---:|---:|---:|
| OTA 0.1 `0.1.0+1` (USB-only release) | 280,099 | 273.534 | 64.513% | 154,077 | 150.466 |
| OTA 0.1alt `0.1.0+2` | 280,144 | 273.578 | 64.523% | 154,032 | 150.422 |
| OTA 1.0 `1.0.0+1` | 280,144 | 273.578 | 64.523% | 154,032 | 150.422 |

Artifact SHA-256 values match the accepted manifests. Nightly artifacts each
contain a 512-byte header, 279,480-byte combined payload and 152-byte TLV area.
The raw-slot utilization is 63.328%; use the stricter 64.523% above when
planning releases. About 35.48% usable capacity remains: the present images
are not close to the total OTA size ceiling. This is measured space, not a
guarantee that future code fits individual linker/TF-M regions or RAM.
Corrected successors must be measured again when separately authorized builds
exist; current sizes do not describe an unbuilt scheduler correction.

The merged USB Intel HEX files are 901,916 / 902,030 / 902,032 text bytes
respectively, not OTA payloads or flash occupancy measurements. They include
bootloader plus address-record encoding and are not compared to the update
slot size. OTA 0.1's signed-image measurement does not make it distributable.

The original read-only assessment did not change admission guards. The subsequent
authorized qualification now enforces 434,176 bytes in release build/verification,
backend upload and stored-release eligibility, firmware discovery and manager
descriptor admission. The raw slot constant remains 442,368 for partition checks.
Boundary tests accept 434,176 and reject 434,177 and the raw slot ceiling.
No partition or original accepted artifact was changed.

### Corrected successor qualification — 2026-11-09

At qualification time on 2026-11-09 these were immutable local candidates,
not yet CPO-accepted, published, assigned, installed or physically OTA-qualified:

| Release identity | Firmware / MCUboot version | Signed bytes / KiB | Capacity / utilization | Remaining bytes / KiB | Signed image SHA-256 |
|---|---|---:|---|---:|---|
| `OTA-0.1alt-r2` | `0.1.0+3` | 280,387 / 273.815 | 434,176 / 64.579% | 153,789 / 150.185 | `2f146c14586740fd7b0097e6a67ef2be3e82b20aa7d6b4d8cd792f39ef667844` |
| `OTA-1.0-r2` | `1.0.0+2` | 280,387 / 273.815 | 434,176 / 64.579% | 153,789 / 150.185 | `21fe0f3df7cf775631b1d0af5f534ba35927e099e72b1b3184ee4713c4ba594c` |

Packages are under `/Users/DuplexLoop/fairway-builds/` in
`ota-OTA-0.1alt-r2-production-20261109-r1/` and
`ota-OTA-1.0-r2-production-20261109-r1/`, each with the standard signed
BIN, merged USB HEX, release configuration and immutable provenance manifest.
Keep installed OTA 0.1 and the original 0.1alt/1.0 packages unchanged; do not
flash the successor HEX files as part of autonomous commissioning.

Both pristine builds used NCS 3.1.1, Nordic bundle `561dce9adf`, West 1.4.0,
the existing ECDSA-P256 production key, and the canonical release builder.
The CPO entered the unlock secret only at hidden terminal prompts. Each manifest
records the exact command, generated configurations/layout and compiled public
key fingerprint. Both bootloader/image fingerprints match the existing installed
trust anchor `sha256:be1c125733db97148309513e75282736024bec3e2b47beb44b7aa3008f4f88eb`.
The builder verifies the NCS signature and development-key rejection, protects
temporary key material and checks it is absent from both exported artifacts.
Independent ECDSA verification against the installed bootstrap's public key
also passed, including image-hash and key-hash TLVs. The standalone NCS verifier
rejects a public-only P-256 key because its hash-algorithm table omits that
public-key class; this upstream tooling limitation does not invalidate the
builder's private-key verification or independent cryptographic verification.
No vendor source was patched.

Base HEAD was `11213b4ad0607486df12f28d764f6d6abd90cdb6` with documented
uncommitted corrections. Both builds' 77-file firmware source digest is
`47bbaa7c2543469f336e81d91121c49d1334400cc5ac426b20ff8cd44e414dc3`.
The persistent local recovery/evidence directory
`/Users/DuplexLoop/fairway-builds/ota-successors-qualification-20261109/`
contains the manifests, per-file inventory, verification results and a
106-file source/tooling/test archive (`source.tar.gz`, SHA-256
`b1c91255499d9f843dadfce80447ded91321b490a33d93a0c3c1759a6a27cbf6`).
These support reproduction using the separately held key and installed SDK.
The corrected source, tests and canonical documentation are now backed up at
`685cf648fed4e366be37cb8f9861490ec9a31e39` on the canonical review branch;
the archive remains supplemental local evidence, not the source backup. No
claim of byte-for-byte independent rebuild is made; ECDSA signatures can vary.

Generated evidence in both new builds confirms unchanged primary/secondary
addresses and 432 KiB slot sizes, MOVE mode, 256 maximum sectors, 4,096-byte
erase/4-byte write geometry, 3,120-byte trailer, 4,096-byte reserved trailer
and 4,096-byte move workspace. The builder checks actual MCUboot `.config`
and internal-flash DTS, rejects changed geometry/mode/image encryption, and
records effective capacity plus DTS hash
`c2ca30886e86ed38aadb7f27bb2d89a988f328f87dafbdc4da0417a0b5beec7c`.
Generated HUK/TF-M protected storage and nightly version/schedule checks pass.
Build directories are removed by the established builder; generated evidence
is retained in manifests, not claimed as separately retained raw build trees.

Focused validation: 19 release-tool tests, 56 shared tooling tests (including
the separately run NCS imgtool integration), and 34 real-worker/manager host
tests in each ONE_TIME and NIGHTLY mode pass. Backend OTA API and fleet tests
pass 21 each, including corrected-successor eligibility, fixed Course/HQ local
00:30/DST policy, reviewed exact-device authorization, governance, capacity
boundaries, expiring grants and disabled-delivery behavior. These are local/
synthetic and build results, not LTE, download/install, power-loss, trial-health
or physical rollback evidence. Organization and project logging sinks,
production delivery activation, and negative authorization checks are recorded
in the [Deployment Guide](./DEPLOYMENT_GUIDE.md#ota-artifact-delivery-enablement-2026-11-10).
At the 2026-11-10 qualification checkpoint, delivery enablement itself did not
publish or accept firmware. The CPO has since accepted the exact successor
bytes and authorized publication for FRB-0005 only; the current publication
state is recorded in the [Deployment Guide](./DEPLOYMENT_GUIDE.md#prototype-40-corrected-successors--cpo-acceptance-and-publication-authorization-2026-11-10).
Neither assignment nor physical commissioning is authorized by that release
decision.

### Current release state — published, not device-qualified (2026-11-10)

The exact CPO-accepted `OTA-0.1alt-r2` and `OTA-1.0-r2` signed images are
published and visible in the production Admin Firmware OTA page, with only
FRB-0005 allowlisted for assignment. Their hashes, manifests, publication
evidence, production revisions, and GCS object checks are owned by the
[Deployment Guide](./DEPLOYMENT_GUIDE.md#prototype-40-corrected-successors--cpo-acceptance-and-publication-2026-11-10).
No assignment or device download has occurred; publication does not establish
physical installation or OTA success.

The current production Fleet view rejects FRB-0005 because verified physical
OTA initialization and matching trust-anchor evidence is not present in the
authorization record, although this specification records the earlier USB
OTA 0.1 installation. The existing physical-install note is not a substitute
for the required Device `ota_capability` evidence. Resolve this discrepancy
through the separately authorized canonical commissioning operation before
assigning either release. Do not infer the persisted one-time timer state from
the absent backend check-in.

The current release builder requires an explicitly supplied Fairway
ECDSA-P256 signing key and configures the same key for the application image
signer and MCUboot bootloader. MCUboot compiles only the corresponding public
verification key; the private key stays outside the checkout and release
artifacts. The manifest records the SHA-256 fingerprint of MCUboot's
DER-encoded ECDSA-P256 SubjectPublicKeyInfo public key, and the build verifies
that the generated bootloader key
matches. OTA 0.1, OTA 0.1alt, and OTA 1.0 must be built and verified using
the same CPO-controlled key. The encrypted production key has been generated
locally and its fingerprint recorded in `docs/DEPLOYMENT_GUIDE.md`; CPO
confirmation of the offline backup and separate passphrase custody was
recorded on 2026-11-07. The CPO accepted all three local production-signed
releases on 2026-11-09; their immutable inventory and corrected source-only
checkpoint provenance are owned by `docs/DEPLOYMENT_GUIDE.md`.
Existing development-key and disposable-test-key artifacts are not
commissioning candidates. Key generation, custody, and release commands are
owned by `docs/DEPLOYMENT_GUIDE.md`.

The device API contract is authenticated by the existing per-Device
credential and uses the exact permanent Device ID:

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/device-ota/schedule` | Return the next authoritative local 00:30 check deadline |
| `POST /api/v1/device-ota/check` | Discover an exact-device assigned release and short-lived artifact grant |
| `GET /api/v1/device-ota/artifacts/{token}` | Download the signed image, including HTTP byte ranges |
| `POST /api/v1/device-ota/deployments/{deploymentId}/events` | Report downloading, verification, staging, activation, trial, confirmation, rollback, and failure |

The backend release/assignment routes are
`GET/POST /api/v1/admin/ota/releases`,
`GET /api/v1/admin/ota/deployments`, fleet projection and the exact-device
review/confirmation routes documented in `docs/DEPLOYMENT_GUIDE.md`.
The old direct assignment route rejects bypass of review. Release publication
validates MCUboot header magic/version, exact firmware metadata, hardware
target, slot size, SHA-256, the accepted-image digest catalog and original
production provenance. MCUboot verifies the actual image signature
on the Device during boot. The server requires reviewed publication evidence,
release-specific exact-device authorization and verified canonical physical
OTA capability/trust. FRB-0005 retains its narrow one-time bootstrap exception;
fleet selection is not hardcoded to that device. Download authorization is a 30-minute
random-token grant stored by hash; it is not a permanent public artifact URL.
`fairway_backend/cloudrun_receiver/lib/ota/` owns release, assignment,
authorization, storage, and lifecycle rules. The Admin OTA surface is in
`fairway_webapp/cart_operator_dashboard/src/admin/OtaManagement.jsx`.

Local source or development-key validation does not establish commercial
trust, production deployment readiness, installed-device bootloader
compatibility, physical trial confirmation, or rollback. The CPO-controlled
production key and corresponding trust anchor have been used to build and
verify all three accepted local releases. The separately authorized OTA 0.1
USB installation on FRB-0005 passed flash read-back verification; existing
identity provisioning and CPO-observed request/COMPLETE/new-transaction behavior
passed. Autonomous OTA activation, trial confirmation and rollback remain
unvalidated. Backend not-before assignment timestamps gate eligibility only;
they do not change the firmware schedules above or restart a consumed one-time
check. Backend bucket/IAM/log controls, Admin/backend/Hosting deployment and
CPO-authorized autonomous OTA commissioning remain separate gates.
See `docs/DEPLOYMENT_GUIDE.md` for key custody and artifact
building and `docs/DEVICE_PROVISIONING_GUIDE.md` for identity provisioning
and recovery boundaries.

## Explicit non-features and limits

- The current application does not include Health or battery-health reporting.
- The golfer demand window is fixed at five minutes.
- Repeat-press transport and persistence are not implemented.
- No MQTT, LwM2M, persistent socket, or background Health network path is part of the runtime. Scheduled OTA delivery is separate from golfer and COMPLETE behavior and does not alter their transaction deadlines.
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

### Unresolved routine USB debugger access

The intended service procedure is operator-controlled: disconnect Voltaic,
connect USB, run authorized maintenance, disconnect USB, then reconnect
Voltaic for field operation. The shared VBUS entry does not identify which
cable is connected. No approved USB-presence signal or automatic firmware
service-selection mechanism is established.

Operational firmware disables BUCK2 and therefore powers down the RP2040
USB debugger in normal mode. The dedicated commissioning image keeps it
powered, but installing that image first requires access to the debugger.
FRB-0005's 2026-11-10 commissioning succeeded only after an explicitly
authorized PV8-assisted boot established stable access. This does not
demonstrate routine PV8-free maintenance; the unchanged OTA 0.1 image can
again remove debugger access on normal boot.

The minimum unresolved issue is a reliable means of obtaining programming
access from the field-powered-down debugger state without a button or
startup race, while retaining accepted field low-power behavior. A durable
service-access mechanism requires CPO approval before hardware or firmware
redesign. Do not infer USB from VBUS, silently leave BUCK2 powered in field
operation, or reinstate early-erase listeners. Existing board recovery and
explicit PV8 firmware behavior remain intact; the host does not automate
them and refuses to program an unavailable probe.

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

## Historical OTA foundation — superseded by the current OTA delivery implementation

The following Increment 1 record documents the earlier OTA manager-only
checkpoint. Its statements that no downloader, caller, or assignment service
exists are historical and are superseded by the current implementation above.
Its old partition sizes and DTS discrepancy are also superseded by the
generated 432 KiB layout recorded above.

### OTA Increment 1 — FRB-0005 local development foundation

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
