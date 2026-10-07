import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  courseDemandWindowMilliseconds,
  courseDemandWindowSeconds,
} from '../src/admin/courseDemandWindow.mjs';

const adminAppSource = await readFile(
  new URL('../src/admin/AdminApp.jsx', import.meta.url),
  'utf8'
);

test('Admin detail overlays retain their close icon dependency', () => {
  assert.match(adminAppSource, /Wrench, X,/);
  assert.equal([...adminAppSource.matchAll(/<X\b/g)].length, 2);
});

test('Course editor displays seconds and submits canonical milliseconds without a local default', () => {
  assert.match(adminAppSource, /courseDemandWindowSeconds\(course\?\.golfer_demand_window_ms\)/);
  assert.match(adminAppSource, /golfer_demand_window_ms: milliseconds/);
  assert.match(adminAppSource, /Golfer Demand Window \(seconds\)/);
  assert.match(adminAppSource, /step="0\.001"/);
  assert.doesNotMatch(adminAppSource, /300000|60000|DEMAND_WINDOW_MS/);
});

test('Course duration conversion round-trips stored milliseconds through seconds', () => {
  assert.equal(courseDemandWindowSeconds(9173), '9.173');
  assert.equal(courseDemandWindowMilliseconds('9.173'), 9173);
  assert.equal(courseDemandWindowMilliseconds('0.0005'), null);
  assert.equal(courseDemandWindowMilliseconds('0'), null);
  assert.equal(courseDemandWindowMilliseconds('not a number'), null);
});
