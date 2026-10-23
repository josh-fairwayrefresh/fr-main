'use strict';

function resolveCourseServiceState(course) {
  const suspended = Boolean(course?.service_suspension);
  return { active: !suspended, suspended };
}

module.exports = {
  resolveCourseServiceState,
};
