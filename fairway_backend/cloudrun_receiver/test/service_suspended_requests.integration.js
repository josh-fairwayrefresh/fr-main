'use strict';

const assert = require('node:assert/strict');
const { Firestore } = require('@google-cloud/firestore');
const { createFairwayHandlers } = require('../index');
const { generateDeviceCredential } = require('../lib/fleet/credentials');
const { dispatchRequestNotifications } = require('../lib/notification_dispatch');
const { setNotificationPreference } = require('../lib/operator_notifications');
const { reportCoursePeriods } = require('../lib/service_reporting');

const PROJECT_ID = 'fairway-refresh-sandbox-test';
const CUSTOMER_ID = 'CUST-SUSPENDED-TEST';
const COURSE_ID = 'COURSE-SUSPENDED-TEST';
const DEVICE_ID = 'FRB-SUSPENDED-TEST';
const OPERATOR_UID = 'operator-suspended-test';

function response() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
    set() { return this; },
  };
}

function request({ method = 'POST', path = '/', body = {}, headers = {}, query = {} } = {}) {
  return {
    method,
    path,
    body,
    query,
    get(name) { return headers[name.toLowerCase()] || headers[name]; },
  };
}

async function main() {
  if (process.env.GOOGLE_CLOUD_PROJECT !== PROJECT_ID ||
      process.env.GCLOUD_PROJECT !== PROJECT_ID ||
      !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '') ||
      !process.env.FIRESTORE_EMULATOR_HOST.endsWith(':8787')) {
    throw new Error('Requires the designated sandbox test project and loopback Firestore emulator on port 8787');
  }

  const db = new Firestore({ projectId: PROJECT_ID });
  try {
    const courseRef = db.doc(`customers/${CUSTOMER_ID}/courses/${COURSE_ID}`);
    await db.doc(`customers/${CUSTOMER_ID}`).set({ customer_name: 'Synthetic Service Test' });
    await courseRef.set({
      course_name: 'Synthetic Service Course',
      timezone: 'America/Los_Angeles',
      service_schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' },
      service_suspension: null,
    });
    const { secret, verifier } = generateDeviceCredential();
    await db.doc(`devices/${DEVICE_ID}`).set({
      state: 'deployed',
      credential: verifier,
      customer_id: CUSTOMER_ID,
      course_id: COURSE_ID,
      course_name: 'Synthetic Service Course',
      service_group: 'on_course',
      location: { type: 'hole', hole: 7 },
    });
    await db.doc(`user_access/${OPERATOR_UID}`).set({
      schema_version: 2,
      admin: false,
      customer_id: CUSTOMER_ID,
      course_ids: [COURSE_ID],
    });
    await db.doc(`course_push_subscriptions/${COURSE_ID}/subscriptions/synthetic`).set({
      operator_uid: OPERATOR_UID,
      customer_id: CUSTOMER_ID,
      course_id: COURSE_ID,
      endpoint: 'https://push.example.test/synthetic',
      keys: { auth: 'synthetic-auth', p256dh: 'synthetic-p256dh' },
      status: 'active',
    });
    await setNotificationPreference(db, OPERATOR_UID, CUSTOMER_ID, COURSE_ID, true);

    const { handleDeviceEvent, fairwayButtonReceiver } = createFairwayHandlers(db, {
      verifyOperatorToken: async (token) => ({ uid: token }),
      now: () => new Date('2026-10-29T18:00:00.000Z'),
    });
    const sendNotification = async (_subscription, encoded) => {
      notifications.push(JSON.parse(encoded));
    };
    const notifications = [];
    const sendDevicePress = async () => {
      const res = response();
      await handleDeviceEvent(request({
        body: { device_id: DEVICE_ID, event_type: 'button_press' },
        headers: { 'x-fairway-device-key': secret },
      }), res);
      return res;
    };

    const accepted = await sendDevicePress();
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.body.status, 'accepted');
    let acceptedRecord = await db.doc(`requests/${accepted.body.request_id}`).get();
    assert.equal(acceptedRecord.data().status, 'new');
    const acceptedNotice = await dispatchRequestNotifications(
      db, accepted.body.request_id, sendNotification,
    );
    assert.equal(acceptedNotice.accepted, 1);
    assert.equal(notifications.at(-1).title, 'Fairway Refresh');

    await courseRef.update({ service_suspension: { suspended_at: new Date() } });
    const rejectedResponses = await Promise.all([sendDevicePress(), sendDevicePress()]);
    assert.deepEqual(rejectedResponses.map((res) => res.statusCode), [503, 503]);
    const rejectedIds = rejectedResponses.map((res) => res.body.request_id);
    assert.notEqual(rejectedIds[0], rejectedIds[1]);
    for (const id of rejectedIds) {
      const record = await db.doc(`requests/${id}`).get();
      assert.equal(record.data().status, 'rejected');
      assert.equal(record.data().rejection_reason, 'service_suspended');
      assert.deepEqual(record.data().service_state_at_receipt, {
        active: false, suspended: true, service_group: 'on_course',
      });
      assert.equal(record.data().demand_window_expires_at, null);
      assert.equal((await dispatchRequestNotifications(db, id, sendNotification)).accepted, 1);
      assert.equal(notifications.at(-1).title, 'Request Rejected — Service Suspended');
      assert.match(notifications.at(-1).body, /Hole 7/);
      assert.match(notifications.at(-1).url, new RegExp(id));
    }

    for (const id of rejectedIds) {
      for (const action of ['complete', 'cancel']) {
        const res = response();
        await fairwayButtonReceiver(request({
          path: `/api/v1/requests/${id}/${action}`,
          headers: { authorization: `Bearer ${OPERATOR_UID}` },
        }), res);
        assert.equal(res.statusCode, 409);
      }
    }
    await db.doc('user_access/foreign-suspended-test').set({
      schema_version: 2, admin: false, customer_id: 'CUST-OTHER-TEST', course_ids: ['COURSE-OTHER-TEST'],
    });
    await db.doc('customers/CUST-OTHER-TEST').set({ customer_name: 'Other synthetic customer' });
    await db.doc('customers/CUST-OTHER-TEST/courses/COURSE-OTHER-TEST').set({
      course_name: 'Other synthetic course', timezone: 'America/Los_Angeles',
    });

    const clear = async (id, uid = OPERATOR_UID) => {
      const res = response();
      await fairwayButtonReceiver(request({
        path: `/api/v1/requests/${id}/clear-rejected`,
        headers: { authorization: `Bearer ${uid}` },
      }), res);
      return res;
    };
    assert.equal((await clear(rejectedIds[0])).statusCode, 200);
    assert.equal((await clear(rejectedIds[0])).statusCode, 200);
    assert.equal((await clear(rejectedIds[1], 'foreign-suspended-test')).statusCode, 403);
    const cleared = await db.doc(`requests/${rejectedIds[0]}`).get();
    assert.equal(cleared.data().status, 'rejected');
    assert.equal(cleared.data().rejected_cleared_by, OPERATOR_UID);
    assert.ok(cleared.data().rejected_cleared_at);
    const active = await db.collection('requests')
      .where('customer_id', '==', CUSTOMER_ID)
      .where('course_id', '==', COURSE_ID)
      .where('status', 'in', ['new', 'confirmed', 'rejected'])
      .get();
    const activeCards = active.docs.filter((document) => (
      ['new', 'confirmed'].includes(document.data().status) ||
      (document.data().status === 'rejected' && !document.data().rejected_cleared_at)
    ));
    assert.deepEqual(activeCards.map((document) => document.id).sort(), [
      accepted.body.request_id, rejectedIds[1],
    ].sort());

    await courseRef.update({ service_suspension: null });
    const afterResume = await db.doc(`requests/${rejectedIds[1]}`).get();
    assert.equal(afterResume.data().status, 'rejected');
    const resumedPress = await sendDevicePress();
    assert.equal(resumedPress.statusCode, 200);
    assert.equal(resumedPress.body.status, 'accepted');
    assert.notEqual(resumedPress.body.request_id, rejectedIds[1]);

    const reportingAt = new Date('2026-10-29T20:00:00.000Z');
    const completed = {
      request_id: 'synthetic-completed',
      status: 'completed',
      received_at: new Date('2026-10-29T17:10:00.000Z'),
      completed_at: new Date('2026-10-29T17:20:00.000Z'),
    };
    const history = [completed, ...rejectedIds.map((id) => ({
      request_id: id,
      status: 'rejected',
      rejection_reason: 'service_suspended',
      received_at: new Date('2026-10-29T18:00:00.000Z'),
      rejected_cleared_at: id === rejectedIds[0] ? new Date() : null,
    }))];
    const report = reportCoursePeriods(
      { timezone: 'America/Los_Angeles' },
      [
        { type: 'resumed', recorded_at: new Date('2026-10-29T16:00:00.000Z') },
        { type: 'suspended', recorded_at: new Date('2026-10-29T17:00:00.000Z') },
      ],
      [completed],
      history,
      reportingAt,
    );
    assert.equal(report.daily.summary.completed_requests, 1);
    assert.equal(report.daily.summary.active_cart_hours, 1);
    assert.deepEqual(
      report.daily.history.filter((item) => item.status === 'rejected').map((item) => item.request_id).sort(),
      rejectedIds.sort(),
    );
    assert.equal((await db.doc(`requests/${rejectedIds[0]}`).get()).data().status, 'rejected');
    console.log('PASS real Firestore emulator lifecycle: ON acceptance, suspended persistence, separate attempts, notifications, no-shift delivery path, forbidden completion/cancellation, authorized durable clear, Course isolation, post-resume rejection, historical visibility and unchanged completion/service-hour metrics.');
  } finally {
    await db.terminate();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
