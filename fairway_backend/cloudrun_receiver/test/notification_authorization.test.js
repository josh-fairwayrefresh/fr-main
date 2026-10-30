'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const {
  getNotificationPreferences,
  getOperatorAssignment,
  isNotificationEnabled,
  registerPushSubscription,
  setNotificationPreference,
} = require('../lib/operator_notifications');

async function seedCourse(db, customerId, customerName) {
  await db.collection('customers').doc(customerId).set({ customer_name: customerName });
  await db.collection('customers').doc(customerId).collection('courses').doc('COURSE-0001')
    .set({ course_name: `${customerName} Course` });
}

test('notification preferences and subscriptions remain independent for duplicate Course IDs', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'Customer One');
  await seedCourse(db, 'CUST-0002', 'Customer Two');
  await db.collection('user_access').doc('staff').set({
    schema_version: 2,
    admin: true,
    customer_id: null,
    course_ids: [],
  });
  const assignment = await getOperatorAssignment(db, 'staff');

  await db.collection('user_notification_preferences').doc('staff')
    .collection('courses').doc('COURSE-0001').set({ enabled: true });
  assert.deepEqual(
    await getNotificationPreferences(db, 'staff', assignment.courses),
    { 'CUST-0001/COURSE-0001': true, 'CUST-0002/COURSE-0001': true }
  );
  await setNotificationPreference(db, 'staff', 'CUST-0001', 'COURSE-0001', true);
  await setNotificationPreference(db, 'staff', 'CUST-0002', 'COURSE-0001', false);
  const preferences = await getNotificationPreferences(db, 'staff', assignment.courses);
  assert.deepEqual(preferences, {
    'CUST-0001/COURSE-0001': true,
    'CUST-0002/COURSE-0001': false,
  });
  assert.equal(await isNotificationEnabled(db, 'staff', 'CUST-0002', 'COURSE-0001'), false);

  const subscription = {
    endpoint: 'https://push.example.test/shared-device',
    keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
  };
  await registerPushSubscription(db, 'staff', {
    customerId: 'CUST-0001',
    courseId: 'COURSE-0001',
    subscription,
    vapidKeyVersion: 'v1',
  });
  await registerPushSubscription(db, 'staff', {
    customerId: 'CUST-0002',
    courseId: 'COURSE-0001',
    subscription,
    vapidKeyVersion: 'v1',
  });
  const subscriptions = await db.collection('course_push_subscriptions').doc('COURSE-0001')
    .collection('subscriptions').get();
  assert.deepEqual(subscriptions.docs.map((doc) => doc.data().customer_id).sort(), ['CUST-0001', 'CUST-0002']);
});

test('Admin subscription registration is global while Customer registration is Customer/Course scoped', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'Customer One');
  await seedCourse(db, 'CUST-0002', 'Customer Two');
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0002')
    .set({ course_name: 'Customer One Second Course' });
  await db.collection('user_access').doc('admin').set({
    schema_version: 2,
    admin: true,
    customer_id: null,
    course_ids: [],
  });
  await db.collection('user_access').doc('customer').set({
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: ['COURSE-0001'],
  });

  const subscription = (endpoint) => ({
    endpoint: `https://push.example.test/${endpoint}`,
    keys: { auth: 'auth-key', p256dh: 'p256dh-key' },
  });
  assert.equal((await registerPushSubscription(db, 'admin', {
    customerId: 'CUST-0002',
    courseId: 'COURSE-0001',
    subscription: subscription('admin-global'),
    vapidKeyVersion: 'v1',
  })).status, 'active');
  assert.equal((await registerPushSubscription(db, 'customer', {
    customerId: 'CUST-0001',
    courseId: 'COURSE-0001',
    subscription: subscription('customer-assigned'),
    vapidKeyVersion: 'v1',
  })).status, 'active');

  await assert.rejects(registerPushSubscription(db, 'customer', {
    customerId: 'CUST-0001',
    courseId: 'COURSE-0002',
    subscription: subscription('customer-unassigned'),
    vapidKeyVersion: 'v1',
  }), /not authorized/);
  await assert.rejects(registerPushSubscription(db, 'customer', {
    customerId: 'CUST-0002',
    courseId: 'COURSE-0001',
    subscription: subscription('customer-foreign'),
    vapidKeyVersion: 'v1',
  }), /not authorized/);
});

test('a Customer user cannot change another Customer’s preference for an identically named Course', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'Customer One');
  await seedCourse(db, 'CUST-0002', 'Customer Two');
  await db.collection('user_access').doc('customer').set({
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: [],
  });

  await assert.rejects(
    setNotificationPreference(db, 'customer', 'CUST-0002', 'COURSE-0001', true),
    /not authorized/
  );
});

test('legacy Course preference remains effective for an active scoped subscription without user access', async () => {
  const db = new FakeFirestore();
  await db.collection('course_push_subscriptions').doc('COURSE-0001')
    .collection('subscriptions').doc('subscription').set({
      operator_uid: 'legacy-operator',
      customer_id: 'CUST-0001',
      course_id: 'COURSE-0001',
      status: 'active',
    });
  await db.collection('user_notification_preferences').doc('legacy-operator')
    .collection('courses').doc('COURSE-0001').set({ enabled: false });

  assert.equal(await isNotificationEnabled(db, 'legacy-operator', 'CUST-0001', 'COURSE-0001'), false);

  await db.collection('user_notification_preferences').doc('legacy-operator')
    .collection('courses').doc('COURSE-0001').set({ enabled: true });
  assert.equal(await isNotificationEnabled(db, 'legacy-operator', 'CUST-0001', 'COURSE-0001'), true);
});

test('legacy Course-only preference keeps its value regardless of active subscriptions across Customers', async () => {
  const db = new FakeFirestore();
  for (const customerId of ['CUST-0001', 'CUST-0002']) {
    await db.collection('course_push_subscriptions').doc('COURSE-0001')
      .collection('subscriptions').doc(`subscription-${customerId}`).set({
        operator_uid: 'legacy-admin',
        customer_id: customerId,
        course_id: 'COURSE-0001',
        status: 'active',
      });
  }
  await db.collection('user_notification_preferences').doc('legacy-admin')
    .collection('courses').doc('COURSE-0001').set({ enabled: false });

  assert.equal(await isNotificationEnabled(db, 'legacy-admin', 'CUST-0001', 'COURSE-0001'), false);
  assert.equal(await isNotificationEnabled(db, 'legacy-admin', 'CUST-0002', 'COURSE-0001'), false);

  await db.collection('user_notification_preferences').doc('legacy-admin')
    .collection('courses').doc('COURSE-0001').set({ enabled: true });
  assert.equal(await isNotificationEnabled(db, 'legacy-admin', 'CUST-0001', 'COURSE-0001'), true);
  assert.equal(await isNotificationEnabled(db, 'legacy-admin', 'CUST-0002', 'COURSE-0001'), true);
});
