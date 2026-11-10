'use strict';

const USER_ACCESS_COLLECTION = 'user_access';
const AUTHORIZATION_SCHEMA_VERSION = 2;
const INVENTORY_STAFF_ROLES = Object.freeze(['cart_operator', 'fnb_management']);

// Staff attribution is deliberately independent of account authorization.
function canOperateInventory(staff, courseId) {
  return staff?.active === true && INVENTORY_STAFF_ROLES.includes(staff.role) &&
    (courseId === undefined || staff.course_ids === undefined ||
      (Array.isArray(staff.course_ids) && staff.course_ids.includes(courseId)));
}

function normalizeAccessRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  if (value.schema_version !== AUTHORIZATION_SCHEMA_VERSION ||
      typeof value.admin !== 'boolean' ||
      !Object.prototype.hasOwnProperty.call(value, 'course_ids') ||
      !Array.isArray(value.course_ids) ||
      value.course_ids.some((courseId) => typeof courseId !== 'string' || !courseId)) {
    return null;
  }
  if (value.admin) {
    if (value.customer_id !== null || value.course_ids.length !== 0) return null;
    return {
      schema_version: AUTHORIZATION_SCHEMA_VERSION,
      admin: true,
      customer_id: null,
      course_ids: [...new Set(value.course_ids)],
    };
  }
  if (typeof value.customer_id !== 'string' || !value.customer_id) return null;
  return {
    schema_version: AUTHORIZATION_SCHEMA_VERSION,
    admin: false,
    customer_id: value.customer_id,
    course_ids: [...new Set(value.course_ids)],
  };
}

function normalizeLegacyAccessForMigration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.schema_version !== undefined ||
      value.enabled !== true ||
      !['fairway_staff', 'customer_staff'].includes(value.user_type) ||
      !Array.isArray(value.courses) ||
      !Array.isArray(value.course_ids)) return null;

  const courseIds = [...new Set(value.courses.map((course) => course?.course_id))];
  if (value.courses.some((course) => (
    !course || typeof course.customer_id !== 'string' ||
    typeof course.course_id !== 'string' || typeof course.course_name !== 'string'
  )) || courseIds.length !== value.course_ids.length ||
      !courseIds.every((courseId) => value.course_ids.includes(courseId))) {
    return null;
  }

  if (value.user_type === 'fairway_staff') {
    return {
      schema_version: null,
      admin: true,
      customer_id: null,
      course_ids: [],
    };
  }

  const customerIds = [...new Set(value.courses.map((course) => course.customer_id))];
  if (customerIds.length !== 1 || courseIds.length === 0) return null;
  return {
    schema_version: null,
    admin: false,
    customer_id: customerIds[0],
    course_ids: courseIds,
  };
}

async function listCustomerCourses(db, customerId) {
  const customerSnapshot = await db.collection('customers').doc(customerId).get();
  if (!customerSnapshot.exists) return null;
  const courseSnapshot = await db.collection('customers').doc(customerId)
    .collection('courses').get();
  return courseSnapshot.docs.map((course) => ({
    ...course.data(),
    customer_id: customerId,
    course_id: course.id,
    customer_name: customerSnapshot.data().customer_name || customerId,
  })).filter((course) => typeof course.course_name === 'string');
}

async function listAllCourses(db) {
  const customers = await db.collection('customers').get();
  const courseSnapshots = await Promise.all(customers.docs.map((customer) => (
    listCustomerCourses(db, customer.id)
  )));
  return courseSnapshots.flatMap((courses) => courses || []);
}

async function getUserAccess(db, uid) {
  const snapshot = await db.collection(USER_ACCESS_COLLECTION).doc(uid).get();
  if (!snapshot.exists) return null;

  return validateAccessRecord(db, snapshot.data());
}

async function validateAccessRecord(db, value, customerCoursesCache = new Map()) {
  const access = normalizeAccessRecord(value);
  if (!access) return null;
  if (access.admin) return access;

  let coursesPromise = customerCoursesCache.get(access.customer_id);
  if (!coursesPromise) {
    coursesPromise = listCustomerCourses(db, access.customer_id);
    customerCoursesCache.set(access.customer_id, coursesPromise);
  }
  const courses = await coursesPromise;
  if (!courses) return null;
  if (access.course_ids.some((courseId) => (
    !courses.some((course) => course.course_id === courseId)
  ))) return null;
  return access;
}

async function resolveAuthorizedCourses(db, access) {
  if (!access) return [];
  if (access.admin) return listAllCourses(db);
  const courses = await listCustomerCourses(db, access.customer_id);
  if (!courses) return [];
  if (access.course_ids.length === 0) return courses;
  const allowed = new Set(access.course_ids);
  return courses.filter((course) => allowed.has(course.course_id));
}

module.exports = {
  INVENTORY_STAFF_ROLES,
  canOperateInventory,
  AUTHORIZATION_SCHEMA_VERSION,
  USER_ACCESS_COLLECTION,
  getUserAccess,
  listAllCourses,
  listCustomerCourses,
  normalizeAccessRecord,
  normalizeLegacyAccessForMigration,
  resolveAuthorizedCourses,
  validateAccessRecord,
};
