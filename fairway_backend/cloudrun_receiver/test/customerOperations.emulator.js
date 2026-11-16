'use strict';

const assert = require('node:assert/strict');
const { Firestore } = require('@google-cloud/firestore');
const storage = require('../lib/operational_storage');
const migration = require('../lib/customer_operations_migration');
const inventory = require('../lib/inventory');

const projectId = 'fairway-refresh-sandbox-customer-assets';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8799');
assert.equal(process.env.GOOGLE_CLOUD_PROJECT, projectId);
assert.equal(process.env.FAIRWAY_ENV, 'sandbox');
for (const name of ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_OAUTH_ACCESS_TOKEN',
  'CLOUDSDK_AUTH_ACCESS_TOKEN', 'FIREBASE_TOKEN']) assert.equal(process.env[name], undefined);

async function run() {
  const db = new Firestore({ projectId });
  const customer = db.collection('customers').doc(`migration-${Date.now()}`);
  const course = customer.collection('courses').doc('cart');
  process.env.FAIRWAY_OPERATIONAL_STORAGE = 'legacy';
  await customer.set({ customer_name: 'Synthetic emulator Customer', operational_storage: { state: 'legacy' } });
  await course.set({ course_name: 'Synthetic cart', timezone: 'UTC', operation_kind: 'cart', service_suspension: null });
  await customer.collection('menus').doc('menu').set({ name: 'cart', type: 'cart', state: 'active',
    asset_id: 'cart', slug: `${customer.id}_cart`, aliases: [] });
  const product = course.collection('inventory_products').doc('water');
  await product.set({ name: 'Water', state: 'on_cart', quantity: 5, archived: false });
  await course.collection('inventory_categories').doc('missing-parent').collection('subcategories')
    .doc('retained').set({ name: 'Retained nested identity' });
  const plan = await migration.prepare(db, customer.id);
  let readResolve;
  let writeResolve;
  const read = new Promise(resolve => { readResolve = resolve; });
  const write = new Promise(resolve => { writeResolve = resolve; });
  const writer = db.runTransaction(async tx => {
    await storage.assertOwner(db, customer.id, tx);
    const snapshot = await tx.get(product);
    readResolve();
    await write;
    tx.update(product, { quantity: snapshot.data().quantity - 1 });
  });
  await read;
  const evidence = { migrationId: 'emulator-cutover', backupEvidence: 'synthetic-local-backup',
    quiescenceEvidence: 'local-transaction-drained' };
  const barrier = migration.begin(db, plan, evidence);
  writeResolve();
  await writer;
  await barrier;
  await assert.rejects(migration.resume(db, plan, evidence.migrationId), /source changed/);
  assert.equal((await product.get()).data().quantity, 4);
  const refreshed = await migration.prepare(db, customer.id);
  await migration.begin(db, refreshed, evidence);
  await migration.resume(db, refreshed, evidence.migrationId);
  process.env.FAIRWAY_OPERATIONAL_STORAGE = 'customer';
  assert.equal((await inventory.listInventory(db, customer.id, 'cart')).products[0].quantity, 4);
  const nested = storage.inventoryRef(db, customer.id, 'cart').collection('inventory_categories')
    .doc('missing-parent').collection('subcategories').doc('retained');
  assert.equal((await nested.get()).data().name, 'Retained nested identity');
  const live = storage.inventoryRef(db, customer.id, 'cart').collection('inventory_products').doc('water');
  await db.runTransaction(async tx => {
    await storage.assertOwner(db, customer.id, tx);
    tx.update(live, { quantity: 2 });
  });
  await migration.resume(db, refreshed, evidence.migrationId);
  assert.equal((await live.get()).data().quantity, 2);
  process.env.FAIRWAY_OPERATIONAL_STORAGE = 'legacy';
  await assert.rejects(db.runTransaction(tx => storage.assertOwner(db, customer.id, tx)), /unavailable/);
  console.log('PASS: real Firestore transaction fence drains an in-flight write, rejects a stale plan, preserves orphan-parent descendants, and forward recovery retains live Customer activity.');
  await db.terminate();
}

run().catch(error => { console.error(error); process.exitCode = 1; });
