'use strict';

const assert = require('assert');
const {
  activeServiceMinutes,
  isValidServiceSchedule,
  nextScheduledStart,
  resolveCourseLocalDateHour,
  resolveCourseServiceState,
} = require('../lib/course_service');

const course = {
  timezone: 'America/Los_Angeles',
  service_schedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' },
};

assert.strictEqual(isValidServiceSchedule(course.service_schedule), true);
assert.strictEqual(isValidServiceSchedule({ days: [1], start: '17:00', end: '09:00' }), false);

const active = new Date('2026-10-01T19:00:00.000Z'); // Thursday 12:00 PDT
for (const [instant, expected] of [
  ['2026-01-16T07:30:00Z', { date: '2026-01-15', hour: 23 }],
  ['2026-07-16T07:30:00Z', { date: '2026-07-16', hour: 0 }],
  ['2026-03-08T09:30:00Z', { date: '2026-03-08', hour: 1 }],
  ['2026-03-08T10:30:00Z', { date: '2026-03-08', hour: 3 }],
  ['2026-11-01T08:30:00Z', { date: '2026-11-01', hour: 1 }],
  ['2026-11-01T09:30:00Z', { date: '2026-11-01', hour: 1 }],
]) {
  assert.deepStrictEqual(resolveCourseLocalDateHour(new Date(instant), course.timezone), expected);
}
assert.deepStrictEqual(resolveCourseLocalDateHour(active, 'UTC'), { date: '2026-10-01', hour: 19 });
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