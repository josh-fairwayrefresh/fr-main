'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const inventory = require('../lib/inventory');
const {
  getUserAccess,
  normalizeAccessRecord,
  resolveAuthorizedCourses,
} = require('../lib/user_access');

const customerAccess = {
  schema_version: 3,
  admin: false,
  customer_id: 'customer',
  menu_ids: [],
  service_ids: [],
};

test('v3 requires explicit, unique and well-formed menu and service grants', () => {
  assert.deepEqual(normalizeAccessRecord(customerAccess), customerAccess);
  for (const record of [
    { ...customerAccess, menu_ids: undefined },
    { ...customerAccess, service_ids: undefined },
    { ...customerAccess, menu_ids: ['one', 'one'] },
    { ...customerAccess, service_ids: ['other/course'] },
    { ...customerAccess, admin: true, customer_id: null, menu_ids: ['one'] },
  ]) assert.equal(normalizeAccessRecord(record), null);
});

test('v3 empty service grants never grant all courses and menus do not grant services', async () => {
  const db = new FakeFirestore();
  const customer = db.collection('customers').doc('customer');
  await customer.set({ customer_name: 'Customer' });
  await customer.collection('courses').doc('course').set({ course_name: 'Course' });
  await customer.collection('services').doc('course').set({ course_id: 'course' });
  await customer.collection('menus').doc('menu').set({ type: 'cart' });
  await db.collection('user_access').doc('user').set({ ...customerAccess, menu_ids: ['menu'] });
  assert.deepEqual(await resolveAuthorizedCourses(db, await getUserAccess(db, 'user')), []);

  await db.collection('user_access').doc('user').set({
    ...customerAccess, service_ids: ['course'],
  });
  assert.deepEqual(
    (await resolveAuthorizedCourses(db, await getUserAccess(db, 'user'))).map((course) => course.course_id),
    ['course']
  );
});

test('v3 references must exist inside the customer and service context must match its ID', async () => {
  const db = new FakeFirestore();
  const customer = db.collection('customers').doc('customer');
  await customer.set({ customer_name: 'Customer' });
  await customer.collection('services').doc('service').set({ course_id: 'different' });
  await db.collection('user_access').doc('user').set({
    ...customerAccess, service_ids: ['service'],
  });

  test('v3 service grants cannot open legacy course-owned inventory', async () => {
    const db = new FakeFirestore();
    const customer = db.collection('customers').doc('customer');
    await customer.set({ customer_name: 'Customer' });
    await customer.collection('courses').doc('course').set({ course_name: 'Course' });
    await customer.collection('services').doc('course').set({ course_id: 'course' });
    await db.collection('user_access').doc('user').set({
      ...customerAccess, service_ids: ['course'],
    });
    await assert.rejects(inventory.requireCourseAccess(db, 'user', 'customer', 'course'),
      (error) => error.status === 409 && error.code === 'migration_required');
  });
  assert.equal(await getUserAccess(db, 'user'), null);
  await db.collection('user_access').doc('user').set({
    ...customerAccess, menu_ids: ['missing'],
  });
  assert.equal(await getUserAccess(db, 'user'), null);
});
