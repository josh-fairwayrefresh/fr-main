'use strict';

const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
const { getUserAccess } = require('./user_access');
const inventory = require('./inventory');
const storage = require('./operational_storage');
const { resolvePublicMenuOrigin } = require('./environment');

const states = new Set(['on_menu', 'sold_out', 'in_inventory']);

function fail(status, code, message) {
  throw new inventory.InventoryError(status, code, message);
}
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) fail(400, 'invalid_id', 'Invalid identifier');
  return value;
}
function slug(value) {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(value) || value.length > 80) {
    fail(400, 'invalid_slug', 'Invalid public menu slug');
  }
  return value;
}
function namedSlug(customerId, name) {
  return slug(`${id(customerId).toLowerCase()}_${slug(name)}`);
}
function customerRef(db, customerId) {
  return db.collection('customers').doc(id(customerId));
}
function menuRef(db, customerId, menuId) {
  return customerRef(db, customerId).collection('menus').doc(id(menuId));
}
function assetRef(db, customerId, assetId) {
  return customerRef(db, customerId).collection('assets').doc(id(assetId));
}
function model(customerId, doc) {
  const data = doc.data();
  return { ...data, customer_id: customerId, menu_id: doc.id, public_url: `${resolvePublicMenuOrigin()}/cartmenus/${data.slug}` };
}
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !allowed.includes(key))) fail(400, 'invalid_input', 'Unexpected or invalid fields');
}

async function listMenus(db, customerId) {
  const customer = customerRef(db, customerId);
  const [parent, menus] = await Promise.all([customer.get(), customer.collection('menus').get()]);
  if (!parent.exists) fail(404, 'customer_not_found', 'Customer not found');
  return { menus: menus.docs.map((doc) => model(customerId, doc)).sort((a, b) => a.name.localeCompare(b.name)) };
}

async function registerCustomerAssets(db, customerId, actorUid) {
  const { courseOperation } = require('./course_operation');
  const parent = customerRef(db, customerId);
  return db.runTransaction(async (tx) => {
    const [customer, courses, assets, services] = await Promise.all([
      tx.get(parent), tx.get(parent.collection('courses')),
      tx.get(parent.collection('assets')), tx.get(parent.collection('services')),
    ]);
    if (!customer.exists) fail(404, 'customer_not_found', 'Customer not found');
    if (customer.data().operational_storage?.state === 'maintenance') {
      fail(503, 'operational_storage_unavailable', 'Customer migration is in progress');
    }
    if (courses.size > 200) fail(409, 'registration_too_large', 'Review a bounded Customer registration');
    const now = new Date();
    const writes = [];
    for (const course of courses.docs) {
      const context = course.data();
      const operation = courseOperation(context);
      const existingService = services.docs.find((doc) => doc.id === course.id);
      const existingAsset = assets.docs.find((doc) => doc.id === course.id);
      if (storage.mode() === 'customer' && (!existingService || (operation.inventory && !existingAsset))) {
        fail(409, 'migration_required', 'Do not recreate operational owners from historical Course records');
      }
      if (existingService && existingService.data().course_id !== course.id) {
        fail(409, 'service_conflict', 'Existing Customer service has a different context');
      }
      if (existingAsset && (existingAsset.data().course_id !== course.id ||
          existingAsset.data().type !== 'cart' || !operation.inventory)) {
        fail(409, 'asset_conflict', 'Existing Customer asset has a different context');
      }
      if (!existingService) writes.push({
        ref: parent.collection('services').doc(course.id),
        data: { ...(storage.mode() === 'customer' ? context : {}),
          service_id: course.id, course_id: course.id, name: context.course_name,
          created_at: now, created_by: actorUid },
      });
      if (operation.inventory && !existingAsset) writes.push({
        ref: assetRef(db, customerId, course.id),
        data: {
          asset_id: course.id, service_id: course.id,
          type: 'cart', course_id: course.id, course_name: context.course_name,
          timezone: context.timezone ?? null, created_at: now, created_by: actorUid,
        },
      });
    }
    for (const write of writes) tx.set(write.ref, write.data);
    return { customer_id: customerId, registered: writes.length };
  });
}

async function saveMenu(db, customerId, menuId, body, actorUid) {
  fields(body, ['name', 'type', 'slug', 'aliases', 'state', 'asset_id', 'title', 'subtitle', 'footer', 'timezone', 'branding']);
  const parent = customerRef(db, customerId);
  const ref = menuId ? menuRef(db, customerId, menuId) : parent.collection('menus').doc();
  return db.runTransaction(async (tx) => {
    const [customer, current] = await Promise.all([tx.get(parent), tx.get(ref)]);
    if (!customer.exists) fail(404, 'customer_not_found', 'Customer not found');
    if (menuId && !current.exists) fail(404, 'menu_not_found', 'Menu not found');
    const old = current.exists ? current.data() : null;
    if (old?.state === 'archived') fail(409, 'menu_archived', 'Archived menus cannot be changed');
    const type = body.type ?? old?.type;
    if (!['cart', 'restaurant'].includes(type) || (old && type !== old.type)) fail(400, 'invalid_type', 'Invalid menu type');
    const name = slug(body.name ?? old?.name);
    const canonicalSlug = namedSlug(customerId, name);
    const suppliedSlug = body.slug === undefined ? null : slug(body.slug);
    if (suppliedSlug && suppliedSlug !== canonicalSlug && (old || type !== 'cart')) {
      fail(400, 'name_url_mismatch', 'The current URL is derived from the Customer identity and menu name');
    }
    const aliases = body.aliases ?? old?.aliases ?? [];
    if (!Array.isArray(aliases) || aliases.length > 20 || aliases.some((item) => typeof item !== 'string')) fail(400, 'invalid_aliases', 'Invalid aliases');
    const inputAliases = aliases.map(slug);
    if (new Set(inputAliases).size !== inputAliases.length ||
        (old && (old.aliases || []).some((value) => value !== canonicalSlug && !inputAliases.includes(value)))) {
      fail(409, 'permanent_alias', 'Aliases are permanent and unique');
    }
    const checkedAliases = [...new Set([
      ...inputAliases, ...(old ? [old.slug] : []), ...(suppliedSlug ? [suppliedSlug] : []),
    ])].filter((value) => value !== canonicalSlug);
    if (checkedAliases.length > 20) fail(400, 'invalid_aliases', 'Too many reserved URL aliases');
    const state = body.state ?? old?.state ?? 'active';
    if (!['active', 'archived'].includes(state)) fail(400, 'invalid_state', 'Invalid menu state');
    const assetId = body.asset_id ?? old?.asset_id ?? null;
    if (type === 'cart' && !assetId) fail(400, 'asset_required', 'Cart menu requires an asset');
    if (type === 'restaurant' && assetId !== null) fail(400, 'invalid_asset', 'Restaurant menu does not use a cart asset');
    if (old && assetId !== old.asset_id) fail(409, 'permanent_asset', 'Menu asset cannot change');
    const slugRefs = [canonicalSlug, ...checkedAliases].map((value) => db.collection('public_menu_slugs').doc(value));
    const [asset, registeredMenus, ...slugDocs] = await Promise.all([
      assetId ? tx.get(assetRef(db, customerId, assetId)) : Promise.resolve(null),
      tx.get(parent.collection('menus')),
      ...slugRefs.map((target) => tx.get(target)),
    ]);
    if (registeredMenus.docs.some((doc) => doc.id !== ref.id &&
        inventory.normalizedKey(doc.data().name) === inventory.normalizedKey(name))) {
      fail(409, 'name_in_use', 'Menu name is already reserved for this Customer');
    }
    if (assetId && (!asset.exists || asset.data().type !== 'cart')) {
      fail(400, 'invalid_asset', 'Cart asset must reference its existing storage context');
    }
    if (slugDocs.some((doc) => doc.exists && (doc.data().customer_id !== customerId ||
        (doc.data().menu_id !== ref.id && !(type === 'cart' && doc.data().menu_id === undefined &&
          doc.data().course_id === assetId))))) {
      fail(409, 'slug_in_use', 'Public URL already reserved');
    }
    const now = new Date();
    const record = {
      ...(old || {}),
      name, type, slug: canonicalSlug, aliases: checkedAliases, state, asset_id: assetId,
      title: inventory.optionalText(body.title ?? old?.title ?? name, 'title', 160),
      subtitle: inventory.optionalText(body.subtitle ?? old?.subtitle ?? null, 'subtitle', 400),
      footer: inventory.optionalText(body.footer ?? old?.footer ?? null, 'footer', 1000),
      timezone: body.timezone ?? old?.timezone ?? asset?.data()?.timezone ?? null,
      branding: body.branding ?? old?.branding ?? null,
      updated_at: now, updated_by: actorUid,
      ...(old ? {} : { created_at: now, created_by: actorUid }),
    };
    if (record.timezone !== null) {
      try { new Intl.DateTimeFormat('en', { timeZone: record.timezone }); } catch { fail(400, 'invalid_timezone', 'Invalid timezone'); }
    }
    if (record.branding !== null && (typeof record.branding !== 'object' || Array.isArray(record.branding) ||
        Object.keys(record.branding).some((key) => key !== 'logo_url') ||
        typeof record.branding.logo_url !== 'string' || !/^\/[A-Za-z0-9/_\-.]+$/.test(record.branding.logo_url))) {
      fail(400, 'invalid_branding', 'Brand logo must be a local path');
    }
    tx.set(ref, record);
    slugRefs.forEach((target) => tx.set(target, { customer_id: customerId, menu_id: ref.id }));
    tx.set(parent.collection('menu_qr_codes').doc(ref.id), {
      menu_id: ref.id, updated_at: now,
      ...(old ? {} : { created_at: now, created_by: actorUid }),
    }, { merge: true });
    return { menu: model(customerId, { id: ref.id, data: () => record }) };
  });
}

async function requireMenu(db, uid, customerId, menuId, expectedType) {
  const access = await getUserAccess(db, uid);
  if (!access) fail(403, 'user_access_required', 'User access required');
  const ref = menuRef(db, customerId, menuId);
  const snap = await ref.get();
  if (!snap.exists) fail(404, 'menu_not_found', 'Menu not found');
  const menu = snap.data();
  if (menu.state !== 'active') fail(410, 'menu_unavailable', 'Menu unavailable');
  if (expectedType && menu.type !== expectedType) fail(404, 'menu_not_found', 'Menu not found');
  if (!access.admin) {
    if (access.customer_id !== customerId) fail(403, 'menu_access_denied', 'Menu access denied');
    if (access.schema_version === 3 && !access.menu_ids.includes(menuId)) fail(403, 'menu_access_denied', 'Menu access denied');
    if (access.schema_version === 2) {
      if (menu.type !== 'cart') fail(403, 'menu_access_denied', 'Menu access denied');
      const { resolveAuthorizedCourses } = require('./user_access');
      const courses = await resolveAuthorizedCourses(db, access);
      if (!courses.some((course) => course.course_id === menu.asset_id)) fail(403, 'menu_access_denied', 'Menu access denied');
    }
  }
  return { ref, menu, access };
}

async function bootstrap(db, uid) {
  const access = await getUserAccess(db, uid);
  if (!access) fail(403, 'user_access_required', 'User access required');
  const customers = access.admin
    ? (await db.collection('customers').get()).docs
    : [(await customerRef(db, access.customer_id).get())];
  const results = [];
  for (const customer of customers) {
    if (!customer.exists) continue;
    const docs = (await customer.ref.collection('menus').get()).docs;
    const menus = [];
    for (const doc of docs) {
      try {
        await requireMenu(db, uid, customer.id, doc.id);
        const entry = model(customer.id, doc);
        if (entry.type === 'cart') {
          const [asset, context] = await Promise.all([
            assetRef(db, customer.id, entry.asset_id).get(),
            storage.inventoryRef(db, customer.id, id(entry.asset_id)).get(),
          ]);
          if (!asset.exists || asset.data().type !== 'cart' ||
              !context.exists) {
            fail(409, 'migration_required', 'Registered cart storage context is unavailable');
          }
          await storage.assertOwner(db, customer.id);
          entry.course_name = context.data().course_name;
          entry.timezone = context.data().timezone;
        }
        menus.push(entry);
      } catch (error) {
        if (!(error instanceof inventory.InventoryError) || ![403, 410].includes(error.status)) throw error;
      }
    }
    results.push({ customer_id: customer.id, customer_name: customer.data().customer_name || customer.id, menus });
  }
  return { customers: results };
}

async function qr(db, customerId, menuId, format) {
  const doc = await menuRef(db, customerId, menuId).get();
  if (!doc.exists || doc.data().state !== 'active') fail(404, 'menu_not_found', 'Menu not found');
  const url = model(customerId, doc).public_url;
  const png = await QRCode.toBuffer(url, { type: 'png', errorCorrectionLevel: 'M', margin: 4, width: 512 });
  const image = PNG.sync.read(png);
  if (jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data !== url) throw new Error('QR verification failed');
  if (format === 'png') return { type: 'image/png', data: png };
  if (format === 'svg') return { type: 'image/svg+xml', data: await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }) };
  fail(400, 'invalid_format', 'Use png or svg');
}

module.exports = { assetRef, bootstrap, customerRef, fields, id, listMenus, menuRef, model, namedSlug, qr, registerCustomerAssets, requireMenu, saveMenu, slug, states };
