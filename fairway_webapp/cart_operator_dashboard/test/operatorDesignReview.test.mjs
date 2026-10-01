import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const reviewSource = await readFile(
  new URL('../src/operator-design/OperatorDesignReview.jsx', import.meta.url),
  'utf8'
);
const mainSource = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('static operator design review presents the approved Option C without review controls', () => {
  assert.match(mainSource, /pathname === '\/operator-design'/);
  assert.equal([...reviewSource.matchAll(/function Option[A-C]/g)].length, 3);
  assert.doesNotMatch(reviewSource, /phone-shell|firebase|operatorRequest|updateRequestStatus/);
  assert.match(reviewSource, /<OptionC empty=\{false\}/);
  assert.doesNotMatch(reviewSource, /Design options|Show empty state|od-reviewbar/);
});