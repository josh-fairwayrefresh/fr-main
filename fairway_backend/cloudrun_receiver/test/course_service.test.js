'use strict';

const assert = require('assert');
const { resolveCourseServiceState } = require('../lib/course_service');

const course = {
  timezone: 'America/Los_Angeles',
  service_schedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
  service_suspension: null,
};

assert.deepStrictEqual(resolveCourseServiceState(course), {
  active: true,
  suspended: false,
});
assert.deepStrictEqual(resolveCourseServiceState({
  ...course,
  service_schedule: { malformed: true },
}), {
  active: true,
  suspended: false,
});

const suspendedCourse = {
  ...course,
  service_suspension: {
    suspended_at: new Date('2026-10-01T19:00:00.000Z'),
    suspended_by: 'operator-1',
  },
};
assert.deepStrictEqual(resolveCourseServiceState(suspendedCourse), {
  active: false,
  suspended: true,
});

assert.deepStrictEqual(resolveCourseServiceState({
  ...course,
  service_suspension: { until: new Date('2000-01-01T00:00:00.000Z') },
}), {
  active: false,
  suspended: true,
});

console.log('PASS: Course service state is persistent and independent of schedule or expiry');
