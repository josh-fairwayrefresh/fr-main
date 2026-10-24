import { formatPublishedAt, INVENTORY_STATE_LABELS } from './inventoryModel.mjs';

function csvCell(value) {
  const text = String(value ?? '');
  // Quoting alone does not prevent spreadsheet formula execution.
  const safe = /^[\s]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function inventoryViewCsv({ course, inventory, products, archivedProducts, category, subcategory, operator, exportedAt = new Date() }) {
  if (!inventory.timezone) throw new Error('Course timezone is not configured. Export requires a Course-local timestamp.');
  const time = formatPublishedAt(exportedAt, inventory.timezone);
  const filtered = category !== 'all' || subcategory !== 'all';
  const tally = inventory.daily_sales;
  const rows = [
    ['Fairway Refresh - displayed inventory view'],
    ['Scope', filtered ? 'FILTERED VIEW - NOT THE COMPLETE INVENTORY' : 'All active products'],
    ['Customer', inventory.customer_name || course.customer_name || course.customer_id, course.customer_id],
    ['Course', inventory.course_name || course.course_name, course.course_id],
    ['Exported at (Course local)', time, inventory.timezone],
    ['Selected operator', operator || 'Not selected'],
    ['Category filter', category === 'all' ? 'All categories' : category],
    ['Subcategory filter', subcategory === 'all' ? 'All subcategories' : subcategory],
    ['Archived section', archivedProducts.length ? 'Expanded - includes all displayed archived products, independent of active filters' : 'No archived products displayed'],
    ['Confirmed inventory revision', inventory.inventory_revision],
    ['Data', 'Last server-confirmed displayed data only; unsubmitted edits excluded. This is not an inventory audit or menu publication.'],
    [],
    ['Product', 'Category', 'Subcategory', 'Availability', 'Quantity', 'Archived'],
    ...[...products, ...archivedProducts].map(product => [
      product.name, product.category_name, product.subcategory_name,
      INVENTORY_STATE_LABELS[product.state], product.quantity ?? 0, product.archived === true ? 'Yes' : 'No',
    ]),
    [],
    ['Displayed daily sales - entire Course, not narrowed by inventory filters'],
    ['Course-local sales date', tally.local_date],
    ['Total units sold', tally.total_units],
    ['Cart stock units - all On Cart products', inventory.products.filter(product => !product.archived && product.state === 'on_cart').reduce((sum, product) => sum + (product.quantity ?? 0), 0)],
    ['Product', 'Units sold'],
    ...tally.products.map(product => [product.name, product.units]),
  ];
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
