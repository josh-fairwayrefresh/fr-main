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
    { 'CUST-0001/COURSE-0001': false, 'CUST-0002/COURSE-0001': false }
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
