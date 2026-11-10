import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import OperatorApp from '../src/OperatorApp';
import InventoryApp from '../src/InventoryApp';
import AdminApp from '../src/admin/AdminApp';
import { AccountSignOutProvider, useAccountSignOut } from '../src/AccountSignOut';
import '../src/styles.css';

const user = { uid: 'workflow-test', email: 'workflow@example.invalid', getIdToken: async () => 'synthetic-only' };
const courses = [
  { customer_id: 'TEST-C', course_id: 'A', customer_name: 'Test Customer', course_name: 'Cart A', timezone: 'America/Los_Angeles' },
  { customer_id: 'TEST-C', course_id: 'B', customer_name: 'Test Customer', course_name: 'Cart B', timezone: 'America/Los_Angeles' },
  { customer_id: 'TEST-C', course_id: 'R', customer_name: 'Test Customer', course_name: 'Range', operation_kind: 'driving_range' },
  { customer_id: 'TEST-D', course_id: 'A', customer_name: 'Other Customer', course_name: 'Other Cart', timezone: 'America/Los_Angeles' },
];

function Fixture() {
  const signOut = useAccountSignOut();
  const [requests, setRequests] = useState(() => ['one', 'two'].map(id => ({
    ...courses[0], id, status: 'new', device_label: `Test button ${id}`, received_at: new Date().toISOString(),
  })));
  if (location.pathname === '/inventory') return <InventoryApp user={user} apiBaseUrl={location.origin}
    courses={courses.filter(course => course.operation_kind !== 'driving_range')} isAdmin
    onOpenAdmin={() => location.assign('/admin')} onSignOut={signOut} />;
  if (location.pathname === '/admin') return <AdminApp user={user} apiBaseUrl={location.origin} onSignOut={signOut} />;
  return <OperatorApp user={user} apiBaseUrl={location.origin} inventoryApiBaseUrl={location.origin}
    operatorConfig={{ courses, notification_preferences: {} }} isAdmin canManageInventory
    onOpenAdmin={() => location.assign('/admin')} onSignOut={signOut}
    requests={requests}
    loadState="ready" loadError="" onRequestAction={async (request, action) => {
      const response = await fetch(`/api/v1/requests/${request.id}/${action}`, { method: 'POST' });
      if (!response.ok) throw new Error('Synthetic request action failed');
      setRequests(previous => previous.filter(item => item.id !== request.id));
    }} />;
}

window.testSignOuts = 0;
createRoot(document.getElementById('root')).render(<AccountSignOutProvider getUser={() => user}
  apiBaseUrl={location.origin} onSignOut={async () => { window.testSignOuts++; }}>
  <Fixture />
</AccountSignOutProvider>);
