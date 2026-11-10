'use strict';

const assert = require('node:assert/strict');
const { createGcsArtifactStore } = require('../lib/ota/gcs_artifact_store');

async function run() {
  const bytes = Buffer.from('accepted image');
  const metadata = { sha256: 'approved', release_id: 'OTA-0.1alt' };
  let savedOptions;
  const file = {
    async save(_bytes, options) { savedOptions = options; },
    async getMetadata() { return [{ size: String(bytes.length), metadata }]; },
  };
  const storage = { bucket: () => ({ file: () => file }) };
  const store = createGcsArtifactStore('private-test-bucket', storage);
  await store.upload('approved.bin', bytes, metadata);
  assert.equal(savedOptions.preconditionOpts.ifGenerationMatch, 0);
  assert.equal(savedOptions.metadata.cacheControl, 'private, no-store');
  file.save = async () => { throw Object.assign(new Error('already exists'), { code: 412 }); };
  await store.upload('approved.bin', bytes, metadata);
  file.getMetadata = async () => [{ size: String(bytes.length), metadata: { ...metadata, sha256: 'different' } }];
  await assert.rejects(store.upload('approved.bin', bytes, metadata), /does not match/);
  file.save = async () => { throw Object.assign(new Error('permission denied'), { code: 403 }); };
  await assert.rejects(store.upload('approved.bin', bytes, metadata), /permission denied/);
  assert.equal(createGcsArtifactStore(''), null);
  console.log('PASS: OTA private create-only upload, exact retry, mismatch and IAM failure checks');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
