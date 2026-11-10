'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const { createFairwayHandlers } = require('../index');
const {
  isRequestReportingEligible,
  listExcludedRequests,
  requestReportingState,
  setRequestReportingState,
} = require('../lib/request_reporting');

const requestBase = {
  customer_id: 'customer-1',
  course_id: 'course-1',
  status: 'completed',
  received_at: new Date('2026-10-01T10:00:00.000Z'),
  completed_at: new Date('2026-10-01T10:10:00.000Z'),
};

async function seedReportingData(db) {
  await db.collection('customers').doc('customer-1').set({ customer_name: 'Synthetic Customer' });
  await db.doc('customers/customer-1/courses/course-1').set({ course_name: 'Synthetic Course' });
  await db.doc('customers/customer-2/courses/course-2').set({ course_name: 'Other Course' });
  await db.collection('requests').doc('completed-1').set({ ...requestBase });
  await db.collection('requests').doc('cancelled-1').set({
    ...requestBase, status: 'cancelled', cancelled_at: requestBase.completed_at,
  });
  await db.collection('requests').doc('rejected-1').set({
    ...requestBase, status: 'rejected', rejection_reason: 'service_suspended',
  });
  await db.collection('requests').doc('open-1').set({ ...requestBase, status: 'new' });
  await db.collection('requests').doc('foreign-1').set({
    ...requestBase, customer_id: 'customer-2', course_id: 'course-2',
  });
}

function createResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

function createRequest({ method, path, query = {}, body = {}, token } = {}) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  return {
    method,
    path,
    query,
    body,
    get(name) { return headers[name.toLowerCase()]; },
  };
}

function reportingInput(requestId, reportingState, overrides = {}) {
  return {
    requestId,
    customerId: 'customer-1',
    courseId: 'course-1',
    reportingState,
    adminUid: 'admin-1',
    ...overrides,
  };
}

test('legacy requests default to active and only reportable excluded outcomes are listed', async () => {
  const db = new FakeFirestore();
  await seedReportingData(db);
  assert.equal(requestReportingState(requestBase), 'active');
  await db.collection('requests').doc('cancelled-1').update({ reporting_state: 'excluded' });
  await db.collection('requests').doc('rejected-1').update({ reporting_state: 'excluded' });
  await db.collection('requests').doc('open-1').update({ reporting_state: 'excluded' });

  const excluded = await listExcludedRequests(db, 'customer-1', 'course-1');
  assert.deepEqual(excluded.map((request) => request.id).sort(), ['cancelled-1', 'rejected-1']);
});

test('admin reporting transitions are reversible, idempotent, audited and preserve request status', async () => {
  const db = new FakeFirestore();
  await seedReportingData(db);
  const timestamps = [];
  const options = { timestamp: () => {
    const value = new Date(Date.UTC(2026, 9, 1, 10, 20 + timestamps.length));
    timestamps.push(value);
    return value;
  } };

  assert.deepEqual(await setRequestReportingState(db, reportingInput('completed-1', 'excluded'), options), {
    changed: true, reporting_state: 'excluded',
  });
  assert.deepEqual(await setRequestReportingState(db, reportingInput('completed-1', 'excluded'), options), {
    changed: false, reporting_state: 'excluded',
  });
  assert.deepEqual(await setRequestReportingState(db, reportingInput('completed-1', 'active'), options), {
    changed: true, reporting_state: 'active',
  });

  const request = (await db.doc('requests/completed-1').get()).data();
  assert.equal(request.status, 'completed');
  assert.equal(request.reporting_state, 'active');
  assert.equal(request.reporting_state_changed_by, 'admin-1');
  assert.ok(request.reporting_state_changed_at instanceof Date);
  const audit = await db.collection('requests').doc('completed-1').collection('reporting_state_history').get();
  assert.deepEqual(audit.docs.map((doc) => ({
    actor: doc.data().admin_uid,
    from: doc.data().from_state,
    to: doc.data().to_state,
    time: doc.data().changed_at,
  })), [
    { actor: 'admin-1', from: 'active', to: 'excluded', time: timestamps[0] },
    { actor: 'admin-1', from: 'excluded', to: 'active', time: timestamps[1] },
  ]);
});

test('concurrent reporting mutations serialize without changing operational status', async () => {
  const db = new FakeFirestore();
  await seedReportingData(db);
  await setRequestReportingState(db, reportingInput('completed-1', 'excluded'));
  await Promise.all([
    setRequestReportingState(db, reportingInput('completed-1', 'active')),
    setRequestReportingState(db, reportingInput('completed-1', 'excluded')),
  ]);

  const request = (await db.doc('requests/completed-1').get()).data();
  assert.equal(request.status, 'completed');
  assert.ok(['active', 'excluded'].includes(request.reporting_state));
  const history = await db.collection('requests').doc('completed-1').collection('reporting_state_history').get();
  assert.equal(history.size, 3);
  assert.ok(history.docs.every((doc) => doc.data().admin_uid === 'admin-1'));
});

test('admin endpoint enforces global Admin authorization and exact Customer/Course/request scope', async () => {
  const db = new FakeFirestore();
  await seedReportingData(db);
  await db.doc('user_access/admin-1').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  await db.doc('user_access/operator-1').set({
    schema_version: 2, admin: false, customer_id: 'customer-1', course_ids: ['course-1'],
  });
  const { fairwayAdmin } = createFairwayHandlers(db, {
    verifyOperatorToken: async (token) => {
      if (token === 'admin-token') return { uid: 'admin-1' };
      if (token === 'operator-token') return { uid: 'operator-1' };
      throw new Error('invalid token');
    },
  });

  const missingAuth = createResponse();
  await fairwayAdmin(createRequest({
    method: 'PATCH', path: '/api/v1/admin/requests/completed-1/reporting-state',
  }), missingAuth);
  assert.equal(missingAuth.statusCode, 401);

  const operatorResponse = createResponse();
  await fairwayAdmin(createRequest({
    method: 'PATCH', path: '/api/v1/admin/requests/completed-1/reporting-state',
    token: 'operator-token',
    body: { customer_id: 'customer-1', course_id: 'course-1', reporting_state: 'excluded' },
  }), operatorResponse);
  assert.equal(operatorResponse.statusCode, 403);

  const crossCourseResponse = createResponse();
  await fairwayAdmin(createRequest({
    method: 'PATCH', path: '/api/v1/admin/requests/completed-1/reporting-state',
    token: 'admin-token',
    body: { customer_id: 'customer-2', course_id: 'course-2', reporting_state: 'excluded' },
  }), crossCourseResponse);
  assert.equal(crossCourseResponse.statusCode, 404);

  const openRequestResponse = createResponse();
  await fairwayAdmin(createRequest({
    method: 'PATCH', path: '/api/v1/admin/requests/open-1/reporting-state',
    token: 'admin-token',
    body: { customer_id: 'customer-1', course_id: 'course-1', reporting_state: 'excluded' },
  }), openRequestResponse);
  assert.equal(openRequestResponse.statusCode, 409);

  const updateResponse = createResponse();
  await fairwayAdmin(createRequest({
    method: 'PATCH', path: '/api/v1/admin/requests/completed-1/reporting-state',
    token: 'admin-token',
    body: { customer_id: 'customer-1', course_id: 'course-1', reporting_state: 'excluded' },
  }), updateResponse);
  assert.equal(updateResponse.statusCode, 200);
  assert.deepEqual(updateResponse.body, { changed: true, reporting_state: 'excluded' });

  const listResponse = createResponse();
  await fairwayAdmin(createRequest({
    method: 'GET', path: '/api/v1/admin/requests/excluded', token: 'admin-token',
    query: { customer_id: 'customer-1', course_id: 'course-1' },
  }), listResponse);
  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.body.map((request) => request.id), ['completed-1']);
});

test('invalid reporting states fail closed', async () => {
  assert.throws(() => requestReportingState({ reporting_state: 'ignored' }), {
    status: 500,
    message: 'Request has an invalid reporting state.',
  });
  assert.throws(() => requestReportingState({ reporting_state: null }), {
    status: 500,
    message: 'Request has an invalid reporting state.',
  });
  await assert.rejects(setRequestReportingState(new FakeFirestore(), reportingInput('x', 'ignored')), {
    status: 400,
  });
});

test('invalid reporting states are omitted from reporting without failing it', () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (line) => warnings.push(JSON.parse(line));
  try {
    assert.equal(isRequestReportingEligible({ ...requestBase }), true);
    assert.equal(isRequestReportingEligible({ ...requestBase, reporting_state: 'active' }), true);
    assert.equal(isRequestReportingEligible({ ...requestBase, reporting_state: 'excluded' }), false);
    assert.equal(warnings.length, 0);
    assert.equal(isRequestReportingEligible({ ...requestBase, id: 'bad-1', reporting_state: 'ignored' }), false);
    assert.equal(isRequestReportingEligible({ ...requestBase, reporting_state: null }), false);
    assert.equal(warnings.length, 2);
    assert.equal(warnings[0].message, 'request_reporting_state_invalid');
    assert.equal(warnings[0].request_id, 'bad-1');
  } finally {
    console.warn = warn;
  }
});
