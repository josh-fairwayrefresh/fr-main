'use strict';

const assert = require('assert');
const { FakeFirestore } = require('./fake_firestore');
const { createCustomer } = require('../lib/fleet/customers');
const { createCourse } = require('../lib/fleet/courses');
const { DEVICE_STATES, MARKER_LOCATION_TYPES } = require('../lib/fleet/schema');
const {
  provisionNewDevice,
  issueCredentialForExistingDevice,
  CURRENT_FIRMWARE_GENERATION,
  ProvisioningError,
} = require('../lib/fleet/provisioning');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push({ name, fn });
}

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

async function seedCustomerAndCourse(db) {
  const customer = await createCustomer(db, { customerName: 'Monarch Bay GC' });
  const course = await createCourse(db, {
    customerId: customer.customer_id,
    courseName: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
  });
  return { customerId: customer.customer_id, courseId: course.course_id };
}

test('provisionNewDevice allocates a real device_id, creates the device, and issues a credential', async () => {
  const db = new FakeFirestore();
  const { customerId, courseId } = await seedCustomerAndCourse(db);

  const result = await provisionNewDevice(db, {
    customerId,
    courseId,
    location: { type: MARKER_LOCATION_TYPES.HOLE, hole: 2 },
    hardwareRevision: 'Prototype 1.2',
    simIccid: '89464278206108309162',
  });

  assert.strictEqual(typeof result.deviceId, 'string');
  assert.ok(result.deviceId.startsWith('FRB-'), `expected FRB-XXXX id, got ${result.deviceId}`);
  assert.strictEqual(typeof result.plaintextCredential, 'string');
  assert.ok(result.plaintextCredential.length > 0);

  const deviceSnap = await db.collection('devices').doc(result.deviceId).get();
  assert.strictEqual(deviceSnap.exists, true);

  const device = deviceSnap.data();
  assert.strictEqual(device.customer_id, customerId);
  assert.strictEqual(device.customer_name, 'Monarch Bay GC');
  assert.strictEqual(device.course_id, courseId);
  assert.strictEqual(device.course_name, 'Tony Lema Course');
  assert.deepStrictEqual(device.location, { type: 'hole', hole: 2 });
  assert.strictEqual(device.hardware_revision, 'Prototype 1.2');
  assert.strictEqual(device.sim_iccid, '89464278206108309162');
  assert.strictEqual(device.state, DEVICE_STATES.IN_INVENTORY, 'must not transition state; deployment is a later step');
  assert.strictEqual(device.firmware_generation, CURRENT_FIRMWARE_GENERATION, 'must default to the canonical Firmware Generation Registry value');

  // The stored credential must be a non-reversible verifier only.
  assert.strictEqual(device.credential.algorithm, 'sha256');
  assert.strictEqual(typeof device.credential.digest, 'string');
  assert.notStrictEqual(device.credential.digest, result.plaintextCredential);
  assert.strictEqual(JSON.stringify(device).includes(result.plaintextCredential), false, 'plaintext secret must never be persisted');
});

test('provisionNewDevice does not hardcode the allocated id across repeated calls', async () => {
  const db = new FakeFirestore();
  const { customerId, courseId } = await seedCustomerAndCourse(db);

  const first = await provisionNewDevice(db, { customerId, courseId, location: null });
  const second = await provisionNewDevice(db, { customerId, courseId, location: null });

  assert.notStrictEqual(first.deviceId, second.deviceId);
});

test('provisionNewDevice fails safely (ProvisioningError, deviceId null) when device creation fails', async () => {
  const db = new FakeFirestore();

  await assert.rejects(
    () => provisionNewDevice(db, { customerId: 'CUST-9999', courseId: null, location: null }),
    (error) => {
      assert.ok(error instanceof ProvisioningError);
      assert.strictEqual(error.stage, 'create_device');
      assert.strictEqual(error.deviceId, null);
      return true;
    }
  );

  const devicesSnap = await db.collection('devices').where('customer_id', '==', 'CUST-9999').get();
  assert.strictEqual(devicesSnap.empty, true, 'no device should exist after a failed creation');
});

test('provisionNewDevice surfaces the created device_id (not a silent failure) if credential issuance fails', async () => {
  const db = new FakeFirestore();
  const { customerId, courseId } = await seedCustomerAndCourse(db);

  // Explicit method delegation (not object spread, which would drop the
  // FakeFirestore/FakeCollectionRef/FakeDocRef prototype methods): every
  // operation behaves exactly like the real fake except that updating a
  // 'devices' document always throws, simulating a Firestore outage
  // between device creation and credential issuance.
  const brokenDb = {
    collection: (name) => {
      const real = db.collection(name);
      if (name !== 'devices') {
        return real;
      }
      return {
        doc: (id) => {
          const realDoc = real.doc(id);
          return {
            collection: (...args) => realDoc.collection(...args),
            get: (...args) => realDoc.get(...args),
            set: (...args) => realDoc.set(...args),
            update: async () => {
              throw new Error('simulated Firestore outage during credential update');
            },
          };
        },
        add: (...args) => real.add(...args),
        where: (...args) => real.where(...args),
        limit: (...args) => real.limit(...args),
      };
    },
    batch: (...args) => db.batch(...args),
    runTransaction: (...args) => db.runTransaction(...args),
  };

  await assert.rejects(
    () => provisionNewDevice(brokenDb, { customerId, courseId, location: null }),
    (error) => {
      assert.ok(error instanceof ProvisioningError);
      assert.strictEqual(error.stage, 'issue_credential');
      assert.ok(typeof error.deviceId === 'string' && error.deviceId.startsWith('FRB-'));
      assert.ok(error.message.includes(error.deviceId), 'error must name the exact device_id needing credential retry');
      return true;
    }
  );

  const deviceQuery = await db.collection('devices').where('customer_id', '==', customerId).get();
  const deviceSnap = await db.collection('devices').doc(deviceQuery.docs[0].id).get();
  assert.strictEqual(deviceSnap.data().credential, null, 'no credential should be stored when issuance failed');
});

test('issueCredentialForExistingDevice recovers a partially-provisioned device without allocating a second device', async () => {
  const db = new FakeFirestore();
  const { customerId, courseId } = await seedCustomerAndCourse(db);

  // Reproduce the exact partial-provisioning scenario: device created via
  // the broken-db credential-update failure above, leaving `credential: null`.
  const brokenDb = {
    collection: (name) => {
      const real = db.collection(name);
      if (name !== 'devices') {
        return real;
      }
      return {
        doc: (id) => {
          const realDoc = real.doc(id);
          return {
            collection: (...args) => realDoc.collection(...args),
            get: (...args) => realDoc.get(...args),
            set: (...args) => realDoc.set(...args),
            update: async () => {
              throw new Error('simulated Firestore outage during credential update');
            },
          };
        },
        add: (...args) => real.add(...args),
        where: (...args) => real.where(...args),
        limit: (...args) => real.limit(...args),
      };
    },
    batch: (...args) => db.batch(...args),
    runTransaction: (...args) => db.runTransaction(...args),
  };

  let deviceId;
  await assert.rejects(async () => {
    try {
      await provisionNewDevice(brokenDb, { customerId, courseId, location: null });
    } catch (error) {
      deviceId = error.deviceId;
      throw error;
    }
  });

  const beforeSnap = await db.collection('devices').where('customer_id', '==', customerId).get();
  assert.strictEqual(beforeSnap.size, 1, 'exactly one device must exist before recovery');
  assert.strictEqual(beforeSnap.docs[0].data().credential, null, 'credential must be null before recovery');

  // Recovery uses the real (non-broken) db and must not call createDevice().
  const recovered = await issueCredentialForExistingDevice(db, deviceId);

  assert.strictEqual(recovered.deviceId, deviceId, 'recovery must act on the same existing device_id');
  assert.strictEqual(typeof recovered.plaintextCredential, 'string');
  assert.ok(recovered.plaintextCredential.length > 0);

  const afterSnap = await db.collection('devices').where('customer_id', '==', customerId).get();
  assert.strictEqual(afterSnap.size, 1, 'recovery must not allocate/create a second device');
  assert.strictEqual(afterSnap.docs[0].id, deviceId, 'the single existing device must be unchanged in identity');

  const deviceAfter = afterSnap.docs[0].data();
  assert.strictEqual(deviceAfter.credential.algorithm, 'sha256');
  assert.notStrictEqual(deviceAfter.credential.digest, recovered.plaintextCredential);
});

test('issueCredentialForExistingDevice fails safely for an unknown device_id without creating anything', async () => {
  const db = new FakeFirestore();

  await assert.rejects(
    () => issueCredentialForExistingDevice(db, 'FRB-9999'),
    (error) => {
      assert.ok(error instanceof ProvisioningError);
      assert.strictEqual(error.stage, 'issue_credential');
      assert.strictEqual(error.deviceId, 'FRB-9999');
      return true;
    }
  );

  const snap = await db.collection('devices').doc('FRB-9999').get();
  assert.strictEqual(snap.exists, false);
});

run();
