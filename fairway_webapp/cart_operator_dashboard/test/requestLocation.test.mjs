import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { requestLocationLabel } from '../src/lib/requestLocation.mjs';

const operatorSource = await readFile(new URL('../src/OperatorApp.jsx', import.meta.url), 'utf8');
const entrySource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('numbered holes retain the existing Hole N label', () => {
  assert.equal(requestLocationLabel({ hole: 7 }), 'Hole 7');
  assert.equal(requestLocationLabel({ hole: 7, location_label: 'Hole 7' }), 'Hole 7');
});

test('custom locations display their configured text exactly', () => {
  assert.equal(requestLocationLabel({ hole: null, location_label: 'demo stand' }), 'demo stand');
  assert.equal(requestLocationLabel({ location_label: 'Practice Green — North' }), 'Practice Green — North');
  assert.equal(requestLocationLabel({ device_label: '  Putting Area  ' }), '  Putting Area  ');
});

test('missing or invalid location data has a neutral fallback', () => {
  assert.equal(requestLocationLabel({}), 'Location unknown');
  assert.equal(requestLocationLabel({ hole: 0 }), 'Location unknown');
  assert.equal(requestLocationLabel({ hole: 19, location_label: '   ' }), 'Location unknown');
});

test('the request listener passes persisted device labels to the Cart Operator view model', () => {
  assert.match(entrySource, /location_label:\s*data\.location_label \|\| data\.device_label/);
});

test('active, queued, completed, and action-feedback request surfaces use the shared location label', () => {
  assert.match(operatorSource, /<h2>\{requestLocationLabel\(request\)\}<\/h2>/);
  assert.match(operatorSource, /<strong>\{requestLocationLabel\(request\)\}<\/strong>/);
  assert.match(operatorSource, /<b>\{requestLocationLabel\(item\)\}<\/b>/);
  assert.match(operatorSource, /Cancel the request for \$\{requestLocationLabel\(request\)\}/);
  assert.match(operatorSource, /\$\{requestLocationLabel\(request\)\} complete/);
});
