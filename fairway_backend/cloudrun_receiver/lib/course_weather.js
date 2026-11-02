'use strict';

// Course location and daily weather register. Weather comes from Open-Meteo
// (open data, no API key): geocoding resolves "City, ST" to coordinates when
// an Admin saves a Course location, and the daily register
// customers/{c}/courses/{k}/weather_days/{YYYY-MM-DD} caches each Course-local
// day's high temperature and precipitation for the Button Activity report.

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const WEATHER_SUBCOLLECTION = 'weather_days';
// The forecast endpoint serves roughly the last three months; older days use the archive.
const FORECAST_PAST_DAYS = 85;
const RAIN_THRESHOLD_IN = 0.01;
const FETCH_TIMEOUT_MS = 8000;

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

class CourseLocationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'CourseLocationError';
    this.status = status;
    this.code = status === 400 ? 'invalid_course_location' : 'course_location_lookup_failed';
  }
}

async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
  return response.json();
}

function parseLocationLabel(label) {
  const match = /^\s*([^,]+?)\s*,\s*([^,]+?)\s*$/.exec(String(label || ''));
  if (!match) throw new CourseLocationError('Course location must be "City, ST" (for example "San Leandro, CA").');
  const stateText = match[2].replace(/\./g, '');
  const code = Object.keys(US_STATES).find(key => key === stateText.toUpperCase() ||
    US_STATES[key].toLowerCase() === stateText.toLowerCase());
  if (!code) throw new CourseLocationError(`Unknown US state "${match[2]}". Use "City, ST" (for example "San Leandro, CA").`);
  return { city: match[1], stateCode: code, stateName: US_STATES[code] };
}

async function geocodeCourseLocation(label, { fetchImpl = fetch } = {}) {
  const { city, stateCode, stateName } = parseLocationLabel(label);
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(city)}&count=20&countryCode=US&language=en&format=json`;
  let body;
  try {
    body = await getJson(fetchImpl, url);
  } catch (error) {
    console.error('Course location lookup failed:', { message: error.message });
    throw new CourseLocationError('Location lookup is unavailable. Retry.', 503);
  }
  const match = (body.results || []).find(result => result.admin1 === stateName &&
    String(result.name).toLowerCase() === city.toLowerCase()) ||
    (body.results || []).find(result => result.admin1 === stateName);
  if (!match) throw new CourseLocationError(`"${city}, ${stateCode}" was not found. Check the city and state.`);
  return {
    label: `${match.name}, ${stateCode}`,
    latitude: Number(match.latitude.toFixed(5)),
    longitude: Number(match.longitude.toFixed(5)),
    resolved_name: `${match.name}, ${stateName}, United States`,
    source: 'open-meteo-geocoding',
  };
}

function shiftDay(day, delta) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

function weatherUrl(base, location, timezone, start, end) {
  return `${base}?latitude=${location.latitude}&longitude=${location.longitude}` +
    '&daily=temperature_2m_max,precipitation_sum&temperature_unit=fahrenheit&precipitation_unit=inch' +
    `&timezone=${encodeURIComponent(timezone)}&start_date=${start}&end_date=${end}`;
}

async function fetchDailyWeather({ location, timezone, days, today, fetchImpl = fetch }) {
  const forecastFrom = shiftDay(today, -FORECAST_PAST_DAYS);
  const groups = [[ARCHIVE_URL, days.filter(day => day < forecastFrom)], [FORECAST_URL, days.filter(day => day >= forecastFrom)]];
  const rows = new Map();
  for (const [base, group] of groups) {
    if (!group.length) continue;
    const body = await getJson(fetchImpl, weatherUrl(base, location, timezone, group[0], group[group.length - 1]));
    const daily = body.daily || {};
    (daily.time || []).forEach((day, index) => {
      const high = daily.temperature_2m_max?.[index];
      const precipitation = daily.precipitation_sum?.[index];
      if (group.includes(day) && Number.isFinite(high) && Number.isFinite(precipitation)) {
        rows.set(day, { high_f: Number(high.toFixed(1)), precipitation_in: Number(precipitation.toFixed(3)) });
      }
    });
  }
  return rows;
}

function sameLocation(row, location) {
  return row && row.latitude === location.latitude && row.longitude === location.longitude;
}

// Returns Map(day -> { high_f, precipitation_in, rain }) for the requested
// Course-local days through today, or null when the Course has no location.
// Missing, provisional or relocated days are refreshed from Open-Meteo and
// written to the register; lookup failures leave those days blank.
async function readCourseWeather(db, { customerId, courseId, course, days, today, fetchImpl = fetch, now = new Date() }) {
  const location = course.course_location;
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  const wanted = days.filter(day => day <= today);
  const register = db.collection('customers').doc(customerId).collection('courses').doc(courseId)
    .collection(WEATHER_SUBCOLLECTION);
  const stored = new Map();
  if (wanted.length) {
    const docs = await Promise.all(wanted.map(day => register.doc(day).get()));
    docs.forEach((doc, index) => { if (doc.exists) stored.set(wanted[index], doc.data()); });
  }
  const stale = wanted.filter(day => !stored.get(day)?.final || !sameLocation(stored.get(day), location));
  if (stale.length) {
    try {
      const fetched = await fetchDailyWeather({ location, timezone: course.timezone, days: stale, today, fetchImpl });
      const batch = db.batch();
      for (const [day, values] of fetched) {
        const row = { day, ...values, latitude: location.latitude, longitude: location.longitude,
          source: 'open-meteo', final: day < shiftDay(today, -1), fetched_at: now };
        stored.set(day, row);
        batch.set(register.doc(day), row);
      }
      if (fetched.size) await batch.commit();
    } catch (error) {
      console.error('Course weather refresh failed:', { courseId, message: error.message });
    }
  }
  return new Map(wanted.filter(day => sameLocation(stored.get(day), location)).map(day => {
    const row = stored.get(day);
    return [day, { high_f: row.high_f, precipitation_in: row.precipitation_in, rain: row.precipitation_in >= RAIN_THRESHOLD_IN }];
  }));
}

module.exports = {
  CourseLocationError, RAIN_THRESHOLD_IN, WEATHER_SUBCOLLECTION, US_STATES,
  parseLocationLabel, geocodeCourseLocation, fetchDailyWeather, readCourseWeather, shiftDay,
};
