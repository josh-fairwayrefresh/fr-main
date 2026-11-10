import ExcelJS from 'exceljs';
import { formatPublishedAt, INVENTORY_STATE_LABELS } from './inventoryModel.mjs';

export const INVENTORY_WORKBOOK_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GREEN = '183E2C';
const LIGHT = 'EDF3EF';

export async function inventoryViewWorkbook({ course, inventory, auditHistory, products, archivedProducts, category, subcategory, operator, exportedAt = new Date() }) {
  if (!inventory.timezone) throw new Error('Course timezone is not configured. Export requires a Course-local timestamp.');
  if (!auditHistory || auditHistory.timezone !== inventory.timezone || !Array.isArray(auditHistory.audits)) {
    throw new Error('Confirmed Course audit history is required for export.');
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fairway Refresh';
  workbook.created = exportedAt;
  const sheet = workbook.addWorksheet('Inventory Report', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 1, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0, footer: 0 },
    },
  });
  const widths = [29, 24, 14, 8, 3, 29, 24, 14, 8];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  function textRow(row, text, { size = 10, bold = false, fill } = {}) {
    sheet.mergeCells(row, 1, row, 9);
    const cell = sheet.getCell(row, 1);
    cell.value = text;
    cell.font = { name: 'Arial', size, bold, color: { argb: GREEN } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    sheet.getRow(row).height = Math.ceil(text.length / (size > 10 ? 85 : size === 9 ? 175 : 150)) * (size + 3) + 2;
  }
  textRow(1, 'Fairway Refresh | Inventory Report', { size: 16, bold: true });
  textRow(2, `Customer: ${inventory.customer_name || course.customer_name || course.customer_id} (${course.customer_id})    |    Course: ${inventory.course_name || course.course_name} (${course.course_id})`, { bold: true });
  textRow(3, `Exported: ${formatPublishedAt(exportedAt, inventory.timezone)} (${inventory.timezone})    |    Operator: ${operator || 'Not selected'}`);
  const filtered = category !== 'all' || subcategory !== 'all';
  textRow(4, `${filtered ? 'FILTERED VIEW - NOT THE COMPLETE INVENTORY' : 'Scope: All active products'}    |    Category filter: ${category === 'all' ? 'All categories' : category}    |    Subcategory filter: ${subcategory === 'all' ? 'All subcategories' : subcategory}`, { bold: true, fill: LIGHT });
  textRow(5, `Archived: ${archivedProducts.length ? 'all displayed archives, independent of active filters' : 'not displayed'}    |    Confirmed revision: ${inventory.inventory_revision}    |    Server-confirmed data; unsubmitted edits excluded. Not an audit.`, { size: 9 });
  const rows = [...products, ...archivedProducts].map(product => [
    product.name,
    [product.category_name, product.subcategory_name].filter(Boolean).join(' / '),
    product.archived ? `Archived (${INVENTORY_STATE_LABELS[product.state]})` : INVENTORY_STATE_LABELS[product.state],
    product.quantity ?? 0,
  ]);
  function table(start, headings, data, sales = false) {
    const half = Math.ceil(data.length / 2);
    for (const [offset, items] of [[0, data.slice(0, half)], [5, data.slice(half)]]) {
      for (const [index, heading] of headings.entries()) {
        const column = sales && index === 1 ? 3 : index;
        if (sales && index === 0) sheet.mergeCells(start, offset + 1, start, offset + 3);
        const cell = sheet.getCell(start, offset + column + 1);
        cell.value = heading;
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
        cell.alignment = { vertical: 'middle' };
      }
      items.forEach((item, index) => {
        const row = start + index + 1;
        let lines = 1;
        item.forEach((value, index) => {
          const column = sales && index === 1 ? 3 : index;
          if (sales && index === 0) sheet.mergeCells(row, offset + 1, row, offset + 3);
          const cell = sheet.getCell(row, offset + column + 1);
          // Strings remain literal XLSX cells, including formula-like product names.
          cell.value = value;
          cell.font = { name: 'Arial', size: 10, color: { argb: GREEN } };
          cell.alignment = { vertical: 'middle', wrapText: true, horizontal: typeof value === 'number' ? 'right' : 'left' };
          if (typeof value === 'number') cell.numFmt = '0';
          if (index % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
          const width = sales && index === 0 ? widths[offset] + widths[offset + 1] + widths[offset + 2] : widths[offset + column];
          lines = Math.max(lines, Math.ceil(String(value).length / (width * 1.15)));
        });
        sheet.getRow(row).height = Math.max(sheet.getRow(row).height || 0, lines * 12.5);
      });
    }
    sheet.getRow(start).height = 18;
    return start + Math.max(half, 1) + 1;
  }
  let next = table(6, ['Product', 'Category / Subcategory', 'Availability', 'Quantity'], rows);
  const tally = inventory.daily_sales;
  textRow(next++, `Daily Sales | ${tally.local_date} | Entire Course, not narrowed by inventory filters`, { bold: true, fill: LIGHT });
  const cartStock = inventory.products.filter(product => !product.archived && product.state === 'on_cart')
    .reduce((sum, product) => sum + (product.quantity ?? 0), 0);
  textRow(next++, `Total units sold: ${tally.total_units}    |    Cart stock units (all On Cart products): ${cartStock}`, { bold: true });
  next = table(next, ['Product', 'Units'], tally.products.map(product => [product.name, product.units]), true);
  sheet.pageSetup.printArea = `A1:I${next - 1}`;
  const history = workbook.addWorksheet('Audit History', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 1, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      printTitlesRow: '1:5',
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
    },
    headerFooter: { oddFooter: 'Page &P of &N' },
  });
  history.columns = [{ width: 36 }, { width: 48 }];
  const context = [
    'Fairway Refresh | Inventory Audit History',
    `Customer: ${inventory.customer_name || course.customer_name || course.customer_id} | Course: ${inventory.course_name || course.course_name} (${course.course_id})`,
    `Past 14 Course-local calendar days: ${auditHistory.start_date} through ${auditHistory.end_date} (inclusive, through export) | ${auditHistory.timezone}`,
    'Entire Course audit history; independent of current inventory/category filters. Names are historical snapshots.',
  ];
  context.forEach((text, index) => {
    history.mergeCells(index + 1, 1, index + 1, 2);
    history.getCell(index + 1, 1).value = text;
    history.getRow(index + 1).height = index === 0 ? 25 : 32;
  });
  history.addRow(['Audit date / time', 'Approver']);
  if (auditHistory.audits.length) {
    for (const audit of auditHistory.audits) {
      history.addRow([formatPublishedAt(audit.created_at, auditHistory.timezone), audit.approver_staff_name]);
    }
  } else {
    history.mergeCells('A6:B6');
    history.getCell('A6').value = 'No completed inventory audits occurred during this reporting period.';
  }
  history.eachRow((row, index) => {
    row.height = Math.max(row.height || 0, 32);
    row.eachCell(cell => {
      cell.font = { name: 'Arial', size: index === 1 ? 14 : 10, bold: index === 1 || index === 5, color: { argb: index === 5 ? 'FFFFFF' : GREEN } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (index === 5 || (index > 5 && index % 2 === 0)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index === 5 ? GREEN : LIGHT } };
      row.height = Math.max(row.height, Math.ceil(String(cell.value || '').length / (index <= 4 ? 95 : cell.col === 1 ? 35 : 45)) * 14);
    });
  });
  history.pageSetup.printArea = `A1:B${history.rowCount}`;
  return workbook.xlsx.writeBuffer();
}
