'use strict';

const assert = require('node:assert/strict');
const { FakeFirestore } = require('./fake_firestore');
const {
  ServiceControlError,
  cutoverCourse,
  transitionCourseService,
} = require('../lib/service_control');

const now = () => new Date('2026-10-21T20:00:00.000Z');
const fieldValue = {
  serverTimestamp: () => now(),
  delete: () => undefined,
};

function courseRef(db) {
  return db.collection('customers').doc('CUST-1').collection('courses').doc('COURSE-1');
}

async function seedLegacy(db, active) {
  await db.collection('customers').doc('CUST-1').set({ customer_name: 'Test' });
  await courseRef(db).set({
    course_name: 'Test course',
    timezone: 'America/Los_Angeles',
    service_schedule: { days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59' },
    service_suspension: active ? null : {
      suspended_at: new Date('2026-10-21T19:00:00.000Z'),
      until: new Date('2026-10-22T00:00:00.000Z'),
    },
  });
}

async function transition(db, action, operationId, expectedGeneration, actorId = 'operator-1') {
  return transitionCourseService(db, {
    customerId: 'CUST-1',
    courseId: 'COURSE-1',
    actorId,
    action,
    operationId,
    expectedGeneration,
    fieldValue,
  });
}

async function run() {
  const disabledDb = new FakeFirestore();
  await seedLegacy(disabledDb, true);
  await assert.rejects(() => cutoverCourse(disabledDb, {
    customerId: 'CUST-1', courseId: 'COURSE-1', fieldValue, now, enabled: false,
  }), (error) => error instanceof ServiceControlError && error.code === 'service_control_not_activated');
  assert.equal((await courseRef(disabledDb).get()).data().service_schema_version, undefined);

  const db = new FakeFirestore();
  await seedLegacy(db, true);
  const baseline = await cutoverCourse(db, {
    customerId: 'CUST-1', courseId: 'COURSE-1', fieldValue, now, enabled: true,
  });
  assert.deepEqual(baseline.service_state, { status: 'ready', active: true, generation: 0 });
  const migrated = (await courseRef(db).get()).data();
  assert.equal(migrated.service_schedule, undefined);
  assert.equal(migrated.service_status, 'on');
  const intervals = await courseRef(db).collection('service_intervals').get();
  assert.equal(intervals.size, 1);
  assert.equal(intervals.docs[0].data().start_source, 'migration_baseline');
  assert.equal((await cutoverCourse(db, {
    customerId: 'CUST-1', courseId: 'COURSE-1', fieldValue, now, enabled: true,
  })).already_initialized, true);

  const suspend = await transition(db, 'suspend', 'operation-001', 0);
  assert.equal(suspend.changed, true);
  assert.equal(suspend.service_state.active, false);
  const replay = await transition(db, 'suspend', 'operation-001', 0);
  assert.equal(replay.replayed, true);
  assert.equal(replay.service_state.generation, 1);
  await assert.rejects(() => transition(db, 'resume', 'operation-001', 0),
    (error) => error.code === 'operation_id_reused');
  await assert.rejects(() => transition(db, 'suspend', 'operation-001', 1),
    (error) => error.code === 'operation_id_reused');
  await assert.rejects(() => transition(db, 'resume', 'operation-002', 0),
    (error) => error.code === 'service_generation_conflict');

  const resume = await transition(db, 'resume', 'operation-003', 1);
  assert.equal(resume.service_state.active, true);
  const noOp = await transition(db, 'resume', 'operation-004', 2);
  assert.equal(noOp.changed, false);
  assert.equal(noOp.service_state.generation, 3);
  const noOpReplay = await transition(db, 'resume', 'operation-004', 2);
  assert.equal(noOpReplay.replayed, true);
  assert.equal(noOpReplay.changed, false);
  const events = await courseRef(db).collection('service_events').get();
  assert.equal(events.size, 3); // migration baseline and two actual transitions

  const offDb = new FakeFirestore();
  await seedLegacy(offDb, false);
  const offBaseline = await cutoverCourse(offDb, {
    customerId: 'CUST-1', courseId: 'COURSE-1', fieldValue, now, enabled: true,
  });
  assert.equal(offBaseline.service_state.active, false);
  assert.equal((await courseRef(offDb).collection('service_intervals').get()).size, 0);

  const failDb = new FakeFirestore();
  await seedLegacy(failDb, true);
  await cutoverCourse(failDb, {
    customerId: 'CUST-1', courseId: 'COURSE-1', fieldValue, now, enabled: true,
  });
  failDb.failNextTransactionCommit = true;
  await assert.rejects(() => transition(failDb, 'suspend', 'operation-fail', 0));
  assert.equal((await courseRef(failDb).get()).data().service_status, 'on');
  assert.equal((await courseRef(failDb).collection('service_events').get()).size, 1);
  assert.equal((await courseRef(failDb).collection('service_operations').get()).size, 0);

  const racingDb = new FakeFirestore();
  await seedLegacy(racingDb, false);
  await cutoverCourse(racingDb, {
    customerId: 'CUST-1', courseId: 'COURSE-1', fieldValue, now, enabled: true,
  });
  const race = await Promise.allSettled([
    transition(racingDb, 'resume', 'race-resume-01', 0),
    transition(racingDb, 'suspend', 'race-suspend-01', 0),
  ]);
  assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(race.filter((result) => result.status === 'rejected' &&
    result.reason.code === 'service_generation_conflict').length, 1);
}

run().then(() => console.log('PASS: gated cutover, idempotent atomic service transitions, and generation races'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
