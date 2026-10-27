'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { FakeFirestore } = require('./fake_firestore');
const inventory = require('../lib/inventory');

test('release reads preserve 58 legacy products and all stored fields without writes or availability changes', async () => {
  const db = new FakeFirestore();
  const customer = db.collection('customers').doc('release-customer');
  const course = customer.collection('courses').doc('release-course');
  await customer.set({ customer_name: 'Isolated release fixture' });
  await course.set({ course_name: 'Representative Course', timezone: 'America/Los_Angeles' });
  await course.collection('inventory').doc('state').set({
    inventory_revision: 91, public_menu_slug: 'release-menu', published_version: 'historical',
    published_revision: 80, published_by: 'historical-account',
  });
  await db.collection('public_menu_slugs').doc('release-menu').set({
    customer_id: customer.id, course_id: course.id,
  });
  for (let index = 0; index < 58; index += 1) {
    await course.collection('inventory_products').doc(`stable-${index}`).set({
      name: `Product ${index}`, category_id: 'drinks', category_name: 'Drinks',
      subcategory_id: null, subcategory_name: null, brand: 'Original brand',
      description: 'Original description', price: { amount_minor: 500, currency_code: 'USD', internal_cost: 123 },
      state: ['on_cart', 'sold_out', 'in_inventory'][index % 3], archived: index === 57,
      custom_metadata: { preserved: true }, created_by: 'original-account',
      ...(index % 4 === 0 ? { quantity: index, stock_revision: index } : {}),
    });
  }
  const before = JSON.stringify([...db._docs]);
  const view = await inventory.listInventory(db, customer.id, course.id);
  assert.equal(view.products.length + view.archived_products.length, 58);
  for (const product of [...view.products, ...view.archived_products]) {
    const stored = (await course.collection('inventory_products').doc(product.product_id).get()).data();
    for (const key of Object.keys(stored)) assert.deepEqual(product[key], stored[key], key);
    assert.equal(product.quantity, stored.quantity ?? 0);
    assert.equal(product.stock_revision, stored.stock_revision ?? 0);
  }
  const menu = await inventory.getPublicMenu(db, 'release-menu');
  assert.equal(menu.products.length, view.products.filter((product) => product.state === 'on_cart').length);
  for (const product of menu.products) {
    assert.deepEqual(Object.keys(product).sort(), [
      'brand', 'category', 'description', 'name', 'price', 'product_id', 'state', 'subcategory',
    ]);
    assert.deepEqual(product.price, { amount_minor: 500, currency_code: 'USD' });
  }
  assert.equal(JSON.stringify([...db._docs]), before);
});

test('actual production runtime cannot enable sandbox provisioning, even with the review flag set', () => {
  const environment = {
    ...process.env, FAIRWAY_ENV: 'production', FAIRWAY_GCP_PROJECT: 'savvy-kit-496703-r5',
    GOOGLE_CLOUD_PROJECT: 'savvy-kit-496703-r5', FAIRWAY_SERVICE_MODE: 'receiver',
    FAIRWAY_ALLOWED_ORIGIN: '', FAIRWAY_PUBLIC_REVIEW: 'false',
  };
  const script = `
    const assert = require('node:assert/strict');
    const { createFairwayHandlers } = require('./index');
    const { FakeFirestore } = require('./test/fake_firestore');
    const { publicReviewConfiguration } = require('./lib/public_sandbox_review');
    const response = { set(){return this}, status(code){this.code=code;return this},
      json(body){this.body=body;return this}, send(body){this.body=body;return this} };
    createFairwayHandlers(new FakeFirestore()).fairwayButtonReceiver({
      path:'/api/v1/sandbox/review-access',method:'POST'
    },response).then(()=>{
      assert.equal(response.code,404);
      assert.throws(()=>publicReviewConfiguration({...process.env,FAIRWAY_PUBLIC_REVIEW:'true'}),/sandbox/);
      console.log('Production provisioner disabled; enabling it fails closed');
    }).catch(error=>{console.error(error);process.exitCode=1});
  `;
  const result = execFileSync(process.execPath, ['-e', script], {
    cwd: require('node:path').join(__dirname, '..'), env: environment, encoding: 'utf8',
  });
  assert.match(result, /Production provisioner disabled/);
});
