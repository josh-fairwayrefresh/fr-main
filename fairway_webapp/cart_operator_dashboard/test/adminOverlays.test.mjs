import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const adminAppSource = await readFile(
  new URL('../src/admin/AdminApp.jsx', import.meta.url),
  'utf8'
);

test('Admin detail overlays retain their close icon dependency', () => {
  assert.match(adminAppSource, /Wrench, X,/);
  assert.equal([...adminAppSource.matchAll(/<X\b/g)].length, 2);
});

test('Admin removes retired Health displays, requests, and Course payload fields', async () => {
  assert.doesNotMatch(adminAppSource, /health|HealthSection|historyStatus|setHistory|function metric\b/i);
  assert.doesNotMatch(adminAppSource, /BatteryMedium|Gauge|Radio|Signal|Thermometer|Activity|WP6 Alerts/);
  const fleetHeaders = [...adminAppSource.matchAll(/<th>([^<]+)<\/th>/g)].map((match) => match[1]);
  assert.deepEqual(fleetHeaders, ['Device', 'Assignment', 'Location', 'State']);
  const adminCss = await readFile(new URL('../src/admin/admin.css', import.meta.url), 'utf8');
  assert.doesNotMatch(adminCss, /a-health|a-history|a-planned|a-alert-placeholder|a-bar\b|a-panel h4/);
  const adminApi = await readFile(new URL('../src/admin/adminApi.js', import.meta.url), 'utf8');
  assert.doesNotMatch(adminApi, /health|health-history/i);
});

test('Admin preserves exact recorded identity provenance without interpreting its source', () => {
  assert.match(adminAppSource, /Recorded provenance: \$\{device\.system_identity\.source\}/);
  assert.match(adminAppSource, /formatDate\(device\.system_identity\.observed_at\)/);
  assert.match(adminAppSource, /Authoritative source unavailable/);
  assert.doesNotMatch(adminAppSource, /system_identity\?\.source ===/);
});

test('Admin retains registry, lifecycle, provisioning, export, and service-hours controls', () => {
  for (const retained of [
    'Registry record', 'Hardware revision', 'Firmware generation', 'Identity source',
    'Save assignment', 'Save metadata', "record('service')", "record('commission')",
    '/credential-recovery', 'one_time_credential', '/api/v1/admin/export/device-sim',
    '/api/v1/admin/fleet', '/api/v1/admin/customers', 'Course name', 'Customer name',
    'Beverage service schedule',
    'service_schedule: { days: form.service_days, start: form.service_start, end: form.service_end }',
  ]) {
    assert.ok(adminAppSource.includes(retained), `Missing retained Admin workflow: ${retained}`);
  }
});

test('Firestore indexes retain the operator query index without the retired suppression index', async () => {
  const indexes = JSON.parse(await readFile(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  assert.ok(indexes.indexes.some((index) => index.collectionGroup === 'requests' &&
    index.fields.some((field) => field.fieldPath === 'course_id' && field.order === 'ASCENDING') &&
    index.fields.some((field) => field.fieldPath === 'received_at' && field.order === 'DESCENDING')));
  assert.ok(indexes.indexes.every((index) =>
    index.fields.every((field) => field.fieldPath !== 'demand_window_expires_at')));
});
