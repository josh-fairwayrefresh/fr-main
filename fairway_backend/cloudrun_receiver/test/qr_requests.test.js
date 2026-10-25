'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { FakeFirestore } = require('./fake_firestore');
const { publicBay, acceptQrRequest } = require('../lib/qr_requests');
const { transitionRequest } = require('../lib/request_lifecycle');
const { courseOperation } = require('../lib/course_operation');
const { getInventoryBootstrap } = require('../lib/inventory');
const { dispatchRequestNotifications } = require('../lib/notification_dispatch');
const { setNotificationPreference } = require('../lib/operator_notifications');
const { createCourse } = require('../lib/fleet/courses');
const { createDevice, updateDeviceState } = require('../lib/fleet/devices');
const { aggregateCourseReports } = require('../lib/service_reporting');

const id = 'synthetic_bay_000000000001';
const network = 'a'.repeat(64);
const coursePath = 'customers/customer/courses/range';
const assignment = { courses: [{ customer_id: 'customer', course_id: 'range' }] };
async function fixture() {
  const db = new FakeFirestore();
  await db.collection('customers').doc('customer').set({ customer_name: 'Synthetic review' });
  await db.doc(coursePath).set({
    course_name: 'Independent QR Course', operation_kind: 'driving_range',
    timezone: 'America/Los_Angeles', service_suspension: null,
  });
  await db.doc('customers/customer/courses/cart').set({ course_name: 'Cart Course' });
  await db.doc(`qr_bays/${id}`).set({
    customer_id: 'customer', course_id: 'range', bay_number: 1, enabled: true, active_request_id: null,
  });
  await db.doc('user_access/operator').set({
    schema_version: 2, admin: false, customer_id: 'customer', course_ids: ['range', 'cart'],
  });
  return db;
}
async function activeId(db) {
  return (await db.doc(`qr_bays/${id}`).get()).data().active_request_id;
}

test('public bay allowlist exposes identity and availability only', async () => {
  const db = await fixture();
  assert.deepEqual(await publicBay(db, id), {
    bay_number: 1, course_name: 'Independent QR Course', available: true,
  });
  await assert.rejects(publicBay(db, '../private'), { status: 404 });
});

test('concurrent scans create one request; retries remain bound after completion', async () => {
  const db = await fixture();
  const operation = randomUUID();
  await Promise.all(Array.from({ length: 20 }, () => acceptQrRequest(db, id, randomUUID(), network)));
  assert.equal((await db.collection('requests').get()).size, 1);
  await acceptQrRequest(db, id, operation, network);
  const first = await activeId(db);
  await transitionRequest(db, first, 'complete', assignment, 'operator');
  await acceptQrRequest(db, id, operation, network);
  assert.equal(await activeId(db), null);
  assert.equal((await db.collection('requests').get()).size, 1);
  await acceptQrRequest(db, id, randomUUID(), network);
  assert.notEqual(await activeId(db), first);
  assert.equal((await db.collection('devices').get()).size, 0);
  await transitionRequest(db, first, 'complete', assignment, 'operator');
  assert.notEqual(await activeId(db), null, 'old completion cannot clear the new claim');
});

test('terminal actions serialize, same action replays, opposite action conflicts', async () => {
  const db = await fixture();
  await acceptQrRequest(db, id, randomUUID(), network);
  const requestId = await activeId(db);
  const results = await Promise.allSettled([
    transitionRequest(db, requestId, 'cancel', assignment, 'a'),
    transitionRequest(db, requestId, 'complete', assignment, 'b'),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
  await transitionRequest(db, requestId, 'cancel', assignment, 'a');
  assert.equal(await activeId(db), null);
});

test('suspension rejects new intents but not safe receipt replay or operator actions', async () => {
  const db = await fixture();
  const operation = randomUUID();
  await acceptQrRequest(db, id, operation, network);
  await db.doc(coursePath).update({ service_suspension: { suspended_at: new Date() } });
  await assert.rejects(acceptQrRequest(db, id, randomUUID(), network), { status: 409 });
  await acceptQrRequest(db, id, operation, network);
  await transitionRequest(db, await activeId(db), 'complete', assignment, 'operator');
  assert.equal(await activeId(db), null);
});

test('Course entitlement controls actions; QR Courses have no inventory', async () => {
  const db = await fixture();
  await acceptQrRequest(db, id, randomUUID(), network);
  await assert.rejects(transitionRequest(db, await activeId(db), 'cancel', { courses: [] }, 'outsider'), { status: 403 });
  assert.deepEqual((await getInventoryBootstrap(db, 'operator')).courses.map((course) => course.course_id), ['cart']);
  assert.equal(courseOperation({}).kind, 'cart');
  assert.equal(courseOperation({ operation_kind: 'driving_range' }).cart_metrics, false);
  assert.throws(() => courseOperation({ operation_kind: 'typo' }), /Invalid/);
});

test('explicit Course creation starts QR service suspended and refuses physical assignment', async () => {
  const db = await fixture();
  const course = await createCourse(db, {
    customerId: 'customer', courseName: 'Not identified by name',
    timezone: 'America/Los_Angeles', operationKind: 'driving_range',
  });
  assert.equal(course.operation_kind, 'driving_range');
  assert.ok(course.service_suspension);
  const device = await createDevice(db);
  await assert.rejects(updateDeviceState(db, device.device_id, 'deployed', {
    customerId: 'customer', courseId: course.course_id, location: { type: 'hole', hole: 1 },
  }), /Invalid Course for physical devices/);
});

test('throttling is persistent and rejection cannot create another request', async () => {
  const db = await fixture();
  const now = new Date('2026-10-25T03:00:00Z');
  const window = Math.floor(now.getTime() / 60000);
  await db.doc(`qr_request_limits/${network}-${window}`).set({ count: 120 });
  await assert.rejects(acceptQrRequest(db, id, randomUUID(), network, now), { status: 429 });
  assert.equal((await db.collection('requests').get()).size, 0);
  await assert.rejects(acceptQrRequest(db, id, 'bad', network), { status: 400 });
});

test('failed acceptance commit leaves no claim, receipt or successful request; retry succeeds once', async () => {
  const db = await fixture();
  const operation = randomUUID();
  db.failNextTransactionCommit = true;
  await assert.rejects(acceptQrRequest(db, id, operation, network), /Simulated transaction/);
  assert.equal(await activeId(db), null);
  assert.equal((await db.doc(`qr_bays/${id}/submissions/${operation}`).get()).exists, false);
  assert.equal((await db.collection('requests').get()).size, 0);
  await acceptQrRequest(db, id, operation, network);
  await acceptQrRequest(db, id, operation, network);
  assert.equal((await db.collection('requests').get()).size, 1);
});

test('existing Course preferences route QR notifications independently with correct deep links', async () => {
  const db = await fixture();
  await db.doc('course_push_subscriptions/range/subscriptions/browser').set({
    operator_uid: 'operator', customer_id: 'customer', course_id: 'range',
    endpoint: 'https://push.example.test/review', keys: { auth: 'a', p256dh: 'b' }, status: 'active',
  });
  await acceptQrRequest(db, id, randomUUID(), network);
  const requestId = await activeId(db);
  await setNotificationPreference(db, 'operator', 'customer', 'range', false);
  await setNotificationPreference(db, 'operator', 'customer', 'cart', true);
  let sends = 0;
  const send = async (_, payload) => {
    sends++;
    const notification = JSON.parse(payload);
    assert.match(notification.body, /Server requested.*Bay 1/);
    assert.equal(notification.url, `/requests/${requestId}?customer_id=customer&course_id=range`);
  };
  await dispatchRequestNotifications(db, requestId, send);
  assert.equal(sends, 0);
  await setNotificationPreference(db, 'operator', 'customer', 'range', true);
  await dispatchRequestNotifications(db, requestId, send);
  await dispatchRequestNotifications(db, requestId, send);
  assert.equal(sends, 1);
});

test('non-cart Course history composes across Courses without entering summary calculations', () => {
  const reports = ['a', 'b'].map((id, index) => Object.fromEntries(
    ['daily', 'weekly', 'monthly'].map((period) => [period, { history: [{
      request_id: id, status: 'completed', completed_at: new Date(1000 + index),
    }] }]),
  ));
  const result = aggregateCourseReports(reports, { includeSummaries: false });
  assert.deepEqual(Object.keys(result.daily), ['history']);
  assert.deepEqual(result.daily.history.map((request) => request.request_id), ['b', 'a']);
});
