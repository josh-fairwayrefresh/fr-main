'use strict';

const { ID_PREFIXES } = require('./schema');
const { allocateNextId } = require('./ids');
const { CUSTOMERS_COLLECTION } = require('./customers');

const COURSES_SUBCOLLECTION = 'courses';

function isValidIanaTimezone(timezone) {
  if (typeof timezone !== 'string' || timezone.length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch (_error) {
    return false;
  }
}

/*
 * Course schema. Courses are stored as a subcollection of their owning
 * Customer (customers/{customerId}/courses/{courseId}); the parent path
 * itself establishes Customer ownership, so no customer_id field is
 * duplicated inside the Course document. The Firestore document ID is the
 * canonical COURSE-XXXX identity; it is not duplicated as a course_id field.
 *
 *   course_name                course name
 *   timezone                   IANA timezone name (e.g. "America/Los_Angeles")
 *   service_schema_version     authoritative service-control schema version
 *   service_status             "off" until an authorized operator resumes
 *   service_generation         monotonically increasing service-operation generation
 *   comments                   administrator free-text notes
 *   created_at / updated_at    standard metadata
 */

function coursesCollection(db, customerId) {
  return db.collection(CUSTOMERS_COLLECTION).doc(customerId).collection(COURSES_SUBCOLLECTION);
}

/*
 * Creates a Course document nested under an existing Customer, with a
 * centrally allocated COURSE-XXXX id. Allocation uses the same global
 * counters/COURSE document regardless of nested storage, so Course IDs
 * remain globally unique across all Customers and never restart per
 * Customer (see ids.js).
 */
async function createCourse(db, {
  customerId,
  courseName,
  timezone,
  comments = null,
} = {}) {
  if (!customerId || typeof customerId !== 'string') {
    throw new Error('customerId is required');
  }
  if (typeof courseName !== 'string' || courseName.trim().length === 0) {
    throw new Error('Course name is required');
  }
  if (!isValidIanaTimezone(timezone)) {
    throw new Error('Valid Course timezone (IANA name) is required');
  }
  if (comments !== null && typeof comments !== 'string') {
    throw new Error('Course comments must be a string or null');
  }

  const customerSnap = await db.collection(CUSTOMERS_COLLECTION).doc(customerId).get();
  if (!customerSnap.exists) {
    throw new Error(`Unknown customer_id: ${customerId}`);
  }

  const courseId = await allocateNextId(db, ID_PREFIXES.COURSE);
  const now = new Date();

  const courseDoc = {
    course_name: courseName,
    timezone,
    service_schema_version: 2,
    service_status: 'off',
    service_generation: 0,
    service_coverage_started_at: now,
    active_service_interval_id: null,
    comments,
    created_at: now,
    updated_at: now,
  };

  await coursesCollection(db, customerId).doc(courseId).set(courseDoc);

  return { course_id: courseId, customer_id: customerId, ...courseDoc };
}

/*
 * Looks up a Course strictly under its claimed owning Customer. Returns null
 * if that Customer has no Course with this ID (including when the ID exists
 * only under a different Customer); this is how Course/Customer
 * relationship validation is enforced by devices.js.
 */
async function getCourseForCustomer(db, customerId, courseId) {
  const courseSnap = await coursesCollection(db, customerId).doc(courseId).get();

  if (!courseSnap.exists) {
    return null;
  }

  return { course_id: courseId, customer_id: customerId, ...courseSnap.data() };
}

async function updateCourse(db, customerId, courseId, {
  courseName,
  timezone,
  comments,
} = {}) {
  const customerSnap = await db.collection(CUSTOMERS_COLLECTION).doc(customerId).get();
  if (!customerSnap.exists) {
    throw new Error(`Unknown customer_id: ${customerId}`);
  }

  const courseRef = coursesCollection(db, customerId).doc(courseId);
  const courseSnap = await courseRef.get();
  if (!courseSnap.exists) {
    throw new Error(`Unknown course_id: ${courseId}`);
  }
  if (courseName !== undefined && (typeof courseName !== 'string' || courseName.trim().length === 0)) {
    throw new Error('Course name is required');
  }
  if (timezone !== undefined && !isValidIanaTimezone(timezone)) {
    throw new Error('Valid Course timezone (IANA name) is required');
  }
  if (comments !== undefined && comments !== null && typeof comments !== 'string') {
    throw new Error('Course comments must be a string or null');
  }

  const updatedAt = new Date();
  const update = { updated_at: updatedAt };
  if (courseName !== undefined) {
    update.course_name = courseName;
  }
  if (timezone !== undefined) {
    update.timezone = timezone;
  }
  if (comments !== undefined) {
    update.comments = comments;
  }

  const batch = db.batch();
  batch.update(courseRef, update);

  if (courseName !== undefined) {
    const devicesSnap = await db.collection('devices')
      .where('customer_id', '==', customerId)
      .where('course_id', '==', courseId)
      .get();
    for (const deviceSnap of devicesSnap.docs) {
      batch.update(deviceSnap.ref, { course_name: courseName, updated_at: updatedAt });
    }
  }

  await batch.commit();
  return { course_id: courseId, customer_id: customerId, ...courseSnap.data(), ...update };
}

module.exports = {
  COURSES_SUBCOLLECTION,
  isValidIanaTimezone,
  coursesCollection,
  createCourse,
  getCourseForCustomer,
  updateCourse,
};
