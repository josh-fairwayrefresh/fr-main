'use strict';

const assert = require('assert');
const { FakeFirestore } = require('./fake_firestore');
const { createFairwayHandlers } = require('../index');
const { generateDeviceCredential } = require('../lib/fleet/credentials');

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

function createResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createRequest({ body = {}, headers = {} } = {}) {
  return {
    body,
    get(name) {
      return headers[name.toLowerCase()] || headers[name];
    },
  };
}

const VALID_OBSERVATION = Object.freeze({
  attempts: 1,
  registration_state: 1,
  http_status: 200,
  modem_temperature_m_c: 32000,
  rsrp_dbm: -95,
  rsrq_db: -10,
  snr_db: 12,
  serving_cell_id: 123456,
  serving_band: 20,
  psm_tau_s: 11160,
  psm_active_time_s: 0,
  battery_voltage_u_v: 4000000,
  battery_soc_pct: 87,
  https_succeeded: true,
});

async function setUpDeployedDevice(db, deviceId, extra = {}) {
  const { secret, verifier } = generateDeviceCredential();
  await db.collection('devices').doc(deviceId).set({
    state: 'deployed',
    credential: verifier,
    ...extra,
  });
  return secret;
}

async function seedCourse(db, customerId, courseId, courseFields) {
  await db.collection('customers').doc(customerId).set({ customer_name: customerId });
  await db.collection('customers').doc(customerId).collection('courses').doc(courseId).set(courseFields);
}

// --- WP3 auth/lifecycle regression (dynamic, against the real production handler) ---

test('unknown Device is rejected with 404', async () => {
  const { handleDeviceEvent } = createFairwayHandlers(new FakeFirestore());
  const res = createResponse();
  await handleDeviceEvent(createRequest({ body: { device_id: 'FRB-9999', event_type: 'button_press' } }), res);
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(res.body, 'Unknown device\n');
});

test('wrong credential is rejected with 401', async () => {
  const db = new FakeFirestore();
  await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': 'wrong-secret' },
  }), res);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body, 'Unauthorized\n');
});

test('missing credential is rejected with 401', async () => {
  const db = new FakeFirestore();
  await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({ body: { device_id: 'FRB-0001', event_type: 'button_press' } }), res);
  assert.strictEqual(res.statusCode, 401);
});

test('a credential issued for a different Device is rejected (identity mismatch)', async () => {
  const db = new FakeFirestore();
  await setUpDeployedDevice(db, 'FRB-0001');
  const otherSecret = await setUpDeployedDevice(db, 'FRB-0002');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': otherSecret },
  }), res);
  assert.strictEqual(res.statusCode, 401);
});

test('retired Device is rejected with 403', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {});
  await db.collection('devices').doc('FRB-0001').set({ state: 'retired' }, { merge: true });
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body, 'Inactive device\n');
});

test('missing/malformed state is rejected with 403 (fail closed)', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {});
  await db.collection('devices').doc('FRB-0001').set({ state: 'not-a-real-state' }, { merge: true });
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);
  assert.strictEqual(res.statusCode, 403);
});

test('a valid allowed-lifecycle Device with correct credential proceeds (not rejected)', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);
  assert.strictEqual(res.statusCode, 200);
});

// --- button_press + duplicate suppression regression ---

test('valid button_press creates a golfer request and returns effective_config JSON', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
    health_report_schedule: { times: ['09:00', '17:00'] },
  });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
    course_name: 'Tony Lema Course',
    location: { type: 'hole', hole: 7 },
  });
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.status, 'accepted');
  assert.strictEqual(res.body.event_type, 'button_press');
  assert.strictEqual(typeof res.body.request_id, 'string');
  assert.strictEqual(res.body.duplicate, undefined);
  assert.strictEqual(res.body.effective_config.timezone, 'America/Los_Angeles');
  assert.ok(res.body.effective_config.next_health_report_at);

  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.size, 1);
  assert.strictEqual(requests.docs[0].data().hole, 7);
  assert.strictEqual(requests.docs[0].data().status, 'new');
  assert.strictEqual(requests.docs[0].id, res.body.request_id);
});

test('an unassigned Device button_press returns effective_config: null', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001'); // no customer_id/course_id at all
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.effective_config, null);
});

test('a second button_press while a request is open is suppressed as a duplicate and still returns effective_config', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
    health_report_schedule: { times: ['09:00', '17:00'] },
  });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
  });
  const { handleDeviceEvent } = createFairwayHandlers(db);

  const first = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), first);

  const second = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), second);

  assert.strictEqual(second.statusCode, 200);
  assert.strictEqual(second.body.status, 'accepted');
  assert.strictEqual(second.body.event_type, 'button_press');
  assert.strictEqual(second.body.request_id, first.body.request_id);
  assert.strictEqual(second.body.duplicate, true);
  assert.strictEqual(second.body.effective_config.timezone, 'America/Los_Angeles');

  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.size, 1, 'duplicate press must not create a second request document');
});

test('button_press creates no health_history entries', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  const history = await db.collection('devices').doc('FRB-0001').collection('health_history').limit(1).get();
  assert.strictEqual(history.empty, true);
});

// --- health_report regression ---

test('valid health_report creates no golfer request', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'health_report', health: VALID_OBSERVATION },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.empty, true);
});

test('valid health_report updates latest_health and appends exactly one history observation', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'health_report', health: VALID_OBSERVATION },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  const deviceDoc = await db.collection('devices').doc('FRB-0001').get();
  assert.strictEqual(deviceDoc.data().latest_health.attempts, 1);

  const history = await db.collection('devices').doc('FRB-0001').collection('health_history').limit(10).get();
  assert.strictEqual(history.size, 1);
});

test('malformed health_report does not persist anything and returns 400', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'health_report', health: { attempts: -1 } },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 400);
  const deviceDoc = await db.collection('devices').doc('FRB-0001').get();
  assert.strictEqual(deviceDoc.data().latest_health, undefined);
  const history = await db.collection('devices').doc('FRB-0001').collection('health_history').limit(1).get();
  assert.strictEqual(history.empty, true);
});

test('unknown event_type fails closed with 400', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'not_a_real_event' },
    headers: { 'x-fairway-device-key': secret },
  }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body, 'Unknown event\n');
});

// --- Hierarchy fail-closed regression ---

test('unassigned allowed Device is accepted with effective_config: null', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001'); // no customer_id/course_id at all
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'health_report', health: VALID_OBSERVATION },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.effective_config, null);
});

test('valid Customer/Course assignment is accepted with a resolved effective_config', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
    health_report_schedule: { times: ['09:00', '17:00'] },
  });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
  });
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'health_report', health: VALID_OBSERVATION },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.effective_config.timezone, 'America/Los_Angeles');
  assert.ok(res.body.effective_config.next_health_report_at);
});

test('a Device claiming a nonexistent Course is rejected with 422 and zero persistence', async () => {
  const db = new FakeFirestore();
  await db.collection('customers').doc('CUST-0001').set({ customer_name: 'Monarch Bay GC' });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001',
    course_id: 'COURSE-9999', // does not exist
  });
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'health_report', health: VALID_OBSERVATION },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 422);
  const deviceDoc = await db.collection('devices').doc('FRB-0001').get();
  assert.strictEqual(deviceDoc.data().latest_health, undefined);
  const history = await db.collection('devices').doc('FRB-0001').collection('health_history').limit(1).get();
  assert.strictEqual(history.empty, true);
});

test('a Device whose Course belongs to a different Customer is rejected with 422 and zero persistence', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0002', 'COURSE-0099', {
    course_name: 'Foreign Course',
    timezone: 'America/Los_Angeles',
    health_report_schedule: { times: ['09:00', '17:00'] },
  });
  await db.collection('customers').doc('CUST-0001').set({ customer_name: 'Monarch Bay GC' });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001', // claims a Course that only exists under CUST-0002
    course_id: 'COURSE-0099',
  });
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'health_report', health: VALID_OBSERVATION },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 422);
  const deviceDoc = await db.collection('devices').doc('FRB-0001').get();
  assert.strictEqual(deviceDoc.data().latest_health, undefined);
});

test('an invalid-hierarchy Device attempting button_press creates zero golfer requests', async () => {
  const db = new FakeFirestore();
  await db.collection('customers').doc('CUST-0001').set({ customer_name: 'Monarch Bay GC' });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001',
    course_id: 'COURSE-9999', // does not exist
  });
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 422);
  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.empty, true);
});

test('a partial assignment (course_id without customer_id) is rejected as an invalid hierarchy', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    course_id: 'COURSE-0001', // customer_id absent: inconsistent, not "legitimately unassigned"
  });
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'health_report', health: VALID_OBSERVATION },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 422);
});

run();
