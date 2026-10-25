import test from 'node:test';
import assert from 'node:assert/strict';
import { isQrReviewEntry, sandboxReviewSignIn } from '../src/lib/sandboxReviewSignIn.mjs';

const config = { projectId: 'fairway-refresh-sandbox-qr1', apiKey: 'test-key' };
const action = 'https://fairway-refresh-sandbox-qr1.firebaseapp.com/__/auth/action?mode=signIn&apiKey=test-key&oobCode=test-code';
function reviewUrl(link = action, email = 'review@example.test') {
  return 'https://fairway-refresh-sandbox-qr1.web.app/?course_id=COURSE-0002#' +
    new URLSearchParams({ review_sign_in: link, email });
}
test('private QR review link composes Firebase email-link authentication without public access', () => {
  assert.deepEqual(sandboxReviewSignIn(reviewUrl(), 'sandbox', config), {
    email: 'review@example.test', link: action,
  });
  assert.equal(sandboxReviewSignIn('https://fairway-refresh-sandbox-qr1.web.app/', 'sandbox', config), null);
});
test('review authentication cannot cross environment, project, host or entry point', () => {
  assert.equal(isQrReviewEntry(reviewUrl(), 'sandbox', config), true);
  assert.equal(isQrReviewEntry(reviewUrl(), 'production', config), false);
  assert.equal(isQrReviewEntry(reviewUrl(), 'sandbox', { ...config, projectId: 'fairway-refresh-sandbox-260930' }), false);
  assert.throws(() => sandboxReviewSignIn(reviewUrl(), 'production', config));
  assert.throws(() => sandboxReviewSignIn(reviewUrl(), 'sandbox', { ...config, projectId: 'fairway-refresh-sandbox-260930' }));
  assert.throws(() => sandboxReviewSignIn(reviewUrl().replace('.web.app/', '.web.app/admin'), 'sandbox', config));
  assert.throws(() => sandboxReviewSignIn(reviewUrl().replace('https:', 'http:'), 'sandbox', config));
});
test('invalid email, external action URLs, reset actions and mismatched keys fail closed', () => {
  for (const link of [action.replace('.firebaseapp.com', '.example.com'), action.replace('signIn', 'resetPassword'),
    action.replace('test-key', 'another-key'), action.replace('oobCode=test-code', 'unused=true')]) {
    assert.throws(() => sandboxReviewSignIn(reviewUrl(link), 'sandbox', config));
  }
  assert.throws(() => sandboxReviewSignIn(reviewUrl(action, ''), 'sandbox', config));
});
