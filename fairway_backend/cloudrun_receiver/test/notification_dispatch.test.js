'use strict';

const assert = require('assert');
const { FakeFirestore } = require('./fake_firestore');
const {
  dispatchRequestNotifications,
  notificationTopic,
} = require('../lib/notification_dispatch');

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push({ name, fn });
}

async function seedRequestAndSubscription(db) {
  await db.collection('requests').doc('request-a').set({
    event_type: 'button_press',
    course_id: 'COURSE-0001',
    course_name: 'Tony Lema Course',
    device_label: 'Hole 7',
    hole: 7,
    status: 'new',
  });
  await db.collection('course_push_subscriptions').doc('COURSE-0001')
    .collection('subscriptions').doc('subscription-a').set({
      endpoint: 'https://push.example.test/device-a',
      keys: { auth: 'auth-a', p256dh: 'p256dh-a' },
      status: 'active',
    });
}

test('dispatch sends one useful notification and does not mutate the request', async () => {
  const db = new FakeFirestore();
  await seedRequestAndSubscription(db);
  const before = (await db.collection('requests').doc('request-a').get()).data();
  const sends = [];

  const result = await dispatchRequestNotifications(db, 'request-a', async (...args) => {
    sends.push(args);
    return { statusCode: 201 };
  }, new Date('2026-09-30T12:00:00.000Z'));

  assert.deepStrictEqual(result, { accepted: 1, subscriptions: 1 });
  assert.strictEqual(sends.length, 1);
  const payload = JSON.parse(sends[0][1]);
  assert.strictEqual(payload.body, 'Refresh requested — Hole 7');
  assert.strictEqual(payload.tag, 'request-a');
  assert.strictEqual(payload.url, '/requests/request-a?course=COURSE-0001');
  assert.deepStrictEqual(sends[0][2], {
    TTL: 300,
    urgency: 'high',
    topic: notificationTopic('request-a'),
  });
  const after = (await db.collection('requests').doc('request-a').get()).data();
  assert.deepStrictEqual(after, before);
});

test('accepted dispatch identity prevents a repeated trigger from sending again', async () => {
  const db = new FakeFirestore();
  await seedRequestAndSubscription(db);
  let sends = 0;
  const sender = async () => { sends += 1; };

  await dispatchRequestNotifications(db, 'request-a', sender);
  await dispatchRequestNotifications(db, 'request-a', sender);

  assert.strictEqual(sends, 1);
});

test('active Firestore Timestamp lease prevents a concurrent send', async () => {
  const db = new FakeFirestore();
  await seedRequestAndSubscription(db);
  await db.collection('notification_dispatches').doc('request-a')
    .collection('subscriptions').doc('subscription-a').set({
      status: 'sending',
      attempts: 1,
      lease_until: { toDate: () => new Date('2026-09-30T12:01:00.000Z') },
    });
  let sends = 0;

  const result = await dispatchRequestNotifications(
    db,
    'request-a',
    async () => { sends += 1; },
    new Date('2026-09-30T12:00:30.000Z')
  );

  assert.deepStrictEqual(result, { accepted: 0, subscriptions: 1 });
  assert.strictEqual(sends, 0);
});

test('expired subscription is revoked without changing the request', async () => {
  const db = new FakeFirestore();
  await seedRequestAndSubscription(db);
  const before = (await db.collection('requests').doc('request-a').get()).data();
  await dispatchRequestNotifications(db, 'request-a', async () => {
    const error = new Error('expired');
    error.statusCode = 410;
    throw error;
  });

  const subscription = await db.collection('course_push_subscriptions').doc('COURSE-0001')
    .collection('subscriptions').doc('subscription-a').get();
  assert.strictEqual(subscription.data().status, 'revoked');
  assert.deepStrictEqual((await db.collection('requests').doc('request-a').get()).data(), before);
});

test('transient delivery retries are bounded at five attempts', async () => {
  const db = new FakeFirestore();
  await seedRequestAndSubscription(db);
  let sends = 0;
  const sender = async () => {
    sends += 1;
    const error = new Error('unavailable');
    error.statusCode = 503;
    throw error;
  };

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await assert.rejects(() => dispatchRequestNotifications(db, 'request-a', sender), /Transient/);
  }
  await dispatchRequestNotifications(db, 'request-a', sender);
  await dispatchRequestNotifications(db, 'request-a', sender);

  assert.strictEqual(sends, 5);
  const dispatch = await db.collection('notification_dispatches').doc('request-a')
    .collection('subscriptions').doc('subscription-a').get();
  assert.strictEqual(dispatch.data().status, 'terminal_failure');
  assert.strictEqual(dispatch.data().attempts, 5);
});

(async () => {
  for (const { name, fn } of pending) {
    try {
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
  if (failed > 0) process.exitCode = 1;
})();