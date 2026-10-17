# Device Provisioning Guide — Fairway Refresh Pilot 1.1

## Purpose and current fleet status

This document owns device identity, authentication, registry lifecycle, and commissioning requirements. Firmware build/flash procedures are owned by `docs/DEPLOYMENT_GUIDE.md`; current firmware behavior is owned by `docs/FIRMWARE_SPECIFICATION.md`.

The CPO confirms FRB-0001 through FRB-0005 passed firmware programming, credential activation, and physical end-to-end testing. FRB-0006's authorized firmware recovery and credential replacement completed on 2026-10-17. Subsequent field testing demonstrated a successful button request and COMPLETE rearm, but intermittent LTE/HTTPS failures remain unresolved; sustained reliability acceptance is pending. Admin `deployed` is a software eligibility state, not confirmation of physical golf-course deployment; the CPO says all devices remain development devices until physical deployment is explicitly confirmed. The production device registry is the authority for individual assignments and state.

## Current FRB-0001 recovery status — 2026-10-17

The CPO-authorized complete firmware replacement and credential activation
completed. The full MCUboot + TF-M + application image was read-back verified;
after reset, the application reached `STATE_IDLE` and reported that it was
ready for button wake. Credential rotation operation
`aaba226b-57b8-4096-9f44-d582a02f8cb7` is `activated`. The Admin device state
remains `deployed`; its SIM association and assignment remain intact. The CPO
confirmed the SIM was removed and all external power disconnected before
programming. Reinstall the same SIM only after powering down and disconnecting
USB and all other power, then restore the approved field-power configuration.
The CPO subsequently confirmed FRB-0001 passed physical button, LED, cellular,
and Cart Operator request-delivery validation.

## Current FRB-0002 recovery status — 2026-10-17

The CPO-authorized full erase-all and firmware replacement completed. The
fresh MCUboot + TF-M + application image was read-back verified, and after
reset the application reached `STATE_IDLE`, initialized the modem, handled
the CA certificate, and started LTE connection. Credential rotation
operation `d3b6eef5-bcae-4441-863e-b9406e1dab56` is `activated`. The Admin
device state remains `deployed`; its SIM association and course assignment
remain intact. The CPO later confirmed the same SIM was reinstalled and FRB-0002
passed physical button, LED, cellular, and Cart Operator request-delivery
testing using its replacement credential.

## Current FRB-0003 recovery status — 2026-10-17

The CPO-authorized full firmware replacement completed. The complete MCUboot +
TF-M + application image was programmed and read-back verified; after reset,
the application reached `STATE_IDLE` and reported that it was ready for button
wake. Credential rotation operation
`272fc891-91d4-47d3-9571-c5d175ea1a5c` is `activated`. The Admin device state
remains `deployed`; no lifecycle-state or assignment patch was made.
The CPO later confirmed the same Hologram SIM was reinstalled and FRB-0003
passed physical button, LED, cellular communication, and Cart Operator request
delivery validation using its replacement credential; see the execution
evidence below and the deployment record. Do not reconnect the prior firmware
or attempt to restore the replaced credential.

## Current FRB-0004 recovery status — 2026-10-16

The CPO-authorized full firmware replacement and credential activation
completed. The complete MCUboot + TF-M + application image was programmed and
read-back verified; after reset, serial output confirmed NCS 3.1.1, `STATE_IDLE`,
modem initialization, certificate readiness, and LTE connection startup. The
LTE status update `90` was observed but is not interpreted here as successful
registration; the SIM remained removed. Credential rotation operation
`a0305705-dcda-467e-bbca-989f6ccf688a` is `activated`. The Admin device state
remains `deployed`; its existing SIM association and course/location assignment
remain intact. The CPO may reinstall the same SIM after powering down and
disconnecting USB and all other power, then restore approved field power.
The CPO subsequently confirmed on 2026-10-17 that FRB-0004 passed physical
button, LED, cellular, and Cart Operator request-delivery testing.

## Current FRB-0005 recovery status — 2026-10-16

The CPO-authorized full firmware replacement and credential activation
completed. The complete MCUboot + TF-M + application image was programmed and
read-back verified; after reset, serial output confirmed NCS 3.1.1, `STATE_IDLE`,
modem initialization, certificate readiness, and LTE connection startup. The
SIM remained removed, so LTE registration and physical end-to-end behavior
were not validated. Credential rotation operation
`ba4ee44e-7b49-451c-88d1-91f8cb74bf90` is `activated`. The Admin device state
remains `deployed`; its existing SIM association and assignment remain intact.
The CPO may reinstall the same SIM after powering down and disconnecting USB
and all other power, then restore approved field power. The CPO subsequently
confirmed on 2026-10-17 that FRB-0005 passed physical button, LED, cellular,
and Cart Operator request-delivery testing.

## Current FRB-0006 recovery status — 2026-10-17

The CPO-authorized full firmware replacement and credential activation
completed. The complete MCUboot + TF-M + application image was programmed and
read-back verified; after reset, serial output confirmed NCS 3.1.1, `STATE_IDLE`,
modem initialization, certificate readiness, and LTE connection startup. The
SIM remained removed, so LTE registration and physical end-to-end behavior
were not validated. Credential rotation operation
`5e3c0718-58ea-4dde-8143-cbbef359e60d` is `activated`. The Admin device state,
SIM association, and assignment remain unchanged. The CPO may reinstall the
same SIM after powering down and disconnecting USB and all other power, then
restore approved field power. The later field results are recorded in
`docs/DEPLOYMENT_GUIDE.md`: a successful request and COMPLETE rearm were
observed, but intermittent LTE/HTTPS failures mean sustained reliability
acceptance remains pending.

## Fleet model

The hierarchy is Customer → Course → Device:

- A Customer is stored at `customers/{customerId}`.
- A Course belongs to one Customer and is stored at `customers/{customerId}/courses/{courseId}`.
- A Device has a permanent identity as the Firestore document ID `devices/{FRB-XXXX}`.
- IDs use `CUST-XXXX`, `COURSE-XXXX`, and `FRB-XXXX` formats. Backend allocation is centralized and transaction-backed; clients do not guess IDs.
- Active assignment is represented by `customer_id`/`customer_name`, `course_id`/`course_name`, and one `location`. A device in `in_inventory` has all assignment fields null. Do not duplicate device identity, hole, label, or active status in separate fields.

The deployed backend implementation is in `fairway_backend/cloudrun_receiver/lib/fleet/`.

## Registry lifecycle

The canonical persisted Device `state` values are `in_inventory`, `deployed`, `maintenance`, and `retired`.

- New provisioned devices begin in `in_inventory` with no Customer/Course/location assignment.
- Transitioning to `deployed` requires a valid Customer, a Course belonging to that Customer, and a valid location; state and assignment are written atomically.
- Returning to `in_inventory` clears the complete assignment. A cross-Customer transfer must pass through inventory.
- Retired records are retained for provenance; there is no normal delete workflow.
- Backend communication is permitted for `in_inventory`, `deployed`, and `maintenance`; `retired`, missing, malformed, and unknown states fail closed.

Customer/Course names are synchronized display copies from authoritative records. SIM identifiers, commissioning/service metadata, and administrative notes belong in the operational registry, not in canonical engineering documents.

## Provisioning workflow

Assembled → hardware inspected → approved firmware built for the device identity → firmware installed → identity/credential and SIM associated → backend registry verified → functional commissioning → deployment assignment when authorized.

Use the established Admin provisioning workflow or the existing backend utility `fairway_backend/cloudrun_receiver/scripts/provision_device.js` (`npm run provision-device`). The shared provisioning implementation is `lib/fleet/provisioning.js`; do not create a parallel allocator or credential path.

1. Confirm the physical unit has reached the approved Ready-for-Deployment point and obtain its allocated permanent Device ID through the canonical workflow.
2. Issue one unique device credential. The backend stores only `{ algorithm: 'sha256', digest, updated_at }`; the plaintext is delivered once and must not be logged, committed, or written into canonical documentation.
3. Place the Device ID and credential together in the local ignored header named `samples/fairway_power_sandbox/src/secrets/FRB-XXXX-fairway_device_key.h`. The tracked example header contains placeholders only. Do not reuse another device's credentials. Keep the file readable only by its owner.
4. Record the SIM ICCID against the correct Device in the registry. Verify SIM/carrier activation through the approved carrier account; do not infer SIM readiness from firmware build success.
5. Build and verify the device-specific firmware using the workflow in `docs/DEPLOYMENT_GUIDE.md`. Flash only after separate authorization and successful artifact verification.
6. Verify registration, normal boot/idle, modem initialization, LTE registration, one authorized physical button transaction, correct device attribution, and operator delivery/acknowledgement as required by the commissioning plan.
7. Record commissioning evidence in the operational record. Assign Customer/Course/location only through the authorized registry workflow; this document intentionally contains no per-device assignments.

## Authentication contract

- Each Device has one active, unique 256-bit cryptographically random credential, base64url encoded for the existing `X-Fairway-Device-Key` header.
- Firmware obtains identity and credential from one local, gitignored header, preventing separately hardcoded identity/credential values.
- The receiver looks up the exact claimed Device ID and verifies the credential against that Device's stored SHA-256 verifier using constant-time comparison. There is no fleet-wide shared-key fallback.
- Unknown, retired, missing-state, malformed-state, or unknown-state records are denied according to the fail-closed lifecycle policy.
- Command poll and acknowledgement routes apply the same device identity, state, and credential checks and correlate COMPLETE to the exact device and request.
- Credential replacement keeps the permanent Device ID but replaces the active verifier. The prepared lifecycle operations are deployed on the Admin service; CPO-authorized replacements for FRB-0001 through FRB-0006 are activated. The CPO confirms FRB-0001 through FRB-0005 passed physical end-to-end testing. FRB-0006 has demonstrated a successful request and COMPLETE rearm, but intermittent LTE/HTTPS failures leave sustained reliability acceptance pending. Routine rotation policy and revocation remain deferred. See `docs/DEPLOYMENT_GUIDE.md` and `docs/feature_backlog.md`.

Never put plaintext credentials, complete device-specific provisioning records, or SIM secrets in source control, reports, or canonical documentation.

### Device-Specific Firmware Provisioning — Increment 2

`scripts/build_device_firmware.py` is the canonical local build entry point for a device-specific firmware image. It accepts an explicit target Device ID and the approved secrets directory; it does not call the backend, generate or activate credentials, or flash a device.

- The standard input is exactly `FRB-XXXX-fairway_device_key.h` in the selected secrets directory. Both `FAIRWAY_DEVICE_ID` and `FAIRWAY_DEVICE_KEY` must appear exactly once. The ID must equal the requested target; the credential must be a canonical 32-byte base64url token (43 characters), not a placeholder.
- No generic header is selected implicitly. For a retained legacy `fairway_device_key.h`, an operator may pass its absolute path using `--input-file`; the input must be directly inside the approved secrets directory, must declare the requested ID, and is rejected if the matching named header also exists.
- The secrets directory must be absolute and not group/world-writable. The input header must be a regular non-symlink file with no group/other permissions (normally mode `0600`). The repository `.gitignore` excludes the generic local key and every `*-fairway_device_key.h`; the tracked `fairway_device_key.example.h` remains a placeholder template.
- The builder uses the installed NCS 3.1.1 and matching Nordic toolchain, the canonical board target, `BOARD_ROOT`, `prj_a.conf`, existing MCUboot/TF-M sysbuild, and the deployment guide's established build options. It refuses an existing output directory and writes outside the source checkout and secrets directory.
- Increment 3C synthetic builds resolved MCUboot signing to the NCS-distributed `root-ec-p256.pem` debug key. MCUboot documents this widely distributed key as insecure and not for production. Artifact verification alone does not establish a trusted production signature. The CPO later authorized a one-time complete FRB-0003 firmware and bootloader replacement using the configured NCS debug key; the resulting image booted. This does not establish production signing security or authorize other real-device images. Production signing and trust-anchor approval remain unresolved for future releases.
- The protected output directory is mode `0700`; output files are restricted to owner access. During the build it temporarily contains generated provisioning headers, ELF files, and intermediates; after successful verification, the workflow removes the intermediate build tree and retains only the merged firmware image, manifest, and checksum. Treat all retained output as credential-bearing and do not commit or broadly distribute it. A failed build can leave a protected partial build directory; do not distribute it.
- `scripts/verify_device_artifact.py` verifies the manifest, artifact size and SHA-256, expected build metadata, Intel HEX checksums, and the presence of both the target Device ID and selected credential in the actual merged HEX image. The manifest distinguishes the CPO-accepted firmware source baseline from the actual current repository commit/branch/dirty state, and records a firmware-source fingerprint, toolchain, command, artifact hash and size, and selected input filename. It never records the credential or its digest.
- Verification proves that the artifact contains the credential in the protected local input. It does not independently prove that the input matches a production backend verifier; that association must come from the separately authorized credential provisioning/recovery process.

Rotation remains a separated, operator-controlled lifecycle: prepare the replacement using the authorized backend operation; securely place that one-time credential in the target's local input; build and independently verify; perform the separately authorized physical firmware cutover; then activate the prepared credential and validate device authentication. The firmware build does not call or activate backend operations. Do not activate a pending credential during preparation, and do not flash or activate after any failed validation. If a prepared value or artifact is lost, cancel/reprepare through the approved lifecycle rather than logging or recovering a secret from build output.

### Prepared Credential Rotation — Backend Increment 1

The deployed implementation provides a fleet-wide, single-active-credential rotation workflow. These routes require the existing authenticated global-Admin authorization; they are not device-facing routes:

- `POST /api/v1/admin/devices/{deviceId}/credential-rotations` with a required bounded `reason` prepares a replacement for an existing communication-eligible Device with a valid active verifier. Credential-shaped values are rejected from the reason. The response returns the new plaintext credential once with `Cache-Control: no-store`.
- `GET /api/v1/admin/devices/{deviceId}/credential-rotations` returns the current pending operation without secret material, allowing an operator to recover its operation ID if the prepare response was lost.
- `GET /api/v1/admin/devices/{deviceId}/credential-rotations/{operationId}` returns redacted operation status.
- `POST /api/v1/admin/devices/{deviceId}/credential-rotations/{operationId}/activate` requires `{ "confirmed": true }` and atomically activates the prepared verifier.
- `POST /api/v1/admin/devices/{deviceId}/credential-rotations/{operationId}/cancel` requires `{ "confirmed": true }` and invalidates an unactivated preparation.

Preparation leaves the active verifier unchanged. Non-secret operation/audit metadata is stored in `device_credential_rotations`; the pending verifier is isolated in `device_credential_rotation_secrets`, and a separate `device_credential_rotation_locks` record prevents concurrent preparations for the same Device. These records are not returned by ordinary device/admin read models, and the Firestore client rules deny browser access outside the explicitly authorized requests collection. Pending verifiers are not consulted by request authentication.

Rotation states are `prepared`, `activated`, and `cancelled`. A preparation records the initiating Admin, reason, preparation time, and expected credential generation. Activation rechecks the exact Device and operation, lock ownership, eligible lifecycle state, and unchanged generation in a Firestore transaction. The same transaction promotes the verifier, increments the Device's `credential_generation`, removes the pending verifier, records the activating Admin/time, and releases the lock. Older Device records without a generation are treated as generation zero; all backend credential issuance/replacement paths increment the generation. The permanent Device ID, SIM association, assignment, and lifecycle state are unchanged.

Cancellation before activation preserves the active verifier; repeated cancellation reports the cancelled state. Repeated activation reports the already-activated state without issuing or restoring a credential. A stale generation, cancelled operation, wrong Device ID, or concurrent preparation is rejected. If a one-time preparation response is lost, the device-level status route recovers only the operation ID and state; plaintext cannot be retrieved again. Cancel that operation and prepare a new one while the current credential remains active. After activation, the old credential no longer authenticates; backend rollback alone is not a recovery procedure.

The credential-lifecycle capability was deployed to production Admin revision
`fairway-admin-00017-dvk` on 2026-10-17; the exact source, image digest, test
results, deployment configuration, and verification limits are recorded in
`docs/DEPLOYMENT_GUIDE.md`. Unauthenticated requests to the lifecycle-status
route were rejected with HTTP 401. No authenticated production Admin request
or credential lifecycle operation was performed, and no credential or device
record was changed. There is no Admin UI, expiry/automatic cleanup policy,
revocation operation, second-person approval, or production cutover
authorization in this increment. Production use requires the separately
authorized firmware preparation, physical maintenance, activation, flashing,
and end-to-end validation procedure. Do not invoke prepare, activate, or
cancel against production until that cutover is explicitly approved and the
replacement firmware/input is secured.

### Local Firestore Emulator Validation

Run the backend lifecycle concurrency suite only against the local Firestore emulator. It uses the real `@google-cloud/firestore` client and this lifecycle implementation; it does not use `FakeFirestore`. The emulator project is the Firebase CLI `demo-fairway-credential-lifecycle` project, Firestore binds only to `127.0.0.1:8787`, the emulator UI is disabled, and `firestore.emulator.rules` denies client access. The Admin/server Firestore client used by the test bypasses Firestore Security Rules as expected; this suite does not validate production IAM or deployed security configuration.

Prerequisites are Node.js 20 or later, Java 21 or later, Firebase CLI 15.34.0, and the existing backend `@google-cloud/firestore` dependency. The validated local environment used Node.js 24.15.0, `@google-cloud/firestore` 7.11.6, Homebrew OpenJDK 21.0.12.1, and Cloud Firestore Emulator 1.22.0 (downloaded by the CLI). NCS, the Nordic toolchain, production Firebase configuration, and application dependency manifests are not changed by this setup. If Java is installed through Homebrew, select it for this command without changing the system Java selection:

```sh
cd <workspace>/nfed/fairway_backend/cloudrun_receiver
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

npx --yes firebase-tools@15.34.0 emulators:exec \
  --project demo-fairway-credential-lifecycle \
  --config firebase.emulator.json \
  --only firestore \
  'FIRESTORE_EMULATOR_HOST=127.0.0.1:8787 GOOGLE_CLOUD_PROJECT=demo-fairway-credential-lifecycle GCLOUD_PROJECT=demo-fairway-credential-lifecycle node test/credential_lifecycle_emulator.js'
```

The harness fails before opening Firestore unless the emulator host is exactly the configured loopback host, the project environment identifies only the designated synthetic project, the emulator accepts a loopback TCP connection, and credential-bearing environment variables are unset. It bounds the initial reachability probe to 1.5 seconds. The `demo-` project prevents Firebase CLI access to live project resources. Each test clears only the emulator's `(default)` database before seeding synthetic records. Do not change the project ID, host, port, or emulator target to a production or remote project.

The suite coordinates competing transaction callbacks at a barrier after each callback has read and queued its writes but before either callback may commit. It reports both callbacks reaching the barrier and counts callback retries by the Firestore client. The validated run covered concurrent prepare, concurrent activate, and activate-versus-cancel; all three races overlapped two callbacks before commit and observed Firestore transaction callback retries. The suite also validates stale generation, wrong-device rejection, response-loss retries, authentication transitions, registry preservation, and legacy records without a generation. The local Firestore emulator does not prove production IAM, network configuration, HTTP delivery behavior, device flashing, or physical recovery. Activation/cancellation response loss is injected after the lifecycle service commits and before the test caller receives a response; it is not a production network test.

On 2026-10-16, the emulator lifecycle suite passed **8/8**, and the existing
backend suite was reported as **105/105**. During the 2026-10-17 release
verification, the accepted source baseline rerun contained 106 tests and the
candidate passed 118/118; the earlier 105 count was not reproduced. The
previously reported 103 `PASS:` lines counted only one output format. The
emulator results close the local Firestore transaction-contention validation
gap only. The Admin capability is now deployed, but FRB-0003 physical cutover
and production credential operations remain separate authorization gates.

### FRB-0003 Controlled Cutover — Increment 3C procedure

The following was the pre-execution readiness record and controlled-cutover
procedure. Its statements that recovery had not occurred are historical and
are superseded by the 2026-10-17 execution evidence below. The CPO-confirmed
Hologram SIM removal and single-active-credential contract remain applicable.

The numbered sequence records the approved order of operations; consult the
current status at the top of this document before acting. FRB-0003's
preparation, full firmware replacement, and activation are complete. Do not
repeat them; cellular and end-to-end validation remain outstanding.

1. For backend readiness, independently review and separately authorize the
   Admin-only lifecycle deployment. Confirm the deployed Admin revision and
   redacted routes before credential operations; leave the receiver unchanged.
2. After separate recovery authorization, use the approved Admin workflow to
   read only `devices/FRB-0003`. Confirm its permanent ID, eligible state,
   active credential generation, and registry fields to preserve. No
   production record was read or modified in Increment 3C.
3. Prepare the programming station and confirm the approved service-power
   configuration before changing device state.
4. After separate credential-preparation authorization, prepare one
   replacement using the authenticated global-Admin operation. Keep the
   one-time response protected; never log or recover it from output. Place it
   only in the owner-readable FRB-0003-specific ignored header. Before a real
   build, an approved production signing key and corresponding bootloader
   trust anchor must be configured and verified; the NCS debug key is not
   acceptable. Build from the reviewed Pilot 1.1 provisioning candidate and
   independently verify target identity, credential-input match, manifest,
   image integrity, and signature against the approved key. The current
   builder emits a full merged HEX containing MCUboot; do not use that output
   for FRB-0003 while preserving its installed bootloader. An application-only
   output path and its compatibility with the installed bootloader must be
   validated before flashing. The old verifier remains active throughout
   preparation.
5. After separate physical-maintenance authorization, power FRB-0003 down,
   disconnect field power and all other external power sources, and remove
   the same Hologram SIM. Keep it removed for all firmware flashing and
   credential activation. The CPO-confirmed SIM is the only active cellular
   identity; do not treat this exception as a general startup procedure.
6. Flash only an independently verified FRB-0003 application-only artifact
   using the approved non-destructive programming procedure. Confirm flashing
   succeeded while the device remains offline. The current full merged HEX
   includes MCUboot and is not an application-only update; do not program it
   under the current recovery scope. If preserving the installed bootloader
   cannot be established, stop and seek separate CPO authorization before
   any bootloader replacement. Do not use erase-all, recovery, or debug-lock
   procedures without separate CPO approval.
7. Only after successful flashing, activate the prepared operation under its
   separate authorization. Verify the redacted activation status. Keep the
   SIM removed while activation is pending or its outcome is uncertain. After
   activation, the previous firmware credential is invalid; backend rollback
   or code rollback does not restore it.
8. Power the device down before reinstalling the same SIM. Restore the
   approved field-power configuration, observing the normal rule that USB
   and VXX must not be connected simultaneously.
9. After separate end-to-end validation authorization, verify normal boot,
   LTE registration, authenticated request processing, request attribution,
   Cart Operator delivery/actionability, and correlated COMPLETE. Verify the
   Device ID, SIM association, assignment, lifecycle state, and unrelated
   registry fields remain unchanged. Record each stage and its evidence in
   the operational record.

Failure handling:

- **Admin deployment fails:** do not prepare a credential or begin cutover.
  Restore the prior Admin revision only if there is no pending rotation; if an
  operation is pending, resolve it while the lifecycle routes remain available.
- **Preparation fails or its one-time response is lost:** keep the existing
  firmware online and the old verifier active. Check redacted operation status;
  cancel an incomplete preparation and create a new one only through the
  authorized route. Never retrieve or reconstruct the plaintext.
- **Build, artifact verification, or identity check fails:** do not flash or
  activate. Cancel the pending operation before any retry; correct the
  device-specific input and verify a fresh artifact.
- **Probe or flash is interrupted:** keep the SIM out and the device offline;
  do not activate. Determine the installed image using the approved
  non-destructive procedure and retry only with the verified image. Do not use
  erase-all, recovery, or debug-lock actions without separate CPO approval.
- **Flash succeeds but activation fails or its response is uncertain:** keep
  the device offline and query redacted operation status. If the operation is
  still prepared, activation may be retried only for that verified operation
  under the authorized procedure. If it was cancelled or cannot be resolved,
  do not connect firmware containing its replacement credential; a new
  authorized preparation and matching build/flash or other reviewed recovery
  is required.
- **Activation succeeds but LTE or authentication fails:** keep the device
  offline. Verify operation status, image identity, antenna/SIM placement, and
  service-power configuration. Do not reconnect old firmware or attempt to
  restore its credential. A further rotation or reflash requires separate CPO
  authorization.
- **Unexpected behavior on another device:** stop, preserve its existing
  state, and escalate before taking any further action.

The CPO-confirmed SIM-removal exception is documented in
`docs/HARDWARE_ASSEMBLY_GUIDE.md`. The Increment 3C statement above that no
real build, physical flash, or runtime validation had been performed describes
that earlier increment only.

### FRB-0003 Recovery Execution — 2026-10-17

- **Identity and authorization:** The CPO confirmed the connected physical
  unit was FRB-0003. The sole connected probe identified an nRF9151 target
  over SWD. The CPO-authorized Admin state `deployed` was preserved; the
  operation did not patch device registry fields.
- **Credential lifecycle:** One replacement was prepared through the
  deployed Admin lifecycle and activated only after successful flash and boot.
  Redacted status returned `activated` for operation
  `272fc891-91d4-47d3-9571-c5d175ea1a5c`. No plaintext credential was logged
  or added to source control. The temporary plaintext build-input header was
  removed after activation.
- **Firmware provenance and verification:** The device-specific builder from
  accepted commit `97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` used the accepted
  Pilot 1.1 firmware baseline `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`,
  NCS 3.1.1, toolchain bundle `561dce9adf`, West 1.4.0, board target
  `circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. The complete
  merged image passed independent device/input/manifest/checksum verification
  and MCUboot signature verification with the configured NCS debug key. Its
  protected local artifact was 522,444 bytes with SHA-256
  `2596e7daa35877a63bf4c7571c31385b086369b22416f75a644c81ca545fe93f`.
- **Programming and boot:** The authorized whole-image `probe-rs` operation
  used chip erase and read-back verification. After normal reset, fresh UART
  output showed NCS 3.1.1, modem-library initialization, certificate
  provisioning/check, LTE connection startup, `STATE_IDLE`, and
  “Ready. Waiting in low-power idle for button wake.” This confirms the
  replacement image booted; it does not establish LTE registration or
  end-to-end service with the SIM removed.
- **Remaining commissioning:** The same Hologram SIM remains removed.
  Cellular registration, authenticated button request, correct attribution,
  Cart Operator delivery/actionability, and correlated COMPLETE have not yet
  been verified. Power down and disconnect USB before reinstalling the same
  SIM; then restore approved field power and perform the commissioning checks.
- **Scope:** The existing receiver and other devices were not changed. No
  deployment, Git commit, or push occurred. The protected firmware artifact
  remains local and must be treated as credential-bearing; it is not a
  production release artifact or approval for reuse on another device.

### FRB-0001 Recovery Execution — 2026-10-17

- **Identity and authorization:** The CPO confirmed FRB-0001 was connected
  and confirmed its SIM removed and all external power disconnected before
  programming. The sole connected CMSIS-DAP probe was accessible over SWD to
  a Nordic Cortex-M33 target. The Admin state remained `deployed`; the SIM
  association and assignment were preserved.
- **Credential lifecycle:** A unique replacement was prepared and activated
  through the deployed Admin lifecycle. Redacted status returned `activated`
  for operation `aaba226b-57b8-4096-9f44-d582a02f8cb7`. The plaintext was not
  logged or committed, and the temporary owner-only input header was removed
  after activation.
- **Firmware provenance and verification:** The device-specific builder from
  accepted commit `97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` used accepted
  Pilot 1.1 firmware baseline `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`,
  NCS 3.1.1, toolchain bundle `561dce9adf`, West 1.4.0, board target
  `circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. Independent
  verification confirmed device/input match, manifest, and checksum. The
  MCUboot signed application cryptographically verified against the configured
  NCS-distributed `root-ec-p256.pem` debug key. The protected merged HEX was
  522,444 bytes with SHA-256
  `1706c474d590f76dbaa8edd95ed21282236039ed251eff3793214166ee1b0408`.
- **Programming and boot:** `probe-rs` performed the authorized complete-chip
  erase, programmed the full merged image, and verified read-back. After
  normal reset, fresh UART output showed NCS 3.1.1, `STATE_IDLE`, and
  “Ready. Waiting in low-power idle for button wake.” Modem initialization
  and LTE startup messages were also observed; no FRB-0001 button request was
  initiated during this operation.
- **Remaining commissioning:** The CPO may power the device down, disconnect
  USB and all other power, reinstall the same SIM, and restore approved field
  power. Authenticated request delivery and Cart Operator end-to-end
  validation remain pending.
- **Scope:** No other device or backend service was changed. The existing
  receiver was unchanged. No deployment, Git commit, or push occurred. The
  credential-bearing image remains protected locally and is not approved for
  reuse or distribution. Use of the NCS debug signing key for this authorized
  full replacement does not resolve the separate production-signing concern.

### FRB-0002 Recovery Execution — 2026-10-17

- **Identity and authorization:** The CPO confirmed FRB-0002 was connected
  by USB with SIM removed and external power disconnected. The sole connected
  CMSIS-DAP probe was selected explicitly over SWD; it identified a Nordic
  target. `probe-rs` initially reported core lock and required erase-all. After
  the CPO explicitly authorized full-chip erase-all, programming proceeded.
- **Credential lifecycle:** The first prepared operation was cancelled after
  that initial stop and its image was not reused. A new FRB-0002-specific
  credential was prepared and activated only after successful new-image
  programming and boot. Redacted status returned `activated` for operation
  `d3b6eef5-bcae-4441-863e-b9406e1dab56`. The plaintext input was removed.
- **Firmware provenance and verification:** The device-specific builder from
  accepted commit `97332a0dc63bd4a87eb0ae3a5b30708cc3e02c38` used accepted
  Pilot 1.1 firmware baseline `6a19f83c5bd5d1d390efd937daa1c38c0e837eb0`,
  NCS 3.1.1, toolchain bundle `561dce9adf`, West 1.4.0, board target
  `circuitdojo_feather_nrf9151@1/nrf9151/ns`, and `prj_a.conf`. Independent
  verification confirmed FRB-0002 identity, the new protected credential
  input, manifest, and artifact checksum. MCUboot cryptographic signature
  verification passed against the configured NCS-distributed
  `root-ec-p256.pem` debug key. The protected fresh merged HEX was 522,444
  bytes with SHA-256
  `0714de9f54b05717691bfdb6285e3e9d7f675976c99fd573b55d984f8392c00d`.
- **Programming and boot:** With explicit CPO erase-all authorization,
  `probe-rs` completed full-chip erase, programmed the new complete image, and
  verified read-back. After normal reset, fresh UART output confirmed NCS
  3.1.1, `STATE_IDLE`, the ready/idle message, modem initialization, CA
  certificate provisioning, and LTE connection startup. Fresh LTE
  registration was not established in the captured output.
- **Registry and next validation:** Redacted Admin status confirms the
  device remains `deployed`; its SIM association and course assignment remain
  intact. The same SIM remains removed. The CPO may power down the device,
  disconnect USB and all other power, reinstall the same SIM, and restore
  approved field power. Physical button, LED, cellular registration, and Cart
  Operator request validation remain pending.
- **Scope:** No other device, receiver, or backend infrastructure was
  changed. No deployment, commit, or push occurred. The protected
  credential-bearing artifact remains local and is not approved for reuse or
  distribution. This authorized full replacement does not resolve the
  separate production-signing security concern.

## Commissioning evidence and limits

The CPO confirms FRB-0001 through FRB-0005 passed physical end-to-end validation. FRB-0006 has demonstrated intermittent end-to-end success, including a COMPLETE rearm, but its recurring LTE/HTTPS failures leave reliability acceptance open; do not count it as fully commissioned. Commissioning requires the applicable physical-power, button/indicator, LTE/backend, request-attribution, Cart Operator delivery, and acknowledgement checks. LTE registration alone is insufficient. Fleet commissioning does not establish pack autonomy, endurance, or PPK2 consumption.

Device lifecycle and assignment remain separately represented in the registry; do not infer a deployment location from the fact that a device is commissioned or operational.

## Future work

Manufacturing serialization, credential revocation and broader compromise policy, secure secret-delivery policy, and provisioning automation beyond the existing allocator/workflow remain deferred items in `docs/feature_backlog.md`. The prepared-rotation backend is deployed. FRB-0003 preparation, firmware replacement, activation, and CPO-confirmed physical end-to-end validation are complete.
