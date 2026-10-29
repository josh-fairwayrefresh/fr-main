import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const inventorySource = await readFile(new URL('../src/InventoryApp.jsx', import.meta.url), 'utf8');

test('Inventory dashboard uses the concise title and keeps readable course identity without IDs', () => {
  assert.match(inventorySource, /<h1>CART INVENTORY MANAGEMENT DASHBOARD<\/h1>/);
  assert.doesNotMatch(inventorySource, /CART INVENTORY MANAGEMENT DASHBOARD - MONARCH BAY GC/);
  assert.match(inventorySource, /course\.customer_name \|\| 'MONARCH BAY GC'/);
  assert.match(inventorySource, /<p className="inv-subtitle">\{course\.course_name\}<\/p>/);
  assert.doesNotMatch(inventorySource, /<p className="inv-eyebrow">\{course\.customer_name[^<]+course\.course_id/);
});

test('Inventory is a feature within Cart UI: no independent auth system and a clear return to Cart Operations', () => {
  assert.doesNotMatch(inventorySource, /firebase|getAuth|initializeApp|signIn/i);
  assert.match(inventorySource, /className="inv-brand" title="Return to Cart Operations"/);
  assert.match(inventorySource, /fairway-refresh-stacked-transparent\.png/);
  assert.match(inventorySource, /src=\{fairwayRefreshStackedLogo\} alt="Fairway Refresh"/);
  assert.match(inventorySource, /className="inv-cart-link" href=\{contextPending \? undefined : courseContextUrl\('\/', course\)\} aria-disabled=\{contextPending \|\| undefined\} title="Return to Cart Operations"/);
  assert.match(inventorySource, /replaceCourseContext\('\/inventory', selected\)/);
  assert.match(inventorySource, /onOpenAdmin/);
  assert.match(inventorySource, />Cart Operations<\/a>/);
});

test('Add Product shows exactly one plus sign and no duplicate icon+text plus', () => {
  assert.match(inventorySource, />\+ Add Product<\/button>/);
  assert.doesNotMatch(inventorySource, /<Plus size=\{17\} \/>\+ (Add )?Product/);
  assert.doesNotMatch(inventorySource, /\bPlus,/); // the bare Plus icon import is no longer used
});

test('category filters open a management card with Delete Category, protected against nonempty categories', () => {
  assert.match(inventorySource, /setCategoryManager\(category\)/);
  assert.match(inventorySource, /function CategoryManagerDialog/);
  assert.match(inventorySource, /Delete Category/);
  assert.match(inventorySource, /Are you sure you want to delete the/);
  assert.match(inventorySource, /category\.name/); // confirmation identifies the category by name
  assert.match(inventorySource, /canDelete = productCount === 0/);
  assert.match(inventorySource, /disabled=\{!canDelete\}/);
  assert.match(inventorySource, /This category still has products\. Reassign or remove its products before deleting it\./);
  assert.match(inventorySource, /session\.request\(`\/categories\/\$\{encodeURIComponent\(category\.category_id\)\}`, \{\}, 'DELETE'\)/);
  assert.doesNotMatch(inventorySource, /deleteProduct|cascadeDelete/i);
  assert.match(inventorySource, /onDeleted=\{async \(\) => \{/);
  assert.match(inventorySource, /await refreshInventory\(true\);\s*\}\}/);
});

test('subcategory filters appear as a second row, reset on category change, and never mutate inventory', () => {
  assert.match(inventorySource, /className="inv-subcategory-filters"/);
  assert.match(inventorySource, /function selectCategory\(categoryName\) \{\s*setSelectedCategory\(categoryName\);\s*setSelectedSubcategory\('all'\);\s*\}/);
  assert.match(inventorySource, /onClick=\{\(\) => selectCategory\('all'\)\}/);
  assert.match(inventorySource, /onClick=\{\(\) => selectCategory\(category\.name\)\}/);
  assert.match(inventorySource, /selectedCategory !== 'all' && subcategoryNames\.length > 0/);
  assert.match(inventorySource, /filterInventoryBySubcategory/);
  assert.doesNotMatch(inventorySource, /inventoryRequest.*subcategory.*selectedSubcategory/i);
});

test('public menu uses category icons and retains NA for Non-Alcoholic', async () => {
  const publicMenuSource = await readFile(new URL('../src/PublicMenuApp.jsx', import.meta.url), 'utf8');
  assert.match(publicMenuSource, /'craft beers': Beer/);
  assert.match(publicMenuSource, /shots: GlassWater/);
  assert.match(publicMenuSource, /cocktails: Martini/);
  assert.match(publicMenuSource, /'canned cocktails': CannedCocktailIcon/);
  assert.match(publicMenuSource, /food: Sandwich/);
  assert.match(publicMenuSource, /name\.trim\(\)\.toLowerCase\(\) === 'non-alcoholic'\) return 'NA'/);
  assert.match(publicMenuSource, /<CategoryMark name=\{category\.name\} \/>/);
  assert.doesNotMatch(publicMenuSource, /categoryInitials/);
});