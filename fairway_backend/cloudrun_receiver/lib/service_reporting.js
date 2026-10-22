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

function requestsPerHour(completedRequestCount, activeCartHours) {
  return activeCartHours > 0 ? Number((completedRequestCount / activeCartHours).toFixed(1)) : 0;
}

function totalActiveSeconds(secondsByDay) {
  return [...secondsByDay.values()].reduce((sum, seconds) => sum + seconds, 0);
}

function composeSummary({ requests, activeSecondsByDay }) {
  const completedRequestCount = requests.length;
  const activeCartSeconds = totalActiveSeconds(activeSecondsByDay);
  const activeCartMinutes = Math.round(activeCartSeconds / 60);
  const activeCartHours = Number((activeCartMinutes / 60).toFixed(2));
  const completionDuration = totalCompletionDurationMs(requests);
  const averageCompletionMinutes = completedRequestCount === 0
    ? 0
    : completionDuration.validCount === completedRequestCount
      ? Number((completionDuration.total / completedRequestCount / 60000).toFixed(1))
      : null;
  return {
    completed_requests: completedRequestCount,
    active_cart_seconds: activeCartSeconds,
    active_cart_hours: activeCartHours,
    requests_per_hour: requestsPerHour(completedRequestCount, activeCartHours),
    average_completion_minutes: averageCompletionMinutes,
    completion_duration_total_ms: completionDuration.total,
    completion_duration_count: completionDuration.validCount,
  };
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

function aggregateSummaries(summariesByCourse) {
  return Object.fromEntries(SUMMARY_PERIODS.map((period) => {
    const summaries = summariesByCourse.map((summaries) => summaries[period]);
    const completedRequests = summaries.reduce((sum, summary) => sum + summary.completed_requests, 0);
    const activeCartMinutes = Math.round(summaries.reduce((sum, summary) => sum + summary.active_cart_seconds, 0) / 60);
    const activeCartHours = Number((activeCartMinutes / 60).toFixed(2));
    const completionDurationTotalMs = summaries.reduce((sum, summary) => sum + summary.completion_duration_total_ms, 0);
    const completionDurationCount = summaries.reduce((sum, summary) => sum + summary.completion_duration_count, 0);
    const averageCompletionMinutes = completedRequests === 0
      ? 0
      : completionDurationCount === completedRequests
        ? Number((completionDurationTotalMs / completedRequests / 60000).toFixed(1))
        : null;
    return [period, {
      completed_requests: completedRequests,
      active_cart_hours: activeCartHours,
      requests_per_hour: requestsPerHour(completedRequests, activeCartHours),
      average_completion_minutes: averageCompletionMinutes,
      completed_transactions: completedRequests,
      transactions_per_cart_hour: requestsPerHour(completedRequests, activeCartHours),
    }];
  }));
}

module.exports = {
  activeSecondsByLocalDay,
  aggregateSummaries,
  completedRequestsInRange,
  periodBounds,
  requestsPerHour,
  summarizeCoursePeriods,
};
