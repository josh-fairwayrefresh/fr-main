import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import InventoryApp from '../src/InventoryApp';
import CustomerStaff from '../src/admin/CustomerStaff';
import ExcelJS from 'exceljs';

const course = { customer_id: 'TEST-C', course_id: 'TEST-U', customer_name: 'Inventory Test', course_name: 'Stock Course', timezone: 'America/Los_Angeles' };
const user = { uid: 'inventory-test', email: 'test@example.invalid', getIdToken: async () => 'fixture-token' };
const catalog = [
  { product_id: 'p1', name: 'Water', category_name: 'Drinks', category_id: 'drinks', state: 'on_cart' },
  { product_id: 'p2', name: 'Juice', category_name: 'Food', category_id: 'food', state: 'in_inventory', quantity: 7 },
  { product_id: 'p3', name: 'Tea', category_name: 'Drinks', category_id: 'drinks', state: 'sold_out', quantity: 0 },
];
let staff = [{ staff_id: 'manager', name: 'Test Manager', role: 'fnb_management', active: true }];
let shift = null;
let revision = 0;
let loadedRevision = -1;
let unitsSold = 0;
let sales = 0;
let closes = 0;
let audit = null;
let loseSaleResponse = true;
let loseCloseResponse = true;
const committed = new Map();
const calls = [];
const downloads = [];
async function reportText(blob) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  return JSON.stringify(workbook.getWorksheet('Inventory Report').getSheetValues());
}
URL.createObjectURL = blob => { downloads.push(blob); return 'blob:inventory-export'; };
URL.revokeObjectURL = () => {};
HTMLAnchorElement.prototype.click = () => {};
const check = (value, message) => { if (!value) throw new Error(message); };
const wait = async predicate => {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Timed out: ' + predicate.toString());
};
const click = node => { check(node, 'Missing button'); flushSync(() => node.click()); };
const button = text => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const input = (node, value) => {
  check(node, 'Missing input');
  const prototype = node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
  flushSync(() => node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })));
};
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (url, options = {}) => {
  const route = new URL(url, location.origin).pathname;
  const body = options.body ? JSON.parse(options.body) : {};
  const method = options.method || 'GET';
  calls.push({ route, method, body });
  if (route.endsWith('/staff') && method === 'GET') return response({ staff });
  if (route.endsWith('/staff') && method === 'POST') {
    const person = { staff_id: 'custom', name: body.name, role: body.role || 'cart_operator', active: true };
    staff = [...staff.filter(item => item.staff_id !== person.staff_id), person];
    return response(person);
  }
  if (route.endsWith('/shifts/session')) return response({ shift });
  if (route.endsWith('/shifts/select')) {
    const person = staff.find(item => item.staff_id === body.staff_id);
    shift = { shift_id: 'shift1', staff_id: person.staff_id, staff_name: person.name, has_activity: false };
    return response({ shift });
  }
  if (committed.has(body.operation_id)) return response(committed.get(body.operation_id));
  if (route.endsWith('/close')) {
    closes++; shift = null;
    const result = { closed: true };
    committed.set(body.operation_id, result);
    if (loseCloseResponse) { loseCloseResponse = false; throw new TypeError('Response lost'); }
    return response(result);
  }
  if (route.endsWith('/stock')) {
    const product = catalog.find(item => route.includes(`/products/${item.product_id}/`));
    if (body.kind === 'sale') {
      if (body.units > (product.quantity ?? 0)) return response({ message: 'Insufficient stock. Correct the quantity first.' }, 409);
      product.quantity -= body.units; unitsSold += body.units; sales++;
    } else {
      if (body.expected_stock_revision !== (product.stock_revision ?? 0)) return response({ message: 'Stock changed; review the current quantity.' }, 409);
      if (body.quantity !== undefined) product.quantity = body.quantity;
      if (body.state) product.state = body.state;
    }
    if (body.kind === 'sale' && product.quantity === 0) product.state = 'sold_out';
    if (body.kind === 'adjustment') {
      if (product.quantity === 0 && product.state === 'on_cart') product.state = 'sold_out';
      else if (product.quantity > 0 && product.state === 'sold_out') product.state = 'on_cart';
    }
    product.stock_revision = (product.stock_revision ?? 0) + 1;
    revision++; shift.has_activity = true;
    const result = { ...product };
    committed.set(body.operation_id, result);
    if (body.kind === 'sale' && loseSaleResponse) { loseSaleResponse = false; throw new TypeError('Response lost'); }
    return response(result);
  }
  if (route.endsWith('/audits')) {
    if (body.inventory_revision !== revision) return response({ message: 'Inventory changed. Review and confirm again.' }, 409);
    audit = structuredClone(catalog.filter(product => product.state !== 'in_inventory'));
    committed.set(body.operation_id, { audit_id: 'audit1' });
    return response({ audit_id: 'audit1' });
  }
  if (route.endsWith('/TEST-U') && method === 'GET') {
    loadedRevision = revision;
    return response({
    ...course,
    products: catalog, categories: [{ category_id: 'drinks', name: 'Drinks', subcategories: [] }, { category_id: 'food', name: 'Food', subcategories: [] }],
    inventory_revision: revision, daily_sales: { local_date: '2026-10-23', total_units: unitsSold, products: unitsSold ? [{ product_id: 'p1', name: 'Water', units: unitsSold }] : [] },
    });
  }
  throw new Error(`Unexpected fixture request ${method} ${route}`);
};
const root = createRoot(document.getElementById('root'));
try {
  flushSync(() => root.render(<InventoryApp user={user} apiBaseUrl={location.origin} courses={[course]} onSignOut={() => {}} />));
  await wait(() => document.querySelector('[aria-label="Edit quantity for Water"]'));
  await wait(() => !button('Export').disabled);
  const beforeExport = calls.length;
  click(button('Export'));
  check(calls.length === beforeExport && shift === null, 'Export must not select an operator or make a request');
  await wait(() => downloads.length === 1);
  check((await reportText(downloads[0])).includes('Operator: Not selected'), 'Export supports no selected operator');
  check(catalog[0].state === 'on_cart', 'Zero initialization must not move existing tiles');
  click(document.querySelector('[aria-label="Move Water"]'));
  click(button('Move here: In Inventory'));
  await wait(() => document.querySelector('#inventory-session-title'));
  input(document.querySelector('.inventory-session-overlay select'), 'custom');
  input(document.querySelector('.inventory-session-overlay input'), 'Test Operator');
  click(button('Confirm operator'));
  await wait(() => catalog[0].state === 'in_inventory' && !document.querySelector('[aria-label="Water state"]').disabled);
  check((catalog[0].quantity ?? 0) === 0 && !document.querySelector('#inv-stock-title'), 'First return resumes after Custom selection without Quantity prompt');
  input(document.querySelector('[aria-label="Water state"]'), 'on_cart');
  await wait(() => document.querySelector('#inv-stock-title'));
  const loadInput = document.querySelector('#inv-stock-title').closest('section').querySelector('input');
  check(loadInput.value === '1', 'Loading zero stock starts at one');
  for (const node of document.querySelectorAll('.inv-quantity-input button')) {
    const bounds = node.getBoundingClientRect();
    check(bounds.width >= 44 && bounds.height >= 44, 'Touch steppers must be at least 44 by 44');
  }
  click(document.querySelector('[aria-label="Increase quantity"]'));
  check(loadInput.value === '2' && catalog[0].state === 'in_inventory', 'Plus does not submit a load');
  input(loadInput, '5');
  click(button('Confirm'));
  await wait(() => !document.querySelector('#inv-stock-title'));
  check(catalog[0].quantity === 5, 'Confirmed loading resumes cart operation');
  check(document.querySelector('.inventory-session').textContent.includes('Test Operator'), 'Banner must display selected name');
  click(document.querySelector('[aria-label="Edit quantity for Juice"]'));
  const adjustment = document.querySelector('#inv-stock-title').closest('section');
  input(adjustment.querySelector('input'), '0');
  check(document.querySelector('[aria-label="Decrease quantity"]').disabled, 'Adjustments stop at zero');
  click(document.querySelector('[aria-label="Increase quantity"]'));
  click(document.querySelector('[aria-label="Decrease quantity"]'));
  check(catalog[1].quantity === 7, 'Adjustment steppers do not submit');
  click(button('Confirm'));
  await wait(() => !document.querySelector('#inv-stock-title'));
  check(catalog[1].state === 'in_inventory' && catalog[1].quantity === 0, 'Zero adjustment must leave restaurant-held product In Inventory');
  click(document.querySelector('[aria-label="Record sale for Water"]'));
  check(document.querySelector('#inv-stock-title').closest('section').querySelector('input').value === '1', 'Sale defaults to one');
  check(document.querySelector('[aria-label="Decrease units sold"]').disabled, 'Sales cannot step below one');
  click(document.querySelector('[aria-label="Increase units sold"]'));
  click(document.querySelector('[aria-label="Decrease units sold"]'));
  check(sales === 0, 'Sale step controls do not submit');
  click(button('Confirm'));
  await wait(() => document.querySelector('[role="alert"]')?.textContent.includes('not confirmed'));
  check(button('Export').disabled, 'Unresolved submissions must not be exported as saved');
  check(catalog[0].quantity === 4 && sales === 1, 'One committed sale despite lost response');
  click(button('Confirm'));
  await wait(() => !document.querySelector('#inv-stock-title'));
  check(catalog[0].quantity === 4 && sales === 1, 'Retry must not deduct twice');
  click([...document.querySelectorAll('.inv-category-filter')].find(node => node.textContent.startsWith('Drinks')));
  const beforeFilteredExport = calls.length;
  click(button('Export'));
  await wait(() => downloads.length === 2);
  const filteredReport = await reportText(downloads.at(-1));
  check(filteredReport.includes('FILTERED VIEW - NOT THE COMPLETE INVENTORY') && filteredReport.includes('Category filter: Drinks'), 'Filtered exports identify active scope');
  check(!filteredReport.includes('"Juice"') && filteredReport.includes('Total units sold: 1') && filteredReport.includes('Test Operator'), 'Export uses displayed products and full displayed tally with operator');
  check(calls.length === beforeFilteredExport, 'Filtered export remains read-only');
  click(button('Export'));
  click([...document.querySelectorAll('.inv-category-filter')].find(node => node.textContent.startsWith('All Products')));
  await wait(() => document.querySelector('.inv-notice')?.textContent.includes('changed while preparing the report'));
  check(downloads.length === 2 && calls.length === beforeFilteredExport, 'Changed export scope must reject the in-flight download without a request');
  click(document.querySelector('[aria-label="Dismiss message"]'));
  click(document.querySelector('[aria-label="Record sale for Water"]'));
  input(document.querySelector('#inv-stock-title').closest('section').querySelector('input'), '5');
  click(button('Confirm'));
  await wait(() => document.querySelector('[role="alert"]')?.textContent.includes('Correct the quantity first'));
  check(sales === 1 && catalog[0].quantity === 4, 'Excessive sale must not mutate stock');
  click(document.querySelector('#inv-stock-title').closest('section').querySelector('footer button[type="button"]'));
  catalog[0].stock_revision++;
  input(document.querySelector('[aria-label="Water state"]'), 'in_inventory');
  await wait(() => document.querySelector('.inv-notice')?.textContent.includes('Stock changed'));
  await wait(() => !document.querySelector('[aria-label="Water state"]').disabled);
  check(catalog[0].state === 'on_cart', 'Conflicted return must not report success');
  input(document.querySelector('[aria-label="Water state"]'), 'in_inventory');
  await wait(() => {
    const select = document.querySelector('[aria-label="Water state"]');
    return select.value === 'in_inventory' && !select.disabled;
  });
  check(catalog[0].quantity === 4, 'Moving to In Inventory preserves quantity');
  check(calls.filter(call => call.body.kind === 'availability' && call.body.state !== 'on_cart').every(call => call.body.quantity === undefined), 'Moving off cart must not manufacture a quantity adjustment');
  click(button('Confirm Inventory Audit'));
  check(!document.querySelector('#inv-audit-title').closest('section').textContent.includes('Water'), 'Returned stock is excluded from subsequent cart audit');
  click(document.querySelector('#inv-audit-title').closest('section').querySelector('footer button[type="button"]'));
  flushSync(() => root.render(<InventoryApp key="return-reload" user={user} apiBaseUrl={location.origin} courses={[course]} onSignOut={() => {}} />));
  await wait(() => document.querySelector('[aria-label="Water state"]')?.value === 'in_inventory');
  input(document.querySelector('[aria-label="Water state"]'), 'on_cart');
  await wait(() => document.querySelector('#inv-stock-title')?.textContent === 'Load onto cart');
  check(catalog[0].state === 'in_inventory', 'Loading must wait for Quantity confirmation');
  click(button('Confirm'));
  await wait(() => !document.querySelector('#inv-stock-title'));
  check(catalog[0].state === 'on_cart' && catalog[0].quantity === 4, 'Confirmed load records availability and quantity');
  click(button('Confirm Inventory Audit'));
  const auditSection = document.querySelector('#inv-audit-title').closest('section');
  check(!auditSection.textContent.includes('Juice'), 'Audit excludes In Inventory despite retained balance');
  input(auditSection.querySelector('select'), 'manager');
  click(auditSection.querySelector('input[type="checkbox"]'));
  revision++;
  click(button('Confirm audit'));
  await wait(() => auditSection.querySelector('[role="alert"]')?.textContent.includes('Review and confirm again'));
  check(audit === null, 'A concurrent revision must not save an unconfirmed baseline');
  click(auditSection.querySelector('button[type="button"]'));
  window.dispatchEvent(new Event('inventory-updated'));
  await wait(() => loadedRevision === revision);
  flushSync(() => {});
  click(button('Confirm Inventory Audit'));
  await wait(() => document.querySelector('#inv-audit-title')?.closest('section').textContent.includes(`revision ${revision}`));
  const freshAudit = document.querySelector('#inv-audit-title').closest('section');
  input(freshAudit.querySelector('select'), 'manager');
  click(freshAudit.querySelector('input[type="checkbox"]'));
  click(button('Confirm audit'));
  await wait(() => !document.querySelector('#inv-audit-title'));
  check(audit.length === 2, 'Audit includes all On Cart and Sold Out');
  click(document.querySelector('.inventory-close-out'));
  input(document.querySelector('.inventory-session-overlay input'), '12.34');
  click(button('Submit shift total'));
  await wait(() => document.querySelector('.inventory-session-overlay [role="alert"]'));
  check(document.querySelector('.inventory-session-overlay input').value === '12.34', 'Uncertain close retains amount');
  check(document.querySelector('.inventory-session').textContent.includes('Test Operator'), 'Uncertain close retains name');
  flushSync(() => root.render(<InventoryApp key="reload" user={user} apiBaseUrl={location.origin} courses={[course]} onSignOut={() => {}} />));
  await wait(() => document.querySelector('.inventory-session-overlay input')?.value === '12.34');
  check(document.querySelector('.inventory-session').textContent.includes('Test Operator'), 'Reload must retain unresolved close name, even when server already closed');
  click(button('Submit shift total'));
  await wait(() => !document.querySelector('.inventory-session-overlay'));
  check(closes === 1 && document.querySelector('.inventory-session').textContent.includes('Not selected'), 'One successful close clears only current name');
  check(catalog[0].quantity === 4 && unitsSold === 1, 'Shift close preserves stock and daily sales');
  check(document.documentElement.scrollWidth <= innerWidth, 'Inventory must not overflow viewport');
  for (const control of document.querySelectorAll('.inv-stock-controls button')) {
    const bounds = control.getBoundingClientRect();
    check(bounds.left >= 0 && bounds.right <= innerWidth && bounds.width > 0, 'Stock actions must be visible within viewport');
  }
  check(!calls.some(call => call.route.endsWith('/publish')), 'No obsolete manual publication calls');
  flushSync(() => root.render(<CustomerStaff user={user} apiBaseUrl={location.origin} customer={{ customer_id: 'TEST-C', customer_name: 'Inventory Test' }} />));
  click(button('Staff list · Inventory Test'));
  await wait(() => document.body.textContent.includes('Test Manager'));
  check(document.body.textContent.includes('does not grant login'), 'Staff management distinguishes login access');
  document.getElementById('result').textContent = 'PASS';
} catch (error) {
  document.getElementById('result').textContent = `FAIL: ${error.stack}`;
}
