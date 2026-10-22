import { courseKey } from './courseContext.mjs';

export function matchesCourseIdentity(course, response) {
  return Boolean(course && response &&
    course.customer_id === response.customer_id &&
    course.course_id === response.course_id);
}

export function setCourseValue(values, course, value) {
  return { ...values, [courseKey(course)]: value };
}

export function createCourseRefreshCoordinator() {
  const latestRequests = new Map();
  const latestGenerations = new Map();

  function requestKey(course, channel) {
    return `${courseKey(course)}:${channel}`;
  }

  return {
    begin(course, channel) {
      const key = requestKey(course, channel);
      const requestId = (latestRequests.get(key) || 0) + 1;
      latestRequests.set(key, requestId);
      return requestId;
    },
    isCurrent(course, channel, requestId) {
      return latestRequests.get(requestKey(course, channel)) === requestId;
    },
    complete(course, channel, requestId, response) {
      if (!this.isCurrent(course, channel, requestId)) {
        return { status: 'superseded' };
      }
      if (channel !== 'service-state') {
        return { status: 'accepted' };
      }

      const state = response?.service_state;
      if (state?.status === 'ready') {
        if (!Number.isSafeInteger(state.generation) || state.generation < 0) {
          return {
            status: 'error',
            error: new Error('Service-state response contained an invalid generation.'),
          };
        }
        const key = courseKey(course);
        const highestGeneration = latestGenerations.get(key);
        if (highestGeneration !== undefined && state.generation < highestGeneration) {
          return {
            status: 'error',
            error: new Error('Service-state response was older than the latest confirmed generation.'),
          };
        }
        latestGenerations.set(key, state.generation);
      } else if (!['inconsistent', 'cutover_required'].includes(state?.status)) {
        return {
          status: 'error',
          error: new Error('Service-state response contained an unknown status.'),
        };
      }
      return { status: 'accepted' };
    },
  };
}

export async function refreshCourseSnapshot({
  coordinator, course, channel, load, onSuccess, onError,
}) {
  const requestId = coordinator.begin(course, channel);
  const isCurrent = () => coordinator.isCurrent(course, channel, requestId);
  let response;
  try {
    response = await load();
  } catch (error) {
    if (!isCurrent()) return { status: 'superseded' };
    onError(error, isCurrent);
    return { status: 'error', error };
  }

  const result = coordinator.complete(course, channel, requestId, response);
  if (result.status === 'superseded') return result;
  if (result.status === 'error') {
    onError(result.error, isCurrent);
    return result;
  }
  onSuccess(response, isCurrent);
  return result;
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
