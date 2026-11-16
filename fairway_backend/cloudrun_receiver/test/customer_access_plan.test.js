'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { planCustomerAccess } = require('../lib/customer_access_plan');

function fixture() {
  return {
    customerId: 'customer',
    courses: [
      { course_id: 'cart' },
      { course_id: 'range', operation_kind: 'driving_range' },
    ],
    services: [
      { service_id: 'cart', course_id: 'cart' },
      { service_id: 'range', course_id: 'range' },
    ],
    menus: [
      { menu_id: 'cart-menu', type: 'cart', asset_id: 'cart' },
      { menu_id: 'restaurant-menu', type: 'restaurant' },
    ],
    users: [
      { uid: 'all', access: { schema_version: 2, admin: false, customer_id: 'customer', course_ids: [] } },
      { uid: 'range-only', access: { schema_version: 2, admin: false, customer_id: 'customer', course_ids: ['range'] } },
    ],
  };
}

test('access preview preserves broad and restricted v2 scopes without granting restaurant access', () => {
  const result = planCustomerAccess(fixture());
  assert.equal(result.executable, false);
  assert.deepEqual(result.users[0].authorization.service_ids, ['cart', 'range']);
  assert.deepEqual(result.users[0].authorization.menu_ids, ['cart-menu']);
  assert.deepEqual(result.users[1].authorization.service_ids, ['range']);
  assert.deepEqual(result.users[1].authorization.menu_ids, []);
});

test('access preview rejects incomplete or ambiguous mappings and foreign scopes', () => {
  let input = fixture();
  input.services.pop();
  assert.throws(() => planCustomerAccess(input));
  input = fixture();
  input.menus.push({ menu_id: 'other-cart', type: 'cart', asset_id: 'cart' });
  assert.throws(() => planCustomerAccess(input));
  input = fixture();
  input.users[1].access.course_ids = ['foreign'];
  assert.throws(() => planCustomerAccess(input));
  input = fixture();
  input.users[0].access.customer_id = 'other';
  assert.throws(() => planCustomerAccess(input));
});
