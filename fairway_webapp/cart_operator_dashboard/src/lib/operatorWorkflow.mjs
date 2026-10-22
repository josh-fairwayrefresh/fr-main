import { courseKey } from './courseContext.mjs';

export function matchesCourseIdentity(course, response) {
  return Boolean(course && response &&
    course.customer_id === response.customer_id &&
    course.course_id === response.course_id);
}

export function setCourseValue(values, course, value) {
  return { ...values, [courseKey(course)]: value };
}

export function setCourseResponse(values, course, response) {
  return matchesCourseIdentity(course, response)
    ? setCourseValue(values, course, response)
    : values;
}

export function createServiceOperationRegistry() {
  const operations = new Map();
  const errors = new Map();
  const pending = new Set();

  return {
    get(course) {
      const key = courseKey(course);
      return {
        operation: operations.get(key) || null,
        error: errors.get(key) || '',
        pending: pending.has(key),
      };
    },
    begin(course, createOperation) {
      const key = courseKey(course);
      const operation = operations.get(key) || createOperation();
      operations.set(key, operation);
      errors.delete(key);
      pending.add(key);
      return operation;
    },
    setError(course, error) {
      errors.set(courseKey(course), error);
    },
    fail(course, operation, error, retryable) {
      const key = courseKey(course);
      if (operations.get(key) === operation && !retryable) operations.delete(key);
      errors.set(key, error);
      pending.delete(key);
    },
    succeed(course, operation) {
      const key = courseKey(course);
      if (operations.get(key) === operation) operations.delete(key);
      errors.delete(key);
      pending.delete(key);
    },
  };
}

export async function runServiceOperation({
  course, operation, mutate, refreshServiceState, refreshDashboard,
}) {
  let mutationError;
  try {
    await mutate(course, operation);
  } catch (error) {
    mutationError = error;
  }

  const stateRefresh = refreshServiceState(course);
  refreshDashboard(course);
  if (mutationError) {
    try {
      await stateRefresh;
    } catch (stateRefreshError) {
      throw new AggregateError(
        [mutationError, stateRefreshError],
        'Service operation and authoritative state refresh both failed.'
      );
    }
    throw mutationError;
  }
  return stateRefresh;
}

export async function runRequestAction({ request, mutate, refreshDashboard }) {
  await mutate(request);
  refreshDashboard(request);
}
