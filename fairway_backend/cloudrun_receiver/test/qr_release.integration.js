'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Firestore } = require('@google-cloud/firestore');
const { createFairwayHandlers } = require('../index');
const { provisionQrBays, acceptQrRequest, publicBay } = require('../lib/qr_requests');
const { transitionRequest } = require('../lib/request_lifecycle');
const { dispatchRequestNotifications } = require('../lib/notification_dispatch');
const { getOperatorAssignment, getNotificationPreferences, setNotificationPreference } = require('../lib/operator_notifications');
const { getInventoryBootstrap } = require('../lib/inventory');

async function main() {
  if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
    throw new Error('This transactional release check requires an isolated local emulator');
  }
  const db = new Firestore({ projectId: `demo-fairway-qr-${Date.now()}` });
  const customer = 'CUST-0001';
  const cart = 'COURSE-0001';
  const range = 'COURSE-0003';
  const cartRef = db.doc(`customers/${customer}/courses/${cart}`);
  const rangeRef = db.doc(`customers/${customer}/courses/${range}`);
  await db.doc(`customers/${customer}`).set({ customer_name: 'Synthetic Monarch' });
  await cartRef.set({ course_name: 'Synthetic Cart', timezone: 'America/Los_Angeles', service_suspension: null });
  await rangeRef.set({ course_name: 'Synthetic Range', timezone: 'America/Los_Angeles', operation_kind: 'driving_range', service_suspension: { suspended_at: new Date() } });
  await db.doc('customers/CUST-0002').set({ customer_name: 'Other Customer' });
  await db.doc('customers/CUST-0002/courses/COURSE-0002').set({ course_name: 'Other', timezone: 'America/Los_Angeles' });
  await db.doc('user_access/operator').set({ schema_version: 2, admin: false, customer_id: customer, course_ids: [cart, range] });
  await db.doc('user_access/foreign').set({ schema_version: 2, admin: false, customer_id: 'CUST-0002', course_ids: ['COURSE-0002'] });
  const bays = Array.from({ length: 52 }, (_, index) => ({
    id: `release_bay_${String(index + 1).padStart(12, '0')}`,
    bay_number: Math.floor(index / 2) + 1, bay_side: index % 2 ? 'B' : 'A',
  }));
  await provisionQrBays(db, customer, range, bays);
  await provisionQrBays(db, customer, range, bays);
  const network = 'b'.repeat(64);
  await assert.rejects(acceptQrRequest(db, bays[0].id, randomUUID(), network), { status: 409 });
  const cartBefore = (await cartRef.get()).data();
  await rangeRef.update({ service_suspension: null });
  const assignment = await getOperatorAssignment(db, 'operator');
  assert.deepEqual((await getInventoryBootstrap(db, 'operator')).courses.map((course) => course.course_id), [cart]);
  const claim = async (bay) => (await db.doc(`qr_bays/${bay.id}`).get()).data().active_request_id;
  const operation = randomUUID();
  await Promise.all(Array.from({ length: 16 }, (_, index) => acceptQrRequest(db, bays[0].id, index ? randomUUID() : operation, network)));
  await Promise.all(Array.from({ length: 8 }, () => acceptQrRequest(db, bays[1].id, randomUUID(), network)));
  assert.equal((await db.collection('requests').get()).size, 2);
  const a = await claim(bays[0]);
  const b = await claim(bays[1]);
  assert.notEqual(a, b);
  const foreign = await getOperatorAssignment(db, 'foreign');
  await assert.rejects(transitionRequest(db, a, 'complete', foreign, 'foreign'), { status: 403 });
  const preferences = await getNotificationPreferences(db, 'operator', assignment.courses);
  assert.equal(preferences[`${customer}/${range}`], false);
  await setNotificationPreference(db, 'operator', customer, cart, true);
  await db.doc(`course_push_subscriptions/${range}/subscriptions/synthetic`).set({
    customer_id: customer, course_id: range, operator_uid: 'operator',
    endpoint: 'https://push.example.test/isolated', keys: { auth: 'synthetic', p256dh: 'synthetic' }, status: 'active',
  });
  await setNotificationPreference(db, 'operator', customer, range, false);
  let sends = 0;
  const send = async (_subscription, encoded) => {
    const payload = JSON.parse(encoded);
    assert.match(payload.body, /Bay 1B/);
    assert.equal(payload.url, `/requests/${b}?customer_id=${customer}&course_id=${range}`);
    sends++;
  };
  await dispatchRequestNotifications(db, b, send);
  assert.equal(sends, 0);
  await setNotificationPreference(db, 'operator', customer, range, true);
  await Promise.all(Array.from({ length: 4 }, () => dispatchRequestNotifications(db, b, send)));
  assert.equal(sends, 1);
  assert.equal((await getNotificationPreferences(db, 'operator', assignment.courses))[`${customer}/${cart}`], true);
  const races = await Promise.allSettled([
    transitionRequest(db, a, 'complete', assignment, 'operator'),
    transitionRequest(db, a, 'cancel', assignment, 'operator'),
  ]);
  assert.equal(races.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(races.find((result) => result.status === 'rejected').reason.status, 409);
  assert.equal(await claim(bays[0]), null);
  assert.equal(await claim(bays[1]), b);
  await acceptQrRequest(db, bays[0].id, operation, network);
  assert.equal(await claim(bays[0]), null);
  await acceptQrRequest(db, bays[0].id, randomUUID(), network);
  const fresh = await claim(bays[0]);
  assert.notEqual(fresh, a);
  await rangeRef.update({ service_suspension: { suspended_at: new Date() } });
  await assert.rejects(acceptQrRequest(db, bays[1].id, randomUUID(), network), { status: 409 });
  await transitionRequest(db, b, 'complete', assignment, 'operator');
  assert.equal(await claim(bays[1]), null);
  assert.deepEqual((await cartRef.get()).data(), cartBefore);
  assert.equal((await db.collectionGroup('commands').get()).size, 0);
  assert.equal((await publicBay(db, bays[1].id)).bay_side, 'B');
  const batch = db.batch();
  for (let index = 0; index < 105; index++) batch.set(db.collection('requests').doc(), {
    customer_id: customer, course_id: cart, status: 'completed', received_at: new Date(), completed_at: new Date(),
  });
  for (let index = 0; index < 101; index++) batch.set(db.collection('requests').doc(), {
    customer_id: customer, course_id: cart, status: 'new', received_at: new Date(Date.now() - 86400000),
  });
  await batch.commit();
  const active = await db.collection('requests').where('customer_id', '==', customer)
    .where('course_id', '==', cart).where('status', 'in', ['new', 'confirmed']).orderBy('received_at').get();
  assert.equal(active.size, 101);
  const response = () => ({ statusCode: 200, set() { return this; }, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });
  const handler = createFairwayHandlers(db, { verifyOperatorToken: async (token) => ({ uid: token }),
    qrEnabled: true, qrRateKey: 'isolated-local-rate-key' }).fairwayButtonReceiver;
  const bypass = response();
  await handler({ method: 'POST', path: '/api/v1/sandbox/review-access' }, bypass);
  assert.equal(bypass.statusCode, 404);
  const unsigned = response();
  await handler({ method: 'GET', path: '/api/v1/operator/bootstrap', get: () => '' }, unsigned);
  assert.equal(unsigned.statusCode, 401);
  const bootstrap = response();
  await handler({ method: 'GET', path: '/api/v1/operator/bootstrap', get: () => 'Bearer operator' }, bootstrap);
  assert.equal(bootstrap.statusCode, 200);
  assert.equal(bootstrap.body.courses.length, 2);
  await db.terminate();
  console.log('PASS isolated native Firestore transactions: 52 mappings, concurrency/retries/races, independent A/B lifecycle, Course isolation, explicit notification opt-in/idempotent dispatch, Cart state/preferences, 101 active beyond 105 closed, zero commands and production bypass denial.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
