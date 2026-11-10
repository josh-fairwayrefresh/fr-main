'use strict';

const { addLocalDays, localMidnightUtc } = require('./service_reporting');
const { isRequestReportingEligible } = require('./request_reporting');

const MAX_DAYS = 31;
const MAX_RECORDS = 20000;

class ButtonReportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.code = 'button_report_error';
  }
}

function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ButtonReportError('Dates must use YYYY-MM-DD.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== value) throw new ButtonReportError('Invalid calendar date.');
  return { year, month, day };
}

function dayKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function dateValue(value) {
  if (value === null || value === undefined) throw new ButtonReportError('Source is missing a required timestamp.', 502);
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ButtonReportError('Source contains an invalid timestamp.', 502);
  return date;
}

function reportBounds({ start_date, end_date }, timezone, asOf) {
  const startDay = parseDay(start_date);
  const endDay = parseDay(end_date);
  const span = (Date.UTC(endDay.year, endDay.month - 1, endDay.day) -
    Date.UTC(startDay.year, startDay.month - 1, startDay.day)) / 86400000 + 1;
  if (span < 1 || span > MAX_DAYS) throw new ButtonReportError(`Choose an ordered range of 1-${MAX_DAYS} calendar days.`);
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new ButtonReportError('Course has no valid IANA timezone.', 422); }
  if (!timezone) throw new ButtonReportError('Course has no valid IANA timezone.', 422);
  const start = localMidnightUtc(startDay, timezone);
  const calendarEnd = localMidnightUtc(addLocalDays(endDay, 1), timezone);
  const end = new Date(Math.min(calendarEnd.getTime(), asOf.getTime()));
  if (start >= end) throw new ButtonReportError('The selected range has not started.');
  return { start, end, endExclusive: calendarEnd <= asOf,
    days: Array.from({ length: span }, (_, i) => dayKey(addLocalDays(startDay, i))) };
}

const LOCATION_COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#8C6500', '#6B51A3', '#56B4E9', '#E69F00',
  '#1B7837', '#B2182B', '#4D4D4D', '#F781BF', '#2166AC', '#A6761D', '#66A61E', '#E7298A', '#7570B3', '#1B9E77'];
const SERIES = ['completed', 'suspended', 'cancelled'];
const labelOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

// The location snapshot stored on each request at receipt is the label in use
// when the button was pressed; current registry placement is only a fallback.
function requestLabel(request, currentLabels = {}) {
  const snapshot = typeof request.device_label === 'string' ? request.device_label.trim() : '';
  if (snapshot) return snapshot;
  if (Number.isInteger(request.hole)) return `Hole ${request.hole}`;
  return currentLabels[request.device_id] || request.device_id;
}

function requestSeries(request) {
  if (request.status === 'completed') return 'completed';
  if (request.status === 'cancelled') return 'cancelled';
  if (request.status === 'rejected' && request.rejection_reason === 'service_suspended') return 'suspended';
  return null;
}

function localPoint(timestamp, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(dateValue(timestamp)).map(part => [part.type, part.value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) + Number(parts.minute) / 60 +
      (Number(parts.second) + dateValue(timestamp).getUTCMilliseconds() / 1000) / 3600,
  };
}

// Port of the accepted one-off generator: every series is plotted at receipt time, not completion time.
// In-service periods follow the On-course Resume/Suspend events, split at
// Course-local midnight. A day counts from its own Resume to its own Suspend
// (CPO 2026-11-02). Where a day has no logged change for one side -- service
// already on at midnight or left on past midnight -- that side is anchored to
// the day's first or last operator Complete/Cancel within the period (CPO
// 2026-11-03); without such activity the open-ended time is not shown.
// Before 2026-10-22 a Suspend expired at the Course's next scheduled start
// (midnight) without a Resume event, so a Suspend that follows a Suspend
// implies service was on from that day's midnight (or the prior Suspend).
// Service still on during the in-progress final day counts through the report
// time.
function serviceIntervals(serviceEvents, end, timezone) {
  const ordered = serviceEvents.map(event => ({ type: event.type, at: dateValue(event.recorded_at) }))
    .filter(event => event.at <= end).sort((a, b) => a.at - b.at);
  const intervals = [];
  let activeSince = null;
  let lastSuspend = null;
  for (const { type, at } of ordered) {
    if (type === 'resumed' && activeSince === null) activeSince = at;
    else if (type === 'suspended') {
      if (activeSince !== null) {
        if (at > activeSince) intervals.push({ start: activeSince, end: at });
        activeSince = null;
      } else if (lastSuspend !== null) {
        const start = new Date(Math.max(lastSuspend.getTime(),
          localMidnightUtc(parseDay(localPoint(at, timezone).day), timezone).getTime()));
        if (at > start) intervals.push({ start, end: at, impliedStart: true });
      }
      lastSuspend = at;
    }
  }
  if (activeSince !== null && end > activeSince) intervals.push({ start: activeSince, end });
  return intervals;
}

// A reviewed correction in the Course service_days register (CPO 2026-11-03)
// replaces the day's computed first start and/or last end, given as
// Course-local HH:MM.
function localTimeUtc(day, time, timezone) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hour, minute] = time.split(':').map(Number);
  let at = localMidnightUtc(parseDay(day), timezone).getTime() + (hour * 60 + minute) * 60000;
  at += Math.round((hour + minute / 60 - localPoint(new Date(at), timezone).hour) * 60) * 60000;
  return localPoint(new Date(at), timezone).day === day ? at : null;
}

function applyCorrection(ranges, correction, day, timezone, limit) {
  if (!correction) return ranges;
  const start = localTimeUtc(day, correction.start_local, timezone);
  const end = localTimeUtc(day, correction.end_local, timezone);
  let result = ranges.map(range => [...range]);
  if (start !== null && start < limit) {
    result = result.filter(range => range[1] > start);
    if (result.length) result[0][0] = start;
    else if (end !== null) result.push([start, Math.min(end, limit)]);
  }
  if (end !== null) {
    result = result.filter(range => range[0] < end);
    if (result.length) result[result.length - 1][1] = Math.min(end, limit);
  }
  return result.filter(range => range[0] < range[1]);
}

function serviceByDay(serviceEvents, bounds, timezone, operatorActions = [], corrections = null) {
  const end = bounds.end.getTime();
  const closedAtEnd = serviceEvents.some(event => event.type === 'suspended' &&
    dateValue(event.recorded_at).getTime() === end);
  const intervals = serviceIntervals(serviceEvents, bounds.end, timezone);
  const actions = operatorActions.map(action => action.getTime()).sort((a, b) => a - b);
  return new Map(bounds.days.map((day, index) => {
    const dayStart = localMidnightUtc(parseDay(day), timezone).getTime();
    const nextDay = index + 1 < bounds.days.length ? bounds.days[index + 1] : null;
    const dayEnd = Math.min(end, (nextDay ? localMidnightUtc(parseDay(nextDay), timezone) :
      localMidnightUtc(addLocalDays(parseDay(day), 1), timezone)).getTime());
    let ranges = [];
    for (const interval of intervals) {
      const from = Math.max(interval.start.getTime(), dayStart);
      const to = Math.min(interval.end.getTime(), dayEnd);
      if (from >= to) continue;
      const carriedIn = interval.impliedStart || interval.start.getTime() < dayStart;
      const truncated = interval.end.getTime() === end && !closedAtEnd;
      const carriedOut = interval.end.getTime() > dayEnd || truncated && bounds.endExclusive;
      const within = actions.filter(at => at >= from && at <= to);
      const periodStart = carriedIn ? within[0] : from;
      const periodEnd = carriedOut ? within[within.length - 1] : to;
      if (periodStart === undefined || periodEnd === undefined || periodStart >= periodEnd) continue;
      ranges.push([periodStart, periodEnd]);
    }
    if (dayStart < end) ranges = applyCorrection(ranges, corrections?.get(day), day, timezone, dayEnd);
    const seconds = ranges.reduce((sum, [from, to]) => sum + (to - from) / 1000, 0);
    const periods = ranges.map(([from, to]) => ({ start_hour: localPoint(new Date(from), timezone).hour,
      end_hour: localPoint(new Date(to), timezone).hour }));
    return [day, { periods, minutes: Math.round(seconds / 60) }];
  }));
}

function buildButtonReport({ customer, course, bounds, asOf, requests, currentLabels = {}, serviceEvents = [], serviceCorrections = null, weather = null, sales = null }) {
  if (requests.length > MAX_RECORDS) {
    throw new ButtonReportError('Report exceeds 20,000 source records. Choose a shorter range.', 413);
  }
  const points = [];
  const operatorActions = [];
  const seenRequests = new Set();
  for (const request of requests) {
    const series = requestSeries(request);
    if (!series || !isRequestReportingEligible(request) ||
        request.customer_id !== customer.customer_id || request.course_id !== course.course_id ||
        request.event_type !== 'button_press' || request.source !== 'nrf9151' || seenRequests.has(request.id)) continue;
    const action = series === 'completed' ? request.completed_at : series === 'cancelled' ? request.cancelled_at : null;
    if (action && dateValue(action) <= asOf) operatorActions.push(dateValue(action));
    const received = dateValue(request.received_at);
    if (received < bounds.start || received > bounds.end || bounds.endExclusive && received >= bounds.end || received > asOf) continue;
    if (series === 'completed' && dateValue(request.completed_at) > asOf) continue;
    if (series === 'cancelled' && request.cancelled_at && dateValue(request.cancelled_at) > asOf) continue;
    if (!request.id || !request.device_id) throw new ButtonReportError('A plotted request has no stable identity.', 502);
    seenRequests.add(request.id);
    points.push({ id: request.id, device_id: request.device_id, label: requestLabel(request, currentLabels), series,
      received_at: received.toISOString(), ...localPoint(received, course.timezone) });
  }
  points.sort((a, b) => a.received_at.localeCompare(b.received_at) || a.id.localeCompare(b.id));
  const locations = [...new Set(points.map(point => point.label))].sort(labelOrder.compare)
    .map((label, index) => ({ label, color: LOCATION_COLORS[index % LOCATION_COLORS.length] }));
  const count = rows => Object.fromEntries(SERIES.map(series => [series, rows.filter(point => point.series === series).length]));
  const hours = minutes => Number((minutes / 60).toFixed(1));
  const service = serviceByDay(serviceEvents, bounds, course.timezone, operatorActions, serviceCorrections);
  const days = bounds.days.map(day => {
    const start = localMidnightUtc(parseDay(day), course.timezone);
    const dayWeather = weather?.get(day) ? { avg_f: weather.get(day).avg_f, rain: weather.get(day).rain } : null;
    return start >= bounds.end ? { day, completed: null, suspended: null, cancelled: null, cart_hours: null, service: [], weather: null, sales_minor: null } :
      { day, ...count(points.filter(point => point.day === day)), cart_hours: hours(service.get(day).minutes),
        service: service.get(day).periods, weather: dayWeather,
        sales_minor: sales?.has(day) ? sales.get(day) : null };
  });
  const cartHours = hours(bounds.days.reduce((sum, day) => sum + service.get(day).minutes, 0));
  return {
    customer, course, start: bounds.start.toISOString(), end: bounds.end.toISOString(),
    as_of: asOf.toISOString(), end_exclusive: Boolean(bounds.endExclusive),
    totals: { ...count(points), cart_hours: cartHours }, days, locations, points, weather_available: weather !== null,
  };
}

async function generateButtonReport(db, input, { asOf = new Date(), source, fetchImpl } = {}) {
  if (!/^CUST-\d+$/.test(input.customer_id || '') || !/^COURSE-\d+$/.test(input.course_id || '')) {
    throw new ButtonReportError('Select a valid Customer and Course.');
  }
  const parent = db.collection('customers').doc(input.customer_id);
  const [customerDoc, courseDoc] = await Promise.all([parent.get(), parent.collection('courses').doc(input.course_id).get()]);
  if (!customerDoc.exists || !courseDoc.exists) throw new ButtonReportError('Course does not belong to the selected Customer.', 404);
  const course = { ...courseDoc.data(), course_id: input.course_id };
  const customer = { customer_id: input.customer_id, customer_name: customerDoc.data().customer_name };
  // COURSE IDs are centrally allocated globally and never restart per Customer (fleet/courses.js).
  const owners = await db.collectionGroup('courses').select().limit(10001).get();
  if (owners.size > 10000 || owners.docs.filter(doc => doc.id === input.course_id).length !== 1) {
    throw new ButtonReportError('Course ownership could not be verified unambiguously.', 422);
  }
  const bounds = reportBounds(input, course.timezone, asOf);
  const sources = source || require('./button_report_sources').createReportSources(db, { fetchImpl });
  const requests = await sources.requests({ ...bounds, asOf, customerId: input.customer_id, courseId: input.course_id });
  const unlabeled = [...new Set(requests.filter(request => request.device_id && !request.device_label &&
    !Number.isInteger(request.hole)).map(request => request.device_id))];
  const today = localPoint(asOf, course.timezone).day;
  const [currentLabels, serviceEvents, serviceCorrections, weather, sales] = await Promise.all([
    unlabeled.length ? sources.currentLabels({ deviceIds: unlabeled, courseId: input.course_id }) : {},
    sources.serviceEvents({ ...bounds, customerId: input.customer_id, courseId: input.course_id }),
    sources.serviceCorrections ? sources.serviceCorrections({ customerId: input.customer_id, courseId: input.course_id,
      days: bounds.days }) : null,
    sources.weather ? sources.weather({ customerId: input.customer_id, courseId: input.course_id, course, days: bounds.days,
      today, now: asOf }) : null,
    sources.sales ? sources.sales({ customerId: input.customer_id, courseId: input.course_id, course, days: bounds.days,
      today, start: bounds.start, end: bounds.end, now: asOf }) : null,
  ]);
  return buildButtonReport({ customer, course: { course_id: course.course_id, course_name: course.course_name, timezone: course.timezone },
    bounds, asOf, requests, currentLabels, serviceEvents, serviceCorrections, weather, sales });
}

module.exports = { ButtonReportError, MAX_DAYS, MAX_RECORDS, LOCATION_COLORS, reportBounds, requestLabel,
  localPoint, buildButtonReport, generateButtonReport };
