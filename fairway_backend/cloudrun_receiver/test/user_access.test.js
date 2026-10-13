'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeFirestore } = require('./fake_firestore');
const {
  getUserAccess,
  normalizeAccessRecord,
  normalizeLegacyAccessForMigration,
  resolveAuthorizedCourses,
  validateAccessRecord,
} = require('../lib/user_access');

async function seedCourse(db, customerId, courseId, customerName, courseName) {
  await db.collection('customers').doc(customerId).set({ customer_name: customerName });
  await db.collection('customers').doc(customerId).collection('courses').doc(courseId)
    .set({ course_name: courseName });
}

test('schema-v2 access is fail-closed and cannot fall through to a legacy Admin marker', () => {
  assert.equal(normalizeAccessRecord({
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: [],
    user_type: 'fairway_staff',
    enabled: true,
    courses: [],
  }).admin, false);
  assert.equal(normalizeAccessRecord({
    schema_version: 2,
    admin: 'false',
    customer_id: 'CUST-0001',
    course_ids: [],
  }), null);
  assert.equal(normalizeAccessRecord({
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
  }), null);
  assert.equal(normalizeAccessRecord({
    enabled: true,
    user_type: 'fairway_staff',
    courses: [],
    course_ids: [],
  }), null);
  assert.equal(normalizeAccessRecord({
    schema_version: 3,
    admin: true,
    customer_id: null,
    course_ids: [],
  }), null);
  assert.equal(normalizeAccessRecord({
    schema_version: 2,
    admin: true,
    customer_id: null,
    course_ids: ['COURSE-0001'],
  }), null);
});

test('legacy records are migration inputs only and malformed assignments fail closed', () => {
  const legacyCustomer = {
    user_type: 'customer_staff',
    enabled: true,
    courses: [{
      customer_id: 'CUST-0001',
      course_id: 'COURSE-0001',
      course_name: 'Course One',
    }],
    course_ids: ['COURSE-0001'],
  };
  assert.equal(normalizeAccessRecord(legacyCustomer), null);
  assert.deepEqual(normalizeLegacyAccessForMigration(legacyCustomer), {
    schema_version: null,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: ['COURSE-0001'],
  });
  assert.equal(normalizeLegacyAccessForMigration({
    ...legacyCustomer,
    course_ids: ['COURSE-9999'],
  }), null);
});

test('empty course restrictions mean all courses within the assigned Customer only', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', 'Customer One', 'Course One');
  await seedCourse(db, 'CUST-0001', 'COURSE-0002', 'Customer One', 'Course Two');
  await seedCourse(db, 'CUST-0002', 'COURSE-0003', 'Customer Two', 'Course Three');
  await db.collection('user_access').doc('customer-user').set({
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: [],
  });

  const access = await getUserAccess(db, 'customer-user');
  const courses = await resolveAuthorizedCourses(db, access);
  assert.deepEqual(courses.map((course) => course.course_id), ['COURSE-0001', 'COURSE-0002']);
  assert.equal(courses.every((course) => course.customer_id === 'CUST-0001'), true);
});

test('explicit restrictions reject courses belonging to a different Customer', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', 'Customer One', 'Course One');
  await seedCourse(db, 'CUST-0002', 'COURSE-0002', 'Customer Two', 'Course Two');
  await db.collection('user_access').doc('customer-user').set({
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: ['COURSE-0002'],
  });
  assert.equal(await getUserAccess(db, 'customer-user'), null);
});

test('access validation shares fail-closed schema and Customer/Course checks', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', 'Customer One', 'Course One');
  const customerCoursesCache = new Map();

  assert.deepEqual(await validateAccessRecord(db, {
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: ['COURSE-0001'],
  }, customerCoursesCache), {
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: ['COURSE-0001'],
  });
  assert.equal(await validateAccessRecord(db, {
    schema_version: 2,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: ['COURSE-9999'],
  }, customerCoursesCache), null);
  assert.equal(await validateAccessRecord(db, {
    schema_version: 1,
    admin: true,
    customer_id: null,
    course_ids: [],
  }, customerCoursesCache), null);
});

test('Admin access is global while malformed, legacy, and unknown access is denied', async () => {
  const db = new FakeFirestore();
  await seedCourse(db, 'CUST-0001', 'COURSE-0001', 'Customer One', 'Course One');
  await db.collection('user_access').doc('admin-user').set({
    schema_version: 2,
    admin: true,
    customer_id: null,
    course_ids: [],
  });
  await db.collection('user_access').doc('disabled-user').set({
    user_type: 'fairway_staff',
    enabled: true,
    courses: [],
    course_ids: [],
  });

  assert.deepEqual(
    (await resolveAuthorizedCourses(db, await getUserAccess(db, 'admin-user')))
      .map((course) => course.course_id),
    ['COURSE-0001']
  );
  assert.equal(await getUserAccess(db, 'disabled-user'), null);
  assert.equal(await getUserAccess(db, 'unknown-user'), null);
});
