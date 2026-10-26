'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { publicReviewConfiguration, provisionPublicReviewer } = require('../lib/public_sandbox_review');
const { createFairwayHandlers } = require('../index');
const { FakeFirestore } = require('./fake_firestore');

const env = {
  FAIRWAY_ENV: 'sandbox', FAIRWAY_GCP_PROJECT: 'fairway-refresh-sandbox-qr1',
  GOOGLE_CLOUD_PROJECT: 'fairway-refresh-sandbox-qr1', FAIRWAY_PUBLIC_REVIEW: 'true',
  FAIRWAY_PUBLIC_REVIEW_SCOPE: JSON.stringify({ customer_id: 'CUST-0001', course_ids: ['COURSE-0001', 'COURSE-0002'] }),
};
const access = publicReviewConfiguration(env);
const identity = { uid: 'reviewer', firebase: { sign_in_provider: 'anonymous' } };
async function fixture() {
  const db = new FakeFirestore();
  await db.collection('customers').doc('CUST-0001').set({ customer_name: 'Synthetic' });
  for (const id of access.course_ids) await db.collection('customers').doc('CUST-0001').collection('courses').doc(id).set({ course_name: id });
  return db;
}
function response() {
  return { statusCode: 200, set() { return this; }, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
}
test('public review defaults off and refuses production, mismatched projects and unbounded scopes', () => {
  assert.equal(publicReviewConfiguration({}), null);
  for (const change of [
    { FAIRWAY_ENV: 'production' }, { GOOGLE_CLOUD_PROJECT: 'savvy-kit-496703-r5' },
    { FAIRWAY_GCP_PROJECT: 'fairway-refresh-sandbox-other', GOOGLE_CLOUD_PROJECT: 'fairway-refresh-sandbox-other' },
    { FAIRWAY_PUBLIC_REVIEW_SCOPE: '{}' },
    { FAIRWAY_PUBLIC_REVIEW_SCOPE: '{"customer_id":"CUST-0001","course_ids":[]}' },
  ]) assert.throws(() => publicReviewConfiguration({ ...env, ...change }));
  assert.deepEqual(access, { schema_version: 2, admin: false, customer_id: 'CUST-0001', course_ids: ['COURSE-0001', 'COURSE-0002'] });
});
test('anonymous provisioning is concurrent-safe, scoped and never overwrites existing permissions', async () => {
  const db = await fixture();
  assert.equal(await provisionPublicReviewer(db, { ...identity, firebase: { sign_in_provider: 'password' } }, access), false);
  await Promise.all(Array.from({ length: 10 }, () => provisionPublicReviewer(db, identity, access)));
  assert.deepEqual((await db.collection('user_access').doc('reviewer').get()).data(), access);
  await db.collection('user_access').doc('reviewer').set({ schema_version: 2, admin: true, customer_id: null, course_ids: [] });
  await assert.rejects(provisionPublicReviewer(db, identity, access), /does not match/);
  assert.equal((await db.collection('user_access').doc('reviewer').get()).data().admin, true);
  await assert.rejects(provisionPublicReviewer(db, { ...identity, uid: 'missing-course' },
    { ...access, course_ids: ['COURSE-9999'] }), /configuration is unavailable/);
  assert.equal((await db.collection('user_access').doc('missing-course').get()).exists, false);
});
test('receiver requires verified anonymous tokens, fixed configuration and POST', async () => {
  const db = await fixture();
  const handler = createFairwayHandlers(db, { publicReviewAccess: access, verifyOperatorToken: async (token) => {
    if (token === 'anonymous') return identity;
    if (token === 'registered') return { uid: 'registered' };
    throw new Error('invalid token');
  } }).fairwayButtonReceiver;
  for (const [token, method, status] of [[null, 'POST', 401], ['forged', 'POST', 401],
    ['registered', 'POST', 403], ['anonymous', 'GET', 405], ['anonymous', 'POST', 200]]) {
    const res = response();
    await handler({ path: '/api/v1/sandbox/review-access', method,
      body: { customer_id: 'CUST-9999', admin: true }, get: () => token ? `Bearer ${token}` : '' }, res);
    assert.equal(res.statusCode, status);
  }
  assert.deepEqual((await db.collection('user_access').doc('reviewer').get()).data(), access);
  const res = response();
  await createFairwayHandlers(db, { publicReviewAccess: null }).fairwayButtonReceiver(
    { path: '/api/v1/sandbox/review-access', method: 'POST' }, res);
  assert.equal(res.statusCode, 404);
});
