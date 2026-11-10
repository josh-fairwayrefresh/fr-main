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
- Active assignment is represented by `customer_id`/`customer_name`, `course_id`/`course_name`, and one `location`. Headquarters-held `in_inventory` and `maintenance` devices have no active assignment. The local Prototype 4.0 implementation clears all assignment fields for either state; existing production records are not migrated here. Do not duplicate device identity, hole, label, or active status in separate fields.

The deployed backend implementation is in `fairway_backend/cloudrun_receiver/lib/fleet/`.

## Registry lifecycle

The canonical persisted Device `state` values are `in_inventory`, `deployed`, `maintenance`, and `retired`.

- New provisioned devices begin in `in_inventory` with no Customer/Course/location assignment.
- Transitioning to `deployed` requires a valid Customer, a Course belonging to that Customer, and a valid location; state and assignment are written atomically.
- Returning to `in_inventory` or entering `maintenance` clears the complete active assignment. A cross-Customer transfer follows the existing inventory workflow; Maintenance is a headquarters-held service/testing category, not an active Customer/Course placement.
- Retired records are retained for provenance; there is no normal delete workflow.
- Backend communication is permitted for `in_inventory`, `deployed`, and `maintenance`; `retired`, missing, malformed, and unknown states fail closed.

Customer/Course names are synchronized display copies from authoritative records. SIM identifiers, commissioning/service metadata, and administrative notes belong in the operational registry, not in canonical engineering documents.

### OTA initialization evidence (local Prototype 4.0 extension)

OTA-capable firmware must first be installed physically. OTA 0.1 is the
USB-only bootstrap already commissioned on FRB-0005; it is never an assignable
OTA image. An OTA-capability label alone is not proof of physical initialization
or bootloader trust. Before authorizing updates, engineering commissioning
must record verified, non-secret evidence on the existing Device:

```
ota_capability: {
  verified: true,
  hardware_id: "circuitdojo_feather_nrf9151@1/nrf9151/ns",
  signing_fingerprint: "<verified public signing fingerprint>",
  schedule_mode: "one_time" | "nightly",
  evidence_record: "<physical initialization and trust verification reference>"
}
```

This is not a credential, device inventory or firmware-version substitute.
Only a separately authorized registry commissioning operation may establish
it; the OTA dashboard cannot edit it. Missing/mismatched evidence fails closed.
The release-specific publication catalog separately limits exact authorized
device IDs. An authenticated successful confirmation of a matching nightly
release is recorded in OTA status and permits subsequent nightly scheduling
without mutating the original physical-initialization record. Reported version
is device-reported evidence, not independent boot attestation.

Maintenance devices remain active and can communicate/test/update when capable.
Their OTA schedule uses the headquarters IANA timezone, as does Inventory;
deployed devices use their canonical Course's timezone. The CPO-approved
headquarters timezone is `America/Los_Angeles` (including DST), superseding the
earlier unconfirmed Pacific assumption. The backend applies it by default.
Legacy placement display copies on Maintenance do not create an OTA deployment
or select its old Course timezone. No production capability, placement or
headquarters configuration was changed in this local increment.

## Provisioning workflow

Assembled → hardware inspected → permanent Device and backend credential
created through the established workflow → common credential-free firmware
installed → identity/credential written to TF-M PSA Protected Storage →
SIM and registry verified → functional commissioning → deployment assignment
when authorized.

Use the established Admin provisioning workflow or the existing backend utility `fairway_backend/cloudrun_receiver/scripts/provision_device.js` (`npm run provision-device`). The shared provisioning implementation is `lib/fleet/provisioning.js`; do not create a parallel allocator or credential path.

1. Confirm the physical unit has reached the approved Ready-for-Deployment point and obtain its allocated permanent Device ID through the canonical workflow.
2. Issue one unique device credential. The backend stores only `{ algorithm: 'sha256', digest, updated_at }`; the plaintext is delivered once and must not be logged, committed, or written into canonical documentation.
3. Do not put the Device ID or credential in a firmware header, build command, common image, or release artifact. For a new PSA-backed device, use the protected serial provisioning procedure below with the existing backend credential. Do not reuse another Device's credential.
4. Record the SIM ICCID against the correct Device in the registry. Verify SIM/carrier activation through the approved carrier account; do not infer SIM readiness from firmware build success.
5. Build and verify the common signed firmware image using `docs/DEPLOYMENT_GUIDE.md`. The image is independent of per-device credentials. Flash only after separate authorization and successful artifact verification.
6. Verify protected identity load, normal boot/idle, modem initialization, LTE registration, one authorized physical button transaction, correct Device attribution, and operator delivery/acknowledgement as required by the commissioning plan.
7. Record commissioning evidence in the operational record. Assign Customer/Course/location only through the authorized registry workflow; this document intentionally contains no per-device assignments.

## Common-image identity and credential provisioning

The current nRF9151 application reads the permanent Device ID and the
backend-issued 32-byte credential from separate TF-M PSA Protected Storage
objects. The application image and signed OTA artifact contain neither value.
The Device ID is write-once: an attempt to provision a different ID fails
closed. Protected Storage is outside the MCUboot primary and secondary image
slots, so normal updates and MCUboot rollback do not replace the identity or
credential. Hardware-unique-key and TF-M Protected Storage rollback-
protection configuration are enabled. NCS 3.1.1 TF-M startup generates
random hardware-unique keys on the device and writes them to the nRF91 Key
Management Unit when its required slots are blank; these keys are not
embedded in firmware. The generated nRF9151 configuration and partition map
are recorded in `docs/FIRMWARE_SPECIFICATION.md`.

For initial USB commissioning, first install the approved common OTA 0.1
merged image under the separately authorized physical procedure. With the
device unprovisioned, enter service mode by holding PV8 through boot. Use the
Feather's existing single USB development connection for debugging, runtime
UART console access, and identity provisioning: the provisioning UART is
exposed through the CMSIS-DAP probe's USB CDC-ACM serial interface. No separate
UART cable, adapter, or second physical connection is required. Identify the
existing USB serial port using
[USB Runtime UART Console — Verified Development Connection](./DEPLOYMENT_GUIDE.md#usb-runtime-uart-console--verified-development-connection);
do not assume a previously observed numeric port suffix is unchanged.
From the protected workstation, run
`python3 scripts/provision_device_identity.py --port /dev/cu.usbmodem<SUFFIX>`
using that identified USB CDC-ACM port. The
operator enters the exact permanent Device ID and existing backend-issued
credential at hidden prompts. The tool sends a fixed-length provisioning
packet; it does not read or modify Firestore, write a header, print the
credential, or create a credential. The firmware validates the ID/key format,
stores them with PSA Protected Storage, reports only success/failure, and
reboots. Allow the initial secure boot to finish without interruption so
TF-M can initialize the per-device hardware keys before provisioning
identity. Release the service button and verify the identity through an
authenticated normal request.

If power is interrupted after the write-once Device ID is stored but before
the credential write completes, retrying provisioning with the same ID and
credential completes the operation. A different ID is refused. Malformed or
corrupted Protected Storage fails closed; automatic destructive repair is
intentionally not provided. Recovery from corrupted identity storage, HUK
loss, or a wrong write-once ID requires a separately approved physical
recovery procedure and new credential association; that recovery has not
been demonstrated. Because PSA storage keys derive from the hardware key
material held in the KMU, losing that material makes the existing objects
unreadable; do not assume that restoring only the firmware can recover them.

The existing Admin/backend credential recovery and rotation lifecycle is
separate from initial PSA provisioning. The current service-mode tool only
provisions an unprovisioned identity; it does not rotate a field Device's
credential. Do not recover/activate a credential or change a production
verifier as part of OTA delivery without a separately authorized cutover.
OTA replacement/rollback preserves whichever PSA credential was active
before the update.

The current repository Admin UI exposes credential recovery from the exact
Device row in the fleet list for an eligible `in_inventory` Device. Confirm
the permanent `FRB-XXXX` ID and state before choosing the explicitly labeled
recovery action. The backend independently enforces global-Admin
authorization and inventory eligibility; the action targets the existing
`devices/{FRB-XXXX}` record and does not allocate another Device. If the
credential is missing, the backend issues one on that record; if a verifier
already exists, the Admin operation uses the established prepare/activate
credential lifecycle. In the latter case the old credential remains active
until the activation transaction commits, after which it no longer
authenticates. The replacement plaintext is returned once. This is not a
general rotation action for an assigned field Device; use the separately
authorized cutover procedure below.

The Admin UI does not expose the prepared-rotation status/cancellation
controls or expose the operation ID used internally by the combined
recovery call. If a recovery response is lost or reports failure, do not
assume whether activation committed and do not repeat device creation.
Through the authenticated global-Admin API, query
`GET /api/v1/admin/devices/{deviceId}/credential-rotations`. While a
rotation lock remains, this returns the pending operation ID; use that ID
with the redacted status route. If the operation is still `prepared`,
cancellation through the authorized cancel route preserves the old active
credential; then start a newly authorized recovery. If the pending-operation
route returns no pending operation, that alone does not establish whether an
activation committed: it cannot discover a completed operation ID. A caller
that retained an operation ID from the separate prepare workflow can query
its status. If activation committed but the one-time response was lost, the
old credential is invalid and the plaintext cannot be retrieved; keep the
device offline and obtain an authorized replacement and matching firmware
recovery plan. This is a material limitation of the combined recovery UI
workflow; the status/cancellation API controls are not available in the UI.

The deployment record establishes the Admin backend on revision
`fairway-admin-00017-dvk`, but does not establish that the current repository
Admin UI is present in production Hosting. Verify the deployed UI before
relying on it operationally.

The provisioning CLI uses Application Default Credentials and has no
`adminUid` input. Its `--issue-credential-for` path can issue a credential
when the exact in-inventory Device has no active credential; when an active
verifier exists, the rotation lifecycle requires an authenticated Admin UID
and the CLI path fails. The required production IAM permissions for this CLI
were not verified. Do not infer CLI authorization from local success or use it
for an active-credential rotation.

### Interrupted provisioning response

The established create API has no request idempotency key, operation journal,
or automatic duplicate prevention. A response timeout does not establish
whether the backend created a Device. Do not repeat the create request or
automatically delete a possibly created record. First inspect the authoritative
Admin fleet registry and identify candidate new `in_inventory` records using
their permanent IDs and backend creation details. If an exact match is found,
recover the credential on that Device through the Admin UI; do not allocate a
replacement Device. If the registry cannot conclusively associate a record
with the interrupted request, disclose the uncertainty and obtain
administrator/CPO direction before another allocation. Do not claim that a
particular request succeeded or failed without evidence.

## Authentication contract

- Each Device has one active, unique 256-bit cryptographically random credential, base64url encoded for the existing `X-Fairway-Device-Key` header.
- Firmware obtains identity and credential from one local, gitignored header, preventing separately hardcoded identity/credential values.
- The receiver looks up the exact claimed Device ID and verifies the credential against that Device's stored SHA-256 verifier using constant-time comparison. There is no fleet-wide shared-key fallback.
- Unknown, retired, missing-state, malformed-state, or unknown-state records are denied according to the fail-closed lifecycle policy.
- Command poll and acknowledgement routes apply the same device identity, state, and credential checks and correlate COMPLETE to the exact device and request.
- Credential replacement keeps the permanent Device ID but replaces the active verifier. The prepared lifecycle operations are deployed on the Admin service; their use for FRB-0003 remains gated by separate authorization and the controlled cutover procedure below. Routine rotation policy and revocation remain deferred. See `docs/DEPLOYMENT_GUIDE.md` and `docs/feature_backlog.md`.

Never put plaintext credentials, complete device-specific provisioning records, or SIM secrets in source control, reports, or canonical documentation.

## Identity and operational-data continuity contract

This section defines the protected backend data boundary for provisioning,
credential changes, and future firmware transitions. The Firestore Device
document remains the only authoritative device identity and assignment
record. Provisioning requests do not have automatic idempotency or replay
protection.

### Authoritative owners and permitted mutations

| Data | Authoritative owner | Permitted changes |
|---|---|---|
| Customer identity and account fields | `customers/{customerId}`, through the authenticated Admin customer service | Customer name/comments may be edited. Customer identity and records are not deleted or recreated by provisioning or firmware operations. |
| Course identity and Customer relationship | `customers/{customerId}/courses/{courseId}`, through the authenticated Admin course service | Course name, timezone, service schedule, and comments may be edited. Parent path owns the Customer relationship; provisioning and firmware operations do not change it. |
| Permanent device identity | `devices/{FRB-XXXX}` document ID, allocated by the backend | The ID is permanent. A Device record is not deleted/recreated or renamed by credential or firmware operations. Retired records remain. |
| Device assignment and lifecycle | Fields on that same Device record; `updateDeviceAssignment` and `updateDeviceState` | Authorized Admin workflows may assign/reassign a Course within its Customer, move a device through inventory (which clears assignment), and change lifecycle state. Cross-Customer transfer is not supported by the current service. |
| Device credential and generation | `credential` verifier and `credential_generation` on that Device; `credential_lifecycle.js` | Authorized credential lifecycle operations replace only credential material, generation, and update timestamp. Legacy missing generation means generation zero. |
| User identity and permissions | Firebase Authentication owns user identity; `user_access/{uid}` owns Fairway roles and Customer/Course access | The authenticated Admin User Management workflow may change access. Device provisioning, authentication, credential rotation, and firmware reporting do not write user accounts or permissions. |
| Golfer requests and outcomes | Top-level `requests/{requestId}`, created by authenticated device-event handling and updated by authorized operator actions | A new event creates a request snapshot. Authorized CONFIRM, COMPLETE, or CANCEL actions may update its operational outcome and timestamps; provisioning and firmware transitions do not edit or delete request history. |
| Inventory and service operation | Course-scoped inventory products/categories/state and `inventory_events`; Course `service_events` | Authorized inventory workflows may change current product/menu/inventory state and record operational events. Existing archive/delete rules remain in force. Service suspension/resumption records service events. Provisioning and firmware transitions do not change inventory or service history. |
| Reporting history and timestamps | Request event-time fields, request outcome timestamps, and service/inventory event records | These records retain their original device/customer/course and event context. A current Device reassignment or credential-generation change does not rewrite a past event. Reports continue to use their existing source records and semantics. |

Customer/Course name edits may synchronize display-name copies on current
Device records. That does not rewrite the event-time `course_name` or other
context stored on historical requests. Assignment changes affect current
registry state only; an inventory transition clears the current assignment,
not the history already recorded against it.

### Transition invariants

- Firmware installation/version reporting and credential issuance, recovery,
  or rotation must keep the same Firestore Device document ID.
- Those operations must not write Customer/Course assignment, lifecycle
  state, location, user access, request history, inventory, or service events.
- Authentication resolves the claimed Device ID to that exact registry
  document, validates only that Device's active verifier, and derives
  Customer/Course attribution from authoritative backend records. Device
  payload assignment claims are not authoritative; the accepted raw payload
  may be retained for diagnostics, but it does not supply the request's
  top-level attribution.
- Credential generation is separate from firmware generation. Advancing or
  migrating credential storage must not require rewriting historical requests.
  Future credential-storage generations must preserve the stable Device ID
  and explicitly retain compatible legacy authentication or use an
  authorized, recoverable cutover. The current common signed image uses
  TF-M PSA Protected Storage for Device ID, credential, and OTA schedule state;
  no value is embedded per device in the image.
- The Admin device-provisioning POST retains the established request contract;
  it does not require an `Idempotency-Key` and does not provide automatic
  duplicate prevention, replay tracking, or credential retrieval on retry.
  If a response is uncertain, an administrator must inspect the authoritative
  Device registry before making another provisioning request. If the Device
  exists, use its exact permanent ID in the Admin UI and recover the
  credential on that existing in-inventory record. Recovery replaces any
  active credential and returns the replacement once; it does not allocate a
  Device or change its identity, assignment, or operational history.
  Provisioning failure messages must distinguish confirmed partial creation
  from an uncertain create outcome and must not claim certainty the backend
  cannot establish.
- The OTA device endpoints and Admin release/assignment APIs were deployed
  on 2026-11-09 with an empty governed release catalog. No production
  publication, device assignment or capability-record write occurred. They
  authenticate and correlate to the existing permanent Device ID, and only
  update OTA-owned metadata. They do not accept device-supplied reassignment,
  create a new Device, or mutate historical operational records.
- No destructive customer/course/device/user migration is authorized as part
  of firmware or credential transitions.

### Evidence required before a field firmware transition

Before any authorized field update, verify the target Device ID against its
registry record and preserve a before/after record of its Customer/Course,
location, lifecycle state, credential generation/state, SIM association, and
other required operational fields. Confirm that existing and historical
request/report records remain associated with their original Device and
event-time context, and that no Customer/Course, user-access, inventory, or
service-history record was changed by the update operation. Verify
authentication using the intended credential lifecycle state and verify
normal request attribution afterward. A firmware version label or successful
boot alone is not evidence of data/identity continuity.

This evidence is a prerequisite for a separately authorized field transition;
it does not authorize credential changes, firmware builds, flashing, or
deployment. Physical build/flash procedures remain owned by
`docs/DEPLOYMENT_GUIDE.md`.

### Device-Specific Firmware Provisioning — Increment 2

`scripts/build_device_firmware.py` is the canonical local build entry point for a device-specific firmware image. It accepts an explicit target Device ID and the approved secrets directory; it does not call the backend, generate or activate credentials, or flash a device.

- The standard input is exactly `FRB-XXXX-fairway_device_key.h` in the selected secrets directory. Both `FAIRWAY_DEVICE_ID` and `FAIRWAY_DEVICE_KEY` must appear exactly once. The ID must equal the requested target; the credential must be a canonical 32-byte base64url token (43 characters), not a placeholder.
- No generic header is selected implicitly. For a retained legacy `fairway_device_key.h`, an operator may pass its absolute path using `--input-file`; the input must be directly inside the approved secrets directory, must declare the requested ID, and is rejected if the matching named header also exists.
- The secrets directory must be absolute and not group/world-writable. The input header must be a regular non-symlink file with no group/other permissions (normally mode `0600`). The repository `.gitignore` excludes the generic local key and every `*-fairway_device_key.h`; the tracked `fairway_device_key.example.h` remains a placeholder template.
- The builder uses the installed NCS 3.1.1 and matching Nordic toolchain, the canonical board target, `BOARD_ROOT`, `prj_a.conf`, existing MCUboot/TF-M sysbuild, and the deployment guide's established build options. It refuses an existing output directory and writes outside the source checkout and secrets directory.
- Development devices may use the established Nordic development signing configuration for firmware development, recovery, and validation. Development signing does not constitute production security qualification, and development-signed images must not be treated as commercial production releases.
- The OTA release builder requires an explicit, owner-only signing key and verifies its fingerprint against the generated MCUboot public trust anchor. Commissioning requires the CPO-controlled Fairway production key; disposable test keys validate the build path only. The private key must remain outside the checkout and artifacts; the manifest contains only the public-key fingerprint and redacted key paths. CPO-owned key generation, encrypted offline backup, signing, and loss recovery are documented in `docs/DEPLOYMENT_GUIDE.md`.
- The NCS-distributed `root-ec-p256.pem` debug key is documented by MCUboot as insecure and is not acceptable for commercial production. Existing images signed by it are not commissioning candidates. Artifact verification does not establish physical bootloader compatibility; the matching public trust anchor must be installed and verified during the authorized USB baseline flash.
- Flashing any physical device requires explicit CPO authorization for the target device and operation, in addition to successful device-specific artifact verification. Development signing does not waive this authorization requirement.
- The protected output directory is mode `0700`; output files are restricted to owner access. During the build it temporarily contains generated provisioning headers, ELF files, and intermediates; after successful verification, the workflow removes the intermediate build tree and retains only the merged firmware image, manifest, and checksum. Treat all retained output as credential-bearing and do not commit or broadly distribute it. A failed build can leave a protected partial build directory; do not distribute it.
- `scripts/verify_device_artifact.py` verifies the manifest, artifact size and SHA-256, expected build metadata, Intel HEX checksums, and the presence of both the target Device ID and selected credential in the actual merged HEX image. When the manifest includes an OTA image, pass the installed NCS 3.1.1 directory with `--ncs-install-dir`; verification also requires NCS `imgtool` and explicitly verifies the exact OTA file with the signing key derived from the generated application and MCUboot configurations. Those configurations must resolve to the same key. The manifest distinguishes the CPO-accepted firmware source baseline from the actual current repository commit/branch/dirty state, and records a firmware-source fingerprint, toolchain, command, artifact hash and size, and selected input filename. It never records the credential or its digest.
- A successful signature check proves only that the image signature matches the configured verification key. Verification with Nordic's distributed development key is not production authorization or qualification; commercial production still requires the approved production key and matching bootloader trust anchor described above.
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
record was changed. The current repository Admin UI includes an
in-inventory, exact-Device credential-recovery action, but it does not expose
the complete prepare/flash/activate rotation lifecycle or pending-operation
status and cancellation controls. The 2026-10-17 production release record is
for the Admin backend; it did not establish that this UI was deployed.
The 2026-11-09 OTA Administration Hosting release includes this exact-Device
recovery UI with its existing protections; no recovery or rotation was
performed during deployment. Exact release identities and evidence are
owned by `docs/DEPLOYMENT_GUIDE.md`.
There is no expiry/automatic cleanup policy, general revocation operation,
second-person approval, or production cutover authorization in this
increment. The immediate recovery action and the prepared two-phase rotation
are distinct: the former replaces the active verifier at once and is for an
eligible in-inventory Device; the latter leaves the old verifier active until
explicit activation for an authorized firmware transition. Production
rotation still requires the separately authorized firmware preparation,
physical maintenance, activation, flashing, and end-to-end validation
procedure. Do not invoke prepare, activate, or cancel against production
until that cutover is explicitly approved and the replacement
firmware/input is secured.

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
