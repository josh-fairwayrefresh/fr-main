import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyDrivingRangeAssets } from '../scripts/verify_driving_range_assets.mjs';

const publicAssets = fileURLToPath(new URL('../public/driving-range-signs/', import.meta.url));

async function createDistCopy() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'fairway-range-assets-'));
  const distDirectory = path.join(directory, 'dist');
  await cp(publicAssets, path.join(distDirectory, 'driving-range-signs'), { recursive: true });
  return { directory, distDirectory, assetDirectory: path.join(distDirectory, 'driving-range-signs') };
}

test('verifies the accepted 107-file production sign artifact', async () => {
  const { directory, distDirectory } = await createDistCopy();
  try {
    assert.equal(await verifyDrivingRangeAssets(distDirectory), 107);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects a missing required QR image', async () => {
  const { directory, distDirectory, assetDirectory } = await createDistCopy();
  try {
    await unlink(path.join(assetDirectory, 'production-bay-01A.png'));
    await assert.rejects(verifyDrivingRangeAssets(distDirectory), /exactly 107 required/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects an altered required QR image', async () => {
  const { directory, distDirectory, assetDirectory } = await createDistCopy();
  try {
    await writeFile(path.join(assetDirectory, 'production-bay-01A.png'), 'altered');
    await assert.rejects(verifyDrivingRangeAssets(distDirectory), /contents differ/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects an altered permanent QR mapping', async () => {
  const { directory, distDirectory, assetDirectory } = await createDistCopy();
  try {
    await writeFile(path.join(assetDirectory, 'driving-range-bay-mapping.json'), '{}');
    await assert.rejects(verifyDrivingRangeAssets(distDirectory), /QR mapping has changed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects an altered installation PDF', async () => {
  const { directory, distDirectory, assetDirectory } = await createDistCopy();
  try {
    await writeFile(path.join(assetDirectory, 'driving-range-installation.pdf'), 'altered');
    await assert.rejects(verifyDrivingRangeAssets(distDirectory), /installation PDF has changed/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
