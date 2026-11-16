'use strict';

const crypto = require('node:crypto');
const { normalizeLabel, normalizedKey, optionalText, validatePrice } = require('./inventory');

function invalid(message) {
  throw new Error(`Invalid restaurant import: ${message}`);
}

function fields(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) {
    invalid(`expected fields ${required.join(', ')}${optional.length ? `; optional ${optional.join(', ')}` : ''}`);
  }
}

function stableId(prefix, ...parts) {
  return `${prefix}-${crypto.createHash('sha256')
    .update(JSON.stringify(parts)).digest('hex').slice(0, 32)}`;
}

function exactLabel(value, field, limit) {
  const result = normalizeLabel(value, field, limit);
  if (result !== value) invalid(`${field} must already be normalized`);
  return result;
}

function exactOptionalText(value, field, limit) {
  const result = optionalText(value, field, limit);
  if (result !== value) invalid(`${field} must be normalized or null`);
  return result;
}

function ordered(values, label) {
  if (!Array.isArray(values) || !values.length) invalid(`${label} must be a nonempty array`);
  let prior = -1;
  for (const value of values) {
    if (!Number.isSafeInteger(value?.sort_order) || value.sort_order < 0 ||
        value.sort_order <= prior) invalid(`${label} sort_order must be strictly increasing`);
    prior = value.sort_order;
  }
}

// This only validates and previews supplied content; an approval flag in a file
// is not evidence that a production import has been authorized.
function previewRestaurantImport(input) {
  fields(input, ['schema_version', 'customer_id', 'menu_name', 'title', 'subtitle',
    'footer', 'categories', 'source']);
  if (input.schema_version !== 1 || input.menu_name !== 'restaurant_menu' ||
      typeof input.customer_id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(input.customer_id)) {
    invalid('invalid schema, customer or menu name');
  }
  fields(input.source, ['filename', 'sha256', 'cpo_approved', 'approved_at'], ['corrections']);
  if (typeof input.source.filename !== 'string' || !input.source.filename.trim() ||
      typeof input.source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.source.sha256) ||
      input.source.cpo_approved !== true || typeof input.source.approved_at !== 'string' ||
      !Number.isFinite(Date.parse(input.source.approved_at)) ||
      (input.source.corrections !== undefined && (!Array.isArray(input.source.corrections) ||
        input.source.corrections.some((item) => typeof item !== 'string' || !item.trim())))) {
    invalid('invalid source metadata');
  }
  ordered(input.categories, 'categories');
  const categoriesSeen = new Set();
  const allIds = new Set();
  const categories = input.categories.map((category) => {
    fields(category, ['name', 'sort_order', 'note', 'products']);
    const name = exactLabel(category.name, 'category name', 100);
    const key = normalizedKey(name);
    if (categoriesSeen.has(key)) invalid('duplicate category');
    categoriesSeen.add(key);
    const categoryId = stableId('cat', input.customer_id, input.menu_name, key);
    const productNames = new Set();
    ordered(category.products, 'products');
    const products = category.products.map((product) => {
      fields(product, ['name', 'description', 'price', 'state', 'sort_order']);
      const productName = exactLabel(product.name, 'product name', 160);
      const productKey = normalizedKey(productName);
      if (productNames.has(productKey)) invalid('duplicate product in category');
      productNames.add(productKey);
      if (product.state !== 'on_menu') invalid('all imported products must be on_menu');
      fields(product.price, ['amount_minor', 'currency_code']);
      const price = validatePrice(product.price);
      if (!price) invalid('product price is required');
      const productId = stableId('prod', input.customer_id, input.menu_name, key, productKey);
      if (allIds.has(productId)) invalid('product identity collision');
      allIds.add(productId);
      return {
        product_id: productId,
        name: productName,
        category_id: categoryId,
        description: exactOptionalText(product.description, 'description', 4000),
        price,
        state: product.state,
        sort_order: product.sort_order,
      };
    });
    return {
      category_id: categoryId,
      name,
      note: exactOptionalText(category.note, 'category note', 4000),
      sort_order: category.sort_order,
      products,
    };
  });
  return {
    schema_version: 1,
    customer_id: input.customer_id,
    menu_name: input.menu_name,
    title: exactLabel(input.title, 'title', 160),
    subtitle: exactOptionalText(input.subtitle, 'subtitle', 400),
    footer: exactOptionalText(input.footer, 'footer', 1000),
    categories,
    source: { ...input.source },
    product_count: allIds.size,
    mode: 'preview_only',
  };
}

async function importRestaurantMenu(db, menuId, input, actorUid) {
  const preview = previewRestaurantImport(input);
  if (preview.categories.length + preview.product_count + 2 > 500) {
    throw new Error('Restaurant import exceeds the atomic transaction write limit');
  }
  const { menuRef, id } = require('./customer_menus');
  id(actorUid);
  const ref = menuRef(db, preview.customer_id, menuId);
  return db.runTransaction(async (tx) => {
    const [menu, categories, products, state] = await Promise.all([
      tx.get(ref), tx.get(ref.collection('categories')),
      tx.get(ref.collection('products')), tx.get(ref.collection('catalog').doc('state')),
    ]);
    if (!menu.exists || menu.data().type !== 'restaurant' || menu.data().state !== 'active' ||
        menu.data().name !== preview.menu_name) {
      throw new Error('Import requires the matching active Customer restaurant menu');
    }
    if (categories.size || products.size || state.exists) {
      throw new Error('Restaurant import cannot replace an existing catalog or its history');
    }
    const now = new Date();
    for (const category of preview.categories) {
      const { category_id: categoryId, products: items, ...categoryRecord } = category;
      tx.set(ref.collection('categories').doc(categoryId), {
        ...categoryRecord, created_at: now, created_by: actorUid,
      });
      for (const product of items) {
        const { product_id: productId, ...productRecord } = product;
        tx.set(ref.collection('products').doc(productId), {
          ...productRecord, category_name: category.name, archived: false, brand: null,
          subcategory_id: null, subcategory_name: null,
          created_at: now, created_by: actorUid, updated_at: now, updated_by: actorUid,
        });
      }
    }
    tx.set(ref.collection('catalog').doc('state'), {
      revision: 1, updated_at: now, updated_by: actorUid, source: preview.source,
    });
    tx.update(ref, {
      title: preview.title, subtitle: preview.subtitle, footer: preview.footer,
      updated_at: now, updated_by: actorUid,
    });
    return { menu_id: menuId, product_count: preview.product_count, revision: 1 };
  });
}

module.exports = { importRestaurantMenu, previewRestaurantImport };
