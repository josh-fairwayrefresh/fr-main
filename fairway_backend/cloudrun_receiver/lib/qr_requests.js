'use strict';

const { FieldValue } = require('@google-cloud/firestore');
const { coursesCollection } = require('./fleet/courses');
const { courseOperation } = require('./course_operation');
const { resolveCourseServiceState } = require('./course_service');
const { resolveCourseLocalDateHour } = require('./fleet/hierarchy');
const { RequestError } = require('./request_lifecycle');

const BAY_ID = /^[A-Za-z0-9_-]{24,64}$/;
const OPERATION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function bayRef(db, id) {
  if (typeof id !== 'string' || !BAY_ID.test(id)) throw new RequestError(404, 'Bay not found');
  return db.collection('qr_bays').doc(id);
}

function validateBay(bay, course) {
  if (!bay?.enabled || !Number.isInteger(bay.bay_number) || bay.bay_number < 1 ||
      !course || courseOperation(course).kind !== 'driving_range') {
    throw new RequestError(404, 'Bay not found');
  }
}

async function publicBay(db, id) {
  const snapshot = await bayRef(db, id).get();
  if (!snapshot.exists) throw new RequestError(404, 'Bay not found');
  const bay = snapshot.data();
  const course = await coursesCollection(db, bay.customer_id).doc(bay.course_id).get();
  validateBay(bay, course.exists ? course.data() : null);
  return {
    bay_number: bay.bay_number,
    course_name: course.data().course_name,
    available: resolveCourseServiceState(course.data()).active,
  };
}

async function acceptQrRequest(db, id, operationId, networkId, now = new Date()) {
  const ref = bayRef(db, id);
  if (typeof operationId !== 'string' || !OPERATION_ID.test(operationId)) {
    throw new RequestError(400, 'A valid submission ID is required');
  }
  if (typeof networkId !== 'string' || !/^[a-f0-9]{64}$/.test(networkId)) {
    throw new RequestError(503, 'Request protection is unavailable');
  }
  const receiptRef = ref.collection('submissions').doc(operationId);
  const requestRef = db.collection('requests').doc();
  return db.runTransaction(async (transaction) => {
    const baySnapshot = await transaction.get(ref);
    if (!baySnapshot.exists) throw new RequestError(404, 'Bay not found');
    const bay = baySnapshot.data();
    const [courseSnapshot, receipt] = await Promise.all([
      transaction.get(coursesCollection(db, bay.customer_id).doc(bay.course_id)),
      transaction.get(receiptRef),
    ]);
    const course = courseSnapshot.exists ? courseSnapshot.data() : null;
    validateBay(bay, course);
    // A lost response remains the same submission even after suspension or completion.
    if (receipt.exists) return { status: 'accepted' };
    if (!resolveCourseServiceState(course).active) {
      throw new RequestError(409, 'Server requests are currently unavailable. Please visit the restaurant.');
    }
    const window = Math.floor(now.getTime() / 60000);
    const networkRef = db.collection('qr_request_limits').doc(`${networkId}-${window}`);
    const [network, bayWindow, outstanding] = await Promise.all([
      transaction.get(networkRef),
      transaction.get(ref.collection('rate_windows').doc(String(window))),
      bay.active_request_id
        ? transaction.get(db.collection('requests').doc(bay.active_request_id))
        : Promise.resolve(null),
    ]);
    if ((network.data()?.count || 0) >= 120 || (bayWindow.data()?.count || 0) >= 60) {
      throw new RequestError(429, 'Too many submissions. Please wait a minute and retry.');
    }
    if (bay.active_request_id && (!outstanding?.exists ||
        !['new', 'confirmed'].includes(outstanding.data().status))) {
      throw new RequestError(503, 'This bay needs staff assistance. Please visit the restaurant.');
    }
    const acceptedId = bay.active_request_id || requestRef.id;
    const expiresAt = new Date(now.getTime() + 2 * 86400000);
    transaction.set(networkRef, { count: (network.data()?.count || 0) + 1, expires_at: expiresAt });
    transaction.set(bayWindow.ref, { count: (bayWindow.data()?.count || 0) + 1, expires_at: expiresAt });
    transaction.set(receiptRef, { request_id: acceptedId, accepted_at: now });
    if (!bay.active_request_id) {
      const local = resolveCourseLocalDateHour(now, course.timezone);
      transaction.set(requestRef, {
        customer_id: bay.customer_id,
        course_id: bay.course_id,
        course_name: course.course_name,
        bay_id: id,
        bay_number: bay.bay_number,
        location_label: `Bay ${bay.bay_number}`,
        source: 'qr',
        event_type: 'server_request',
        status: 'new',
        received_at: FieldValue.serverTimestamp(),
        confirmed_at: null,
        completed_at: null,
        cancelled_at: null,
        operator_id: null,
        course_local_date: local.date,
        course_local_hour: local.hour,
      });
      transaction.update(ref, { active_request_id: acceptedId });
    }
    return { status: 'accepted' };
  });
}

module.exports = { publicBay, acceptQrRequest };
