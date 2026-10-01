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

function createRequest({ body = {}, headers = {}, method = 'POST', path = '/' } = {}) {
  return {
    body,
    method,
    path,
    get(name) {
      return headers[name.toLowerCase()] || headers[name];
    },
  };
}

function operatorVerifier(validToken = 'valid-token', uid = 'operator-123') {
  return async (token) => {
    if (token !== validToken) {
      throw new Error('invalid token');
    }
    return { uid };
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

test('a new golfer request durably records Stage A event-time facts (customer, demand window, deployed state, Course-local date/hour)', async () => {
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

  const before = Date.now();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);
  const after = Date.now();

  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  const data = requests.docs[0].data();

  assert.strictEqual(data.customer_id, 'CUST-0001');
  assert.strictEqual(data.repeat_press_count, 0);
  assert.strictEqual(data.last_repeat_press_at, null);
  assert.strictEqual(data.device_state_at_request, 'deployed');

  assert.ok(data.demand_window_expires_at instanceof Date, 'demand_window_expires_at must be a concrete Date, not a FieldValue sentinel');
  const expiresMs = data.demand_window_expires_at.getTime();
  assert.ok(expiresMs >= before + 5 * 60 * 1000, 'demand window must be at least 5 minutes from request time');
  assert.ok(expiresMs <= after + 5 * 60 * 1000, 'demand window must not exceed 5 minutes from request time');

  // 2026-09-29 is outside US DST-transition edge cases for America/Los_Angeles (PDT, UTC-7).
  assert.match(data.course_local_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Number.isInteger(data.course_local_hour) && data.course_local_hour >= 0 && data.course_local_hour <= 23);
});

test('an unassigned Device button_press records null customer/Course-local facts but still records deployed state and demand window', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001'); // no customer_id/course_id at all
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.body.effective_config, null);

  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  const data = requests.docs[0].data();

  assert.strictEqual(data.customer_id, null);
  assert.strictEqual(data.course_local_date, null);
  assert.strictEqual(data.course_local_hour, null);
  assert.strictEqual(data.device_state_at_request, 'deployed');
  assert.ok(data.demand_window_expires_at instanceof Date);
});

test('an in_inventory (not yet deployed) Device button_press records device_state_at_request accordingly', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {});
  await db.collection('devices').doc('FRB-0001').set({ state: 'in_inventory' }, { merge: true });
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.docs[0].data().device_state_at_request, 'in_inventory');
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

test('an expired open request does not suppress a genuinely fresh golfer request', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  await db.collection('requests').doc('old-request').set({
    device_id: 'FRB-0001',
    status: 'confirmed',
    demand_window_expires_at: new Date('2026-09-30T12:00:00.000Z'),
  });
  const { handleDeviceEvent } = createFairwayHandlers(db, {
    now: () => new Date('2026-09-30T12:00:01.000Z'),
  });
  const res = createResponse();

  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.notStrictEqual(res.body.request_id, 'old-request');
  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.size, 2);
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

// --- Stage B2 operator authentication + COMPLETE command mailbox ---

test('operator status endpoints reject missing and invalid Firebase ID tokens', async () => {
  const db = new FakeFirestore();
  await db.collection('requests').doc('request-a').set({
    device_id: 'FRB-0001',
    status: 'new',
    demand_window_expires_at: new Date(Date.now() + 60000),
  });
  const { updateRequestStatus } = createFairwayHandlers(db, {
    verifyOperatorToken: operatorVerifier(),
  });

  const missing = createResponse();
  await updateRequestStatus(createRequest(), missing, 'request-a', 'confirm');
  assert.strictEqual(missing.statusCode, 401);

  const invalid = createResponse();
  await updateRequestStatus(createRequest({
    headers: { authorization: 'Bearer bad-token' },
  }), invalid, 'request-a', 'complete');
  assert.strictEqual(invalid.statusCode, 401);
});

test('authenticated CONFIRM records the verified Firebase uid', async () => {
  const db = new FakeFirestore();
  await db.collection('requests').doc('request-a').set({ status: 'new' });
  const { updateRequestStatus } = createFairwayHandlers(db, {
    verifyOperatorToken: operatorVerifier('valid-token', 'firebase-uid'),
  });
  const res = createResponse();

  await updateRequestStatus(createRequest({
    headers: { authorization: 'Bearer valid-token' },
  }), res, 'request-a', 'confirm');

  assert.strictEqual(res.statusCode, 200);
  const request = await db.collection('requests').doc('request-a').get();
  assert.strictEqual(request.data().status, 'confirmed');
  assert.strictEqual(request.data().operator_id, 'firebase-uid');
});

test('authenticated COMPLETE atomically creates one deterministic correlated command', async () => {
  const db = new FakeFirestore();
  const expiresAt = new Date(Date.now() + 60000);
  await db.collection('requests').doc('request-a').set({
    device_id: 'FRB-0001',
    status: 'new',
    demand_window_expires_at: expiresAt,
  });
  const { updateRequestStatus } = createFairwayHandlers(db, {
    verifyOperatorToken: operatorVerifier(),
  });
  const req = createRequest({ headers: { authorization: 'Bearer valid-token' } });

  const first = createResponse();
  await updateRequestStatus(req, first, 'request-a', 'complete');
  const second = createResponse();
  await updateRequestStatus(req, second, 'request-a', 'complete');

  assert.strictEqual(first.statusCode, 200);
  assert.strictEqual(second.statusCode, 200);
  const request = await db.collection('requests').doc('request-a').get();
  assert.strictEqual(request.data().status, 'completed');
  assert.strictEqual(request.data().operator_id, 'operator-123');

  const commands = await db.collection('devices').doc('FRB-0001').collection('commands').limit(10).get();
  assert.strictEqual(commands.size, 1);
  assert.strictEqual(commands.docs[0].id, 'complete__request-a');
  assert.strictEqual(commands.docs[0].data().request_id, 'request-a');
  assert.strictEqual(commands.docs[0].data().type, 'complete');
  assert.strictEqual(commands.docs[0].data().status, 'pending');
  assert.strictEqual(commands.docs[0].data().expires_at, expiresAt);
});

test('device command poll is credential-bound and returns only the exact active unexpired request command', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  await db.collection('requests').doc('request-a').set({ device_id: 'FRB-0001' });
  await db.collection('requests').doc('request-b').set({ device_id: 'FRB-0001' });
  await db.collection('devices').doc('FRB-0001').collection('commands').doc('complete__request-a').set({
    command_id: 'complete__request-a',
    device_id: 'FRB-0001',
    type: 'complete',
    request_id: 'request-a',
    status: 'pending',
    expires_at: new Date('2026-09-30T12:01:00.000Z'),
  });
  const { pollDeviceCommand } = createFairwayHandlers(db, {
    now: () => new Date('2026-09-30T12:00:00.000Z'),
  });

  const unauthorized = createResponse();
  await pollDeviceCommand(createRequest({
    body: { device_id: 'FRB-0001', active_request_id: 'request-a' },
  }), unauthorized);
  assert.strictEqual(unauthorized.statusCode, 401);

  const stale = createResponse();
  await pollDeviceCommand(createRequest({
    body: { device_id: 'FRB-0001', active_request_id: 'request-b' },
    headers: { 'x-fairway-device-key': secret },
  }), stale);
  assert.strictEqual(stale.body.command, null);

  const matching = createResponse();
  await pollDeviceCommand(createRequest({
    body: { device_id: 'FRB-0001', active_request_id: 'request-a' },
    headers: { 'x-fairway-device-key': secret },
  }), matching);
  assert.strictEqual(matching.statusCode, 200);
  assert.strictEqual(matching.body.command.command_id, 'complete__request-a');
  assert.strictEqual(matching.body.command.request_id, 'request-a');
  assert.strictEqual(matching.body.command.device_id, 'FRB-0001');
});

test('expired COMPLETE commands are not delivered', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  await db.collection('requests').doc('request-a').set({ device_id: 'FRB-0001' });
  await db.collection('devices').doc('FRB-0001').collection('commands').doc('complete__request-a').set({
    command_id: 'complete__request-a',
    device_id: 'FRB-0001',
    type: 'complete',
    request_id: 'request-a',
    status: 'pending',
    expires_at: new Date('2026-09-30T12:00:00.000Z'),
  });
  const { pollDeviceCommand } = createFairwayHandlers(db, {
    now: () => new Date('2026-09-30T12:00:01.000Z'),
  });
  const res = createResponse();

  await pollDeviceCommand(createRequest({
    body: { device_id: 'FRB-0001', active_request_id: 'request-a' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.command, null);
});

test('device acknowledgement is exact and idempotent', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  let currentTime = new Date('2026-09-30T12:00:00.000Z');
  await db.collection('devices').doc('FRB-0001').collection('commands').doc('complete__request-a').set({
    command_id: 'complete__request-a',
    device_id: 'FRB-0001',
    type: 'complete',
    request_id: 'request-a',
    status: 'pending',
    expires_at: new Date('2026-09-30T12:01:00.000Z'),
    acknowledged_at: null,
  });
  const { acknowledgeDeviceCommand } = createFairwayHandlers(db, {
    now: () => currentTime,
  });
  const req = createRequest({
    body: { device_id: 'FRB-0001', request_id: 'request-a' },
    headers: { 'x-fairway-device-key': secret },
  });

  const first = createResponse();
  await acknowledgeDeviceCommand(req, first, 'complete__request-a');
  currentTime = new Date('2026-09-30T12:02:00.000Z');
  const second = createResponse();
  await acknowledgeDeviceCommand(req, second, 'complete__request-a');

  assert.strictEqual(first.statusCode, 200);
  assert.strictEqual(second.statusCode, 200);
  const command = await db.collection('devices').doc('FRB-0001')
    .collection('commands').doc('complete__request-a').get();
  assert.strictEqual(command.data().status, 'acknowledged');
});

test('device acknowledgement transactionally rejects an expired pending command', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  await db.collection('devices').doc('FRB-0001').collection('commands').doc('complete__request-a').set({
    command_id: 'complete__request-a',
    device_id: 'FRB-0001',
    type: 'complete',
    request_id: 'request-a',
    status: 'pending',
    expires_at: new Date('2026-09-30T12:00:00.000Z'),
    acknowledged_at: null,
  });
  const { acknowledgeDeviceCommand } = createFairwayHandlers(db, {
    now: () => new Date('2026-09-30T12:00:01.000Z'),
  });
  const res = createResponse();

  await acknowledgeDeviceCommand(createRequest({
    body: { device_id: 'FRB-0001', request_id: 'request-a' },
    headers: { 'x-fairway-device-key': secret },
  }), res, 'complete__request-a');

  assert.strictEqual(res.statusCode, 409);
  assert.match(res.body, /expired/i);
  const command = await db.collection('devices').doc('FRB-0001')
    .collection('commands').doc('complete__request-a').get();
  assert.strictEqual(command.data().status, 'pending');
  assert.strictEqual(command.data().acknowledged_at, null);
});

test('CORS permits the operator Authorization header', async () => {
  const { fairwayButtonReceiver } = createFairwayHandlers(new FakeFirestore());
  const res = createResponse();

  await fairwayButtonReceiver(createRequest({ method: 'OPTIONS' }), res);

  assert.strictEqual(res.statusCode, 204);
  assert.match(res.headers['Access-Control-Allow-Headers'], /Authorization/);
});

test('admin fleet endpoint requires admin true and redacts credential verifier data', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
    health_report_schedule: { times: ['09:00', '17:00'] },
  });
  await db.collection('devices').doc('FRB-0001').set({
    state: 'deployed',
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
    credential: { algorithm: 'sha256', digest: 'must-not-leave-backend', updated_at: new Date() },
  });
  const { fairwayButtonReceiver } = createFairwayHandlers(db, {
    verifyOperatorToken: async (token) => ({ uid: 'cpo', admin: token === 'admin-token' }),
  });

  const denied = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: '/api/v1/admin/fleet',
    headers: { authorization: 'Bearer operator-token' },
  }), denied);
  assert.strictEqual(denied.statusCode, 403);

  const allowed = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: '/api/v1/admin/fleet',
    headers: { authorization: 'Bearer admin-token' },
  }), allowed);
  assert.strictEqual(allowed.statusCode, 200);
  assert.strictEqual(allowed.body.customers[0].courses[0].course_id, 'COURSE-0001');
  assert.strictEqual(allowed.body.devices[0].device_id, 'FRB-0001');
  assert.strictEqual(allowed.body.devices[0].credential, undefined);
  assert.strictEqual(allowed.body.devices[0].credential_status.algorithm, 'sha256');
  assert.strictEqual(JSON.stringify(allowed.body).includes('must-not-leave-backend'), false);
});

run();
