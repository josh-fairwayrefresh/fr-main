'use strict';

const { addLocalDays, localMidnightUtc } = require('./service_reporting');

const MAX_DAYS = 31;
const MAX_RECORDS = 20000;
const REFERENCE_COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#8C6500', '#6B51A3'];
const REJECTION_MESSAGE = 'Rejected golfer request because Course service is unavailable:';

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

function deviceColor(id) {
  const numeric = /^FRB-(\d+)$/.exec(id);
  if (numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 6) return REFERENCE_COLORS[Number(numeric[1]) - 1];
  let hash = 0;
  for (const character of id) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return `#${[0, 8, 16].map(shift => (45 + ((hash >>> shift) & 127)).toString(16).padStart(2, '0')).join('')}`;
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

function parseRejection(entry) {
  if (!entry.textPayload?.startsWith(REJECTION_MESSAGE)) return null;
  const device = /device_id:\s*'([^']+)'/.exec(entry.textPayload);
  const course = /course_id:\s*'([^']+)'/.exec(entry.textPayload);
  if (!device || !course || !entry.timestamp || !entry.insertId || !entry.logName) {
    throw new ButtonReportError('A matching rejection log cannot be attributed reliably.', 502);
  }
  return { id: `${entry.logName}/${entry.insertId}`, device_id: device[1], course_id: course[1], received_at: entry.timestamp };
}

// Port of the accepted one-off generator: both series use receipt time, not completion time.
function buildButtonReport({ customer, course, bounds, asOf, logs, requests, retentionStart, sourceReadTime }) {
  if (logs.length > MAX_RECORDS || requests.length > MAX_RECORDS) {
    throw new ButtonReportError('Report exceeds 20,000 source records. Choose a shorter range.', 413);
  }
  const points = [];
  const seenLogs = new Set();
  for (const entry of logs) {
    const row = parseRejection(entry);
    if (!row || row.course_id !== course.course_id || seenLogs.has(row.id)) continue;
    seenLogs.add(row.id);
    const received = dateValue(row.received_at);
    if (received < bounds.start || received > bounds.end || bounds.endExclusive && received >= bounds.end || received > asOf) continue;
    points.push({ ...row, series: 'empty', ...localPoint(row.received_at, course.timezone) });
  }
  const seenRequests = new Set();
  for (const request of requests) {
    if (request.customer_id !== customer.customer_id || request.course_id !== course.course_id ||
        request.status !== 'completed' || request.event_type !== 'button_press' ||
        request.source !== 'nrf9151' || seenRequests.has(request.id)) continue;
    const received = dateValue(request.received_at);
    if (received < bounds.start || received > bounds.end || bounds.endExclusive && received >= bounds.end ||
        dateValue(request.completed_at) > asOf) continue;
    if (!request.id || !request.device_id) throw new ButtonReportError('A completed request has no stable identity.', 502);
    seenRequests.add(request.id);
    points.push({ id: request.id, device_id: request.device_id, series: 'completed',
      received_at: received.toISOString(), ...localPoint(received, course.timezone) });
  }
  points.sort((a, b) => a.received_at.localeCompare(b.received_at) || a.id.localeCompare(b.id));
  const floor = dateValue(retentionStart);
  const devices = [...new Set(points.map(point => point.device_id))].sort().map(id => ({
    device_id: id, color: deviceColor(id), label: id,
  }));
  const days = bounds.days.map(day => {
    const parts = parseDay(day);
    const start = localMidnightUtc(parts, course.timezone);
    const end = localMidnightUtc(addLocalDays(parts, 1), course.timezone);
    const observed = points.filter(point => point.day === day);
    const coverage = end <= bounds.start || start >= bounds.end ? 'outside_window' :
      end <= floor ? observed.some(point => point.series === 'empty') ? 'partial' : 'unavailable' :
        start < floor ? 'partial' : 'retained_logs';
    return { day, coverage, empty: coverage === 'unavailable' || coverage === 'outside_window' ? null :
      observed.filter(point => point.series === 'empty').length,
    completed: start >= bounds.end ? null : observed.filter(point => point.series === 'completed').length };
  });
  return {
    customer, course, start: bounds.start.toISOString(), end: bounds.end.toISOString(),
    as_of: asOf.toISOString(), end_exclusive: Boolean(bounds.endExclusive),
    source_read_time: sourceReadTime, retention_start: floor.toISOString(),
    coverage: bounds.start < floor ? 'partial' : 'retained_logs',
    totals: { empty: points.filter(point => point.series === 'empty').length,
      completed: points.filter(point => point.series === 'completed').length },
    days, devices, points,
    notes: [
      'Empty: received service-unavailable rejection attempts, including separate transport retries.',
      'Completed: accepted physical-button requests completed by as-of; counted once and plotted at receipt, not completion.',
      'Cancelled/open requests and QR activity excluded. Nearby points overlap.',
      'Logs reflect service eligibility rules in force at receipt (including historical schedule-based availability).',
      'Log retention describes availability, not guaranteed completeness. Counts are observed records; ingestion delays or historical exclusions may omit attempts.',
      'Unavailable/partial empty coverage is not zero. Completed counts may increase when requests are completed later.',
      'Historical locations are unverified unless independently evidenced; current device placement is never used to relabel history.',
    ],
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
  const retention = await sources.retention(asOf);
  const [logs, requests] = await Promise.all([
    sources.logs({ ...bounds, courseId: input.course_id }),
    sources.requests({ ...bounds, asOf, customerId: input.customer_id, courseId: input.course_id }),
  ]);
  return buildButtonReport({ customer, course: { course_id: course.course_id, course_name: course.course_name, timezone: course.timezone },
    bounds, asOf, logs, requests, retentionStart: retention.start, sourceReadTime: requests.readTime || asOf.toISOString() });
}

module.exports = { ButtonReportError, MAX_DAYS, MAX_RECORDS, REJECTION_MESSAGE, reportBounds, deviceColor,
  parseRejection, localPoint, buildButtonReport, generateButtonReport };
