'use strict';

const { randomUUID } = require('crypto');
const {
  generateDeviceCredential,
  VERIFIER_ALGORITHM,
} = require('./credentials');
const {
  DEVICES_COLLECTION,
} = require('./devices');
const { isDeviceCommunicationAllowed } = require('./schema');

const ROTATIONS_COLLECTION = 'device_credential_rotations';
const ROTATION_SECRETS_COLLECTION = 'device_credential_rotation_secrets';
const ROTATION_LOCKS_COLLECTION = 'device_credential_rotation_locks';
const DEVICE_ID_RE = /^FRB-[0-9]{4}$/;
const OPERATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_LIKE_REASON_RE = /(?:^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?:$|[^A-Za-z0-9_-])|(?:^|[^A-Fa-f0-9])[A-Fa-f0-9]{64}(?:$|[^A-Fa-f0-9])/;
const MAX_REASON_LENGTH = 500;

class CredentialLifecycleError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'CredentialLifecycleError';
    this.code = code;
    this.status = status;
  }
}

function requireDeviceId(deviceId) {
  if (typeof deviceId !== 'string' || !DEVICE_ID_RE.test(deviceId)) {
    throw new CredentialLifecycleError(
      'invalid_device_id',
      'A valid Device ID is required.',
      400
    );
  }
}

function requireOperationId(operationId) {
  if (typeof operationId !== 'string' || !OPERATION_ID_RE.test(operationId)) {
    throw new CredentialLifecycleError(
      'invalid_operation_id',
      'A valid credential rotation operation ID is required.',
      400
    );
  }
}

function requireAdminUid(adminUid) {
  if (typeof adminUid !== 'string' || !adminUid.trim()) {
    throw new CredentialLifecycleError(
      'admin_identity_required',
      'An authorized administrator identity is required.',
      401
    );
  }
}

function credentialGeneration(device) {
  const generation = device.credential_generation ?? 0;
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new CredentialLifecycleError(
      'invalid_credential_generation',
      'The Device credential state is invalid.',
      409
    );
  }
  return generation;
}

function hasActiveVerifier(credential) {
  return credential
    && credential.algorithm === VERIFIER_ALGORITHM
    && typeof credential.digest === 'string'
    && /^[0-9a-f]{64}$/i.test(credential.digest);
}

function requireEligibleDevice(deviceSnap) {
  if (!deviceSnap.exists) {
    throw new CredentialLifecycleError('device_not_found', 'Device not found.', 404);
  }
  const device = deviceSnap.data();
  if (!isDeviceCommunicationAllowed(device.state)) {
    throw new CredentialLifecycleError(
      'device_not_eligible',
      'This Device is not eligible for credential rotation.',
      409
    );
  }
  if (!hasActiveVerifier(device.credential)) {
    throw new CredentialLifecycleError(
      'active_credential_required',
      'This Device has no valid active credential; use the missing-only recovery workflow.',
      409
    );
  }
  return device;
}

function publicOperation(operationId, rotation, device, lock) {
  const prepared = rotation.state === 'prepared';
  const generationMatches = device
    && credentialGeneration(device) === rotation.expected_credential_generation;
  const activationEligible = prepared
    && lock?.operation_id === operationId
    && generationMatches
    && isDeviceCommunicationAllowed(device.state)
    && hasActiveVerifier(device.credential);

  return {
    device_id: rotation.device_id,
    operation_id: operationId,
    state: rotation.state,
    reason: rotation.reason,
    initiated_by: rotation.initiated_by,
    prepared_at: rotation.prepared_at,
    cancelled_by: rotation.cancelled_by ?? null,
    cancelled_at: rotation.cancelled_at ?? null,
    activated_by: rotation.activated_by ?? null,
    activated_at: rotation.activated_at ?? null,
    can_activate: Boolean(activationEligible),
    can_cancel: prepared,
  };
}

async function prepareCredentialRotation(db, {
  deviceId,
  adminUid,
  reason,
}) {
  requireDeviceId(deviceId);
  requireAdminUid(adminUid);
  if (
    typeof reason !== 'string'
    || !reason.trim()
    || reason.trim().length > MAX_REASON_LENGTH
    || SECRET_LIKE_REASON_RE.test(reason)
  ) {
    throw new CredentialLifecycleError(
      'invalid_reason',
      `A rotation reason of 1-${MAX_REASON_LENGTH} characters is required and must not contain credential-like material.`,
      400
    );
  }

  const operationId = randomUUID();
  const { secret, verifier } = generateDeviceCredential();
  const deviceRef = db.collection(DEVICES_COLLECTION).doc(deviceId);
  const lockRef = db.collection(ROTATION_LOCKS_COLLECTION).doc(deviceId);
  const rotationRef = db.collection(ROTATIONS_COLLECTION).doc(operationId);
  const secretRef = db.collection(ROTATION_SECRETS_COLLECTION).doc(operationId);
  const preparedAt = new Date();

  await db.runTransaction(async (transaction) => {
    const [deviceSnap, lockSnap, rotationSnap, secretSnap] = await Promise.all([
      transaction.get(deviceRef),
      transaction.get(lockRef),
      transaction.get(rotationRef),
      transaction.get(secretRef),
    ]);
    const device = requireEligibleDevice(deviceSnap);
    if (lockSnap.exists) {
      throw new CredentialLifecycleError(
        'rotation_in_progress',
        'A credential rotation is already pending for this Device.',
        409
      );
    }
    if (rotationSnap.exists || secretSnap.exists) {
      throw new CredentialLifecycleError(
        'operation_id_conflict',
        'Could not allocate a unique credential rotation operation.',
        409
      );
    }

    transaction.set(rotationRef, {
      device_id: deviceId,
      state: 'prepared',
      expected_credential_generation: credentialGeneration(device),
      reason: reason.trim(),
      initiated_by: adminUid,
      prepared_at: preparedAt,
      activated_by: null,
      activated_at: null,
      cancelled_by: null,
      cancelled_at: null,
    });
    transaction.set(secretRef, { pending_verifier: verifier });
    transaction.set(lockRef, { operation_id: operationId });
  });

  return {
    device_id: deviceId,
    operation_id: operationId,
    state: 'prepared',
    prepared_at: preparedAt,
    plaintext_credential: secret,
  };
}

async function getCredentialRotationStatus(db, { deviceId, operationId }) {
  requireDeviceId(deviceId);
  requireOperationId(operationId);
  const rotationRef = db.collection(ROTATIONS_COLLECTION).doc(operationId);
  const rotationSnap = await rotationRef.get();
  if (!rotationSnap.exists || rotationSnap.data().device_id !== deviceId) {
    throw new CredentialLifecycleError(
      'rotation_not_found',
      'Credential rotation operation not found for this Device.',
      404
    );
  }

  const rotation = rotationSnap.data();
  const [deviceSnap, lockSnap] = await Promise.all([
    db.collection(DEVICES_COLLECTION).doc(deviceId).get(),
    db.collection(ROTATION_LOCKS_COLLECTION).doc(deviceId).get(),
  ]);
  return publicOperation(
    operationId,
    rotation,
    deviceSnap.exists ? deviceSnap.data() : null,
    lockSnap.exists ? lockSnap.data() : null
  );
}

async function getPendingCredentialRotationStatus(db, deviceId) {
  requireDeviceId(deviceId);
  const lockSnap = await db.collection(ROTATION_LOCKS_COLLECTION).doc(deviceId).get();
  if (!lockSnap.exists) {
    throw new CredentialLifecycleError(
      'pending_rotation_not_found',
      'No pending credential rotation was found for this Device.',
      404
    );
  }
  return getCredentialRotationStatus(db, {
    deviceId,
    operationId: lockSnap.data().operation_id,
  });
}

async function activateCredentialRotation(db, {
  deviceId,
  operationId,
  adminUid,
  confirmed,
}) {
  requireDeviceId(deviceId);
  requireOperationId(operationId);
  requireAdminUid(adminUid);
  if (confirmed !== true) {
    throw new CredentialLifecycleError(
      'cutover_confirmation_required',
      'Explicit cutover confirmation is required.',
      400
    );
  }

  const deviceRef = db.collection(DEVICES_COLLECTION).doc(deviceId);
  const rotationRef = db.collection(ROTATIONS_COLLECTION).doc(operationId);
  const secretRef = db.collection(ROTATION_SECRETS_COLLECTION).doc(operationId);
  const lockRef = db.collection(ROTATION_LOCKS_COLLECTION).doc(deviceId);
  const activatedAt = new Date();
  let alreadyActivated = false;

  await db.runTransaction(async (transaction) => {
    alreadyActivated = false;
    const [deviceSnap, rotationSnap, lockSnap, secretSnap] = await Promise.all([
      transaction.get(deviceRef),
      transaction.get(rotationRef),
      transaction.get(lockRef),
      transaction.get(secretRef),
    ]);
    if (!rotationSnap.exists || rotationSnap.data().device_id !== deviceId) {
      throw new CredentialLifecycleError(
        'rotation_not_found',
        'Credential rotation operation not found for this Device.',
        404
      );
    }
    const rotation = rotationSnap.data();
    if (rotation.state === 'activated') {
      alreadyActivated = true;
      return;
    }
    if (rotation.state !== 'prepared') {
      throw new CredentialLifecycleError(
        'rotation_not_pending',
        'Only a prepared credential rotation can be activated.',
        409
      );
    }

    const device = requireEligibleDevice(deviceSnap);
    if (
      lockSnap.data()?.operation_id !== operationId
      || credentialGeneration(device) !== rotation.expected_credential_generation
    ) {
      throw new CredentialLifecycleError(
        'stale_rotation',
        'Credential rotation is stale and cannot be activated.',
        409
      );
    }
    const pendingVerifier = secretSnap.data()?.pending_verifier;
    if (!hasActiveVerifier(pendingVerifier)) {
      throw new CredentialLifecycleError(
        'invalid_pending_credential',
        'The prepared credential is unavailable.',
        409
      );
    }

    if (rotation.expected_credential_generation === Number.MAX_SAFE_INTEGER) {
      throw new CredentialLifecycleError(
        'invalid_credential_generation',
        'The Device credential generation cannot be advanced.',
        409
      );
    }
    const nextGeneration = rotation.expected_credential_generation + 1;
    transaction.update(deviceRef, {
      credential: {
        ...pendingVerifier,
        updated_at: activatedAt,
      },
      credential_generation: nextGeneration,
      updated_at: activatedAt,
    });
    transaction.update(rotationRef, {
      state: 'activated',
      activated_by: adminUid,
      activated_at: activatedAt,
    });
    transaction.delete(secretRef);
    transaction.delete(lockRef);
  });

  const status = await getCredentialRotationStatus(db, { deviceId, operationId });
  return { ...status, already_activated: alreadyActivated };
}

async function cancelCredentialRotation(db, {
  deviceId,
  operationId,
  adminUid,
}) {
  requireDeviceId(deviceId);
  requireOperationId(operationId);
  requireAdminUid(adminUid);

  const rotationRef = db.collection(ROTATIONS_COLLECTION).doc(operationId);
  const secretRef = db.collection(ROTATION_SECRETS_COLLECTION).doc(operationId);
  const lockRef = db.collection(ROTATION_LOCKS_COLLECTION).doc(deviceId);
  const cancelledAt = new Date();

  await db.runTransaction(async (transaction) => {
    const [rotationSnap, lockSnap, secretSnap] = await Promise.all([
      transaction.get(rotationRef),
      transaction.get(lockRef),
      transaction.get(secretRef),
    ]);
    if (!rotationSnap.exists || rotationSnap.data().device_id !== deviceId) {
      throw new CredentialLifecycleError(
        'rotation_not_found',
        'Credential rotation operation not found for this Device.',
        404
      );
    }
    const rotation = rotationSnap.data();
    if (rotation.state === 'cancelled') {
      return;
    }
    if (rotation.state !== 'prepared') {
      throw new CredentialLifecycleError(
        'rotation_not_pending',
        'Only a prepared credential rotation can be cancelled.',
        409
      );
    }

    transaction.update(rotationRef, {
      state: 'cancelled',
      cancelled_by: adminUid,
      cancelled_at: cancelledAt,
    });
    if (secretSnap.exists) {
      transaction.delete(secretRef);
    }
    if (lockSnap.data()?.operation_id === operationId) {
      transaction.delete(lockRef);
    }
  });

  return getCredentialRotationStatus(db, { deviceId, operationId });
}

module.exports = {
  CredentialLifecycleError,
  prepareCredentialRotation,
  activateCredentialRotation,
  cancelCredentialRotation,
  getCredentialRotationStatus,
  getPendingCredentialRotationStatus,
  ROTATIONS_COLLECTION,
  ROTATION_SECRETS_COLLECTION,
  ROTATION_LOCKS_COLLECTION,
};
