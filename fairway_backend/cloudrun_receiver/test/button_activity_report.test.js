'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./fixtures/button_activity_reference.json');
const { reportBounds, buildButtonReport, generateButtonReport, deviceColor } = require('../lib/button_activity_report');
const { collectLogPages, collectRequestPages, createReportSources } = require('../lib/button_report_sources');
const { renderButtonReport } = require('../lib/button_report_pdf');
const { FakeFirestore } = require('./fake_firestore');
const { createFairwayHandlers } = require('../index');

function reference() {
  const asOf = new Date(fixture.asOf);
  const bounds = reportBounds({ start_date: '2026-10-17', end_date: '2026-10-28' }, fixture.course.timezone, asOf);
  bounds.start = new Date(fixture.start);
  return buildButtonReport({ ...fixture, bounds, asOf, retentionStart: '2026-09-28T17:30:04.899Z',
    sourceReadTime: fixture.asOf });
}

test('accepted exports reconcile all 116/63 records, 12 daily totals and 179 original plotted coordinates', () => {
  const report = reference();
  assert.deepEqual(report.totals, { empty: 116, completed: 63 });
  assert.deepEqual(report.days.map(day => [day.empty, day.completed]), fixture.expectedDaily);
  const recordKeys = records => records.map(({ series, id, device_id, received_at }) =>
    JSON.stringify({ series, id, device_id, received_at })).sort();
  assert.deepEqual(recordKeys(report.points), recordKeys(fixture.expectedRecords));
  const expected = [...fixture.expectedPoints];
  for (const point of report.points) {
    const index = report.days.findIndex(day => day.day === point.day);
    const x = 105 + (1395 - 105) / 12 * (index + 0.5);
    const y = 865 - point.hour / 24 * (865 - 245);
    const match = expected.findIndex(other => other.series === point.series && other.color === deviceColor(point.device_id) &&
      Math.abs(other.x - x) < 0.001 && Math.abs(other.y - y) < 0.01);
    assert.notEqual(match, -1, JSON.stringify(point));
    expected.splice(match, 1);
  }
  assert.equal(expected.length, 0);
  assert.ok(report.devices.every(device => device.label === device.device_id));
  assert.equal(report.devices.find(device => device.device_id === 'FRB-0002').color, '#D55E00');
  assert.equal(report.devices.find(device => device.device_id === 'FRB-0006').color, '#6B51A3');
  assert.equal(report.start, fixture.start);
  assert.equal(report.as_of, fixture.asOf);
});

test('DST boundaries, inclusive date selection, future ranges and malformed dates are explicit', () => {
  const bounds = (day, timezone = 'America/Los_Angeles') => reportBounds({ start_date: day, end_date: day }, timezone, new Date('2027-01-01'));
  assert.equal(bounds('2026-11-01').end - bounds('2026-11-01').start, 25 * 3600000);
  assert.equal(bounds('2026-03-08').end - bounds('2026-03-08').start, 23 * 3600000);
  assert.equal(bounds('2026-10-17', 'Pacific/Kiritimati').start.toISOString(), '2026-10-16T10:00:00.000Z');
  for (const input of [
    { start_date: '2026-02-30', end_date: '2026-03-01' },
    { start_date: '2026-01-01', end_date: '2026-02-01' },
    { start_date: '2026-10-28', end_date: '2026-10-17' },
    { start_date: '2028-01-01', end_date: '2028-01-01' },
  ]) assert.throws(() => reportBounds(input, 'UTC', new Date('2027-01-01')));
  assert.throws(() => bounds('2026-10-17', 'invalid'), /timezone/);
});

test('zero is not substituted for unavailable history; retries remain separate and exact duplicate logs deduplicate', () => {
  const original = reference();
  const report = buildButtonReport({ ...fixture, asOf: new Date(fixture.asOf),
    bounds: { start: new Date(fixture.start), end: new Date(fixture.asOf), days: original.days.map(day => day.day) },
    retentionStart: '2026-10-24T12:00:00Z', logs: [...fixture.logs, fixture.logs[0]] });
  assert.equal(report.totals.empty, 116);
  assert.equal(report.days[0].empty, null);
  assert.equal(report.days[0].coverage, 'unavailable');
  assert.equal(report.days[1].coverage, 'partial');
  assert.equal(report.coverage, 'partial');
  assert.ok(report.notes.some(note => note.includes('not guaranteed completeness')));
});

test('malformed matching records fail, and device colors/uncertainty remain stable across ranges', () => {
  const report = reference();
  const input = { ...fixture, bounds: { start: new Date(fixture.start), end: new Date(fixture.asOf),
    days: report.days.map(day => day.day) }, asOf: new Date(fixture.asOf), retentionStart: '2026-09-28' };
  assert.throws(() => buildButtonReport({ ...input, logs: [{ ...fixture.logs[0], insertId: undefined }] }), /attributed/);
  const physical = fixture.requests.find(request => request.status === 'completed');
  assert.throws(() => buildButtonReport({ ...input, requests: [{ ...physical, completed_at: null }] }), /missing.*timestamp/);
  const subset = buildButtonReport({ ...input, logs: [], requests: [physical] });
  assert.equal(subset.devices[0].color, report.devices.find(device => device.device_id === physical.device_id).color);
  assert.equal(deviceColor('FRB-9999'), deviceColor('FRB-9999'));
  assert.match(deviceColor('FRB-9999'), /^#[0-9a-f]{6}$/);
});

test('exclusive end midnight, completion as-of, wrong Course, QR, cancelled and open requests are excluded', () => {
  const asOf = new Date('2026-10-29T12:00:00Z');
  const bounds = reportBounds({ start_date: '2026-10-28', end_date: '2026-10-28' }, 'UTC', asOf);
  const base = { id: 'one', device_id: 'FRB-0001', customer_id: 'CUST-0001', course_id: 'COURSE-0001',
    event_type: 'button_press', source: 'nrf9151', status: 'completed',
    received_at: '2026-10-28T12:00:00Z', completed_at: '2026-10-28T12:30:00Z' };
  const requests = [base, base, { ...base, id: 'midnight', received_at: '2026-10-29T00:00:00Z' },
    { ...base, id: 'later', completed_at: '2026-10-30T12:00:00Z' },
    ...[{ status: 'cancelled' }, { status: 'new' }, { source: 'qr' }, { customer_id: 'CUST-0002' },
      { course_id: 'COURSE-0002' }].map((extra, i) => ({ ...base, id: `other-${i}`, ...extra }))];
  const report = buildButtonReport({ ...fixture, course: { ...fixture.course, timezone: 'UTC' },
    bounds, asOf, logs: [], requests, retentionStart: '2026-10-01' });
  assert.deepEqual(report.points.map(point => point.id), ['one']);
  assert.deepEqual(report.totals, { empty: 0, completed: 1 });
});

test('Logging retrieves empty continuation pages, detects token loops/limits and propagates query failures', async () => {
  const tokens = [];
  const rows = await collectLogPages(async body => {
    tokens.push(body.pageToken);
    return !body.pageToken ? { entries: [{ id: 1 }], nextPageToken: 'next' } :
      body.pageToken === 'next' ? { nextPageToken: 'last' } : { entries: [{ id: 2 }] };
  }, {});
  assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(tokens, [undefined, 'next', 'last']);
  await assert.rejects(collectLogPages(async () => ({ nextPageToken: 'loop' }), {}), /did not advance/);
  await assert.rejects(collectLogPages(async () => ({ entries: Array(20001).fill({}) }), {}), /Too many/);
  await assert.rejects(collectLogPages(async () => { throw new Error('permission denied'); }, {}), /permission denied/);
});

test('Firestore pagination reads every page including equal receipt timestamps and enforces a visible cap', async () => {
  const pages = [Array.from({ length: 500 }, (_, i) => ({ id: String(i), data: () => ({ received_at: fixture.start }) })),
    [{ id: 'last', data: () => ({ received_at: fixture.start }) }]];
  const cursors = [];
  const rows = await collectRequestPages(async cursor => { cursors.push(cursor?.id); return { docs: pages.shift() }; });
  assert.equal(rows.length, 501);
  assert.deepEqual(cursors, [undefined, '499']);
  await assert.rejects(collectRequestPages(async () => ({
    docs: Array.from({ length: 500 }, (_, i) => ({ id: String(i), data: () => ({}) })),
  })), /Too many/);
});

test('production adapter uses ADC, bucket retention and paginated scoped logs; permission failure is an error', async () => {
  const calls = [];
  const sources = createReportSources({}, { auth: {
    getProjectId: async () => 'isolated-project',
    getClient: async () => ({ request: async options => {
      calls.push(options);
      return { data: options.method === 'GET' ? { lifecycleState: 'ACTIVE', retentionDays: 30 } : { entries: [] } };
    } }),
  } });
  assert.equal((await sources.retention(new Date(fixture.asOf))).start, '2026-09-28T17:30:04.899Z');
  await sources.logs({ start: new Date(fixture.start), end: new Date(fixture.asOf), courseId: 'COURSE-0001' });
  assert.ok(calls[1].data.filter.includes("course_id: 'COURSE-0001'"));
  assert.ok(calls[1].data.resourceNames[0].endsWith('/buckets/_Default/views/_AllLogs'));
  const failing = createReportSources({}, { auth: { getProjectId: async () => 'isolated-project',
    getClient: async () => ({ request: async () => { throw new Error('isolated permission failure'); } }) } });
  await assert.rejects(failing.retention(new Date()), /Cloud Logging read failed/);
});

test('Firestore adapter reuses receipt DESC index with document cursor and one read-only as-of snapshot', async () => {
  const calls = [];
  const query = Object.fromEntries(['where', 'orderBy', 'select', 'limit', 'startAfter'].map(method =>
    [method, (...args) => { calls.push([method, ...args]); return query; }]));
  const documents = Array.from({ length: 501 }, (_, i) => ({ id: String(i), data: () => ({ received_at: fixture.start }) }));
  let page = 0, transactionOptions;
  const db = { collection: name => { assert.equal(name, 'requests'); return query; },
    runTransaction: async (run, options) => {
      transactionOptions = options;
      return run({ get: async () => ({ docs: page++ === 0 ? documents.slice(0, 500) : documents.slice(500) }) });
    } };
  const asOf = new Date(fixture.asOf);
  const result = await createReportSources(db).requests({ start: new Date(fixture.start), end: asOf,
    asOf, customerId: 'CUST-0001', courseId: 'COURSE-0001', endExclusive: true });
  assert.equal(result.length, 501);
  assert.equal(transactionOptions.readOnly, true);
  assert.equal(transactionOptions.readTime.toDate().toISOString(), fixture.asOf);
  assert.ok(calls.some(([method, field, direction]) => method === 'orderBy' && field === 'received_at' && direction === 'desc'));
  assert.ok(calls.some(([method, field, operator]) => method === 'where' && field === 'received_at' && operator === '<'));
  assert.equal(calls.find(([method]) => method === 'startAfter')[1], documents[499]);
  assert.equal(result.readTime, fixture.asOf);
  await assert.rejects(createReportSources({ runTransaction: async () => { throw new Error('isolated index failure'); } })
    .requests({ asOf }), /Firestore report read failed/);
});

test('source budget expiry is an explicit failure, not a late successful report', async context => {
  let clock = 0;
  context.mock.method(Date, 'now', () => clock);
  const source = createReportSources({}, { auth: { getProjectId: async () => 'isolated-project',
    getClient: async () => ({ request: async () => {
      clock = 46000;
      return { data: { lifecycleState: 'ACTIVE', retentionDays: 30 } };
    } }) } });
  await assert.rejects(source.retention(new Date(fixture.asOf)), /45 seconds/);
});

async function database() {
  const db = new FakeFirestore();
  await db.collection('customers').doc('CUST-0001').set({ customer_name: 'Synthetic Customer' });
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001')
    .set({ course_name: 'Synthetic Course', timezone: 'America/Los_Angeles' });
  db.collectionGroup = () => ({ select() { return this; }, limit() { return this; },
    get: async () => ({ size: 1, docs: [{ id: 'COURSE-0001' }] }) });
  return db;
}

test('server validates Customer/Course before querying sources and rejects ambiguous ownership', async () => {
  const db = await database();
  const input = { customer_id: 'CUST-0001', course_id: 'COURSE-0002', start_date: '2026-10-17', end_date: '2026-10-28' };
  const source = { retention: () => { throw new Error('must not query'); } };
  await assert.rejects(generateButtonReport(db, input, { source }), /does not belong/);
  db.collectionGroup = () => ({ select() { return this; }, limit() { return this; },
    get: async () => ({ size: 2, docs: [{ id: 'COURSE-0001' }, { id: 'COURSE-0001' }] }) });
  await assert.rejects(generateButtonReport(db, { ...input, course_id: 'COURSE-0001' }, { source }), /unambiguously/);
});

test('actual Admin route denies unsigned/non-Admin callers and returns a PDF only to existing stored Admin access', async () => {
  const db = await database();
  await db.collection('user_access').doc('admin').set({ schema_version: 2, admin: true, customer_id: null, course_ids: [] });
  await db.collection('user_access').doc('operator').set({ schema_version: 2, admin: false, customer_id: 'CUST-0001', course_ids: ['COURSE-0001'] });
  const instance = createFairwayHandlers(db, { verifyOperatorToken: async token => ({ uid: token }),
    now: () => new Date(fixture.asOf), buttonReportSource: {
      retention: async () => ({ start: '2026-09-28' }), logs: async () => [], requests: async () => [],
    } });
  async function run(token, extra = {}) {
    const res = { headers: {}, set(k, v) { this.headers[k] = v; return this; },
      status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; return this; },
      json(body) { this.body = body; return this; } };
    await instance.fairwayAdmin({ method: 'POST', path: '/api/v1/admin/reports/button-activity',
      get: key => key.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : undefined,
      body: { customer_id: 'CUST-0001', course_id: 'COURSE-0001', start_date: '2026-10-17', end_date: '2026-10-28', ...extra } }, res);
    return res;
  }
  assert.equal((await run()).statusCode, 401);
  assert.equal((await run('operator')).statusCode, 403);
  assert.equal((await run('admin', { course_id: 'COURSE-9999' })).statusCode, 404);
  const result = await run('admin');
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['Content-Type'], 'application/pdf');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.body.subarray(0, 4).toString(), '%PDF');
});

test('renderer produces landscape Letter reference and continuation PDFs without re-querying or recounting', async () => {
  const report = reference();
  const pdf = await renderButtonReport(report);
  assert.ok(pdf.includes(Buffer.from('/MediaBox [0 0 792 612]')));
  if (process.env.BUTTON_REPORT_SAMPLE_DIR) {
    const root = process.env.BUTTON_REPORT_SAMPLE_DIR;
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'button-activity-reference.pdf'), pdf);
    fs.writeFileSync(path.join(root, 'reference-model.json'), JSON.stringify(report, null, 2));
  }
  const asOf = new Date('2026-11-01T08:00:00Z');
  const long = buildButtonReport({ ...fixture, asOf,
    bounds: reportBounds({ start_date: '2026-10-01', end_date: '2026-10-31' }, fixture.course.timezone, asOf),
    retentionStart: '2026-10-02T08:00:00Z' });
  const longPdf = await renderButtonReport(long);
  assert.equal(longPdf.toString('latin1').match(/\/Type \/Page\b/g).length, 3);
  if (process.env.BUTTON_REPORT_SAMPLE_DIR) fs.writeFileSync(path.join(process.env.BUTTON_REPORT_SAMPLE_DIR, 'button-activity-31-day-layout.pdf'), longPdf);
  const eighteen = { ...report, devices: [...report.devices, ...Array.from({ length: 12 }, (_, i) => {
    const id = `FRB-${String(i + 7).padStart(4, '0')}`;
    return { device_id: id, color: deviceColor(id), label: id };
  })] };
  const eighteenPdf = await renderButtonReport(eighteen);
  assert.equal(eighteenPdf.toString('latin1').match(/\/Type \/Page\b/g).length, 1);
  if (process.env.BUTTON_REPORT_SAMPLE_DIR) fs.writeFileSync(path.join(process.env.BUTTON_REPORT_SAMPLE_DIR, 'button-activity-18-device-layout.pdf'), eighteenPdf);
  assert.throws(() => renderButtonReport({ ...report, devices: Array(19).fill(report.devices[0]) }), /18 devices/);
  assert.throws(() => renderButtonReport({ ...report, course: { ...report.course, course_name: '\u65e5\u672c' } }), /unsupported.*PDF font/);
  await assert.rejects(renderButtonReport({ ...report, course: { ...report.course, course_name: 'Very long name '.repeat(30) } }), /heading limit/);
});
