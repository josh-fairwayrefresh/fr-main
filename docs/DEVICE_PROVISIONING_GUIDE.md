# Device Provisioning Guide — Fairway Refresh Pilot 1.1

## Purpose and current fleet status

This document owns device identity, authentication, registry lifecycle, and commissioning requirements. Firmware build/flash procedures are owned by `docs/DEPLOYMENT_GUIDE.md`; current firmware behavior is owned by `docs/FIRMWARE_SPECIFICATION.md`.

The CPO confirms FRB-0001 through FRB-0006 are fully commissioned and in operation. This aggregate status does not assert a particular Firestore lifecycle state or record any device's course or marker location. The production device registry is the authority for individual assignments and state.

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
- Credential replacement keeps the permanent Device ID but replaces the active verifier. The prepared lifecycle operations are deployed on the Admin service; their use for FRB-0003 remains gated by separate authorization and the controlled cutover procedure below. Routine rotation policy and revocation remain deferred. See `docs/DEPLOYMENT_GUIDE.md` and `docs/feature_backlog.md`.

Never put plaintext credentials, complete device-specific provisioning records, or SIM secrets in source control, reports, or canonical documentation.

### Device-Specific Firmware Provisioning — Increment 2

`scripts/build_device_firmware.py` is the canonical local build entry point for a device-specific firmware image. It accepts an explicit target Device ID and the approved secrets directory; it does not call the backend, generate or activate credentials, or flash a device.

- The standard input is exactly `FRB-XXXX-fairway_device_key.h` in the selected secrets directory. Both `FAIRWAY_DEVICE_ID` and `FAIRWAY_DEVICE_KEY` must appear exactly once. The ID must equal the requested target; the credential must be a canonical 32-byte base64url token (43 characters), not a placeholder.
- No generic header is selected implicitly. For a retained legacy `fairway_device_key.h`, an operator may pass its absolute path using `--input-file`; the input must be directly inside the approved secrets directory, must declare the requested ID, and is rejected if the matching named header also exists.
- The secrets directory must be absolute and not group/world-writable. The input header must be a regular non-symlink file with no group/other permissions (normally mode `0600`). The repository `.gitignore` excludes the generic local key and every `*-fairway_device_key.h`; the tracked `fairway_device_key.example.h` remains a placeholder template.
- The builder uses the installed NCS 3.1.1 and matching Nordic toolchain, the canonical board target, `BOARD_ROOT`, `prj_a.conf`, existing MCUboot/TF-M sysbuild, and the deployment guide's established build options. It refuses an existing output directory and writes outside the source checkout and secrets directory.
- Increment 3C synthetic builds resolved MCUboot signing to the NCS-distributed `root-ec-p256.pem` debug key. MCUboot documents this widely distributed key as insecure and not for production. Artifact verification alone does not establish a trusted production signature. No production signing key or corresponding bootloader trust anchor is approved or verified; do not produce or accept a real-device image until both are explicitly configured and verified.
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

The Admin-only lifecycle deployment is complete, but FRB-0003 credential
recovery has not occurred and no physical recovery has been demonstrated.
FRB-0003 retains its permanent identity and the existing single-active-
credential contract. The CPO confirms its removable Hologram SIM is its only
active cellular identity and authorizes temporary removal for offline
maintenance. Production credential preparation, firmware flashing,
activation, and end-to-end validation still require their separate stage
authorizations. The production-signing key and matching bootloader trust
anchor remain an unresolved prerequisite for any real FRB-0003 image.

The CPO confirms FRB-0003 has one removable Hologram SIM as its only active
cellular identity, authorizes temporary removal for maintenance, permits the
device to remain offline during credential replacement, and approves the
existing single-active-credential contract. These decisions resolve the
Increment 3B SIM-isolation and checklist conflict. They do not authorize
deployment, production credential operations, a real firmware build, physical
flashing, or end-to-end validation.

Each stage below requires its own explicit CPO authorization: Admin-only
backend deployment, production credential preparation, real FRB-0003 firmware
build, physical flashing, and end-to-end validation. Approval of one stage
does not authorize the next.

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
   image integrity, and signature against the approved key. The old verifier
   remains active throughout preparation.
5. After separate physical-maintenance authorization, power FRB-0003 down,
   disconnect field power and all other external power sources, and remove
   the same Hologram SIM. Keep it removed for all firmware flashing and
   credential activation. The CPO-confirmed SIM is the only active cellular
   identity; do not treat this exception as a general startup procedure.
6. Flash only the independently verified FRB-0003 artifact using the approved
   non-destructive programming procedure. Confirm flashing succeeded while
   the device remains offline. Do not use erase-all, recovery, or debug-lock
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

The CPO-confirmed SIM-removal exception is now documented in
`docs/HARDWARE_ASSEMBLY_GUIDE.md`; no hardware redesign or alternate offline
control is needed. The production signing-key/trust-anchor gate remains
unresolved, and no deployment, production credential operation, real build,
physical flash, or runtime validation was performed in Increment 3C.

## Commissioning evidence and limits

The CPO-confirmed six-device fleet status is the current aggregate acceptance statement. Commissioning requires the applicable physical-power, button/indicator, LTE/backend, request-attribution, Cart Operator delivery, and acknowledgement checks. LTE registration alone is insufficient. Fleet commissioning does not establish pack autonomy, endurance, or PPK2 consumption.

Device lifecycle and assignment remain separately represented in the registry; do not infer a deployment location from the fact that a device is commissioned or operational.

## Future work

Manufacturing serialization, credential revocation and broader compromise policy, secure secret-delivery policy, and provisioning automation beyond the existing allocator/workflow remain deferred items in `docs/feature_backlog.md`. The prepared-rotation backend is deployed, but its production use remains gated by separately authorized FRB-0003 preparation, firmware, physical cutover, and validation steps.
