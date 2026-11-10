import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { modeForPath, resolveEntry, APP_MODE } from '../src/lib/appEntry.mjs';
import { courseOperation } from '../src/lib/courseOperation.mjs';
import { selectedCourseFromLocation } from '../src/lib/courseContext.mjs';

test('explicit Course capabilities preserve legacy Cart and exclude Range inventory/metrics', () => {
  assert.equal(courseOperation({}).inventory, true);
  assert.deepEqual(courseOperation({ operation_kind: 'driving_range' }), {
    kind: 'driving_range', inventory: false, cart_metrics: false, physical_devices: false,
  });
  assert.throws(() => courseOperation({ operation_kind: 'unknown' }), /Invalid/);
});

test('public bay routes require no login; notification links select the exact entitled Course', () => {
  assert.equal(modeForPath('/range/example'), APP_MODE.PUBLIC_BAY);
  assert.equal(resolveEntry({ mode: APP_MODE.PUBLIC_BAY, authenticated: false }), 'public_bay');
  const cart = { customer_id: 'c', course_id: 'cart' };
  const range = { customer_id: 'c', course_id: 'range' };
  assert.equal(selectedCourseFromLocation([cart, range], '?customer_id=c&course_id=range'), range);
  assert.equal(selectedCourseFromLocation([cart, range], '?course=range'), range);
});

test('active queue retrieval is status-scoped before retrieval and has no arbitrary cap', async () => {
  const source = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const listener = source.slice(source.indexOf('const unsubscribers = courses.map'), source.indexOf('async function handleGoogleSignIn'));
  assert.match(listener, /where\('status', 'in', \['new', 'confirmed', 'rejected'\]\)/);
  assert.match(source, /!request\.rejected_cleared_at/);
  assert.doesNotMatch(listener, /limit\(/);
  assert.doesNotMatch(source, /\.slice\(0, 100\)/);
});
