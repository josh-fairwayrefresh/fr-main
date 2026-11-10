import assert from 'node:assert/strict';
import test from 'node:test';
import { filterInventoryByCategory, filterInventoryBySubcategory, formatPrice, formatPublishedAt, groupPublishedProducts, matchCoursePresentation, mergeProductDraft, subcategoryNamesInProducts, usdPriceFromInput, usdPriceInput } from '../src/lib/inventoryModel.mjs';

test('course branding matches the authoritative names, not colliding environment-local IDs', () => {
  const monarchPresentation = { customerName: 'Monarch Bay GC', courseName: 'Tony Lema Course', apiSlug: 'monarch-bay' };
  assert.equal(matchCoursePresentation({
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
    customer_name: 'Sandbox Links Golf',
    course_name: 'Validation Course',
  }, [monarchPresentation]), null);
  assert.equal(matchCoursePresentation({
    customer_id: 'CUST-0021',
    course_id: 'COURSE-0042',
    customer_name: 'Monarch Bay GC',
    course_name: 'Tony Lema Course',
  }, [monarchPresentation])?.apiSlug, 'monarch-bay');
});

test('remote product updates refresh untouched draft fields while preserving local edits', () => {
  const base = { name: 'Pilsner', category_name: 'Beer', subcategory_name: '', brand: '', description: '', price_amount: '' };
  const local = { ...base, name: 'Local edit' };
  const remote = { ...base, name: 'Other staff edit', category_name: 'Draft Beer', description: 'New tasting note' };
  assert.deepEqual(mergeProductDraft(base, local, remote), {
    ...remote,
    name: 'Local edit',
  });
});

test('published grouping derives categories, subcategories, counts, and omits hidden states', () => {
  const products = [
    { name: 'Pilsner', category: 'Beer', subcategory: null, state: 'on_cart' },
    { name: 'IPA', category: 'Beer', subcategory: 'Craft', state: 'sold_out' },
    { name: 'Lager', category: 'Beer', subcategory: 'Craft', state: 'on_cart' },
    { name: 'Water', category: 'Drinks', state: 'on_cart' },
    { name: 'Stock', category: 'Drinks', state: 'in_inventory' },
    { name: 'Old', category: 'Snacks', state: 'on_cart', archived: true },
  ];
  const result = groupPublishedProducts(products);
  assert.deepEqual(result.map(({ name, count }) => [name, count]), [['Beer', 2], ['Drinks', 1]]);
  assert.deepEqual(result[0].subcategories.map(({ name, products: items }) => [name, items.length]), [['Craft', 1]]);
  assert.equal(result[0].products[0].name, 'Pilsner');
});

test('published grouping retains large categories without imposing a product cap', () => {
  const products = Array.from({ length: 30 }, (_, index) => ({
    name: `Product ${index + 1}`,
    category: 'Food',
    state: 'on_cart',
  }));
  assert.equal(groupPublishedProducts(products)[0].count, 30);
});

test('published timestamp uses the configured course timezone and timestamp precision', () => {
  const value = { seconds: Date.parse('2026-01-15T20:05:00Z') / 1000, nanoseconds: 0 };
  assert.equal(formatPublishedAt(value, 'America/Los_Angeles'), '01/15/2026 12:05 PM PST');
  assert.equal(formatPublishedAt(value, 'America/New_York'), '01/15/2026 3:05 PM EST');
  assert.equal(formatPublishedAt(null, 'America/Los_Angeles'), null);
});

test('optional prices format from their supplied currency and remain absent when blank', () => {
  assert.equal(formatPrice({ amount_minor: 450, currency_code: 'USD' }), '$4.50');
  assert.equal(formatPrice({ amount_minor: 450, currency_code: 'JPY' }), '¥450');
  assert.equal(formatPrice(null), null);
});

test('dollar price input converts exactly to USD minor units and supports nullable prices', () => {
  assert.deepEqual(usdPriceFromInput('4'), { price: { amount_minor: 400, currency_code: 'USD' }, error: null });
  assert.deepEqual(usdPriceFromInput('4.5'), { price: { amount_minor: 450, currency_code: 'USD' }, error: null });
  assert.deepEqual(usdPriceFromInput('4.56'), { price: { amount_minor: 456, currency_code: 'USD' }, error: null });
  assert.deepEqual(usdPriceFromInput(''), { price: null, error: null });
  assert.match(usdPriceFromInput('4.567').error, /two decimal places/);
  assert.equal(usdPriceInput({ amount_minor: 456, currency_code: 'USD' }), '4.56');
  assert.equal(usdPriceInput({ amount_minor: 456, currency_code: 'CAD' }), '');
});

test('category filtering applies one top-level category to active products and All restores all states', () => {
  const products = [
    { name: 'Beer', category_name: 'Craft Beers', state: 'on_cart' },
    { name: 'Water', category_name: 'Non-Alcoholic', state: 'in_inventory' },
    { name: 'Old', category_name: 'Craft Beers', state: 'on_cart', archived: true },
  ];
  assert.deepEqual(filterInventoryByCategory(products, 'Craft Beers').map(product => product.name), ['Beer']);
  assert.deepEqual(filterInventoryByCategory(products, 'all').map(product => product.name), ['Beer', 'Water']);
});

test('subcategory filtering narrows an already category-filtered list without modifying inventory data', () => {
  const products = [
    { name: 'Lager', category_name: 'Craft Beers', subcategory_name: 'Lager', state: 'on_cart' },
    { name: 'IPA', category_name: 'Craft Beers', subcategory_name: 'IPA', state: 'on_cart' },
    { name: 'Misc Beer', category_name: 'Craft Beers', subcategory_name: null, state: 'on_cart' },
  ];
  assert.deepEqual(filterInventoryBySubcategory(products, 'Lager').map((p) => p.name), ['Lager']);
  assert.deepEqual(filterInventoryBySubcategory(products, 'all').map((p) => p.name), ['Lager', 'IPA', 'Misc Beer']);
  // Pure filtering: the input array and its objects are untouched.
  assert.deepEqual(products.map((p) => p.name), ['Lager', 'IPA', 'Misc Beer']);
});

test('subcategory names are derived from existing product data only, sorted, and deduplicated', () => {
  const products = [
    { name: 'A', subcategory_name: 'Lager' },
    { name: 'B', subcategory_name: 'IPA' },
    { name: 'C', subcategory_name: 'Lager' },
    { name: 'D', subcategory_name: null },
    { name: 'E', subcategory_name: '' },
  ];
  assert.deepEqual(subcategoryNamesInProducts(products), ['IPA', 'Lager']);
  assert.deepEqual(subcategoryNamesInProducts([]), []);
});
