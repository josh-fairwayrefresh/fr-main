import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import OperatorApp from '../src/OperatorApp.jsx';
import '../src/styles.css';

const cart = {
  customer_id: 'CUST-0001', course_id: 'COURSE-0001', customer_name: 'Synthetic Monarch',
  course_name: 'Tony Lema Course', operation_kind: 'cart', timezone: 'America/Los_Angeles',
  service_state: { active: true },
};
const range = {
  ...cart, course_id: 'COURSE-0003', course_name: 'Driving Range',
  operation_kind: 'driving_range', service_state: { active: false, suspended: true },
};
const rejected = {
  id: 'rejected-service-suspended',
  ...range,
  source: 'nrf9151',
  device_label: 'Hole 7',
  location_label: 'Hole 7',
  status: 'rejected',
  rejection_reason: 'service_suspended',
  received_at: new Date('2026-10-29T18:00:00.000Z'),
};
const completed = {
  request_id: 'historical-completed',
  ...rejected,
  id: undefined,
  status: 'completed',
  completed_at: new Date('2026-10-29T18:10:00.000Z'),
};
const user = { uid: 'synthetic-operator', getIdToken: async () => 'synthetic-only' };

function AppFixture() {
  const [requests, setRequests] = useState(() => {
    const saved = localStorage.getItem('suspended-request-cleared');
    return saved === 'true' ? [] : [
      {
        id: 'accepted-request',
        ...cart,
        device_label: 'Hole 3',
        location_label: 'Hole 3',
        status: 'new',
        received_at: new Date('2026-10-29T17:00:00.000Z'),
      },
      rejected,
    ];
  });

  window.requestActions ||= [];
  window.fetch = async (input, options = {}) => {
    const url = new URL(input, location.origin);
    if (!url.pathname.endsWith('/dashboard')) {
      throw new Error(`Unexpected browser fixture request: ${url.pathname}`);
    }
    const selectedCourse = url.searchParams.get('course_id') === range.course_id ? range : cart;
    const history = selectedCourse === range ? [rejected, completed] : [completed];
    return new Response(JSON.stringify({
      courses: [selectedCourse],
      reports: Object.fromEntries(['daily', 'weekly', 'monthly'].map((period) => [period, {
        ...(selectedCourse === cart ? { summary: {
          completed_requests: 1, active_cart_hours: 1, average_completion_minutes: 10, requests_per_hour: 1,
        } } : {}),
        history,
      }])),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  return <OperatorApp
    user={user}
    apiBaseUrl={location.origin}
    inventoryApiBaseUrl=""
    operatorConfig={{ courses: [cart, range], notification_preferences: {} }}
    requests={requests}
    loadState="ready"
    loadError=""
    isAdmin={false}
    onRequestAction={async (request, action) => {
      window.requestActions.push({ requestId: request.id, action });
      if (action === 'clear-rejected') {
        localStorage.setItem('suspended-request-cleared', 'true');
        setRequests((current) => current.filter((item) => item.id !== request.id));
      }
    }}
  />;
}

createRoot(document.getElementById('root')).render(<AppFixture />);
