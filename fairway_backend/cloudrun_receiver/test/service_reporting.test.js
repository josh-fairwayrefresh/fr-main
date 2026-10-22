'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  aggregateSummaries,
  periodBounds,
  summarizeCoursePeriods,
} = require('../lib/service_reporting');

test('calendar periods use Course-local days and Monday-start weeks', () => {
  const bounds = periodBounds(new Date('2026-10-01T19:00:00.000Z'), 'America/Los_Angeles');
  assert.strictEqual(bounds.daily.start.toISOString(), '2026-10-01T07:00:00.000Z');
  assert.strictEqual(bounds.weekly.start.toISOString(), '2026-09-28T07:00:00.000Z');
  assert.strictEqual(bounds.monthly.start.toISOString(), '2026-10-01T07:00:00.000Z');
});

test('service intervals allocate across local days and include ongoing active time', () => {
  const course = { timezone: 'America/Los_Angeles' };
  const summaries = summarizeCoursePeriods(course, [
    { type: 'resumed', recorded_at: new Date('2026-10-01T18:00:00.000Z') },
    { type: 'suspended', recorded_at: new Date('2026-10-01T20:00:00.000Z') },
    { type: 'resumed', recorded_at: new Date('2026-10-02T06:00:00.000Z') },
  ], [], new Date('2026-10-02T08:00:00.000Z'));

  assert.strictEqual(summaries.daily.active_cart_hours, 2);
  assert.strictEqual(summaries.weekly.active_cart_hours, 4);
  assert.strictEqual(summaries.monthly.active_cart_hours, 4);
});

test('active time is rounded to the nearest minute for reporting', () => {
  const summaries = summarizeCoursePeriods({ timezone: 'America/Los_Angeles' }, [
    { type: 'resumed', recorded_at: new Date('2026-10-01T18:00:00.000Z') },
    { type: 'suspended', recorded_at: new Date('2026-10-01T18:00:31.000Z') },
  ], [], new Date('2026-10-01T19:00:00.000Z'));

  assert.strictEqual(summaries.daily.active_cart_hours, 0.02);
});

test('a started period with no activity reports zero for every KPI', () => {
  const summaries = summarizeCoursePeriods(
    { timezone: 'America/Los_Angeles' },
    [],
    [],
    new Date('2026-10-01T19:00:00.000Z'),
  );

  for (const period of ['daily', 'weekly', 'monthly']) {
    assert.deepStrictEqual(summaries[period], {
      completed_requests: 0,
      active_cart_seconds: 0,
      active_cart_hours: 0,
      requests_per_hour: 0,
      average_completion_minutes: 0,
      completion_duration_total_ms: 0,
      completion_duration_count: 0,
    });
  }
});

test('completed requests use completion time and exclude cancelled requests', () => {
  const course = { timezone: 'America/Los_Angeles' };
  const summaries = summarizeCoursePeriods(course, [], [
    {
      status: 'completed',
      received_at: new Date('2026-09-30T06:50:00.000Z'),
      completed_at: new Date('2026-10-01T07:05:00.000Z'),
    },
    {
      status: 'cancelled',
      received_at: new Date('2026-10-01T07:00:00.000Z'),
      completed_at: new Date('2026-10-01T07:10:00.000Z'),
    },
  ], new Date('2026-10-01T19:00:00.000Z'));

  assert.strictEqual(summaries.daily.completed_requests, 1);
  assert.strictEqual(summaries.daily.average_completion_minutes, 1455);
  assert.strictEqual(summaries.daily.requests_per_hour, 0);
  assert.strictEqual(summaries.weekly.completed_requests, 1);
  assert.strictEqual(summaries.monthly.completed_requests, 1);
});

test('course aggregation uses weighted completion duration and underlying active minutes', () => {
  const summaries = aggregateSummaries([
    {
      daily: { completed_requests: 1, active_cart_seconds: 3600, completion_duration_total_ms: 600000, completion_duration_count: 1 },
      weekly: { completed_requests: 1, active_cart_seconds: 3600, completion_duration_total_ms: 600000, completion_duration_count: 1 },
      monthly: { completed_requests: 1, active_cart_seconds: 3600, completion_duration_total_ms: 600000, completion_duration_count: 1 },
    },
    {
      daily: { completed_requests: 3, active_cart_seconds: 5400, completion_duration_total_ms: 3600000, completion_duration_count: 3 },
      weekly: { completed_requests: 3, active_cart_seconds: 5400, completion_duration_total_ms: 3600000, completion_duration_count: 3 },
      monthly: { completed_requests: 3, active_cart_seconds: 5400, completion_duration_total_ms: 3600000, completion_duration_count: 3 },
    },
  ]);

  assert.strictEqual(summaries.monthly.completed_requests, 4);
  assert.strictEqual(summaries.monthly.active_cart_hours, 2.5);
  assert.strictEqual(summaries.monthly.average_completion_minutes, 17.5);
  assert.strictEqual(summaries.monthly.requests_per_hour, 1.6);
});
