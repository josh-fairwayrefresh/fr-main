'use strict';

const { courseOperation } = require('./course_operation');
const { normalizeAccessRecord } = require('./user_access');

// Access conversion is only one part of a migration. This produces no
// Firestore writes and is not an executable or complete cutover plan.
function planCustomerAccess({ customerId, courses, services, menus, users }) {
  if (typeof customerId !== 'string' || !customerId || customerId.includes('/') ||
      !Array.isArray(courses) || !Array.isArray(services) || !Array.isArray(menus) ||
      !Array.isArray(users)) throw new Error('Invalid access-plan inputs');
  const courseById = new Map();
  for (const course of courses) {
    if (!course || typeof course.course_id !== 'string' || !course.course_id ||
        course.course_id.includes('/') || courseById.has(course.course_id)) {
      throw new Error('Invalid or duplicate course');
    }
    courseOperation(course);
    courseById.set(course.course_id, course);
  }
  const serviceIds = new Set();
  for (const service of services) {
    if (!service || !courseById.has(service.course_id) ||
        service.service_id !== service.course_id || serviceIds.has(service.service_id)) {
      throw new Error('Each course must have exactly one matching service');
    }
    serviceIds.add(service.service_id);
  }
  if (serviceIds.size !== courseById.size) throw new Error('Missing course service');

  const menuIds = new Set();
  const cartByCourse = new Map();
  for (const menu of menus) {
    if (!menu || typeof menu.menu_id !== 'string' || !menu.menu_id ||
        menu.menu_id.includes('/') || menuIds.has(menu.menu_id) ||
        !['cart', 'restaurant'].includes(menu.type)) {
      throw new Error('Invalid or duplicate menu');
    }
    menuIds.add(menu.menu_id);
    if (menu.type === 'cart') {
      const course = courseById.get(menu.asset_id);
      if (!course || !courseOperation(course).inventory || cartByCourse.has(menu.asset_id)) {
        throw new Error('Invalid or duplicate cart asset mapping');
      }
      cartByCourse.set(menu.asset_id, menu.menu_id);
    }
  }
  for (const course of courses) {
    if (courseOperation(course).inventory && !cartByCourse.has(course.course_id)) {
      throw new Error('Missing cart asset mapping');
    }
  }
  const seenUsers = new Set();
  const entries = users.map(({ uid, access: raw }) => {
    if (typeof uid !== 'string' || !uid || seenUsers.has(uid)) throw new Error('Invalid or duplicate user');
    seenUsers.add(uid);
    const access = normalizeAccessRecord(raw);
    if (!access || access.schema_version !== 2) throw new Error(`Invalid v2 access for ${uid}`);
    if (access.admin) {
      return { uid, authorization: {
        schema_version: 3, admin: true, customer_id: null, menu_ids: [], service_ids: [],
      } };
    }
    if (access.customer_id !== customerId) throw new Error(`Unexpected customer for ${uid}`);
    const allowed = access.course_ids.length ? access.course_ids : [...courseById.keys()];
    if (allowed.some((id) => !courseById.has(id))) throw new Error(`Unknown course for ${uid}`);
    return { uid, authorization: {
      schema_version: 3,
      admin: false,
      customer_id: customerId,
      menu_ids: allowed.filter((id) => cartByCourse.has(id)).map((id) => cartByCourse.get(id)).sort(),
      service_ids: [...allowed].sort(),
    } };
  });
  return {
    complete: false,
    executable: false,
    reason: 'Access-only preview; operational migration, source verification, backup and authorized cutover remain required.',
    customer_id: customerId,
    users: entries,
  };
}

module.exports = { planCustomerAccess };
