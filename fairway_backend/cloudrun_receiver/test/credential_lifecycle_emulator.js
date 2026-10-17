'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const { isDeepStrictEqual } = require('node:util');
const { Firestore } = require('@google-cloud/firestore');
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

const PROJECT_ID = 'demo-fairway-credential-lifecycle';
const EMULATOR_HOST = '127.0.0.1:8787';
const DEVICES_COLLECTION = 'devices';
const RETRY_TEST_TIMEOUT_MS = 15000;
const pendingTests = [];

function requireSafeEnvironment() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST must be the configured local loopback emulator');
  }

  const projectIds = [
    process.env.GCLOUD_PROJECT,
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.CLOUDSDK_CORE_PROJECT,
    process.env.FIREBASE_PROJECT,
  ].filter(Boolean);
  if (projectIds.some((projectId) => projectId !== PROJECT_ID)) {
    throw new Error('Cloud project environment does not match the synthetic emulator project');
  }
  if (!projectIds.length) {
    throw new Error('A synthetic Cloud project ID is required');
  }

  for (const name of [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_OAUTH_ACCESS_TOKEN',
    'CLOUDSDK_AUTH_ACCESS_TOKEN',
    'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
    'GCLOUD_SERVICE_KEY',
    'GOOGLE_CLOUD_KEYFILE_JSON',
    'FIREBASE_TOKEN',
  ]) {
    if (process.env[name]) {
      throw new Error(`Credential-bearing environment variable ${name} must be unset`);
    }
  }

  if (process.env.FIREBASE_CONFIG) {
    let config;
    try {
      config = JSON.parse(process.env.FIREBASE_CONFIG);
    } catch {
      throw new Error('FIREBASE_CONFIG must be valid emulator-injected JSON');
    }
    if (
      config.projectId !== PROJECT_ID
      || config.credential
      || config.serviceAccount
    ) {
      throw new Error('FIREBASE_CONFIG is not an isolated synthetic project configuration');
    }
  }
}

requireSafeEnvironment();

const db = new Firestore({ projectId: PROJECT_ID });
const emulatorBaseUrl = `http://${EMULATOR_HOST}`;

function test(name, run) {
  pendingTests.push({ name, run });
}

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeFirestoreValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        normalizeFirestoreValue(nested),
      ])
    );
  }
  return value;
}

async function clearEmulatorDatabase() {
  const response = await fetch(
    `${emulatorBaseUrl}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  check(response.ok, `Emulator database reset failed with HTTP ${response.status}`);
}

async function assertEmulatorReachable() {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 8787 });
    let settled = false;
    const fail = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(new Error('Firestore emulator is unreachable at the approved loopback endpoint'));
    };
    const timer = setTimeout(fail, 1500);
    socket.once('connect', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        socket.end();
        resolve();
      }
    });
    socket.once('error', fail);
  });
  await db.collection(DEVICES_COLLECTION).limit(1).get();
}

async function seedDevice(deviceId, activeCredential, overrides = {}) {
  const device = {
    state: 'deployed',
    customer_id: 'CUST-SYNTHETIC',
    customer_name: 'Synthetic Customer',
    course_id: 'COURSE-SYNTHETIC',
    course_name: 'Synthetic Course',
    location: { type: 'hole', hole: 7 },
    sim_iccid: 'synthetic-sim-association',
    credential: deriveCredentialVerifier(activeCredential),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
  await db.collection(DEVICES_COLLECTION).doc(deviceId).set(device);
  return device;
}

async function prepare(deviceId, adminUid = 'synthetic-admin') {
  return prepareCredentialRotation(db, {
    deviceId,
    adminUid,
    reason: 'Synthetic emulator contention test',
  });
}

async function expectLifecycleError(operation, expectedCode) {
  let received;
  try {
    await operation;
  } catch (error) {
    received = error;
  }
  check(
    received instanceof CredentialLifecycleError
      && received.code === expectedCode,
    `Expected lifecycle error ${expectedCode}`
  );
}

async function readDevice(deviceId) {
  const snapshot = await db.collection(DEVICES_COLLECTION).doc(deviceId).get();
  check(snapshot.exists, `Expected synthetic Device ${deviceId} to exist`);
  return snapshot.data();
}

async function readRotation(operationId) {
  const snapshot = await db.collection(ROTATIONS_COLLECTION).doc(operationId).get();
  check(snapshot.exists, 'Expected rotation operation to exist');
  return snapshot.data();
}

async function collectionSize(collectionName) {
  return (await db.collection(collectionName).get()).size;
}

async function authentication(deviceId, credential) {
  const device = await getDeviceForAuthentication(db, deviceId);
  return authenticateDeviceCredential(device, credential);
}

class ContendedFirestore {
  constructor(firestore, contenderCount = 2) {
    this.firestore = firestore;
    this.contenderCount = contenderCount;
    this.callbacks = 0;
    this.retriedCallbacks = 0;
    this.waiting = 0;
    this.barrierReleased = false;
    this.barrier = new Promise((resolve, reject) => {
      this.releaseBarrier = resolve;
      this.failBarrier = reject;
    });
    this.barrierTimer = setTimeout(() => {
      this.failBarrier(new Error('Competing Firestore transaction callbacks did not overlap'));
    }, RETRY_TEST_TIMEOUT_MS);
    this.barrierTimer.unref();
  }

  collection(name) {
    return this.firestore.collection(name);
  }

  runTransaction(updateFunction, options) {
    let callbackAttempt = 0;
    return this.firestore.runTransaction(async (transaction) => {
      callbackAttempt += 1;
      this.callbacks += 1;
      if (callbackAttempt > 1) {
        this.retriedCallbacks += 1;
      }

      const result = await updateFunction(transaction);
      if (callbackAttempt === 1 && this.waiting < this.contenderCount) {
        this.waiting += 1;
        if (this.waiting === this.contenderCount) {
          this.barrierReleased = true;
          clearTimeout(this.barrierTimer);
          this.releaseBarrier();
        }
        await this.barrier;
      }
      return result;
    }, options);
  }

  async verifyContentionAndRetry() {
    await this.barrier;
    check(
      this.barrierReleased && this.waiting === this.contenderCount,
      'Both transaction callbacks must reach the pre-commit contention barrier'
    );
    check(
      this.callbacks > this.contenderCount && this.retriedCallbacks > 0,
      'Firestore must retry at least one callback after the forced conflict'
    );
    console.log(
      `  contention: ${this.waiting} callbacks overlapped before commit; `
      + `${this.retriedCallbacks} callback retry/retries observed`
    );
  }

  dispose() {
    clearTimeout(this.barrierTimer);
  }
}

async function activate(deviceId, operationId, database = db) {
  return activateCredentialRotation(database, {
    deviceId,
    operationId,
    adminUid: 'synthetic-approver',
    confirmed: true,
  });
}

test('two concurrent preparations serialize to one complete pending operation', async () => {
  const deviceId = 'FRB-9801';
  const oldCredential = 'synthetic-active-credential-for-prepare';
  await seedDevice(deviceId, oldCredential);
  const contended = new ContendedFirestore(db);
  try {
    const results = await Promise.allSettled([
      prepareCredentialRotation(contended, {
        deviceId,
        adminUid: 'synthetic-admin-one',
        reason: 'Synthetic competing prepare one',
      }),
      prepareCredentialRotation(contended, {
        deviceId,
        adminUid: 'synthetic-admin-two',
        reason: 'Synthetic competing prepare two',
      }),
    ]);
    await contended.verifyContentionAndRetry();

    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');
    check(successes.length === 1 && failures.length === 1, 'Exactly one prepare must succeed');
    check(
      failures[0].reason instanceof CredentialLifecycleError
        && failures[0].reason.code === 'rotation_in_progress',
      'Losing prepare must receive rotation_in_progress'
    );
    const winner = successes[0].value;
    const device = await readDevice(deviceId);
    const operation = await readRotation(winner.operation_id);
    const lock = await db.collection(ROTATION_LOCKS_COLLECTION).doc(deviceId).get();
    const pendingSecret = await db.collection(ROTATION_SECRETS_COLLECTION)
      .doc(winner.operation_id).get();
    check(operation.state === 'prepared', 'Winning operation must remain prepared');
    check(lock.exists && lock.data().operation_id === winner.operation_id, 'Lock must match winner');
    check(pendingSecret.exists, 'Winning pending verifier must exist');
    check(await collectionSize(ROTATIONS_COLLECTION) === 1, 'Only one operation may exist');
    check(await collectionSize(ROTATION_SECRETS_COLLECTION) === 1, 'No orphan secret may remain');
    check(await collectionSize(ROTATION_LOCKS_COLLECTION) === 1, 'No orphan lock may remain');
    check(device.credential_generation === undefined, 'Prepare must not advance legacy generation');
    check(await authentication(deviceId, oldCredential), 'Original credential must remain active');
    check(
      !await authentication(deviceId, winner.plaintext_credential),
      'Prepared credential must not authenticate before activation'
    );

    const activated = await activate(deviceId, winner.operation_id);
    check(activated.state === 'activated', 'Winning pending credential must remain usable');
    check(
      await authentication(deviceId, winner.plaintext_credential),
      'The once-returned preparation credential must match its stored verifier'
    );
  } finally {
    contended.dispose();
  }
});

test('two concurrent activations retry safely and perform one credential transition', async () => {
  const deviceId = 'FRB-9802';
  const oldCredential = 'synthetic-active-credential-for-activate';
  await seedDevice(deviceId, oldCredential);
  const prepared = await prepare(deviceId);
  const contended = new ContendedFirestore(db);
  try {
    const outcomes = await Promise.all([
      activate(deviceId, prepared.operation_id, contended),
      activate(deviceId, prepared.operation_id, contended),
    ]);
    await contended.verifyContentionAndRetry();
    check(outcomes.every((outcome) => outcome.state === 'activated'), 'Both callers must see activation');
    check(
      outcomes.filter((outcome) => outcome.already_activated === true).length === 1,
      'Exactly one retried activation must report the committed result'
    );
    const device = await readDevice(deviceId);
    check(device.credential_generation === 1, 'Credential generation must advance exactly once');
    check(
      await authentication(deviceId, prepared.plaintext_credential),
      'Replacement credential must authenticate'
    );
    check(!await authentication(deviceId, oldCredential), 'Old credential must no longer authenticate');
    check(await collectionSize(ROTATION_SECRETS_COLLECTION) === 0, 'Pending secret must be removed');
    check(await collectionSize(ROTATION_LOCKS_COLLECTION) === 0, 'Per-device lock must be released');
    check((await readRotation(prepared.operation_id)).state === 'activated', 'Rotation must be activated');
    const repeated = await activate(deviceId, prepared.operation_id);
    check(repeated.already_activated === true, 'Repeated activation must be idempotent');
    check((await readDevice(deviceId)).credential_generation === 1, 'Retry must not increment generation');
  } finally {
    contended.dispose();
  }
});

test('activation and cancellation contention produces exactly one terminal outcome', async () => {
  const deviceId = 'FRB-9803';
  const oldCredential = 'synthetic-active-credential-for-cancel-race';
  await seedDevice(deviceId, oldCredential);
  const prepared = await prepare(deviceId);
  const contended = new ContendedFirestore(db);
  try {
    const outcomes = await Promise.allSettled([
      activate(deviceId, prepared.operation_id, contended),
      cancelCredentialRotation(contended, {
        deviceId,
        operationId: prepared.operation_id,
        adminUid: 'synthetic-canceller',
      }),
    ]);
    await contended.verifyContentionAndRetry();
    check(
      outcomes.filter((outcome) => outcome.status === 'fulfilled').length === 1
        && outcomes.filter((outcome) => outcome.status === 'rejected').length === 1,
      'Exactly one racing operation must commit'
    );
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    check(
      rejected.reason instanceof CredentialLifecycleError
        && rejected.reason.code === 'rotation_not_pending',
      'Loser must observe that the operation is no longer pending'
    );

    const device = await readDevice(deviceId);
    const operation = await readRotation(prepared.operation_id);
    check(
      operation.state === 'activated' || operation.state === 'cancelled',
      'Rotation must have exactly one terminal state'
    );
    check(await collectionSize(ROTATION_SECRETS_COLLECTION) === 0, 'Terminal operation must have no secret');
    check(await collectionSize(ROTATION_LOCKS_COLLECTION) === 0, 'Terminal operation must release its lock');
    if (operation.state === 'activated') {
      check(device.credential_generation === 1, 'Activation winner must increment once');
      check(await authentication(deviceId, prepared.plaintext_credential), 'Activation winner credential must work');
      check(!await authentication(deviceId, oldCredential), 'Activation winner must replace old credential');
    } else {
      check(device.credential_generation === undefined, 'Cancellation must preserve generation');
      check(await authentication(deviceId, oldCredential), 'Cancellation winner must preserve old credential');
      check(
        !await authentication(deviceId, prepared.plaintext_credential),
        'Cancellation winner must not enable pending credential'
      );
    }
  } finally {
    contended.dispose();
  }
});

test('stale generation cannot overwrite a newer credential', async () => {
  const deviceId = 'FRB-9804';
  const oldCredential = 'synthetic-active-credential-before-stale';
  await seedDevice(deviceId, oldCredential);
  const prepared = await prepare(deviceId);
  const newer = await replaceDeviceCredential(db, deviceId);

  await expectLifecycleError(
    activate(deviceId, prepared.operation_id),
    'stale_rotation'
  );
  check(await authentication(deviceId, newer.secret), 'Newer active credential must remain valid');
  check(!await authentication(deviceId, prepared.plaintext_credential), 'Stale pending credential must remain inactive');
  check((await readDevice(deviceId)).credential_generation === 1, 'Stale activation must not advance generation');
  check((await readRotation(prepared.operation_id)).state === 'prepared', 'Stale operation must not activate');
  await cancelCredentialRotation(db, {
    deviceId,
    operationId: prepared.operation_id,
    adminUid: 'synthetic-cleanup-admin',
  });
  check(await collectionSize(ROTATION_LOCKS_COLLECTION) === 0, 'Cancelled stale rotation must release lock');
});

test('wrong-device activation is rejected without changing either registry record', async () => {
  const deviceId = 'FRB-9805';
  const otherDeviceId = 'FRB-9806';
  const targetCredential = 'synthetic-target-credential-for-wrong-device';
  const otherCredential = 'synthetic-other-credential-for-wrong-device';
  const beforeTarget = await seedDevice(deviceId, targetCredential);
  const beforeOther = await seedDevice(otherDeviceId, otherCredential, { state: 'maintenance' });
  const prepared = await prepare(deviceId);

  await expectLifecycleError(
    activate(otherDeviceId, prepared.operation_id),
    'rotation_not_found'
  );
  const afterTarget = await readDevice(deviceId);
  const afterOther = await readDevice(otherDeviceId);
  check(
    isDeepStrictEqual(
      normalizeFirestoreValue(afterTarget),
      normalizeFirestoreValue(beforeTarget)
    ),
    'Wrong-device call must not alter target record'
  );
  check(
    isDeepStrictEqual(
      normalizeFirestoreValue(afterOther),
      normalizeFirestoreValue(beforeOther)
    ),
    'Wrong-device call must not alter other record'
  );
  check(await authentication(deviceId, targetCredential), 'Target original credential must remain active');
  check(await authentication(otherDeviceId, otherCredential), 'Other credential must remain active');
  check((await readRotation(prepared.operation_id)).state === 'prepared', 'Target operation must remain pending');
});

test('lost responses and repeated activation/cancellation are recoverable without redisclosure', async () => {
  const preparationDeviceId = 'FRB-9807';
  const preparationOldCredential = 'synthetic-active-credential-for-lost-prepare-response';
  await seedDevice(preparationDeviceId, preparationOldCredential);
  const { operation_id: recoveredOperationId } = await prepare(preparationDeviceId);
  const pendingStatus = await getPendingCredentialRotationStatus(db, preparationDeviceId);
  check(
    pendingStatus.operation_id === recoveredOperationId,
    'Pending status must recover the operation ID'
  );
  check(pendingStatus.plaintext_credential === undefined, 'Pending status must not redisclose plaintext');
  check(pendingStatus.pending_verifier === undefined, 'Pending status must not expose verifier');
  const cancelledLostPreparation = await cancelCredentialRotation(db, {
    deviceId: preparationDeviceId,
    operationId: recoveredOperationId,
    adminUid: 'synthetic-canceller',
  });
  check(cancelledLostPreparation.state === 'cancelled', 'Lost preparation must remain recoverable by cancellation');
  check(
    await authentication(preparationDeviceId, preparationOldCredential),
    'Lost preparation must leave the old credential active'
  );

  async function commitThenLoseResponse(operation) {
    await operation;
    throw new Error('Synthetic response lost after operation commit');
  }

  const activationDeviceId = 'FRB-9812';
  const activationOldCredential = 'synthetic-active-credential-for-lost-activation-response';
  await seedDevice(activationDeviceId, activationOldCredential);
  const activationPrepared = await prepare(activationDeviceId);
  let activationResponseLost = false;
  try {
    await commitThenLoseResponse(
      activate(activationDeviceId, activationPrepared.operation_id)
    );
  } catch (error) {
    activationResponseLost = error.message === 'Synthetic response lost after operation commit';
  }
  check(activationResponseLost, 'Activation response-loss fault must occur after service commit');
  const activationRetry = await activate(
    activationDeviceId,
    activationPrepared.operation_id
  );
  check(activationRetry.already_activated === true, 'Activation retry must report committed operation');
  check(
    (await readDevice(activationDeviceId)).credential_generation === 1,
    'Activation retry must not repeat transition'
  );
  check(
    await authentication(activationDeviceId, activationPrepared.plaintext_credential),
    'Committed replacement credential must authenticate after lost response'
  );

  const secondDevice = 'FRB-9808';
  const secondOldCredential = 'synthetic-active-credential-for-lost-cancel';
  await seedDevice(secondDevice, secondOldCredential);
  const secondPrepared = await prepare(secondDevice);
  let cancellationResponseLost = false;
  try {
    await commitThenLoseResponse(cancelCredentialRotation(db, {
      deviceId: secondDevice,
      operationId: secondPrepared.operation_id,
      adminUid: 'synthetic-canceller',
    }));
  } catch (error) {
    cancellationResponseLost = error.message === 'Synthetic response lost after operation commit';
  }
  check(cancellationResponseLost, 'Cancellation response-loss fault must occur after service commit');
  const cancellationRetry = await cancelCredentialRotation(db, {
    deviceId: secondDevice,
    operationId: secondPrepared.operation_id,
    adminUid: 'synthetic-canceller',
  });
  check(cancellationRetry.state === 'cancelled', 'Cancellation retry must report committed state');
  check(await authentication(secondDevice, secondOldCredential), 'Cancellation must preserve old credential');
  check(
    !await authentication(secondDevice, secondPrepared.plaintext_credential),
    'Cancelled credential must not authenticate'
  );
});

test('activation preserves target registry metadata and every unrelated device', async () => {
  const deviceId = 'FRB-9809';
  const otherDeviceId = 'FRB-9810';
  const oldCredential = 'synthetic-active-credential-for-registry-check';
  const otherCredential = 'synthetic-unrelated-device-credential';
  const beforeTarget = await seedDevice(deviceId, oldCredential, {
    state: 'maintenance',
    custom_operational_metadata: { label: 'preserve-target', sequence: 19 },
  });
  const beforeOther = await seedDevice(otherDeviceId, otherCredential, {
    state: 'in_inventory',
    customer_id: null,
    customer_name: null,
    course_id: null,
    course_name: null,
    location: null,
    sim_iccid: 'unrelated-synthetic-sim',
    custom_operational_metadata: { label: 'preserve-other', sequence: 21 },
  });
  const prepared = await prepare(deviceId);

  await activate(deviceId, prepared.operation_id);
  const afterTarget = await readDevice(deviceId);
  const afterOther = await readDevice(otherDeviceId);
  const removeCredentialMetadata = (device) => {
    const preservedFields = { ...device };
    delete preservedFields.credential;
    delete preservedFields.credential_generation;
    delete preservedFields.updated_at;
    return normalizeFirestoreValue(preservedFields);
  };
  check(
    isDeepStrictEqual(
      removeCredentialMetadata(afterTarget),
      removeCredentialMetadata(beforeTarget)
    ),
    'Activation must preserve target registry metadata'
  );
  check(
    isDeepStrictEqual(
      normalizeFirestoreValue(afterOther),
      normalizeFirestoreValue(beforeOther)
    ),
    'Other device record must remain unchanged'
  );
  check(afterTarget.state === 'maintenance', 'Lifecycle state must be preserved');
  check(afterTarget.sim_iccid === beforeTarget.sim_iccid, 'SIM association must be preserved');
  check(isDeepStrictEqual(afterTarget.location, beforeTarget.location), 'Assignment must be preserved');
  check(await authentication(otherDeviceId, otherCredential), 'Unrelated device must keep authenticating');
});

test('legacy record without generation rotates from generation zero without migration', async () => {
  const deviceId = 'FRB-9811';
  const oldCredential = 'synthetic-legacy-device-credential';
  const legacy = await seedDevice(deviceId, oldCredential);
  delete legacy.credential_generation;
  await db.collection(DEVICES_COLLECTION).doc(deviceId).set(legacy);
  check((await readDevice(deviceId)).credential_generation === undefined, 'Seed must be a legacy record');
  check(await authentication(deviceId, oldCredential), 'Legacy active credential must authenticate');

  const prepared = await prepare(deviceId);
  check((await readRotation(prepared.operation_id)).expected_credential_generation === 0,
    'Missing generation must be interpreted as zero');
  await activate(deviceId, prepared.operation_id);
  const activated = await readDevice(deviceId);
  check(activated.credential_generation === 1, 'First rotation must advance legacy record to generation one');
  check(!await authentication(deviceId, oldCredential), 'Old credential must no longer authenticate');
  check(
    await authentication(deviceId, prepared.plaintext_credential),
    'Replacement credential must authenticate on legacy record'
  );
});

async function run() {
  let passed = 0;
  let failed = 0;
  try {
    await assertEmulatorReachable();
    console.log(`Firestore emulator reachable at ${EMULATOR_HOST} for ${PROJECT_ID}`);
    for (const { name, run: runTest } of pendingTests) {
      try {
        await clearEmulatorDatabase();
        await runTest();
        passed += 1;
        console.log(`PASS: ${name}`);
      } catch (error) {
        failed += 1;
        console.error(`FAIL: ${name}: ${error.message}`);
      }
    }
  } catch (error) {
    failed += 1;
    console.error(`FAIL: emulator safety/connectivity: ${error.message}`);
  } finally {
    await db.terminate();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run();
