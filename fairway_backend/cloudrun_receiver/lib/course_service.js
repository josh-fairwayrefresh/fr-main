'use strict';

const categories = require('./service_categories.json');
const SERVICE_GROUPS = Object.freeze(Object.fromEntries(
  Object.entries(categories).map(([key, category]) => [key, category.id]),
));

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
  resolveServiceGroup,
  resolveCourseServiceState,
};
