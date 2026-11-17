'use strict';

const crypto = require('node:crypto');
const inventory = require('./inventory');
const registry = require('./customer_menus');
const customerBranding = require('./customer_branding');
const storage = require('./operational_storage');

function fail(status, code, message) { throw new inventory.InventoryError(status, code, message); }
function categoryId(name) {
  return `cat-${crypto.createHash('sha256').update(inventory.normalizedKey(name)).digest('hex').slice(0, 32)}`;
}
function order(left, right) {
  return (left.sort_order ?? 0) - (right.sort_order ?? 0) || left.name.localeCompare(right.name);
}
function stateRef(ref) { return ref.collection('catalog').doc('state'); }
function products(ref) { return ref.collection('products'); }
function categories(ref) { return ref.collection('categories'); }

async function catalog(db, uid, customerId, menuId) {
  const { ref } = await registry.requireMenu(db, uid, customerId, menuId, 'restaurant');
  return db.runTransaction(async (tx) => {
    const [menu, productDocs, categoryDocs, state] = await Promise.all([
      tx.get(ref), tx.get(products(ref)), tx.get(categories(ref)), tx.get(stateRef(ref)),
    ]);
    if (!menu.exists || menu.data().state !== 'active') fail(410, 'menu_unavailable', 'Menu unavailable');
    return {
      revision: state.data()?.revision || 0,
      categories: categoryDocs.docs.map((doc) => ({ category_id: doc.id, ...doc.data(), subcategories: [] })).sort(order),
      products: productDocs.docs.map((doc) => ({ product_id: doc.id, ...doc.data() })).sort(order),
    };
  }, { readOnly: true });
}

async function mutate(db, uid, customerId, menuId, action, itemId, body) {
  const { ref } = await registry.requireMenu(db, uid, customerId, menuId, 'restaurant');
  return db.runTransaction(async (tx) => {
    const [menu, state, categoryDocs, productDocs] = await Promise.all([
      tx.get(ref), tx.get(stateRef(ref)), tx.get(categories(ref)), tx.get(products(ref)),
    ]);
    if (!menu.exists || menu.data().state !== 'active') fail(410, 'menu_unavailable', 'Menu unavailable');
    const now = new Date();
    const revision = (state.data()?.revision || 0) + 1;
    let result;
    if (action === 'category_create') {
      registry.fields(body, ['name']);
      const name = inventory.normalizeLabel(body.name, 'name', 100);
      const refCategory = categories(ref).doc(categoryId(name));
      const existing = categoryDocs.docs.find((doc) =>
        inventory.normalizedKey(doc.data().name) === inventory.normalizedKey(name));
      if (existing) fail(409, 'category_exists', 'Category already exists');
      const sortOrder = Math.max(-1, ...categoryDocs.docs.map((doc) => doc.data().sort_order ?? 0)) + 1;
      const value = { name, note: null, sort_order: sortOrder, created_at: now, created_by: uid };
      tx.set(refCategory, value);
      result = { category_id: refCategory.id, ...value };
    } else if (action === 'category_delete') {
      registry.fields(body || {}, []);
      const category = categoryDocs.docs.find((doc) => doc.id === registry.id(itemId));
      if (!category) fail(404, 'category_not_found', 'Category not found');
      if (productDocs.docs.some((doc) => doc.data().category_id === itemId && doc.data().archived !== true)) {
        fail(409, 'category_not_empty', 'Category contains active products');
      }
      tx.delete(category.ref);
      result = { category_id: itemId, deleted: true };
    } else {
      registry.fields(body, ['name', 'category_id', 'subcategory_id', 'brand', 'description', 'price', 'state', 'archived']);
      const oldDoc = itemId && productDocs.docs.find((doc) => doc.id === registry.id(itemId));
      if (itemId && !oldDoc) fail(404, 'product_not_found', 'Product not found');
      const old = oldDoc?.data() || {};
      if (old.archived) fail(409, 'product_archived', 'Archived product cannot be edited');
      if (body.subcategory_id !== undefined && body.subcategory_id !== null) fail(400, 'invalid_subcategory', 'Subcategories are not supported');
      if (body.archived !== undefined && body.archived !== true) fail(400, 'invalid_archive', 'Archive must be true');
      const category = categoryDocs.docs.find((doc) => doc.id === (body.category_id ?? old.category_id));
      if (!category) fail(400, 'invalid_category', 'Select an existing category');
      const name = inventory.normalizeLabel(body.name ?? old.name, 'name', 160);
      const brand = inventory.optionalText(body.brand !== undefined ? body.brand : old.brand, 'brand', 120);
      const description = inventory.optionalText(body.description !== undefined ? body.description : old.description, 'description', 4000);
      const price = inventory.validatePrice(body.price !== undefined ? body.price : old.price);
      const stateValue = body.state ?? old.state ?? 'on_menu';
      if (!registry.states.has(stateValue)) fail(400, 'invalid_state', 'Invalid menu state');
      if (productDocs.docs.some((doc) => doc.id !== itemId && !doc.data().archived &&
          doc.data().category_id === category.id &&
          inventory.normalizedKey(doc.data().name) === inventory.normalizedKey(name) &&
          inventory.normalizedKey(doc.data().brand || '') === inventory.normalizedKey(brand || ''))) {
        fail(409, 'duplicate_product', 'Product already exists');
      }
      const target = oldDoc?.ref || products(ref).doc();
      const sortOrder = old.sort_order ?? Math.max(-1, ...productDocs.docs.map((doc) => doc.data().sort_order ?? 0)) + 1;
      const value = {
        ...old, name, category_id: category.id, category_name: category.data().name,
        subcategory_id: null, subcategory_name: null, brand, description, price,
        state: stateValue, archived: body.archived === true, sort_order: sortOrder,
        updated_at: now, updated_by: uid,
        ...(oldDoc ? {} : { created_at: now, created_by: uid }),
      };
      tx.set(target, value);
      result = { product_id: target.id, ...value };
    }
    tx.set(stateRef(ref), { revision, updated_at: now, updated_by: uid });
    return result;
  });
}

async function publicMenu(db, slugValue) {
  const slug = registry.slug(slugValue);
  return db.runTransaction(async (tx) => {
    const alias = await tx.get(db.collection('public_menu_slugs').doc(slug));
    if (alias.exists && alias.data().menu_id === undefined && typeof alias.data().course_id === 'string') {
      if (storage.mode() !== 'legacy') fail(409, 'menu_registration_required', 'Register the legacy menu before Customer cutover');
      return { ...await inventory.getPublicMenu(db, slug), type: 'cart' };
    }
    if (!alias.exists || typeof alias.data().customer_id !== 'string' || typeof alias.data().menu_id !== 'string') {
      fail(404, 'menu_not_found', 'Menu not found');
    }
    const customerId = registry.id(alias.data().customer_id);
    const ref = registry.menuRef(db, customerId, alias.data().menu_id);
    const [menuDoc, customer] = await Promise.all([tx.get(ref), tx.get(registry.customerRef(db, customerId))]);
    if (!menuDoc.exists || !customer.exists) fail(404, 'menu_not_found', 'Menu not found');
    const menu = menuDoc.data();
    if (menu.state !== 'active') fail(410, 'menu_unavailable', 'Menu unavailable');
    if (![menu.slug, ...(menu.aliases || [])].includes(slug)) fail(404, 'menu_not_found', 'Menu not found');
    const owner = menu.type === 'cart'
      ? storage.inventoryRef(db, customerId, registry.id(menu.asset_id))
      : ref;
    if (menu.type === 'cart') {
      await storage.assertOwner(db, customerId, tx);
      const asset = await tx.get(registry.assetRef(db, customerId, menu.asset_id));
      if (!asset.exists || asset.data().type !== 'cart') {
        fail(409, 'migration_required', 'Registered cart asset is unavailable');
      }
    }
    const productCollection = menu.type === 'cart' ? owner.collection('inventory_products') : products(ref);
    const stateDocument = menu.type === 'cart' ? owner.collection('inventory').doc('state') : stateRef(ref);
    const categoryCollection = menu.type === 'cart' ? owner.collection('inventory_categories') : categories(ref);
    const [ownerSnap, productDocs, state, categoryDocs, branding] = await Promise.all([
      tx.get(owner), tx.get(productCollection), tx.get(stateDocument), tx.get(categoryCollection),
      customerBranding.publicBranding(tx, db, customerId),
    ]);
    if (!ownerSnap.exists) fail(409, 'migration_required', 'Menu asset is unavailable');
    const catalogProducts = productDocs.docs.map((doc) => ({ ...doc.data(), product_id: doc.id }));
    const publicProducts = menu.type === 'cart'
      ? inventory.toPublicMenu(catalogProducts)
      : catalogProducts.filter((product) => product.archived !== true && product.state === 'on_menu')
        .sort(order).map(inventory.publicProduct);
    return {
      menu_id: menuDoc.id, type: menu.type, customer_id: customerId, customer_name: customer.data().customer_name || customerId,
      name: menu.name, title: menu.title || menu.name, subtitle: menu.subtitle || null, footer: menu.footer || null,
      timezone: menu.timezone || ownerSnap.data().timezone || null,
      updated_at: state.data()?.updated_at || menu.updated_at || null,
      revision: state.data()?.revision ?? state.data()?.inventory_revision ?? 0,
      branding,
      categories: categoryDocs.docs.map((doc) => ({ name: doc.data().name, note: doc.data().note || null, sort_order: doc.data().sort_order ?? 0 })).sort(order),
      products: publicProducts,
    };
  }, { readOnly: true });
}

module.exports = { catalog, mutate, publicMenu };
