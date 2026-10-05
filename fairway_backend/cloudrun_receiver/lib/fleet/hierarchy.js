'use strict';

const { getCourseForCustomer } = require('./courses');

async function resolveDeviceHierarchy(db, device) {
  if (!device.customer_id && !device.course_id) {
    return { valid: true, course: null };
  }

  if (!device.customer_id || !device.course_id) {
    return { valid: false, course: null };
  }

  const course = await getCourseForCustomer(db, device.customer_id, device.course_id);
  return { valid: Boolean(course), course };
}

module.exports = { resolveDeviceHierarchy };