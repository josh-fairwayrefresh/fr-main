'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  aggregateCourseReports,
  aggregateSummaries,
  historyRequestsInRange,
  periodBounds,
  reportCoursePeriods,
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

  assert.strictEqual(summaries.daily.active_cart_hours, 1);
  assert.strictEqual(summaries.weekly.active_cart_hours, 4);
  assert.strictEqual(summaries.monthly.active_cart_hours, 4);
});

test('active time is rounded to the nearest minute for reporting', () => {
  const summaries = summarizeCoursePeriods({ timezone: 'America/Los_Angeles' }, [
    { type: 'resumed', recorded_at: new Date('2026-10-01T18:00:00.000Z') },
    { type: 'suspended', recorded_at: new Date('2026-10-01T18:00:31.000Z') },
  ], [{
    status: 'completed',
    received_at: new Date('2026-10-01T18:00:00.000Z'),
    completed_at: new Date('2026-10-01T18:01:00.000Z'),
  }], new Date('2026-10-01T19:00:00.000Z'));

  assert.strictEqual(summaries.daily.active_cart_hours, 0.02);
  assert.strictEqual(summaries.daily.requests_per_hour, 60);
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
      active_cart_minutes: 0,
      active_cart_hours: 0,
      requests_per_hour: 0,
      average_completion_minutes: 0,
      completion_duration_total_ms: 0,
      completion_duration_count: 0,
      completed_transactions: 0,
      transactions_per_cart_hour: 0,
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

test('History rows use the same Course-local period and outcome timestamps', () => {
  const course = { timezone: 'America/Los_Angeles' };
  const asOf = new Date('2026-10-22T20:00:00.000Z');
  const requests = [
    {
      request_id: 'completed-today',
      status: 'completed',
      received_at: new Date('2026-10-22T18:50:00.000Z'),
      completed_at: new Date('2026-10-22T19:10:00.000Z'),
    },
    {
      request_id: 'cancelled-today',
      status: 'cancelled',
      received_at: new Date('2026-10-22T18:00:00.000Z'),
      cancelled_at: new Date('2026-10-22T18:05:00.000Z'),
    },
    {
      request_id: 'cancelled-prior-day',
      status: 'cancelled',
      received_at: new Date('2026-10-21T18:00:00.000Z'),
      cancelled_at: new Date('2026-10-21T18:05:00.000Z'),
    },
  ];
  const reports = reportCoursePeriods(course, [], requests.slice(0, 1), requests, asOf);

  assert.deepStrictEqual(reports.daily.history.map((request) => request.request_id), [
    'completed-today', 'cancelled-today',
  ]);
  assert.deepStrictEqual(reports.weekly.history.map((request) => request.request_id), [
    'completed-today', 'cancelled-today', 'cancelled-prior-day',
  ]);
  assert.strictEqual(reports.daily.summary.completed_requests, 1);
  assert.deepStrictEqual(historyRequestsInRange(requests, periodBounds(asOf, course.timezone).daily)
    .map((request) => request.request_id), reports.daily.history.map((request) => request.request_id));
});

test('Course-wide totals include both service groups equally and exclude cancellations', () => {
  const course = { timezone: 'America/Los_Angeles' };
  const asOf = new Date('2026-10-22T20:00:00.000Z');
  const events = [
    { type: 'resumed', service_group: 'on_course', recorded_at: new Date('2026-10-22T18:00:00.000Z') },
    { type: 'suspended', service_group: 'on_course', recorded_at: new Date('2026-10-22T19:00:00.000Z') },
  ];
  const requests = ['on_course', 'on_premise'].flatMap((service_group, index) => [
    {
      request_id: `${service_group}-completed`,
      service_group,
      status: 'completed',
      received_at: new Date('2026-10-22T18:00:00.000Z'),
      completed_at: new Date(`2026-10-22T18:${index === 0 ? '10' : '20'}:00.000Z`),
    },
    {
      request_id: `${service_group}-cancelled`,
      service_group,
      status: 'cancelled',
      received_at: new Date('2026-10-22T18:00:00.000Z'),
      completed_at: new Date('2026-10-22T19:00:00.000Z'),
      cancelled_at: new Date('2026-10-22T19:00:00.000Z'),
    },
  ]);
  const courseReports = reportCoursePeriods(course, events, requests, requests, asOf);
  const aggregateReports = aggregateCourseReports([courseReports]);
  for (const period of ['daily', 'weekly', 'monthly']) {
    const report = courseReports[period];
    assert.deepStrictEqual(report.summary, {
      completed_requests: 2,
      active_cart_seconds: 3600,
      active_cart_minutes: 60,
      active_cart_hours: 1,
      requests_per_hour: 2,
      average_completion_minutes: 15,
      completion_duration_total_ms: 1800000,
      completion_duration_count: 2,
      completed_transactions: 2,
      transactions_per_cart_hour: 2,
    });
    assert.deepStrictEqual(
      report.history.map((request) => request.request_id).sort(),
      requests.map((request) => request.request_id).sort(),
    );
    assert.deepStrictEqual(aggregateReports[period].summary, {
      completed_requests: 2,
      active_cart_hours: 1,
      requests_per_hour: 2,
      average_completion_minutes: 15,
      completed_transactions: 2,
      transactions_per_cart_hour: 2,
    });
    assert.deepStrictEqual(aggregateReports[period].history, report.history);
  }
});

test('Course and aggregate History retain every matching outcome beyond 100 rows', () => {
  const course = { timezone: 'America/Los_Angeles' };
  const asOf = new Date('2026-10-22T20:00:00.000Z');
  const requests = Array.from({ length: 125 }, (_, index) => ({
    request_id: `completed-${index}`,
    status: 'completed',
    received_at: new Date('2026-10-22T18:00:00.000Z'),
    completed_at: new Date('2026-10-22T18:10:00.000Z'),
  }));
  const courseReport = reportCoursePeriods(course, [], requests, requests, asOf);
  const aggregateReport = aggregateCourseReports([courseReport, courseReport]);

  assert.strictEqual(courseReport.daily.summary.completed_requests, 125);
  assert.strictEqual(courseReport.daily.history.length, 125);
  assert.strictEqual(aggregateReport.daily.summary.completed_requests, 250);
  assert.strictEqual(aggregateReport.daily.history.length, 250);
});

test('aggregated Course reports share period summaries and scope History rows', () => {
  const course = { timezone: 'America/Los_Angeles' };
  const asOf = new Date('2026-10-22T20:00:00.000Z');
  const first = reportCoursePeriods(course, [], [{
    request_id: 'first',
    status: 'completed',
    received_at: new Date('2026-10-22T18:00:00.000Z'),
    completed_at: new Date('2026-10-22T18:10:00.000Z'),
  }], [{
    request_id: 'first',
    status: 'completed',
    received_at: new Date('2026-10-22T18:00:00.000Z'),
    completed_at: new Date('2026-10-22T18:10:00.000Z'),
  }], asOf);
  const second = reportCoursePeriods(course, [], [{
    request_id: 'second',
    status: 'completed',
    received_at: new Date('2026-10-22T18:30:00.000Z'),
    completed_at: new Date('2026-10-22T18:40:00.000Z'),
  }], [{
    request_id: 'second',
    status: 'completed',
    received_at: new Date('2026-10-22T18:30:00.000Z'),
    completed_at: new Date('2026-10-22T18:40:00.000Z'),
  }], asOf);

  const reports = aggregateCourseReports([first, second]);
  assert.strictEqual(reports.daily.summary.completed_requests, 2);
  assert.deepStrictEqual(reports.daily.history.map((request) => request.request_id), ['second', 'first']);
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
