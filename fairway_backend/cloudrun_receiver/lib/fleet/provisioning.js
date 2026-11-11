'use strict';

const { DEVICE_STATES } = require('./schema');
const { createDevice, replaceDeviceCredential, issueDeviceCredentialIfMissing } = require('./devices');
const {
  prepareCredentialRotation,
  activateCredentialRotation,
} = require('./credential_lifecycle');

/*
 * Bounded provisioning-event error. Creation failures explicitly disclose
 * when Firestore's outcome is uncertain; failures after a confirmed create
 * identify the permanent Device ID that requires administrator inspection.
 */
class ProvisioningError extends Error {
  constructor(message, {
    code = 'device_provisioning_failed',
    deviceId = null,
    stage,
    status = deviceId ? 409 : 400,
    cause,
  } = {}) {
    super(message);
    this.name = 'ProvisioningError';
    this.code = code;
    this.deviceId = deviceId;
    this.stage = stage;
    this.status = status;
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
  simIccid = null,
  comments = null,
  state = DEVICE_STATES.IN_INVENTORY,
} = {}) {
  let deviceId;

  let device;
  try {
    device = await createDevice(db, {
      simIccid,
      comments,
      state,
    });
    deviceId = device.device_id;
  } catch (cause) {
    throw new ProvisioningError(
      'Device creation did not complete with a confirmed result. Inspect the authoritative Device registry before retrying; the backend cannot confirm whether a record was created.',
      {
        code: 'device_creation_outcome_uncertain',
        deviceId: null,
        stage: 'create_device',
        status: 409,
        cause,
      }
    );
  }

  let secret;
  try {
    ({ secret } = await replaceDeviceCredential(db, deviceId));
  } catch (cause) {
    // The device record now exists without a usable credential. Do not
    // create a second device; retry credential issuance for this exact
    // deviceId instead.
    throw new ProvisioningError(
      `Device ${deviceId} was created but credential issuance failed. Do not `
      + `create another Device. Locate this exact Device and use its credential recovery action.`,
      {
        code: 'credential_issue_failed',
        deviceId,
        stage: 'issue_credential',
        status: 409,
        cause,
      }
    );
  }
  return { deviceId, plaintextCredential: secret };
}

/*
 * Recovers a credential on an existing in-inventory Device. Missing
 * credentials use the established issuance primitive; active credentials
 * use the existing audited rotation lifecycle. This path never allocates a
 * Device or changes its assignment or operational history.
 */
async function issueCredentialForExistingDevice(db, deviceId, adminUid) {
  try {
    const deviceRef = db.collection('devices').doc(deviceId);
    const deviceSnap = await deviceRef.get();
    if (!deviceSnap.exists) {
      throw new Error(`Unknown device_id: ${deviceId}`);
    }
    if (deviceSnap.data().state !== DEVICE_STATES.IN_INVENTORY) {
      throw new Error('Credential recovery is only permitted for in-inventory devices');
    }

    if (!deviceSnap.data().credential) {
      const { secret } = await issueDeviceCredentialIfMissing(db, deviceId, {
        requireInInventory: true,
      });
      return { deviceId, plaintextCredential: secret };
    }

    const prepared = await prepareCredentialRotation(db, {
      deviceId,
      adminUid,
      reason: 'Provisioning credential recovery',
      requireInInventory: true,
    });
    await activateCredentialRotation(db, {
      deviceId,
      operationId: prepared.operation_id,
      adminUid,
      confirmed: true,
      requireInInventory: true,
    });
    const secret = prepared.plaintext_credential;
    return { deviceId, plaintextCredential: secret };
  } catch (cause) {
    throw new ProvisioningError(
      `Credential recovery failed for Device ${deviceId}: ${cause.message}`,
      {
        code: 'credential_issue_failed',
        deviceId,
        stage: 'issue_credential',
        status: 409,
        cause,
      }
    );
  }
}

module.exports = {
  ProvisioningError,
  provisionNewDevice,
  issueCredentialForExistingDevice,
};
