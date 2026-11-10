import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production Hosting retains the site, SPA routing and versioned-asset cache policy', async () => {
  const { hosting } = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'));
  assert.equal(hosting.site, 'savvy-kit-496703-r5');
  assert.equal(hosting.public, 'dist');
  assert.deepEqual(hosting.rewrites, [{ source: '**', destination: '/index.html' }]);
  assert.deepEqual(hosting.headers, [
    { source: '**', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    { source: '/assets/**', headers: [{ key: 'Cache-Control', value: 'public,max-age=31536000,immutable' }] },
  ]);
});

test('initial OTA deployment retains an empty reviewed publication catalog', async () => {
  const policy = await readFile(new URL('../../../fairway_backend/cloudrun_receiver/lib/ota/publication_policy.js', import.meta.url), 'utf8');
  assert.match(policy, /const PUBLICATION_APPROVALS = Object\.freeze\(\{\}\);/);
  assert.match(policy, /releaseId !== 'OTA-0\.1'/);
});
