'use strict';

const USER_ACCESS_COLLECTION = 'user_access';
const USER_TYPES = new Set(['fairway_staff', 'customer_staff']);

function validCourse(course) {
  return Boolean(
    course &&
    typeof course.customer_id === 'string' &&
    typeof course.course_id === 'string' &&
    typeof course.course_name === 'string'
  );
}

function normalizeAccessRecord(value) {
  if (!value || value.enabled !== true || !USER_TYPES.has(value.user_type) ||
      !Array.isArray(value.courses) || !Array.isArray(value.course_ids)) {
    return null;
  }
  const courses = value.courses.filter(validCourse);
  const courseIds = [...new Set(courses.map((course) => course.course_id))];
  if (courses.length !== value.courses.length ||
      courseIds.length !== value.course_ids.length ||
      !courseIds.every((courseId) => value.course_ids.includes(courseId))) {
    return null;
  }
  return {
    user_type: value.user_type,
    courses,
  };
}

async function getUserAccess(db, uid) {
  const snapshot = await db.collection(USER_ACCESS_COLLECTION).doc(uid).get();
  return snapshot.exists ? normalizeAccessRecord(snapshot.data()) : null;
}

async function getCustomerCourseAssignment(db, uid) {
  const access = await getUserAccess(db, uid);
  return access?.courses.length ? access : null;
}

module.exports = {
  USER_ACCESS_COLLECTION,
  USER_TYPES,
  getUserAccess,
  getCustomerCourseAssignment,
  normalizeAccessRecord,
};
