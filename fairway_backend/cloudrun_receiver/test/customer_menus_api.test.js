'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const { createFairwayHandlers } = require('../index');
const registry = require('../lib/customer_menus');

async function harness() {
  const db = new FakeFirestore();
  const customer = db.collection('customers').doc('customer');
  await customer.set({ customer_name: 'Customer' });
  await customer.collection('courses').doc('course').set({ course_name: 'Course', timezone: 'UTC' });
  await customer.collection('assets').doc('course').set({ type: 'cart', course_id: 'course', course_name: 'Course', timezone: 'UTC' });
  await customer.collection('services').doc('course').set({ course_id: 'course' });
  await db.collection('user_access').doc('admin').set({ schema_version: 3, admin: true, customer_id: null, menu_ids: [], service_ids: [] });
  const { fairwayAdmin } = createFairwayHandlers(db, {
    verifyOperatorToken: async (uid) => ({ uid }),
    firebaseAuth: { getUser: async (uid) => ({ uid, disabled: false, email: `${uid}@example.invalid` }) },
  });
  const request = async (method, path, body, uid = 'admin', query = {}) => {
    const res = {
      statusCode: 0, headers: {},
      set(k, v) { this.headers[k] = v; return this; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
      send(value) { this.body = value; return this; },
    };
    await fairwayAdmin({ method, path, body, query, get: (name) => name === 'authorization' ? `Bearer ${uid}` : null }, res);
    return res;
  };
  return { db, customer, request };
}

test('menu ownership, explicit grants, public aliases, restaurant isolation and archive', async () => {
  const { db, customer, request } = await harness();
  const base = '/api/v1/admin/customers/customer/menus';
  const created = await request('POST', base, {
    name: 'restaurant_menu', type: 'restaurant', aliases: ['restaurant', 'restaurant_menu'],
  });
  assert.equal(created.statusCode, 201);
  const menuId = created.body.menu.menu_id;
  await db.collection('user_access').doc('worker').set({
    schema_version: 3, admin: false, customer_id: 'customer', menu_ids: [menuId], service_ids: [],
  });
  const restaurant = `/api/v1/menus/customers/customer/${menuId}`;
  let response = await request('POST', `${restaurant}/categories`, { name: 'Food' }, 'worker');
  assert.equal(response.statusCode, 201);
  const categoryId = response.body.category_id;
  response = await request('POST', `${restaurant}/products`, {
    name: 'Lunch', category_id: categoryId, subcategory_id: null, description: 'Good',
    brand: null, price: { amount_minor: 1200, currency_code: 'USD' }, state: 'on_menu',
  }, 'worker');
  assert.equal(response.statusCode, 201);
  const productId = response.body.product_id;
  assert.equal((await request('POST', `${restaurant}/products`, {
    name: 'Bad', category_id: categoryId, quantity: 3,
  }, 'worker')).statusCode, 400);
  response = await request('GET', '/api/v1/public/menus/restaurant');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.products[0].name, 'Lunch');
  assert.equal(response.body.products[0].price.amount_minor, 1200);
  assert.equal(Object.hasOwn(response.body.products[0], 'quantity'), false);
  assert.equal((await request('GET', '/api/v1/inventory/customers/customer/course', null, 'worker')).statusCode, 403);
  response = await request('PATCH', `${restaurant}/products/${productId}`, { state: 'sold_out' }, 'worker');
  assert.equal(response.statusCode, 200);
  assert.equal((await request('GET', '/api/v1/public/menus/restaurant_menu')).body.products.length, 0);
  assert.equal((await request('PATCH', `${base}/${menuId}`, { slug: 'changed' })).statusCode, 400);
  assert.equal((await request('PATCH', `${base}/${menuId}`, { state: 'archived' })).statusCode, 200);
  assert.equal((await request('GET', '/api/v1/public/menus/restaurant')).statusCode, 410);
  assert.equal((await request('POST', base, { name: 'other', type: 'restaurant', aliases: ['restaurant'] })).statusCode, 409);
  assert.equal((await customer.collection('menus').doc(menuId).get()).data().state, 'archived');
});

test('cart grant authorizes old and new paths without service grants and QR encodes permanent URL', async () => {
  const { db, request } = await harness();
  const base = '/api/v1/admin/customers/customer/menus';
  const result = await request('POST', base, {
    name: 'cart_menu', type: 'cart', slug: 'monarchbay_tony_lema_course', aliases: ['monarch-bay'], asset_id: 'course',
  });
  assert.equal(result.statusCode, 201);
  const menuId = result.body.menu.menu_id;
  await db.collection('user_access').doc('worker').set({
    schema_version: 3, admin: false, customer_id: 'customer', menu_ids: [menuId], service_ids: [],
  });
  for (const prefix of ['courses', 'customers']) {
    const response = await request('GET', `/api/v1/inventory/${prefix}/customer/course`, null, 'worker');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.course_id, 'course');
  }
  const qr = await request('GET', `${base}/${menuId}/qr`, null, 'admin', { format: 'png' });
  assert.equal(qr.statusCode, 200);
  assert.equal(qr.headers['Content-Type'], 'image/png');
  assert.equal((await request('GET', '/api/v1/public/menus/monarch-bay')).statusCode, 200);
});

test('administrative registration preserves all existing cart records and permanent URL mappings', async () => {
  const { db, customer, request } = await harness();
  const course = customer.collection('courses').doc('course');
  await course.collection('inventory_products').doc('stable-product').set({
    name: 'Water', category_name: 'Drinks', state: 'on_cart', quantity: 7, stock_revision: 12,
  });
  await course.collection('inventory_shifts').doc('stable-shift').set({ status: 'active', actor_uid: 'worker' });
  await course.collection('inventory_events').doc('stable-event').set({ quantity: 2, actor_uid: 'worker' });
  await db.collection('public_menu_slugs').doc('monarch-bay').set({
    customer_id: 'customer', course_id: 'course',
  });
  const before = [...db._docs].filter(([path]) => path.startsWith(course.path));
  await registry.registerCustomerAssets(db, 'customer', 'admin');
  assert.deepEqual([...db._docs].filter(([path]) => path.startsWith(course.path)), before);
  assert.equal((await registry.registerCustomerAssets(db, 'customer', 'admin')).registered, 0);
  const created = await request('POST', '/api/v1/admin/customers/customer/menus', {
    name: 'cart_menu', type: 'cart', asset_id: 'course',
    slug: 'monarchbay_tony_lema_course', aliases: ['monarch-bay'],
  });
  assert.equal(created.statusCode, 201);
  const menuId = created.body.menu.menu_id;
  await db.collection('user_access').doc('worker').set({
    schema_version: 3, admin: false, customer_id: 'customer', menu_ids: [menuId], service_ids: [],
  });
  const inventory = await request('GET', '/api/v1/inventory/customers/customer/course', null, 'worker');
  assert.equal(inventory.body.products[0].product_id, 'stable-product');
  assert.equal(inventory.body.products[0].quantity, 7);
  assert.equal(inventory.body.products[0].stock_revision, 12);
  assert.deepEqual([...db._docs].filter(([path]) => path.startsWith(course.path)), before);
  const publicMenu = await request('GET', '/api/v1/public/menus/monarch-bay');
  assert.equal(publicMenu.body.products[0].name, 'Water');
  assert.equal(Object.hasOwn(publicMenu.body.products[0], 'quantity'), false);
  assert.equal((await customer.collection('menu_qr_codes').doc(menuId).get()).data().menu_id, menuId);
  const bootstrap = await request('GET', '/api/v1/inventory/bootstrap', null, 'worker');
  assert.equal(bootstrap.body.courses[0].course_id, 'course', 'menu grant is independent of services');
});

test('Customer menu names are unique even after archive and cannot consume another cart URL', async () => {
  const { request } = await harness();
  const base = '/api/v1/admin/customers/customer/menus';
  const first = await request('POST', base, { name: 'restaurant_menu', type: 'restaurant' });
  assert.equal(first.statusCode, 201);
  assert.equal((await request('POST', base, {
    name: 'restaurant_menu', type: 'restaurant',
  })).statusCode, 409);
  await request('PATCH', `${base}/${first.body.menu.menu_id}`, { state: 'archived' });
  assert.equal((await request('POST', base, {
    name: 'restaurant_menu', type: 'restaurant',
  })).statusCode, 409);
});

test('renames derive the current URL from the sole menu name and permanently preserve every earlier URL', async () => {
  const { request } = await harness();
  const base = '/api/v1/admin/customers/customer/menus';
  const created = await request('POST', base, { name: 'restaurant_menu', type: 'restaurant' });
  assert.equal(created.statusCode, 201);
  const menuId = created.body.menu.menu_id;
  assert.equal(created.body.menu.public_url, `https://${process.env.FAIRWAY_GCP_PROJECT}.web.app/cartmenus/customer_restaurant_menu`);
  const renamed = await request('PATCH', `${base}/${menuId}`, { name: 'bistro_menu' });
  assert.equal(renamed.statusCode, 200);
  assert.equal(renamed.body.menu.public_url, `https://${process.env.FAIRWAY_GCP_PROJECT}.web.app/cartmenus/customer_bistro_menu`);
  assert.deepEqual(renamed.body.menu.aliases, ['customer_restaurant_menu']);
  for (const slug of ['customer_restaurant_menu', 'customer_bistro_menu']) {
    const response = await request('GET', `/api/v1/public/menus/${slug}`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.menu_id, menuId);
    assert.equal(response.body.name, 'bistro_menu');
  }
  assert.equal((await request('POST', base, { name: 'restaurant_menu', type: 'restaurant' })).statusCode, 409);
  assert.equal((await request('PATCH', `${base}/${menuId}`, { aliases: [] })).statusCode, 409);
  const back = await request('PATCH', `${base}/${menuId}`, { name: 'restaurant_menu' });
  assert.equal(back.statusCode, 200);
  assert.deepEqual(back.body.menu.aliases, ['customer_bistro_menu']);
  assert.equal((await request('GET', `${base}/${menuId}/qr`, null, 'admin', { format: 'png' })).statusCode, 200);
});

test('completed Customer cutover denies legacy authorization and prevents old Admin clients recreating it', async () => {
  const { db, customer, request } = await harness();
  await customer.update({ authorization_schema_version: 3 });
  const legacy = { schema_version: 2, admin: false, customer_id: 'customer', course_ids: ['course'] };
  await db.collection('user_access').doc('legacy').set(legacy);
  assert.equal((await request('GET', '/api/v1/inventory/courses/customer/course', null, 'legacy')).statusCode, 403);
  const changed = await request('PUT', '/api/v1/admin/users/legacy/access', {
    admin: false, customer_id: 'customer', course_ids: [],
  });
  assert.equal(changed.statusCode, 400);
  assert.equal(changed.body.error, 'schema3_update_required');
  assert.deepEqual((await db.collection('user_access').doc('legacy').get()).data(), legacy);
});
