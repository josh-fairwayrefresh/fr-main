import React from 'react';
import { createRoot } from 'react-dom/client';
import OperatorApp from '../src/OperatorApp.jsx';
import '../src/styles.css';

const cart = { customer_id: 'CUST-0001', course_id: 'COURSE-0001', customer_name: 'Synthetic Monarch',
  course_name: 'Tony Lema', operation_kind: 'cart', timezone: 'America/Los_Angeles', service_state: { active: true } };
const range = { ...cart, course_id: 'COURSE-0003', course_name: 'Driving Range',
  operation_kind: 'driving_range', service_state: { active: false, suspended: true } };
const user = { uid: 'synthetic-operator', getIdToken: async () => 'isolated-test-only' };
window.releaseCalls = [];
window.fetch = async (input, options = {}) => {
  const url = new URL(input, location.origin);
  window.releaseCalls.push({ path: url.pathname, method: options.method || 'GET' });
  let data;
  if (url.pathname.endsWith('/dashboard')) {
    const course = url.searchParams.get('course_id') === range.course_id ? range : cart;
    data = { courses: [course], reports: Object.fromEntries(['daily', 'weekly', 'monthly'].map(period =>
      [period, { ...(course === cart ? { summary: {} } : {}), history: [] }])) };
  } else if (url.pathname.endsWith('/staff')) {
    data = { staff: [{ staff_id: 'alex', name: 'Alex', active: true, role: 'cart_operator', course_ids: [cart.course_id] }] };
  } else if (url.pathname.endsWith('/shifts/session')) {
    data = { shift: null };
  } else throw new Error(`Unexpected release fixture request: ${url.pathname}`);
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')).render(<OperatorApp
  user={user} apiBaseUrl={location.origin} inventoryApiBaseUrl={location.origin}
  operatorConfig={{ courses: [cart, range], notification_preferences: { 'CUST-0001/COURSE-0001': true, 'CUST-0001/COURSE-0003': false } }}
  requests={[
    { ...cart, id: 'cart-request', device_label: 'Hole 7', status: 'new', received_at: new Date().toISOString() },
    { ...range, id: 'range-request', source: 'qr', bay_number: 9, bay_side: 'A', location_label: 'Bay 9A', status: 'new', received_at: new Date().toISOString() },
  ]}
  loadState="ready" loadError="" isAdmin={false} onRequestAction={async () => {}}
/>);
