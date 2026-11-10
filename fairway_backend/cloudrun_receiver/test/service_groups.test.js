'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const { createFairwayHandlers } = require('../index');
const { generateDeviceCredential } = require('../lib/fleet/credentials');
const { resolveCourseServiceState } = require('../lib/course_service');

function response() {
  return {
    statusCode: null, body: null,
    set() { return this; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function fixture() {
  const db = new FakeFirestore();
  const courseRef = db.collection('customers').doc('TEST').collection('courses').doc('TEST');
  await db.collection('customers').doc('TEST').set({ customer_name: 'SYNTHETIC TEST' });
  await courseRef.set({ course_name: 'SYNTHETIC TEST', timezone: 'UTC', service_suspension: null });
  for (const uid of ['admin', 'operator', 'other-operator']) {
    await db.collection('user_access').doc(uid).set({
      schema_version: 2, admin: uid === 'admin',
      customer_id: uid === 'admin' ? null : 'TEST', course_ids: uid === 'admin' ? [] : ['TEST'],
    });
  }
  const secretById = {};
  for (const [id, group] of [['TEST-LEGACY', undefined], ['TEST-PREMISE', 'on_premise']]) {
    const { secret, verifier } = generateDeviceCredential();
    secretById[id] = secret;
    await db.collection('devices').doc(id).set({
      state: 'deployed', customer_id: 'TEST', course_id: 'TEST', course_name: 'SYNTHETIC TEST',
      credential: verifier, location: { type: 'custom', name: `CUSTOM ${id}` },
      ...(group ? { service_group: group } : {}),
    });
  }
  let clock = new Date('2026-10-23T10:00:00Z');
  function handlers() {
    return createFairwayHandlers(db, {
      now: () => clock,
      verifyOperatorToken: async (uid) => ({ uid }),
    });
  }
  async function call(path, body = {}, uid = 'operator', method = 'POST', instance = handlers()) {
    const result = response();
    const req = { path, method, body, query: {},
      get: (key) => key.toLowerCase() === 'authorization' ? `Bearer ${uid}` : undefined };
    await (path.startsWith('/api/v1/admin/') ? instance.fairwayAdmin : instance.fairwayButtonReceiver)(req, result);
    return result;
  }
  async function press(id, extra = {}) {
    const result = response();
    await handlers().handleDeviceEvent({
      body: { device_id: id, event_type: 'button_press', ...extra },
      get: () => secretById[id],
    }, result);
    return result;
  }
  const toggle = (group, active, uid) => call(`/api/v1/operator/service/${active ? 'resume' : 'suspend'}`,
    { customer_id: 'TEST', course_id: 'TEST', ...(group ? { service_group: group } : {}) }, uid);
  const dashboard = (instance) => call('/api/v1/operator/dashboard', {}, 'operator', 'GET', instance);
  return { db, courseRef, call, press, toggle, dashboard, handlers, advance: () => { clock = new Date(clock.getTime() + 600000); } };
}

test('all four service combinations independently gate stored groups, ignore firmware group, and preserve legacy behavior', async () => {
  const f = await fixture();
  assert.equal(resolveCourseServiceState((await f.courseRef.get()).data(), 'on_premise').active, false);
  for (const onCourse of [false, true]) {
    for (const onPremise of [false, true]) {
      await f.toggle('on_course', onCourse);
      await f.toggle('on_premise', onPremise);
      f.advance();
      for (const [id, active] of [['TEST-LEGACY', onCourse], ['TEST-PREMISE', onPremise]]) {
        const result = await f.press(id, { service_group: id === 'TEST-LEGACY' ? 'on_premise' : 'on_course' });
        assert.equal(result.statusCode, active ? 200 : 503);
        if (active) {
          const request = (await f.db.collection('requests').doc(result.body.request_id).get()).data();
          assert.equal(request.service_group, id === 'TEST-LEGACY' ? 'on_course' : 'on_premise');
          assert.equal(request.device_label, `CUSTOM ${id}`);
        }
      }
      const course = (await f.dashboard()).body.courses[0];
      assert.equal(course.service_state.active, onCourse);
      assert.equal(course.on_premise_service_state.active, onPremise);
      assert.equal(course.has_on_premise_devices, true);
    }
  }
});

test('reassignment preserves location, request snapshot, destination state, cached-client behavior and actions while OFF', async () => {
  const f = await fixture();
  const assignmentPath = '/api/v1/admin/devices/TEST-LEGACY/assignment';
  const open = await f.press('TEST-LEGACY');
  const before = (await f.db.collection('requests').doc(open.body.request_id).get()).data();
  assert.equal((await f.call(assignmentPath, { service_group: 'on_premise' }, 'admin', 'PATCH')).statusCode, 200);
  assert.equal((await f.press('TEST-LEGACY')).statusCode, 503);
  assert.equal((await f.db.collection('devices').doc('TEST-LEGACY').get()).data().location.name, 'CUSTOM TEST-LEGACY');
  assert.deepEqual((await f.db.collection('requests').doc(open.body.request_id).get()).data(), before);
  // Cached service actions omit the group and must operate on On-course only.
  await f.toggle(undefined, false);
  assert.equal((await f.dashboard()).body.courses[0].on_premise_service_state.active, false);
  const path = `/api/v1/requests/${open.body.request_id}/complete`;
  assert.equal((await f.call(path)).statusCode, 200);
  assert.equal((await f.call(path)).statusCode, 200);
  const commands = await f.db.collection('devices').doc('TEST-LEGACY').collection('commands').get();
  assert.equal(commands.size, 1);
  assert.equal(commands.docs[0].data().request_id, open.body.request_id);
  assert.equal(commands.docs[0].data().device_id, 'TEST-LEGACY');
  // Cached Admin saves omit service_group: preserve the stored group and independent label.
  await f.call(assignmentPath, { location: { type: 'custom', name: 'NEW CUSTOM LABEL' } }, 'admin', 'PATCH');
  assert.equal((await f.db.collection('devices').doc('TEST-LEGACY').get()).data().service_group, 'on_premise');
  const invalid = await f.call(assignmentPath, { service_group: 'restaurant' }, 'admin', 'PATCH');
  assert.equal(invalid.statusCode, 400);
  assert.equal((await f.call(assignmentPath, { service_group: null }, 'admin', 'PATCH')).statusCode, 400);
  assert.equal((await f.call(assignmentPath, { service_group: 'on_course' }, 'operator', 'PATCH')).statusCode, 403);
});

test('retry and concurrent group toggles are transactional, persist across handlers, and never pollute cart events', async () => {
  const f = await fixture();
  await Promise.all([f.toggle('on_course', false), f.toggle('on_premise', true, 'other-operator')]);
  await Promise.all([f.toggle('on_course', false), f.toggle('on_premise', true, 'other-operator')]);
  let course = (await f.dashboard(f.handlers())).body.courses[0];
  assert.equal(course.service_state.active, false);
  assert.equal(course.on_premise_service_state.active, true);
  assert.equal((await f.courseRef.collection('service_events').get()).size, 1);
  assert.equal((await f.courseRef.collection('on_premise_service_events').get()).size, 1);
  f.advance();
  const cartReport = (await f.dashboard()).body.reports.daily.summary;
  assert.equal(cartReport.active_cart_hours, 0);
  for (const id of ['TEST-LEGACY', 'TEST-PREMISE']) {
    await f.call(`/api/v1/admin/devices/${id}/assignment`, { service_group: 'on_course' }, 'admin', 'PATCH');
  }
  course = (await f.dashboard()).body.courses[0];
  assert.equal(course.has_on_premise_devices, false);
  assert.equal(course.on_premise_service_state.active, true);
  await f.call('/api/v1/admin/devices/TEST-PREMISE/assignment', { service_group: 'on_premise' }, 'admin', 'PATCH');
  course = (await f.dashboard()).body.courses[0];
  assert.equal(course.has_on_premise_devices, true);
  assert.equal(course.on_premise_service_state.active, true);
  assert.equal(course.service_state.active, false);
  const bad = await f.call('/api/v1/operator/service/resume', {
    customer_id: 'TEST', course_id: 'TEST', service_group: 'invalid',
  });
  assert.equal(bad.statusCode, 400);
});

test('repeat suppression and Cancel remain request-specific across group reassignment', async () => {
  const f = await fixture();
  await f.toggle('on_premise', true);
  const first = await f.press('TEST-PREMISE');
  const repeat = await f.press('TEST-PREMISE');
  assert.equal(repeat.body.request_id, first.body.request_id);
  assert.equal(repeat.body.duplicate, true);
  await f.call('/api/v1/admin/devices/TEST-PREMISE/assignment', { service_group: 'on_course' }, 'admin', 'PATCH');
  await f.toggle('on_course', false);
  await f.toggle('on_premise', false);
  const cancel = await f.call(`/api/v1/requests/${first.body.request_id}/cancel`);
  assert.equal(cancel.statusCode, 200);
  const request = (await f.db.collection('requests').doc(first.body.request_id).get()).data();
  assert.equal(request.service_group, 'on_premise');
  assert.equal(request.status, 'cancelled');
  // The test double stores timestamp sentinels; materialize the server values for reporting.
  await f.db.collection('requests').doc(first.body.request_id).update({
    received_at: new Date('2026-10-23T09:59:00Z'), cancelled_at: new Date('2026-10-23T10:00:00Z'),
  });
  const dashboard = await f.dashboard();
  assert.equal(dashboard.body.reports.daily.history.some((row) => row.request_id === first.body.request_id), true);
});
