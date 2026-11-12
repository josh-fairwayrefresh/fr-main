import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminApp from '../src/admin/AdminApp.jsx';
import '../src/styles.css';

const customers = [{
  customer_id: 'CUST-TEST', customer_name: 'Onboarding fixture Customer', comments: null,
  courses: [{
    course_id: 'COURSE-TEST', course_name: 'Existing Course', timezone: 'America/Los_Angeles',
    operation_kind: 'cart', comments: null, course_location: null,
  }],
}];
const users = [
  { uid: 'admin-uid', email: 'admin@fairwayrefresh.com', disabled: false, status: 'PROVISIONED',
    authorization: { admin: true, customer_id: null, course_ids: [] } },
];
let nextCourse = 100;
let nextUser = 1;
window.onboardingCalls = [];

function failure(status, error) {
  return Response.json({ error }, { status });
}

window.fetch = async (input, options = {}) => {
  const path = new URL(input, location.origin).pathname;
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  window.onboardingCalls.push({ path, method, body });
  if (method === 'GET' && path === '/api/v1/admin/fleet') return Response.json({ customers, devices: [] });
  if (method === 'GET' && path.endsWith('/staff')) return Response.json({ staff: [] });
  if (method === 'GET' && path === '/api/v1/admin/users') {
    return Response.json({ users, complete: true, next_page_token: null });
  }
  const courseCreate = path.match(/^\/api\/v1\/admin\/customers\/([^/]+)\/courses$/);
  if (method === 'POST' && courseCreate) {
    if (!['cart', 'driving_range'].includes(body.operation_kind)) return failure(400, 'Invalid Course operation kind');
    nextCourse += 1;
    const course = { course_id: `COURSE-${nextCourse}`, course_location: null, ...body };
    customers.find((customer) => customer.customer_id === courseCreate[1]).courses.push(course);
    return Response.json(course, { status: 201 });
  }
  const coursePatch = path.match(/^\/api\/v1\/admin\/customers\/([^/]+)\/courses\/([^/]+)$/);
  if (method === 'PATCH' && coursePatch) {
    if (Object.hasOwn(body, 'operation_kind')) return failure(400, 'operation_kind is immutable');
    const course = customers[0].courses.find((item) => item.course_id === coursePatch[2]);
    Object.assign(course, { ...body, course_location: null });
    return Response.json(course);
  }
  if (method === 'POST' && path === '/api/v1/admin/users') {
    const email = `${body.username}@fairwayrefresh.com`;
    if (users.some((item) => item.email === email)) return failure(409, 'user_already_exists');
    const created = {
      uid: `created-${nextUser++}`, email, disabled: false, status: 'PROVISIONED',
      authorization: { admin: body.admin, customer_id: body.customer_id, course_ids: body.course_ids },
    };
    users.push(created);
    return Response.json({ uid: created.uid, email, disabled: false, authorization: created.authorization }, { status: 201 });
  }
  const userAction = path.match(/^\/api\/v1\/admin\/users\/([^/]+)\/(password|status|access)$/);
  if (method === 'PUT' && userAction) {
    const target = users.find((item) => item.uid === decodeURIComponent(userAction[1]));
    if (userAction[2] === 'status') {
      target.disabled = body.disabled;
      return Response.json({ uid: target.uid, disabled: body.disabled });
    }
    if (userAction[2] === 'password') return Response.json({ uid: target.uid, password_reset: true, sessions_revoked: true });
    target.authorization = body;
    return Response.json({ uid: target.uid, authorization: body });
  }
  throw new Error(`Unexpected onboarding fixture request: ${method} ${path}`);
};

createRoot(document.getElementById('root')).render(<AdminApp
  user={{ uid: 'admin-uid', email: 'admin@fairwayrefresh.com', getIdToken: async () => 'local-only' }}
  apiBaseUrl={location.origin} onSignOut={() => {}} />);
