import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from '../src/admin/AdminApp.jsx';
import '../src/styles.css';

const customers = [{
  customer_id: 'CUST-TEST', customer_name: 'Local alignment fixture',
  courses: [{ course_id: 'COURSE-TEST', course_name: 'Local course', timezone: 'America/Los_Angeles' }],
}];
const device = {
  device_id: 'FRB-9001', state: 'maintenance',
  customer_id: 'CUST-TEST', course_id: 'COURSE-TEST',
  customer_name: 'Legacy placement', course_name: 'Not an active deployment',
  location: { type: 'hole', hole: 2 }, service_group: 'on_course',
};
window.alignmentCalls = [];
window.fetch = async (input, options = {}) => {
  const path = new URL(input, location.origin).pathname;
  const body = options.body ? JSON.parse(options.body) : null;
  window.alignmentCalls.push({ path, method: options.method || 'GET', body });
  if (path === '/api/v1/admin/fleet') return Response.json({ customers, devices: [device] });
  if (path === '/api/v1/admin/ota/releases') return Response.json({ releases: [] });
  if (path === '/api/v1/admin/ota/fleet') return Response.json({
    customers, devices: [{ ...device, eligible: false, reason: 'Local fixture: no approved release' }],
    headquarters_timezone: 'America/Los_Angeles',
  });
  if (path === '/api/v1/admin/ota/deployments') return Response.json({ deployments: [], devices: [] });
  if (path === '/api/v1/admin/devices/FRB-9001/state' && options.method === 'PATCH') {
    Object.assign(device, body);
    return Response.json({ device });
  }
  throw new Error(`Unexpected alignment fixture request: ${options.method || 'GET'} ${path}`);
};
createRoot(document.getElementById('root')).render(<AdminApp
  user={{ email: 'alignment@example.test', getIdToken: async () => 'local-only' }}
  apiBaseUrl={location.origin} onSignOut={() => {}} />);
