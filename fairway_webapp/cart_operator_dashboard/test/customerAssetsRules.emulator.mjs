import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, query, setDoc, terminate, where } from 'firebase/firestore';

const projectId = 'fairway-refresh-sandbox-customer-assets';
const host = '127.0.0.1:8799';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, host, 'Only the isolated local emulator is permitted');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, projectId);
const base = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;
const apps = [];

function value(input) {
  if (input === null) return { nullValue: null };
  if (typeof input === 'string') return { stringValue: input };
  if (typeof input === 'boolean') return { booleanValue: input };
  if (Number.isSafeInteger(input)) return { integerValue: String(input) };
  if (Array.isArray(input)) return { arrayValue: { values: input.map(value) } };
  throw new Error('Unsupported emulator fixture value');
}

async function seed(path, fields) {
  const response = await fetch(`${base}/${path}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, value(input)])) }),
  });
  assert.equal(response.status, 200, await response.text());
}

function client(uid) {
  const app = initializeApp({ projectId, apiKey: 'synthetic-local-test' }, uid || 'anonymous');
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8799, uid ? { mockUserToken: { sub: uid } } : {});
  apps.push({ app, db });
  return db;
}

const denied = action => assert.rejects(action, error => error.code === 'permission-denied');
try {
  await seed('customers/customer/services/service', { course_id: 'service' });
  await seed('requests/own', { customer_id: 'customer', course_id: 'service' });
  await seed('requests/other-service', { customer_id: 'customer', course_id: 'other-service' });
  await seed('requests/foreign', { customer_id: 'foreign', course_id: 'service' });
  const access = { schema_version: '3', admin: false, customer_id: 'customer', menu_ids: [], service_ids: [] };
  async function seedAccess(uid, record) {
    const { schema_version, ...fields } = record;
    const response = await fetch(`${base}/user_access/${uid}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ fields: {
        ...Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, value(input)])),
        schema_version: { integerValue: schema_version },
      } }),
    });
    assert.equal(response.status, 200, await response.text());
  }
  await seedAccess('empty', access);
  await seedAccess('menu-only', { ...access, menu_ids: ['cart'] });
  await seedAccess('service-user', { ...access, service_ids: ['service'] });
  await seedAccess('missing-service', { ...access, service_ids: ['other-service'] });
  await seedAccess('admin', { ...access, admin: true, customer_id: null });
  await seedAccess('legacy', { schema_version: '2', admin: false, customer_id: 'customer', course_ids: ['service'] });

  for (const uid of [null, 'empty', 'menu-only', 'missing-service']) {
    await denied(getDoc(doc(client(uid), 'requests', uid === 'missing-service' ? 'other-service' : 'own')));
  }
  const service = client('service-user');
  assert.equal((await getDoc(doc(service, 'requests', 'own'))).exists(), true);
  await denied(getDoc(doc(service, 'requests', 'other-service')));
  await denied(getDoc(doc(service, 'requests', 'foreign')));
  const allowedQuery = query(collection(service, 'requests'),
    where('customer_id', '==', 'customer'), where('course_id', 'in', ['service']));
  assert.equal((await getDocs(allowedQuery)).size, 1);
  await denied(setDoc(doc(service, 'requests', 'own'), { status: 'completed' }));
  await denied(getDoc(doc(service, 'customers', 'customer')));
  assert.equal((await getDoc(doc(client('admin'), 'requests', 'foreign'))).exists(), true);
  const legacy = client('legacy');
  assert.equal((await getDoc(doc(legacy, 'requests', 'own'))).exists(), true);
  await seed('customers/customer', { authorization_schema_version: 3 });
  await denied(getDoc(doc(legacy, 'requests', 'own')));
  console.log('PASS: actual Firestore rules preserve legacy access, explicit service grants, Customer isolation and backend-only writes; menu-only/empty/missing grants denied.');
} finally {
  await Promise.all(apps.map(async ({ app, db }) => { await terminate(db); await deleteApp(app); }));
}
