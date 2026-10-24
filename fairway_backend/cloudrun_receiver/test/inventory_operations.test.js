'use strict';

const assert = require('node:assert/strict');
const { FakeFirestore } = require('./fake_firestore');
const inventory = require('../lib/inventory');
const { canOperateInventory } = require('../lib/user_access');

const emulator = process.env.INVENTORY_TEST_EMULATOR === '1';
let db;
if (emulator) {
  // The actual handler's environment guard requires this prefix, even on an emulator.
  const projectId = 'fairway-refresh-sandbox-inventory-emulator';
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8788');
  assert.equal(process.env.FAIRWAY_ENV, 'sandbox');
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, projectId);
  assert.equal(process.env.FAIRWAY_GCP_PROJECT, projectId);
  for (const variable of ['GCLOUD_PROJECT', 'CLOUDSDK_CORE_PROJECT', 'FIREBASE_PROJECT']) {
    if (process.env[variable]) assert.equal(process.env[variable], projectId);
  }
  for (const variable of [
    'GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_OAUTH_ACCESS_TOKEN', 'CLOUDSDK_AUTH_ACCESS_TOKEN',
    'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'GCLOUD_SERVICE_KEY', 'GOOGLE_CLOUD_KEYFILE_JSON', 'FIREBASE_TOKEN',
  ]) assert.equal(process.env[variable], undefined, `Unset credential variable ${variable}`);
  if (process.env.FIREBASE_CONFIG) {
    const config = JSON.parse(process.env.FIREBASE_CONFIG);
    assert.equal(config.projectId, projectId);
    assert.equal(config.credential, undefined);
    assert.equal(config.serviceAccount, undefined);
  }
  const { Firestore } = require('@google-cloud/firestore');
  db = new Firestore({ projectId });
} else {
  db = new FakeFirestore();
}
const { createFairwayHandlers } = require('../index');

let sequence = 0;
let fixtureSequence = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function operation() { return `op-${++sequence}`; }
function normalize(value) { return JSON.parse(JSON.stringify(value)); }

async function fixture({ timezone = 'America/Los_Angeles' } = {}) {
  const customerId = `inventory-test-${Date.now()}-${++fixtureSequence}`;
  const courseId = 'course-a';
  const customer = db.collection('customers').doc(customerId);
  await customer.set({ customer_name: 'Synthetic inventory test' });
  const course = customer.collection('courses').doc(courseId);
  await course.set({ course_name: 'Synthetic Course', timezone });
  await customer.collection('courses').doc('course-b').set({ course_name: 'Other Course', timezone });
  const actors = {
    operator: { uid: `${customerId}-operator` },
    other: { uid: `${customerId}-other` },
    admin: { uid: `${customerId}-admin` },
    outsider: { uid: `${customerId}-outsider` },
  };
  for (const key of ['operator', 'other', 'admin']) {
    await db.collection('user_access').doc(actors[key].uid).set({
      schema_version: 2, admin: key === 'admin',
      customer_id: key === 'admin' ? null : customerId,
      course_ids: key === 'admin' ? [] : [courseId],
    });
  }
  const handlers = createFairwayHandlers(db, { verifyOperatorToken: async (token) => actors[token] || null });
  const base = `/api/v1/inventory/courses/${customerId}/${courseId}`;
  async function request(method, suffix = '', body, token = 'operator', absolute = false) {
    const [path, queryString] = (absolute ? suffix : `${base}${suffix}`).split('?');
    const req = {
      method, path, body, query: Object.fromEntries(new URLSearchParams(queryString)),
      get: (name) => name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined,
    };
    const res = {
      statusCode: null, body: null, set() { return this; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; },
    };
    await handlers.fairwayAdmin(req, res);
    return { status: res.statusCode, body: normalize(res.body) };
  }
  async function ok(method, suffix, body, token = 'operator', absolute = false) {
    const result = await request(method, suffix, body, token, absolute);
    assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result));
    return result.body;
  }
  const staff = await ok('POST', '/staff', { name: 'Test Operator', operation_id: operation() });
  const manager = await ok('POST', `/api/v1/admin/customers/${customerId}/staff`, {
    name: 'Test Manager', role: 'fnb_management', operation_id: operation(),
  }, 'admin', true);
  async function select(staffId = staff.staff_id, sessionId = 'browser-one', token = 'operator') {
    return (await ok('POST', '/shifts/select', {
      session_id: sessionId, staff_id: staffId, operation_id: operation(),
    }, token)).shift;
  }
  const shift = await select();
  const context = () => ({ shift_id: shift.shift_id, operation_id: operation() });
  async function seedProduct(name = 'Water', state = 'on_cart', quantity) {
    const ref = course.collection('inventory_products').doc();
    await ref.set({
      name, category_name: 'Drinks', category_id: 'drinks', subcategory_name: null, subcategory_id: null,
      brand: null, description: null, price: null, archived: false, state,
      ...(quantity === undefined ? {} : { quantity }),
    });
    return ref.id;
  }
  const metadata = (name = 'Water') => ({
    name, category_name: 'Drinks', subcategory_name: null, brand: null, description: null, price: null,
  });
  const stock = (id, body) => ok('POST', `/products/${id}/stock`, { ...context(), ...body });
  return { customerId, course, customer, base, staff, manager, shift, request, ok, select, context, seedProduct, metadata, stock, actors };
}

test('legacy quantity defaults to zero without changing availability or metadata; GET uses one transaction', async () => {
  const f = await fixture();
  for (const state of ['on_cart', 'sold_out', 'in_inventory']) await f.seedProduct(`Legacy ${state}`, state);
  const original = db.runTransaction.bind(db);
  let transactions = 0;
  db.runTransaction = (...args) => { transactions += 1; return original(...args); };
  let result;
  try { result = await f.ok('GET', ''); } finally { db.runTransaction = original; }
  assert.equal(transactions, 1);
  assert.deepEqual(result.products.map((p) => p.state).sort(), ['in_inventory', 'on_cart', 'sold_out']);
  assert.ok(result.products.every((p) => p.quantity === 0 && p.stock_revision === 0 && p.category_name === 'Drinks'));
  assert.equal(result.operations.daily_sales.total_units, 0);
  assert.deepEqual(result.daily_sales, result.operations.daily_sales);
  const raw = await f.course.collection('inventory_products').get();
  assert.ok(raw.docs.every((p) => !Object.hasOwn(p.data(), 'quantity')));
});

test('staff records are customer-owned, stable, admin-managed, and never authorization', async () => {
  const f = await fixture();
  assert.equal(canOperateInventory({ active: true, role: 'cart_operator' }), true);
  assert.equal(canOperateInventory({ active: true, role: 'fnb_management' }), true);
  assert.equal(canOperateInventory({ active: false, role: 'fnb_management' }), false);
  const body = { name: 'Custom Operator', operation_id: operation() };
  const custom = await f.ok('POST', '/staff', body);
  assert.equal(custom.role, 'cart_operator');
  assert.deepEqual(await f.ok('POST', '/staff', body), custom);
  assert.equal((await f.request('POST', '/staff', { ...body, name: 'Different' })).status, 409);
  assert.equal((await f.request('POST', '/staff', { name: 'Injected', role: 'fnb_management', operation_id: operation() })).status, 400);
  const adminPath = `/api/v1/admin/customers/${f.customerId}/staff`;
  assert.equal((await f.request('GET', adminPath, undefined, 'operator', true)).status, 403);
  const changed = await f.ok('PATCH', `${adminPath}/${custom.staff_id}`, { name: 'Renamed', active: false }, 'admin', true);
  assert.equal(changed.staff_id, custom.staff_id);
  assert.equal((await f.ok('GET', '/staff')).staff.some((s) => s.staff_id === custom.staff_id), false);
  assert.equal((await f.ok('GET', adminPath, undefined, 'admin', true)).staff.find((s) => s.staff_id === custom.staff_id).active, false);
  assert.equal((await f.request('DELETE', `${adminPath}/${custom.staff_id}`, undefined, 'admin', true)).status, 404);
  assert.equal((await f.request('GET', '', undefined, 'outsider')).status, 403);
  assert.equal((await f.request('GET', `/api/v1/inventory/courses/${f.customerId}/course-b/staff`, undefined, 'operator', true)).status, 403);
  assert.equal((await db.collection('user_access').doc(custom.staff_id).get()).exists, false);
});

test('sessions scope actor and Course, allow free pre-activity changes, then require close', async () => {
  const f = await fixture();
  assert.deepEqual((await f.ok('GET', '/shifts/session?session_id=browser-one')).shift, f.shift);
  assert.deepEqual(await f.ok('GET', '/shifts/session?session_id=browser-one', undefined, 'other'), { shift: null });
  const changed = await f.select(f.manager.staff_id);
  assert.equal(changed.shift_id, f.shift.shift_id);
  assert.equal(changed.staff_name, 'Test Manager');
  await f.ok('POST', '/categories', { name: 'New category', ...f.context() });
  const denied = await f.request('POST', '/shifts/select', {
    session_id: 'browser-one', staff_id: f.staff.staff_id, operation_id: operation(),
  });
  assert.equal(denied.body.error, 'shift_close_required');
  const adminPath = `/api/v1/admin/customers/${f.customerId}/staff/${f.manager.staff_id}`;
  await f.ok('PATCH', adminPath, { name: 'Changed Directory Name' }, 'admin', true);
  assert.equal((await f.select(f.manager.staff_id)).staff_name, 'Test Manager');
  const id = await f.seedProduct('Owned Product', 'on_cart', 3);
  assert.equal((await f.request('POST', `/products/${id}/stock`, { ...f.context(), kind: 'sale', units: 1 }, 'other')).body.error, 'shift_unavailable');
  const separate = await f.select(f.staff.staff_id, 'browser-two');
  assert.notEqual(separate.shift_id, f.shift.shift_id);
  const managerSale = await f.stock(id, { kind: 'sale', units: 1 });
  assert.equal(managerSale.quantity, 2);
  const sale = (await f.course.collection('inventory_events').get()).docs.map((s) => s.data()).find((e) => e.action === 'sale');
  assert.equal(sale.staff_name, 'Test Manager');
  assert.equal(sale.staff_role, 'fnb_management');
});

test('every operational mutation rejects missing shift and cannot create unattributed events', async () => {
  const f = await fixture();
  const id = await f.seedProduct();
  const operations = [
    ['POST', '/categories', { name: 'No shift' }],
    ['POST', '/categories/drinks/subcategories', { name: 'No shift' }],
    ['DELETE', '/categories/drinks', {}],
    ['POST', '/products', f.metadata('New product')],
    ['PATCH', `/products/${id}`, f.metadata()],
    ['POST', `/products/${id}/archive`, {}],
    ['POST', `/products/${id}/stock`, { kind: 'adjustment', quantity: 1, expected_stock_revision: 0 }],
    ['POST', '/publish', {}],
    ['POST', '/audits', { authorized: true, inventory_revision: 0, approver_staff_id: f.manager.staff_id }],
  ];
  for (const [method, path, body] of operations) {
    const response = await f.request(method, path, { ...body, operation_id: operation() });
    assert.equal(response.body.error, 'shift_required', `${method} ${path}: ${JSON.stringify(response)}`);
  }
  assert.equal((await f.course.collection('inventory_events').get()).size, 0);
  assert.equal((await f.ok('GET', '/shifts/session?session_id=browser-one')).shift.has_activity, false);
});

test('metadata, create, archive, category, subcategory, delete, publish and audit all lock attribution', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Activity Product', 'on_cart', 1);
  await f.customer.collection('courses').doc('course-a').collection('inventory_categories').doc('empty').set({ name: 'Empty' });
  await f.customer.collection('courses').doc('course-a').collection('inventory_categories').doc('drinks').set({ name: 'Drinks' });
  await f.ok('PATCH', `/api/v1/admin/customers/${f.customerId}/courses/course-a/inventory-menu`,
    { public_menu_slug: f.customerId }, 'admin', true);
  const actions = [
    (context) => f.ok('PATCH', `/products/${id}`, { ...f.metadata('Activity Edited'), ...context }),
    (context) => f.ok('POST', '/products', { ...f.metadata('Activity Created'), ...context }),
    (context) => f.ok('POST', `/products/${id}/archive`, context),
    (context) => f.ok('POST', '/categories', { name: 'Activity Category', ...context }),
    (context) => f.ok('POST', '/categories/drinks/subcategories', { name: 'Activity Subcategory', ...context }),
    (context) => f.ok('DELETE', '/categories/empty', context),
    (context) => f.ok('POST', '/publish', context),
    async (context) => f.ok('POST', '/audits', {
      inventory_revision: (await f.ok('GET', '')).inventory_revision,
      approver_staff_id: f.manager.staff_id, authorized: true, ...context,
    }),
  ];
  for (let i = 0; i < actions.length; i += 1) {
    const sessionId = `activity-${i}`;
    const shift = await f.select(f.staff.staff_id, sessionId);
    assert.equal(shift.has_activity, false);
    const context = { shift_id: shift.shift_id, operation_id: operation() };
    await actions[i](context);
    assert.equal((await f.ok('GET', `/shifts/session?session_id=${sessionId}`)).shift.has_activity, true);
    assert.equal((await f.request('POST', '/shifts/select', {
      session_id: sessionId, staff_id: f.manager.staff_id, operation_id: operation(),
    })).body.error, 'shift_close_required');
  }
  assert.ok((await f.course.collection('inventory_events').get()).docs.every((s) => (
    s.data().actor_uid === f.actors.operator.uid && s.data().staff_id === f.staff.staff_id && s.data().shift_id
  )));
});

test('sale balance and immutable event commit together; excessive sale leaves no event or activity', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Water', 'on_cart', 3);
  const rejected = await f.request('POST', `/products/${id}/stock`, { ...f.context(), kind: 'sale', units: 4 });
  assert.equal(rejected.body.error, 'insufficient_stock');
  assert.match(rejected.body.message, /correct the quantity first/i);
  assert.equal((await f.course.collection('inventory_events').get()).size, 0);
  assert.equal((await f.ok('GET', '/shifts/session?session_id=browser-one')).shift.has_activity, false);
  for (const units of [0, -1, 1.5, '1', undefined]) {
    assert.equal((await f.request('POST', `/products/${id}/stock`, { ...f.context(), kind: 'sale', units })).status, 400);
  }
  const sold = await f.stock(id, { kind: 'sale', units: 3 });
  assert.equal(sold.quantity, 0);
  assert.equal(sold.state, 'sold_out');
  assert.equal(sold.stock_revision, 1);
  const events = await f.course.collection('inventory_events').get();
  assert.equal(events.size, 1);
  const event = events.docs[0].data();
  assert.equal(event.before_quantity, 3);
  assert.equal(event.after_quantity, 0);
  assert.equal(event.before, 3);
  assert.equal(event.after, 0);
  assert.equal(event.delta, -3);
  assert.equal(event.actor_uid, f.actors.operator.uid);
  assert.equal(event.staff.name, f.staff.name);
  assert.equal(event.shift_id, f.shift.shift_id);
  assert.ok(event.created_at instanceof Date || event.created_at?.toDate);
  assert.equal((await f.ok('GET', '')).operations.daily_sales.total_units, 3);
});

test('simultaneous sales cannot oversell; same operation concurrently commits once', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Limited', 'on_cart', 1);
  const results = await Promise.all([1, 2].map(() => f.request('POST', `/products/${id}/stock`, {
    ...f.context(), kind: 'sale', units: 1,
  })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await f.course.collection('inventory_events').get()).size, 1);
  const id2 = await f.seedProduct('Retry', 'on_cart', 5);
  const body = { ...f.context(), kind: 'sale', units: 2 };
  const retries = await Promise.all([1, 2, 3].map(() => f.ok('POST', `/products/${id2}/stock`, body)));
  assert.deepEqual(retries[0], retries[1]);
  assert.deepEqual(retries[1], retries[2]);
  assert.equal(retries[0].quantity, 3);
  assert.equal((await f.course.collection('inventory_events').get()).size, 2);
});

test('adjustments use expected stock revision and reject stale concurrent overwrites', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Adjustable', 'sold_out', 0);
  const first = await f.stock(id, { kind: 'adjustment', quantity: 4, expected_stock_revision: 0 });
  assert.equal(first.state, 'on_cart');
  const results = await Promise.all([5, 7].map((quantity) => f.request('POST', `/products/${id}/stock`, {
    ...f.context(), kind: 'adjustment', quantity, expected_stock_revision: 1,
  })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(results.find((r) => r.status === 409).body.error, 'stock_revision_conflict');
  const zero = await f.stock(id, { kind: 'adjustment', quantity: 0, expected_stock_revision: 2 });
  assert.equal(zero.state, 'sold_out');
  for (const quantity of [-1, 1.5, '4', null]) {
    assert.equal((await f.request('POST', `/products/${id}/stock`, {
      ...f.context(), kind: 'adjustment', quantity, expected_stock_revision: 3,
    })).status, 400);
  }
});

test('restaurant moves preserve quantity, Sold Out requires a sale, and loading confirms positive stock', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Preserved', 'on_cart', 9);
  const moved = await f.stock(id, { kind: 'availability', state: 'in_inventory', expected_stock_revision: 0, quantity: 88 });
  assert.equal(moved.quantity, 9);
  assert.equal(moved.state, 'in_inventory');
  assert.equal((await f.request('POST', `/products/${id}/stock`, {
    ...f.context(), kind: 'sale', units: 1,
  })).body.error, 'product_not_on_cart');
  for (const quantity of [undefined, 0, -1, 1.5]) {
    assert.equal((await f.request('POST', `/products/${id}/stock`, {
      ...f.context(), kind: 'availability', state: 'on_cart', expected_stock_revision: 1, quantity,
    })).status, 400);
  }
  const loaded = await f.stock(id, { kind: 'availability', state: 'on_cart', expected_stock_revision: 1, quantity: 6 });
  assert.equal(loaded.quantity, 6);
  const rejected = await f.request('POST', `/products/${id}/stock`, {
    ...f.context(), kind: 'availability', state: 'sold_out', expected_stock_revision: 2,
  });
  assert.equal(rejected.body.error, 'sale_confirmation_required');
  const unavailable = await f.stock(id, { kind: 'sale', units: 6, expected_stock_revision: 2 });
  assert.equal(unavailable.quantity, 0);
  const reloaded = await f.stock(id, { kind: 'availability', state: 'on_cart', expected_stock_revision: 3, quantity: 8 });
  assert.equal(reloaded.quantity, 8);
  assert.equal((await f.ok('GET', '')).operations.daily_sales.total_units, 6);
});

test('confirmed remaining sale is revision-bound, atomic, attributed and idempotent after retry', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Remaining stock', 'on_cart', 4);
  const body = { ...f.context(), kind: 'sale', units: 4, expected_stock_revision: 0 };
  const results = await Promise.all([1, 2, 3].map(() => f.ok('POST', `/products/${id}/stock`, body)));
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].quantity, 0);
  assert.equal(results[0].state, 'sold_out');
  const events = await f.course.collection('inventory_events').get();
  assert.equal(events.size, 1);
  const event = events.docs[0].data();
  assert.equal(event.action, 'sale');
  assert.equal(event.units, 4);
  assert.equal(event.before_quantity, 4);
  assert.equal(event.after_quantity, 0);
  assert.equal(event.after_state, 'sold_out');
  assert.equal(event.staff_id, f.staff.staff_id);
  assert.equal(event.shift_id, f.shift.shift_id);
  assert.equal(event.actor_uid, f.actors.operator.uid);
  assert.equal((await f.ok('GET', '')).daily_sales.total_units, 4);
});

test('remaining confirmation rejects intervening sales and increases, including quantity restored to its original value', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Changed stock', 'on_cart', 4);
  const original = { ...f.context(), kind: 'sale', units: 4, expected_stock_revision: 0 };
  await f.stock(id, { kind: 'sale', units: 1 });
  assert.equal((await f.request('POST', `/products/${id}/stock`, original)).body.error, 'stock_revision_conflict');
  await f.stock(id, { kind: 'adjustment', quantity: 6, expected_stock_revision: 1 });
  assert.equal((await f.request('POST', `/products/${id}/stock`, original)).body.error, 'stock_revision_conflict');
  await f.stock(id, { kind: 'adjustment', quantity: 4, expected_stock_revision: 2 });
  assert.equal((await f.request('POST', `/products/${id}/stock`, original)).body.error, 'stock_revision_conflict');
  assert.equal((await f.course.collection('inventory_events').get()).size, 3);
  assert.equal((await f.ok('GET', '')).daily_sales.total_units, 1);
  const sold = await f.stock(id, { kind: 'sale', units: 4, expected_stock_revision: 3 });
  assert.equal(sold.quantity, 0);
  assert.equal(sold.state, 'sold_out');
  assert.equal((await f.ok('GET', '')).daily_sales.total_units, 5);
});

test('zero On Cart to Sold Out records availability only and no zero-unit sale', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Legacy zero', 'on_cart', 0);
  const result = await f.stock(id, { kind: 'availability', state: 'sold_out', expected_stock_revision: 0 });
  assert.equal(result.quantity, 0);
  assert.equal(result.state, 'sold_out');
  const events = await f.course.collection('inventory_events').get();
  assert.equal(events.size, 1);
  assert.equal(events.docs[0].data().action, 'stock_availability');
  assert.equal(events.docs[0].data().units, undefined);
  assert.equal((await f.ok('GET', '')).daily_sales.total_units, 0);
});

test('restaurant returns preserve quantity, zero adjustments stay In Inventory, and audits exclude returned stock', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Returned stock', 'on_cart', 9);
  await f.stock(id, { kind: 'availability', state: 'in_inventory', expected_stock_revision: 0 });
  let current = (await f.ok('GET', '')).products.find(product => product.product_id === id);
  assert.equal(current.state, 'in_inventory');
  assert.equal(current.quantity, 9);
  const events = await f.course.collection('inventory_events').get();
  const returned = events.docs.map(doc => doc.data()).find(event => event.action === 'stock_availability');
  assert.equal(returned.delta, 0);
  assert.equal(returned.before_state, 'on_cart');
  assert.equal(returned.after_state, 'in_inventory');
  assert.ok(returned.staff_id && returned.shift_id && returned.actor_uid);
  const audit = await f.ok('POST', '/audits', {
    ...f.context(), authorized: true, inventory_revision: 1, approver_staff_id: f.manager.staff_id,
  });
  assert.ok(audit.products.every(product => product.product_id !== id));
  const zero = await f.stock(id, { kind: 'adjustment', quantity: 0, expected_stock_revision: 1 });
  assert.equal(zero.state, 'in_inventory');
  assert.equal(zero.quantity, 0);
  const positive = await f.stock(id, { kind: 'adjustment', quantity: 4, expected_stock_revision: 2 });
  assert.equal(positive.state, 'in_inventory');
  current = await f.stock(id, { kind: 'availability', state: 'on_cart', quantity: 6, expected_stock_revision: 3 });
  assert.equal(current.state, 'on_cart');
  assert.equal(current.quantity, 6);
});

test('cached metadata never overwrites stock or availability, including simultaneous sale', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Cached', 'on_cart', 1);
  const metadata = { ...f.metadata('Edited Metadata'), state: 'in_inventory', quantity: 999, stock_revision: 800, ...f.context() };
  const [sale, saved] = await Promise.all([
    f.stock(id, { kind: 'sale', units: 1 }),
    f.ok('PATCH', `/products/${id}`, metadata),
  ]);
  assert.equal(sale.quantity, 0);
  assert.equal(saved.name, 'Edited Metadata');
  const current = (await f.ok('GET', '')).products.find((p) => p.product_id === id);
  assert.equal(current.quantity, 0);
  assert.equal(current.stock_revision, 1);
  assert.equal(current.state, 'sold_out');
  assert.equal(current.name, 'Edited Metadata');
});

test('exact operation replay works after close; changed payload and cross-resource reuse conflict', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Replay', 'on_cart', 5);
  const body = { ...f.context(), kind: 'sale', units: 2 };
  const sale = await f.ok('POST', `/products/${id}/stock`, body);
  const createBody = { ...f.metadata('Created Once'), ...f.context() };
  const created = await f.ok('POST', '/products', createBody);
  const close = { session_id: 'browser-one', amount_minor: 1305, operation_id: operation() };
  await f.ok('POST', `/shifts/${f.shift.shift_id}/close`, close);
  assert.deepEqual(await f.ok('POST', `/products/${id}/stock`, body), sale);
  assert.deepEqual(await f.ok('POST', '/products', createBody), created);
  assert.equal((await f.request('POST', `/products/${id}/stock`, { ...body, units: 1 })).body.error, 'operation_conflict');
  assert.equal((await f.request('POST', `/products/${id}/stock`, { ...body, units: -1 })).body.error, 'operation_conflict');
  assert.equal((await f.request('POST', '/products', { ...createBody, name: '' })).body.error, 'operation_conflict');
  assert.equal((await f.request('POST', `/products/${created.product_id}/stock`, body)).body.error, 'operation_conflict');
  assert.equal((await f.request('POST', `/products/${id}/stock`, body, 'other')).body.error, 'operation_conflict');
  assert.equal((await f.request('POST', `/products/${id}/stock`, { ...body, operation_id: operation() })).body.error, 'shift_unavailable');
  assert.equal((await f.ok('GET', '')).operations.daily_sales.total_units, 2);
});

test('audit requires exact authorization, active approver, and the confirmed revision; snapshot is immutable', async () => {
  const f = await fixture();
  const id = await f.seedProduct('Audit Water', 'on_cart', 4);
  await f.seedProduct('Audit Empty', 'sold_out');
  await f.seedProduct('Not On Cart', 'in_inventory', 20);
  const archived = await f.seedProduct('Archived', 'on_cart', 6);
  await f.course.collection('inventory_products').doc(archived).set({ archived: true }, { merge: true });
  const body = { ...f.context(), authorized: true, inventory_revision: 0, approver_staff_id: f.manager.staff_id };
  for (const authorized of [undefined, false, 'true']) {
    assert.equal((await f.request('POST', '/audits', { ...body, authorized, operation_id: operation() })).status, 400);
  }
  assert.equal((await f.request('POST', '/audits', { ...body, inventory_revision: 99 })).body.error, 'inventory_revision_conflict');
  const audit = await f.ok('POST', '/audits', body);
  assert.equal(audit.products.length, 2);
  assert.equal(audit.products.find((p) => p.product_id === id).quantity, 4);
  assert.equal(audit.products.find((p) => p.state === 'sold_out').quantity, 0);
  assert.equal(audit.approver_staff_name, 'Test Manager');
  assert.equal(audit.authorized, true);
  assert.equal(audit.attestation, inventory.AUDIT_ATTESTATION);
  assert.equal(audit.attestation, 'Confirm you are authorized to approve this inventory count audit.');
  assert.equal(audit.actor_uid, f.actors.operator.uid);
  assert.ok(audit.created_at);
  await f.stock(id, { kind: 'sale', units: 1 });
  assert.deepEqual(await f.ok('POST', '/audits', body), audit);
  assert.equal((await f.request('POST', '/audits', { ...body, operation_id: operation() })).body.error, 'inventory_revision_conflict');
  const snapshot = await f.course.collection('inventory_audits').doc(audit.audit_id).get();
  assert.equal(snapshot.data().products.find((p) => p.product_id === id).quantity, 4);
  const current = await f.ok('GET', '');
  await f.ok('PATCH', `/api/v1/admin/customers/${f.customerId}/staff/${f.manager.staff_id}`, { active: false }, 'admin', true);
  assert.equal((await f.request('POST', '/audits', {
    ...body, inventory_revision: current.inventory_revision, operation_id: operation(),
  })).body.error, 'staff_unavailable');
});

test('close validates exact cents, is immutable/idempotent, and allows multiple shifts per day', async () => {
  const f = await fixture();
  for (const amount_minor of [-1, 1.5, '1', null]) {
    assert.equal((await f.request('POST', `/shifts/${f.shift.shift_id}/close`, {
      session_id: 'browser-one', amount_minor, operation_id: operation(),
    })).status, 400);
  }
  const body = { session_id: 'browser-one', amount_minor: 1005, operation_id: operation() };
  assert.equal((await f.request('POST', `/shifts/${f.shift.shift_id}/close`, { ...body, session_id: 'wrong' })).status, 409);
  const closed = await f.ok('POST', `/shifts/${f.shift.shift_id}/close`, body);
  assert.equal(closed.amount_minor, 1005);
  assert.equal(closed.currency_code, 'USD');
  assert.equal(closed.status, 'closed');
  assert.deepEqual(await f.ok('POST', `/shifts/${f.shift.shift_id}/close`, body), closed);
  assert.equal((await f.request('POST', `/shifts/${f.shift.shift_id}/close`, { ...body, amount_minor: 1006 })).body.error, 'operation_conflict');
  assert.equal((await f.request('POST', `/shifts/${f.shift.shift_id}/close`, { ...body, amount_minor: -1 })).body.error, 'operation_conflict');
  assert.deepEqual(await f.ok('GET', '/shifts/session?session_id=browser-one'), { shift: null });
  const second = await f.select();
  assert.notEqual(second.shift_id, f.shift.shift_id);
  await f.ok('POST', `/shifts/${second.shift_id}/close`, { ...body, amount_minor: 0, operation_id: operation() });
  assert.equal((await f.course.collection('inventory_shift_closures').get()).size, 2);
  const saved = await f.course.collection('inventory_shift_closures').doc(f.shift.shift_id).get();
  assert.equal(saved.data().amount_minor, 1005);
});

test('daily sales aggregate every event beyond 1000 rows, retain history and exclude non-sale mutations', async () => {
  const f = await fixture();
  const now = new Date();
  for (let start = 0; start < 1005; start += 400) {
    const batch = db.batch();
    for (let i = start; i < Math.min(start + 400, 1005); i += 1) {
      batch.set(f.course.collection('inventory_events').doc(`sale-${i}`), {
        action: 'sale', product_id: i % 2 ? 'a' : 'b', product_name: i % 2 ? 'A' : 'B', units: 2, created_at: now,
      });
    }
    await batch.commit();
  }
  await f.course.collection('inventory_events').doc('old-sale').set({
    action: 'sale', product_id: 'a', product_name: 'A', units: 100, created_at: new Date(now.getTime() - 72 * 3600000),
  });
  await f.course.collection('inventory_events').doc('adjustment').set({
    action: 'stock_adjustment', units: 999, created_at: now,
  });
  const summary = (await f.ok('GET', '')).operations.daily_sales;
  assert.equal(summary.total_units, 2010);
  assert.equal(summary.products.length, 2);
  assert.equal((await f.course.collection('inventory_events').get()).size, 1007);
  assert.match(summary.local_date, /^\d{4}-\d{2}-\d{2}$/);
});

test('daily sales use Course-local midnight rather than UTC midnight', async () => {
  const f = await fixture({ timezone: 'Pacific/Honolulu' });
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Honolulu', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const midnight = new Date(`${localDate}T00:00:00-10:00`);
  await f.course.collection('inventory_events').doc('today').set({
    action: 'sale', product_id: 'a', product_name: 'A', units: 3, created_at: midnight,
  });
  await f.course.collection('inventory_events').doc('yesterday').set({
    action: 'sale', product_id: 'a', product_name: 'A', units: 7, created_at: new Date(midnight.getTime() - 1),
  });
  const summary = (await f.ok('GET', '')).operations.daily_sales;
  assert.equal(summary.local_date, localDate);
  assert.equal(summary.total_units, 3);
});

test('public publications retain explicit allowlist and replay does not republish', async () => {
  const f = await fixture();
  await f.ok('PATCH', `/api/v1/admin/customers/${f.customerId}/courses/course-a/inventory-menu`,
    { public_menu_slug: f.customerId }, 'admin', true);
  await f.seedProduct('Public', 'on_cart', 5);
  await f.seedProduct('Empty Public', 'sold_out', 3);
  await f.seedProduct('Private', 'in_inventory', 12);
  const body = f.context();
  const publication = await f.ok('POST', '/publish', body);
  const publicMenu = await f.ok('GET', `/api/v1/public/menus/${f.customerId}`, undefined, 'operator', true);
  assert.equal(publicMenu.products.length, 2);
  assert.deepEqual(Object.keys(publicMenu.products[0]).sort(), [
    'brand', 'category', 'description', 'name', 'price', 'product_id', 'state', 'subcategory',
  ]);
  for (const secret of ['quantity', 'stock_revision', 'staff_id', 'shift_id', 'actor_uid', 'operation_id', 'daily_sales']) {
    assert.equal(JSON.stringify(publicMenu).includes(`"${secret}"`), false);
  }
  await f.ok('POST', `/shifts/${f.shift.shift_id}/close`, { session_id: 'browser-one', amount_minor: 0, operation_id: operation() });
  assert.deepEqual(await f.ok('POST', '/publish', body), publication);
  assert.equal((await f.course.collection('published_menus').get()).size, 1);
});

test('failed commit rolls back stock, immutable event, shift activity and idempotency result together', async () => {
  if (emulator) return;
  const f = await fixture();
  const id = await f.seedProduct('Rollback', 'on_cart', 2);
  const body = { ...f.context(), kind: 'sale', units: 1 };
  db.failNextTransactionCommit = true;
  assert.equal((await f.request('POST', `/products/${id}/stock`, body)).status, 500);
  assert.equal((await f.course.collection('inventory_products').doc(id).get()).data().quantity, 2);
  assert.equal((await f.course.collection('inventory_events').get()).size, 0);
  assert.equal((await f.ok('GET', '/shifts/session?session_id=browser-one')).shift.has_activity, false);
  assert.equal((await f.ok('POST', `/products/${id}/stock`, body)).quantity, 1);
});

(async () => {
  let failed = 0;
  let skipped = 0;
  for (const { name, fn } of tests) {
    if (emulator && name.startsWith('failed commit rolls back')) {
      skipped += 1;
      console.log(`SKIP (unit fault injection only): ${name}`);
      continue;
    }
    try {
      await fn();
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${name}`, error);
    }
  }
  if (emulator) await db.terminate();
  console.log(`\n${tests.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped (${emulator ? 'real emulator' : 'in-memory'})`);
  if (failed) process.exitCode = 1;
})();
