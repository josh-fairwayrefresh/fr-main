import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCourseRefreshCoordinator,
  createServiceOperationRegistry,
  matchesCourseIdentity,
  refreshCourseSnapshot,
  runRequestAction,
  runServiceOperation,
} from '../src/lib/operatorWorkflow.mjs';

const courseA = { customer_id: 'customer-a', course_id: 'course-a' };
const courseB = { customer_id: 'customer-b', course_id: 'course-b' };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function createRefreshHarness() {
  const coordinator = createCourseRefreshCoordinator();
  const snapshots = new Map();
  const errors = new Map();

  function refresh(course, channel, load) {
    return refreshCourseSnapshot({
      coordinator,
      course,
      channel,
      load,
      onSuccess: (response, isCurrent) => {
        if (isCurrent()) {
          snapshots.set(`${course.customer_id}/${course.course_id}/${channel}`, response);
          errors.delete(`${course.customer_id}/${course.course_id}/${channel}`);
        }
      },
      onError: (error, isCurrent) => {
        if (isCurrent()) {
          errors.set(`${course.customer_id}/${course.course_id}/${channel}`, error.message);
        }
      },
    });
  }

  return { errors, refresh, snapshots };
}

test('service retries remain scoped to the originating Course across selection changes', async () => {
  const registry = createServiceOperationRegistry();
  const calls = [];
  const reporting = deferred();
  const stateA = { customer_id: courseA.customer_id, course_id: courseA.course_id };
  const operationA = registry.begin(courseA, () => ({
    action: 'suspend',
    body: {
      customer_id: courseA.customer_id,
      course_id: courseA.course_id,
      operation_id: 'a-response-lost',
      expected_generation: 7,
    },
  }));

  await assert.rejects(runServiceOperation({
    course: courseA,
    operation: operationA,
    mutate: async (course, operation) => {
      calls.push({ course, operation });
      throw new Error('response lost after commit');
    },
    refreshServiceState: async (course) => {
      assert.equal(course.course_id, courseA.course_id);
      return stateA;
    },
    refreshDashboard: () => reporting.promise,
  }), /response lost after commit/);
  registry.fail(courseA, operationA, 'response lost after commit', true);

  const operationB = registry.begin(courseB, () => ({
    action: 'resume',
    body: {
      customer_id: courseB.customer_id,
      course_id: courseB.course_id,
      operation_id: 'b-independent-operation',
      expected_generation: 2,
    },
  }));
  assert.equal(operationB.body.operation_id, 'b-independent-operation');
  await runServiceOperation({
    course: courseB,
    operation: operationB,
    mutate: async (course, operation) => {
      calls.push({ course, operation });
    },
    refreshServiceState: async (course) => {
      assert.equal(course.course_id, courseB.course_id);
    },
    refreshDashboard: () => reporting.promise,
  });
  registry.succeed(courseB, operationB);
  assert.equal(registry.get(courseB).operation, null);

  const retryA = registry.begin(courseA, () => {
    throw new Error('retry must reuse the pending operation');
  });
  assert.equal(retryA, operationA);
  assert.equal(retryA.body.operation_id, 'a-response-lost');
  assert.equal(retryA.body.course_id, courseA.course_id);
  await runServiceOperation({
    course: courseA,
    operation: retryA,
    mutate: async (course, operation) => {
      calls.push({ course, operation });
      return { replayed: true };
    },
    refreshServiceState: async (course) => {
      assert.equal(course.course_id, courseA.course_id);
      return stateA;
    },
    refreshDashboard: () => reporting.promise,
  });
  registry.succeed(courseA, retryA);
  assert.equal(calls[0].course.course_id, courseA.course_id);
  assert.equal(calls[0].operation.body.operation_id, 'a-response-lost');
  assert.equal(calls[1].course.course_id, courseB.course_id);
  assert.equal(calls[1].operation.body.operation_id, 'b-independent-operation');
  assert.equal(calls[2].course.course_id, courseA.course_id);
  assert.equal(calls[2].operation.body.operation_id, 'a-response-lost');
  assert.equal(registry.get(courseA).pending, false);
  assert.equal(registry.get(courseB).pending, false);
  reporting.resolve();
});

test('an older service read cannot replace the state confirmed after Suspend', async () => {
  const harness = createRefreshHarness();
  const oldRead = deferred();
  const delayedRead = harness.refresh(courseA, 'service-state', () => oldRead.promise);
  const suspendedState = {
    customer_id: courseA.customer_id,
    course_id: courseA.course_id,
    service_state: { status: 'ready', active: false, generation: 8 },
  };
  assert.equal((await harness.refresh(courseA, 'service-state', async () => suspendedState)).status, 'accepted');

  oldRead.resolve({
    customer_id: courseA.customer_id,
    course_id: courseA.course_id,
    service_state: { status: 'ready', active: true, generation: 7 },
  });
  assert.equal((await delayedRead).status, 'superseded');
  assert.equal(
    harness.snapshots.get('customer-a/course-a/service-state').service_state.active,
    false
  );
});

test('newest same-Course dashboard response wins when reads finish in reverse order', async () => {
  const harness = createRefreshHarness();
  const first = deferred();
  const second = deferred();
  const oldRead = harness.refresh(courseA, 'dashboard', () => first.promise);
  const newRead = harness.refresh(courseA, 'dashboard', () => second.promise);
  const latest = {
    courses: [{ ...courseA, requests: [{ id: 'latest' }] }],
  };
  second.resolve(latest);
  assert.equal((await newRead).status, 'accepted');
  first.resolve({ courses: [{ ...courseA, requests: [{ id: 'stale' }] }] });
  assert.equal((await oldRead).status, 'superseded');
  assert.deepEqual(
    harness.snapshots.get('customer-a/course-a/dashboard').courses[0].requests,
    [{ id: 'latest' }]
  );
});

test('a superseded failure cannot replace a newer successful refresh', async () => {
  const harness = createRefreshHarness();
  const first = deferred();
  const oldRead = harness.refresh(courseA, 'dashboard', () => first.promise);
  const latest = { courses: [{ ...courseA, requests: [] }] };
  assert.equal((await harness.refresh(courseA, 'dashboard', async () => latest)).status, 'accepted');

  first.reject(new Error('late dashboard failure'));
  assert.equal((await oldRead).status, 'superseded');
  assert.equal(harness.errors.has('customer-a/course-a/dashboard'), false);
  assert.equal(harness.snapshots.get('customer-a/course-a/dashboard'), latest);
});

test('switching Courses and returning cannot publish an outstanding old read', async () => {
  const harness = createRefreshHarness();
  const outstandingA = deferred();
  const oldReadA = harness.refresh(courseA, 'service-state', () => outstandingA.promise);

  const stateB = {
    customer_id: courseB.customer_id,
    course_id: courseB.course_id,
    service_state: { status: 'ready', active: true, generation: 4 },
  };
  await harness.refresh(courseB, 'service-state', async () => stateB);

  const returnedStateA = {
    customer_id: courseA.customer_id,
    course_id: courseA.course_id,
    service_state: { status: 'ready', active: false, generation: 8 },
  };
  await harness.refresh(courseA, 'service-state', async () => returnedStateA);
  outstandingA.resolve({
    customer_id: courseA.customer_id,
    course_id: courseA.course_id,
    service_state: { status: 'ready', active: true, generation: 7 },
  });

  assert.equal((await oldReadA).status, 'superseded');
  assert.equal(
    harness.snapshots.get('customer-a/course-a/service-state').service_state.active,
    false
  );
  assert.equal(
    harness.snapshots.get('customer-b/course-b/service-state').service_state.active,
    true
  );
});

test('current integrity and error responses are published instead of hidden by older readiness', async () => {
  const harness = createRefreshHarness();
  const ready = {
    customer_id: courseA.customer_id,
    course_id: courseA.course_id,
    service_state: { status: 'ready', active: true, generation: 8 },
  };
  await harness.refresh(courseA, 'service-state', async () => ready);

  const inconsistent = {
    customer_id: courseA.customer_id,
    course_id: courseA.course_id,
    service_state: { status: 'inconsistent', active: null, generation: null },
  };
  assert.equal(
    (await harness.refresh(courseA, 'service-state', async () => inconsistent)).status,
    'accepted'
  );
  assert.equal(
    harness.snapshots.get('customer-a/course-a/service-state').service_state.status,
    'inconsistent'
  );
  assert.equal(harness.errors.has('customer-a/course-a/service-state'), false);

  const staleGeneration = {
    customer_id: courseA.customer_id,
    course_id: courseA.course_id,
    service_state: { status: 'ready', active: true, generation: 7 },
  };
  assert.equal(
    (await harness.refresh(courseA, 'service-state', async () => staleGeneration)).status,
    'error'
  );
  assert.equal(
    harness.errors.get('customer-a/course-a/service-state'),
    'Service-state response was older than the latest confirmed generation.'
  );
  assert.equal(
    harness.snapshots.get('customer-a/course-a/service-state').service_state.status,
    'inconsistent'
  );

  const currentFailure = harness.refresh(
    courseA,
    'service-state',
    async () => { throw new Error('current state read failed'); }
  );
  assert.equal((await currentFailure).status, 'error');
  assert.equal(
    harness.errors.get('customer-a/course-a/service-state'),
    'current state read failed'
  );
});

test('service controls finish after authoritative state refresh without waiting for reporting', async () => {
  const reporting = deferred();
  let operationFinished = false;
  const operation = runServiceOperation({
    course: courseA,
    operation: { action: 'suspend', body: { operation_id: 'suspend-a' } },
    mutate: async () => ({ accepted: true }),
    refreshServiceState: async () => ({ status: 'ready', active: false }),
    refreshDashboard: () => reporting.promise,
  }).then((result) => {
    operationFinished = true;
    return result;
  });

  const state = await Promise.race([
    operation,
    new Promise((_, reject) => setTimeout(() => reject(new Error('control waited for reporting')), 50)),
  ]);
  assert.deepEqual(state, { status: 'ready', active: false });
  assert.equal(operationFinished, true);
  reporting.resolve();
});

test('existing-request action pending work finishes without waiting for reporting', async () => {
  const reporting = deferred();
  let requestMutated = false;
  await Promise.race([
    runRequestAction({
      request: { id: 'request-1', ...courseA },
      mutate: async () => { requestMutated = true; },
      refreshDashboard: () => reporting.promise,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('request action waited for reporting')), 50)),
  ]);
  assert.equal(requestMutated, true);
  reporting.resolve();
});

test('failed authoritative refresh preserves a retryable service operation', async () => {
  const registry = createServiceOperationRegistry();
  const operation = registry.begin(courseA, () => ({
    action: 'suspend',
    body: {
      customer_id: courseA.customer_id,
      course_id: courseA.course_id,
      operation_id: 'refresh-retry-a',
      expected_generation: 3,
    },
  }));
  await assert.rejects(runServiceOperation({
    course: courseA,
    operation,
    mutate: async () => ({ accepted: true }),
    refreshServiceState: async () => { throw new Error('state refresh unavailable'); },
    refreshDashboard: () => new Promise(() => {}),
  }), /state refresh unavailable/);
  registry.fail(courseA, operation, 'state refresh unavailable', true);
  assert.equal(registry.get(courseA).operation, operation);
  assert.equal(registry.get(courseA).pending, false);
  assert.equal(registry.get(courseA).error, 'state refresh unavailable');
});
