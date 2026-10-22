'use strict';

const { isValidServiceSchedule, resolveCourseServiceState } = require('./course_service');
const { coursesCollection, isValidIanaTimezone } = require('./fleet/courses');

const SERVICE_SCHEMA_VERSION = 2;

class ServiceControlError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'ServiceControlError';
    this.code = code;
    this.status = status;
  }
}

function validateOperationId(operationId) {
  return typeof operationId === 'string' &&
    /^[A-Za-z0-9_-]{8,128}$/.test(operationId);
}

function serviceState(course, currentTime = new Date()) {
  if (course.service_schema_version !== SERVICE_SCHEMA_VERSION) {
    return { status: 'cutover_required', active: null, generation: null };
  }
  if (!['on', 'off'].includes(course.service_status) ||
      !Number.isSafeInteger(course.service_generation) || course.service_generation < 0 ||
      !timestampDate(course.service_coverage_started_at) ||
      timestampDate(course.service_coverage_started_at) > currentTime ||
      (course.service_status === 'on' &&
        (typeof course.active_service_interval_id !== 'string' ||
          !course.active_service_interval_id || course.active_service_interval_id.includes('/'))) ||
      (course.service_status === 'off' && course.active_service_interval_id !== null)) {
    return { status: 'inconsistent', active: null, generation: null };
  }
  return {
    status: 'ready',
    active: course.service_status === 'on',
    generation: course.service_generation,
  };
}

async function readCourseServiceState(transaction, courseRef, course, currentTime = new Date()) {
  const state = serviceState(course, currentTime);
  if (state.status !== 'ready' || !state.active) return state;

  const intervalRef = courseRef.collection('service_intervals')
    .doc(course.active_service_interval_id);
  const intervalSnap = await transaction.get(intervalRef);
  if (!intervalSnap.exists) {
    return { status: 'inconsistent', active: null, generation: null };
  }
  const interval = intervalSnap.data();
  const coverageStart = timestampDate(course.service_coverage_started_at);
  const intervalStart = timestampDate(interval.start_at);
  if (!intervalStart || intervalStart < coverageStart || intervalStart > currentTime ||
      interval.end_at !== null) {
    return { status: 'inconsistent', active: null, generation: null };
  }
  return state;
}

async function cutoverCourse(db, {
  customerId, courseId, fieldValue, now = () => new Date(), enabled,
}) {
  if (!enabled) {
    throw new ServiceControlError('service_control_not_activated', 'Service cutover is not enabled.', 503);
  }
  const courseRef = coursesCollection(db, customerId).doc(courseId);
  const intervals = courseRef.collection('service_intervals');
  const events = courseRef.collection('service_events');
  const migrationInterval = intervals.doc('migration-baseline-v2');
  const migrationEvent = events.doc('migration-baseline-v2');
  return db.runTransaction(async (transaction) => {
    const courseSnap = await transaction.get(courseRef);
    if (!courseSnap.exists) {
      throw new ServiceControlError('course_not_found', 'Course was not found.', 404);
    }
    const course = courseSnap.data();
    if (course.service_schema_version === SERVICE_SCHEMA_VERSION) {
      const state = await readCourseServiceState(transaction, courseRef, course, now());
      if (state.status !== 'ready') {
        throw new ServiceControlError('course_service_inconsistent', 'Course service state is inconsistent.', 422);
      }
      return { already_initialized: true, service_state: state };
    }
    const [existingMigrationEvent, existingMigrationInterval] = await Promise.all([
      transaction.get(migrationEvent),
      transaction.get(migrationInterval),
    ]);
    if (existingMigrationEvent.exists || existingMigrationInterval.exists) {
      throw new ServiceControlError(
        'course_requires_reconciliation',
        'Migration evidence already exists for an uninitialized Course.',
        422
      );
    }
    const suspension = course.service_suspension;
    const suspendedAt = timestampDate(suspension?.suspended_at);
    const suspensionUntil = timestampDate(suspension?.until);
    const validSuspension = suspension === null || suspension === undefined ||
      (suspendedAt && suspensionUntil && suspensionUntil >= suspendedAt);
    if (!isValidServiceSchedule(course.service_schedule) ||
        !isValidIanaTimezone(course.timezone) ||
        !validSuspension) {
      throw new ServiceControlError('course_requires_reconciliation', 'Legacy Course service data is inconsistent.', 422);
    }

    const active = resolveCourseServiceState(course, now()).active;
    const nextCourse = {
      service_schema_version: SERVICE_SCHEMA_VERSION,
      service_status: active ? 'on' : 'off',
      service_generation: 0,
      service_coverage_started_at: fieldValue.serverTimestamp(),
      active_service_interval_id: active ? 'migration-baseline-v2' : null,
      updated_at: fieldValue.serverTimestamp(),
      service_schedule: fieldValue.delete(),
      service_suspension: fieldValue.delete(),
    };
    transaction.update(courseRef, nextCourse);
    transaction.set(migrationEvent, {
      type: 'migration_baseline',
      migration_evidence: true,
      service_status: active ? 'on' : 'off',
      generation: 0,
      recorded_at: fieldValue.serverTimestamp(),
      actor_id: null,
    });
    if (active) {
      transaction.set(migrationInterval, {
        start_at: fieldValue.serverTimestamp(),
        end_at: null,
        start_operation_id: 'migration-baseline-v2',
        start_source: 'migration_baseline',
        end_operation_id: null,
      });
    }
    return {
      already_initialized: false,
      service_state: { status: 'ready', active, generation: 0 },
    };
  });
}

async function transitionCourseService(db, {
  customerId, courseId, actorId, action, operationId, expectedGeneration,
  fieldValue, now = () => new Date(),
}) {
  if (!['resume', 'suspend'].includes(action) ||
      !validateOperationId(operationId) ||
      !Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0 ||
      typeof actorId !== 'string' || !actorId) {
    throw new ServiceControlError('invalid_service_operation', 'A valid action, operation ID, actor, and generation are required.', 400);
  }

  const courseRef = coursesCollection(db, customerId).doc(courseId);
  const receiptRef = courseRef.collection('service_operations').doc(operationId);
  const eventRef = courseRef.collection('service_events').doc(`operator-${operationId}`);
  const intervalCollection = courseRef.collection('service_intervals');

  return db.runTransaction(async (transaction) => {
    const receiptSnap = await transaction.get(receiptRef);
    if (receiptSnap.exists) {
      const receipt = receiptSnap.data();
      if (receipt.action !== action || receipt.actor_id !== actorId ||
          receipt.expected_generation !== expectedGeneration ||
          receipt.customer_id !== customerId || receipt.course_id !== courseId) {
        throw new ServiceControlError('operation_id_reused', 'Operation ID was already used for a different operation.', 409);
      }
      const courseSnap = await transaction.get(courseRef);
      if (!courseSnap.exists ||
          (await readCourseServiceState(transaction, courseRef, courseSnap.data(), now())).status !== 'ready') {
        throw new ServiceControlError(
          'course_service_inconsistent',
          'Course service state is inconsistent.',
          409
        );
      }
      return { ...receipt.result, replayed: true };
    }

    const courseSnap = await transaction.get(courseRef);
    if (!courseSnap.exists) {
      throw new ServiceControlError('course_not_found', 'Course was not found.', 404);
    }
    const course = courseSnap.data();
    const state = await readCourseServiceState(transaction, courseRef, course, now());
    if (state.status !== 'ready') {
      throw new ServiceControlError(
        state.status === 'cutover_required' ? 'course_cutover_required' : 'course_service_inconsistent',
        state.status === 'cutover_required'
          ? 'Course service must be explicitly cut over before controls are available.'
          : 'Course service state is inconsistent.',
        409
      );
    }
    if (expectedGeneration !== state.generation) {
      throw new ServiceControlError('service_generation_conflict', 'Service state changed. Refresh and try again.', 409);
    }
    if (!Number.isSafeInteger(state.generation + 1)) {
      throw new ServiceControlError('service_generation_exhausted', 'Service generation cannot be incremented safely.', 409);
    }
    const existingEvent = await transaction.get(eventRef);
    if (existingEvent.exists) {
      throw new ServiceControlError(
        'service_event_already_exists',
        'An immutable service event already exists for this operation.',
        409
      );
    }

    const nextActive = action === 'resume';
    const changed = state.active !== nextActive;
    const generation = state.generation + 1;
    let activeIntervalRef = null;
    if (changed && !nextActive) {
      if (typeof course.active_service_interval_id !== 'string') {
        throw new ServiceControlError('service_state_inconsistent', 'Active service interval is missing.', 409);
      }
      activeIntervalRef = intervalCollection.doc(course.active_service_interval_id);
      const intervalSnap = await transaction.get(activeIntervalRef);
      if (!intervalSnap.exists || intervalSnap.data().end_at) {
        throw new ServiceControlError('service_state_inconsistent', 'Active service interval is inconsistent.', 409);
      }
    }
    const result = {
      service_state: {
        status: 'ready',
        active: nextActive,
        generation,
      },
      changed,
      replayed: false,
    };
    if (changed && nextActive) {
      const newIntervalRef = intervalCollection.doc(`operation-${operationId}`);
      transaction.set(newIntervalRef, {
        start_at: fieldValue.serverTimestamp(),
        end_at: null,
        start_operation_id: operationId,
        start_source: 'operator',
        end_operation_id: null,
      });
      transaction.update(courseRef, {
        service_status: 'on',
        service_generation: generation,
        active_service_interval_id: newIntervalRef.id,
        updated_at: fieldValue.serverTimestamp(),
      });
    } else if (changed) {
      transaction.update(activeIntervalRef, {
        end_at: fieldValue.serverTimestamp(),
        end_operation_id: operationId,
      });
      transaction.update(courseRef, {
        service_status: 'off',
        service_generation: generation,
        active_service_interval_id: null,
        updated_at: fieldValue.serverTimestamp(),
      });
    } else {
      transaction.update(courseRef, {
        service_generation: generation,
        updated_at: fieldValue.serverTimestamp(),
      });
    }

    if (changed) {
      transaction.set(eventRef, {
        type: action,
        recorded_at: fieldValue.serverTimestamp(),
        operation_id: operationId,
        operator_id: actorId,
        expected_generation: expectedGeneration,
        generation,
        service_status: nextActive ? 'on' : 'off',
      });
    }
    transaction.set(receiptRef, {
      action,
      actor_id: actorId,
      customer_id: customerId,
      course_id: courseId,
      expected_generation: expectedGeneration,
      generation,
      operation_time: fieldValue.serverTimestamp(),
      result,
    });
    return result;
  });
}

function timestampDate(value) {
  const date = value instanceof Date
    ? value
    : value && typeof value.toDate === 'function' ? value.toDate() : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function intervalMinutes(intervals, start, end) {
  return intervals.reduce((total, interval) => {
    const intervalStart = timestampDate(interval.start_at);
    const intervalEnd = timestampDate(interval.end_at) || end;
    if (!intervalStart) return total;
    const overlapStart = Math.max(start.getTime(), intervalStart.getTime());
    const overlapEnd = Math.min(end.getTime(), intervalEnd.getTime());
    return total + Math.max(0, overlapEnd - overlapStart) / 60000;
  }, 0);
}

module.exports = {
  SERVICE_SCHEMA_VERSION,
  ServiceControlError,
  cutoverCourse,
  intervalMinutes,
  readCourseServiceState,
  serviceState,
  transitionCourseService,
  validateOperationId,
};
