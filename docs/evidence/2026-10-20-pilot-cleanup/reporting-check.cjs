'use strict';

// Historical one-time review artifact: validation already executed; do not run production reads.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const product = createRequire(path.resolve(__dirname, '../../../fairway_backend/cloudrun_receiver/package.json'));
const { OAuth2Client } = product('google-auth-library');
const project = 'savvy-kit-496703-r5';
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const allowed = new Set(['customers', 'courses', 'user_access', 'requests', 'service_events']);
const requestFields = [
  'customer_id', 'course_id', 'course_name', 'device_id', 'device_label', 'hole',
  'status', 'received_at', 'completed_at', 'cancelled_at', 'confirmed_at',
];

function decode(v) {
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)]));
  throw new Error('Unsupported field type in read-only reporting check');
}
function encode(v) {
  if (typeof v === 'string') return { stringValue: v };
  throw new Error('Unsupported reporting query input');
}
async function main() {
  const auth = new OAuth2Client();
  auth.setCredentials({
    access_token: execFileSync('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim(),
    expiry_date: Date.now() + 1800000,
  });
  const readTime = new Date(Date.now() - 2000).toISOString();
  const call = async (suffix, data, method = 'POST') =>
    (await auth.request({ url: base + suffix, data, method, timeout: 60000 })).data;
  const snapshot = (document) => ({
    id: document.name.split('/').pop(), exists: true,
    ref: doc(document.name.split('/documents/')[1]),
    data: () => Object.fromEntries(Object.entries(document.fields || {}).map(([k, v]) => [k, decode(v)])),
  });
  function collection(p, filters = [], orders = [], limit) {
    const parts = p.split('/');
    const col = parts.pop();
    assert(allowed.has(col), 'Read outside reporting allowlist');
    return {
      doc: (id) => doc(`${p}/${id}`),
      where: (field, op, value) => {
        assert.equal(op, '==');
        return collection(p, [...filters, { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encode(value) } }], orders, limit);
      },
      orderBy: (field, direction) => collection(p, filters, [...orders, { field: { fieldPath: field }, direction: direction === 'desc' ? 'DESCENDING' : 'ASCENDING' }], limit),
      limit: (n) => collection(p, filters, orders, n),
      get: async () => {
        const parent = parts.length ? '/' + parts.join('/') : '';
        const query = {
          from: [{ collectionId: col }],
          ...(filters.length ? { where: filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } } } : {}),
          ...(orders.length ? { orderBy: orders } : {}),
          ...(limit ? { limit } : {}),
          ...(col === 'requests' ? { select: { fields: requestFields.map((fieldPath) => ({ fieldPath })) } } : {}),
        };
        const rows = await call(`${parent}:runQuery`, { readTime, structuredQuery: query });
        const docs = rows.filter((r) => r.document).map((r) => snapshot(r.document));
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
  }
  function doc(p) {
    assert(allowed.has(p.split('/').at(-2)), 'Read outside reporting allowlist');
    return {
      id: p.split('/').pop(),
      collection: (id) => collection(`${p}/${id}`),
      get: async () => snapshot(await call(`/${p}?readTime=${encodeURIComponent(readTime)}`, undefined, 'GET')),
    };
  }
  const access = await collection('user_access').get();
  const admin = access.docs.find((d) => d.data().schema_version === 2 && d.data().admin === true);
  assert(admin, 'No existing authorized admin record for isolated reporting check');
  process.env.FAIRWAY_ENV = 'production';
  process.env.FAIRWAY_SERVICE_MODE = 'receiver';
  process.env.FAIRWAY_GCP_PROJECT = project;
  process.env.GOOGLE_CLOUD_PROJECT = project;
  delete process.env.FAIRWAY_ALLOWED_ORIGIN;
  const { createFairwayHandlers } = product('./index.js');
  const handlers = createFairwayHandlers({ collection }, {
    verifyOperatorToken: async () => ({ uid: admin.id }),
    now: () => new Date(readTime),
  });
  let code;
  let response;
  const res = {
    set() { return this; },
    status(n) { code = n; return this; },
    json(body) { response = body; return this; },
    send() { throw new Error(`Reporting read failed: HTTP ${code}`); },
  };
  await handlers.fairwayButtonReceiver({
    method: 'GET', path: '/api/v1/operator/dashboard',
    query: { customer_id: 'CUST-0001', course_id: 'COURSE-0001' },
    get: () => 'Bearer local-read-only-validation',
  }, res);
  assert.equal(code, 200);
  assert.equal(response.courses.length, 1);
  assert.equal(response.history.length, 46);
  assert(response.history.some((r) => r.request_id === 'bUgIybnJz0Xv7YMdz2Pm'));
  assert(response.history.every((r) => r.received_at >= new Date('2026-10-17T16:39:35.270Z')));
  for (const period of ['daily', 'weekly', 'monthly']) assert(response.summaries[period]);
  console.log(JSON.stringify({
    snapshot: readTime, handlerStatus: code, historyRecords: response.history.length,
    cutoffInHistory: true, periods: Object.keys(response.summaries),
    validationBoundary: 'Accepted handler with real read-only production REST data; token verification locally stubbed, real access/course authorization exercised. Not authenticated browser acceptance.',
  }, null, 2));
}
main().catch((error) => {
  console.error('REPORTING CHECK FAILED:', error.response?.status || error.code || error.message);
  process.exitCode = 1;
});
