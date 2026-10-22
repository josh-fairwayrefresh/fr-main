import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createServiceOperationRegistry,
  matchesCourseIdentity,
  runRequestAction,
  runServiceOperation,
  setCourseResponse,
} from '../src/lib/operatorWorkflow.mjs';

const courseA = { customer_id: 'customer-a', course_id: 'course-a' };
const courseB = { customer_id: 'customer-b', course_id: 'course-b' };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
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

test('out-of-order and mismatched responses cannot populate another Course cache', () => {
  let snapshots = {};
  const responseA = {
    customer_id: courseA.customer_id,
    course_id: courseA.course_id,
    value: 'A response',
  };
  const responseB = {
    customer_id: courseB.customer_id,
    course_id: courseB.course_id,
    value: 'B response',
  };

  snapshots = setCourseResponse(snapshots, courseB, responseB);
  snapshots = setCourseResponse(snapshots, courseA, responseA);
  assert.equal(snapshots['customer-a/course-a'].value, 'A response');
  assert.equal(snapshots['customer-b/course-b'].value, 'B response');
  assert.equal(matchesCourseIdentity(courseB, responseA), false);
  const beforeMismatch = snapshots;
  snapshots = setCourseResponse(snapshots, courseB, responseA);
  assert.equal(snapshots, beforeMismatch);
  assert.equal(snapshots['customer-b/course-b'].value, 'B response');
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
