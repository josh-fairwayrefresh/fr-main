import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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

test('OTA publication catalog contains only reviewed, exact-hash, FRB-0005 approvals and never USB-only images', async () => {
  const require = createRequire(import.meta.url);
  const otaDir = '../../../fairway_backend/cloudrun_receiver/lib/ota/';
  const { PUBLICATION_APPROVALS, publicationEligible } = require(`${otaDir}publication_policy.js`);
  const { ACCEPTED_RELEASES } = require(`${otaDir}accepted_releases.js`);
  const approved = Object.entries(PUBLICATION_APPROVALS);
  assert.ok(approved.length > 0);
  for (const [releaseId, approval] of approved) {
    assert.equal(approval.sha256, ACCEPTED_RELEASES[releaseId], releaseId);
    assert.deepEqual(approval.device_ids, ['FRB-0005'], releaseId);
    assert.match(approval.release_record_commit, /^[a-f0-9]{40}$/, releaseId);
    assert.equal(publicationEligible(releaseId, approval.sha256), true, releaseId);
  }
  for (const usbOnly of ['OTA-0.1', 'OTA-0.1-r3', 'OTA-0.1-r4']) {
    assert.equal(Object.hasOwn(PUBLICATION_APPROVALS, usbOnly), false, usbOnly);
    assert.equal(publicationEligible(usbOnly, ACCEPTED_RELEASES[usbOnly]), false, usbOnly);
  }
});
