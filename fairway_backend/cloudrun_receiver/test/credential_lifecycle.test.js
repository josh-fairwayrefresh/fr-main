'use strict';

const assert = require('assert');
const { FakeFirestore } = require('./fake_firestore');
const {
  deriveCredentialVerifier,
} = require('../lib/fleet/credentials');
const {
  getDeviceForAuthentication,
  authenticateDeviceCredential,
  replaceDeviceCredential,
} = require('../lib/fleet/devices');
const {
  CredentialLifecycleError,
  prepareCredentialRotation,
  activateCredentialRotation,
  cancelCredentialRotation,
  getCredentialRotationStatus,
  getPendingCredentialRotationStatus,
  ROTATIONS_COLLECTION,
  ROTATION_SECRETS_COLLECTION,
  ROTATION_LOCKS_COLLECTION,
} = require('../lib/fleet/credential_lifecycle');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push({ name, fn });
}

async function seedDevice(db, deviceId, credential, overrides = {}) {
  await db.collection('devices').doc(deviceId).set({
    state: 'deployed',
    customer_id: 'CUST-0001',
    customer_name: 'Test Customer',
    course_id: 'COURSE-0001',
    course_name: 'Test Course',
    location: { type: 'hole', hole: 3 },
    sim_iccid: 'test-sim-association',
    credential: deriveCredentialVerifier(credential),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

async function prepare(db, deviceId, adminUid = 'admin-uid') {
  return prepareCredentialRotation(db, {
    deviceId,
    adminUid,
    reason: 'Authorized maintenance rotation',
  });
}

async function expectLifecycleError(promise, code) {
  await assert.rejects(promise, (error) => (
    error instanceof CredentialLifecycleError && error.code === code
  ));
}

test('preparation preserves the active credential and pending material is not used for authentication', async () => {
  const db = new FakeFirestore();
  const oldCredential = 'old-test-credential';
  await seedDevice(db, 'FRB-0091', oldCredential);

  const result = await prepare(db, 'FRB-0091');
  const authDevice = await getDeviceForAuthentication(db, 'FRB-0091');
  assert.strictEqual(authenticateDeviceCredential(authDevice, oldCredential), true);
  assert.strictEqual(authenticateDeviceCredential(authDevice, result.plaintext_credential), false);
  assert.strictEqual(result.state, 'prepared');
  assert.match(result.operation_id, /^[0-9a-f-]{36}$/i);

  const rotation = await db.collection(ROTATIONS_COLLECTION).doc(result.operation_id).get();
  assert.strictEqual(rotation.data().initiated_by, 'admin-uid');
  assert.strictEqual(rotation.data().reason, 'Authorized maintenance rotation');
  assert.strictEqual(JSON.stringify(rotation.data()).includes(result.plaintext_credential), false);
  const secret = await db.collection(ROTATION_SECRETS_COLLECTION).doc(result.operation_id).get();
  assert.strictEqual(secret.data().pending_verifier.algorithm, 'sha256');
  assert.strictEqual(JSON.stringify(rotation.data()).includes(secret.data().pending_verifier.digest), false);

  const status = await getCredentialRotationStatus(db, {
    deviceId: 'FRB-0091',
    operationId: result.operation_id,
  });
  assert.strictEqual(status.can_activate, true);
  assert.strictEqual(status.can_cancel, true);
  assert.strictEqual(JSON.stringify(status).includes(result.plaintext_credential), false);
  assert.strictEqual(JSON.stringify(status).includes(secret.data().pending_verifier.digest), false);
});

test('activation atomically switches credentials while preserving device identity and registry fields', async () => {
  const db = new FakeFirestore();
  const oldCredential = 'old-credential-for-activation';
  const unrelatedCredential = 'unrelated-device-credential';
  await seedDevice(db, 'FRB-0091', oldCredential);
  await seedDevice(db, 'FRB-0092', unrelatedCredential, {
    state: 'maintenance',
    sim_iccid: 'unrelated-sim',
  });
  const beforeOther = (await db.collection('devices').doc('FRB-0092').get()).data();
  const prepared = await prepare(db, 'FRB-0091');

  const activated = await activateCredentialRotation(db, {
    deviceId: 'FRB-0091',
    operationId: prepared.operation_id,
    adminUid: 'approver-uid',
    confirmed: true,
  });
  assert.strictEqual(activated.state, 'activated');
  assert.strictEqual(activated.activated_by, 'approver-uid');
  assert.strictEqual(activated.can_activate, false);
  assert.strictEqual(activated.can_cancel, false);
  assert.strictEqual(activated.already_activated, false);

  const deviceSnap = await db.collection('devices').doc('FRB-0091').get();
  const device = deviceSnap.data();
  const authDevice = await getDeviceForAuthentication(db, 'FRB-0091');
  assert.strictEqual(deviceSnap.id, 'FRB-0091');
  assert.strictEqual(device.credential_generation, 1);
  assert.strictEqual(authenticateDeviceCredential(authDevice, oldCredential), false);
  assert.strictEqual(authenticateDeviceCredential(authDevice, prepared.plaintext_credential), true);
  assert.deepStrictEqual(device.sim_iccid, 'test-sim-association');
  assert.deepStrictEqual(device.state, 'deployed');
  assert.deepStrictEqual(device.customer_id, 'CUST-0001');
  assert.deepStrictEqual(device.course_id, 'COURSE-0001');
  assert.deepStrictEqual(device.location, { type: 'hole', hole: 3 });

  const afterOther = (await db.collection('devices').doc('FRB-0092').get()).data();
  assert.deepStrictEqual(afterOther, beforeOther);

  const rotation = await db.collection(ROTATIONS_COLLECTION).doc(prepared.operation_id).get();
  assert.strictEqual(rotation.data().state, 'activated');
  assert.strictEqual((await db.collection(ROTATION_SECRETS_COLLECTION).doc(prepared.operation_id).get()).exists, false);
  assert.strictEqual(JSON.stringify(activated).includes(device.credential.digest), false);
});

test('activation requires exact target, explicit confirmation, and an active matching preparation', async () => {
  const db = new FakeFirestore();
  await seedDevice(db, 'FRB-0091', 'target-credential');
  await seedDevice(db, 'FRB-0092', 'other-credential');
  const prepared = await prepare(db, 'FRB-0091');

  await expectLifecycleError(activateCredentialRotation(db, {
    deviceId: 'FRB-0091',
    operationId: prepared.operation_id,
    adminUid: 'admin-uid',
    confirmed: false,
  }), 'cutover_confirmation_required');
  await expectLifecycleError(activateCredentialRotation(db, {
    deviceId: 'FRB-0092',
    operationId: prepared.operation_id,
    adminUid: 'admin-uid',
    confirmed: true,
  }), 'rotation_not_found');

  await replaceDeviceCredential(db, 'FRB-0091');
  await expectLifecycleError(activateCredentialRotation(db, {
    deviceId: 'FRB-0091',
    operationId: prepared.operation_id,
    adminUid: 'admin-uid',
    confirmed: true,
  }), 'stale_rotation');
  const status = await getCredentialRotationStatus(db, {
    deviceId: 'FRB-0091',
    operationId: prepared.operation_id,
  });
  assert.strictEqual(status.can_activate, false);
  assert.strictEqual(status.can_cancel, true);
});

test('concurrent preparations produce one pending operation and never redisclose a credential', async () => {
  const db = new FakeFirestore();
  await seedDevice(db, 'FRB-0091', 'concurrent-prepare-credential');

  const results = await Promise.allSettled([
    prepare(db, 'FRB-0091'),
    prepare(db, 'FRB-0091'),
  ]);
  const successes = results.filter((result) => result.status === 'fulfilled');
  const failures = results.filter((result) => result.status === 'rejected');
  assert.strictEqual(successes.length, 1);
  assert.strictEqual(failures.length, 1);
  assert.strictEqual(failures[0].reason.code, 'rotation_in_progress');
  const operations = await db.collection(ROTATIONS_COLLECTION).get();
  const secrets = await db.collection(ROTATION_SECRETS_COLLECTION).get();
  const locks = await db.collection(ROTATION_LOCKS_COLLECTION).get();
  assert.strictEqual(operations.size, 1);
  assert.strictEqual(secrets.size, 1);
  assert.strictEqual(locks.size, 1);

  await expectLifecycleError(prepare(db, 'FRB-0091'), 'rotation_in_progress');
});

test('concurrent and repeated activation are idempotent without restoring the old credential', async () => {
  const db = new FakeFirestore();
  const oldCredential = 'old-credential-concurrent-activation';
  await seedDevice(db, 'FRB-0091', oldCredential);
  const prepared = await prepare(db, 'FRB-0091');
  const activate = () => activateCredentialRotation(db, {
    deviceId: 'FRB-0091',
    operationId: prepared.operation_id,
    adminUid: 'admin-uid',
    confirmed: true,
  });

  const outcomes = await Promise.all([activate(), activate()]);
  assert.deepStrictEqual(outcomes.map((outcome) => outcome.state), ['activated', 'activated']);
  assert.deepStrictEqual(outcomes.map((outcome) => outcome.already_activated).sort(), [false, true]);
  const authDevice = await getDeviceForAuthentication(db, 'FRB-0091');
  assert.strictEqual(authenticateDeviceCredential(authDevice, oldCredential), false);
  assert.strictEqual(authenticateDeviceCredential(authDevice, prepared.plaintext_credential), true);
});

test('cancellation preserves the active credential and prevents activation', async () => {
  const db = new FakeFirestore();
  const oldCredential = 'active-credential-cancellation';
  await seedDevice(db, 'FRB-0091', oldCredential);
  const prepared = await prepare(db, 'FRB-0091');

  const cancelled = await cancelCredentialRotation(db, {
    deviceId: 'FRB-0091',
    operationId: prepared.operation_id,
    adminUid: 'admin-uid',
  });
  assert.strictEqual(cancelled.state, 'cancelled');
  assert.strictEqual(cancelled.can_activate, false);
  assert.strictEqual(cancelled.can_cancel, false);
  const repeated = await cancelCredentialRotation(db, {
    deviceId: 'FRB-0091',
    operationId: prepared.operation_id,
    adminUid: 'admin-uid',
  });
  assert.strictEqual(repeated.state, 'cancelled');

  const authDevice = await getDeviceForAuthentication(db, 'FRB-0091');
  assert.strictEqual(authenticateDeviceCredential(authDevice, oldCredential), true);
  assert.strictEqual(authenticateDeviceCredential(authDevice, prepared.plaintext_credential), false);
  assert.strictEqual((await db.collection(ROTATION_SECRETS_COLLECTION).doc(prepared.operation_id).get()).exists, false);
  await expectLifecycleError(activateCredentialRotation(db, {
    deviceId: 'FRB-0091',
    operationId: prepared.operation_id,
    adminUid: 'admin-uid',
    confirmed: true,
  }), 'rotation_not_pending');
});

test('lost preparation response can only be recovered by cancelling and preparing a new credential', async () => {
  const db = new FakeFirestore();
  await seedDevice(db, 'FRB-0091', 'lost-response-active-credential');
  const first = await prepare(db, 'FRB-0091');
  await expectLifecycleError(prepare(db, 'FRB-0091'), 'rotation_in_progress');
  const status = await getPendingCredentialRotationStatus(db, 'FRB-0091');
  assert.strictEqual(status.operation_id, first.operation_id);
  assert.strictEqual(status.plaintext_credential, undefined);
  assert.strictEqual(status.pending_verifier, undefined);
  const rotation = await db.collection(ROTATIONS_COLLECTION).doc(first.operation_id).get();
  assert.strictEqual(rotation.data().pending_verifier, undefined);

  await cancelCredentialRotation(db, {
    deviceId: 'FRB-0091',
    operationId: first.operation_id,
    adminUid: 'admin-uid',
  });
  const second = await prepare(db, 'FRB-0091');
  assert.notStrictEqual(second.operation_id, first.operation_id);
  assert.notStrictEqual(second.plaintext_credential, first.plaintext_credential);
});

test('failed preparation transaction leaves no partial operation or lock', async () => {
  const db = new FakeFirestore();
  await seedDevice(db, 'FRB-0091', 'transaction-failure-credential');
  db.failNextTransactionCommit = true;

  await assert.rejects(prepare(db, 'FRB-0091'), /Simulated transaction commit failure/);
  assert.strictEqual((await db.collection(ROTATIONS_COLLECTION).get()).size, 0);
  assert.strictEqual((await db.collection(ROTATION_LOCKS_COLLECTION).get()).size, 0);
});

test('failed activation transaction leaves the prepared credential inactive and retryable', async () => {
  const db = new FakeFirestore();
  const oldCredential = 'active-before-failed-activation';
  await seedDevice(db, 'FRB-0091', oldCredential);
  const prepared = await prepare(db, 'FRB-0091');
  db.failNextTransactionCommit = true;

  await assert.rejects(activateCredentialRotation(db, {
    deviceId: 'FRB-0091',
    operationId: prepared.operation_id,
    adminUid: 'admin-uid',
    confirmed: true,
  }), /Simulated transaction commit failure/);
  const authDevice = await getDeviceForAuthentication(db, 'FRB-0091');
  assert.strictEqual(authenticateDeviceCredential(authDevice, oldCredential), true);
  assert.strictEqual(authenticateDeviceCredential(authDevice, prepared.plaintext_credential), false);
  const status = await getCredentialRotationStatus(db, {
    deviceId: 'FRB-0091',
    operationId: prepared.operation_id,
  });
  assert.strictEqual(status.state, 'prepared');
  assert.strictEqual(status.can_activate, true);
});

test('credential lifecycle operations do not write plaintext or verifiers to logs', async () => {
  const db = new FakeFirestore();
  await seedDevice(db, 'FRB-0091', 'log-boundary-active-credential');
  const captured = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  let prepared;
  let pendingVerifier;
  console.log = (...args) => captured.push(args.join(' '));
  console.warn = (...args) => captured.push(args.join(' '));
  console.error = (...args) => captured.push(args.join(' '));
  try {
    prepared = await prepare(db, 'FRB-0091');
    pendingVerifier = (await db.collection(ROTATION_SECRETS_COLLECTION)
      .doc(prepared.operation_id).get()).data().pending_verifier;
    await getPendingCredentialRotationStatus(db, 'FRB-0091');
    await cancelCredentialRotation(db, {
      deviceId: 'FRB-0091',
      operationId: prepared.operation_id,
      adminUid: 'admin-uid',
    });
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  const logOutput = captured.join('\n');
  assert.strictEqual(logOutput.includes(prepared.plaintext_credential), false);
  assert.strictEqual(logOutput.includes(pendingVerifier.digest), false);
});

test('ineligible or missing devices cannot be rotated', async () => {
  const db = new FakeFirestore();
  await seedDevice(db, 'FRB-0091', 'retired-device-credential', { state: 'retired' });
  await expectLifecycleError(prepare(db, 'FRB-0091'), 'device_not_eligible');
  await expectLifecycleError(prepare(db, 'FRB-0092'), 'device_not_found');
  await seedDevice(db, 'FRB-0093', 'unused', { credential: null });
  await expectLifecycleError(prepare(db, 'FRB-0093'), 'active_credential_required');
  await expectLifecycleError(prepareCredentialRotation(db, {
    deviceId: 'FRB-0093',
    adminUid: 'admin-uid',
    reason: 'A'.repeat(43),
  }), 'invalid_reason');
});

async function run() {
  for (const { name, fn } of pending) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${name}`);
      console.error(error);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
