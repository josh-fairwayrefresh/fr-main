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
