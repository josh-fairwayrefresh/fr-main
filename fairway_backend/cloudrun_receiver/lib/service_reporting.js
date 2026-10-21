'use strict';

const { intervalMinutes } = require('./service_control');

const REQUEST_LIMIT = 5000;

function localDate(instant, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nextDate(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function firstInstantOfLocalDate(date, timezone) {
  const target = Date.parse(`${date}T00:00:00.000Z`);
  let low = target - 36 * 60 * 60 * 1000;
  let high = target + 36 * 60 * 60 * 1000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localDate(new Date(middle), timezone) < date) low = middle;
    else high = middle;
  }
  if (localDate(new Date(high), timezone) !== date) {
    throw new Error(`Unable to resolve local calendar boundary for ${date} in ${timezone}`);
  }
  return new Date(high);
}

function coursePeriod(now, timezone, period) {
  const today = localDate(now, timezone);
  let startDate = today;
  if (period === 'weekly') {
    const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    startDate = nextDate(today, -((weekday + 6) % 7));
  } else if (period === 'monthly') {
    startDate = `${today.slice(0, 7)}-01`;
  }
  const endDate = nextDate(today, 1);
  return {
    start: firstInstantOfLocalDate(startDate, timezone),
    end: now,
    period_end: firstInstantOfLocalDate(endDate, timezone),
  };
}

function asDate(value) {
  const date = value instanceof Date
    ? value
    : value && typeof value.toDate === 'function' ? value.toDate() : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function inPeriod(value, start, end) {
  const date = asDate(value);
  return Boolean(date && date >= start && date <= end);
}

function intervalsConsistent(course, intervals, now) {
  const coverageStart = asDate(course.service_coverage_started_at);
  if (!coverageStart || coverageStart > now || !Array.isArray(intervals)) return false;
  const ordered = [...intervals].sort((left, right) =>
    (asDate(left.start_at)?.getTime() ?? Infinity) - (asDate(right.start_at)?.getTime() ?? Infinity));
  let previousEnd = null;
  const open = [];
  for (const [index, interval] of ordered.entries()) {
    const start = asDate(interval.start_at);
    const end = asDate(interval.end_at);
    if (!start || start < coverageStart || (interval.end_at !== null && !end) ||
        start > now || (end && (end < start || end > now)) ||
        (previousEnd && start < previousEnd)) return false;
    if (interval.end_at === null) {
      if (index !== ordered.length - 1) return false;
      open.push(interval);
    }
    else previousEnd = end;
  }
  if (course.service_status === 'on') {
    return open.length === 1 && open[0].interval_id === course.active_service_interval_id;
  }
  return course.service_status === 'off' && open.length === 0 &&
    course.active_service_interval_id === null;
}

function summarizeOperatorDashboard(courses, requestsByCourse, intervalsByCourse, now) {
  const periods = ['daily', 'weekly', 'monthly'];
  const summaries = Object.fromEntries(periods.map((period) => {
    let requests = 0;
    let completed = 0;
    let cancelled = 0;
    let activeMinutes = 0;
    let hoursCoverage = 'complete';
    let requestsCoverage = 'complete';
    let completionMinutes = [];

    for (const course of courses) {
      if (!course.timezone) {
        hoursCoverage = 'unknown';
        continue;
      }
      const range = coursePeriod(now, course.timezone, period);
      const records = requestsByCourse.get(course.course_id) || [];
      const hasUnattributedCompletion = records.some((request) =>
        request.status === 'completed' && !asDate(request.completed_at));
      const requestCoverage = records.length >= REQUEST_LIMIT || hasUnattributedCompletion
        ? 'incomplete'
        : 'complete';
      if (requestCoverage === 'incomplete') requestsCoverage = 'incomplete';
      const received = records.filter((request) => inPeriod(request.received_at, range.start, now));
      const courseCompleted = records.filter((request) =>
        request.status === 'completed' && inPeriod(request.completed_at, range.start, now));
      const courseCancelled = received.filter((request) => request.status === 'cancelled');
      requests += received.length;
      completed += courseCompleted.length;
      cancelled += courseCancelled.length;
      const coverageStart = asDate(course.service_coverage_started_at);
      if (course.service_schema_version !== 2 || !coverageStart) {
        hoursCoverage = 'unknown';
      } else if (coverageStart > range.start && hoursCoverage !== 'unknown') {
        hoursCoverage = 'partial';
      }
      const courseIntervals = intervalsByCourse.get(course.course_id) || [];
      if (!intervalsConsistent(course, courseIntervals, now)) hoursCoverage = 'unknown';
      activeMinutes += intervalMinutes(
        courseIntervals,
        range.start,
        now,
      );
      completionMinutes.push(...courseCompleted.map((request) => {
        const receivedAt = asDate(request.received_at);
        const completedAt = asDate(request.completed_at);
        return receivedAt && completedAt ? (completedAt - receivedAt) / 60000 : null;
      }).filter((value) => value !== null));
    }

    const hours = activeMinutes / 60;
    const isRateAvailable = hoursCoverage === 'complete' &&
      requestsCoverage === 'complete' && hours > 0;
    const completedDisplay = requestsCoverage === 'complete'
      ? completed
      : `${completed}+ (incomplete)`;
    const requestsDisplay = requestsCoverage === 'complete'
      ? requests
      : `${requests}+ (incomplete)`;
    const activeHoursDisplay = hoursCoverage === 'complete'
      ? hours
      : hoursCoverage === 'partial'
        ? `Partial (${hours})`
        : 'Unknown';
    return [period, {
      requests: requestsDisplay,
      completed_transactions: completedDisplay,
      cancelled_requests: cancelled,
      active_cart_hours: activeHoursDisplay,
      hours_coverage: hoursCoverage,
      requests_coverage: requestsCoverage,
      transactions_per_cart_hour: isRateAvailable ? completed / hours : 'Rate unavailable',
      requests_per_hour: isRateAvailable ? requests / hours : 'Rate unavailable',
      average_completion_minutes: completionMinutes.length > 0
        ? completionMinutes.reduce((sum, value) => sum + value, 0) / completionMinutes.length
        : null,
    }];
  }));

  const requestCapReached = [...requestsByCourse.values()]
    .some((records) => records.length >= REQUEST_LIMIT);
  const history = [...requestsByCourse.values()].flat()
    .filter((request) => ['completed', 'cancelled'].includes(request.status))
    .sort((left, right) => (asDate(right.received_at) || 0) - (asDate(left.received_at) || 0))
    .slice(0, 100);
  return {
    summaries,
    history,
    history_coverage: requestCapReached || history.length === 100 ? 'capped' : 'complete',
  };
}

module.exports = {
  REQUEST_LIMIT,
  coursePeriod,
  firstInstantOfLocalDate,
  localDate,
  summarizeOperatorDashboard,
};
