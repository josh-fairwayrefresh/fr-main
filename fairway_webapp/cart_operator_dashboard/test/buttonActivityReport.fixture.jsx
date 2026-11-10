import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from '../src/admin/AdminApp.jsx';
import '../src/styles.css';

const customers = [
  { customer_id: 'CUST-0001', customer_name: 'Synthetic Monarch', courses: [
    { course_id: 'COURSE-0001', course_name: 'Cart Course', timezone: 'America/Los_Angeles' },
    { course_id: 'COURSE-0003', course_name: 'Driving Range', timezone: 'America/Los_Angeles' },
  ] },
  { customer_id: 'CUST-0002', customer_name: 'Placeholder Hills', courses: [
    { course_id: 'COURSE-0002', course_name: 'Placeholder Course', timezone: 'America/New_York' },
  ] },
];
window.reportCalls = [];
window.reportHold = false;
window.reportFailure = '';
window.reportPending = [];
window.releaseReports = () => window.reportPending.splice(0).forEach(resolve => resolve());
window.fetch = async (input, options = {}) => {
  const url = new URL(input, location.origin);
  window.reportCalls.push({ path: url.pathname, method: options.method || 'GET',
    body: options.body ? JSON.parse(options.body) : null, authorization: options.headers?.Authorization });
  if (url.pathname === '/api/v1/admin/fleet') return Response.json({ customers, devices: [] });
  if (url.pathname !== '/api/v1/admin/reports/button-activity') throw new Error(`Unexpected report fixture request: ${url.pathname}`);
  if (window.reportHold) await new Promise(resolve => window.reportPending.push(resolve));
  if (window.reportFailure) return Response.json({ error: window.reportFailure }, { status: 503 });
  return new Response('%PDF-1.3\nisolated-browser-download-fixture\n', { headers: { 'Content-Type': 'application/pdf' } });
};
createRoot(document.getElementById('root')).render(<AdminApp
  user={{ email: 'synthetic@example.test', getIdToken: async () => 'isolated-admin' }}
  apiBaseUrl={location.origin} onSignOut={() => {}} />);
