'use strict';

const assert = require('assert');
const { FakeFirestore } = require('./fake_firestore');
const { createFairwayHandlers } = require('../index');

let passed = 0;
let failed = 0;
const pending = [];
const CUSTOMER_ID = 'CUST-0001';
const COURSE_ID = 'COURSE-0001';
const SECOND_COURSE_ID = 'COURSE-0002';
const TOKENS = Object.freeze({
  admin: { uid: 'global-admin', admin: true },
  fnb: { uid: 'fnb-manager', admin: false },
  cart: { uid: 'cart-operator', admin: false },
  outsider: { uid: 'unassigned-user', admin: false },
});

function test(name, fn) {
  pending.push({ name, fn });
}

function createResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
  };
}

function createApi(db) {
  const { fairwayAdmin } = createFairwayHandlers(db, {
    verifyOperatorToken: async (token) => TOKENS[token] || null,
    allowedAdminOrigins: ['https://app.fairwayrefresh.com'],
  });
  return async ({ method = 'GET', path, body, token, origin } = {}) => {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (origin) headers.origin = origin;
    const req = {
      method,
      path,
      body,
      get(name) { return headers[name.toLowerCase()] || headers[name]; },
    };
    const res = createResponse();
    await fairwayAdmin(req, res);
    return res;
  };
}

async function seedCourse(db, courseId = COURSE_ID) {
  await db.collection('customers').doc(CUSTOMER_ID).set({ customer_name: 'Monarch Bay' });
  await db.collection('customers').doc(CUSTOMER_ID).collection('courses').doc(courseId).set({
    course_name: 'Monarch Bay Course',
    timezone: 'America/Los_Angeles',
  });
}

async function seedMembership(db, uid, courseIds = [COURSE_ID]) {
  await db.collection('inventory_course_memberships').doc(uid).set({
    enabled: true,
    courses: courseIds.map((courseId) => ({ customer_id: CUSTOMER_ID, course_id: courseId })),
  });
}

function coursePath(courseId = COURSE_ID) {
  return `/api/v1/inventory/courses/${CUSTOMER_ID}/${courseId}`;
}

function product(name, state = 'on_cart', overrides = {}) {
  return {
    name,
    category_name: 'Craft Beers',
    subcategory_name: 'Lager',
    brand: null,
    description: null,
    price: null,
    state,
    ...overrides,
  };
}

async function run() {
  for (const { name, fn } of pending) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${name}`);
      console.error(error);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
}

test('Inventory membership is course-scoped and gives both staff identities equal editor access', async () => {
  const db = new FakeFirestore();
  await seedCourse(db);
  await seedCourse(db, SECOND_COURSE_ID);
  await seedMembership(db, TOKENS.fnb.uid);
  await seedMembership(db, TOKENS.cart.uid);
  const request = createApi(db);

  const fnbBootstrap = await request({ path: '/api/v1/inventory/bootstrap', token: 'fnb' });
  const cartBootstrap = await request({ path: '/api/v1/inventory/bootstrap', token: 'cart' });
  assert.strictEqual(fnbBootstrap.statusCode, 200);
  assert.deepStrictEqual(fnbBootstrap.body, cartBootstrap.body);
  assert.strictEqual(fnbBootstrap.body.courses[0].permission, 'editor');

  const allowed = await request({ path: coursePath(), token: 'fnb' });
  assert.strictEqual(allowed.statusCode, 200);
  const crossCourse = await request({ path: coursePath(SECOND_COURSE_ID), token: 'fnb' });
  assert.strictEqual(crossCourse.statusCode, 403);
  const outsider = await request({ path: coursePath(), token: 'outsider' });
  assert.strictEqual(outsider.statusCode, 403);
  const missingToken = await request({ path: coursePath() });
  assert.strictEqual(missingToken.statusCode, 401);
});

test('Global Admin provisions equal course access; staff accounts cannot grant access', async () => {
  const db = new FakeFirestore();
  await seedCourse(db);
  const request = createApi(db);
  const path = '/api/v1/admin/inventory-course-memberships/fnb-manager';
  const body = { enabled: true, courses: [{ customer_id: CUSTOMER_ID, course_id: COURSE_ID }] };

  const denied = await request({ method: 'PATCH', path, body, token: 'fnb' });
  assert.strictEqual(denied.statusCode, 403);
  const granted = await request({ method: 'PATCH', path, body, token: 'admin' });
  assert.strictEqual(granted.statusCode, 200);
  const bootstrap = await request({ path: '/api/v1/inventory/bootstrap', token: 'fnb' });
  assert.strictEqual(bootstrap.statusCode, 200);
  assert.strictEqual(bootstrap.body.courses[0].course_id, COURSE_ID);

  const revoked = await request({ method: 'PATCH', path, body: { enabled: false, courses: [] }, token: 'admin' });
  assert.strictEqual(revoked.statusCode, 200);
  assert.strictEqual((await request({ path: '/api/v1/inventory/bootstrap', token: 'fnb' })).statusCode, 403);
});

test('Course category names normalize without duplicates and staff saves use last committed write', async () => {
  const db = new FakeFirestore();
  await seedCourse(db);
  await seedMembership(db, TOKENS.fnb.uid);
  await seedMembership(db, TOKENS.cart.uid);
  const request = createApi(db);

  const category = await request({
    method: 'POST', path: `${coursePath()}/categories`, token: 'fnb', body: { name: 'Craft Beers' },
  });
  const duplicateCategory = await request({
    method: 'POST', path: `${coursePath()}/categories`, token: 'cart', body: { name: ' craft   beers ' },
  });
  assert.strictEqual(category.statusCode, 201);
  assert.strictEqual(duplicateCategory.statusCode, 201);
  assert.strictEqual(category.body.category_id, duplicateCategory.body.category_id);
  assert.strictEqual(duplicateCategory.body.created, false);

  const subcategory = await request({
    method: 'POST',
    path: `${coursePath()}/categories/${category.body.category_id}/subcategories`,
    token: 'fnb',
    body: { name: 'Lager' },
  });
  assert.strictEqual(subcategory.statusCode, 201);

  const created = await request({
    method: 'POST', path: `${coursePath()}/products`, token: 'fnb', body: product('Coors Banquet'),
  });
  assert.strictEqual(created.statusCode, 201);
  assert.strictEqual(created.body.created_by, TOKENS.fnb.uid);
  const duplicateProduct = await request({
    method: 'POST', path: `${coursePath()}/products`, token: 'cart', body: product(' coors   banquet '),
  });
  assert.strictEqual(duplicateProduct.statusCode, 409);

  const failedSaveBefore = await request({ path: coursePath(), token: 'fnb' });
  db.failNextTransactionCommit = true;
  const failedSave = await request({
    method: 'PATCH', path: `${coursePath()}/products/${created.body.product_id}`,
    token: 'cart', body: product('Lost Save'),
  });
  assert.strictEqual(failedSave.statusCode, 500);
  const afterFailedSave = await request({ path: coursePath(), token: 'fnb' });
  assert.strictEqual(afterFailedSave.body.inventory_revision, failedSaveBefore.body.inventory_revision);
  assert.strictEqual(afterFailedSave.body.products[0].name, 'Coors Banquet');

  const concurrentSaves = await Promise.all([
    request({
      method: 'PATCH', path: `${coursePath()}/products/${created.body.product_id}`,
      token: 'fnb', body: product('F&B Concurrent Save'),
    }),
    request({
      method: 'PATCH', path: `${coursePath()}/products/${created.body.product_id}`,
      token: 'cart', body: product('Cart Concurrent Save'),
    }),
  ]);
  assert.deepStrictEqual(concurrentSaves.map((save) => save.statusCode), [200, 200]);
  const inventory = await request({ path: coursePath(), token: 'fnb' });
  const events = await db.collection('customers').doc(CUSTOMER_ID).collection('courses').doc(COURSE_ID)
    .collection('inventory_events').get();
  const lastCommittedEdit = events.docs.map((event) => event.data())
    .filter((event) => event.action === 'product_updated')
    .sort((left, right) => left.inventory_revision - right.inventory_revision)
    .at(-1);
  const expectedName = lastCommittedEdit.actor_uid === TOKENS.fnb.uid
    ? 'F&B Concurrent Save'
    : 'Cart Concurrent Save';
  assert.strictEqual(inventory.body.products[0].name, expectedName);
  assert.strictEqual(inventory.body.products[0].updated_by, lastCommittedEdit.actor_uid);
  assert.strictEqual(inventory.body.inventory_revision, lastCommittedEdit.inventory_revision);
  assert.ok(events.docs.some((event) => event.data().actor_uid === TOKENS.fnb.uid));
  assert.ok(events.docs.some((event) => event.data().actor_uid === TOKENS.cart.uid));
});

test('Empty categories can be deleted by any course member; nonempty categories are protected and never cascade-delete products', async () => {
  const db = new FakeFirestore();
  await seedCourse(db);
  await seedMembership(db, TOKENS.fnb.uid);
  await seedMembership(db, TOKENS.cart.uid);
  const request = createApi(db);

  const emptyCategory = await request({
    method: 'POST', path: `${coursePath()}/categories`, token: 'fnb', body: { name: 'Snacks' },
  });
  assert.strictEqual(emptyCategory.statusCode, 201);

  const nonEmptyCategory = await request({
    method: 'POST', path: `${coursePath()}/categories`, token: 'fnb', body: { name: 'Craft Beers' },
  });
  assert.strictEqual(nonEmptyCategory.statusCode, 201);
  const createdProduct = await request({
    method: 'POST', path: `${coursePath()}/products`, token: 'fnb', body: product('Coors Banquet'),
  });
  assert.strictEqual(createdProduct.statusCode, 201);

  const outsiderAttempt = await request({
    method: 'DELETE', path: `${coursePath()}/categories/${emptyCategory.body.category_id}`, token: 'outsider',
  });
  assert.strictEqual(outsiderAttempt.statusCode, 403);

  const nonEmptyAttempt = await request({
    method: 'DELETE', path: `${coursePath()}/categories/${nonEmptyCategory.body.category_id}`, token: 'cart',
  });
  assert.strictEqual(nonEmptyAttempt.statusCode, 409);
  assert.match(nonEmptyAttempt.body.message, /Reassign or remove/);

  const beforeDelete = await request({ path: coursePath(), token: 'fnb' });
  assert.ok(beforeDelete.body.categories.some((category) => category.category_id === emptyCategory.body.category_id));

  const deleted = await request({
    method: 'DELETE', path: `${coursePath()}/categories/${emptyCategory.body.category_id}`, token: 'cart',
  });
  assert.strictEqual(deleted.statusCode, 200);
  assert.deepStrictEqual(deleted.body, { category_id: emptyCategory.body.category_id, deleted: true });

  const afterDelete = await request({ path: coursePath(), token: 'fnb' });
  assert.ok(!afterDelete.body.categories.some((category) => category.category_id === emptyCategory.body.category_id));
  assert.ok(afterDelete.body.categories.some((category) => category.category_id === nonEmptyCategory.body.category_id));
  assert.strictEqual(
    afterDelete.body.products.find((item) => item.product_id === createdProduct.body.product_id)?.name,
    'Coors Banquet'
  );

  const notFound = await request({
    method: 'DELETE', path: `${coursePath()}/categories/does-not-exist`, token: 'fnb',
  });
  assert.strictEqual(notFound.statusCode, 404);
});

test('A category whose only product is archived is deletable, matching the active-only count shown to staff; the archived product is never touched', async () => {
  const db = new FakeFirestore();
  await seedCourse(db);
  await seedMembership(db, TOKENS.fnb.uid);
  const request = createApi(db);

  const category = await request({
    method: 'POST', path: `${coursePath()}/categories`, token: 'fnb', body: { name: 'THC Drinks' },
  });
  assert.strictEqual(category.statusCode, 201);
  const created = await request({
    method: 'POST', path: `${coursePath()}/products`, token: 'fnb',
    body: product('Seniorita', 'on_cart', { category_name: 'THC Drinks', subcategory_name: null }),
  });
  assert.strictEqual(created.statusCode, 201);
  const archived = await request({
    method: 'POST', path: `${coursePath()}/products/${created.body.product_id}/archive`, token: 'fnb',
  });
  assert.strictEqual(archived.statusCode, 200);

  // The category now has zero ACTIVE products (one archived product still
  // references it); this must match what the Inventory UI counts and
  // displays, so deletion must be allowed, not rejected.
  const beforeDelete = await request({ path: coursePath(), token: 'fnb' });
  assert.strictEqual(beforeDelete.body.products.filter((p) => p.category_name === 'THC Drinks').length, 0);

  const deleted = await request({
    method: 'DELETE', path: `${coursePath()}/categories/${category.body.category_id}`, token: 'fnb',
  });
  assert.strictEqual(deleted.statusCode, 200);
  assert.deepStrictEqual(deleted.body, { category_id: category.body.category_id, deleted: true });

  const afterDelete = await request({ path: coursePath(), token: 'fnb' });
  assert.ok(!afterDelete.body.categories.some((c) => c.category_id === category.body.category_id));
  const archivedProductStillPresent = afterDelete.body.archived_products
    .find((p) => p.product_id === created.body.product_id);
  assert.strictEqual(archivedProductStillPresent?.name, 'Seniorita');
  assert.strictEqual(archivedProductStillPresent?.category_name, 'THC Drinks');
});

test('Publication snapshots are atomic, preserve last success on failure, and public reads exclude drafts', async () => {
  const db = new FakeFirestore();
  await seedCourse(db);
  await seedMembership(db, TOKENS.fnb.uid);
  await seedMembership(db, TOKENS.cart.uid);
  const request = createApi(db);

  const configured = await request({
    method: 'PATCH',
    path: `/api/v1/admin/customers/${CUSTOMER_ID}/courses/${COURSE_ID}/inventory-menu`,
    token: 'admin',
    body: { public_menu_slug: 'monarch-bay' },
  });
  assert.strictEqual(configured.statusCode, 200);
  const products = [];
  for (const [name, state] of [
    ['On Cart Item', 'on_cart'],
    ['Sold Out Item', 'sold_out'],
    ['In Inventory Item', 'in_inventory'],
    ['Archived Item', 'on_cart'],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const response = await request({ method: 'POST', path: `${coursePath()}/products`, token: 'fnb', body: product(name, state) });
    assert.strictEqual(response.statusCode, 201);
    products.push(response.body);
  }
  const archived = await request({
    method: 'POST',
    path: `${coursePath()}/products/${products[3].product_id}/archive`,
    token: 'cart',
  });
  assert.strictEqual(archived.statusCode, 200);

  const firstPublish = await request({ method: 'POST', path: `${coursePath()}/publish`, token: 'fnb' });
  assert.strictEqual(firstPublish.statusCode, 200);
  assert.strictEqual(firstPublish.body.version, 1);
  assert.strictEqual(firstPublish.body.products.length, 2);
  assert.ok(firstPublish.body.products.some((item) => item.state === 'sold_out'));
  const publicBefore = await request({ path: '/api/v1/public/menus/monarch-bay' });
  assert.strictEqual(publicBefore.statusCode, 200);
  assert.strictEqual('published_by' in publicBefore.body, false);
  assert.deepStrictEqual(publicBefore.body.products.map((item) => item.name), ['On Cart Item', 'Sold Out Item']);
  const menuBodyHasPrivateActor = JSON.stringify(publicBefore.body).includes('fnb-manager');
  assert.strictEqual(menuBodyHasPrivateActor, false);

  const editedDraft = await request({
    method: 'PATCH', path: `${coursePath()}/products/${products[0].product_id}`,
    token: 'cart', body: product('Edited Draft'),
  });
  assert.strictEqual(editedDraft.statusCode, 200);
  const publicWithDraft = await request({ path: '/api/v1/public/menus/monarch-bay' });
  assert.strictEqual(publicWithDraft.body.products[0].name, 'On Cart Item');
  const preview = await request({ path: `${coursePath()}/preview`, token: 'fnb' });
  assert.ok(preview.body.products.some((item) => item.name === 'Edited Draft'));

  db.failNextTransactionCommit = true;
  const failedPublish = await request({ method: 'POST', path: `${coursePath()}/publish`, token: 'cart' });
  assert.strictEqual(failedPublish.statusCode, 500);
  const publicAfterFailure = await request({ path: '/api/v1/public/menus/monarch-bay' });
  assert.strictEqual(publicAfterFailure.body.version, 1);
  assert.strictEqual(publicAfterFailure.body.products[0].name, 'On Cart Item');

  const secondPublish = await request({ method: 'POST', path: `${coursePath()}/publish`, token: 'cart' });
  assert.strictEqual(secondPublish.statusCode, 200);
  assert.strictEqual(secondPublish.body.version, 2);
  const publicAfterSuccess = await request({ path: '/api/v1/public/menus/monarch-bay' });
  assert.strictEqual(publicAfterSuccess.body.version, 2);
  assert.strictEqual(publicAfterSuccess.body.products[0].name, 'Edited Draft');

  const publicWrite = await request({ method: 'POST', path: '/api/v1/public/menus/monarch-bay', token: null });
  assert.strictEqual(publicWrite.statusCode, 405);
  const unconfigured = await request({ path: '/api/v1/public/menus/unknown-course' });
  assert.strictEqual(unconfigured.statusCode, 404);
});

run();