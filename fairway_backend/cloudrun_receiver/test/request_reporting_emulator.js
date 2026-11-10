'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { Firestore } = require('@google-cloud/firestore');
const { buildButtonReport, reportBounds } = require('../lib/button_activity_report');
const { reportCoursePeriods } = require('../lib/service_reporting');
const { listExcludedRequests, setRequestReportingState } = require('../lib/request_reporting');

const PROJECT_ID = 'demo-fairway-credential-lifecycle';
const EMULATOR_HOST = '127.0.0.1:8787';

async function assertEmulatorReachable() {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 8787 });
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('Local Firestore emulator did not respond within 1.5 seconds'));
    }, 1500);
    socket.once('connect', () => {
      clearTimeout(timeout);
      socket.end();
      resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function assertSafeEnvironment() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST must be the configured local loopback emulator');
  }
  const projectIds = [process.env.GOOGLE_CLOUD_PROJECT, process.env.GCLOUD_PROJECT].filter(Boolean);
  if (!projectIds.length || projectIds.some((projectId) => projectId !== PROJECT_ID)) {
    throw new Error('Cloud project environment must match the synthetic emulator project');
  }
  for (const name of [
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_OAUTH_ACCESS_TOKEN',
    'CLOUDSDK_AUTH_ACCESS_TOKEN',
    'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE',
    'GCLOUD_SERVICE_KEY',
    'GOOGLE_CLOUD_KEYFILE_JSON',
    'FIREBASE_TOKEN',
  ]) {
    if (process.env[name]) throw new Error(`Credential-bearing environment variable ${name} must be unset`);
  }
}

async function main() {
  assertSafeEnvironment();
  await assertEmulatorReachable();
  const db = new Firestore({ projectId: PROJECT_ID });
  const suffix = randomUUID();
  const customerId = `synthetic-exclusion-${suffix}`;
  const courseId = `course-${suffix}`;
  const adminUid = `admin-${suffix}`;
  const requestId = `button-${suffix}`;
  const course = { customer_id: customerId, course_id: courseId, course_name: 'Synthetic Course', timezone: 'UTC' };
  const customer = { customer_id: customerId, customer_name: 'Synthetic Customer' };
  const receivedAt = new Date('2026-10-22T18:00:00.000Z');
  const completedAt = new Date('2026-10-22T18:10:00.000Z');
  const requestRef = db.collection('requests').doc(requestId);

  try {
    await db.collection('customers').doc(customerId).set({ customer_name: customer.customer_name });
    await db.doc(`customers/${customerId}/courses/${courseId}`).set({
      course_name: course.course_name,
      timezone: course.timezone,
    });
    await requestRef.set({
      customer_id: customerId,
      course_id: courseId,
      device_id: 'FRB-SYNTHETIC',
      event_type: 'button_press',
      source: 'nrf9151',
      status: 'completed',
      received_at: receivedAt,
      completed_at: completedAt,
    });

    const input = (reportingState) => ({
      requestId,
      customerId,
      courseId,
      reportingState,
      adminUid,
    });
    const readReports = async () => {
      const snapshot = await db.collection('requests')
        .where('customer_id', '==', customerId)
        .where('course_id', '==', courseId)
        .get();
      const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const asOf = new Date('2026-10-22T23:59:00.000Z');
      const service = reportCoursePeriods(course, [], requests, requests, asOf);
      const bounds = reportBounds({ start_date: '2026-10-22', end_date: '2026-10-22' }, 'UTC', asOf);
      const button = buildButtonReport({
        customer,
        course,
        bounds,
        asOf,
        logs: [],
        requests,
        retentionStart: '2026-10-01T00:00:00.000Z',
      });
      return { button, service, requests };
    };

    assert.equal((await requestRef.get()).data().reporting_state, undefined);
    let reports = await readReports();
    assert.equal(reports.service.daily.summary.completed_requests, 1);
    assert.equal(reports.button.totals.completed, 1);

    await setRequestReportingState(db, input('excluded'));
    assert.deepEqual((await listExcludedRequests(db, customerId, courseId)).map((item) => item.id), [requestId]);
    reports = await readReports();
    assert.equal(reports.service.daily.summary.completed_requests, 0);
    assert.equal(reports.service.daily.history.length, 0);
    assert.equal(reports.button.totals.completed, 0);
    assert.equal((await requestRef.get()).data().status, 'completed');

    await setRequestReportingState(db, input('active'));
    assert.deepEqual(await listExcludedRequests(db, customerId, courseId), []);
    reports = await readReports();
    assert.equal(reports.service.daily.summary.completed_requests, 1);
    assert.equal(reports.service.daily.history.length, 1);
    assert.equal(reports.button.totals.completed, 1);

    const duplicateExclusions = await Promise.all([
      setRequestReportingState(db, input('excluded')),
      setRequestReportingState(db, input('excluded')),
    ]);
    assert.equal(duplicateExclusions.filter((result) => result.changed).length, 1);
    assert.equal((await requestRef.get()).data().reporting_state, 'excluded');

    await Promise.all([
      setRequestReportingState(db, input('active')),
      setRequestReportingState(db, input('excluded')),
    ]);
    const finalRequest = (await requestRef.get()).data();
    assert.ok(['active', 'excluded'].includes(finalRequest.reporting_state));
    assert.equal(finalRequest.status, 'completed');
    assert.equal(finalRequest.reporting_state_changed_by, adminUid);
    assert.ok(finalRequest.reporting_state_changed_at);

    const audit = await requestRef.collection('reporting_state_history').get();
    assert.ok(audit.size >= 3 && audit.size <= 5);
    assert.ok(audit.docs.every((doc) => {
      const transition = doc.data();
      return transition.admin_uid === adminUid &&
        ['active', 'excluded'].includes(transition.from_state) &&
        ['active', 'excluded'].includes(transition.to_state) &&
        transition.from_state !== transition.to_state &&
        Boolean(transition.changed_at);
    }));
    console.log('PASS: Firestore Emulator reporting exclusion, reports, audit and concurrent transitions');
  } finally {
    await db.terminate();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
