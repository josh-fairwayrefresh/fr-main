import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/OperatorApp.jsx', import.meta.url), 'utf8');

test('functional Option C operator surface keeps the approved workflow contract', () => {
  assert.match(source, /OLDEST ACTIVE REQUEST/);
  assert.match(source, /Complete service/);
  assert.match(source, /Cancel request/);
  assert.match(source, /operator\/service\/\$\{action\}/);
  assert.match(source, /operator\/dashboard/);
  assert.doesNotMatch(source, />CONFIRM</);
});