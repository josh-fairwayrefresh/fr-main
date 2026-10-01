'use strict';

const assert = require('assert');
const {
  activeServiceMinutes,
  isValidServiceSchedule,
  nextScheduledStart,
  resolveCourseServiceState,
} = require('../lib/course_service');

const course = {
  timezone: 'America/Los_Angeles',
  service_schedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
};

assert.strictEqual(isValidServiceSchedule(course.service_schedule), true);
assert.strictEqual(isValidServiceSchedule({ days: [1], start: '17:00', end: '09:00' }), false);

const active = new Date('2026-10-01T19:00:00.000Z'); // Thursday 12:00 PDT
assert.deepStrictEqual(resolveCourseServiceState(course, active), {
  active: true,
  scheduled: true,
  suspended: false,
  suspension_until: null,
});

const nextStart = nextScheduledStart(course, active);
assert.strictEqual(nextStart.toISOString(), '2026-10-02T16:00:00.000Z');

const suspendedCourse = {
  ...course,
  service_suspension: { until: nextStart },
};
assert.strictEqual(resolveCourseServiceState(suspendedCourse, active).active, false);
assert.strictEqual(resolveCourseServiceState(suspendedCourse, active).suspended, true);
assert.strictEqual(resolveCourseServiceState(suspendedCourse, nextStart).suspended, false);
assert.strictEqual(resolveCourseServiceState(suspendedCourse, nextStart).active, true);

const dayStart = new Date('2026-10-01T16:00:00.000Z');
const dayEnd = new Date('2026-10-02T00:00:00.000Z');
const events = [
  { type: 'suspended', recorded_at: new Date('2026-10-01T18:00:00.000Z') },
  { type: 'resumed', recorded_at: new Date('2026-10-01T18:30:00.000Z') },
];
assert.strictEqual(activeServiceMinutes(course, events, dayStart, dayEnd), 450);
assert.strictEqual(activeServiceMinutes(course, [
  { type: 'suspended', recorded_at: new Date('2026-10-01T23:30:00.000Z') },
  { type: 'resumed', recorded_at: new Date('2026-10-02T16:30:00.000Z') },
], dayStart, new Date('2026-10-02T17:00:00.000Z')), 480);
assert.strictEqual(activeServiceMinutes(course, [
  {
    type: 'suspended',
    recorded_at: new Date('2026-10-01T23:30:00.000Z'),
    until: new Date('2026-10-02T16:00:00.000Z'),
  },
], dayStart, new Date('2026-10-02T17:00:00.000Z')), 510);
assert.strictEqual(activeServiceMinutes(course, [
  {
    type: 'suspended',
    recorded_at: new Date('2026-10-01T23:30:00.000Z'),
    until: new Date('2026-10-02T16:00:00.000Z'),
  },
  {
    type: 'suspended',
    recorded_at: new Date('2026-10-05T17:00:00.000Z'),
    until: new Date('2026-10-06T16:00:00.000Z'),
  },
], dayStart, new Date('2026-10-06T00:00:00.000Z')), 990);

console.log('PASS: Course service schedule, suspension, automatic resume, and active-time calculation');