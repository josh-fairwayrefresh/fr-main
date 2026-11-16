import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMenuBootstrap } from '../src/lib/menuBootstrap.mjs';

const menu = { menu_id: 'm1', name: 'cart_menu', type: 'cart', state: 'active', asset_id: 'asset-1' };
const customer = { customer_id: 'c1', customer_name: 'Customer', menus: [menu] };

test('menu access is explicit and archived-only customers do not grant entry', () => {
  assert.deepEqual(normalizeMenuBootstrap({ customers: [customer] }), [customer]);
  assert.deepEqual(normalizeMenuBootstrap({ customers: [{ ...customer, menus: [{ ...menu, state: 'archived' }] }] }), []);
  assert.deepEqual(normalizeMenuBootstrap({ customers: [] }), []);
});

test('malformed or ambiguous asset directory fails closed', () => {
  assert.throws(() => normalizeMenuBootstrap({ customers: [{ ...customer, menus: [{ ...menu, asset_id: '' }] }] }), /could not be verified/);
  assert.throws(() => normalizeMenuBootstrap({ customers: [{ ...customer, menus: [menu, menu] }] }), /could not be verified/);
  assert.throws(() => normalizeMenuBootstrap({ customers: [customer, customer] }), /could not be verified/);
  assert.throws(() => normalizeMenuBootstrap({ customers: [{ ...customer, menus: [{ ...menu, type: 'unknown' }] }] }), /could not be verified/);
});
