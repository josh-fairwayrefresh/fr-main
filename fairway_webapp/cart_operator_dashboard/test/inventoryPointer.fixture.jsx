import React from 'react';
import { createRoot } from 'react-dom/client';
import InventoryApp from '../src/InventoryApp';

const course = { customer_id: 'POINTER-C', course_id: 'POINTER-U', customer_name: 'Pointer Customer', course_name: 'Pointer Course', timezone: 'America/Los_Angeles' };
const initial = [
  { product_id: 'drag', name: 'Pointer Water', category_id: 'drinks', category_name: 'Drinks', state: 'on_cart', quantity: 5, stock_revision: 0 },
  ...Array.from({ length: 5 }, (_, i) => ({ product_id: `filler-${i}`, name: `Stock ${i}`, category_name: 'Drinks', category_id: 'drinks', state: 'on_cart', quantity: 1, stock_revision: 0 })),
];
const read = () => JSON.parse(localStorage.getItem('pointer-data') || 'null') || { products: initial, revision: 0, writes: [], shift: null };
const staff = [{ staff_id: 'operator', name: 'Pointer Operator', role: 'cart_operator', active: true }];
globalThis.pointerFixtureId = Math.random();
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.pointerEvidence = [];
for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
  document.addEventListener(type, event => globalThis.pointerEvidence.push({ type, trusted: event.isTrusted, pointerType: event.pointerType }), true);
}
window.fetch = async (url, options = {}) => {
  const route = new URL(url, location.origin).pathname;
  const body = options.body ? JSON.parse(options.body) : {};
  const data = read();
  if (route.endsWith('/staff')) return response({ staff });
  if (route.endsWith('/shifts/session')) return response({ shift: data.shift });
  if (route.endsWith('/shifts/select')) {
    data.shift = { shift_id: 'pointer-shift', staff_id: 'operator', staff_name: 'Pointer Operator', has_activity: false };
    localStorage.setItem('pointer-data', JSON.stringify(data));
    return response({ shift: data.shift });
  }
  if (route.endsWith('/stock')) {
    if (!data.shift || body.shift_id !== data.shift.shift_id) return response({ message: 'Missing attribution' }, 400);
    const product = data.products.find(p => route.includes(`/products/${p.product_id}/`));
    if (body.expected_stock_revision !== product.stock_revision) return response({ message: 'Stock changed' }, 409);
    if (body.state === 'on_cart') product.quantity = body.quantity;
    product.state = body.state; product.stock_revision++; data.revision++; data.shift.has_activity = true;
    data.writes.push(body);
    localStorage.setItem('pointer-data', JSON.stringify(data));
    return response(product);
  }
  if (route.endsWith('/POINTER-U')) return response({
    ...course, products: data.products, inventory_revision: data.revision, categories: [{ category_id: 'drinks', name: 'Drinks', subcategories: [] }],
    daily_sales: { local_date: '2026-10-23', total_units: 0, products: [] },
  });
  throw new Error(`Unexpected pointer fixture route ${route}`);
};
createRoot(document.getElementById('root')).render(<InventoryApp
  user={{ uid: 'pointer-user', getIdToken: async () => 'pointer-token' }} apiBaseUrl={location.origin}
  courses={[course]} onSignOut={() => {}}
/>);
