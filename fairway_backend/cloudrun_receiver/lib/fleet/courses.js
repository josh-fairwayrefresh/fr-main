'use strict';

const { ID_PREFIXES } = require('./schema');
const { allocateNextId } = require('./ids');
const { CUSTOMERS_COLLECTION } = require('./customers');

const COURSES_SUBCOLLECTION = 'courses';

const DEFAULT_HEALTH_REPORT_SCHEDULE = Object.freeze({
  times: ['09:00', '17:00'],
});

/*
 * Course schema. Courses are stored as a subcollection of their owning
 * Customer (customers/{customerId}/courses/{courseId}); the parent path
 * itself establishes Customer ownership, so no customer_id field is
 * duplicated inside the Course document. The Firestore document ID is the
 * canonical COURSE-XXXX identity; it is not duplicated as a course_id field.
 *
 *   course_name                course name
 *   timezone                   IANA timezone name (e.g. "America/Los_Angeles")
 *   health_report_schedule     { times: ["HH:MM", ...] } course-local times;
 *                              stored/configured only. Firmware scheduling is
 *                              out of scope for WP2.
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
 * Customer (see ids.js). Applies the CPO-approved default Device Health
 * reporting schedule (09:00 / 17:00 course-local time).
 */
async function createCourse(db, {
  customerId,
  courseName,
  timezone,
  comments = null,
  healthReportSchedule,
} = {}) {
  if (!customerId || typeof customerId !== 'string') {
    throw new Error('customerId is required');
  }
  if (!courseName || typeof courseName !== 'string') {
    throw new Error('Course name is required');
  }
  if (!timezone || typeof timezone !== 'string') {
    throw new Error('Course timezone (IANA name) is required');
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
    health_report_schedule: healthReportSchedule || DEFAULT_HEALTH_REPORT_SCHEDULE,
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

module.exports = {
  COURSES_SUBCOLLECTION,
  DEFAULT_HEALTH_REPORT_SCHEDULE,
  coursesCollection,
  createCourse,
  getCourseForCustomer,
};
