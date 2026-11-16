'use strict';

const categories = require('./service_categories.json');
const storage = require('./operational_storage');
const SERVICE_GROUPS = Object.freeze(Object.fromEntries(
  Object.entries(categories).map(([key, category]) => [key, category.id]),
));

function serviceRef(db, customerId, courseId) {
  return storage.serviceRef(db, customerId, courseId);
}

async function requireService(db, customerId, courseId) {
  await storage.assertOwner(db, customerId);
  const service = await serviceRef(db, customerId, courseId).get();
  if (!service.exists || (storage.mode() === 'customer' && service.data().service_id !== courseId)) {
    throw new storage.OperationalStorageError('service_context_required', 'Customer service storage context is unavailable');
  }
  return service.data();
}

function resolveServiceGroup(value = SERVICE_GROUPS.ON_COURSE) {
  if (!Object.values(SERVICE_GROUPS).includes(value)) throw new Error('Invalid service group');
  return value;
}

function resolveCourseServiceState(course, group = SERVICE_GROUPS.ON_COURSE) {
  if (resolveServiceGroup(group) === SERVICE_GROUPS.ON_PREMISE) {
    const active = course?.on_premise_service?.active === true;
    return { active, suspended: !active };
  }
  const suspended = Boolean(course?.service_suspension);
  return { active: !suspended, suspended };
}

module.exports = {
  SERVICE_GROUPS,
  requireService,
  serviceRef,
  resolveServiceGroup,
  resolveCourseServiceState,
};
