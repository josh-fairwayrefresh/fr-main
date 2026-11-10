'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./fixtures/button_activity_reference.json');
const { reportBounds, buildButtonReport, generateButtonReport, LOCATION_COLORS } = require('../lib/button_activity_report');
const { collectRequestPages, createReportSources } = require('../lib/button_report_sources');
const { renderButtonReport, windowText } = require('../lib/button_report_pdf');
const { FakeFirestore } = require('./fake_firestore');
const { createFairwayHandlers } = require('../index');

const asOf = new Date(fixture.asOf);
const bounds = () => reportBounds({ start_date: '2026-10-17', end_date: '2026-10-28' }, fixture.course.timezone, asOf);
const base = { customer_id: 'CUST-0001', course_id: 'COURSE-0001', event_type: 'button_press', source: 'nrf9151' };
const request = (id, status, receivedAt, extra = {}) => ({ ...base, id, status, device_id: 'FRB-0001',
  device_label: 'Hole 7', received_at: receivedAt,
  ...(status === 'completed' ? { completed_at: receivedAt } : {}),
  ...(status === 'cancelled' ? { cancelled_at: receivedAt } : {}),
  ...(status === 'rejected' ? { rejection_reason: 'service_suspended' } : {}), ...extra });
const build = (requests, extra = {}) => buildButtonReport({ customer: fixture.customer, course: fixture.course,
  bounds: bounds(), asOf, requests, ...extra });

function reference() {
  return build(fixture.requests);
}

test('saved reference requests reconcile 63 completed and 20 cancelled records at receipt time', () => {
  const report = reference();
  assert.deepEqual(report.totals, { completed: 63, suspended: 0, cancelled: 20, cart_hours: 0 });
  assert.deepEqual(report.days.map(day => day.completed), fixture.expectedDaily.map(([, completed]) => completed));
  assert.deepEqual(report.points.filter(point => point.series === 'completed').map(point => point.id).sort(),
    fixture.expectedRecords.filter(record => record.series === 'completed').map(record => record.id).sort());
  assert.ok(report.points.every(point => point.label === point.device_id), 'unlabelled fixture falls back to device ID');
  assert.equal(report.as_of, fixture.asOf);
});

test('three series use saved suspended, cancelled and completed requests and honour Admin exclusion', () => {
  const requests = [
    request('done', 'completed', '2026-10-20T18:00:00.000Z'),
    request('done-excluded', 'completed', '2026-10-20T18:01:00.000Z', { reporting_state: 'excluded' }),
    request('suspended', 'rejected', '2026-10-20T18:02:00.000Z'),
    request('suspended-excluded', 'rejected', '2026-10-20T18:03:00.000Z', { reporting_state: 'excluded' }),
    request('cancelled', 'cancelled', '2026-10-20T18:04:00.000Z'),
    request('cancelled-excluded', 'cancelled', '2026-10-20T18:05:00.000Z', { reporting_state: 'excluded' }),
    request('open', 'new', '2026-10-20T18:06:00.000Z'),
    request('other-rejection', 'rejected', '2026-10-20T18:07:00.000Z', { rejection_reason: 'other' }),
    request('qr', 'completed', '2026-10-20T18:08:00.000Z', { source: 'qr' }),
    request('other-course', 'completed', '2026-10-20T18:09:00.000Z', { course_id: 'COURSE-0002' }),
    request('done', 'completed', '2026-10-20T18:00:00.000Z'),
  ];
  const report = build(requests);
  assert.deepEqual(report.points.map(point => [point.id, point.series]),
    [['done', 'completed'], ['suspended', 'suspended'], ['cancelled', 'cancelled']]);
  assert.deepEqual(report.totals, { completed: 1, suspended: 1, cancelled: 1, cart_hours: 0 });
  const restored = build(requests.map(row => ({ ...row, reporting_state: 'active' })));
  assert.deepEqual(restored.totals, { completed: 2, suspended: 2, cancelled: 2, cart_hours: 0 });
  const day = report.days.find(item => item.day === '2026-10-20');
  assert.deepEqual(day, { day: '2026-10-20', completed: 1, suspended: 1, cancelled: 1, cart_hours: 0, service: [], weather: null, sales_minor: null });
});

test('legend uses the location in use at each press, falls back to current placement, and orders naturally', () => {
  const report = build([
    request('a', 'completed', '2026-10-20T18:00:00.000Z', { device_label: 'Hole 12' }),
    request('b', 'completed', '2026-10-20T19:00:00.000Z', { device_label: 'Hole 7' }),
    request('c', 'rejected', '2026-10-21T18:00:00.000Z', { device_label: 'Marina 4' }),
    request('d', 'cancelled', '2026-10-21T18:30:00.000Z', { device_id: 'FRB-0005', device_label: 'Hole 7' }),
    request('e', 'completed', '2026-10-22T18:00:00.000Z', { device_id: 'FRB-0003', device_label: null, hole: 2 }),
    request('f', 'completed', '2026-10-22T19:00:00.000Z', { device_id: 'FRB-0004', device_label: null }),
    request('g', 'completed', '2026-10-22T20:00:00.000Z', { device_id: 'FRB-0009', device_label: null }),
  ], { currentLabels: { 'FRB-0004': 'Clubhouse' } });
  assert.deepEqual(report.locations.map(location => location.label),
    ['Clubhouse', 'FRB-0009', 'Hole 2', 'Hole 7', 'Hole 12', 'Marina 4']);
  assert.deepEqual(report.locations.map(location => location.color), LOCATION_COLORS.slice(0, 6));
  assert.equal(report.points.filter(point => point.label === 'Hole 7').length, 2, 'swapped units at one location share a colour');
});

test('report generation reads current placement only for unlabelled requests at this Course', async () => {
  const db = await database();
  await db.collection('devices').doc('FRB-0004').set({ course_id: 'COURSE-0001', location: { type: 'custom', name: 'Clubhouse' } });
  await db.collection('devices').doc('FRB-0008').set({ course_id: 'COURSE-0002', location: { type: 'hole', hole: 3 } });
  const requested = [];
  const rows = [request('a', 'completed', '2026-10-20T18:00:00.000Z', { device_id: 'FRB-0004', device_label: null }),
    request('b', 'completed', '2026-10-20T19:00:00.000Z', { device_id: 'FRB-0008', device_label: null }),
    request('c', 'completed', '2026-10-20T20:00:00.000Z')];
  const sources = createReportSources(db);
  const report = await generateButtonReport(db, { customer_id: 'CUST-0001', course_id: 'COURSE-0001',
    start_date: '2026-10-17', end_date: '2026-10-28' }, { asOf, source: { requests: async () => rows, serviceEvents: async () => [],
    currentLabels: async input => { requested.push(...input.deviceIds); return sources.currentLabels(input); } } });
  assert.deepEqual(requested, ['FRB-0004', 'FRB-0008']);
  assert.deepEqual(report.locations.map(location => location.label), ['Clubhouse', 'FRB-0008', 'Hole 7']);
});

test('the 9:30 AM-5:30 PM average temperature and rain come from the Course weather register and fit the page with the logo', async () => {
  const db = await database();
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001')
    .update({ course_location: { label: 'San Leandro, CA', latitude: 37.72493, longitude: -122.15608 } });
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    const params = new URL(url).searchParams;
    const time = [];
    for (let day = params.get('start_date'); day <= params.get('end_date');
      day = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) time.push(day);
    const hours = time.flatMap((day, i) => Array.from({ length: 24 }, (_, hour) => [`${day}T${String(hour).padStart(2, '0')}:00`, 58.4 + i,
      day === '2026-10-20' && hour === 14 ? 0.2 : day === '2026-10-21' && hour === 20 ? 0.3 : 0]));
    return { ok: true, json: async () => ({ hourly: { time: hours.map(([stamp]) => stamp), temperature_2m: hours.map(([, value]) => value),
      precipitation: hours.map(([, , amount]) => amount) },
      daily: { time, temperature_2m_max: time.map((_, i) => 60.4 + i),
      precipitation_sum: time.map(day => day === '2026-10-20' ? 0.2 : day === '2026-10-21' ? 0.3 : 0) } }) };
  };
  const at = new Date('2026-10-21T19:30:00Z');
  const sources = createReportSources(db, { fetchImpl });
  const input = { customer_id: 'CUST-0001', course_id: 'COURSE-0001', start_date: '2026-10-19', end_date: '2026-10-22' };
  const report = await generateButtonReport(db, input, { asOf: at, source: { requests: async () => [], serviceEvents: async () => [],
    currentLabels: async () => ({}), weather: sources.weather } });
  assert.equal(report.weather_available, true);
  assert.deepEqual(report.days.map(day => day.weather), [{ avg_f: 58.4, rain: false }, { avg_f: 59.4, rain: true },
    { avg_f: 60.4, rain: false }, null]);
  assert.equal(new URL(calls[0]).searchParams.get('end_date'), '2026-10-21', 'weather is requested only through today');
  const stored = await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001')
    .collection('weather_days').doc('2026-10-20').get();
  assert.equal(stored.data().precipitation_in, 0.2);
  const unlocated = await generateButtonReport(await database(), input, { asOf: at, source: { requests: async () => [],
    serviceEvents: async () => [], currentLabels: async () => ({}), weather: createReportSources(await database()).weather } });
  assert.equal(unlocated.weather_available, false, 'no Course location means no weather line');
  const crowded = { ...report, locations: Array.from({ length: 18 }, (_, i) => ({ label: `Hole ${i + 1}`, color: LOCATION_COLORS[i] })) };
  const pdf = await renderButtonReport(crowded);
  assert.equal(pdf.toString('latin1').match(/\/Type \/Page\b/g).length, 1);
  assert.ok(pdf.includes(Buffer.from('/Subtype /Image')), 'the Fairway Refresh logo is embedded');
  if (process.env.BUTTON_REPORT_SAMPLE_DIR) fs.writeFileSync(path.join(process.env.BUTTON_REPORT_SAMPLE_DIR, 'button-activity-weather.pdf'), pdf);
});

test('recorded total sales come from the Course Total Sales Register and render on the 8 PM line', async () => {
  const db = await database();
  const courseRef = db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001');
  await courseRef.collection('sales_days').doc('2026-10-19')
    .set({ day: '2026-10-19', total_minor: 17691, currency_code: 'USD', source: 'paper_record' });
  await courseRef.collection('inventory_shift_closures').doc('s1')
    .set({ amount_minor: 66418, currency_code: 'USD', closed_at: new Date('2026-10-20T23:49:00Z') });
  const at = new Date('2026-10-21T19:30:00Z');
  const input = { customer_id: 'CUST-0001', course_id: 'COURSE-0001', start_date: '2026-10-19', end_date: '2026-10-22' };
  const report = await generateButtonReport(db, input, { asOf: at, source: { requests: async () => [], serviceEvents: async () => [],
    currentLabels: async () => ({}), sales: createReportSources(db).sales } });
  assert.deepEqual(report.days.map(day => day.sales_minor), [17691, 66418, null, null]);
  const pdf = await renderButtonReport(report);
  assert.equal(pdf.toString('latin1').match(/\/Type \/Page\b/g).length, 1);
  assert.ok(pdf.includes(Buffer.from('Helvetica-Bold')), 'sales amounts render in bold');
  const failing = await generateButtonReport(db, input, { asOf: at, source: { requests: async () => [], serviceEvents: async () => [],
    currentLabels: async () => ({}), sales: async () => null } });
  assert.ok(failing.days.every(day => day.sales_minor === null), 'an unavailable register leaves sales blank');
});

test('in-service shading and cart hours count only time between each day\'s first and last service change', async () => {
  const at = new Date('2026-10-21T19:30:00Z');
  const range = reportBounds({ start_date: '2026-10-19', end_date: '2026-10-22' }, fixture.course.timezone, at);
  const events = [
    { type: 'resumed', recorded_at: new Date('2026-10-18T16:00:00Z') },
    { type: 'suspended', recorded_at: new Date('2026-10-19T17:15:00Z') },
    { type: 'resumed', recorded_at: new Date('2026-10-19T18:00:00Z') },
    { type: 'resumed', recorded_at: new Date('2026-10-19T19:00:00Z') },
    { type: 'suspended', recorded_at: new Date('2026-10-19T22:30:00Z') },
    { type: 'resumed', recorded_at: new Date('2026-10-20T01:00:00Z') },
    { type: 'suspended', recorded_at: new Date('2026-10-20T15:00:00Z') },
    { type: 'resumed', recorded_at: new Date('2026-10-21T16:00:00Z') },
  ];
  const report = buildButtonReport({ customer: fixture.customer, course: fixture.course, bounds: range, asOf: at,
    requests: [], serviceEvents: events });
  assert.deepEqual(report.days.map(day => day.cart_hours), [4.5, 0, 3.5, null],
    'carry-over before the first change and overnight time after the last change are not counted');
  assert.deepEqual(report.days[0].service, [{ start_hour: 11, end_hour: 15.5 }]);
  assert.deepEqual(report.days[1].service, []);
  assert.deepEqual(report.days[2].service, [{ start_hour: 9, end_hour: 12.5 }], 'in-progress day counts through the report time');
  assert.equal(report.totals.cart_hours, 8);
  const later = new Date('2026-10-23T19:00:00Z');
  const ended = buildButtonReport({ customer: fixture.customer, course: fixture.course, asOf: later, requests: [],
    bounds: reportBounds({ start_date: '2026-10-19', end_date: '2026-10-21' }, fixture.course.timezone, later), serviceEvents: events });
  assert.deepEqual(ended.days.map(day => day.cart_hours), [4.5, 0, 0], 'service left on after a past day\'s last change is excluded');

  const db = await database();
  const stream = db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001').collection('service_events');
  for (const [id, event] of events.entries()) await stream.doc(`e${id}`).set(event);
  await stream.doc('late').set({ type: 'suspended', recorded_at: new Date('2026-10-23T00:00:00Z') });
  const read = await createReportSources(db).serviceEvents({ ...range, customerId: 'CUST-0001', courseId: 'COURSE-0001' });
  assert.deepEqual(read.map(event => event.recorded_at.toISOString()), events.map(event => event.recorded_at.toISOString()));
  const register = db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001').collection('service_days');
  await register.doc('2026-10-19').set({ day: '2026-10-19', start_local: '09:38', source: 'reviewed_correction' });
  await register.doc('2026-10-20').set({ day: '2026-10-20', start_local: '08:00', source: 'draft' });
  const corrections = await createReportSources(db).serviceCorrections({ customerId: 'CUST-0001', courseId: 'COURSE-0001', days: range.days });
  assert.deepEqual([...corrections.keys()], ['2026-10-19'], 'only reviewed corrections are applied');
  await assert.rejects(createReportSources({ collection() { return this; }, doc() { return this; }, where() { return this; },
    orderBy() { return this; }, limit() { return this; }, get: async () => { throw Object.assign(new Error('denied'), { code: 7 }); } })
    .serviceEvents({ ...range, customerId: 'CUST-0001', courseId: 'COURSE-0001' }), error => error.status === 503);
});

test('service already on at midnight, legacy midnight expiry or left on overnight is anchored to operator activity', () => {
  // Production Tony Lema sequences (PDT = UTC-7) for 10/17, 10/22 and 10/25.
  const events = [
    { type: 'resumed', recorded_at: new Date('2026-10-15T05:32:37Z') },
    { type: 'suspended', recorded_at: new Date('2026-10-17T23:32:16Z') },
    { type: 'resumed', recorded_at: new Date('2026-10-21T21:59:32Z') },
    { type: 'suspended', recorded_at: new Date('2026-10-21T23:41:23Z') },
    { type: 'suspended', recorded_at: new Date('2026-10-22T22:50:25Z') },
    { type: 'resumed', recorded_at: new Date('2026-10-25T16:55:54Z') },
    { type: 'suspended', recorded_at: new Date('2026-10-25T16:58:13Z') },
    { type: 'resumed', recorded_at: new Date('2026-10-25T19:43:05Z') },
    { type: 'suspended', recorded_at: new Date('2026-10-26T16:51:54Z') },
  ];
  const requests = [
    request('early', 'completed', '2026-10-17T16:39:00Z', { completed_at: '2026-10-17T17:50:00Z' }),
    request('last', 'completed', '2026-10-17T23:20:00Z', { completed_at: '2026-10-17T23:24:00Z' }),
    request('first22', 'completed', '2026-10-22T18:14:00Z', { completed_at: '2026-10-22T18:27:00Z' }),
    request('cancel22', 'cancelled', '2026-10-22T20:43:00Z', { cancelled_at: '2026-10-22T21:09:00Z' }),
    request('open25', 'completed', '2026-10-25T21:26:00Z', { completed_at: '2026-10-26T00:09:00Z' }),
    request('excluded25', 'completed', '2026-10-25T22:00:00Z', { completed_at: '2026-10-26T02:00:00Z',
      reporting_state: 'excluded' }),
    request('rejected', 'rejected', '2026-10-20T14:00:00Z'),
  ];
  const at = new Date('2026-10-28T19:00:00Z');
  const range = reportBounds({ start_date: '2026-10-17', end_date: '2026-10-26' }, fixture.course.timezone, at);
  const report = buildButtonReport({ customer: fixture.customer, course: fixture.course, bounds: range, asOf: at,
    requests, serviceEvents: events });
  const byDay = Object.fromEntries(report.days.map(day => [day.day, day]));
  assert.equal(byDay['2026-10-17'].cart_hours, 5.7, 'on since before the day: first operator action to Suspend');
  assert.deepEqual(byDay['2026-10-17'].service, [{ start_hour: 10 + 50 / 60, end_hour: 16 + 32 / 60 + 16 / 3600 }]);
  assert.equal(byDay['2026-10-20'].cart_hours, 0, 'a rejected press is not operator activity');
  assert.equal(byDay['2026-10-21'].cart_hours, 1.7);
  assert.equal(byDay['2026-10-22'].cart_hours, 4.4, 'a repeated Suspend implies the legacy midnight resume');
  assert.equal(byDay['2026-10-22'].service[0].start_hour, 11 + 27 / 60);
  assert.equal(byDay['2026-10-25'].cart_hours, 4.5, 'left on overnight: Resume to last operator action');
  assert.deepEqual(byDay['2026-10-25'].service.map(period => Number(period.end_hour.toFixed(3))), [9.97, 17.15],
    'an Admin-excluded request does not extend service');
  assert.equal(byDay['2026-10-26'].cart_hours, 0, 'carried in without operator activity before the Suspend');

  const corrected = buildButtonReport({ customer: fixture.customer, course: fixture.course, bounds: range, asOf: at,
    requests, serviceEvents: events, serviceCorrections: new Map([
      ['2026-10-17', { source: 'reviewed_correction', start_local: '09:38' }],
      ['2026-10-26', { source: 'reviewed_correction', start_local: 'bad' }]]) });
  const fixed = Object.fromEntries(corrected.days.map(day => [day.day, day]));
  assert.deepEqual(fixed['2026-10-17'].service, [{ start_hour: 9 + 38 / 60, end_hour: 16 + 32 / 60 + 16 / 3600 }],
    'a reviewed start correction replaces the computed opening time');
  assert.equal(fixed['2026-10-17'].cart_hours, 6.9);
  assert.equal(fixed['2026-10-26'].cart_hours, 0, 'an invalid correction time is ignored');
  assert.deepEqual(corrected.days.filter(day => day.day !== '2026-10-17').map(day => day.cart_hours),
    report.days.filter(day => day.day !== '2026-10-17').map(day => day.cart_hours), 'other days are unchanged');
});

test('exclusive end midnight, as-of boundaries and missing timestamps are explicit', () => {
  const at = new Date('2026-10-29T12:00:00Z');
  const range = reportBounds({ start_date: '2026-10-28', end_date: '2026-10-28' }, 'UTC', at);
  const one = request('one', 'completed', '2026-10-28T12:00:00Z');
  const report = buildButtonReport({ customer: fixture.customer, course: { ...fixture.course, timezone: 'UTC' },
    bounds: range, asOf: at, requests: [one, request('midnight', 'completed', '2026-10-29T00:00:00Z'),
      { ...one, id: 'later', completed_at: '2026-10-30T12:00:00Z' },
      request('cancel-later', 'cancelled', '2026-10-28T13:00:00Z', { cancelled_at: '2026-10-30T12:00:00Z' })] });
  assert.deepEqual(report.points.map(point => point.id), ['one']);
  assert.throws(() => build([{ ...request('x', 'completed', '2026-10-20T18:00:00Z'), completed_at: null }]), /missing.*timestamp/);
  assert.throws(() => build([{ ...request('x', 'completed', '2026-10-20T18:00:00Z'), device_id: null }]), /stable identity/);
});

test('future dates in the selected range have no counts rather than zero', () => {
  const at = new Date('2026-10-20T19:00:00Z');
  const range = reportBounds({ start_date: '2026-10-19', end_date: '2026-10-22' }, fixture.course.timezone, at);
  const report = buildButtonReport({ customer: fixture.customer, course: fixture.course, bounds: range, asOf: at,
    requests: [request('a', 'completed', '2026-10-20T18:00:00Z')] });
  assert.deepEqual(report.days.map(day => day.completed), [0, 1, null, null]);
  assert.equal(report.end_exclusive, false);
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
  assert.ok(calls.some(([method, ...fields]) => method === 'select' && fields.includes('reporting_state') &&
    fields.includes('rejection_reason') && fields.includes('cancelled_at') && fields.includes('device_label')));
  assert.ok(calls.some(([method, field, operator]) => method === 'where' && field === 'received_at' && operator === '<'));
  assert.equal(calls.find(([method]) => method === 'startAfter')[1], documents[499]);
  assert.equal(result.readTime, fixture.asOf);
  await assert.rejects(createReportSources({ runTransaction: async () => { throw new Error('isolated index failure'); } })
    .requests({ asOf }), /Firestore report read failed/);
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
  const source = { requests: () => { throw new Error('must not query'); } };
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
      requests: async () => [], currentLabels: async () => ({}), serviceEvents: async () => [],
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
  assert.equal(result.headers['Content-Disposition'], 'attachment; filename="cart-request-performance-2026-10-17-2026-10-28.pdf"');
  assert.ok(result.body.includes(Buffer.from('(Cart Request Performance Report)')), 'the PDF Title metadata names the report');
  assert.equal(result.body.subarray(0, 4).toString(), '%PDF');
});

test('renderer shows only the start and end dates, the 6 AM-9 PM axis and no disclaimer notes', async () => {
  const report = build([
    request('a', 'completed', '2026-10-20T14:00:00.000Z'),
    request('b', 'rejected', '2026-10-21T03:30:00.000Z', { device_label: 'Marina 4' }),
    request('c', 'cancelled', '2026-10-22T20:00:00.000Z', { device_label: 'Hole 12' }),
  ]);
  assert.equal(windowText(report), 'Sat, Oct 17 \u2013 Wed, Oct 28, 2026');
  const partial = buildButtonReport({ customer: fixture.customer, course: fixture.course, asOf: new Date('2026-11-02T20:33:00Z'),
    bounds: reportBounds({ start_date: '2026-11-01', end_date: '2026-11-02' }, fixture.course.timezone, new Date('2026-11-02T20:33:00Z')),
    requests: [] });
  assert.equal(windowText(partial), 'Sun, Nov 1 \u2013 Mon, Nov 2, 2026');
  const pdf = await renderButtonReport(report);
  assert.ok(pdf.includes(Buffer.from('/MediaBox [0 0 792 612]')));
  assert.equal(pdf.toString('latin1').match(/\/Type \/Page\b/g).length, 1);
  if (process.env.BUTTON_REPORT_SAMPLE_DIR) {
    const root = process.env.BUTTON_REPORT_SAMPLE_DIR;
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'button-activity-layout.pdf'), pdf);
  }
  const at = new Date('2026-11-01T08:00:00Z');
  const long = buildButtonReport({ customer: fixture.customer, course: fixture.course, asOf: at,
    bounds: reportBounds({ start_date: '2026-10-01', end_date: '2026-10-31' }, fixture.course.timezone, at), requests: fixture.requests });
  assert.equal((await renderButtonReport(long)).toString('latin1').match(/\/Type \/Page\b/g).length, 1, 'a 31-day range fits one page');
  const busiest = { ...long, weather_available: true,
    locations: Array.from({ length: 18 }, (_, i) => ({ label: `Hole ${i + 1}`, color: LOCATION_COLORS[i] })),
    days: long.days.map(day => ({ ...day, cart_hours: 12.3, weather: { avg_f: 101.4, rain: true }, sales_minor: 1234567,
      completed: 199, suspended: 99, cancelled: 99 })) };
  const busiestPdf = await renderButtonReport(busiest);
  assert.equal(busiestPdf.toString('latin1').match(/\/Type \/Page\b/g).length, 1, '31 days, 18 locations, weather and sales fit one page');
  if (process.env.BUTTON_REPORT_SAMPLE_DIR) fs.writeFileSync(path.join(process.env.BUTTON_REPORT_SAMPLE_DIR, 'button-activity-31-day-busiest.pdf'), busiestPdf);
  const eighteen = { ...report, locations: Array.from({ length: 18 }, (_, i) => ({ label: `Hole ${i + 1}`, color: LOCATION_COLORS[i] })) };
  const eighteenPdf = await renderButtonReport(eighteen);
  assert.equal(eighteenPdf.toString('latin1').match(/\/Type \/Page\b/g).length, 1);
  if (process.env.BUTTON_REPORT_SAMPLE_DIR) fs.writeFileSync(path.join(process.env.BUTTON_REPORT_SAMPLE_DIR, 'button-activity-18-location-layout.pdf'), eighteenPdf);
  assert.throws(() => renderButtonReport({ ...report, locations: Array(19).fill(report.locations[0]) }), /18 locations/);
  assert.throws(() => renderButtonReport({ ...report, course: { ...report.course, course_name: '\u65e5\u672c' } }), /unsupported.*PDF font/);
  await assert.rejects(renderButtonReport({ ...report, course: { ...report.course, course_name: 'Very long name '.repeat(60) } }), /heading limit/);
});
