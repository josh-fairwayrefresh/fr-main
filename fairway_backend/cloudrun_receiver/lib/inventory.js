'use strict';

const crypto = require('crypto');
const { FieldValue } = require('@google-cloud/firestore');
const { coursesCollection } = require('./fleet/courses');
const { getOperatorAssignment } = require('./operator_notifications');
const { courseOperation } = require('./course_operation');

const PUBLIC_MENU_SLUGS = 'public_menu_slugs';
const INVENTORY_COLLECTION = 'inventory';
const INVENTORY_STATE_DOC = 'state';
const PRODUCTS_COLLECTION = 'inventory_products';
const CATEGORIES_COLLECTION = 'inventory_categories';
const EVENTS_COLLECTION = 'inventory_events';
const SUBCATEGORIES_COLLECTION = 'subcategories';
const PUBLISHED_MENUS_COLLECTION = 'published_menus';
const INVENTORY_STATES = new Set(['on_cart', 'sold_out', 'in_inventory']);
const MAX_MENU_BYTES = 900_000;

class InventoryError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'InventoryError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status, code, message, details) {
  throw new InventoryError(status, code, message, details);
}

function normalizeLabel(value, field, maxLength) {
  if (typeof value !== 'string') {
    fail(400, 'invalid_input', `${field} must be a string`);
  }
  const label = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!label || label.length > maxLength) {
    fail(400, 'invalid_input', `${field} is required and must be at most ${maxLength} characters`);
  }
  return label;
}

function optionalText(value, field, maxLength) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    fail(400, 'invalid_input', `${field} must be a string or null`);
  }
  const text = value.normalize('NFKC').trim();
  if (text.length > maxLength) {
    fail(400, 'invalid_input', `${field} must be at most ${maxLength} characters`);
  }
  return text || null;
}

function normalizedKey(value) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function categoryIdFor(name) {
  return `cat-${digest(normalizedKey(name))}`;
}

function subcategoryIdFor(categoryId, name) {
  return `sub-${digest(`${categoryId}\0${normalizedKey(name)}`)}`;
}

function productIdentityKey(product) {
  return digest([
    normalizedKey(product.name),
    product.category_id,
    product.subcategory_id || '',
    normalizedKey(product.brand || ''),
  ].join('\0'));
}

function inventoryStateRef(db, customerId, courseId) {
  return coursesCollection(db, customerId).doc(courseId)
    .collection(INVENTORY_COLLECTION).doc(INVENTORY_STATE_DOC);
}

function productsCollection(db, customerId, courseId) {
  return coursesCollection(db, customerId).doc(courseId).collection(PRODUCTS_COLLECTION);
}

function categoriesCollection(db, customerId, courseId) {
  return coursesCollection(db, customerId).doc(courseId).collection(CATEGORIES_COLLECTION);
}

function identityKeysCollection(db, customerId, courseId) {
  return coursesCollection(db, customerId).doc(courseId).collection('inventory_product_keys');
}

function eventsCollection(db, customerId, courseId) {
  return coursesCollection(db, customerId).doc(courseId).collection(EVENTS_COLLECTION);
}

function menuSnapshotsCollection(db, customerId, courseId) {
  return coursesCollection(db, customerId).doc(courseId).collection(PUBLISHED_MENUS_COLLECTION);
}

function courseRef(db, customerId, courseId) {
  return coursesCollection(db, customerId).doc(courseId);
}

function isValidCoursePair(value) {
  return value && typeof value.customer_id === 'string' && typeof value.course_id === 'string';
}

async function getCustomerCourses(db, uid) {
  const assignment = await getOperatorAssignment(db, uid);
  if (!assignment) {
    fail(403, 'customer_course_access_denied', 'Assigned customer course access required');
  }
  return assignment.courses.filter((course) => isValidCoursePair(course) && courseOperation(course).inventory);
}

async function requireCourseAccess(db, uid, customerId, courseId) {
  const courses = await getCustomerCourses(db, uid);
  const hasAccess = courses.some((entry) => (
    entry.customer_id === customerId && entry.course_id === courseId
  ));
  if (!hasAccess) {
    fail(403, 'customer_course_access_denied', 'Access is not authorized for this Course');
  }

  const ref = courseRef(db, customerId, courseId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    fail(404, 'course_not_found', 'Course not found');
  }
  return { ref, data: snapshot.data() };
}

async function getInventoryBootstrap(db, uid) {
  const assignments = await getCustomerCourses(db, uid);
  const courses = await Promise.all(assignments.map(async (assignment) => {
    const snapshot = await courseRef(db, assignment.customer_id, assignment.course_id).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    return {
      customer_id: assignment.customer_id,
      course_id: assignment.course_id,
      customer_name: data.customer_name || null,
      course_name: data.course_name || null,
    };
  }));
  return { courses: courses.filter(Boolean) };
}

function sortProducts(products) {
  return [...products].sort((left, right) => (
    left.category_name.localeCompare(right.category_name) ||
    (left.subcategory_name || '').localeCompare(right.subcategory_name || '') ||
    left.name.localeCompare(right.name)
  ));
}

function publicProduct(product) {
  return {
    product_id: product.product_id,
    name: product.name,
    category: product.category_name,
    subcategory: product.subcategory_name || null,
    brand: product.brand,
    description: product.description,
    price: product.price,
    state: product.state,
  };
}

function toPublicMenu(products) {
  return sortProducts(products.filter((product) => (
    product.archived !== true && ['on_cart', 'sold_out'].includes(product.state)
  ))).map(publicProduct);
}

async function listInventory(db, customerId, courseId) {
  const [courseSnapshot, stateSnapshot, productsSnapshot, categoriesSnapshot] = await Promise.all([
    courseRef(db, customerId, courseId).get(),
    inventoryStateRef(db, customerId, courseId).get(),
    productsCollection(db, customerId, courseId).get(),
    categoriesCollection(db, customerId, courseId).get(),
  ]);
  if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');

  const categoryDocs = await Promise.all(categoriesSnapshot.docs.map(async (categoryDoc) => {
    const subcategories = await categoryDoc.ref.collection(SUBCATEGORIES_COLLECTION).get();
    return {
      category_id: categoryDoc.id,
      name: categoryDoc.data().name,
      subcategories: subcategories.docs.map((subcategoryDoc) => ({
        subcategory_id: subcategoryDoc.id,
        name: subcategoryDoc.data().name,
      })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }));
  const state = stateSnapshot.exists ? stateSnapshot.data() : {};
  const products = productsSnapshot.docs.map((productDoc) => ({
    product_id: productDoc.id,
    ...productDoc.data(),
  }));

  return {
    customer_id: customerId,
    course_id: courseId,
    course_name: courseSnapshot.data().course_name || null,
    inventory_revision: state.inventory_revision || 0,
    published_version: state.published_version || 0,
    published_revision: state.published_revision ?? null,
    public_menu_slug: state.public_menu_slug || null,
    has_unpublished_changes: state.published_version
      ? (state.inventory_revision || 0) !== state.published_revision
      : (state.inventory_revision || 0) > 0,
    categories: categoryDocs.sort((a, b) => a.name.localeCompare(b.name)),
    products: sortProducts(products.filter((product) => product.archived !== true)),
    archived_products: sortProducts(products.filter((product) => product.archived === true)),
  };
}

function validateSlug(value) {
  if (typeof value !== 'string') fail(400, 'invalid_slug', 'public_menu_slug is required');
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    fail(400, 'invalid_slug', 'public_menu_slug must contain lowercase letters, numbers, and hyphens');
  }
  return slug;
}

async function configurePublicMenuSlug(db, customerId, courseId, value, actorUid) {
  const slug = validateSlug(value);
  const courseDocument = courseRef(db, customerId, courseId);
  const stateDocument = inventoryStateRef(db, customerId, courseId);
  const nextSlugRef = db.collection(PUBLIC_MENU_SLUGS).doc(slug);

  return db.runTransaction(async (transaction) => {
    const [courseSnapshot, stateSnapshot, nextSlugSnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(nextSlugRef),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    const nextSlug = nextSlugSnapshot.exists ? nextSlugSnapshot.data() : null;
    if (nextSlug && (nextSlug.customer_id !== customerId || nextSlug.course_id !== courseId)) {
      fail(409, 'slug_in_use', 'Public menu slug is already assigned to another Course');
    }

    const state = stateSnapshot.exists ? stateSnapshot.data() : {};
    const previousSlug = state.public_menu_slug || null;
    const previousSlugRef = previousSlug && previousSlug !== slug
      ? db.collection(PUBLIC_MENU_SLUGS).doc(previousSlug)
      : null;
    const previousSlugSnapshot = previousSlugRef ? await transaction.get(previousSlugRef) : null;
    if (previousSlugSnapshot?.exists) {
      const previous = previousSlugSnapshot.data();
      if (previous.customer_id === customerId && previous.course_id === courseId) {
        transaction.delete(previousSlugRef);
      }
    }

    const timestamp = FieldValue.serverTimestamp();
    transaction.set(nextSlugRef, {
      customer_id: customerId,
      course_id: courseId,
      updated_at: timestamp,
      updated_by: actorUid,
    });
    transaction.set(stateDocument, {
      ...state,
      inventory_revision: state.inventory_revision || 0,
      published_version: state.published_version || 0,
      published_revision: state.published_revision ?? null,
      public_menu_slug: slug,
      updated_at: timestamp,
      updated_by: actorUid,
    });
    return { customer_id: customerId, course_id: courseId, public_menu_slug: slug };
  });
}

function validatePrice(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !Number.isSafeInteger(value.amount_minor) || value.amount_minor < 0 ||
      typeof value.currency_code !== 'string' || !/^[A-Z]{3}$/.test(value.currency_code)) {
    fail(400, 'invalid_price', 'price must be null or { amount_minor, currency_code }');
  }
  return { amount_minor: value.amount_minor, currency_code: value.currency_code };
}

function validateProduct(body, { defaultState = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail(400, 'invalid_product', 'Product body must be an object');
  }
  const product = {
    name: normalizeLabel(body.name, 'name', 160),
    category_name: normalizeLabel(body.category_name, 'category_name', 100),
    subcategory_name: optionalText(body.subcategory_name, 'subcategory_name', 100),
    brand: optionalText(body.brand, 'brand', 120),
    description: optionalText(body.description, 'description', 4000),
    price: validatePrice(body.price),
    state: body.state === undefined && defaultState ? 'on_cart' : body.state,
  };
  if (!INVENTORY_STATES.has(product.state)) {
    fail(400, 'invalid_state', 'state must be on_cart, sold_out, or in_inventory');
  }
  return product;
}

function categoryRef(db, customerId, courseId, name) {
  return categoriesCollection(db, customerId, courseId).doc(categoryIdFor(name));
}

function categoryRefById(db, customerId, courseId, categoryId) {
  return categoriesCollection(db, customerId, courseId).doc(categoryId);
}

function subcategoryRef(db, customerId, courseId, categoryId, name) {
  return categoryRefById(db, customerId, courseId, categoryId).collection(SUBCATEGORIES_COLLECTION)
    .doc(subcategoryIdFor(categoryId, name));
}

function makeProductKey(product) {
  return productIdentityKey({
    ...product,
    subcategory_id: product.subcategory_id || '',
  });
}

function mutationEventRef(db, customerId, courseId) {
  return eventsCollection(db, customerId, courseId).doc();
}

function nextState(current, actorUid, timestamp) {
  return {
    inventory_revision: (current.inventory_revision || 0) + 1,
    published_version: current.published_version || 0,
    published_revision: current.published_revision ?? null,
    published_at: current.published_at || null,
    published_by: current.published_by || null,
    public_menu_slug: current.public_menu_slug || null,
    updated_at: timestamp,
    updated_by: actorUid,
  };
}

async function createProduct(db, customerId, courseId, body, actorUid) {
  const product = validateProduct(body, { defaultState: true });
  const courseDocument = courseRef(db, customerId, courseId);
  const stateDocument = inventoryStateRef(db, customerId, courseId);
  const products = productsCollection(db, customerId, courseId);
  const productDocument = products.doc();
  const categoryDocument = categoryRef(db, customerId, courseId, product.category_name);
  const categoryId = categoryDocument.id;
  const subcategoryDocument = product.subcategory_name
    ? subcategoryRef(db, customerId, courseId, categoryId, product.subcategory_name)
    : null;
  const productForKey = { ...product, category_id: categoryId, subcategory_id: subcategoryDocument?.id || null };
  const keyDocument = identityKeysCollection(db, customerId, courseId).doc(makeProductKey(productForKey));

  await db.runTransaction(async (transaction) => {
    const [courseSnapshot, stateSnapshot, categorySnapshot, subcategorySnapshot, keySnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(categoryDocument),
      subcategoryDocument ? transaction.get(subcategoryDocument) : Promise.resolve(null),
      transaction.get(keyDocument),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    if (keySnapshot.exists) {
      fail(409, 'duplicate_product', 'A product with the same name, category, subcategory, and brand already exists', {
        product_id: keySnapshot.data().product_id,
      });
    }

    const timestamp = FieldValue.serverTimestamp();
    const revision = ((stateSnapshot.exists ? stateSnapshot.data().inventory_revision : 0) || 0) + 1;
    const categoryName = categorySnapshot.exists ? categorySnapshot.data().name : product.category_name;
    const subcategoryName = !subcategoryDocument ? null :
      (subcategorySnapshot?.exists ? subcategorySnapshot.data().name : product.subcategory_name);
    const storedProduct = {
      ...product,
      category_id: categoryId,
      category_name: categoryName,
      subcategory_id: subcategoryDocument?.id || null,
      subcategory_name: subcategoryName,
      archived: false,
      inventory_revision: revision,
      created_at: timestamp,
      created_by: actorUid,
      updated_at: timestamp,
      updated_by: actorUid,
    };

    if (!categorySnapshot.exists) {
      transaction.set(categoryDocument, {
        name: product.category_name,
        normalized_name: normalizedKey(product.category_name),
        created_at: timestamp,
        created_by: actorUid,
      });
    }
    if (subcategoryDocument && !subcategorySnapshot?.exists) {
      transaction.set(subcategoryDocument, {
        name: product.subcategory_name,
        normalized_name: normalizedKey(product.subcategory_name),
        created_at: timestamp,
        created_by: actorUid,
      });
    }
    transaction.set(productDocument, storedProduct);
    transaction.set(keyDocument, { product_id: productDocument.id, created_at: timestamp });
    transaction.set(stateDocument, nextState(stateSnapshot?.data() || {}, actorUid, timestamp));
    transaction.set(mutationEventRef(db, customerId, courseId), {
      action: 'product_created',
      product_id: productDocument.id,
      actor_uid: actorUid,
      inventory_revision: revision,
      created_at: timestamp,
    });
  });
  const saved = await productDocument.get();
  if (!saved.exists) fail(500, 'product_save_failed', 'Saved product could not be read back');
  return { product_id: productDocument.id, ...saved.data() };
}

async function updateProduct(db, customerId, courseId, productId, body, actorUid) {
  const product = validateProduct(body);
  const courseDocument = courseRef(db, customerId, courseId);
  const stateDocument = inventoryStateRef(db, customerId, courseId);
  const productDocument = productsCollection(db, customerId, courseId).doc(productId);
  const categoryDocument = categoryRef(db, customerId, courseId, product.category_name);
  const categoryId = categoryDocument.id;
  const subcategoryDocument = product.subcategory_name
    ? subcategoryRef(db, customerId, courseId, categoryId, product.subcategory_name)
    : null;
  const newKeyDocument = identityKeysCollection(db, customerId, courseId).doc(makeProductKey({
    ...product,
    category_id: categoryId,
    subcategory_id: subcategoryDocument?.id || null,
  }));

  await db.runTransaction(async (transaction) => {
    const [courseSnapshot, stateSnapshot, productSnapshot, categorySnapshot, subcategorySnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(productDocument),
      transaction.get(categoryDocument),
      subcategoryDocument ? transaction.get(subcategoryDocument) : Promise.resolve(null),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    if (!productSnapshot.exists) fail(404, 'product_not_found', 'Product not found');
    const existing = productSnapshot.data();
    if (existing.archived === true) fail(409, 'product_archived', 'Archived products cannot be edited');
    const currentKey = existing.identity_key || makeProductKey(existing);
    const newKey = newKeyDocument.id;
    const duplicateSnapshot = currentKey === newKey ? null : await transaction.get(newKeyDocument);
    if (duplicateSnapshot?.exists && duplicateSnapshot.data().product_id !== productId) {
      fail(409, 'duplicate_product', 'A product with the same name, category, subcategory, and brand already exists', {
        product_id: duplicateSnapshot.data().product_id,
      });
    }
    const oldKeyDocument = currentKey === newKey
      ? null
      : identityKeysCollection(db, customerId, courseId).doc(currentKey);
    const oldKeySnapshot = oldKeyDocument ? await transaction.get(oldKeyDocument) : null;

    const timestamp = FieldValue.serverTimestamp();
    const revision = ((stateSnapshot.exists ? stateSnapshot.data().inventory_revision : 0) || 0) + 1;
    const categoryName = categorySnapshot.exists ? categorySnapshot.data().name : product.category_name;
    const subcategoryName = !subcategoryDocument ? null :
      (subcategorySnapshot?.exists ? subcategorySnapshot.data().name : product.subcategory_name);
    const updated = {
      ...existing,
      ...product,
      category_id: categoryId,
      category_name: categoryName,
      subcategory_id: subcategoryDocument?.id || null,
      subcategory_name: subcategoryName,
      identity_key: newKey,
      inventory_revision: revision,
      updated_at: timestamp,
      updated_by: actorUid,
    };

    if (!categorySnapshot.exists) {
      transaction.set(categoryDocument, {
        name: product.category_name,
        normalized_name: normalizedKey(product.category_name),
        created_at: timestamp,
        created_by: actorUid,
      });
    }
    if (subcategoryDocument && !subcategorySnapshot?.exists) {
      transaction.set(subcategoryDocument, {
        name: product.subcategory_name,
        normalized_name: normalizedKey(product.subcategory_name),
        created_at: timestamp,
        created_by: actorUid,
      });
    }
    transaction.set(productDocument, updated);
    if (currentKey !== newKey) {
      if (oldKeySnapshot?.exists && oldKeySnapshot.data().product_id === productId) {
        transaction.delete(oldKeyDocument);
      }
      transaction.set(newKeyDocument, { product_id: productId, created_at: timestamp });
    }
    transaction.set(stateDocument, nextState(stateSnapshot?.data() || {}, actorUid, timestamp));
    transaction.set(mutationEventRef(db, customerId, courseId), {
      action: 'product_updated',
      product_id: productId,
      actor_uid: actorUid,
      inventory_revision: revision,
      created_at: timestamp,
    });
  });
  const saved = await productDocument.get();
  if (!saved.exists) fail(500, 'product_save_failed', 'Saved product could not be read back');
  return { product_id: productId, ...saved.data() };
}

async function archiveProduct(db, customerId, courseId, productId, actorUid) {
  const courseDocument = courseRef(db, customerId, courseId);
  const stateDocument = inventoryStateRef(db, customerId, courseId);
  const productDocument = productsCollection(db, customerId, courseId).doc(productId);
  await db.runTransaction(async (transaction) => {
    const [courseSnapshot, stateSnapshot, productSnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(productDocument),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    if (!productSnapshot.exists) fail(404, 'product_not_found', 'Product not found');
    const existing = productSnapshot.data();
    if (existing.archived === true) return;

    const timestamp = FieldValue.serverTimestamp();
    const revision = ((stateSnapshot.exists ? stateSnapshot.data().inventory_revision : 0) || 0) + 1;
    transaction.set(productDocument, {
      ...existing,
      archived: true,
      inventory_revision: revision,
      archived_at: timestamp,
      archived_by: actorUid,
      updated_at: timestamp,
      updated_by: actorUid,
    });
    transaction.set(stateDocument, nextState(stateSnapshot?.data() || {}, actorUid, timestamp));
    transaction.set(mutationEventRef(db, customerId, courseId), {
      action: 'product_archived',
      product_id: productId,
      actor_uid: actorUid,
      inventory_revision: revision,
      created_at: timestamp,
    });
  });
  const saved = await productDocument.get();
  if (!saved.exists) fail(500, 'product_archive_failed', 'Archived product could not be read back');
  return { product_id: productId, ...saved.data() };
}

async function createCategory(db, customerId, courseId, value, actorUid) {
  const name = normalizeLabel(value, 'name', 100);
  const courseDocument = courseRef(db, customerId, courseId);
  const stateDocument = inventoryStateRef(db, customerId, courseId);
  const categoryDocument = categoryRef(db, customerId, courseId, name);
  const result = await db.runTransaction(async (transaction) => {
    const [courseSnapshot, stateSnapshot, categorySnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(categoryDocument),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    if (categorySnapshot.exists) return { created: false };

    const timestamp = FieldValue.serverTimestamp();
    const revision = ((stateSnapshot.exists ? stateSnapshot.data().inventory_revision : 0) || 0) + 1;
    const category = {
      name,
      normalized_name: normalizedKey(name),
      created_at: timestamp,
      created_by: actorUid,
    };
    transaction.set(categoryDocument, category);
    transaction.set(stateDocument, nextState(stateSnapshot?.data() || {}, actorUid, timestamp));
    transaction.set(mutationEventRef(db, customerId, courseId), {
      action: 'category_created',
      category_id: categoryDocument.id,
      actor_uid: actorUid,
      inventory_revision: revision,
      created_at: timestamp,
    });
    return { created: true };
  });
  const saved = await categoryDocument.get();
  return { category_id: categoryDocument.id, ...saved.data(), created: result.created };
}

async function createSubcategory(db, customerId, courseId, categoryId, value, actorUid) {
  const name = normalizeLabel(value, 'name', 100);
  const courseDocument = courseRef(db, customerId, courseId);
  const stateDocument = inventoryStateRef(db, customerId, courseId);
  const categoryDocument = categoriesCollection(db, customerId, courseId).doc(categoryId);
  const subcategoryDocument = categoryDocument.collection(SUBCATEGORIES_COLLECTION)
    .doc(subcategoryIdFor(categoryId, name));
  const result = await db.runTransaction(async (transaction) => {
    const [courseSnapshot, stateSnapshot, categorySnapshot, subcategorySnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(categoryDocument),
      transaction.get(subcategoryDocument),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    if (!categorySnapshot.exists) fail(404, 'category_not_found', 'Category not found');
    if (subcategorySnapshot.exists) {
      return { created: false };
    }

    const timestamp = FieldValue.serverTimestamp();
    const revision = ((stateSnapshot.exists ? stateSnapshot.data().inventory_revision : 0) || 0) + 1;
    const subcategory = {
      name,
      normalized_name: normalizedKey(name),
      created_at: timestamp,
      created_by: actorUid,
    };
    transaction.set(subcategoryDocument, subcategory);
    transaction.set(stateDocument, nextState(stateSnapshot?.data() || {}, actorUid, timestamp));
    transaction.set(mutationEventRef(db, customerId, courseId), {
      action: 'subcategory_created',
      category_id: categoryId,
      subcategory_id: subcategoryDocument.id,
      actor_uid: actorUid,
      inventory_revision: revision,
      created_at: timestamp,
    });
    return { created: true };
  });
  const saved = await subcategoryDocument.get();
  return { subcategory_id: subcategoryDocument.id, ...saved.data(), created: result.created };
}

/*
 * Deletes a category (and its purely organizational subcategory labels) when
 * it holds no ACTIVE products. Products are never deleted, modified, or
 * reassigned by this operation. This mirrors the product count shown to
 * staff in the Inventory UI (which also counts only active, non-archived
 * products) so "0 products in this category" and "can this be deleted" never
 * disagree. An archived product may still carry this category's id as a
 * harmless, non-blocking historical reference: archived products display
 * using their own already-cached category_name string and are never
 * re-resolved through the live category collection, so a dangling
 * category_id on an archived product after its category is deleted does not
 * break anything. A category with any ACTIVE product still assigned to it
 * (checked by category_id, which subcategories under it cannot reference
 * without also belonging to the category) is rejected with a caller-facing
 * explanation instead.
 */
async function deleteCategory(db, customerId, courseId, categoryId, actorUid) {
  const courseDocument = courseRef(db, customerId, courseId);
  const stateDocument = inventoryStateRef(db, customerId, courseId);
  const categoryDocument = categoryRefById(db, customerId, courseId, categoryId);
  const productsQuery = productsCollection(db, customerId, courseId)
    .where('category_id', '==', categoryId);
  const subcategoriesCollection = categoryDocument.collection(SUBCATEGORIES_COLLECTION);

  await db.runTransaction(async (transaction) => {
    const [courseSnapshot, stateSnapshot, categorySnapshot, productsSnapshot, subcategoriesSnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(categoryDocument),
      transaction.get(productsQuery),
      transaction.get(subcategoriesCollection),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    if (!categorySnapshot.exists) fail(404, 'category_not_found', 'Category not found');
    if (productsSnapshot.docs.some((productDoc) => productDoc.data().archived !== true)) {
      fail(409, 'category_not_empty', 'This category still has products. Reassign or remove its products before deleting it.');
    }

    const timestamp = FieldValue.serverTimestamp();
    const revision = ((stateSnapshot.exists ? stateSnapshot.data().inventory_revision : 0) || 0) + 1;
    const categoryName = categorySnapshot.data().name;
    transaction.delete(categoryDocument);
    for (const subcategoryDoc of subcategoriesSnapshot.docs) {
      transaction.delete(subcategoryDoc.ref);
    }
    transaction.set(stateDocument, nextState(stateSnapshot?.data() || {}, actorUid, timestamp));
    transaction.set(mutationEventRef(db, customerId, courseId), {
      action: 'category_deleted',
      category_id: categoryId,
      category_name: categoryName,
      actor_uid: actorUid,
      inventory_revision: revision,
      created_at: timestamp,
    });
  });
  return { category_id: categoryId, deleted: true };
}

async function configurePublicMenuSlug(db, customerId, courseId, value, actorUid) {
  const slug = validateSlug(value);
  const courseDocument = courseRef(db, customerId, courseId);
  const stateDocument = inventoryStateRef(db, customerId, courseId);
  const nextSlugRef = db.collection(PUBLIC_MENU_SLUGS).doc(slug);

  return db.runTransaction(async (transaction) => {
    const [courseSnapshot, stateSnapshot, nextSlugSnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(nextSlugRef),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    const nextSlug = nextSlugSnapshot.exists ? nextSlugSnapshot.data() : null;
    if (nextSlug && (nextSlug.customer_id !== customerId || nextSlug.course_id !== courseId)) {
      fail(409, 'slug_in_use', 'Public menu slug is already assigned to another Course');
    }

    const state = stateSnapshot.exists ? stateSnapshot.data() : {};
    const previousSlug = state.public_menu_slug || null;
    const previousSlugRef = previousSlug && previousSlug !== slug
      ? db.collection(PUBLIC_MENU_SLUGS).doc(previousSlug)
      : null;
    const previousSlugSnapshot = previousSlugRef ? await transaction.get(previousSlugRef) : null;
    if (previousSlugSnapshot?.exists) {
      const previous = previousSlugSnapshot.data();
      if (previous.customer_id === customerId && previous.course_id === courseId) {
        transaction.delete(previousSlugRef);
      }
    }

    const timestamp = FieldValue.serverTimestamp();
    transaction.set(nextSlugRef, {
      customer_id: customerId,
      course_id: courseId,
      updated_at: timestamp,
      updated_by: actorUid,
    });
    transaction.set(stateDocument, {
      ...state,
      inventory_revision: state.inventory_revision || 0,
      published_version: state.published_version || 0,
      published_revision: state.published_revision ?? null,
      public_menu_slug: slug,
      updated_at: timestamp,
      updated_by: actorUid,
    });
    return { customer_id: customerId, course_id: courseId, public_menu_slug: slug };
  });
}

function publicProducts(products) {
  return sortProducts(products.filter((product) => (
    product.archived !== true && ['on_cart', 'sold_out'].includes(product.state)
  ))).map(publicProduct);
}

function sortProducts(products) {
  return [...products].sort((left, right) => (
    left.category_name.localeCompare(right.category_name) ||
    (left.subcategory_name || '').localeCompare(right.subcategory_name || '') ||
    left.name.localeCompare(right.name)
  ));
}

function publicProduct(product) {
  return {
    product_id: product.product_id,
    name: product.name,
    category: product.category_name,
    subcategory: product.subcategory_name || null,
    brand: product.brand,
    description: product.description,
    price: product.price,
    state: product.state,
  };
}

async function previewMenu(db, customerId, courseId) {
  const [courseSnapshot, stateSnapshot, productsSnapshot] = await Promise.all([
    courseRef(db, customerId, courseId).get(),
    inventoryStateRef(db, customerId, courseId).get(),
    productsCollection(db, customerId, courseId).get(),
  ]);
  if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
  const state = stateSnapshot.exists ? stateSnapshot.data() : {};
  const products = productsSnapshot.docs.map((productDoc) => ({ product_id: productDoc.id, ...productDoc.data() }));
  return {
    course_id: courseId,
    course_name: courseSnapshot.data().course_name || null,
    inventory_revision: state.inventory_revision || 0,
    products: publicProducts(products),
  };
}

async function publishMenu(db, customerId, courseId, actorUid) {
  const courseDocument = courseRef(db, customerId, courseId);
  const stateDocument = inventoryStateRef(db, customerId, courseId);
  const productsQuery = productsCollection(db, customerId, courseId);
  const publication = await db.runTransaction(async (transaction) => {
    const [courseSnapshot, stateSnapshot, productsSnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(productsQuery),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    const state = stateSnapshot.exists ? stateSnapshot.data() : {};
    const slug = state.public_menu_slug;
    if (!slug) fail(409, 'menu_slug_not_configured', 'A public menu slug must be configured before publishing');

    const slugRef = db.collection(PUBLIC_MENU_SLUGS).doc(slug);
    const slugSnapshot = await transaction.get(slugRef);
    if (!slugSnapshot.exists || slugSnapshot.data().customer_id !== customerId || slugSnapshot.data().course_id !== courseId) {
      fail(409, 'menu_slug_not_configured', 'Public menu slug mapping is not configured for this Course');
    }

    const products = productsSnapshot.docs.map((productDoc) => ({ product_id: productDoc.id, ...productDoc.data() }));
    const menuProducts = publicProducts(products);
    const snapshotPayload = {
      course_id: courseId,
      course_name: courseSnapshot.data().course_name || null,
      version: (state.published_version || 0) + 1,
      inventory_revision: state.inventory_revision || 0,
      products: menuProducts,
    };
    if (Buffer.byteLength(JSON.stringify(snapshotPayload), 'utf8') > MAX_MENU_BYTES) {
      fail(413, 'menu_snapshot_too_large', 'Published menu exceeds the supported snapshot size');
    }

    const timestamp = FieldValue.serverTimestamp();
    const versionId = String(snapshotPayload.version).padStart(10, '0');
    transaction.set(menuSnapshotsCollection(db, customerId, courseId).doc(versionId), {
      ...snapshotPayload,
      published_at: timestamp,
      published_by: actorUid,
    });
    transaction.set(stateDocument, {
      ...state,
      inventory_revision: state.inventory_revision || 0,
      published_version: snapshotPayload.version,
      published_revision: snapshotPayload.inventory_revision,
      published_at: timestamp,
      published_by: actorUid,
      updated_at: timestamp,
      updated_by: actorUid,
    });
    transaction.set(eventsCollection(db, customerId, courseId).doc(), {
      action: 'menu_published',
      actor_uid: actorUid,
      inventory_revision: snapshotPayload.inventory_revision,
      published_version: snapshotPayload.version,
      created_at: timestamp,
    });
    return { version: snapshotPayload.version, slug };
  });
  const versionId = String(publication.version).padStart(10, '0');
  const saved = await menuSnapshotsCollection(db, customerId, courseId).doc(versionId).get();
  if (!saved.exists) fail(500, 'publication_readback_failed', 'Published snapshot could not be read back');
  return { public_menu_slug: publication.slug, ...saved.data() };
}

async function getPublicMenu(db, slugValue) {
  const slug = validateSlug(slugValue);
  const slugSnapshot = await db.collection(PUBLIC_MENU_SLUGS).doc(slug).get();
  if (!slugSnapshot.exists) fail(404, 'menu_not_found', 'Published menu not found');
  const { customer_id: customerId, course_id: courseId } = slugSnapshot.data();
  if (typeof customerId !== 'string' || typeof courseId !== 'string') {
    fail(404, 'menu_not_found', 'Published menu not found');
  }
  const stateSnapshot = await inventoryStateRef(db, customerId, courseId).get();
  if (!stateSnapshot.exists || !Number.isSafeInteger(stateSnapshot.data().published_version) || stateSnapshot.data().published_version < 1) {
    fail(404, 'menu_not_found', 'Published menu not found');
  }
  const versionId = String(stateSnapshot.data().published_version).padStart(10, '0');
  const snapshot = await menuSnapshotsCollection(db, customerId, courseId).doc(versionId).get();
  if (!snapshot.exists) fail(404, 'menu_not_found', 'Published menu not found');
  const data = snapshot.data();
  return {
    course_id: courseId,
    course_name: data.course_name,
    version: data.version,
    inventory_revision: data.inventory_revision,
    published_at: data.published_at,
    products: data.products,
  };
}

module.exports = {
  InventoryError,
  INVENTORY_STATES,
  getInventoryBootstrap,
  requireCourseAccess,
  listInventory,
  configurePublicMenuSlug,
  createCategory,
  createSubcategory,
  deleteCategory,
  createProduct,
  updateProduct,
  archiveProduct,
  previewMenu,
  publishMenu,
  getPublicMenu,
};