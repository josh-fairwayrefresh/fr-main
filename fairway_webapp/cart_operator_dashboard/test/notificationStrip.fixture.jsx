import React from 'react';
import { createRoot } from 'react-dom/client';
import NotificationSetup from '../src/NotificationSetup.jsx';
import '../src/styles.css';
import '../src/operator.css';

const params = new URLSearchParams(location.search);
window.notificationCalls = [];
window.notificationPending = [];
window.notificationFailure = false;
let permission = params.get('permission') || 'granted';
const subscription = { toJSON: () => ({ endpoint: 'https://synthetic.invalid/push' }) };
const registration = { pushManager: {
  getSubscription: async () => subscription,
  subscribe: async () => subscription,
} };
if (!params.has('unsupported')) {
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} });
  Object.defineProperty(window, 'Notification', { configurable: true, value: {
    get permission() { return permission; },
    requestPermission: async () => {
      window.notificationCalls.push({ permission: true });
      return permission;
    },
  } });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
    register: async () => registration, ready: Promise.resolve(registration),
  } });
} else {
  delete window.PushManager;
}
Object.defineProperty(navigator, 'standalone', { configurable: true, value: !params.has('uninstalled') });
window.fetch = async (input, options) => {
  const url = new URL(input);
  if (url.origin !== location.origin) throw new Error('External fixture request blocked');
  window.notificationCalls.push({ path: url.pathname, method: options.method, body: JSON.parse(options.body) });
  return new Response(window.notificationFailure ? 'Synthetic preference failure' : '{}',
    { status: window.notificationFailure ? 503 : 200 });
};
const courses = [
  { customer_id: 'TEST', course_id: 'A', course_name: 'Tony Lema Course' },
  { customer_id: 'TEST', course_id: 'B', course_name: 'Driving Range' },
];
if (params.has('long')) {
  courses[0].course_name = 'A very long authorized championship Course name without losing access to its checkbox';
  courses.push(...Array.from({ length: 5 }, (_, i) => ({
    customer_id: 'TEST', course_id: `EXTRA${i}`, course_name: `Additional authorized Course ${i}`,
  })));
}
createRoot(document.getElementById('root')).render(<main className="operator-app">
  <div className="op-notifications"><NotificationSetup
    user={{ getIdToken: async () => 'synthetic-only' }}
    apiBaseUrl={location.origin}
    operatorConfig={{ courses, notification_preferences: { 'TEST/A': true },
      push: params.has('unconfigured') ? {} : { vapid_public_key: 'AQID' } }}
    onMutationPending={pending => window.notificationPending.push(pending)}
  /></div>
</main>);
