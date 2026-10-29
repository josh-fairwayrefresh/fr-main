'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { FakeFirestore } = require('./fake_firestore');
const { setNotificationPreference } = require('../lib/operator_notifications');

const PROJECT_ID = 'fairway-refresh-sandbox-test';
const CUSTOMER_ID = 'CUST-NOTIFIER-TEST';
const COURSE_ID = 'COURSE-NOTIFIER-TEST';
const OPERATOR_UID = 'operator-notifier-test';
const db = new FakeFirestore();
const deliveries = [];
let registeredHandler;
let registeredName;
let vapidConfiguration;

const webpush = {
  setVapidDetails(...args) {
    vapidConfiguration = args;
  },
  async sendNotification(subscription, payload, options) {
    deliveries.push({ subscription, payload: JSON.parse(payload), options });
    return { statusCode: 201 };
  },
};

const originalLoad = Module._load;
Module._load = function loadNotifierDependencies(request, parent, isMain) {
  if (request === '@google-cloud/functions-framework') {
    return {
      cloudEvent(name, handler) {
        registeredName = name;
        registeredHandler = handler;
      },
    };
  }
  if (request === '@google-cloud/firestore') {
    return {
      Firestore: class TestFirestore {
        constructor({ projectId }) {
          assert.equal(projectId, PROJECT_ID);
          return db;
        }
      },
    };
  }
  if (request === 'web-push') return webpush;
  return originalLoad.call(this, request, parent, isMain);
};

process.env.FAIRWAY_ENV = 'sandbox';
process.env.FAIRWAY_GCP_PROJECT = PROJECT_ID;
process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
process.env.FAIRWAY_VAPID_SUBJECT = 'mailto:test@example.invalid';
process.env.FAIRWAY_VAPID_PUBLIC_KEY = 'synthetic-public-key';
process.env.FAIRWAY_VAPID_PRIVATE_KEY = 'synthetic-private-key';

try {
  require('../notifier');
} finally {
  Module._load = originalLoad;
}

const { requestIdFromEvent } = require('../notifier');

assert.equal(
  requestIdFromEvent({ subject: 'documents/requests/request-123', data: Buffer.from('protobuf') }),
  'request-123',
);
assert.equal(
  requestIdFromEvent({
    data: { value: { name: 'projects/test/databases/(default)/documents/requests/request-456' } },
  }),
  'request-456',
);
assert.throws(
  () => requestIdFromEvent({ subject: 'documents/devices/FRB-0002' }),
  /does not identify a request document/,
);

function requestEvent(requestId) {
  return {
    subject: `projects/${PROJECT_ID}/databases/(default)/documents/requests/${requestId}`,
    data: Buffer.from('synthetic Firestore protobuf payload'),
  };
}

async function seedRequest(requestId, overrides = {}) {
  await db.collection('requests').doc(requestId).set({
    event_type: 'button_press',
    customer_id: CUSTOMER_ID,
    course_id: COURSE_ID,
    course_name: 'Synthetic Notifier Course',
    device_label: 'Hole 7',
    source: 'nrf9151',
    status: 'new',
    ...overrides,
  });
}

async function main() {
  assert.equal(registeredName, 'fairwayRequestNotifier');
  assert.equal(typeof registeredHandler, 'function');

  await db.collection('customers').doc(CUSTOMER_ID).set({ customer_name: 'Synthetic Customer' });
  await db.collection('customers').doc(CUSTOMER_ID).collection('courses').doc(COURSE_ID)
    .set({ course_name: 'Synthetic Notifier Course', service_suspension: null });
  await db.collection('customers').doc(CUSTOMER_ID).collection('courses').doc('COURSE-NOTIFIER-OTHER')
    .set({ course_name: 'Synthetic Other Course' });
  await db.collection('user_access').doc(OPERATOR_UID).set({
    schema_version: 2,
    admin: false,
    customer_id: CUSTOMER_ID,
    course_ids: [COURSE_ID],
  });
  await db.collection('course_push_subscriptions').doc(COURSE_ID)
    .collection('subscriptions').doc('subscription-notifier-test').set({
      operator_uid: OPERATOR_UID,
      customer_id: CUSTOMER_ID,
      course_id: COURSE_ID,
      endpoint: 'https://push.example.invalid/notifier-test',
      keys: { auth: 'synthetic-auth', p256dh: 'synthetic-p256dh' },
      status: 'active',
    });
  await setNotificationPreference(db, OPERATOR_UID, CUSTOMER_ID, COURSE_ID, true);

  await seedRequest('accepted-trigger-test');
  await seedRequest('rejected-trigger-test', {
    status: 'rejected',
    rejection_reason: 'service_suspended',
    service_state_at_receipt: { active: false, suspended: true, service_group: 'on_course' },
  });

  const acceptedResult = await registeredHandler(requestEvent('accepted-trigger-test'));
  await db.collection('customers').doc(CUSTOMER_ID).collection('courses').doc(COURSE_ID)
    .update({ service_suspension: { suspended_at: new Date('2026-10-29T18:00:00.000Z') } });
  const rejectedResult = await registeredHandler(requestEvent('rejected-trigger-test'));
  assert.deepEqual(acceptedResult, { accepted: 1, subscriptions: 1 });
  assert.deepEqual(rejectedResult, { accepted: 1, subscriptions: 1 });
  assert.deepEqual(deliveries.map(({ payload }) => payload.title), [
    'Fairway Refresh',
    'Request Rejected — Service Suspended',
  ]);
  assert.equal(deliveries[1].payload.body, 'Service-suspended request — Hole 7');
  assert.equal(deliveries[1].payload.url,
    '/requests/rejected-trigger-test?customer_id=CUST-NOTIFIER-TEST&course_id=COURSE-NOTIFIER-TEST');
  assert.deepEqual(vapidConfiguration, [
    'mailto:test@example.invalid',
    'synthetic-public-key',
    'synthetic-private-key',
  ]);

  await setNotificationPreference(db, OPERATOR_UID, CUSTOMER_ID, COURSE_ID, false);
  await seedRequest('accepted-disabled-preference-test');
  await seedRequest('rejected-disabled-preference-test', {
    status: 'rejected',
    rejection_reason: 'service_suspended',
    service_state_at_receipt: { active: false, suspended: true, service_group: 'on_course' },
  });
  assert.deepEqual(
    await registeredHandler(requestEvent('accepted-disabled-preference-test')),
    { accepted: 0, subscriptions: 1 },
  );
  assert.deepEqual(
    await registeredHandler(requestEvent('rejected-disabled-preference-test')),
    { accepted: 0, subscriptions: 1 },
  );
  assert.equal(deliveries.length, 2);

  await setNotificationPreference(db, OPERATOR_UID, CUSTOMER_ID, COURSE_ID, true);
  await db.collection('user_access').doc(OPERATOR_UID).update({
    course_ids: ['COURSE-NOTIFIER-OTHER'],
  });
  await seedRequest('accepted-unauthorized-test');
  await seedRequest('rejected-unauthorized-test', {
    status: 'rejected',
    rejection_reason: 'service_suspended',
    service_state_at_receipt: { active: false, suspended: true, service_group: 'on_course' },
  });
  assert.deepEqual(
    await registeredHandler(requestEvent('accepted-unauthorized-test')),
    { accepted: 0, subscriptions: 1 },
  );
  assert.deepEqual(
    await registeredHandler(requestEvent('rejected-unauthorized-test')),
    { accepted: 0, subscriptions: 1 },
  );
  assert.equal(deliveries.length, 2);

  assert.equal((await db.collection('notification_dispatches').doc('rejected-trigger-test')
    .collection('subscriptions').doc('subscription-notifier-test').get()).data().status, 'accepted');
  assert.equal((await db.collection('notification_dispatches').doc('rejected-disabled-preference-test')
    .collection('subscriptions').get()).size, 0);
  assert.equal((await db.collection('notification_dispatches').doc('rejected-unauthorized-test')
    .collection('subscriptions').get()).size, 0);
  assert.equal((await db.collection('shifts').get()).size, 0);

  console.log('2 trigger deliveries passed; disabled preference and unauthorized access blocked both request types');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
