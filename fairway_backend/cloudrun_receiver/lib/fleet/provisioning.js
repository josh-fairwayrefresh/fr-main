'use strict';

const { DEVICE_STATES } = require('./schema');
const { createDevice, replaceDeviceCredential } = require('./devices');

/*
 * Canonical current firmware generation, from the Firmware Generation
 * Registry in docs/FIRMWARE_SPECIFICATION.md (source commit
 * fde1aade63ac62650709e7ea6aead6f817b71b58, "Validated production
 * generation"). This is the single owned source for the value written to
 * a new Device's `firmware_generation` field; update this constant only
 * when that Registry records a new validated generation.
 */
const CURRENT_FIRMWARE_GENERATION = 'Golfer-First (Bounded Request Architecture)';

/*
 * Bounded provisioning-event error. Always distinguishes whether a Device
 * record was already created in Firestore before the failure occurred, so a
 * caller never assumes provisioning failed cleanly when a device_id may
 * already exist and require a credential retry rather than a second device
 * creation.
 */
class ProvisioningError extends Error {
  constructor(message, { deviceId = null, stage, cause } = {}) {
    super(message);
    this.name = 'ProvisioningError';
    this.deviceId = deviceId;
    this.stage = stage;
    this.cause = cause;
  }
}

/*
 * Provisions exactly one new device end-to-end through the existing
 * canonical fleet primitives: allocates its permanent Device ID and creates
 * its Firestore record (createDevice), then issues its one-time plaintext
 * credential (replaceDeviceCredential). Duplicates no fleet business logic
 * from those functions; this is orchestration only.
 *
 * Does not transition device state beyond its initial value (deployment is a
 * separate, later commissioning step via updateDeviceState) and never logs
 * or persists the plaintext secret itself; it is returned to the caller
 * exactly once, exactly as replaceDeviceCredential() already returns it, for
 * immediate local use (e.g. writing the gitignored firmware provisioning
 * header).
 */
async function provisionNewDevice(db, {
  customerId,
  courseId,
  location,
  hardwareRevision = null,
  firmwareGeneration = CURRENT_FIRMWARE_GENERATION,
  simIccid = null,
  comments = null,
  state = DEVICE_STATES.IN_INVENTORY,
} = {}) {
  let deviceId;

  try {
    const device = await createDevice(db, {
      customerId,
      courseId,
      location,
      hardwareRevision,
      firmwareGeneration,
      simIccid,
      comments,
      state,
    });
    deviceId = device.device_id;
  } catch (cause) {
    // Nothing was created; safe to retry provisioning from scratch.
    throw new ProvisioningError(
      `Device creation failed; no device was created: ${cause.message}`,
      { deviceId: null, stage: 'create_device', cause }
    );
  }

  try {
    const { secret } = await replaceDeviceCredential(db, deviceId);
    return { deviceId, plaintextCredential: secret };
  } catch (cause) {
    // The device record now exists without a usable credential. Do not
    // create a second device; retry credential issuance for this exact
    // deviceId instead.
    throw new ProvisioningError(
      `Device ${deviceId} was created but credential issuance failed. Do not `
      + `re-run device creation for this event; retry replaceDeviceCredential(db, "${deviceId}") `
      + `for this exact device_id. Cause: ${cause.message}`,
      { deviceId, stage: 'issue_credential', cause }
    );
  }
}

/*
 * Executes the partial-provisioning recovery path: issues/replaces a
 * credential for a Device ID that already exists (for example after
 * provisionNewDevice() created the Device record but credential issuance
 * failed). Never calls createDevice(); calls only the existing, unmodified
 * replaceDeviceCredential() primitive, so no second Device can ever be
 * allocated by using this path. Duplicates no credential business logic.
 */
async function issueCredentialForExistingDevice(db, deviceId) {
  try {
    const { secret } = await replaceDeviceCredential(db, deviceId);
    return { deviceId, plaintextCredential: secret };
  } catch (cause) {
    throw new ProvisioningError(
      `Credential issuance failed for existing device ${deviceId}: ${cause.message}`,
      { deviceId, stage: 'issue_credential', cause }
    );
  }
}

module.exports = {
  CURRENT_FIRMWARE_GENERATION,
  ProvisioningError,
  provisionNewDevice,
  issueCredentialForExistingDevice,
};
