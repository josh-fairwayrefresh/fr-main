'use strict';

const assert = require('node:assert/strict');
const { isValidServiceSchedule, resolveCourseServiceState } = require('../lib/course_service');

const course = {
  timezone: 'America/Los_Angeles',
  service_schedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
};
assert.equal(isValidServiceSchedule(course.service_schedule), true);
assert.equal(isValidServiceSchedule({ days: [1], start: '17:00', end: '09:00' }), false);
assert.deepEqual(
  resolveCourseServiceState(course, new Date('2026-10-01T19:00:00.000Z')),
  { active: true },
);
assert.deepEqual(
  resolveCourseServiceState({
    ...course,
    service_suspension: { until: new Date('2026-10-02T16:00:00.000Z') },
  }, new Date('2026-10-01T19:00:00.000Z')),
  { active: false },
);
console.log('PASS: legacy schedule evaluator retained only for explicit migration cutover');
