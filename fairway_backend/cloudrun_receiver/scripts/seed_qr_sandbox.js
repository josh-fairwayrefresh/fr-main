'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { Firestore } = require('@google-cloud/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { GoogleAuth, OAuth2Client } = require('google-auth-library');
const { resolveSandboxEnvironment } = require('../lib/environment');
const { createCustomer } = require('../lib/fleet/customers');
const { createCourse } = require('../lib/fleet/courses');

async function main() {
  const { projectId } = resolveSandboxEnvironment();
  if (projectId === 'fairway-refresh-sandbox-260930') throw new Error('Inventory sandbox is protected');
  const output = process.argv[2];
  if (!output) throw new Error('A private output file path is required');
  const token = process.env.FAIRWAY_TOOL_ACCESS_TOKEN;
  const client = new OAuth2Client();
  if (token) client.setCredentials({ access_token: token });
  const db = new Firestore({ projectId, ...(token ? { auth: new GoogleAuth({ authClient: client, projectId }) } : {}) });
  const existing = await db.collection('customers').get();
  if (existing.size > 1 || (!existing.empty &&
      existing.docs[0].data().comments !== 'Synthetic only. Not Monarch production.')) {
    throw new Error('Seed refuses a sandbox containing unrelated fixtures');
  }
  if (fs.existsSync(output) || !(await db.collection('qr_bays').limit(1).get()).empty) {
    throw new Error('Completed fixtures already exist; refusing to replace permanent bay identities');
  }
  const customer = existing.empty ? await createCustomer(db, {
    customerName: 'SYNTHETIC QR Review Club', comments: 'Synthetic only. Not Monarch production.',
  }) : { customer_id: existing.docs[0].id };
  const courses = await db.collection('customers').doc(customer.customer_id).collection('courses').get();
  const existingCart = courses.docs.find((doc) => doc.data().operation_kind === 'cart');
  const existingRange = courses.docs.find((doc) => doc.data().operation_kind === 'driving_range');
  const cart = existingCart ? { course_id: existingCart.id } : await createCourse(db, {
    customerId: customer.customer_id, courseName: 'TEST Cart Course', timezone: 'America/Los_Angeles',
  });
  const range = existingRange ? { course_id: existingRange.id } : await createCourse(db, {
    customerId: customer.customer_id, courseName: 'TEST Driving Range',
    timezone: 'America/Los_Angeles', operationKind: 'driving_range',
  });
  const batch = db.batch();
  const bays = Array.from({ length: 26 }, (_, index) => ({
    id: crypto.randomBytes(18).toString('base64url'), bay_number: index + 1,
  }));
  for (const bay of bays) {
    batch.set(db.collection('qr_bays').doc(bay.id), {
      customer_id: customer.customer_id, course_id: range.course_id,
      bay_number: bay.bay_number, enabled: true, active_request_id: null,
    });
  }
  initializeApp({ projectId, ...(token ? { credential: {
    getAccessToken: async () => ({ access_token: token, expires_in: 1800 }),
  } } : {}) });
  const password = crypto.randomBytes(24).toString('base64url');
  const email = 'qr-review@example.test';
  let operator;
  if (token) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': projectId },
      body: JSON.stringify({ email, password, displayName: 'Synthetic QR Review Operator' }),
    });
    if (!response.ok) throw new Error(`Synthetic account creation failed (${response.status}): ${await response.text()}`);
    operator = { uid: (await response.json()).localId };
  } else {
    operator = await getAuth().createUser({ email, password, displayName: 'Synthetic QR Review Operator' });
  }
  batch.set(db.collection('user_access').doc(operator.uid), {
    schema_version: 2, admin: false, customer_id: customer.customer_id,
    course_ids: [cart.course_id, range.course_id],
  });
  await batch.commit();
  fs.writeFileSync(output, JSON.stringify({
    projectId, customer_id: customer.customer_id, cart_course_id: cart.course_id,
    range_course_id: range.course_id, operator_uid: operator.uid, email, password, bays,
  }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ projectId, synthetic_only: true, bays: bays.length, privateOutput: output }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
