'use strict';

const assert = require('node:assert/strict');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { cutoverCourse, transitionCourseService } = require('../lib/service_control');
const { generateDeviceCredential } = require('../lib/fleet/credentials');
const { createFairwayHandlers } = require('../index');

const PROJECT_ID = 'demo-fairway-credential-lifecycle';
const EMULATOR_HOST = '127.0.0.1:8787';
const runId = `svc_${Date.now()}_${process.pid}`;
const customerId = `test_${runId}`;
const courseId = `course_${runId}`;
const firstDeviceId = `first_${runId}`;
const secondDeviceId = `second_${runId}`;
const inconsistentDeviceId = `inconsistent_${runId}`;
const operatorId = `operator_${runId}`;

function requireSafeEnvironment() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST must be the configured local loopback emulator');
  }
  const runtimeSandboxProject = 'fairway-refresh-sandbox-test';
  if (process.env.FAIRWAY_ENV !== 'sandbox' ||
      process.env.FAIRWAY_GCP_PROJECT !== runtimeSandboxProject ||
      process.env.GOOGLE_CLOUD_PROJECT !== runtimeSandboxProject ||
      process.env.GCLOUD_PROJECT !== PROJECT_ID) {
    throw new Error('Backend handler environment must be the designated synthetic sandbox');
  }
  const projectIds = [
    process.env.GCLOUD_PROJECT,
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.CLOUDSDK_CORE_PROJECT,
    process.env.FIREBASE_PROJECT,
  ].filter(Boolean);
  if (!projectIds.length || projectIds.some((value) =>
    ![PROJECT_ID, runtimeSandboxProject].includes(value))) {
    throw new Error('Cloud project environment contains an unapproved project');
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
    if (process.env[name]) {
      throw new Error(`Credential-bearing environment variable ${name} must be unset`);
    }
  }
  if (process.env.FIREBASE_CONFIG) {
    let config;
    try {
      config = JSON.parse(process.env.FIREBASE_CONFIG);
    } catch {
      throw new Error('FIREBASE_CONFIG must be valid emulator-injected JSON');
    }
    if (config.projectId !== PROJECT_ID || config.credential || config.serviceAccount) {
      throw new Error('FIREBASE_CONFIG is not an isolated synthetic project configuration');
    }
  }
}

requireSafeEnvironment();

const db = new Firestore({ projectId: PROJECT_ID });
const courseRef = db.collection('customers').doc(customerId).collection('courses').doc(courseId);

async function deleteCollection(collectionRef) {
  const snapshot = await collectionRef.get();
  for (const document of snapshot.docs) {
    await document.ref.delete();
  }
}

async function cleanTestRecords() {
  for (const name of ['service_intervals', 'service_events', 'service_operations']) {
    await deleteCollection(courseRef.collection(name));
  }
  await courseRef.delete();
  await db.collection('customers').doc(customerId).delete();
  await db.collection('devices').doc(firstDeviceId).delete();
  await db.collection('devices').doc(secondDeviceId).delete();
  await db.collection('devices').doc(inconsistentDeviceId).delete();
  await db.collection('user_access').doc(operatorId).delete();
  const requests = await db.collection('requests').where('customer_id', '==', customerId).get();
  for (const requestDocument of requests.docs) {
    if (requestDocument.data().course_id !== courseId) continue;
    // eslint-disable-next-line no-await-in-loop
    await requestDocument.ref.delete();
  }
}

function response() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = value; return this; },
    set() { return this; },
  };
}

function request({ body = {}, headers = {}, method = 'POST', path = '/', query = {} } = {}) {
  return {
    body,
    headers,
    method,
    path,
    query,
    get(name) { return headers[name.toLowerCase()] || headers[name]; },
  };
}

async function seedDevice(deviceId) {
  const { secret, verifier } = generateDeviceCredential();
  await db.collection('devices').doc(deviceId).set({
    state: 'deployed',
    credential: verifier,
    customer_id: customerId,
    course_id: courseId,
    course_name: 'Synthetic test course',
    location: { type: 'hole', hole: 1 },
  });
  return secret;
}

async function main() {
  try {
    const customerRef = db.collection('customers').doc(customerId);
    await customerRef.set({ customer_name: 'Synthetic service-control test' });
    await courseRef.set({
      course_name: 'Synthetic test course',
      timezone: 'America/Los_Angeles',
      service_schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' },
    });

    await assert.rejects(
      cutoverCourse(db, {
        customerId, courseId, fieldValue: FieldValue, enabled: false,
      }),
      (error) => error.code === 'service_control_not_activated'
    );
    let course = (await courseRef.get()).data();
    assert.equal(course.service_schema_version, undefined, 'disabled activation gate must not migrate');
    assert.ok(course.service_schedule, 'disabled activation gate must preserve legacy schedule');

    const preview = await cutoverCourse(db, {
      customerId,
      courseId,
      fieldValue: FieldValue,
      enabled: true,
      dryRun: true,
    });
    assert.equal(preview.dry_run, true);
    assert.equal(preview.customer_id, customerId);
    assert.equal(preview.course_id, courseId);
    assert.equal(preview.already_initialized, false);
    assert.equal(preview.service_state.active, true);
    course = (await courseRef.get()).data();
    assert.equal(course.service_schema_version, undefined, 'preflight must not migrate');
    assert.ok(course.service_schedule, 'preflight must preserve legacy eligibility');

    const firstSecret = await seedDevice(firstDeviceId);
    const handlers = createFairwayHandlers(db, {
      serviceControlV2Active: true,
      verifyOperatorToken: async () => ({ uid: operatorId }),
    });
    const requestResponse = response();
    const cutoverPromise = cutoverCourse(db, {
      customerId,
      courseId,
      fieldValue: FieldValue,
      enabled: true,
    });
    const requestPromise = handlers.handleDeviceEvent(request({
      body: { device_id: firstDeviceId, event_type: 'button_press' },
      headers: { 'x-fairway-device-key': firstSecret },
    }), requestResponse);
    const [cutover] = await Promise.all([cutoverPromise, requestPromise]);
    assert.equal(cutover.already_initialized, false);
    assert.equal(cutover.service_state.active, true);
    const migrationEvent = await courseRef.collection('service_events').doc('migration-baseline-v2').get();
    const baseline = await courseRef.collection('service_intervals').doc('migration-baseline-v2').get();
    assert.equal(migrationEvent.data().migration_evidence, true);
    assert.equal(migrationEvent.data().type, 'migration_baseline');
    assert.equal(baseline.data().start_source, 'migration_baseline');
    assert.equal(requestResponse.statusCode, 200, 'request at active migration boundary must be accepted');
    const preCutoverRequest = await db.collection('requests').doc(requestResponse.body.request_id).get();
    assert.ok(['legacy_schedule_pre_cutover', 'service_control_v2'].includes(
      preCutoverRequest.data().service_acceptance_source
    ));

    const secondSecret = await seedDevice(secondDeviceId);
    await db.collection('user_access').doc(operatorId).set({
      schema_version: 2,
      admin: false,
      customer_id: customerId,
      course_ids: [courseId],
    });
    const racingRequest = response();
    const racingRequestPromise = handlers.handleDeviceEvent(request({
      body: { device_id: secondDeviceId, event_type: 'button_press' },
      headers: { 'x-fairway-device-key': secondSecret },
    }), racingRequest);
    const suspendOperationId = `suspend_${runId}`;
    const suspendPromise = transitionCourseService(db, {
      customerId,
      courseId,
      actorId: operatorId,
      action: 'suspend',
      operationId: suspendOperationId,
      expectedGeneration: 0,
      fieldValue: FieldValue,
    });
    await Promise.all([racingRequestPromise, suspendPromise]);
    assert.equal(racingRequest.statusCode === 200 || racingRequest.statusCode === 503, true);

    const racingRequests = await db.collection('requests').where('device_id', '==', secondDeviceId).get();
    if (racingRequest.statusCode === 200) {
      assert.equal(racingRequests.size, 1);
      assert.equal(racingRequests.docs[0].data().service_acceptance_generation, 0);
      const completeResponse = response();
      await handlers.updateRequestStatus(request({
        method: 'POST',
        path: `/api/v1/operator/requests/${racingRequests.docs[0].id}/complete`,
        headers: { authorization: 'Bearer synthetic-token' },
      }), completeResponse, racingRequests.docs[0].id, 'complete');
      assert.equal(completeResponse.statusCode, 200, 'same-day accepted work remains completable after Suspend');
    } else {
      assert.equal(racingRequests.size, 0, 'a request losing the race to Suspend must not persist');
    }

    const actions = [
      { action: 'resume', operationId: `resume_${runId}` },
      { action: 'resume', operationId: `replay_${runId}` },
    ];
    const results = await Promise.allSettled(actions.map(({ action, operationId }) =>
      transitionCourseService(db, {
        customerId,
        courseId,
        actorId: operatorId,
        action,
        operationId,
        expectedGeneration: 1,
        fieldValue: FieldValue,
      })
    ));
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'only one concurrent operation may win the generation');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.code, 'service_generation_conflict');

    const winnerIndex = results.findIndex((result) => result.status === 'fulfilled');
    const winner = actions[winnerIndex];
    const replay = await transitionCourseService(db, {
      customerId,
      courseId,
      actorId: operatorId,
      action: winner.action,
      operationId: winner.operationId,
      expectedGeneration: 1,
      fieldValue: FieldValue,
    });
    assert.equal(replay.replayed, true, 'retry must replay its receipt');
    await assert.rejects(
      transitionCourseService(db, {
        customerId,
        courseId,
        actorId: operatorId,
        action: 'suspend',
        operationId: winner.operationId,
        expectedGeneration: 2,
        fieldValue: FieldValue,
      }),
      (error) => error.code === 'operation_id_reused'
    );

    course = (await courseRef.get()).data();
    assert.equal(course.service_status, 'on');
    assert.equal(course.service_generation, 2);
    assert.equal(typeof course.active_service_interval_id, 'string');
    const intervals = await courseRef.collection('service_intervals').get();
    const operations = await courseRef.collection('service_operations').get();
    const events = await courseRef.collection('service_events').get();
    assert.equal(intervals.size, 2, 'Resume after migration-baseline close must create one interval');
    assert.ok(intervals.docs.find((doc) => doc.id === 'migration-baseline-v2').data().end_at);
    assert.equal(operations.size, 2, 'successful Suspend and Resume each receive an operation receipt');
    assert.equal(events.size, 3, 'migration and the two successful transitions must persist');

    const migrationEventRef = courseRef.collection('service_events').doc('migration-baseline-v2');
    const migrationEvidence = (await migrationEventRef.get()).data();
    await transitionCourseService(db, {
      customerId,
      courseId,
      actorId: operatorId,
      action: 'suspend',
      operationId: 'migration-baseline-v2',
      expectedGeneration: 2,
      fieldValue: FieldValue,
    });
    assert.deepEqual((await migrationEventRef.get()).data(), migrationEvidence);
    assert.equal((await courseRef.collection('service_events')
      .doc('operator-migration-baseline-v2').get()).exists, true);
    assert.equal((await transitionCourseService(db, {
      customerId,
      courseId,
      actorId: operatorId,
      action: 'suspend',
      operationId: 'migration-baseline-v2',
      expectedGeneration: 2,
      fieldValue: FieldValue,
    })).replayed, true);
    await assert.rejects(
      transitionCourseService(db, {
        customerId,
        courseId,
        actorId: operatorId,
        action: 'resume',
        operationId: 'migration-baseline-v2',
        expectedGeneration: 2,
        fieldValue: FieldValue,
      }),
      (error) => error.code === 'operation_id_reused'
    );

    await courseRef.update({
      service_status: 'on',
      active_service_interval_id: 'missing-interval',
    });
    const inconsistentSecret = await seedDevice(inconsistentDeviceId);
    const inconsistentRequest = response();
    await handlers.handleDeviceEvent(request({
      body: { device_id: inconsistentDeviceId, event_type: 'button_press' },
      headers: { 'x-fairway-device-key': inconsistentSecret },
    }), inconsistentRequest);
    assert.equal(inconsistentRequest.statusCode, 503, 'missing active interval must block request acceptance');
    assert.equal((await db.collection('requests')
      .where('device_id', '==', inconsistentDeviceId).get()).size, 0);
    await assert.rejects(
      transitionCourseService(db, {
        customerId,
        courseId,
        actorId: operatorId,
        action: 'resume',
        operationId: `inconsistent_${runId}`,
        expectedGeneration: 3,
        fieldValue: FieldValue,
      }),
      (error) => error.code === 'course_service_inconsistent'
    );

    const stateResponse = response();
    await handlers.fairwayButtonReceiver(request({
      method: 'GET',
      path: '/api/v1/operator/service-state',
      query: { customer_id: customerId, course_id: courseId },
      headers: { authorization: 'Bearer emulator-test-token' },
    }), stateResponse);
    assert.equal(stateResponse.statusCode, 200);
    assert.equal(stateResponse.body.service_state.status, 'inconsistent');

    console.log('PASS: Firestore emulator validates gated cutover, request races, interval integrity, immutable migration evidence, atomic transitions, replay, and operation-ID misuse');
  } finally {
    try {
      await cleanTestRecords();
    } finally {
      await db.terminate();
    }
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.stack || error.message}`);
  process.exitCode = 1;
});
