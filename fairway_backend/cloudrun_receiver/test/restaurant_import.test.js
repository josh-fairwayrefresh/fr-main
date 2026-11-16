'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { importRestaurantMenu, previewRestaurantImport } = require('../lib/restaurant_import');
const { FakeFirestore } = require('./fake_firestore');
const { mutate, publicMenu } = require('../lib/restaurant_catalog');

function fixture() {
  return {
    schema_version: 1,
    customer_id: 'CUST-0001',
    menu_name: 'restaurant_menu',
    title: 'A title',
    subtitle: 'A subtitle',
    footer: 'A footer',
    source: {
      filename: 'source.docx',
      sha256: 'a'.repeat(64),
      cpo_approved: true,
      approved_at: '2026-11-15',
    },
    categories: [{
      name: 'Food',
      sort_order: 1,
      note: 'A note',
      products: [{
        name: 'Example',
        description: 'A description',
        price: { amount_minor: 1200, currency_code: 'USD' },
        state: 'on_menu',
        sort_order: 1,
      }],
    }],
  };
}

test('import preview preserves supplied text, order, and deterministic identities', () => {
  const input = fixture();
  const result = previewRestaurantImport(input);
  assert.equal(result.mode, 'preview_only');
  assert.equal(result.product_count, 1);
  assert.equal(result.categories[0].note, input.categories[0].note);
  assert.equal(result.categories[0].products[0].description, input.categories[0].products[0].description);
  assert.deepEqual(result, previewRestaurantImport(input));
});

test('rejects duplicate identities and invalid or unexpected content', () => {
  const cases = [];
  let input = fixture();
  input.categories[0].products.push({ ...input.categories[0].products[0], name: 'EXAMPLE', sort_order: 2 });
  cases.push(input);
  input = fixture();
  input.categories.push({ ...input.categories[0], name: 'FOOD', sort_order: 2 });
  cases.push(input);
  input = fixture();
  input.categories[0].products[0].state = 'in_inventory';
  cases.push(input);
  input = fixture();
  input.categories[0].products[0].quantity = 10;
  cases.push(input);
  input = fixture();
  input.categories[0].products[0].price.internal_cost = 4;
  cases.push(input);
  input = fixture();
  input.categories[0].products[0].description = 'Changed by trimming ';
  cases.push(input);
  input = fixture();
  input.source.cpo_approved = false;
  cases.push(input);
  for (const candidate of cases) assert.throws(() => previewRestaurantImport(candidate));
});

test('atomic import exposes exact approved text and notes without touching cart data or replacing a catalog', async () => {
  const db = new FakeFirestore();
  const input = fixture();
  const customer = db.collection('customers').doc(input.customer_id);
  await customer.set({ customer_name: 'Fictional Customer' });
  const cart = customer.collection('courses').doc('cart');
  await cart.collection('inventory_products').doc('water').set({ quantity: 7 });
  const menu = customer.collection('menus').doc('restaurant');
  await menu.set({ type: 'restaurant', name: input.menu_name, state: 'active', slug: 'restaurant', aliases: [] });
  await db.collection('public_menu_slugs').doc('restaurant').set({
    customer_id: customer.id, menu_id: menu.id,
  });
  const result = await importRestaurantMenu(db, menu.id, input, 'admin');
  assert.equal(result.product_count, 1);
  const view = await publicMenu(db, 'restaurant');
  assert.equal(view.title, input.title);
  assert.equal(view.categories[0].note, input.categories[0].note);
  assert.equal(view.products[0].description, input.categories[0].products[0].description);
  assert.deepEqual(view.products[0].price, input.categories[0].products[0].price);
  await db.collection('user_access').doc('admin').set({
    schema_version: 3, admin: true, customer_id: null, menu_ids: [], service_ids: [],
  });
  await assert.rejects(mutate(db, 'admin', customer.id, menu.id, 'category_create', null, { name: 'FOOD' }),
    error => error.code === 'category_exists');
  assert.deepEqual((await cart.collection('inventory_products').doc('water').get()).data(), { quantity: 7 });
  const before = JSON.stringify([...db._docs]);
  await assert.rejects(importRestaurantMenu(db, menu.id, input, 'admin'), /cannot replace/);
  assert.equal(JSON.stringify([...db._docs]), before);
});
