'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const { parseLocationLabel, readCourseWeather, shiftDay } = require('../lib/course_weather');

const location = { label: 'San Leandro, CA', latitude: 37.72493, longitude: -122.15608 };
const course = { timezone: 'America/Los_Angeles', course_location: location };
const days = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'];

function weatherFetch(calls, values = {}) {
  return async (url) => {
    calls.push(url);
    const params = new URL(url).searchParams;
    const time = [];
    for (let day = params.get('start_date'); day <= params.get('end_date'); day = shiftDay(day, 1)) time.push(day);
    return { ok: true, json: async () => ({ daily: { time,
      temperature_2m_max: time.map(day => values[day]?.[0] ?? 66.24),
      precipitation_sum: time.map(day => values[day]?.[1] ?? 0) } }) };
  };
}

function register(db) {
  return db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001').collection('weather_days');
}

test('Course locations must be "City, ST" with a known US state', () => {
  assert.deepEqual(parseLocationLabel('San Leandro, CA'), { city: 'San Leandro', stateCode: 'CA', stateName: 'California' });
  assert.equal(parseLocationLabel(' Dana Point ,  california ').stateCode, 'CA');
  assert.throws(() => parseLocationLabel('San Leandro'), /City, ST/);
  assert.throws(() => parseLocationLabel('San Leandro, Narnia'), /Unknown US state/);
});

test('daily weather is fetched once, stored in the Course register, and reused when final', async () => {
  const db = new FakeFirestore();
  const calls = [];
  const fetchImpl = weatherFetch(calls, { '2026-11-01': [65, 0.169], '2026-10-31': [64.1, 0.004] });
  const input = { customerId: 'CUST-0001', courseId: 'COURSE-0001', course, days, today: '2026-11-02', fetchImpl,
    now: new Date('2026-11-02T21:00:00Z') };
  const first = await readCourseWeather(db, input);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]);
  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(url.searchParams.get('start_date'), '2026-10-30');
  assert.equal(url.searchParams.get('end_date'), '2026-11-02', 'future days are not requested');
  assert.equal(url.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.equal(url.searchParams.get('timezone'), 'America/Los_Angeles');
  assert.deepEqual([...first.keys()], days.slice(0, 4));
  assert.deepEqual(first.get('2026-11-01'), { high_f: 65, precipitation_in: 0.169, rain: true });
  assert.equal(first.get('2026-10-31').rain, false, 'a trace below 0.01 in is not rain');
  const stored = (await register(db).doc('2026-10-31').get()).data();
  assert.equal(stored.final, true);
  assert.equal(stored.source, 'open-meteo');
  assert.equal((await register(db).doc('2026-11-01').get()).data().final, false, 'yesterday stays provisional');

  calls.length = 0;
  await readCourseWeather(db, input);
  const refreshed = new URL(calls[0]).searchParams;
  assert.deepEqual([refreshed.get('start_date'), refreshed.get('end_date')], ['2026-11-01', '2026-11-02'],
    'only provisional days are refreshed');
});

test('a moved Course location refetches; old days use the archive; no location or failed lookups leave days blank', async () => {
  const db = new FakeFirestore();
  const calls = [];
  const base = { customerId: 'CUST-0001', courseId: 'COURSE-0001', days: ['2026-07-01', '2026-11-01'], today: '2026-11-02',
    now: new Date('2026-11-02T21:00:00Z') };
  await readCourseWeather(db, { ...base, course, fetchImpl: weatherFetch(calls) });
  assert.deepEqual(calls.map(call => new URL(call).hostname), ['archive-api.open-meteo.com', 'api.open-meteo.com']);
  calls.length = 0;
  const moved = { ...course, course_location: { label: 'Oakland, CA', latitude: 37.80437, longitude: -122.2708 } };
  const relocated = await readCourseWeather(db, { ...base, days: ['2026-07-01'], course: moved, fetchImpl: weatherFetch(calls) });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /latitude=37.80437/);
  assert.equal(relocated.size, 1);

  assert.equal(await readCourseWeather(db, { ...base, course: { timezone: 'America/Los_Angeles' }, fetchImpl: weatherFetch(calls) }), null);
  const failed = await readCourseWeather(new FakeFirestore(), { ...base, course, fetchImpl: async () => { throw new Error('down'); } });
  assert.equal(failed.size, 0);
});
