import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inventorySource = await readFile(new URL('../src/InventoryApp.jsx', import.meta.url), 'utf8');

test('Inventory dashboard uses the concise title and keeps readable course identity without IDs', () => {
  assert.match(inventorySource, /<h1>CART INVENTORY MANAGEMENT DASHBOARD<\/h1>/);
  assert.doesNotMatch(inventorySource, /CART INVENTORY MANAGEMENT DASHBOARD - MONARCH BAY GC/);
  assert.match(inventorySource, /course\.customer_name \|\| 'MONARCH BAY GC'/);
  assert.match(inventorySource, /<p className="inv-subtitle">\{course\.course_name\}<\/p>/);
  assert.doesNotMatch(inventorySource, /<p className="inv-eyebrow">\{course\.customer_name[^<]+course\.course_id/);
});