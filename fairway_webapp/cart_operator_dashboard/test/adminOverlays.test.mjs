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

test('registry firmware uses confirmed running evidence rather than historical generation metadata', () => {
  const field = adminAppSource.match(/<dt>Firmware generation<\/dt>(.*?)<\/dd>/s)?.[1];
  assert.ok(field);
  assert.match(field, /device\.confirmed_firmware_version/);
  assert.match(field, /device\.confirmed_firmware_at/);
  assert.match(field, /Unknown — no device confirmation/);
  assert.doesNotMatch(field, /device\.firmware_generation/);
});
