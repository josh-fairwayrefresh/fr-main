import React from 'react';
import { createRoot } from 'react-dom/client';
import OperatorApp from '../src/OperatorApp.jsx';
import '../src/styles.css';

const course = {
  customer_id: 'CUST-0001',
  course_id: 'COURSE-0001',
  customer_name: 'Synthetic Customer',
  course_name: 'Synthetic Course',
  operation_kind: 'cart',
  timezone: 'America/Los_Angeles',
  service_state: { active: true },
};
const request = {
  request_id: 'request-1',
  customer_id: course.customer_id,
  course_id: course.course_id,
  device_label: 'Bay 1A',
  location_label: 'Bay 1A',
  status: 'completed',
  received_at: new Date('2026-10-29T18:00:00.000Z'),
  completed_at: new Date('2026-10-29T18:10:00.000Z'),
};
const excludedRequests = [];
const user = { uid: 'synthetic-admin', getIdToken: async () => 'synthetic-only' };

window.reportingActions = [];
window.fetch = async (input, options = {}) => {
  const url = new URL(input, location.origin);
  if (url.pathname.endsWith('/dashboard')) {
    const history = isAdmin && excludedRequests.length ? [] : [request];
    return new Response(JSON.stringify({
      courses: [course],
      reports: Object.fromEntries(['daily', 'weekly', 'monthly'].map((period) => [period, {
        summary: {
          completed_requests: history.length,
          active_cart_hours: 2,
          average_completion_minutes: history.length ? 10 : 0,
          requests_per_hour: history.length ? 0.5 : 0,
        },
        history,
      }])),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.pathname.endsWith('/api/v1/admin/requests/excluded') && options.method !== 'PATCH') {
    return new Response(JSON.stringify(excludedRequests), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (url.pathname.endsWith('/reporting-state') && options.method === 'PATCH') {
    const body = JSON.parse(options.body);
    window.reportingActions.push({ requestId: url.pathname.split('/').at(-2), ...body });
    if (body.reporting_state === 'excluded') {
      excludedRequests.splice(0, excludedRequests.length, { ...request, id: request.request_id });
    } else {
      excludedRequests.splice(0);
    }
    return new Response(JSON.stringify({ changed: true, reporting_state: body.reporting_state }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  throw new Error(`Unexpected request in reporting fixture: ${url.pathname}`);
};

const isAdmin = !new URLSearchParams(location.search).has('operator');
createRoot(document.getElementById('root')).render(<OperatorApp
  user={user}
  apiBaseUrl={location.origin}
  adminApiBaseUrl={location.origin}
  inventoryApiBaseUrl=""
  operatorConfig={{ courses: [course], notification_preferences: {} }}
  requests={[]}
  loadState="ready"
  loadError=""
  isAdmin={isAdmin}
  onRequestAction={async () => {}}
/>);
