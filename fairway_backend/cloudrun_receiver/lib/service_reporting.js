'use strict';

const SUMMARY_PERIODS = Object.freeze(['daily', 'weekly', 'monthly']);

function toDate(value) {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  return null;
}

function localDateParts(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function localDateKey(parts) {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function addLocalDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function localMidnightUtc(parts, timeZone) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day);
  let result = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = localDateParts(new Date(result), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day);
    const localTime = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(result));
    const values = Object.fromEntries(localTime.map((part) => [part.type, part.value]));
    const actualTimeMs = (
      Number(values.hour) * 3600000 +
      Number(values.minute) * 60000 +
      Number(values.second) * 1000
    );
    const actualLocalAsUtc = actualAsUtc + actualTimeMs;
    if (actualLocalAsUtc === target) return new Date(result);
    result += target - actualLocalAsUtc;
  }
  return new Date(result);
}

function periodBounds(asOf, timeZone) {
  const current = localDateParts(asOf, timeZone);
  const weekday = new Date(Date.UTC(current.year, current.month - 1, current.day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = addLocalDays(current, -daysSinceMonday);
  const monthStart = { year: current.year, month: current.month, day: 1 };
  return {
    daily: { start: localMidnightUtc(current, timeZone), end: asOf },
    weekly: { start: localMidnightUtc(monday, timeZone), end: asOf },
    monthly: { start: localMidnightUtc(monthStart, timeZone), end: asOf },
  };
}

function splitIntervalsByLocalDay(intervals, range, timeZone) {
  const secondsByDay = new Map();
  for (const interval of intervals) {
    let cursor = Math.max(interval.start.getTime(), range.start.getTime());
    const end = Math.min(interval.end.getTime(), range.end.getTime());
    while (cursor < end) {
      const day = localDateParts(new Date(cursor), timeZone);
      const nextMidnight = localMidnightUtc(addLocalDays(day, 1), timeZone).getTime();
      const segmentEnd = Math.min(end, nextMidnight > cursor ? nextMidnight : cursor + 86400000);
      const key = localDateKey(day);
      secondsByDay.set(key, (secondsByDay.get(key) || 0) + (segmentEnd - cursor) / 1000);
      cursor = segmentEnd;
    }
  }
  return secondsByDay;
}

function activeIntervals(events, asOf) {
  const ordered = events
    .map((event) => ({ event, at: toDate(event.recorded_at) }))
    .filter(({ at }) => at && at <= asOf)
    .sort((left, right) => left.at - right.at);
  const intervals = [];
  let activeSince = null;
  for (const { event, at } of ordered) {
    if (event.type === 'resumed' && activeSince === null) {
      activeSince = at;
    } else if (event.type === 'suspended' && activeSince !== null) {
      if (at > activeSince) intervals.push({ start: activeSince, end: at });
      activeSince = null;
    }
  }
  if (activeSince !== null && asOf > activeSince) {
    intervals.push({ start: activeSince, end: asOf });
  }
  return intervals;
}

function activeSecondsByLocalDay(events, range, timeZone, asOf) {
  return splitIntervalsByLocalDay(activeIntervals(events, asOf), range, timeZone);
}

function completedRequestsInRange(requests, range) {
  return requests.filter((request) => {
    const completedAt = toDate(request.completed_at);
    return request.status === 'completed' && completedAt &&
      completedAt >= range.start && completedAt <= range.end;
  });
}

function outcomeTime(request) {
  if (request.status === 'completed') return toDate(request.completed_at);
  if (request.status === 'cancelled') return toDate(request.cancelled_at);
  if (request.status === 'rejected' && request.rejection_reason === 'service_suspended') {
    return toDate(request.received_at);
  }
  return null;
}

function historyRequestsInRange(requests, range) {
  return requests
    .filter((request) => {
      const timestamp = outcomeTime(request);
      return timestamp && timestamp >= range.start && timestamp <= range.end;
    })
    .sort((left, right) => outcomeTime(right) - outcomeTime(left));
}

function totalCompletionDurationMs(requests) {
  let total = 0;
  let validCount = 0;
  for (const request of requests) {
    const receivedAt = toDate(request.received_at);
    const completedAt = toDate(request.completed_at);
    if (!receivedAt || !completedAt || completedAt < receivedAt) continue;
    total += completedAt.getTime() - receivedAt.getTime();
    validCount += 1;
  }
  return { total, validCount };
}

function totalActiveSeconds(secondsByDay) {
  return [...secondsByDay.values()].reduce((sum, seconds) => sum + seconds, 0);
}

function finalizeSummary({
  completedRequestCount,
  activeCartSeconds,
  completionDurationTotalMs,
  completionDurationCount,
}) {
  const activeCartMinutes = Math.round(activeCartSeconds / 60);
  const activeCartHours = activeCartMinutes / 60;
  const averageCompletionMinutes = completedRequestCount === 0
    ? 0
    : completionDurationCount === completedRequestCount
      ? Number((completionDurationTotalMs / completedRequestCount / 60000).toFixed(1))
      : null;
  const requestsPerCartHour = activeCartMinutes > 0
    ? Number((completedRequestCount / (activeCartMinutes / 60)).toFixed(1))
    : 0;
  return {
    completed_requests: completedRequestCount,
    active_cart_seconds: activeCartSeconds,
    active_cart_minutes: activeCartMinutes,
    active_cart_hours: Number(activeCartHours.toFixed(2)),
    requests_per_hour: requestsPerCartHour,
    average_completion_minutes: averageCompletionMinutes,
    completion_duration_total_ms: completionDurationTotalMs,
    completion_duration_count: completionDurationCount,
    completed_transactions: completedRequestCount,
    transactions_per_cart_hour: requestsPerCartHour,
  };
}

function composeSummary({ requests, activeSecondsByDay }) {
  const completionDuration = totalCompletionDurationMs(requests);
  return finalizeSummary({
    completedRequestCount: requests.length,
    activeCartSeconds: totalActiveSeconds(activeSecondsByDay),
    completionDurationTotalMs: completionDuration.total,
    completionDurationCount: completionDuration.validCount,
  });
}

function summarizeCoursePeriods(course, events, requests, asOf) {
  const bounds = periodBounds(asOf, course.timezone);
  const activeTime = Object.fromEntries(SUMMARY_PERIODS.map((period) => [
    period,
    activeSecondsByLocalDay(events, bounds[period], course.timezone, asOf),
  ]));
  const completed = Object.fromEntries(SUMMARY_PERIODS.map((period) => [
    period,
    completedRequestsInRange(requests, bounds[period]),
  ]));
  return Object.fromEntries(SUMMARY_PERIODS.map((period) => [
    period,
    composeSummary({ requests: completed[period], activeSecondsByDay: activeTime[period] }),
  ]));
}

function reportCoursePeriods(course, events, completedRequests, historyRequests, asOf) {
  const summaries = summarizeCoursePeriods(course, events, completedRequests, asOf);
  const bounds = periodBounds(asOf, course.timezone);
  return Object.fromEntries(SUMMARY_PERIODS.map((period) => [period, {
    summary: summaries[period],
    history: historyRequestsInRange(historyRequests, bounds[period]),
  }]));
}

function aggregateSummaries(summariesByCourse) {
  return Object.fromEntries(SUMMARY_PERIODS.map((period) => {
    const summaries = summariesByCourse.map((summaries) => summaries[period]);
    const finalized = finalizeSummary({
      completedRequestCount: summaries.reduce((sum, summary) => sum + summary.completed_requests, 0),
      activeCartSeconds: summaries.reduce((sum, summary) => sum + summary.active_cart_seconds, 0),
      completionDurationTotalMs: summaries.reduce(
        (sum, summary) => sum + summary.completion_duration_total_ms, 0,
      ),
      completionDurationCount: summaries.reduce(
        (sum, summary) => sum + summary.completion_duration_count, 0,
      ),
    });
    const {
      active_cart_seconds: _activeCartSeconds,
      active_cart_minutes: _activeCartMinutes,
      completion_duration_total_ms: _completionDurationTotalMs,
      completion_duration_count: _completionDurationCount,
      ...summary
    } = finalized;
    return [period, summary];
  }));
}

function aggregateCourseReports(reportsByCourse, { includeSummaries = true } = {}) {
  const summaryByCourse = reportsByCourse.map((reports) => Object.fromEntries(
    SUMMARY_PERIODS.map((period) => [period, reports[period].summary]),
  ));
  const summaries = includeSummaries ? aggregateSummaries(summaryByCourse) : null;
  return Object.fromEntries(SUMMARY_PERIODS.map((period) => [period, {
    ...(summaries ? { summary: summaries[period] } : {}),
    history: reportsByCourse.flatMap((reports) => reports[period].history)
      .sort((left, right) => outcomeTime(right) - outcomeTime(left)),
  }]));
}

module.exports = {
  addLocalDays,
  localMidnightUtc,
  activeSecondsByLocalDay,
  aggregateCourseReports,
  aggregateSummaries,
  completedRequestsInRange,
  finalizeSummary,
  historyRequestsInRange,
  periodBounds,
  reportCoursePeriods,
  summarizeCoursePeriods,
};
