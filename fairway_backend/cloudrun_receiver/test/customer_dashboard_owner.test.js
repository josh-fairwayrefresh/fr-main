'use strict';

process.env.FAIRWAY_OPERATIONAL_STORAGE = 'customer';
const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const { createFairwayHandlers } = require('../index');

test('service dashboard resolves Customer services without a Course owner', async () => {
  const db = new FakeFirestore();
  const customer = db.collection('customers').doc('synthetic-dashboard');
  await customer.set({ customer_name: 'Synthetic dashboard', authorization_schema_version: 3,
    operational_storage: { state: 'customer' } });
  await customer.collection('services').doc('cart').set({
    service_id: 'cart', course_id: 'context-only', course_name: 'Customer cart service',
    timezone: 'America/Los_Angeles', operation_kind: 'cart', service_suspension: null,
  });
  await db.collection('user_access').doc('operator').set({
    schema_version: 3, admin: false, customer_id: customer.id, menu_ids: [], service_ids: ['cart'],
  });
  const handlers = createFairwayHandlers(db, { verifyOperatorToken: async () => ({ uid: 'operator' }) });
  const req = { method: 'GET', path: '/api/v1/operator/dashboard',
    query: { customer_id: customer.id, course_id: 'cart' },
    get: name => name.toLowerCase() === 'authorization' ? 'Bearer synthetic-test' : undefined };
  const res = { statusCode: null, body: null, set() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }, send(value) { this.body = value; return this; } };
  await handlers.fairwayButtonReceiver(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.courses.length, 1);
  assert.equal(res.body.courses[0].service_id, 'cart');
  assert.equal(res.body.courses[0].service_state.active, true);
  assert.equal((await customer.collection('courses').get()).size, 0);
});
