'use strict';

const { ID_PREFIXES } = require('./schema');
const { allocateNextId } = require('./ids');
const { CUSTOMERS_COLLECTION } = require('./customers');

const COURSES_COLLECTION = 'courses';

const DEFAULT_HEALTH_REPORT_SCHEDULE = Object.freeze({
  times: ['09:00', '17:00'],
});

/*
 * Course schema:
 *
 *   course_id                permanent COURSE-XXXX identity
 *   customer_id               owning Customer (immutable relationship)
 *   name                       course name
 *   timezone                   IANA timezone name (e.g. "America/Los_Angeles")
 *   health_report_schedule     { times: ["HH:MM", ...] } course-local times;
 *                              stored/configured only. Firmware scheduling is
 *                              out of scope for WP2.
 *   comments                   administrator free-text notes
 *   created_at / updated_at    standard metadata
 */

/*
 * Creates a Course document belonging to an existing Customer, with a
 * centrally allocated COURSE-XXXX id and the CPO-approved default Device
 * Health reporting schedule (09:00 / 17:00 course-local time).
 */
async function createCourse(db, {
  customerId,
  name,
  timezone,
  comments = null,
  healthReportSchedule,
} = {}) {
  if (!customerId || typeof customerId !== 'string') {
    throw new Error('customerId is required');
  }
  if (!name || typeof name !== 'string') {
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
    course_id: courseId,
    customer_id: customerId,
    name,
    timezone,
    health_report_schedule: healthReportSchedule || DEFAULT_HEALTH_REPORT_SCHEDULE,
    comments,
    created_at: now,
    updated_at: now,
  };

  await db.collection(COURSES_COLLECTION).doc(courseId).set(courseDoc);

  return courseDoc;
}

module.exports = {
  COURSES_COLLECTION,
  DEFAULT_HEALTH_REPORT_SCHEDULE,
  createCourse,
};
