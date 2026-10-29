import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import OperatorApp from '../src/OperatorApp';
import InventoryApp from '../src/InventoryApp';
import { InventorySessionControls, useInventorySession } from '../src/InventorySession';

const user = { uid: 'session-test-user', email: 'session@example.invalid', getIdToken: async () => 'isolated-test-token' };
const courses = [
  { customer_id: 'TEST-C', course_id: 'TEST-A', customer_name: 'Test Customer', course_name: 'Cart A' },
  { customer_id: 'TEST-C', course_id: 'TEST-B', customer_name: 'Test Customer', course_name: 'Cart B' },
  { customer_id: 'TEST-C', course_id: 'TEST-R', customer_name: 'Test Customer', course_name: 'Range', operation_kind: 'driving_range' },
  { customer_id: 'TEST-D', course_id: 'TEST-D', customer_name: 'Other Customer', course_name: 'Other Cart' },
].map(course => ({ ...course, timezone: 'America/Los_Angeles', service_state: { active: true } }));
const root = createRoot(document.getElementById('root'));
let generation = 0;
const params = new URLSearchParams(location.search);
const probe = params.has('probe');
const selectedUser = params.has('other-account') ? { ...user, uid: 'other-test-user' } : user;

function SessionProbe() {
  const session = useInventorySession(selectedUser, location.origin, courses[0]);
  window.sessionActions = session;
  return <InventorySessionControls session={session} />;
}

function render() {
  if (probe) {
    flushSync(() => root.render(<SessionProbe key={generation} />));
  } else if (location.pathname === '/inventory') {
    root.render(<InventoryApp user={selectedUser} apiBaseUrl={location.origin}
      courses={courses.filter(course => course.operation_kind !== 'driving_range')} isAdmin />);
  } else {
    root.render(<OperatorApp user={selectedUser} apiBaseUrl={location.origin} inventoryApiBaseUrl={location.origin}
      operatorConfig={{ courses, notification_preferences: { 'TEST-C/TEST-A': true } }}
      requests={courses.map(course => ({ ...course, id: `request-${course.course_id}`, device_id: 'TEST-DEVICE',
        device_label: `${course.course_name} button`, status: 'new', received_at: new Date().toISOString() }))}
      loadState="ready" focusedRequestId={params.get('request_id')} isAdmin
      onRequestAction={async (request, action) => {
        const response = await fetch(`/api/v1/requests/${request.id}/${action}`, { method: 'POST' });
        if (!response.ok) throw new Error(await response.text());
      }} />);
  }
}
window.remountSession = () => { generation++; render(); };
render();
