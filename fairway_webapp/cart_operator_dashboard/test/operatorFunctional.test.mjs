import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Map as MapIcon } from 'lucide-react';
import { createCourseRequestState } from '../src/lib/courseRequestState.mjs';

const source = await readFile(new URL('../src/OperatorApp.jsx', import.meta.url), 'utf8');
const entrySource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
const operatorStyles = await readFile(new URL('../src/operator.css', import.meta.url), 'utf8');

test('functional Option C operator surface keeps the approved workflow contract', () => {
  assert.match(source, /OLDEST ACTIVE REQUEST/);
  assert.match(source, /Complete service/);
  assert.match(source, /Cancel request/);
  assert.match(source, /operator\/service\/\$\{operation\.action\}/);
  assert.match(source, /operator\/dashboard/);
  assert.match(source, /op-queue-summary/);
  assert.doesNotMatch(source, /NEXT REQUEST/);
  assert.doesNotMatch(source, /op-intro/);
  assert.doesNotMatch(source, />CONFIRM</);
  assert.match(source, /api\/v1\/operator\/service-state/);
  assert.match(source, /service_state: serviceSnapshotMatches \? serviceSnapshot\.service_state : null/);
  assert.match(source, /Promise\.all\(\[refreshDashboard\(\), refreshServiceState\(\)\]\)/);
});

test('Assigned customer users have an Inventory link into the shared authenticated session', () => {
  assert.match(source, /<a className="op-inventory" href=\{courseContextUrl\('\/inventory', course\)\}/);
  assert.doesNotMatch(source, /canManageInventory/);
});

test('course matching in OperatorApp matches on customer_id and course_id', () => {
  assert.match(source, /mergeDashboardCourse\(selectedCourse, dashboard\?\.courses\)/);
  assert.match(source, /\{courseDisplayLabel\(course\)\}/);
});

test('mobile operator header preserves navigation, course selection, and labeled service actions', () => {
  assert.match(source, /<nav aria-label="Cart Operator navigation">/);
  assert.match(source, /aria-label="Select course"/);
  assert.match(source, /aria-label=\{.*serviceActionLabel.*course\?\.course_name/);
  assert.match(source, /<span>\{serviceRetry \? `Retry \$\{serviceActionLabel\}` : serviceActionLabel\}<\/span>/);
  assert.match(operatorStyles, /@media \(max-width: 1180px\)/);
  assert.match(operatorStyles, /\.op-course-context \{ display: grid;/);
  assert.match(operatorStyles, /\.op-service-controls \{ display: flex; flex-wrap: wrap;/);
  assert.match(operatorStyles, /\.op-notifications \{ position: static;/);
  assert.match(operatorStyles, /\.op-icon \{ width: 44px; height: 44px;/);
  assert.match(operatorStyles, /\.op-priority \{ grid-template-columns: 1fr; \}/);
});

test('Cart request initialization executes the native Map factory used by its listener', () => {
  assert.match(entrySource, /Map as MapIcon/);
  assert.match(entrySource, /const \{ requestsByCourse, loadedCourses \} = createCourseRequestState\(\)/);
  assert.doesNotMatch(entrySource, /new Map\(\)/);

  const { requestsByCourse, loadedCourses } = createCourseRequestState();
  assert.ok(requestsByCourse instanceof globalThis.Map);
  assert.ok(loadedCourses instanceof globalThis.Set);
  requestsByCourse.set('CUST-0003/COURSE-0002', [{ request_id: 'request-1' }]);
  loadedCourses.add('CUST-0003/COURSE-0002');
  assert.deepEqual(requestsByCourse.get('CUST-0003/COURSE-0002'), [{ request_id: 'request-1' }]);
  assert.equal(loadedCourses.has('CUST-0003/COURSE-0002'), true);

  const originalShadowedInitialization = (Map) => new Map();
  assert.throws(() => originalShadowedInitialization(MapIcon), TypeError);
});