'use strict';

const crypto = require('crypto');
const { FieldValue } = require('@google-cloud/firestore');
const { coursesCollection } = require('./fleet/courses');
const { getOperatorAssignment } = require('./operator_notifications');
const { INVENTORY_STAFF_ROLES, canOperateInventory } = require('./user_access');

const PUBLIC_MENU_SLUGS = 'public_menu_slugs';
const INVENTORY_COLLECTION = 'inventory';
const INVENTORY_STATE_DOC = 'state';
const PRODUCTS_COLLECTION = 'inventory_products';
const CATEGORIES_COLLECTION = 'inventory_categories';
const EVENTS_COLLECTION = 'inventory_events';
const SUBCATEGORIES_COLLECTION = 'subcategories';
const INVENTORY_STATES = new Set(['on_cart', 'sold_out', 'in_inventory']);

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
  return assignment.courses.filter(isValidCoursePair);
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
    const [snapshot, customer] = await Promise.all([
      courseRef(db, assignment.customer_id, assignment.course_id).get(),
      db.collection('customers').doc(assignment.customer_id).get(),
    ]);
    if (!snapshot.exists) return null;
    const data = snapshot.data();
    return {
      customer_id: assignment.customer_id,
      course_id: assignment.course_id,
      customer_name: customer.data()?.customer_name || data.customer_name || null,
      course_name: data.course_name || null,
      timezone: data.timezone || null,
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
    price: product.price ? {
      amount_minor: product.price.amount_minor,
      currency_code: product.price.currency_code,
    } : null,
    state: product.state,
  };
}

function toPublicMenu(products) {
  return sortProducts(products.filter((product) => (
    product.archived !== true && product.state === 'on_cart'
  ))).map(publicProduct);
}

async function listInventory(db, customerId, courseId) {
  const [courseSnapshot, stateSnapshot, productsSnapshot, categoriesSnapshot, customerSnapshot] = await db.runTransaction((transaction) => Promise.all([
    transaction.get(courseRef(db, customerId, courseId)),
    transaction.get(inventoryStateRef(db, customerId, courseId)),
    transaction.get(productsCollection(db, customerId, courseId)),
    transaction.get(categoriesCollection(db, customerId, courseId)),
    transaction.get(db.collection('customers').doc(customerId)),
  ]));
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
    quantity: productDoc.data().quantity ?? 0,
    stock_revision: productDoc.data().stock_revision ?? 0,
  }));
  const dailySalesSummary = await dailySales(db, customerId, courseId, courseSnapshot.data());

  return {
    customer_id: customerId,
    course_id: courseId,
    customer_name: customerSnapshot.data()?.customer_name || null,
    course_name: courseSnapshot.data().course_name || null,
    timezone: courseSnapshot.data().timezone || null,
    inventory_revision: state.inventory_revision || 0,
    public_menu_slug: state.public_menu_slug || null,
    categories: categoryDocs.sort((a, b) => a.name.localeCompare(b.name)),
    products: sortProducts(products.filter((product) => product.archived !== true)),
    archived_products: sortProducts(products.filter((product) => product.archived === true)),
    daily_sales: dailySalesSummary,
    operations: {
      daily_sales: dailySalesSummary,
    },
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
    ...(defaultState ? { state: body.state === undefined ? 'on_cart' : body.state } : {}),
  };
  if (defaultState && !INVENTORY_STATES.has(product.state)) {
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
    ...current,
    inventory_revision: (current.inventory_revision || 0) + 1,
    public_menu_slug: current.public_menu_slug || null,
    updated_at: timestamp,
    updated_by: actorUid,
  };
}

function identifier(value, field) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) {
    fail(400, 'invalid_input', `${field} must be a nonempty stable identifier`);
  }
  return value;
}

function nonnegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(400, 'invalid_input', `${field} must be a nonnegative integer`);
  }
  return value;
}

function requireObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(400, 'invalid_input', 'Request body must be an object');
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function responseValue(value) {
  // Persist the wire representation so Firestore Timestamp conversion cannot change a retry.
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(responseValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, responseValue(child)]));
  }
  return value;
}

function operationRef(parent, operationId) {
  return parent.collection('inventory_operations').doc(digest(identifier(operationId, 'operation_id')));
}

function fingerprint(actorUid, action, payload) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical({ actorUid, action, payload }))).digest('hex');
}

function retryResult(snapshot, hash) {
  if (!snapshot.exists) return null;
  if (snapshot.data().fingerprint !== hash) {
    fail(409, 'operation_conflict', 'operation_id was already used with a different payload');
  }
  return { result: snapshot.data().result };
}

function staffCollection(db, customerId) {
  return db.collection('customers').doc(customerId).collection('staff');
}

function staffModel(snapshot) {
  const value = snapshot.data();
  return { staff_id: snapshot.id, name: value.name, role: value.role, active: value.active === true };
}

async function listStaff(db, customerId, { activeOnly = false } = {}) {
  const parent = await db.collection('customers').doc(customerId).get();
  if (!parent.exists) fail(404, 'customer_not_found', 'Customer not found');
  const snapshot = await staffCollection(db, customerId).get();
  return {
    staff: snapshot.docs.map(staffModel)
      .filter((staff) => !activeOnly || canOperateInventory(staff))
      .sort((a, b) => a.name.localeCompare(b.name) || a.staff_id.localeCompare(b.staff_id)),
  };
}

async function createStaff(db, customerId, body, actorUid, { operational = false } = {}) {
  requireObject(body);
  const parent = db.collection('customers').doc(customerId);
  const operation = operationRef(parent, body.operation_id);
  const hash = fingerprint(actorUid, operational ? 'staff_custom_create' : 'staff_create', body);
  const staffRef = staffCollection(db, customerId).doc();
  return db.runTransaction(async (transaction) => {
    const [previous, customer] = await Promise.all([transaction.get(operation), transaction.get(parent)]);
    const retry = retryResult(previous, hash);
    if (retry) return retry.result;
    const name = normalizeLabel(body.name, 'name', 160);
    const role = operational ? 'cart_operator' : (body.role ?? 'cart_operator');
    if (!INVENTORY_STAFF_ROLES.includes(role)) fail(400, 'invalid_role', 'Invalid staff role');
    if (operational && (body.role !== undefined || body.active !== undefined)) {
      fail(400, 'invalid_input', 'Custom staff is created as an active cart_operator');
    }
    if (body.active !== undefined && typeof body.active !== 'boolean') fail(400, 'invalid_input', 'active must be boolean');
    if (!customer.exists) fail(404, 'customer_not_found', 'Customer not found');
    const timestamp = new Date();
    const result = { staff_id: staffRef.id, name, role, active: operational || body.active !== false };
    transaction.set(staffRef, { ...result, created_at: timestamp, created_by: actorUid, updated_at: timestamp, updated_by: actorUid });
    transaction.set(operation, { fingerprint: hash, result, actor_uid: actorUid, created_at: timestamp });
    return result;
  });
}

async function updateStaff(db, customerId, staffId, body, actorUid) {
  if (!body || Object.keys(body).length === 0 || Object.keys(body).some((key) => !['name', 'role', 'active'].includes(key))) {
    fail(400, 'invalid_input', 'Only name, role, and active may be edited');
  }
  const patch = {};
  if (body.name !== undefined) patch.name = normalizeLabel(body.name, 'name', 160);
  if (body.role !== undefined) {
    if (!INVENTORY_STAFF_ROLES.includes(body.role)) fail(400, 'invalid_role', 'Invalid staff role');
    patch.role = body.role;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') fail(400, 'invalid_input', 'active must be boolean');
    patch.active = body.active;
  }
  const ref = staffCollection(db, customerId).doc(identifier(staffId, 'staff_id'));
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) fail(404, 'staff_not_found', 'Staff member not found');
    const result = { ...staffModel(snapshot), ...patch };
    transaction.set(ref, { ...snapshot.data(), ...patch, updated_by: actorUid, updated_at: new Date() });
    return result;
  });
}

function shiftsCollection(db, customerId, courseId) {
  return courseRef(db, customerId, courseId).collection('inventory_shifts');
}

function sessionRef(db, customerId, courseId, actorUid, sessionId) {
  identifier(sessionId, 'session_id');
  return courseRef(db, customerId, courseId).collection('inventory_sessions').doc(digest(`${actorUid}\0${sessionId}`));
}

function shiftModel(id, shift) {
  return {
    shift_id: id,
    staff_id: shift.staff_id,
    staff_name: shift.staff_name,
    has_activity: shift.has_activity === true,
    status: shift.status,
  };
}

async function getSessionShift(db, customerId, courseId, actorUid, sessionId) {
  const session = await sessionRef(db, customerId, courseId, actorUid, sessionId).get();
  if (!session.exists || !session.data().shift_id) return { shift: null };
  const shift = await shiftsCollection(db, customerId, courseId).doc(session.data().shift_id).get();
  return { shift: shift.exists && shift.data().status === 'active' ? shiftModel(shift.id, shift.data()) : null };
}

async function selectShift(db, customerId, courseId, actorUid, body) {
  requireObject(body);
  const parent = courseRef(db, customerId, courseId);
  const operation = operationRef(parent, body.operation_id);
  const hash = fingerprint(actorUid, 'shift_select', body);
  const newShift = shiftsCollection(db, customerId, courseId).doc();
  return db.runTransaction(async (transaction) => {
    const previous = await transaction.get(operation);
    const retry = retryResult(previous, hash);
    if (retry) return retry.result;
    const session = sessionRef(db, customerId, courseId, actorUid, body.session_id);
    const staffRef = staffCollection(db, customerId).doc(identifier(body.staff_id, 'staff_id'));
    const [currentSession, staff, course] = await Promise.all([
      transaction.get(session), transaction.get(staffRef), transaction.get(parent),
    ]);
    if (!course.exists) fail(404, 'course_not_found', 'Course not found');
    if (!staff.exists || !canOperateInventory(staff.data())) fail(409, 'staff_unavailable', 'Select an active staff member');
    const existingRef = currentSession.exists && currentSession.data().shift_id
      ? shiftsCollection(db, customerId, courseId).doc(currentSession.data().shift_id) : null;
    const existing = existingRef ? await transaction.get(existingRef) : null;
    const active = existing?.exists && existing.data().status === 'active';
    if (active && existing.data().has_activity && existing.data().staff_id !== staff.id) {
      fail(409, 'shift_close_required', 'Close the current shift before selecting different staff');
    }
    const timestamp = new Date();
    const ref = active ? existingRef : newShift;
    const shift = {
      ...(active ? existing.data() : { created_at: timestamp, has_activity: false }),
      actor_uid: actorUid, session_id: body.session_id, staff_id: staff.id,
      staff_name: active && existing.data().has_activity ? existing.data().staff_name : staff.data().name,
      staff_role: active && existing.data().has_activity ? existing.data().staff_role : staff.data().role,
      status: 'active', updated_at: timestamp,
    };
    const result = { shift: shiftModel(ref.id, shift) };
    transaction.set(ref, shift);
    transaction.set(session, { actor_uid: actorUid, session_id: body.session_id, shift_id: ref.id });
    transaction.set(operation, { fingerprint: hash, result, actor_uid: actorUid, created_at: timestamp });
    return result;
  });
}

async function runMutation(db, customerId, courseId, actorUid, context, action, payload, worker) {
  const parent = courseRef(db, customerId, courseId);
  const operation = operationRef(parent, context?.operation_id);
  const hash = fingerprint(actorUid, action, payload);
  return db.runTransaction(async (transaction) => {
    const previous = await transaction.get(operation);
    const retry = retryResult(previous, hash);
    if (retry) return retry.result;
    if (!context?.shift_id) fail(409, 'shift_required', 'Select staff and an active shift before changing inventory');
    const shiftRef = shiftsCollection(db, customerId, courseId).doc(identifier(context.shift_id, 'shift_id'));
    const snapshot = await transaction.get(shiftRef);
    if (!snapshot.exists || snapshot.data().actor_uid !== actorUid || snapshot.data().status !== 'active') {
      fail(409, 'shift_unavailable', 'The selected shift is not active for this account');
    }
    const shift = snapshot.data();
    const [staff, session] = await Promise.all([
      transaction.get(staffCollection(db, customerId).doc(shift.staff_id)),
      transaction.get(sessionRef(db, customerId, courseId, actorUid, shift.session_id)),
    ]);
    if (!session.exists || session.data().shift_id !== shiftRef.id) fail(409, 'shift_unavailable', 'The shift is no longer selected');
    if (!staff.exists || !canOperateInventory(staff.data())) fail(409, 'staff_unavailable', 'Select an active staff member');
    const timestamp = new Date();
    const attribution = {
      actor_uid: actorUid, shift_id: shiftRef.id, operation_id: context.operation_id,
      staff_id: shift.staff_id, staff_name: shift.staff_name, staff_role: shift.staff_role,
      staff: { staff_id: shift.staff_id, name: shift.staff_name, role: shift.staff_role },
      created_at: timestamp,
    };
    let wroteEvent = false;
    const attributed = {
      timestamp,
      attribution,
      get: (ref) => transaction.get(ref),
      set: (ref, value, options) => {
        const event = ref.path.startsWith(`${eventsCollection(db, customerId, courseId).path}/`);
        if (event) wroteEvent = true;
        transaction.set(ref, event ? { ...value, ...attribution } : value, options);
      },
      delete: (ref) => transaction.delete(ref),
    };
    const result = responseValue(await worker(attributed));
    if (!wroteEvent) transaction.set(eventsCollection(db, customerId, courseId).doc(), { action, ...attribution });
    transaction.set(shiftRef, { ...shift, has_activity: true, updated_at: timestamp });
    transaction.set(operation, { fingerprint: hash, result, ...attribution });
    return result;
  });
}

async function updateStock(db, customerId, courseId, productId, body, actorUid) {
  return runMutation(db, customerId, courseId, actorUid, body, 'stock', { product_id: productId, body }, async (transaction) => {
    const productRef = productsCollection(db, customerId, courseId).doc(identifier(productId, 'product_id'));
    const stateRef = inventoryStateRef(db, customerId, courseId);
    const [product, state] = await Promise.all([transaction.get(productRef), transaction.get(stateRef)]);
    if (!product.exists) fail(404, 'product_not_found', 'Product not found');
    const existing = product.data();
    if (existing.archived === true) fail(409, 'product_archived', 'Archived products cannot be edited');
    const before = nonnegativeInteger(existing.quantity ?? 0, 'quantity');
    const stockRevision = existing.stock_revision ?? 0;
    let quantity = before;
    let availability = existing.state;
    if (body.kind === 'sale') {
      if (!Number.isSafeInteger(body.units) || body.units <= 0) fail(400, 'invalid_units', 'Sale units must be a positive integer');
      const remainingSale = body.state === 'sold_out';
      if (body.state !== undefined && !remainingSale) fail(400, 'invalid_state', 'A sale availability target must be Sold Out');
      if (remainingSale && !Number.isSafeInteger(body.expected_stock_revision)) {
        fail(409, 'stock_revision_conflict', 'Stock changed. Refresh and confirm the quantity again.');
      }
      if (body.expected_stock_revision !== undefined &&
          (!Number.isSafeInteger(body.expected_stock_revision) || body.expected_stock_revision !== stockRevision)) {
        fail(409, 'stock_revision_conflict', 'Stock changed. Refresh and confirm the quantity again.');
      }
      if (body.units > before) fail(409, 'insufficient_stock', 'Not enough stock. Correct the quantity first, then record the sale.');
      if (availability !== 'on_cart' && !(remainingSale && availability === 'in_inventory')) {
        fail(409, 'product_not_on_cart', 'Only On Cart products can be sold outside a confirmed remaining-units move to Sold Out');
      }
      if (remainingSale && body.units !== before) {
        fail(409, 'remaining_quantity_conflict', 'Confirm all remaining units before moving to Sold Out. Refresh and confirm the quantity again.');
      }
      quantity -= body.units;
      if (quantity === 0) availability = 'sold_out';
    } else if (['adjustment', 'availability'].includes(body.kind)) {
      if (!Number.isSafeInteger(body.expected_stock_revision) || body.expected_stock_revision !== stockRevision) {
        fail(409, 'stock_revision_conflict', 'Stock changed. Refresh and confirm the quantity again.');
      }
      if (body.kind === 'adjustment') {
        quantity = nonnegativeInteger(body.quantity, 'quantity');
        if (quantity === 0 && availability === 'on_cart') availability = 'sold_out';
        else if (quantity > 0 && availability === 'sold_out') availability = 'on_cart';
      } else {
        if (!INVENTORY_STATES.has(body.state)) fail(400, 'invalid_state', 'Invalid availability');
        if (body.state === 'sold_out' && before > 0) {
          fail(409, 'sale_confirmation_required', 'Confirm a sale of the remaining units before moving stock to Sold Out.');
        }
        availability = body.state;
        if (availability === 'on_cart' && existing.state !== 'on_cart') {
          quantity = nonnegativeInteger(body.quantity, 'quantity');
          if (quantity === 0) fail(400, 'positive_quantity_required', 'Loading requires an explicitly confirmed positive quantity');
        }
      }
    } else {
      fail(400, 'invalid_stock_kind', 'kind must be sale, adjustment, or availability');
    }
    if (availability === 'sold_out' && quantity !== 0) {
      fail(409, 'sold_out_quantity_conflict', 'Sold Out must have zero quantity. Correct the quantity with an adjustment.');
    }
    const next = {
      ...existing, quantity, state: availability, stock_revision: stockRevision + 1,
      inventory_revision: (state.data()?.inventory_revision || 0) + 1,
      updated_at: transaction.timestamp, updated_by: actorUid,
    };
    transaction.set(productRef, next);
    transaction.set(stateRef, nextState(state.data() || {}, actorUid, transaction.timestamp));
    transaction.set(eventsCollection(db, customerId, courseId).doc(), {
      action: body.kind === 'sale' ? 'sale' : `stock_${body.kind}`,
      product_id: productId, product_name: existing.name,
      before, after: quantity,
      before_quantity: before, after_quantity: quantity, delta: quantity - before,
      before_state: existing.state, after_state: availability,
      stock_revision: next.stock_revision, inventory_revision: next.inventory_revision,
      ...(body.kind === 'sale' ? { units: body.units } : {}),
    });
    return { product_id: productId, ...next };
  });
}

const AUDIT_ATTESTATION = 'Confirm you are authorized to approve this inventory count audit.';

async function createAudit(db, customerId, courseId, body, actorUid) {
  return runMutation(db, customerId, courseId, actorUid, body, 'audit', body, async (transaction) => {
    if (body.authorized !== true) fail(400, 'audit_authorization_required', 'Explicit audit authorization is required');
    const stateRef = inventoryStateRef(db, customerId, courseId);
    const approverRef = staffCollection(db, customerId).doc(identifier(body.approver_staff_id, 'approver_staff_id'));
    const [state, products, approver] = await Promise.all([
      transaction.get(stateRef), transaction.get(productsCollection(db, customerId, courseId)), transaction.get(approverRef),
    ]);
    const revision = state.data()?.inventory_revision || 0;
    if (!Number.isSafeInteger(body.inventory_revision) || body.inventory_revision !== revision) {
      fail(409, 'inventory_revision_conflict', 'Inventory changed. Review the new quantities and confirm the audit again.');
    }
    if (!approver.exists || !canOperateInventory(approver.data())) fail(409, 'staff_unavailable', 'Select an active audit approver');
    const snapshot = products.docs.map((product) => ({ product_id: product.id, ...product.data() }))
      .filter((product) => product.archived !== true && product.state === 'on_cart')
      .sort((a, b) => a.product_id.localeCompare(b.product_id))
      .map((product) => ({
        product_id: product.product_id, name: product.name, category_name: product.category_name,
        state: product.state, quantity: product.quantity ?? 0, stock_revision: product.stock_revision ?? 0,
      }));
    const auditRef = courseRef(db, customerId, courseId).collection('inventory_audits').doc();
    const result = {
      audit_id: auditRef.id, inventory_revision: revision, products: snapshot,
      approver: staffModel(approver), approver_staff_id: approver.id, approver_staff_name: approver.data().name,
      authorized: true, attestation: AUDIT_ATTESTATION, ...transaction.attribution,
    };
    transaction.set(auditRef, result);
    transaction.set(eventsCollection(db, customerId, courseId).doc(), { action: 'inventory_audited', audit_id: auditRef.id, inventory_revision: revision });
    transaction.set(stateRef, nextState(state.data() || {}, actorUid, transaction.timestamp));
    return result;
  });
}

async function closeShift(db, customerId, courseId, shiftId, body, actorUid) {
  requireObject(body);
  const parent = courseRef(db, customerId, courseId);
  const operation = operationRef(parent, body.operation_id);
  const hash = fingerprint(actorUid, 'shift_close', { shift_id: shiftId, body });
  return db.runTransaction(async (transaction) => {
    const previous = await transaction.get(operation);
    const retry = retryResult(previous, hash);
    if (retry) return retry.result;
    nonnegativeInteger(body.amount_minor, 'amount_minor');
    const ref = shiftsCollection(db, customerId, courseId).doc(identifier(shiftId, 'shift_id'));
    const session = sessionRef(db, customerId, courseId, actorUid, body.session_id);
    const [snapshot, sessionSnapshot] = await Promise.all([transaction.get(ref), transaction.get(session)]);
    if (!snapshot.exists || snapshot.data().actor_uid !== actorUid || snapshot.data().session_id !== body.session_id ||
        snapshot.data().status !== 'active' || sessionSnapshot.data()?.shift_id !== shiftId) {
      fail(409, 'shift_unavailable', 'The selected shift is not active for this browser session');
    }
    const timestamp = new Date();
    const shift = snapshot.data();
    const record = {
      ...shiftModel(ref.id, shift), status: 'closed', amount_minor: body.amount_minor, currency_code: 'USD',
      actor_uid: actorUid, session_id: body.session_id, staff_role: shift.staff_role, closed_at: timestamp,
    };
    const result = responseValue(record);
    transaction.set(ref, { ...shift, ...record, updated_at: timestamp });
    transaction.set(session, { ...sessionSnapshot.data(), shift_id: null });
    transaction.set(parent.collection('inventory_shift_closures').doc(shiftId), record);
    transaction.set(eventsCollection(db, customerId, courseId).doc(), {
      action: 'shift_closed', ...record, operation_id: body.operation_id, created_at: timestamp,
    });
    transaction.set(operation, { fingerprint: hash, result, created_at: timestamp, actor_uid: actorUid });
    return result;
  });
}

function localDate(value, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

async function dailySales(db, customerId, courseId, course, now = new Date()) {
  const timezone = course.timezone || 'UTC';
  const today = localDate(now, timezone);
  // A single-field bounded time query avoids a composite index and includes DST's longest day.
  const events = await eventsCollection(db, customerId, courseId)
    .where('created_at', '>=', new Date(now.getTime() - 48 * 60 * 60 * 1000)).get();
  const totals = new Map();
  for (const event of events.docs) {
    const value = event.data();
    if (value.action !== 'sale') continue;
    const timestamp = value.created_at?.toDate ? value.created_at.toDate() : value.created_at;
    if (!(timestamp instanceof Date) || localDate(timestamp, timezone) !== today) continue;
    const row = totals.get(value.product_id) || { product_id: value.product_id, name: value.product_name, units: 0 };
    row.units += value.units;
    totals.set(value.product_id, row);
  }
  const products = [...totals.values()].sort((a, b) => a.name.localeCompare(b.name) || a.product_id.localeCompare(b.product_id));
  return { local_date: today, total_units: products.reduce((sum, product) => sum + product.units, 0), products };
}

async function createProduct(db, customerId, courseId, body, actorUid) {
  return runMutation(db, customerId, courseId, actorUid, body, 'product_create', body, async (transaction) => {
    const product = validateProduct(body, { defaultState: true });
    const quantity = nonnegativeInteger(body.quantity ?? 0, 'quantity');
    if (product.state === 'sold_out' && quantity !== 0) {
      fail(409, 'sold_out_quantity_conflict', 'Sold Out must have zero quantity.');
    }
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

    const timestamp = transaction.timestamp;
    const revision = ((stateSnapshot.exists ? stateSnapshot.data().inventory_revision : 0) || 0) + 1;
    const categoryName = categorySnapshot.exists ? categorySnapshot.data().name : product.category_name;
    const subcategoryName = !subcategoryDocument ? null :
      (subcategorySnapshot?.exists ? subcategorySnapshot.data().name : product.subcategory_name);
    const storedProduct = {
      ...product,
      quantity,
      stock_revision: 0,
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
    return { product_id: productDocument.id, ...storedProduct };
  });
}

async function updateProduct(db, customerId, courseId, productId, body, actorUid) {
  return runMutation(db, customerId, courseId, actorUid, body, 'product_update', { product_id: productId, body }, async (transaction) => {
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

    const timestamp = transaction.timestamp;
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
    return { product_id: productId, ...updated };
  });
}

async function archiveProduct(db, customerId, courseId, productId, actorUid, context) {
  const courseDocument = courseRef(db, customerId, courseId);
  const stateDocument = inventoryStateRef(db, customerId, courseId);
  const productDocument = productsCollection(db, customerId, courseId).doc(productId);
  return runMutation(db, customerId, courseId, actorUid, context, 'product_archive', { product_id: productId, body: context }, async (transaction) => {
    const [courseSnapshot, stateSnapshot, productSnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(productDocument),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    if (!productSnapshot.exists) fail(404, 'product_not_found', 'Product not found');
    const existing = productSnapshot.data();
    if (existing.archived === true) return { product_id: productId, ...existing };

    const timestamp = transaction.timestamp;
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
    return { product_id: productId, ...existing, archived: true, inventory_revision: revision };
  });
}

async function createCategory(db, customerId, courseId, value, actorUid, context) {
  return runMutation(db, customerId, courseId, actorUid, context, 'category_create', { name: value, ...context }, async (transaction) => {
    const name = normalizeLabel(value, 'name', 100);
    const courseDocument = courseRef(db, customerId, courseId);
    const stateDocument = inventoryStateRef(db, customerId, courseId);
    const categoryDocument = categoryRef(db, customerId, courseId, name);
    const [courseSnapshot, stateSnapshot, categorySnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(categoryDocument),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    if (categorySnapshot.exists) return { category_id: categoryDocument.id, ...categorySnapshot.data(), created: false };

    const timestamp = transaction.timestamp;
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
    return { category_id: categoryDocument.id, ...category, created: true };
  });
}

async function createSubcategory(db, customerId, courseId, categoryId, value, actorUid, context) {
  return runMutation(db, customerId, courseId, actorUid, context, 'subcategory_create', { category_id: categoryId, name: value, body: context }, async (transaction) => {
    const name = normalizeLabel(value, 'name', 100);
    const courseDocument = courseRef(db, customerId, courseId);
    const stateDocument = inventoryStateRef(db, customerId, courseId);
    const categoryDocument = categoriesCollection(db, customerId, courseId).doc(categoryId);
    const subcategoryDocument = categoryDocument.collection(SUBCATEGORIES_COLLECTION)
      .doc(subcategoryIdFor(categoryId, name));
    const [courseSnapshot, stateSnapshot, categorySnapshot, subcategorySnapshot] = await Promise.all([
      transaction.get(courseDocument),
      transaction.get(stateDocument),
      transaction.get(categoryDocument),
      transaction.get(subcategoryDocument),
    ]);
    if (!courseSnapshot.exists) fail(404, 'course_not_found', 'Course not found');
    if (!categorySnapshot.exists) fail(404, 'category_not_found', 'Category not found');
    if (subcategorySnapshot.exists) {
      return { subcategory_id: subcategoryDocument.id, ...subcategorySnapshot.data(), created: false };
    }

    const timestamp = transaction.timestamp;
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
    return { subcategory_id: subcategoryDocument.id, ...subcategory, created: true };
  });
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
async function deleteCategory(db, customerId, courseId, categoryId, actorUid, context) {
  const courseDocument = courseRef(db, customerId, courseId);
  const stateDocument = inventoryStateRef(db, customerId, courseId);
  const categoryDocument = categoryRefById(db, customerId, courseId, categoryId);
  const productsQuery = productsCollection(db, customerId, courseId)
    .where('category_id', '==', categoryId);
  const subcategoriesCollection = categoryDocument.collection(SUBCATEGORIES_COLLECTION);

  return runMutation(db, customerId, courseId, actorUid, context, 'category_delete', { category_id: categoryId, body: context }, async (transaction) => {
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

    const timestamp = transaction.timestamp;
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
    return { category_id: categoryId, deleted: true };
  });
}

async function getPublicMenu(db, slugValue) {
  const slug = validateSlug(slugValue);
  return db.runTransaction(async (transaction) => {
    const slugSnapshot = await transaction.get(db.collection(PUBLIC_MENU_SLUGS).doc(slug));
    if (!slugSnapshot.exists) fail(404, 'menu_not_found', 'Course menu not found');
    const { customer_id: customerId, course_id: courseId } = slugSnapshot.data();
    if (typeof customerId !== 'string' || typeof courseId !== 'string') {
      fail(404, 'menu_not_found', 'Course menu not found');
    }
    const [courseSnapshot, stateSnapshot, productsSnapshot] = await Promise.all([
      transaction.get(courseRef(db, customerId, courseId)),
      transaction.get(inventoryStateRef(db, customerId, courseId)),
      transaction.get(productsCollection(db, customerId, courseId)),
    ]);
    if (!courseSnapshot.exists) fail(404, 'menu_not_found', 'Course menu not found');
    const course = courseSnapshot.data();
    const state = stateSnapshot.data() || {};
    return {
      course_id: courseId,
      course_name: course.course_name || null,
      timezone: course.timezone || null,
      inventory_revision: state.inventory_revision || 0,
      updated_at: state.updated_at || null,
      products: toPublicMenu(productsSnapshot.docs.map((doc) => ({ ...doc.data(), product_id: doc.id }))),
    };
  }, { readOnly: true });
}

module.exports = {
  AUDIT_ATTESTATION,
  listStaff,
  createStaff,
  updateStaff,
  selectShift,
  getSessionShift,
  updateStock,
  createAudit,
  closeShift,
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
  getPublicMenu,
};