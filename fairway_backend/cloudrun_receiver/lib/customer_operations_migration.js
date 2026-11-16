'use strict';

const crypto = require('crypto');
const { courseOperation } = require('./course_operation');
const { planCustomerAccess } = require('./customer_access_plan');
const { normalizeAccessRecord } = require('./user_access');

const SERVICE_FIELDS = ['service_suspension', 'on_premise_service', 'service_schedule', 'service_events'];
const SERVICE_COLLECTIONS = new Set(['service_events', 'on_premise_service_events', 'service_days']);
const CONTEXT_COLLECTIONS = new Set(['weather_days', 'published_menus']);

function canonical(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return { date: value.toISOString() };
  if (Buffer.isBuffer(value)) return { bytes: value.toString('base64') };
  if (typeof value.toDate === 'function' && Number.isInteger(value.seconds)) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (typeof value.path === 'string' && typeof value.get === 'function') return { reference: value.path };
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function customerRef(db, customerId) {
  if (typeof customerId !== 'string' || !customerId || customerId.includes('/')) {
    throw new Error('Invalid Customer identity');
  }
  return db.collection('customers').doc(customerId);
}

async function tree(ref, targetPath, rows) {
  const snapshot = await ref.get();
  if (snapshot.exists) rows.push({ source: ref.path, target: targetPath, data: snapshot.data() });
  const collections = await ref.listCollections();
  for (const collection of collections) {
    // listDocuments includes missing parent documents with populated descendants.
    for (const child of await collection.listDocuments()) {
      await tree(child, `${targetPath}/${collection.id}/${child.id}`, rows);
    }
  }
}

async function prepare(db, customerId) {
  const parent = customerRef(db, customerId);
  const customer = await parent.get();
  if (!customer.exists) throw new Error('Customer not found');
  const state = customer.data().operational_storage?.state || 'legacy';
  if (!['legacy', 'maintenance'].includes(state)) throw new Error('Customer already owns operations; do not recopy legacy data');
  const [courses, menus, assets, services, users] = await Promise.all([
    parent.collection('courses').get(), parent.collection('menus').get(),
    parent.collection('assets').get(), parent.collection('services').get(),
    db.collection('user_access').where('customer_id', '==', customerId).get(),
  ]);
  const rows = [];
  for (const user of users.docs) {
    const access = normalizeAccessRecord(user.data());
    if (!access || (access.schema_version === 3 &&
        (access.menu_ids.some(id => !menus.docs.some(menu => menu.id === id)) ||
         access.service_ids.some(id => !courses.docs.some(course => course.id === id))))) {
      throw new Error(`Invalid Customer authorization: ${user.id}`);
    }
  }
  for (const course of courses.docs) {
    const data = course.data();
    const operation = courseOperation(data);
    const servicePath = parent.collection('services').doc(course.id).path;
    const existingService = services.docs.find(doc => doc.id === course.id)?.data();
    if (existingService && existingService.course_id !== course.id) throw new Error('Service context conflict');
    const service = {
      ...existingService, service_id: course.id, course_id: course.id,
      name: data.course_name, course_name: data.course_name, timezone: data.timezone,
      operation_kind: operation.kind,
    };
    for (const key of SERVICE_FIELDS) if (key in data) service[key] = data[key];
    rows.push({ source: course.ref.path, target: servicePath, data: service, root: true });
    if (operation.inventory) {
      const existingAsset = assets.docs.find(doc => doc.id === course.id)?.data();
      if (existingAsset && (existingAsset.type !== 'cart' || existingAsset.course_id !== course.id)) {
        throw new Error('Cart asset conflict');
      }
      const asset = { ...existingAsset, ...data, asset_id: course.id, type: 'cart',
        course_id: course.id, service_id: course.id };
      for (const key of SERVICE_FIELDS) delete asset[key];
      rows.push({ source: course.ref.path, target: parent.collection('assets').doc(course.id).path,
        data: asset, root: true });
      service.asset_id = course.id;
    }
    for (const collection of await course.ref.listCollections()) {
      let target;
      if (SERVICE_COLLECTIONS.has(collection.id)) target = servicePath;
      else if (collection.id === 'inventory' || collection.id.startsWith('inventory_') || collection.id === 'sales_days') {
        if (!operation.inventory) throw new Error('Inventory records on a non-cart context');
        target = parent.collection('assets').doc(course.id).path;
      } else if (CONTEXT_COLLECTIONS.has(collection.id)) continue;
      else throw new Error(`Unclassified legacy collection: ${collection.path}`);
      for (const child of await collection.listDocuments()) {
        await tree(child, `${target}/${collection.id}/${child.id}`, rows);
      }
    }
  }
  const accessPlan = planCustomerAccess({
    customerId,
    courses: courses.docs.map(doc => ({ ...doc.data(), course_id: doc.id })),
    services: courses.docs.map(doc => ({ service_id: doc.id, course_id: doc.id })),
    menus: menus.docs.map(doc => ({ ...doc.data(), menu_id: doc.id })),
    users: users.docs.filter(doc => doc.data().schema_version === 2)
      .map(doc => ({ uid: doc.id, access: doc.data() })),
  });
  for (const user of accessPlan.users) {
    const ref = db.collection('user_access').doc(user.uid);
    const source = users.docs.find(doc => doc.id === user.uid).data();
    rows.push({ source: ref.path, target: ref.path, data: { ...source, ...user.authorization }, root: true });
  }
  for (const collectionName of ['devices', 'qr_bays', 'requests']) {
    const docs = await db.collection(collectionName).where('customer_id', '==', customerId).get();
    for (const doc of docs.docs) {
      const data = doc.data();
      if (!data.course_id && collectionName === 'devices') continue;
      if (!courses.docs.some(course => course.id === data.course_id)) throw new Error('Unknown operational service context');
      rows.push({ source: doc.ref.path, target: doc.ref.path, data: { ...data, service_id: data.course_id }, root: true });
    }
  }
  const sourcePaths = [...new Set([
    ...rows.flatMap(row => [row.source, row.target]), ...users.docs.map(doc => doc.ref.path),
    ...menus.docs.map(doc => doc.ref.path),
  ])].sort();
  const sources = await Promise.all(sourcePaths.map(async path => {
    const doc = await db.doc(path).get();
    return { path, data: doc.exists ? doc.data() : null };
  }));
  rows.sort((a, b) => a.target.localeCompare(b.target));
  const content = { customer_id: customerId, rows, sources };
  return { ...content, fingerprint: hash(content) };
}

async function verifySources(db, plan) {
  for (const source of plan.sources) {
    const current = await db.doc(source.path).get();
    if (hash(current.exists ? current.data() : null) !== hash(source.data)) {
      const copied = plan.rows.find(row => row.target === source.path);
      if (copied && current.exists && hash(current.data()) === hash(copied.data)) continue;
      throw new Error(`Legacy source changed: ${source.path}`);
    }
    const parent = customerRef(db, plan.customer_id);
    for (const name of ['requests', 'devices', 'qr_bays', 'user_access']) {
      const current = await db.collection(name).where('customer_id', '==', plan.customer_id).get();
      if (current.docs.some(doc => !(name === 'devices' && !doc.data().course_id) &&
          !plan.sources.some(source => source.path === doc.ref.path))) {
        throw new Error(`New ${name} records appeared after migration planning`);
      }
    }
    const courses = await parent.collection('courses').get();
    const roots = plan.sources.filter(row => row.path.startsWith(`${parent.path}/courses/`) &&
      row.path.split('/').length === 4).map(row => row.path).sort();
    if (hash(courses.docs.map(doc => doc.ref.path).sort()) !== hash(roots)) throw new Error('Legacy Course register changed');
    for (const course of courses.docs) {
      for (const collection of await course.ref.listCollections()) {
        if (CONTEXT_COLLECTIONS.has(collection.id)) continue;
        const currentRows = [];
        for (const child of await collection.listDocuments()) await tree(child, child.path, currentRows);
        if (currentRows.some(row => !plan.sources.some(source => source.path === row.source))) {
          throw new Error('New legacy operational records appeared after migration planning');
        }
      }
    }
  }
}

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.rows) || !Array.isArray(plan.sources) ||
      hash({ customer_id: plan.customer_id, rows: plan.rows, sources: plan.sources }) !== plan.fingerprint) {
    throw new Error('Migration plan fingerprint mismatch');
  }
}

async function begin(db, plan, { migrationId, backupEvidence, quiescenceEvidence } = {}) {
  validatePlan(plan);
  if (![migrationId, backupEvidence, quiescenceEvidence].every(value => (
    typeof value === 'string' && value.trim() && !value.includes('\n')
  )) || migrationId.includes('/')) throw new Error('Verified backup, drained writers and migration identity are required');
  const parent = customerRef(db, plan.customer_id);
  await db.runTransaction(async tx => {
    const current = await tx.get(parent);
    const marker = current.data()?.operational_storage;
    if (marker?.state === 'maintenance' && marker.migration_id === migrationId &&
        marker.fingerprint === plan.fingerprint) return;
    if (marker?.state === 'maintenance' && marker.migration_id === migrationId && marker.phase === 'planned') {
      tx.update(parent, { operational_storage: { ...marker, fingerprint: plan.fingerprint,
        backup_evidence: backupEvidence, quiescence_evidence: quiescenceEvidence } });
      return;
    }
    if (marker?.state && marker.state !== 'legacy') throw new Error('Customer is not in legacy mode');
    tx.update(parent, { operational_storage: {
      state: 'maintenance', phase: 'planned', migration_id: migrationId, fingerprint: plan.fingerprint,
      backup_evidence: backupEvidence, quiescence_evidence: quiescenceEvidence,
      started_at: new Date(),
    } });
  });
}

async function resume(db, plan, migrationId) {
  validatePlan(plan);
  const parent = customerRef(db, plan.customer_id);
  const initial = (await parent.get()).data()?.operational_storage;
  if (initial?.migration_id !== migrationId || initial.fingerprint !== plan.fingerprint) {
    throw new Error('Migration identity mismatch');
  }
  // Forward recovery never replaces live Customer activity with a legacy snapshot.
  if (initial.state === 'customer') {
    for (const row of plan.rows.filter(row => row.root &&
      (row.target.includes('/assets/') || row.target.includes('/services/')))) {
      const current = await db.doc(row.target).get();
      if (!current.exists) throw new Error('Customer operational owner missing; recover current authoritative data, not the legacy plan');
    }
    return { state: 'customer', already_complete: true, restored: false };
  }
  if (initial.state !== 'maintenance') throw new Error('Migration maintenance barrier is absent');
  await verifySources(db, plan);
  await db.runTransaction(async tx => {
    const marker = (await tx.get(parent)).data()?.operational_storage;
    if (marker?.state !== 'maintenance' || marker.migration_id !== migrationId ||
        marker.fingerprint !== plan.fingerprint) throw new Error('Migration fence changed');
    tx.update(parent, { operational_storage: { ...marker, phase: 'copying' } });
  });
  for (let offset = 0; offset < plan.rows.length; offset += 350) {
    const chunk = plan.rows.slice(offset, offset + 350);
    await db.runTransaction(async tx => {
      const marker = (await tx.get(parent)).data()?.operational_storage;
      if (marker?.state !== 'maintenance' || marker.migration_id !== migrationId ||
          marker.fingerprint !== plan.fingerprint) throw new Error('Migration fence changed');
      const targets = await Promise.all(chunk.map(row => tx.get(db.doc(row.target))));
      targets.forEach((doc, index) => {
        const row = chunk[index];
        const baseline = plan.sources.find(source => source.path === row.target)?.data;
        if (doc.exists && hash(doc.data()) !== hash(row.data) &&
            (!row.root || hash(doc.data()) !== hash(baseline))) {
          throw new Error(`Conflicting Customer record: ${row.target}`);
        }
      });
      chunk.forEach(row => tx.set(db.doc(row.target), row.data));
    });
  }
  await verifySources(db, plan);
  await verify(db, plan);
  await db.runTransaction(async tx => {
    const marker = (await tx.get(parent)).data()?.operational_storage;
    if (marker?.state !== 'maintenance' || marker.migration_id !== migrationId ||
        marker.fingerprint !== plan.fingerprint) throw new Error('Migration fence changed');
    tx.update(parent, { authorization_schema_version: 3,
      operational_storage: { ...marker, state: 'customer', phase: 'complete', completed_at: new Date() } });
  });
  return { state: 'customer', documents: plan.rows.length, fingerprint: plan.fingerprint };
}

async function verify(db, plan) {
  validatePlan(plan);
  for (const row of plan.rows) {
    const current = await db.doc(row.target).get();
    if (!current.exists || hash(current.data()) !== hash(row.data)) {
      throw new Error(`Customer copy verification failed: ${row.target}`);
    }
    for (const root of plan.rows.filter(row => row.root &&
      (row.target.includes('/assets/') || row.target.includes('/services/')))) {
      const currentRows = [];
      await tree(db.doc(root.target), root.target, currentRows);
      if (currentRows.some(row => !plan.rows.some(expected => expected.target === row.target))) {
        throw new Error(`Unexpected competing Customer records: ${root.target}`);
      }
    }
  }
  return { documents: plan.rows.length, fingerprint: plan.fingerprint };
}

module.exports = { begin, canonical, hash, prepare, resume, verify };
