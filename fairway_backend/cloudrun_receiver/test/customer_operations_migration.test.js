'use strict';

process.env.FAIRWAY_OPERATIONAL_STORAGE = 'customer';
const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const migration = require('../lib/customer_operations_migration');
const storage = require('../lib/operational_storage');
const inventory = require('../lib/inventory');
const { requireService, resolveCourseServiceState } = require('../lib/course_service');
const { getUserAccess, resolveAuthorizedCourses } = require('../lib/user_access');
const { publicBay, acceptQrRequest } = require('../lib/qr_requests');
const { transitionRequest } = require('../lib/request_lifecycle');
const { generateButtonReport } = require('../lib/button_activity_report');
const menus = require('../lib/customer_menus');
const { publicMenu } = require('../lib/restaurant_catalog');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const { createFairwayHandlers } = require('../index');
const { dispatchRequestNotifications } = require('../lib/notification_dispatch');
const { listExcludedRequests, setRequestReportingState } = require('../lib/request_reporting');

async function fixture() {
  const db = new FakeFirestore();
  const customer = db.collection('customers').doc('synthetic');
  await customer.set({ customer_name: 'Synthetic', operational_storage: { state: 'legacy' } });
  const course = customer.collection('courses').doc('cart');
  await course.set({ course_name: 'Synthetic Course', timezone: 'America/Los_Angeles',
    operation_kind: 'cart', service_suspension: { suspended_by: 'staff', suspended_at: new Date(0) },
    on_premise_service: { active: true } });
  await course.collection('inventory_products').doc('water').set({
    name: 'Water', category_name: 'Drinks', category_id: 'drinks', quantity: 7,
    state: 'on_cart', stock_revision: 2, archived: false,
  });
  await course.collection('inventory_categories').doc('drinks').collection('subcategories')
    .doc('cold').set({ name: 'Cold' });
  await course.collection('inventory').doc('state').set({ inventory_revision: 11 });
  await course.collection('inventory_shifts').doc('shift').set({ status: 'active', staff_id: 'staff', staff_name: 'Pat' });
  await course.collection('inventory_operations').doc('operation').set({ result: { quantity: 7 }, actor_uid: 'operator' });
  await course.collection('service_events').doc('suspend').set({ type: 'suspended', recorded_at: new Date(0) });
  await course.collection('service_days').doc('2026-11-15').set({ source: 'reviewed_correction', start: 8, end: 17 });
  await course.collection('sales_days').doc('2026-11-15').set({ source: 'paper_record', total_minor: 9000 });
  await customer.collection('menus').doc('cart-menu').set({
    type: 'cart', asset_id: 'cart', name: 'cart', state: 'active',
    slug: 'synthetic_cart', aliases: ['synthetic-original-cart'], branding: {},
  });
  for (const slug of ['synthetic_cart', 'synthetic-original-cart']) {
    await db.collection('public_menu_slugs').doc(slug).set({ customer_id: customer.id, menu_id: 'cart-menu' });
  }
  await db.collection('user_access').doc('operator').set({
    schema_version: 2, admin: false, customer_id: customer.id, course_ids: ['cart'],
  });
  await db.collection('requests').doc('existing').set({
    customer_id: customer.id, course_id: 'cart', status: 'new', source: 'qr', bay_id: 'bay',
  });
  const plan = await migration.prepare(db, customer.id);
  return { db, customer, course, plan };
}

const evidence = { migrationId: 'local-test', backupEvidence: 'verified-local-fixture-backup',
  quiescenceEvidence: 'synthetic-writers-drained' };

test('migration preserves nested identities, stock, attribution, history and independent grants', async () => {
  const f = await fixture();
  await assert.rejects(storage.assertOwner(f.db, f.customer.id), /unavailable/);
  await migration.begin(f.db, f.plan, evidence);
  await assert.rejects(inventory.listInventory(f.db, f.customer.id, 'cart'), /unavailable/);
  await migration.resume(f.db, f.plan, evidence.migrationId);
  await migration.verify(f.db, f.plan);
  const asset = f.customer.collection('assets').doc('cart');
  assert.equal((await asset.collection('inventory_products').doc('water').get()).data().quantity, 7);
  assert.equal((await asset.collection('inventory_categories').doc('drinks').collection('subcategories').doc('cold').get()).data().name, 'Cold');
  assert.deepEqual((await asset.collection('sales_days').doc('2026-11-15').get()).data(),
    (await f.course.collection('sales_days').doc('2026-11-15').get()).data());
  assert.equal((await asset.get()).data().service_id, 'cart');
  assert.equal((await asset.get()).data().service_suspension, undefined);
  assert.equal(resolveCourseServiceState(await requireService(f.db, f.customer.id, 'cart')).suspended, true);
  const access = await getUserAccess(f.db, 'operator');
  assert.deepEqual(access.menu_ids, ['cart-menu']);
  assert.deepEqual(access.service_ids, ['cart']);
  const directory = await resolveAuthorizedCourses(f.db, access);
  assert.equal(directory[0].service_id, 'cart');
  await f.course.update({ service_suspension: null });
  assert.equal(resolveCourseServiceState(await requireService(f.db, f.customer.id, 'cart')).suspended, true);
  assert.equal((await inventory.listInventory(f.db, f.customer.id, 'cart')).products[0].quantity, 7);
  assert.equal((await menus.bootstrap(f.db, 'operator')).customers[0].menus[0].asset_id, 'cart');
  for (const slug of ['synthetic_cart', 'synthetic-original-cart']) {
    const publicView = await publicMenu(f.db, slug);
    assert.equal(publicView.menu_id, 'cart-menu');
    assert.equal(publicView.products[0].name, 'Water');
    assert.equal('quantity' in publicView.products[0], false);
  }
  const qr = await menus.qr(f.db, f.customer.id, 'cart-menu', 'png');
  const image = PNG.sync.read(qr.data);
  assert.equal(jsQR(new Uint8ClampedArray(image.data), image.width, image.height).data,
    'https://app.fairwayrefresh.com/cartmenus/synthetic_cart');
});

test('repeat and forward recovery never overwrite intervening Customer activity or reactivate legacy', async () => {
  const f = await fixture();
  await migration.begin(f.db, f.plan, evidence);
  await migration.begin(f.db, f.plan, evidence);
  await migration.resume(f.db, f.plan, evidence.migrationId);
  const live = storage.inventoryRef(f.db, f.customer.id, 'cart').collection('inventory_products').doc('water');
  await live.update({ quantity: 3, stock_revision: 3 });
  assert.equal((await migration.resume(f.db, f.plan, evidence.migrationId)).already_complete, true);
  assert.equal((await live.get()).data().quantity, 3);
  await assert.rejects(migration.prepare(f.db, f.customer.id), /already owns/);
  process.env.FAIRWAY_OPERATIONAL_STORAGE = 'legacy';
  try { await assert.rejects(inventory.listInventory(f.db, f.customer.id, 'cart'), /unavailable/); }
  finally { process.env.FAIRWAY_OPERATIONAL_STORAGE = 'customer'; }
  f.db._docs.delete(storage.inventoryRef(f.db, f.customer.id, 'cart').path);
  await assert.rejects(inventory.requireCourseAccess(f.db, 'operator', f.customer.id, 'cart'), /not available/);
});

test('changed sources, competing targets, new writes and tampered plans fail closed in maintenance', async () => {
  for (const change of ['source', 'new', 'target', 'tampered']) {
    const f = await fixture();
    await migration.begin(f.db, f.plan, evidence);
    if (change === 'source') await f.course.collection('inventory_products').doc('water').update({ quantity: 6 });
    if (change === 'new') await f.course.collection('inventory_products').doc('new').set({ quantity: 2 });
    if (change === 'target') await storage.inventoryRef(f.db, f.customer.id, 'cart').collection('inventory_products').doc('water').set({ quantity: 999 });
    if (change === 'tampered') f.plan.rows[0].data.type = 'tampered';
    await assert.rejects(migration.resume(f.db, f.plan, evidence.migrationId));
    assert.equal((await f.customer.get()).data().operational_storage.state, 'maintenance');
  }
});

test('interrupted multi-batch migration resumes exactly without losing identities', async () => {
  const f = await fixture();
  for (let n = 0; n < 370; n++) await f.course.collection('inventory_events').doc(`event-${n}`).set({ amount_minor: n });
  const plan = await migration.prepare(f.db, f.customer.id);
  await migration.begin(f.db, plan, evidence);
  const original = f.db.runTransaction.bind(f.db);
  let count = 0;
  f.db.runTransaction = (...args) => {
    if (++count === 2) throw new Error('Synthetic interruption');
    return original(...args);
  };
  await assert.rejects(migration.resume(f.db, plan, evidence.migrationId), /interruption/);
  f.db.runTransaction = original;
  await migration.resume(f.db, plan, evidence.migrationId);
  await migration.verify(f.db, plan);
  assert.equal((await storage.inventoryRef(f.db, f.customer.id, 'cart').collection('inventory_events').get()).size, 370);
});

test('Customer service identity and QR request lifecycle work without a Course owner', async () => {
  const db = new FakeFirestore();
  await db.collection('customers').doc('customer').set({
    operational_storage: { state: 'customer' }, authorization_schema_version: 3,
  });

  await db.collection('customers').doc('customer').collection('services').doc('range-service').set({
    service_id: 'range-service', course_id: 'location-only', course_name: 'Synthetic Range',
    operation_kind: 'driving_range', timezone: 'America/Los_Angeles', service_suspension: null,
  });
  const bayId = 'synthetic-bay-00000000000001';
  await db.collection('qr_bays').doc(bayId).set({
    enabled: true, customer_id: 'customer', course_id: 'location-only',
    service_id: 'range-service', bay_number: 1,
  });
  assert.equal((await publicBay(db, bayId)).available, true);
  await acceptQrRequest(db, bayId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a'.repeat(64));
  const requests = (await db.collection('requests').get()).docs;
  assert.equal(requests.length, 1);
  assert.equal(requests[0].data().service_id, 'range-service');
  assert.equal(requests[0].data().course_id, 'location-only');
  const assignment = { courses: [{ customer_id: 'customer', course_id: 'range-service', service_id: 'range-service' }] };
  await transitionRequest(db, requests[0].id, 'complete', assignment, 'operator');
  assert.equal((await requests[0].ref.get()).data().status, 'completed');
  await db.collection('customers').doc('customer').update({ operational_storage: { state: 'maintenance' } });
  await assert.rejects(acceptQrRequest(db, bayId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a'.repeat(64)), /unavailable/);
});

test('Customer service reporting does not use a Course ownership register', async () => {
  const db = new FakeFirestore();
  const customer = db.collection('customers').doc('CUST-991');
  await customer.set({ customer_name: 'Synthetic reporting', operational_storage: { state: 'customer' } });
  await customer.collection('services').doc('service-alpha').set({
    service_id: 'service-alpha', course_id: 'location-only', course_name: 'Synthetic Cart',
    timezone: 'UTC', operation_kind: 'cart',
  });
  const request = {
    id: 'request-one', device_id: 'synthetic-device', customer_id: 'CUST-991',
    course_id: 'location-only', service_id: 'service-alpha', event_type: 'button_press',
    source: 'nrf9151', status: 'completed', received_at: new Date('2026-11-15T12:00:00Z'),
    completed_at: new Date('2026-11-15T12:05:00Z'), device_label: 'Hole 1',
  };
  await db.collection('requests').doc(request.id).set(request);
  const report = await generateButtonReport(db, {
    customer_id: 'CUST-991', service_id: 'service-alpha', start_date: '2026-11-15', end_date: '2026-11-15',
  }, {
    asOf: new Date('2026-11-15T23:00:00Z'),
    source: { requests: async scope => { assert.equal(scope.courseId, 'service-alpha'); return [request]; },
      serviceEvents: async () => [] },
  });
  assert.equal(report.course.course_id, 'service-alpha');
  assert.equal(report.course.course_name, 'Synthetic Cart');
  assert.equal(report.totals.completed, 1);
  await customer.collection('menus').doc('restaurant').set({ type: 'restaurant', state: 'active' });
  for (const uid of ['service-operator', 'restaurant-operator']) {
    await db.collection('user_access').doc(uid).set({
      schema_version: 3, admin: false, customer_id: customer.id,
      service_ids: uid === 'service-operator' ? ['service-alpha'] : [],
      menu_ids: uid === 'restaurant-operator' ? ['restaurant'] : [],
    });
    await db.collection('course_push_subscriptions').doc('service-alpha').collection('subscriptions').doc(uid).set({
      operator_uid: uid, customer_id: customer.id, status: 'active',
      endpoint: `https://push.example.test/${uid}`, keys: { auth: 'synthetic', p256dh: 'synthetic' },
    });
  }
  const sent = [];
  await dispatchRequestNotifications(db, request.id, async (_, payload) => { sent.push(JSON.parse(payload)); });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].service_id, 'service-alpha');
  assert.equal(sent[0].url, '/requests/request-one?customer_id=CUST-991&course_id=service-alpha');
  await setRequestReportingState(db, { requestId: request.id, customerId: customer.id,
    courseId: 'service-alpha', reportingState: 'excluded', adminUid: 'admin' });
  assert.equal((await listExcludedRequests(db, customer.id, 'service-alpha')).length, 1);
  assert.equal((await db.collection('requests').doc(request.id).get()).data().course_id, 'location-only');
});

test('maintenance also fences Customer entitlement edits, including global Admin elevation', async () => {
  const f = await fixture();
  await migration.begin(f.db, f.plan, evidence);
  await f.db.collection('user_access').doc('admin').set({
    schema_version: 3, admin: true, customer_id: null, menu_ids: [], service_ids: [],
  });
  const handlers = createFairwayHandlers(f.db, {
    verifyOperatorToken: async () => ({ uid: 'admin' }),
    firebaseAuth: { getUser: async uid => ({ uid, disabled: false }) },
  });
  const response = {
    statusCode: 0, body: null, set() { return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; },
  };
  await handlers.fairwayAdmin({
    path: '/api/v1/admin/users/operator/access', method: 'PUT',
    get: name => name.toLowerCase() === 'authorization' ? 'Bearer synthetic-admin-token' : undefined,
    body: { schema_version: 3, admin: true, customer_id: null, menu_ids: [], service_ids: [] },
  }, response);
  assert.equal(response.statusCode, 503);
  assert.equal((await f.db.collection('user_access').doc('operator').get()).data().schema_version, 2);
});
