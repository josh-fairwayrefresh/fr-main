import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRestaurantCatalog, restaurantProductBody } from '../src/lib/menuCatalog.mjs';

const categories = [{ category_id: 'cat-1', name: 'Sandwiches', subcategories: [{ subcategory_id: 'sub-1', name: 'Hot' }] }];

test('restaurant catalog resolves stable category IDs and preserves availability', () => {
  const result = normalizeRestaurantCatalog({ categories, products: [
    { product_id: 'p1', category_id: 'cat-1', subcategory_id: 'sub-1', state: 'on_menu' },
    { product_id: 'p2', category_id: 'cat-1', state: 'sold_out' },
  ] });
  assert.equal(result.products[0].category_name, 'Sandwiches');
  assert.equal(result.products[0].subcategory_name, 'Hot');
  assert.equal(result.products[1].state, 'sold_out');
  assert.throws(() => normalizeRestaurantCatalog({ categories, products: [{ product_id: 'bad', state: 'on_cart' }] }), /invalid product/);
});

test('restaurant editor resolves explicit categories and rejects unknown names', () => {
  assert.deepEqual(restaurantProductBody({ name: 'A', category_name: 'sandwiches', subcategory_name: 'Hot', state: 'on_menu' }, categories),
    { name: 'A', category_id: 'cat-1', subcategory_id: 'sub-1', state: 'on_menu' });
  assert.throws(() => restaurantProductBody({ category_name: 'Missing' }, categories), /existing category/);
});
