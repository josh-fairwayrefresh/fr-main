import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeInventoryBootstrap } from '../src/lib/inventoryBootstrap.mjs';

const course = {
  customer_id: 'CUST-0002',
  customer_name: 'Synthetic Customer',
  course_id: 'COURSE-0002',
  course_name: 'Synthetic Cart',
  timezone: 'America/Los_Angeles',
};

test('cart inventory access remains available without a registered public menu', () => {
  assert.deepEqual(normalizeInventoryBootstrap({ courses: [course] }), [course]);
  assert.deepEqual(normalizeInventoryBootstrap({ courses: [] }), []);
});

test('malformed or duplicate cart inventory contexts fail closed', () => {
  assert.throws(() => normalizeInventoryBootstrap({}), /could not be verified/);
  assert.throws(() => normalizeInventoryBootstrap({ courses: [{ ...course, course_id: '' }] }),
    /could not be verified/);
  assert.throws(() => normalizeInventoryBootstrap({ courses: [{ ...course, asset_id: 'another-asset' }] }),
    /could not be verified/);
  assert.throws(() => normalizeInventoryBootstrap({ courses: [course, course] }),
    /could not be verified/);
});

test('menu-less cart inventory is bootstrapped separately and never offers a public menu', async () => {
  const [main, workspace, inventoryApp] = await Promise.all([
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/MenuWorkspace.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/InventoryApp.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(main, /\/api\/v1\/inventory\/bootstrap/);
  assert.match(workspace, /public_menu_unavailable: true/);
  assert.match(inventoryApp, /No public menu is registered for this cart inventory\./);
  assert.match(inventoryApp, /course\.public_menu_unavailable !== true/);
});
