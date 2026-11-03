'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const { parseLocationLabel, readCourseWeather, shiftDay, windowAverage } = require('../lib/course_weather');

const location = { label: 'San Leandro, CA', latitude: 37.72493, longitude: -122.15608 };
const course = { timezone: 'America/Los_Angeles', course_location: location };
const days = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'];

function weatherFetch(calls, values = {}) {
  return async (url) => {
    calls.push(url);
    const params = new URL(url).searchParams;
    const time = [];
    for (let day = params.get('start_date'); day <= params.get('end_date'); day = shiftDay(day, 1)) time.push(day);
    const hours = time.flatMap(day => Array.from({ length: 24 }, (_, hour) => [day, `${day}T${String(hour).padStart(2, '0')}:00`]));
    return { ok: true, json: async () => ({
      hourly: { time: hours.map(([, stamp]) => stamp), temperature_2m: hours.map(([day]) => values[day]?.[2] ?? 62.04) },
      daily: { time,
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
  const fetchImpl = weatherFetch(calls, { '2026-11-01': [65, 0.169, 61.5], '2026-10-31': [64.1, 0.004] });
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
  assert.equal(url.searchParams.get('hourly'), 'temperature_2m');
  assert.deepEqual([...first.keys()], days.slice(0, 4));
  assert.deepEqual(first.get('2026-11-01'), { avg_f: 61.5, high_f: 65, precipitation_in: 0.169, rain: true });
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

test('the average temperature is time-weighted over 9:30 AM-5:30 PM Course-local time', () => {
  const day = '2026-10-17';
  const readings = { 9: 70, 10: 74, 11: 78, 12: 82, 13: 84, 14: 86, 15: 88, 16: 86, 17: 80, 18: 72 };
  const hourly = { time: Object.keys(readings).map(hour => `${day}T${hour.padStart(2, '0')}:00`), temperature_2m: Object.values(readings) };
  // Ends interpolate to 72 (9:30) and 76 (17:30); trapezoids over the eight hours.
  const expected = (0.5 * (72 + 74) / 2 + (74 + 78) / 2 + (78 + 82) / 2 + (82 + 84) / 2 + (84 + 86) / 2 + (86 + 88) / 2 +
    (88 + 86) / 2 + (86 + 80) / 2 + 0.5 * (80 + 76) / 2) / 8;
  assert.equal(windowAverage(hourly, day), Number(expected.toFixed(1)));
  assert.equal(windowAverage({ time: hourly.time.slice(1), temperature_2m: hourly.temperature_2m.slice(1) }, day), null,
    'a missing hour leaves the day blank');
});

test('final register rows written before the average was added are refetched once', async () => {
  const db = new FakeFirestore();
  await register(db).doc('2026-10-30').set({ day: '2026-10-30', high_f: 70, precipitation_in: 0, final: true,
    latitude: location.latitude, longitude: location.longitude, source: 'open-meteo' });
  const calls = [];
  const input = { customerId: 'CUST-0001', courseId: 'COURSE-0001', course, days: ['2026-10-30'], today: '2026-11-02',
    now: new Date('2026-11-02T21:00:00Z'), fetchImpl: weatherFetch(calls, { '2026-10-30': [70, 0, 66] }) };
  assert.deepEqual((await readCourseWeather(db, input)).get('2026-10-30'), { avg_f: 66, high_f: 70, precipitation_in: 0, rain: false });
  assert.equal(calls.length, 1);
  await readCourseWeather(db, input);
  assert.equal(calls.length, 1, 'the refreshed row is final and reused');
  const failed = await readCourseWeather(new FakeFirestore(), { ...input, fetchImpl: async () => { throw new Error('down'); } });
  assert.equal(failed.size, 0);
});
