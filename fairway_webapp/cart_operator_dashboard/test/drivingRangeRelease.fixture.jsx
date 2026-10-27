import React from 'react';
import { createRoot } from 'react-dom/client';
import OperatorApp from '../src/OperatorApp.jsx';
import '../src/styles.css';

const cart = { customer_id: 'CUST-0001', course_id: 'COURSE-0001', customer_name: 'Synthetic Monarch',
  course_name: 'Tony Lema', operation_kind: 'cart', timezone: 'America/Los_Angeles', service_state: { active: true } };
const range = { ...cart, course_id: 'COURSE-0003', course_name: 'Driving Range',
  operation_kind: 'driving_range', service_state: { active: false, suspended: true } };
const placeholder = { ...cart, customer_id: 'CUST-0002', customer_name: 'Placeholder Hills',
  course_id: 'COURSE-0002', course_name: 'Test Links 18' };
const admin = new URLSearchParams(location.search).get('admin') === '1';
const courses = admin ? [cart, range, placeholder] : [cart, range];
const user = { uid: 'synthetic-operator', getIdToken: async () => 'isolated-test-only' };
window.releaseCalls = [];
window.heldPaths = [];
window.pendingResponses = [];
window.releaseResponses = () => window.pendingResponses.splice(0).forEach(resolve => resolve());
window.fetch = async (input, options = {}) => {
  const url = new URL(input, location.origin);
  window.releaseCalls.push({ path: url.pathname, search: url.search, method: options.method || 'GET', body: options.body });
  if (window.heldPaths.some(path => url.pathname.endsWith(path))) await new Promise(resolve => window.pendingResponses.push(resolve));
  let data;
  if (url.pathname.endsWith('/dashboard')) {
    const course = courses.find(course => course.course_id === url.searchParams.get('course_id')) || cart;
    data = { courses: [course], reports: Object.fromEntries(['daily', 'weekly', 'monthly'].map(period =>
      [period, { ...(course !== range ? { summary: {} } : {}), history: [{
        request_id: course.course_id + '-closed', location_label: course.course_name + ' history',
        status: 'completed', received_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      }] }])) };
  } else if (url.pathname.endsWith('/staff')) {
    data = { staff: [{ staff_id: 'alex', name: 'Alex', active: true, role: 'cart_operator', course_ids: [cart.course_id] }] };
  } else if (url.pathname.endsWith('/shifts/session')) {
    data = { shift: null };
  } else if (url.pathname.endsWith('/shifts/select')) {
    data = { shift: { shift_id: 'isolated-shift', staff_id: 'alex', staff_name: 'Alex' } };
  } else if (/\/service\/(resume|suspend)$/.test(url.pathname) || url.pathname.endsWith('/notification-preferences')) {
    data = {};
  } else throw new Error(`Unexpected release fixture request: ${url.pathname}`);
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')).render(<OperatorApp
  user={user} apiBaseUrl={location.origin} inventoryApiBaseUrl={location.origin}
  operatorConfig={{ courses, notification_preferences: { 'CUST-0001/COURSE-0001': true, 'CUST-0001/COURSE-0003': false,
    ...(admin ? { 'CUST-0002/COURSE-0002': true } : {}) } }}
  requests={[
    { ...cart, id: 'cart-request', device_label: 'Hole 7', status: 'new', received_at: new Date().toISOString() },
    { ...range, id: 'range-request', source: 'qr', bay_number: 9, bay_side: 'A', location_label: 'Bay 9A', status: 'new', received_at: new Date().toISOString() },
    ...(admin ? [{ ...placeholder, id: 'placeholder-request', device_label: 'Placeholder marker', status: 'new', received_at: new Date().toISOString() }] : []),
  ]}
  loadState="ready" loadError="" isAdmin={admin} onRequestAction={async () => {
    window.releaseCalls.push({ path: '/isolated-request-action', method: 'POST' });
    await new Promise(resolve => window.pendingResponses.push(resolve));
  }}
/>);
