'use strict';

const { FieldValue } = require('@google-cloud/firestore');

const REPORTING_STATES = Object.freeze(['active', 'excluded']);
function isReportableRequest(request) {
  return request.status === 'completed' || request.status === 'cancelled' ||
    (request.status === 'rejected' && request.rejection_reason === 'service_suspended');
}

class RequestReportingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.code = 'request_reporting_error';
  }
}

function requestReportingState(request) {
  const state = request.reporting_state === undefined ? 'active' : request.reporting_state;
  if (!REPORTING_STATES.includes(state)) {
    throw new RequestReportingError('Request has an invalid reporting state.', 500);
  }
  return state;
}

function isRequestReportingEligible(request) {
  return requestReportingState(request) === 'active';
}

async function listExcludedRequests(db, customerId, courseId) {
  const snapshot = await db.collection('requests')
    .where('customer_id', '==', customerId)
    .where('course_id', '==', courseId)
    .get();
  return snapshot.docs
    .map((doc) => ({ ...doc.data(), id: doc.id, request_id: doc.id }))
    .filter((request) => isReportableRequest(request) &&
      requestReportingState(request) === 'excluded');
}

async function setRequestReportingState(db, {
  requestId,
  customerId,
  courseId,
  reportingState,
  adminUid,
}, { timestamp = () => FieldValue.serverTimestamp() } = {}) {
  if (!REPORTING_STATES.includes(reportingState)) {
    throw new RequestReportingError('Reporting state must be active or excluded.');
  }
  if (![requestId, customerId, courseId, adminUid].every((value) =>
    typeof value === 'string' && value.trim().length > 0)) {
    throw new RequestReportingError('Request, Customer, Course and administrator are required.');
  }

  const requestRef = db.collection('requests').doc(requestId);
  const customerRef = db.collection('customers').doc(customerId);
  const courseRef = customerRef.collection('courses').doc(courseId);

  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, customerSnapshot, courseSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(customerRef),
      transaction.get(courseRef),
    ]);
    if (!requestSnapshot.exists || !customerSnapshot.exists || !courseSnapshot.exists) {
      throw new RequestReportingError('Request or Course was not found.', 404);
    }

    const request = requestSnapshot.data();
    if (request.customer_id !== customerId || request.course_id !== courseId) {
      throw new RequestReportingError('Request or Course was not found.', 404);
    }
    if (!isReportableRequest(request)) {
      throw new RequestReportingError('Only completed, cancelled, or service-suspended requests can be changed.', 409);
    }

    const previousState = requestReportingState(request);
    if (previousState === reportingState) {
      return { changed: false, reporting_state: previousState };
    }

    const changedAt = timestamp();
    transaction.update(requestRef, {
      reporting_state: reportingState,
      reporting_state_changed_by: adminUid,
      reporting_state_changed_at: changedAt,
    });
    transaction.set(requestRef.collection('reporting_state_history').doc(), {
      admin_uid: adminUid,
      changed_at: changedAt,
      from_state: previousState,
      request_id: requestId,
      to_state: reportingState,
    });
    return { changed: true, reporting_state: reportingState };
  });
}

module.exports = {
  RequestReportingError,
  isRequestReportingEligible,
  listExcludedRequests,
  requestReportingState,
  setRequestReportingState,
};
