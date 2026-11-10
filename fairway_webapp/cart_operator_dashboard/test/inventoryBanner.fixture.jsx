import React from 'react';
import { createRoot } from 'react-dom/client';
import InventoryApp from '../src/InventoryApp.jsx';
import '../src/styles.css';

const params = new URLSearchParams(location.search);
const long = params.has('long');
const courses = [
  { customer_id: 'TEST', course_id: 'A', customer_name: long ? 'An unusually long authorized Customer display name at a golf club' : 'Monarch Bay GC',
    course_name: long ? 'A very long championship Course name with multiple words' : 'Tony Lema Course', timezone: 'America/Los_Angeles' },
  { customer_id: 'TEST', course_id: 'B', customer_name: 'Synthetic Customer', course_name: 'Other Course', timezone: 'America/Los_Angeles' },
];
window.inventoryBannerCalls = [];
window.inventoryBannerActions = [];
window.fetch = async (input, options = {}) => {
  const url = new URL(input, location.origin);
  if (url.origin !== location.origin) throw new Error('External fixture request blocked');
  window.inventoryBannerCalls.push({ path: url.pathname, method: options.method || 'GET' });
  let data;
  if (url.pathname.endsWith('/staff')) data = { staff: [] };
  else if (url.pathname.endsWith('/shifts/session')) data = { shift: null };
  else if (/\/inventory\/courses\/TEST\/[AB]$/.test(url.pathname)) {
    const course = courses.find(item => url.pathname.endsWith(`/${item.course_id}`));
    data = { ...course, categories: [], products: [], inventory_revision: 0, daily_sales: { total_units: 0, products: [] } };
  } else throw new Error(`Unexpected fixture request: ${url.pathname}`);
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')).render(<InventoryApp
  user={{ uid: 'banner-test', email: long ? 'very.long.authorized.account.name.for.inventory@example.invalid' : 'operator@example.test',
    getIdToken: async () => 'synthetic-only' }}
  apiBaseUrl={location.origin} courses={params.has('single') ? courses.slice(0, 1) : courses}
  isAdmin={!params.has('ordinary')}
  onOpenAdmin={() => window.inventoryBannerActions.push('admin')}
  onSignOut={() => window.inventoryBannerActions.push('sign-out')}
/>);
