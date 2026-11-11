import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildDeviceTree, groupSelection, toggleDevices, formatWindow } from '../src/admin/otaModel.mjs';

const fleet = {
  customers: [
    { customer_id: 'A', customer_name: 'Alpha', courses: [{ course_id: 'A1' }, { course_id: 'A2' }] },
    { customer_id: 'B', customer_name: 'Beta', courses: [{ course_id: 'B1' }] },
  ],
  devices: [
    { device_id: '1', state: 'deployed', customer_id: 'A', course_id: 'A1', eligible: true },
    { device_id: '2', state: 'deployed', customer_id: 'A', course_id: 'A2', eligible: true },
    { device_id: '3', state: 'deployed', customer_id: 'B', course_id: 'B1', eligible: true },
    { device_id: '4', state: 'in_inventory', eligible: true },
    { device_id: '5', state: 'maintenance', customer_id: 'A', course_id: 'A1', eligible: true },
    { device_id: '6', state: 'maintenance', eligible: false },
  ],
};

test('canonical lifecycle produces exactly one tree occurrence, including HQ-held Maintenance', () => {
  const tree = buildDeviceTree(fleet);
  const leaves = (nodes) => nodes.flatMap((node) => node.device ? [node.id] : leaves(node.children));
  assert.deepEqual(leaves(tree).sort(), ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(tree[0].ids, ['1', '2', '3']);
  assert.deepEqual(tree[2].ids, ['5']);
});

test('parent selection, partial checkbox state, course deselection and arbitrary cross-group selections', () => {
  const tree = buildDeviceTree(fleet);
  let selected = toggleDevices(new Set(), tree[0].children[0].ids, true);
  assert.deepEqual([...selected], ['1', '2']);
  assert.deepEqual(groupSelection(tree[0].ids, selected), { all: false, partial: true });
  selected = toggleDevices(selected, tree[0].children[0].children[0].ids, false);
  selected = toggleDevices(selected, ['3', '4', '5'], true);
  assert.deepEqual([...selected].sort(), ['2', '3', '4', '5']);
  assert.deepEqual(groupSelection(['2'], selected), { all: true, partial: false });
  const original = new Set(selected);
  buildDeviceTree(fleet);
  assert.deepEqual(selected, original, 'rendering/expansion does not change selection');
});

test('window display retains authoritative UTC and correct local DST abbreviation', () => {
  assert.match(formatWindow('2026-11-11T08:30:00Z', 'America/Los_Angeles'), /12:30:00 AM PST/);
  assert.match(formatWindow('2026-07-11T07:30:00Z', 'America/Los_Angeles'), /12:30:00 AM PDT/);
  assert.equal(formatWindow(null), 'Unknown');
});

test('CPO dashboard contains no engineering publication inputs or arbitrary date/time controls', async () => {
  const source = await readFile(new URL('../src/admin/OtaManagement.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /type="file"|datetime-local|artifact_base64|MCUboot|manifestFile|Publish release/);
  assert.match(source, /Approved Firmware Updates/);
  assert.match(source, /Select Devices/);
  assert.match(source, /assignment-reviews/);
  assert.match(source, /indeterminate = state.partial/);
  assert.match(source, /Publication, assignment, and download are not proof of installation/);
  assert.match(source, /release\.release_id !== 'OTA-0\.1'/);
  assert.match(source, /headquarters time: America\/Los_Angeles/);
  assert.doesNotMatch(source, /awaits CPO confirmation|working assumption/);
});

test('OTA collections including reviews and token grants remain server-only under the deployed rules source', async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  const matches = [...rules.matchAll(/match\s+(\S+)\s*\{/g)].map((match) => match[1]);
  assert.deepEqual(matches, ['/databases/{database}/documents', '/requests/{requestId}', '/{document=**}']);
});

test('current target and reported bootstrap check do not remove an authorized device from selection', () => {
  const devices = [
    { ...fleet.devices[0], current_assignment_id: 'old', pending: { release_id: 'OTA-0.1alt-r2' },
      bootstrap_check_observed: true, confirmed_firmware_version: '0.1.0+4' },
    { ...fleet.devices[1], current_assignment_id: 'installing', pending: { state: 'activation_pending' } },
  ];
  const tree = buildDeviceTree({ ...fleet, devices });
  assert.deepEqual(tree[0].ids, ['1', '2']);
  assert.deepEqual([...toggleDevices(new Set(), tree[0].ids, true)], ['1', '2']);
});

test('normal assignment review discloses supersession and one-time delivery limits without a separate clearing action', async () => {
  const source = await readFile(new URL('../src/admin/OtaManagement.jsx', import.meta.url), 'utf8');
  assert.match(source, /regardless of current firmware or earlier assignments/);
  assert.match(source, /Supersedes \{device\.last_result\.release_id\}/);
  assert.match(source, /superseding any listed prior targets/);
  assert.match(source, /does not restart the device timer or create another check/);
  assert.match(source, /does not interrupt an image already installing/);
  assert.doesNotMatch(source, /disabled=\{[^}]*pending|disabled=\{[^}]*bootstrap_check_observed|Clear assignment|Replace pending update/);
});
