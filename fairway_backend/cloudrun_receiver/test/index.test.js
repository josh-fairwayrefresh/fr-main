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

async function setUpOperatorAssignment(db, uid = 'operator-123', courseId = 'COURSE-0001') {
  await db.collection('operator_course_assignments').doc(uid).set({
    enabled: true,
    courses: [{
      customer_id: 'CUST-0001',
      course_id: courseId,
      course_name: 'Tony Lema Course',
    }],
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
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-lifecycle' },
    headers: { 'x-fairway-device-key': secret },
  }), res);
  assert.strictEqual(res.statusCode, 200);
});

// --- button_press + duplicate suppression regression ---

test('authenticated button_press without transaction_id is rejected without persistence', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();

  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body, 'Invalid transaction_id\n');
  const requests = await db.collection('requests').get();
  assert.strictEqual(requests.empty, true);
});

test('malformed transaction_id values fail without persistence', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  for (const transactionId of [null, '', 42, {}, [], 'contains space', 'contains/slash', 'a'.repeat(65)]) {
    const res = createResponse();
    await handleDeviceEvent(createRequest({
      body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: transactionId },
      headers: { 'x-fairway-device-key': secret },
    }), res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body, 'Invalid transaction_id\n');
  }
  assert.strictEqual((await db.collection('requests').get()).empty, true);
});

test('concurrent retries atomically create one request and preserve the original document', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const req = createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-concurrent' },
    headers: { 'x-fairway-device-key': secret },
  });
  const responses = Array.from({ length: 8 }, () => createResponse());
  await Promise.all(responses.map((res) => handleDeviceEvent(req, res)));
  assert.ok(responses.every((res) => res.statusCode === 200));
  assert.strictEqual(new Set(responses.map((res) => res.body.request_id)).size, 1);
  assert.strictEqual(responses.filter((res) => res.body.duplicate === true).length, 7);
  assert.strictEqual((await db.collection('requests').get()).size, 1);

  const requestRef = db.collection('requests').doc(responses[0].body.request_id);
  await requestRef.update({ status: 'completed', operator_id: 'operator-123' });
  const before = (await requestRef.get()).data();
  const retry = createResponse();
  await handleDeviceEvent(req, retry);
  assert.strictEqual(retry.body.request_id, requestRef.id);
  assert.strictEqual(retry.body.duplicate, true);
  assert.deepStrictEqual((await requestRef.get()).data(), before);
});

test('the same transaction_id on different authenticated devices creates different requests', async () => {
  const db = new FakeFirestore();
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const requestIds = [];
  for (const deviceId of ['FRB-0001', 'FRB-0002']) {
    const secret = await setUpDeployedDevice(db, deviceId);
    const res = createResponse();
    await handleDeviceEvent(createRequest({
      body: { device_id: deviceId, event_type: 'button_press', transaction_id: 'txn-shared' },
      headers: { 'x-fairway-device-key': secret },
    }), res);
    assert.strictEqual(res.statusCode, 200);
    requestIds.push(res.body.request_id);
  }
  assert.notStrictEqual(requestIds[0], requestIds[1]);
  assert.strictEqual((await db.collection('requests').get()).size, 2);
});

test('valid button_press creates a golfer request without effective_config', async () => {
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
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-valid' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.status, 'accepted');
  assert.strictEqual(res.body.event_type, 'button_press');
  assert.strictEqual(typeof res.body.request_id, 'string');
  assert.strictEqual(res.body.duplicate, undefined);
  assert.strictEqual('effective_config' in res.body, false);

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
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-facts' },
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
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-unassigned' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual('effective_config' in res.body, false);

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
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-inventory' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.docs[0].data().device_state_at_request, 'in_inventory');
});

test('a retry with the same primary transaction_id returns the original request', async () => {
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
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-0001' },
    headers: { 'x-fairway-device-key': secret },
  }), first);

  const second = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-0001' },
    headers: { 'x-fairway-device-key': secret },
  }), second);

  assert.strictEqual(second.statusCode, 200);
  assert.strictEqual(second.body.status, 'accepted');
  assert.strictEqual(second.body.event_type, 'button_press');
  assert.strictEqual(second.body.request_id, first.body.request_id);
  assert.strictEqual(second.body.duplicate, true);
  assert.strictEqual('effective_config' in second.body, false);

  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.size, 1, 'a transport retry must not create a second request document');
  assert.strictEqual(requests.docs[0].data().transaction_id, 'txn-0001');
});

test('a different primary transaction_id creates fresh demand while an older request remains open', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001');
  const { handleDeviceEvent } = createFairwayHandlers(db);

  const first = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-0001' },
    headers: { 'x-fairway-device-key': secret },
  }), first);

  const second = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-0002' },
    headers: { 'x-fairway-device-key': secret },
  }), second);

  assert.strictEqual(second.statusCode, 200);
  assert.notStrictEqual(second.body.request_id, first.body.request_id);

  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.size, 2);
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
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-after-expiry' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.notStrictEqual(res.body.request_id, 'old-request');
  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.size, 2);
});

test('retired health_report event fails closed without changing historical data', async () => {
  const db = new FakeFirestore();
  const historical = { attempts: 1, received_at: new Date('2026-09-01T00:00:00Z') };
  const secret = await setUpDeployedDevice(db, 'FRB-0001', { latest_health: historical });
  const deviceRef = db.collection('devices').doc('FRB-0001');
  await deviceRef.collection('health_history').doc('historical').set(historical);
  const before = (await deviceRef.get()).data();
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'health_report', transaction_id: 'obsolete-event', health: historical },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body, 'Unknown event\n');
  const requests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(requests.empty, true);
  assert.deepStrictEqual((await deviceRef.get()).data(), before);
  const history = await deviceRef.collection('health_history').get();
  assert.strictEqual(history.size, 1);
  assert.deepStrictEqual(history.docs[0].data(), historical);
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

test('unassigned allowed Device accepts a golfer request without effective_config', async () => {
  const db = new FakeFirestore();
  const secret = await setUpDeployedDevice(db, 'FRB-0001'); // no customer_id/course_id at all
  const { handleDeviceEvent } = createFairwayHandlers(db);
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-no-assignment' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual('effective_config' in res.body, false);
});

test('obsolete malformed health_report_schedule does not affect a valid golfer request', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
    health_report_schedule: { times: 'not-an-array' },
  });
  const secret = await setUpDeployedDevice(db, 'FRB-0001', {
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
  });
  const requestTime = new Date('2026-10-01T19:00:00.000Z');
  const { handleDeviceEvent } = createFairwayHandlers(db, { now: () => requestTime });
  const res = createResponse();
  await handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-obsolete-schedule' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual('effective_config' in res.body, false);
  const request = (await db.collection('requests').doc(res.body.request_id).get()).data();
  assert.strictEqual(request.course_local_date, '2026-10-01');
  assert.strictEqual(request.course_local_hour, 12);
  const course = await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001').get();
  assert.deepStrictEqual(course.data().health_report_schedule, { times: 'not-an-array' });
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
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-missing-course' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 422);
  assert.strictEqual((await db.collection('requests').get()).empty, true);
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
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-foreign-course' },
    headers: { 'x-fairway-device-key': secret },
  }), res);

  assert.strictEqual(res.statusCode, 422);
  assert.strictEqual((await db.collection('requests').get()).empty, true);
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
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-invalid-hierarchy' },
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
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-partial-assignment' },
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
    course_id: 'COURSE-0001',
    status: 'new',
  });
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
  await setUpOperatorAssignment(db);
  const expiresAt = new Date(Date.now() + 60000);
  await db.collection('requests').doc('request-a').set({
    course_id: 'COURSE-0001',
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

test('authenticated CANCEL closes an assigned request without creating a Device command', async () => {
  const db = new FakeFirestore();
  await setUpOperatorAssignment(db);
  await db.collection('requests').doc('request-a').set({
    course_id: 'COURSE-0001',
    device_id: 'FRB-0001',
    status: 'new',
  });
  const { updateRequestStatus } = createFairwayHandlers(db, {
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
    course_id: 'COURSE-0001', device_id: 'FRB-0001', status: 'new',
    demand_window_expires_at: new Date('2026-10-01T20:00:00.000Z'),
  });
  const handlers = createFairwayHandlers(db, {
    now: () => requestTime,
    verifyOperatorToken: operatorVerifier(),
  });

  const button = createResponse();
  await handlers.handleDeviceEvent(createRequest({
    body: { device_id: 'FRB-0001', event_type: 'button_press', transaction_id: 'txn-suspended' },
    headers: { 'x-fairway-device-key': secret },
  }), button);
  assert.strictEqual(button.statusCode, 503);
  assert.strictEqual(button.body.status, 'service_unavailable');
  const newRequests = await db.collection('requests').where('device_id', '==', 'FRB-0001').get();
  assert.strictEqual(newRequests.size, 1);

  assert.strictEqual('effective_config' in button.body, false);

  const complete = createResponse();
  await handlers.updateRequestStatus(createRequest({
    headers: { authorization: 'Bearer valid-token' },
  }), complete, 'request-existing', 'complete');
  assert.strictEqual(complete.statusCode, 200);
});

test('assigned operators can suspend until the next scheduled start and resume service', async () => {
  const db = new FakeFirestore();
  const requestTime = new Date('2026-10-01T19:00:00.000Z');
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course',
    timezone: 'America/Los_Angeles',
    service_schedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
  });
  await setUpOperatorAssignment(db);
  const { fairwayButtonReceiver } = createFairwayHandlers(db, {
    now: () => requestTime,
    verifyOperatorToken: operatorVerifier(),
  });
  const suspend = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'POST', path: '/api/v1/operator/service/suspend',
    body: { course_id: 'COURSE-0001' },
    headers: { authorization: 'Bearer valid-token' },
  }), suspend);
  assert.strictEqual(suspend.statusCode, 200);
  assert.strictEqual(suspend.body.service_state.suspended, true);
  assert.strictEqual(suspend.body.service_state.suspension_until.toISOString(), '2026-10-02T16:00:00.000Z');

  const resume = createResponse();
  await fairwayButtonReceiver(createRequest({
    method: 'POST', path: '/api/v1/operator/service/resume',
    body: { course_id: 'COURSE-0001' },
    headers: { authorization: 'Bearer valid-token' },
  }), resume);
  assert.strictEqual(resume.statusCode, 200);
  assert.strictEqual(resume.body.service_state.active, true);
  const events = await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001')
    .collection('service_events').get();
  assert.deepStrictEqual(events.docs.map((event) => event.data().type), ['suspended', 'resumed']);
});

test('operator dashboard returns only assigned-Course service state, summaries, and outcomes', async () => {
  const db = new FakeFirestore();
  const requestTime = new Date('2026-10-01T19:00:00.000Z');
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', {
    course_name: 'Tony Lema Course', timezone: 'America/Los_Angeles',
    service_schedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
  });
  await setUpOperatorAssignment(db);
  await db.collection('requests').doc('completed-assigned').set({
    course_id: 'COURSE-0001', hole: 7, status: 'completed',
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
  assert.strictEqual(response.body.summaries.daily.average_completion_minutes, 10);
  assert.deepStrictEqual(response.body.history.map((request) => request.request_id), ['completed-assigned']);
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
    body: { course_id: 'COURSE-0001', subscription },
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
