'use strict';

const assert = require('node:assert/strict');
const {
  REQUEST_LIMIT,
  coursePeriod,
  firstInstantOfLocalDate,
  localDate,
  summarizeOperatorDashboard,
} = require('../lib/service_reporting');

const timezone = 'America/Los_Angeles';
const springStart = firstInstantOfLocalDate('2026-03-08', timezone);
const springEnd = firstInstantOfLocalDate('2026-03-09', timezone);
const fallStart = firstInstantOfLocalDate('2026-11-01', timezone);
const fallEnd = firstInstantOfLocalDate('2026-11-02', timezone);
assert.equal((springEnd - springStart) / 3600000, 23);
assert.equal((fallEnd - fallStart) / 3600000, 25);

const mondayStart = firstInstantOfLocalDate('2026-10-19', timezone);
const now = new Date('2026-10-21T20:00:00.000Z');
const week = coursePeriod(now, timezone, 'weekly');
assert.equal(week.start.toISOString(), mondayStart.toISOString());
assert.equal(coursePeriod(now, timezone, 'monthly').start.toISOString(),
  firstInstantOfLocalDate('2026-10-01', timezone).toISOString());

const course = {
  course_id: 'COURSE-1',
  timezone,
  service_schema_version: 2,
  service_status: 'on',
  active_service_interval_id: 'active-1',
  service_coverage_started_at: mondayStart,
};
const requests = new Map([['COURSE-1', [
  {
    request_id: 'one',
    status: 'completed',
    received_at: new Date('2026-10-19T18:00:00.000Z'),
    completed_at: new Date('2026-10-20T18:00:00.000Z'),
  },
  {
    request_id: 'two',
    status: 'completed',
    received_at: new Date('2026-10-21T18:00:00.000Z'),
    completed_at: new Date('2026-10-21T19:00:00.000Z'),
  },
  {
    request_id: 'cancelled',
    status: 'cancelled',
    received_at: new Date('2026-10-21T19:15:00.000Z'),
    cancelled_at: new Date('2026-10-21T19:20:00.000Z'),
  },
]]]);
const intervals = new Map([['COURSE-1', [{
  interval_id: 'active-1',
  start_at: new Date('2026-10-21T18:00:00.000Z'),
  end_at: null,
}]]]);
const report = summarizeOperatorDashboard([course], requests, intervals, now);
assert.equal(report.summaries.daily.completed_transactions, 1);
assert.equal(report.summaries.daily.cancelled_requests, 1);
assert.equal(report.summaries.daily.active_cart_hours, 2);
assert.equal(report.summaries.daily.transactions_per_cart_hour, 0.5);
assert.equal(report.summaries.weekly.completed_transactions, 2);
assert.equal(report.summaries.weekly.requests, 3);
assert.equal(report.summaries.weekly.transactions_per_cart_hour, 1);
assert.deepEqual(report.history.map((request) => request.request_id), ['cancelled', 'two', 'one']);
assert.equal(localDate(report.history[2].received_at, timezone), '2026-10-19');
assert.equal(report.history[2].status, 'completed');

const zeroCompletions = summarizeOperatorDashboard([course], new Map([['COURSE-1', []]]), intervals, now);
assert.equal(zeroCompletions.summaries.daily.transactions_per_cart_hour, 0);
assert.equal(zeroCompletions.summaries.daily.active_cart_hours, 2);

const zeroHours = summarizeOperatorDashboard([{
  ...course,
  service_status: 'off',
  active_service_interval_id: null,
}], new Map([['COURSE-1', []]]), new Map([['COURSE-1', []]]), now);
assert.equal(zeroHours.summaries.daily.active_cart_hours, 0);
assert.equal(zeroHours.summaries.daily.transactions_per_cart_hour, 'Rate unavailable');

const partial = summarizeOperatorDashboard([{
  ...course,
  service_coverage_started_at: new Date('2026-10-21T19:00:00.000Z'),
}], requests, new Map([['COURSE-1', [{
  interval_id: 'active-1',
  start_at: new Date('2026-10-21T19:00:00.000Z'),
  end_at: null,
}]]]), now);
assert.equal(partial.summaries.daily.hours_coverage, 'partial');
assert.match(partial.summaries.daily.active_cart_hours, /^Partial/);
assert.equal(partial.summaries.daily.transactions_per_cart_hour, 'Rate unavailable');

const unknown = summarizeOperatorDashboard([{
  ...course,
  service_schema_version: undefined,
  service_coverage_started_at: undefined,
}], requests, intervals, now);
assert.equal(unknown.summaries.daily.active_cart_hours, 'Unknown');
assert.equal(unknown.summaries.daily.transactions_per_cart_hour, 'Rate unavailable');

const missingCompletionTime = summarizeOperatorDashboard([course], new Map([['COURSE-1', [{
  request_id: 'missing-completion-time',
  status: 'completed',
  received_at: new Date('2026-10-21T18:00:00.000Z'),
  completed_at: null,
}]]]), intervals, now);
assert.equal(missingCompletionTime.summaries.daily.requests_coverage, 'incomplete');
assert.equal(missingCompletionTime.summaries.daily.completed_transactions, '0+ (incomplete)');
assert.equal(missingCompletionTime.summaries.daily.transactions_per_cart_hour, 'Rate unavailable');

const cappedRequests = Array.from({ length: REQUEST_LIMIT }, (_, index) => ({
  request_id: `open-${index}`,
  status: 'open',
  received_at: new Date('2026-10-21T18:00:00.000Z'),
}));
const cappedHistory = summarizeOperatorDashboard(
  [course],
  new Map([['COURSE-1', cappedRequests]]),
  intervals,
  now,
);
assert.equal(cappedHistory.history.length, 0);
assert.equal(cappedHistory.history_coverage, 'capped');
console.log('PASS: local calendar periods, DST, active interval hours, coverage, counts, and rates');
