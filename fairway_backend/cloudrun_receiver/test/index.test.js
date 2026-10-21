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

function createRequest({ body = {}, headers = {}, method = 'POST', path = '/', query = {} } = {}) {
  return {
    body,
    method,
    path,
    query,
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

async function setUpOperatorAssignment(db, uid = 'operator-123', courseId = 'COURSE-0001') {
  await db.collection('customers').doc('CUST-0001').set({ customer_name: 'Monarch Bay GC' }, { merge: true });
  await db.collection('customers').doc('CUST-0001').collection('courses').doc(courseId)
    .set({ course_name: 'Tony Lema Course', timezone: 'America/Los_Angeles' }, { merge: true });
  await db.collection('user_access').doc(uid).set({
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: [courseId],
  });
}

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
  await db.collection('customers').doc(customerId).collection('courses').doc(courseId).set({
    service_schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' },
    service_suspension: null,
    ...courseFields,
  });
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

test('valid button_press creates a golfer request and returns its authoritative request ID', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
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

test('a second button_press while a request is open is suppressed as a duplicate', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
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

test('unassigned allowed Device button request is accepted', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001'); // no customer_id/course_id at all
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
});

test('valid Customer/Course assignment is accepted', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
  });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
  });
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
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
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 422);
  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.empty, true);
});

test('a Device whose Course belongs to a different Customer is rejected with 422 and zero persistence', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0002', 'COURSE-0099', {
    course_name: 'Foreign Course',
    timezone: 'America/Los_Angeles',
  });
  await db.collection('customers').doc('CUST-0001').set({ customer_name: 'Monarch Bay GC' });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001', // claims a Course that only exists under CUST-0002
    course_id: 'COURSE-0099',
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
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
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
  await setUpOperatorAssignment(db, 'firebase-uid');
  await db.collection('requests').doc('request-a').set({
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
    status: 'new',
    received_at: new Date('2026-10-01T18:00:00.000Z'),
  });
  const { updateRequestStatus } = createFairwayHandlers(db, {
    now: () => new Date('2026-10-01T19:00:00.000Z'),
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
  await setUpOperatorAssignment(db);
  const expiresAt = new Date(Date.now() + 60000);
  await db.collection('requests').doc('request-a').set({
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
    device_id: 'FRB-0001',
    status: 'new',
    demand_window_expires_at: expiresAt,
    received_at: new Date('2026-10-01T18:00:00.000Z'),
  });
  const { updateRequestStatus } = createFairwayHandlers(db, {
    now: () => new Date('2026-10-01T19:00:00.000Z'),
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

test('authenticated CANCEL closes an assigned request without creating a Device command', async () => {
  const db = new FakeFirestore();
  await setUpOperatorAssignment(db);
  await db.collection('requests').doc('request-a').set({
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
    device_id: 'FRB-0001',
    status: 'new',
    received_at: new Date('2026-10-01T18:00:00.000Z'),
  });
  const { updateRequestStatus } = createFairwayHandlers(db, {
    now: () => new Date('2026-10-01T19:00:00.000Z'),
    verifyOperatorToken: operatorVerifier(),
  });
  const response = createResponse();
  await updateRequestStatus(createRequest({
    headers: { authorization: 'Bearer valid-token' },
  }), response, 'request-a', 'cancel');

  assert.strictEqual(response.statusCode, 200);
  const request = await db.collection('requests').doc('request-a').get();
  assert.strictEqual(request.data().status, 'cancelled');
  assert.strictEqual(request.data().operator_id, 'operator-123');
  const commands = await db.collection('devices').doc('FRB-0001').collection('commands').get();
  assert.strictEqual(commands.empty, true);
});

test('Course suspension blocks new button requests but preserves active-request actions', async () => {
  const db = new FakeFirestore();
  const requestTime = new Date('2026-10-01T19:00:00.000Z');
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
    service_schedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
    service_suspension: { until: new Date('2026-10-02T16:00:00.000Z') },
  });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001', course_id: 'COURSE-0001', course_name: 'Tony Lema Course',
  });
  await setUpOperatorAssignment(db);
  await db.collection('requests').doc('request-existing').set({
    customer_id: 'CUST-0001', course_id: 'COURSE-0001', device_id: 'FRB-0001', status: 'new',
    demand_window_expires_at: new Date('2026-10-01T20:00:00.000Z'),
    received_at: requestTime,
  });
  const handlers = createFairwayHandlers(db, {
    now: () => requestTime,
    verifyOperatorToken: operatorVerifier(),
  });

  const button = createResponse();
  await handlers.handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), button);
  assert.strictEqual(button.statusCode, 503);
  assert.strictEqual(button.body.status, 'service_unavailable');
  const newRequests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(newRequests.size, 1);

  const complete = createResponse();
  await handlers.updateRequestStatus(createRequest({
    headers: { authorization: 'Bearer valid-token' },
  }), complete, 'request-existing', 'complete');
  assert.strictEqual(complete.statusCode, 200);
});

test('v2 rollout keeps uncutover request eligibility available until explicit Course cutover', async () => {
  const db = new FakeFirestore();
  const requestTime = new Date('2026-10-21T18:00:00.000Z');
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
    service_schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' },
    service_suspension: null,
  });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001', course_id: 'COURSE-0001', course_name: 'Tony Lema Course',
  });
  const handlers = createFairwayHandlers(db, {
    now: () => requestTime,
    serviceControlV2Active: true,
  });
  const response = createResponse();
  await handlers.handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), response);

  assert.equal(response.statusCode, 200);
  const stored = await db.collection('requests').doc(response.body.request_id).get();
  assert.equal(stored.data().service_acceptance_source, 'legacy_schedule_pre_cutover');
  assert.equal(stored.data().service_acceptance_generation, null);
  const course = await db.collection('customers').doc('CUST-0001')
    .collection('courses').doc('COURSE-0001').get();
  assert.equal(course.data().service_schema_version, undefined, 'request must not initialize Course service');
  assert.ok(course.data().service_schedule, 'legacy schedule must remain until explicit cutover');
});

test('request acceptance and Suspend serialize on authoritative Course state', async () => {
  const db = new FakeFirestore();
  const requestTime = new Date('2026-10-21T18:00:00.000Z');
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
    service_schema_version: 2,
    service_status: 'on',
    service_generation: 0,
    service_coverage_started_at: new Date('2026-10-20T00:00:00.000Z'),
    active_service_interval_id: 'interval-active',
    service_schedule: undefined,
  });
  await db.collection('customers').doc('CUST-0001').collection('courses')
    .doc('COURSE-0001').collection('service_intervals').doc('interval-active').set({
      start_at: new Date('2026-10-20T00:00:00.000Z'),
      end_at: null,
    });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001', course_id: 'COURSE-0001', course_name: 'Tony Lema Course',
  });
  await setUpOperatorAssignment(db);
  const handlers = createFairwayHandlers(db, {
    now: () => requestTime,
    serviceControlV2Active: true,
    verifyOperatorToken: operatorVerifier(),
  });
  const requestResponse = createResponse();
  const suspendResponse = createResponse();
  await Promise.all([
    handlers.handleDeviceEvent(createRequest({
      body: { device_id: 'FRB-0001', event_type: 'button_press' },
      headers: { 'x-fairway-device-key': secret },
    }), requestResponse),
    handlers.fairwayButtonReceiver(createRequest({
      method: 'POST',
      path: '/api/v1/operator/service/suspend',
      body: {
        customer_id: 'CUST-0001',
        course_id: 'COURSE-0001',
        operation_id: 'race-suspend-01',
        expected_generation: 0,
      },
      headers: { authorization: 'Bearer valid-token' },
    }), suspendResponse),
  ]);

  assert.equal(suspendResponse.statusCode, 200);
  assert.equal(requestResponse.statusCode === 200 || requestResponse.statusCode === 503, true);
  const accepted = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  if (requestResponse.statusCode === 200) {
    assert.equal(accepted.size, 1);
    assert.equal(accepted.docs[0].data().service_acceptance_generation, 0);
    assert.equal(accepted.docs[0].data().service_accepted_while_on, true);
  } else {
    assert.equal(accepted.size, 0, 'a request losing the race to Suspend must not persist');
  }
  const finalCourse = await db.collection('customers').doc('CUST-0001')
    .collection('courses').doc('COURSE-0001').get();
  assert.equal(finalCourse.data().service_status, 'off');
  assert.equal(finalCourse.data().service_generation, 1);
});

test('assigned operators suspend indefinitely and resume through generation-checked service controls', async () => {
  const db = new FakeFirestore();
  const requestTime = new Date('2026-10-01T19:00:00.000Z');
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
    service_schema_version: 2,
    service_status: 'on',
    service_generation: 0,
    service_coverage_started_at: new Date('2026-10-01T16:00:00.000Z'),
    active_service_interval_id: 'migration-baseline-v2',
  });
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001')
    .collection('service_intervals').doc('migration-baseline-v2').set({
      start_at: new Date('2026-10-01T16:00:00.000Z'),
      end_at: null,
    });
  await setUpOperatorAssignment(db);
  const { fairwayButtonReceiver } = createFairwayHandlers(db, {
    serviceControlV2Active: true,
    now: () => requestTime,
    verifyOperatorToken: operatorVerifier(),
  });
  const suspend = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'POST', path: '/api/v1/operator/service/suspend',
    body: {
      customer_id: 'CUST-0001',
      course_id: 'COURSE-0001',
      operation_id: 'suspend-operator-01',
      expected_generation: 0,
    },
    headers: { authorization: 'Bearer valid-token' },
  }), suspend);
  assert.strictEqual(suspend.statusCode, 200);
  assert.strictEqual(suspend.body.service_state.active, false);

  const resume = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'POST', path: '/api/v1/operator/service/resume',
    body: {
      customer_id: 'CUST-0001',
      course_id: 'COURSE-0001',
      operation_id: 'resume-operator-01',
      expected_generation: 1,
    },
    headers: { authorization: 'Bearer valid-token' },
  }), resume);
  assert.strictEqual(resume.statusCode, 200);
  assert.strictEqual(resume.body.service_state.active, true);
  const events = await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001')
    .collection('service_events').get();
  assert.deepStrictEqual(events.docs.map((event) => event.data().type), ['suspend', 'resume']);
});

test('operator dashboard returns only assigned-Course service state, summaries, and outcomes', async () => {
  const db = new FakeFirestore();
  const requestTime = new Date('2026-10-01T19:00:00.000Z');
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course', timezone: 'America/Los_Angeles',
    service_schema_version: 2,
    service_status: 'on',
    service_generation: 0,
    service_coverage_started_at: new Date('2026-10-01T16:00:00.000Z'),
    active_service_interval_id: 'migration-baseline-v2',
  });
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001')
    .collection('service_intervals').doc('migration-baseline-v2').set({
      start_at: new Date('2026-10-01T16:00:00.000Z'),
      end_at: null,
    });
  await setUpOperatorAssignment(db);
  await db.collection('requests').doc('completed-assigned').set({
    customer_id: 'CUST-0001', course_id: 'COURSE-0001', hole: 7, status: 'completed',
    received_at: new Date('2026-10-01T18:00:00.000Z'),
    completed_at: new Date('2026-10-01T18:10:00.000Z'),
  });
  await db.collection('requests').doc('completed-other').set({
    course_id: 'COURSE-9999', hole: 18, status: 'completed',
    received_at: new Date('2026-10-01T18:00:00.000Z'),
    completed_at: new Date('2026-10-01T18:05:00.000Z'),
  });
  const { fairwayButtonReceiver } = createFairwayHandlers(db, {
    now: () => requestTime,
    verifyOperatorToken: operatorVerifier(),
  });
  const response = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'GET', path: '/api/v1/operator/dashboard',
    headers: { authorization: 'Bearer valid-token' },
  }), response);

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.body.courses.map((course) => course.course_id), ['COURSE-0001']);
  assert.strictEqual(response.body.summaries.daily.completed_transactions, 1);
  assert.strictEqual(response.body.summaries.daily.active_cart_hours, 'Partial (3)');
  assert.strictEqual(response.body.summaries.daily.transactions_per_cart_hour, 'Rate unavailable');
  assert.strictEqual(response.body.summaries.daily.average_completion_minutes, 10);
  assert.deepStrictEqual(response.body.history.map((request) => request.request_id), ['completed-assigned']);
  assert.strictEqual(response.body.courses[0].customer_id, 'CUST-0001');
  assert.strictEqual(response.body.courses[0].course_id, 'COURSE-0001');
});

test('ordinary dashboard reads do not cut over legacy Courses and stale clients receive nonzero sentinels', async () => {
  const db = new FakeFirestore();
  const requestTime = new Date('2026-10-21T20:00:00.000Z');
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Legacy course',
    timezone: 'America/Los_Angeles',
    service_schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' },
    service_suspension: null,
  });
  await setUpOperatorAssignment(db);
  const handlers = createFairwayHandlers(db, {
    now: () => requestTime,
    serviceControlV2Active: true,
    verifyOperatorToken: operatorVerifier(),
  });
  const dashboard = createResponse();
  await handlers.fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: '/api/v1/operator/dashboard',
    headers: { authorization: 'Bearer valid-token' },
  }), dashboard);
  assert.equal(dashboard.statusCode, 200);
  assert.equal(dashboard.body.courses[0].service_state.status, 'cutover_required');
  assert.equal(dashboard.body.summaries.daily.active_cart_hours, 'Unknown');
  assert.equal(dashboard.body.summaries.daily.transactions_per_cart_hour, 'Rate unavailable');
  assert.equal(dashboard.headers['Cache-Control'], 'no-store');

  const stored = await db.collection('customers').doc('CUST-0001')
    .collection('courses').doc('COURSE-0001').get();
  assert.equal(stored.data().service_schema_version, undefined);
  assert.ok(stored.data().service_schedule);
});

test('service state remains independently readable during dashboard reporting failure', async () => {
  const db = new FakeFirestore();
  const requestTime = new Date('2026-10-21T20:00:00.000Z');
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
    service_schema_version: 2,
    service_status: 'on',
    service_generation: 3,
    service_coverage_started_at: new Date('2026-10-01T16:00:00.000Z'),
    active_service_interval_id: 'active-interval',
  });
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001')
    .collection('service_intervals').doc('active-interval').set({
      start_at: new Date('2026-10-01T16:00:00.000Z'),
      end_at: null,
    });
  await setUpOperatorAssignment(db);
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001', course_id: 'COURSE-0001', course_name: 'Tony Lema Course',
  });
  const originalCollection = db.collection.bind(db);
  const requestCollection = originalCollection('requests');
  const originalWhere = requestCollection.where.bind(requestCollection);
  requestCollection.where = (field, operator, value) => {
    const query = originalWhere(field, operator, value);
    if (field !== 'customer_id') return query;
    return {
      where(nextField, nextOperator, nextValue) {
        query.where(nextField, nextOperator, nextValue);
        return this;
      },
      limit(count) {
        query.limit(count);
        return this;
      },
      async get() { throw new Error('simulated reporting store outage'); },
    };
  };
  db.collection = (name) => {
    if (name === 'requests') {
      return requestCollection;
    }
    return originalCollection(name);
  };
  const handlers = createFairwayHandlers(db, {
    now: () => requestTime,
    serviceControlV2Active: true,
    verifyOperatorToken: operatorVerifier(),
  });
  const query = { customer_id: 'CUST-0001', course_id: 'COURSE-0001' };

  const dashboard = createResponse();
  await handlers.fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: '/api/v1/operator/dashboard',
    query,
    headers: { authorization: 'Bearer valid-token' },
  }), dashboard);
  assert.equal(dashboard.statusCode, 500);

  const serviceState = createResponse();
  await handlers.fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: '/api/v1/operator/service-state',
    query,
    headers: { authorization: 'Bearer valid-token' },
  }), serviceState);
  assert.equal(serviceState.statusCode, 200);
  assert.deepEqual(serviceState.body.service_state, {
    status: 'ready',
    active: true,
    generation: 3,
  });
  assert.equal(serviceState.headers['Cache-Control'], 'no-store');

  const button = createResponse();
  await handlers.handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), button);
  assert.equal(button.statusCode, 200, 'reporting query failure must not block new requests');
  const acceptedRequest = await originalCollection('requests').doc(button.body.request_id).get();

  const suspend = createResponse();
  await handlers.fairwayButtonReceiver(createRequest({
    method: 'POST',
    path: '/api/v1/operator/service/suspend',
    body: {
      customer_id: 'CUST-0001',
      course_id: 'COURSE-0001',
      operation_id: 'report-outage-suspend',
      expected_generation: 3,
    },
    headers: { authorization: 'Bearer valid-token' },
  }), suspend);
  assert.equal(suspend.statusCode, 200, 'reporting query failure must not block service controls');

  const complete = createResponse();
  await handlers.updateRequestStatus(createRequest({
    headers: { authorization: 'Bearer valid-token' },
  }), complete, acceptedRequest.id, 'complete');
  assert.equal(complete.statusCode, 200, 'reporting query failure must not block COMPLETE');

  await originalCollection('requests').doc('cancel-during-report-outage').set({
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
    device_id: 'FRB-0001',
    status: 'new',
    received_at: requestTime,
    demand_window_expires_at: new Date('2026-10-21T20:05:00.000Z'),
  });
  const cancel = createResponse();
  await handlers.updateRequestStatus(createRequest({
    headers: { authorization: 'Bearer valid-token' },
  }), cancel, 'cancel-during-report-outage', 'cancel');
  assert.equal(cancel.statusCode, 200, 'reporting query failure must not block Cancel');
});

test('prior-day open requests cannot complete but remain manually cancellable', async () => {
  const db = new FakeFirestore();
  const requestTime = new Date('2026-10-21T20:00:00.000Z');
  await setUpOperatorAssignment(db);
  await db.collection('requests').doc('request-prior-day').set({
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
    device_id: 'FRB-0001',
    status: 'new',
    received_at: new Date('2026-10-20T20:00:00.000Z'),
    demand_window_expires_at: new Date('2026-10-21T20:30:00.000Z'),
  });
  const { updateRequestStatus } = createFairwayHandlers(db, {
    now: () => requestTime,
    verifyOperatorToken: operatorVerifier(),
  });
  const req = createRequest({ headers: { authorization: 'Bearer valid-token' } });
  const complete = createResponse();
  await updateRequestStatus(req, complete, 'request-prior-day', 'complete');
  assert.equal(complete.statusCode, 409);
  assert.equal(complete.body.error, 'prior_day_request_requires_cancellation');
  assert.equal((await db.collection('devices').doc('FRB-0001').collection('commands').get()).size, 0);

  const cancel = createResponse();
  await updateRequestStatus(req, cancel, 'request-prior-day', 'cancel');
  assert.equal(cancel.statusCode, 200);
  assert.equal((await db.collection('requests').doc('request-prior-day').get()).data().status, 'cancelled');
});

test('COMPLETE and Cancel serialize so only one terminal request action wins', async () => {
  const db = new FakeFirestore();
  await setUpOperatorAssignment(db);
  await db.collection('requests').doc('request-race').set({
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
    device_id: 'FRB-0001',
    status: 'new',
    received_at: new Date('2026-10-21T18:00:00.000Z'),
    demand_window_expires_at: new Date('2026-10-21T20:30:00.000Z'),
  });
  const { updateRequestStatus } = createFairwayHandlers(db, {
    now: () => new Date('2026-10-21T19:00:00.000Z'),
    verifyOperatorToken: operatorVerifier(),
  });
  const req = createRequest({ headers: { authorization: 'Bearer valid-token' } });
  const complete = createResponse();
  const cancel = createResponse();
  await Promise.all([
    updateRequestStatus(req, complete, 'request-race', 'complete'),
    updateRequestStatus(req, cancel, 'request-race', 'cancel'),
  ]);
  assert.equal(complete.statusCode, 200);
  assert.equal(cancel.statusCode, 409);
  assert.equal((await db.collection('requests').doc('request-race').get()).data().status, 'completed');
  assert.equal((await db.collection('devices').doc('FRB-0001').collection('commands').get()).size, 1);
});

test('operator assignment fixture uses the schema-v2 Customer and Course contract', async () => {
  const db = new FakeFirestore();
  await setUpOperatorAssignment(db, 'operator-456', 'COURSE-0002');
  const assignment = await db.collection('user_access').doc('operator-456').get();
  const data = assignment.data();
  assert.strictEqual(data.schema_version, 2);
  assert.strictEqual(data.admin, false);
  assert.strictEqual(data.customer_id, 'CUST-0001');
  assert.deepStrictEqual(data.course_ids, ['COURSE-0002']);
  assert.strictEqual(Object.hasOwn(data, 'courses'), false);
});

test('operator bootstrap and push subscription are restricted to assigned Courses', async () => {
  const db = new FakeFirestore();
  await setUpOperatorAssignment(db);
  const { fairwayButtonReceiver } = createFairwayHandlers(db, {
    verifyOperatorToken: operatorVerifier(),
    vapidPublicKey: 'public-vapid-key',
    vapidKeyVersion: 'v1',
  });

  const bootstrap = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: '/api/v1/operator/bootstrap',
    headers: { authorization: 'Bearer valid-token' },
  }), bootstrap);
  assert.strictEqual(bootstrap.statusCode, 200);
  assert.deepStrictEqual(bootstrap.body.courses.map((course) => course.course_id), ['COURSE-0001']);
  assert.strictEqual(bootstrap.body.push.vapid_public_key, 'public-vapid-key');

  const subscription = {
    endpoint: 'https://push.example.test/device-1',
    keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
  };
  const allowed = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'POST',
    path: '/api/v1/operator/push-subscriptions',
    body: { customer_id: 'CUST-0001', course_id: 'COURSE-0001', subscription },
    headers: { authorization: 'Bearer valid-token', 'user-agent': 'Pilot iPhone' },
  }), allowed);
  assert.strictEqual(allowed.statusCode, 200);
  assert.strictEqual(allowed.body.course_id, 'COURSE-0001');
  assert.strictEqual(allowed.body.status, 'active');

  const denied = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'POST',
    path: '/api/v1/operator/push-subscriptions',
    body: { course_id: 'COURSE-9999', subscription },
    headers: { authorization: 'Bearer valid-token' },
  }), denied);
  assert.strictEqual(denied.statusCode, 403);
});

test('Fairway Refresh Staff receive Cart access to courses across customers', async () => {
  const db = new FakeFirestore();
  const globalAdminUid = 'operator-123';
  await db.collection('user_access').doc(globalAdminUid).set({
    schema_version: 2,
    admin: true,
    customer_id: null,
    course_ids: [],
  });
  await db.collection('customers').doc('CUST-0001').set({ customer_name: 'Monarch Bay GC' });
  await db.collection('customers').doc('CUST-0001').collection('courses')
    .doc('COURSE-0001').set({ course_name: 'Tony Lema Course' });
  await db.collection('customers').doc('CUST-0002').set({ customer_name: 'Other Customer' });
  await db.collection('customers').doc('CUST-0002').collection('courses')
    .doc('COURSE-0002').set({ course_name: 'Other Course' });
  const { fairwayButtonReceiver } = createFairwayHandlers(db, {
    verifyOperatorToken: operatorVerifier('valid-token', globalAdminUid),
    vapidPublicKey: 'public-vapid-key',
    vapidKeyVersion: 'v1',
  });
  const authorizationHeaders = { authorization: 'Bearer valid-token' };

  const response = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: '/api/v1/operator/bootstrap',
    headers: authorizationHeaders,
  }), response);

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(
    response.body.courses.map((course) => [course.customer_id, course.course_id]),
    [['CUST-0001', 'COURSE-0001'], ['CUST-0002', 'COURSE-0002']]
  );

  const adminDashboard = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: '/api/v1/operator/dashboard',
    headers: authorizationHeaders,
  }), adminDashboard);
  assert.strictEqual(adminDashboard.statusCode, 200);
  assert.deepStrictEqual(
    adminDashboard.body.courses.map((course) => [course.customer_id, course.course_id]),
    [['CUST-0001', 'COURSE-0001'], ['CUST-0002', 'COURSE-0002']]
  );
});

test('notification preferences are per user and authorized course', async () => {
  const db = new FakeFirestore();
  await setUpOperatorAssignment(db);
  const secondCourse = {
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0002',
    course_name: 'Second Course',
  };
  await db.collection('user_access').doc('operator-123').set({
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: ['COURSE-0001', 'COURSE-0002'],
  });
  await db.collection('user_access').doc('operator-456').set({
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: ['COURSE-0001', 'COURSE-0002'],
  });
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0002')
    .set({ course_name: 'Second Course' }, { merge: true });
  const handlers = createFairwayHandlers(db, {
    verifyOperatorToken: operatorVerifier(),
  });

  const enabled = createResponse();
  await handlers.fairwayButtonReceiver(createRequest({
    method: 'PATCH',
    path: '/api/v1/operator/notification-preferences',
    body: { customer_id: 'CUST-0001', course_id: 'COURSE-0001', enabled: true },
    headers: { authorization: 'Bearer valid-token' },
  }), enabled);
  assert.strictEqual(enabled.statusCode, 200);

  const sameUser = createResponse();
  await handlers.fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: '/api/v1/operator/bootstrap',
    headers: { authorization: 'Bearer valid-token' },
  }), sameUser);
  assert.deepStrictEqual(sameUser.body.notification_preferences, {
    'CUST-0001/COURSE-0001': true,
    'CUST-0001/COURSE-0002': false,
  });

  const otherUser = createResponse();
  await createFairwayHandlers(db, {
    verifyOperatorToken: operatorVerifier('valid-token', 'operator-456'),
  }).fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: '/api/v1/operator/bootstrap',
    headers: { authorization: 'Bearer valid-token' },
  }), otherUser);
  assert.strictEqual(otherUser.body.notification_preferences['CUST-0001/COURSE-0001'], false);

  const denied = createResponse();
  await handlers.fairwayButtonReceiver(createRequest({
    method: 'PATCH',
    path: '/api/v1/operator/notification-preferences',
    body: { customer_id: 'CUST-0001', course_id: 'COURSE-9999', enabled: true },
    headers: { authorization: 'Bearer valid-token' },
  }), denied);
  assert.strictEqual(denied.statusCode, 403);
});

test('operator cannot mutate a request outside assigned Courses', async () => {
  const db = new FakeFirestore();
  await setUpOperatorAssignment(db);
  await db.collection('requests').doc('request-other').set({
    course_id: 'COURSE-0002',
    status: 'new',
  });
  const { updateRequestStatus } = createFairwayHandlers(db, {
    verifyOperatorToken: operatorVerifier(),
  });
  const response = createResponse();
  await updateRequestStatus(createRequest({
    headers: { authorization: 'Bearer valid-token' },
  }), response, 'request-other', 'confirm');

  assert.strictEqual(response.statusCode, 403);
  const request = await db.collection('requests').doc('request-other').get();
  assert.strictEqual(request.data().status, 'new');
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

test('receiver does not expose the Admin API', async () => {
  const db = new FakeFirestore();
  const { fairwayButtonReceiver } = createFairwayHandlers(db, {
    verifyOperatorToken: async () => ({ uid: 'cpo', admin: true }),
  });

  const response = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: '/api/v1/admin/fleet',
    headers: { authorization: 'Bearer admin-token' },
  }), response);
  assert.strictEqual(response.statusCode, 404);
});

run();
