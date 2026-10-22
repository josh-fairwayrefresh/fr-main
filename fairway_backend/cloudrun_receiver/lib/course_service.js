'use strict';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isValidServiceSchedule(schedule) {
  return Boolean(
    schedule &&
    typeof schedule === 'object' &&
    !Array.isArray(schedule) &&
    Object.keys(schedule).length === 3 &&
    Array.isArray(schedule.days) &&
    schedule.days.length > 0 &&
    new Set(schedule.days).size === schedule.days.length &&
    schedule.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
    typeof schedule.start === 'string' && TIME_PATTERN.test(schedule.start) &&
    typeof schedule.end === 'string' && TIME_PATTERN.test(schedule.end) &&
    schedule.start < schedule.end
  );
}

function resolveCourseServiceState(course) {
  const suspended = Boolean(course?.service_suspension);
  return { active: !suspended, suspended };
}

module.exports = {
  isValidServiceSchedule,
  resolveCourseServiceState,
};
