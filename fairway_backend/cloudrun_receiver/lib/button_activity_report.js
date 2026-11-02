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
function buildButtonReport({ customer, course, bounds, asOf, requests, currentLabels = {} }) {
  if (requests.length > MAX_RECORDS) {
    throw new ButtonReportError('Report exceeds 20,000 source records. Choose a shorter range.', 413);
  }
  const points = [];
  const seenRequests = new Set();
  for (const request of requests) {
    const series = requestSeries(request);
    if (!series || !isRequestReportingEligible(request) ||
        request.customer_id !== customer.customer_id || request.course_id !== course.course_id ||
        request.event_type !== 'button_press' || request.source !== 'nrf9151' || seenRequests.has(request.id)) continue;
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
  const days = bounds.days.map(day => {
    const start = localMidnightUtc(parseDay(day), course.timezone);
    return start >= bounds.end ? { day, completed: null, suspended: null, cancelled: null } :
      { day, ...count(points.filter(point => point.day === day)) };
  });
  return {
    customer, course, start: bounds.start.toISOString(), end: bounds.end.toISOString(),
    as_of: asOf.toISOString(), end_exclusive: Boolean(bounds.endExclusive),
    totals: count(points), days, locations, points,
  };
}

async function generateButtonReport(db, input, { asOf = new Date(), source } = {}) {
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
  const sources = source || require('./button_report_sources').createReportSources(db);
  const requests = await sources.requests({ ...bounds, asOf, customerId: input.customer_id, courseId: input.course_id });
  const unlabeled = [...new Set(requests.filter(request => request.device_id && !request.device_label &&
    !Number.isInteger(request.hole)).map(request => request.device_id))];
  const currentLabels = unlabeled.length ? await sources.currentLabels({ deviceIds: unlabeled, courseId: input.course_id }) : {};
  return buildButtonReport({ customer, course: { course_id: course.course_id, course_name: course.course_name, timezone: course.timezone },
    bounds, asOf, requests, currentLabels });
}

module.exports = { ButtonReportError, MAX_DAYS, MAX_RECORDS, LOCATION_COLORS, reportBounds, requestLabel,
  localPoint, buildButtonReport, generateButtonReport };
