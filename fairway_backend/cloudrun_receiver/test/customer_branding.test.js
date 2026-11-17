'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PNG } = require('pngjs');
const { FakeFirestore } = require('./fake_firestore');
const { createFairwayHandlers } = require('../index');
const branding = require('../lib/customer_branding');

const customerOwned = process.env.FAIRWAY_OPERATIONAL_STORAGE === 'customer';
const MONARCH_SOURCE = path.join(__dirname, '../../../docs/logo_source_files/customers/monarch-bay-golf-club/monarch-bay-golf-club-transparent.png');

function png(width, height, paint) {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) image.data.set(paint(x, y), (y * width + x) * 4);
  }
  return PNG.sync.write(image, { colorType: 6 });
}
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function harness() {
  const db = new FakeFirestore();
  for (const id of ['customer', 'other']) {
    const customer = db.collection('customers').doc(id);
    await customer.set({
      customer_name: id === 'customer' ? 'Customer Club' : 'Other',
      ...(customerOwned ? { authorization_schema_version: 3, operational_storage: { state: 'customer' } } : {}),
    });
    await customer.collection('courses').doc('course').set({ course_name: 'Course', timezone: 'UTC' });
    await customer.collection('assets').doc('course').set({ type: 'cart', course_id: 'course', course_name: 'Course', timezone: 'UTC' });
    await customer.collection('services').doc('course').set({ course_id: 'course' });
  }
  await db.collection('user_access').doc('admin').set({ schema_version: 3, admin: true, customer_id: null, menu_ids: [], service_ids: [] });
  await db.collection('user_access').doc('worker').set({ schema_version: 3, admin: false, customer_id: 'customer', menu_ids: [], service_ids: [] });
  const { fairwayAdmin } = createFairwayHandlers(db, {
    verifyOperatorToken: async (uid) => ({ uid }),
    firebaseAuth: { getUser: async (uid) => ({ uid, disabled: false, email: `${uid}@example.invalid` }) },
  });
  const request = async (method, route, body, uid = 'admin') => {
    const res = {
      statusCode: 0, headers: {},
      set(k, v) { this.headers[k] = v; return this; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
      send(value) { this.body = value; return this; },
    };
    await fairwayAdmin({ method, path: route, body, query: {}, get: (name) => name === 'authorization' ? `Bearer ${uid}` : null }, res);
    return res;
  };
  return { db, request };
}

test('logo derivative trims only invisible margins, scales proportionally and is deterministic', () => {
  const source = png(200, 100, (x, y) => (x >= 50 && x < 150 && y >= 25 && y < 75 ? [200, 120, 30, 255] : [255, 255, 255, 3]));
  const first = branding.prepareLogoPng(source, { maxWidth: 64 });
  const second = branding.prepareLogoPng(source, { maxWidth: 64 });
  assert.equal(first.sha256, second.sha256);
  assert.deepEqual(first.crop, { left: 50, top: 25, width: 100, height: 50 });
  assert.equal(first.width, 64);
  assert.equal(first.height, 32);
  assert.equal(first.source_sha256, sha256(source));
  const decoded = PNG.sync.read(first.buffer);
  assert.deepEqual([...decoded.data.subarray(0, 4)], [200, 120, 30, 255], 'Artwork colour is preserved');
  const smaller = branding.prepareLogoPng(source, { maxWidth: 640 });
  assert.equal(smaller.width, 100, 'Never upscales artwork');
  assert.throws(() => branding.prepareLogoPng(png(4, 4, () => [0, 0, 0, 0])), { code: 'invalid_logo' });
  assert.throws(() => branding.prepareLogoPng(Buffer.from('not a png')), { code: 'invalid_logo' });
});

test('approved Monarch Bay artwork yields a web derivative within the Customer logo limit', () => {
  const derivative = branding.prepareLogoPng(fs.readFileSync(MONARCH_SOURCE));
  assert.equal(derivative.width, branding.DEFAULT_LOGO_WIDTH);
  assert.ok(derivative.byte_length <= branding.MAX_LOGO_BYTES);
  assert.equal(derivative.sha256, sha256(derivative.buffer));
});

test('Customer-owned logo is inherited by every menu of that Customer only', async () => {
  const { db, request } = await harness();
  const base = '/api/v1/admin/customers/customer/menus';
  assert.equal((await request('POST', base, {
    name: 'cart_menu', type: 'cart', slug: 'customer_cart', aliases: ['customer-cart'], asset_id: 'course',
  })).statusCode, 201);
  assert.equal((await request('POST', base, { name: 'restaurant_menu', type: 'restaurant', aliases: ['customer-restaurant'] })).statusCode, 201);
  assert.equal((await request('POST', '/api/v1/admin/customers/other/menus', { name: 'restaurant_menu', type: 'restaurant', aliases: ['other-restaurant'] })).statusCode, 201);

  let menu = await request('GET', '/api/v1/public/menus/customer-cart');
  assert.equal(menu.statusCode, 200);
  assert.deepEqual(menu.body.branding, { logo_url: null }, 'No logo until the Customer has one');
  assert.equal(menu.body.customer_name, 'Customer Club');

  const logo = branding.prepareLogoPng(png(40, 20, () => [10, 80, 60, 255]));
  const route = '/api/v1/admin/customers/customer/branding/logo';
  assert.equal((await request('PUT', route, { png_base64: logo.buffer.toString('base64') }, 'worker')).statusCode, 403);
  assert.equal((await request('PUT', route, { png_base64: 'bm90IGEgcG5n' })).statusCode, 400);
  assert.equal((await request('PUT', route, { png_base64: logo.buffer.toString('base64'), source_sha256: 'bad' })).statusCode, 400);
  assert.equal((await request('PUT', '/api/v1/admin/customers/missing/branding/logo', { png_base64: logo.buffer.toString('base64') })).statusCode, 404);
  const saved = await request('PUT', route, { png_base64: logo.buffer.toString('base64'), source_sha256: logo.source_sha256 });
  assert.equal(saved.statusCode, 200);
  const logoUrl = `/api/v1/public/customers/customer/logo/${logo.sha256}`;
  assert.equal(saved.body.logo.logo_url, logoUrl);
  assert.equal((await request('GET', route)).body.logo.sha256, logo.sha256);

  for (const slug of ['customer_cart', 'customer-cart', 'customer-restaurant']) {
    menu = await request('GET', `/api/v1/public/menus/${slug}`);
    assert.equal(menu.statusCode, 200);
    assert.deepEqual(menu.body.branding, { logo_url: logoUrl }, `${slug} inherits Customer branding`);
  }
  assert.deepEqual((await request('GET', '/api/v1/public/menus/other-restaurant')).body.branding, { logo_url: null });

  const served = await request('GET', logoUrl);
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers['Content-Type'], 'image/png');
  assert.equal(served.headers['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.equal(served.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(sha256(served.body), logo.sha256);
  assert.equal((await request('GET', `/api/v1/public/customers/other/logo/${logo.sha256}`)).statusCode, 404, 'Logos are Customer-scoped');
  assert.equal((await request('GET', `/api/v1/public/customers/customer/logo/${'0'.repeat(64)}`)).statusCode, 404);
  assert.equal((await request('POST', logoUrl)).statusCode, 405);

  const replacement = branding.prepareLogoPng(png(30, 30, () => [120, 20, 20, 255]));
  assert.equal((await request('PUT', route, { png_base64: replacement.buffer.toString('base64') })).statusCode, 200);
  const replacementUrl = `/api/v1/public/customers/customer/logo/${replacement.sha256}`;
  for (const slug of ['customer_cart', 'customer-cart', 'customer-restaurant']) {
    assert.deepEqual((await request('GET', `/api/v1/public/menus/${slug}`)).body.branding, { logo_url: replacementUrl },
      `${slug} resolves only the current Customer logo`);
  }
  const historical = await request('GET', logoUrl);
  assert.equal(historical.statusCode, 200, 'Historical immutable logo URL remains valid');
  assert.equal(sha256(historical.body), logo.sha256, 'Historical URL serves its original bytes');
  assert.equal(historical.headers['Cache-Control'], 'public, max-age=31536000, immutable');
  assert.equal(sha256((await request('GET', replacementUrl)).body), replacement.sha256);
  assert.equal((await request('GET', `/api/v1/public/customers/other/logo/${logo.sha256}`)).statusCode, 404,
    'Historical logos stay Customer-isolated');
  assert.equal((await request('GET', `/api/v1/public/customers/other/logo/${replacement.sha256}`)).statusCode, 404);
  assert.equal((await request('PUT', route, { png_base64: logo.buffer.toString('base64') })).statusCode, 200);
  assert.deepEqual((await request('GET', '/api/v1/public/menus/customer-cart')).body.branding, { logo_url: logoUrl },
    'Restoring a previous logo reuses its immutable record');
  const tampered = db.collection('customers').doc('customer').collection('branding_logos').doc(replacement.sha256);
  await tampered.update({ data: Buffer.from('tampered') });
  assert.equal((await request('GET', replacementUrl)).statusCode, 404, 'Bytes not matching their hash are never served');
});

test('menus cannot own or override branding', async () => {
  const { db, request } = await harness();
  const base = '/api/v1/admin/customers/customer/menus';
  assert.equal((await request('POST', base, {
    name: 'restaurant_menu', type: 'restaurant', branding: { logo_url: '/logo.png' },
  })).statusCode, 400);
  const created = await request('POST', base, { name: 'restaurant_menu', type: 'restaurant' });
  const menuId = created.body.menu.menu_id;
  const ref = db.collection('customers').doc('customer').collection('menus').doc(menuId);
  await ref.update({ branding: { logo_url: '/legacy-menu-logo.png' } });
  assert.deepEqual((await request('GET', `/api/v1/public/menus/${created.body.menu.slug}`)).body.branding, { logo_url: null },
    'Menu-level branding is ignored');
  assert.equal((await request('PATCH', `${base}/${menuId}`, { title: 'Lunch' })).statusCode, 200);
  assert.equal(Object.hasOwn((await ref.get()).data(), 'branding'), false, 'Saving a menu removes legacy menu branding');
});
