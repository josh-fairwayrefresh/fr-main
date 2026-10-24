import assert from 'node:assert/strict';
import test from 'node:test';
import { inventoryViewCsv } from '../src/lib/inventoryExport.mjs';

const products = [
  { name: 'Water, "cold"', category_name: 'Drinks', state: 'on_cart', quantity: 4 },
  { name: '=1+1', category_name: 'Food', state: 'in_inventory', quantity: 6 },
];
const options = {
  course: { customer_id: 'C', course_id: 'U' },
  inventory: {
    customer_name: 'Customer', course_name: 'Course', timezone: 'America/Los_Angeles', inventory_revision: 9,
    products, daily_sales: { local_date: '2026-10-23', total_units: 2, products: [{ name: 'Water', units: 2 }] },
  },
  products, archivedProducts: [], category: 'all', subcategory: 'all', operator: '',
  exportedAt: new Date('2026-10-24T01:00:00Z'),
};
test('CSV exports confirmed view, Course-local time, operator, stock and Course-wide displayed tally', () => {
  const csv = inventoryViewCsv(options);
  for (const text of ['Customer', 'Course', 'America/Los_Angeles', '10/23/2026', '6:00 PM PDT', 'Not selected', '"Confirmed inventory revision","9"', '"Total units sold","2"', '"Water, ""cold"""', '"In Inventory","6"', '"\'=1+1"']) assert.ok(csv.includes(text), text);
});
test('filtered export clearly distinguishes product scope from Course-wide sales and includes selected operator', () => {
  const csv = inventoryViewCsv({ ...options, products: [products[0]], category: 'Drinks', subcategory: 'Cold', operator: 'Test operator' });
  assert.ok(csv.includes('FILTERED VIEW - NOT THE COMPLETE INVENTORY'));
  assert.ok(csv.includes('"Category filter","Drinks"'));
  assert.ok(csv.includes('"Subcategory filter","Cold"'));
  assert.ok(csv.includes('"Selected operator","Test operator"'));
  assert.ok(csv.includes('entire Course, not narrowed by inventory filters'));
  assert.ok(!csv.includes('=1+1'));
});
test('missing Course timezone is an explicit export error, not a browser-timezone fallback', () => {
  assert.throws(() => inventoryViewCsv({ ...options, inventory: { ...options.inventory, timezone: null } }), /timezone is not configured/);
});
