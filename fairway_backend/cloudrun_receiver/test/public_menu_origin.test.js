'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { resolvePublicMenuOrigin, PRODUCTION_ADMIN_ORIGINS } = require('../lib/environment');

test('sandbox menu origins are bound to the validated sandbox project', () => {
  const env = { FAIRWAY_ENV: 'sandbox', FAIRWAY_GCP_PROJECT: 'fairway-refresh-sandbox-260930',
    GOOGLE_CLOUD_PROJECT: 'fairway-refresh-sandbox-260930' };
  assert.equal(resolvePublicMenuOrigin(env), 'https://fairway-refresh-sandbox-260930.web.app');
  assert.throws(() => resolvePublicMenuOrigin({ ...env, GOOGLE_CLOUD_PROJECT: 'savvy-kit-496703-r5' }));
  assert.throws(() => resolvePublicMenuOrigin({ ...env, FAIRWAY_GCP_PROJECT: 'savvy-kit-496703-r5' }));
});

test('production menu origins retain the permanent custom domain', () => {
  assert.equal(resolvePublicMenuOrigin({ FAIRWAY_ENV: 'production', FAIRWAY_SERVICE_MODE: 'admin',
    FAIRWAY_GCP_PROJECT: 'savvy-kit-496703-r5', GOOGLE_CLOUD_PROJECT: 'savvy-kit-496703-r5',
    FAIRWAY_ALLOWED_ORIGIN: PRODUCTION_ADMIN_ORIGINS.join(',') }), 'https://app.fairwayrefresh.com');
});
