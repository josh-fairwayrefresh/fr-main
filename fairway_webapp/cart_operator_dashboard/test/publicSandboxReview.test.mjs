import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSandboxReviewEnabled, preparePublicReviewer } from '../src/lib/publicSandboxReview.mjs';

test('automatic review is limited to explicitly enabled sandbox operator routes', () => {
  const config = { projectId: 'fairway-refresh-sandbox-qr1' };
  const location = { origin: `https://${config.projectId}.web.app`, pathname: '/' };
  assert.equal(publicSandboxReviewEnabled('sandbox', config, location, 'true'), true);
  assert.equal(publicSandboxReviewEnabled('sandbox', { projectId: 'fairway-refresh-sandbox-260930' },
    { origin: 'https://fairway-refresh-sandbox-260930.web.app', pathname: '/inventory' }, 'true'), true);
  for (const pathname of ['/admin', '/cartmenus/test', '/range/test']) {
    assert.equal(publicSandboxReviewEnabled('sandbox', config, { ...location, pathname }, 'true'), false);
  }
  assert.equal(publicSandboxReviewEnabled('production', config, location, 'true'), false);
  assert.equal(publicSandboxReviewEnabled('sandbox', config, location, undefined), false);
  assert.equal(publicSandboxReviewEnabled('sandbox', config, { ...location, origin: 'https://app.fairwayrefresh.com' }, 'true'), false);
});
test('access is provisioned before bootstrap and failure is explicit', async (t) => {
  let call;
  t.mock.method(globalThis, 'fetch', async (...args) => { call = args; return { ok: true }; });
  await preparePublicReviewer({ getIdToken: async () => 'test-only' }, 'https://sandbox.example');
  assert.deepEqual(call, ['https://sandbox.example/api/v1/sandbox/review-access',
    { method: 'POST', headers: { Authorization: 'Bearer test-only' } }]);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
  await assert.rejects(preparePublicReviewer({ getIdToken: async () => 'test-only' }, 'https://sandbox.example'), /503.*Reload to retry/);
});
