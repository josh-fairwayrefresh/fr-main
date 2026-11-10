import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { inventoryViewWorkbook } from '../src/lib/inventoryExport.mjs';

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
  auditHistory: { start_date: '2026-10-10', end_date: '2026-10-23', timezone: 'America/Los_Angeles', audits: [] },
};
async function readReport(settings = options) {
  const bytes = await inventoryViewWorkbook(settings);
  assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), 'PK', 'Actual zipped OOXML, not renamed CSV');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet('Inventory Report');
  return { sheet, workbook, text: JSON.stringify(sheet.getSheetValues()) };
}
test('XLSX exports confirmed view, Course-local context, literal names and numeric whole quantities', async () => {
  const { sheet, text } = await readReport();
  for (const value of ['Customer', 'Course', 'America/Los_Angeles', '10/23/2026', '6:00 PM PDT', 'Not selected', 'Confirmed revision: 9', 'Total units sold: 2', 'In Inventory', '=1+1']) assert.ok(text.includes(value), value);
  assert.equal(sheet.getCell('F7').value, '=1+1');
  assert.equal(sheet.getCell('F7').type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell('D7').value, 4);
  assert.equal(sheet.getCell('I7').value, 6);
  assert.equal(sheet.getCell('I7').numFmt, '0');
  assert.equal(sheet.getCell('A6').font.bold, true);
});
test('filtered workbook identifies scope, operator, archived data and Course-wide daily summary', async () => {
  const { text } = await readReport({
    ...options, products: [products[0]], category: 'Drinks', subcategory: 'Cold', operator: 'Test operator',
    archivedProducts: [{ name: 'Archived item', category_name: 'Food', subcategory_name: 'Snack', state: 'in_inventory', quantity: 3, archived: true }],
  });
  for (const value of ['FILTERED VIEW - NOT THE COMPLETE INVENTORY', 'Category filter: Drinks', 'Subcategory filter: Cold', 'Operator: Test operator', 'Entire Course, not narrowed by inventory filters', 'Archived (In Inventory)', 'Food / Snack']) assert.ok(text.includes(value), value);
  assert.ok(!text.includes('=1+1'));
});
test('58-product report has explicit one-page landscape print area, margins and readable numeric styles', async () => {
  const rows = Array.from({ length: 58 }, (_, i) => ({ name: `Representative product ${i + 1}`, category_name: 'Canned Cocktails', state: 'on_cart', quantity: i }));
  const { sheet } = await readReport({ ...options, products: rows });
  assert.equal(sheet.getCell('D35').value, 28);
  assert.equal(sheet.getCell('I35').value, 57);
  assert.equal(sheet.pageSetup.orientation, 'landscape');
  assert.equal(sheet.pageSetup.paperSize, 1);
  assert.equal(sheet.pageSetup.fitToPage, true);
  assert.equal(sheet.pageSetup.fitToWidth, 1);
  assert.equal(sheet.pageSetup.fitToHeight, 1);
  assert.equal(sheet.pageSetup.printArea, `A1:I${sheet.rowCount}`);
  assert.equal(sheet.pageSetup.margins.left, 0.25);
  assert.equal(sheet.getCell('A7').font.size, 10);
  assert.equal(sheet.getColumn(1).width, 29);
});
test('missing Course timezone is an explicit export error', async () => {
  await assert.rejects(inventoryViewWorkbook({ ...options, inventory: { ...options.inventory, timezone: null } }), /timezone is not configured/);
});
test('separate audit worksheet preserves historical names and Course-local times independent of filters', async () => {
  const { workbook, sheet } = await readReport({
    ...options, category: 'Food', products: [],
    auditHistory: { ...options.auditHistory, audits: [
      { audit_id: 'a', created_at: '2026-10-24T01:00:00Z', approver_staff_name: '=Historical manager' },
    ] },
  });
  const history = workbook.getWorksheet('Audit History');
  const text = JSON.stringify(history.getSheetValues());
  for (const value of ['2026-10-10', '2026-10-23', 'America/Los_Angeles', '10/23/2026 6:00 PM PDT', '=Historical manager', 'independent of current inventory/category filters']) assert.ok(text.includes(value), value);
  assert.equal(history.getCell('B6').type, ExcelJS.ValueType.String);
  assert.equal(history.pageSetup.fitToWidth, 1);
  assert.equal(history.pageSetup.fitToHeight, 0);
  assert.equal(history.pageSetup.printTitlesRow, '1:5');
  assert.equal(history.pageSetup.printArea, 'A1:B6');
  assert.equal(sheet.pageSetup.fitToHeight, 1);
});
test('audit history explicitly reports no completed audits and missing history fails export', async () => {
  const { workbook } = await readReport();
  assert.ok(workbook.getWorksheet('Audit History').getCell('A6').value.includes('No completed inventory audits'));
  await assert.rejects(inventoryViewWorkbook({ ...options, auditHistory: undefined }), /history is required/);
});
