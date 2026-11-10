import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_FILE_COUNT = 107;
// Fingerprint of sorted "filename\0file-sha256\n" records from the accepted release.
const ACCEPTED_INVENTORY_SHA256 = 'a35adfa6d75f5959ac3d9cd1c7accf5877758f4f8220e8ba7c9a5c1449b5cc02';
const ACCEPTED_MAPPING_SHA256 = '23b2c3fa1449a79d8d129e8e693602d3ea5cca63ab7401c582f0d73bc9496b87';
const ACCEPTED_PDF_SHA256 = 'f52966769dc155e37097e43fd5df72a3aadee149224994bb3210a768b1f6f425';

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function expectedFiles() {
  const files = new Set([
    'driving-range-installation.pdf',
    'driving-range-bay-mapping.json',
    'index.html',
  ]);
  for (let bayNumber = 1; bayNumber <= 26; bayNumber += 1) {
    for (const side of ['A', 'B']) {
      const stem = `production-bay-${String(bayNumber).padStart(2, '0')}${side}`;
      files.add(`${stem}.png`);
      files.add(`${stem}.svg`);
    }
  }
  return files;
}

function verifyMapping(mapping) {
  if (mapping.environment !== 'production' || mapping.production_printing_authorized !== true ||
      !Array.isArray(mapping.signs) || mapping.signs.length !== 52) {
    throw new Error('Production bay mapping must contain exactly 52 authorized signs');
  }

  const identities = new Set();
  for (let index = 0; index < mapping.signs.length; index += 1) {
    const bayNumber = Math.floor(index / 2) + 1;
    const side = index % 2 === 0 ? 'A' : 'B';
    const sign = mapping.signs[index];
    const stem = `production-bay-${String(bayNumber).padStart(2, '0')}${side}`;
    const identity = typeof sign.url === 'string'
      ? /^https:\/\/app\.fairwayrefresh\.com\/range\/([A-Za-z0-9_-]{24,64})$/.exec(sign.url)?.[1]
      : undefined;
    if (sign.bay_number !== bayNumber || sign.bay_side !== side || sign.decoded !== true ||
        !identity || identities.has(identity) || sign.customer_id !== 'CUST-0001' ||
        sign.course_id !== 'COURSE-0003' ||
        sign.qr_png !== `${stem}.png` || sign.qr_svg !== `${stem}.svg`) {
      throw new Error(`Production bay mapping is invalid at ${bayNumber}${side}`);
    }
    identities.add(identity);
  }
}

export async function verifyDrivingRangeAssets(distDirectory) {
  const assetDirectory = path.join(distDirectory, 'driving-range-signs');
  const entries = await readdir(assetDirectory, { withFileTypes: true });
  const actualFiles = new Set(entries.map((entry) => entry.name));
  const required = expectedFiles();
  if (entries.length !== REQUIRED_FILE_COUNT || actualFiles.size !== REQUIRED_FILE_COUNT ||
      [...required].some((name) => !actualFiles.has(name)) ||
      [...actualFiles].some((name) => !required.has(name)) ||
      entries.some((entry) => !entry.isFile())) {
    throw new Error(`Hosting artifact must contain exactly ${REQUIRED_FILE_COUNT} required Driving Range files`);
  }

  const hashes = new Map();
  for (const name of [...required].sort()) {
    const contents = await readFile(path.join(assetDirectory, name));
    hashes.set(name, sha256(contents));
  }

  if (hashes.get('driving-range-bay-mapping.json') !== ACCEPTED_MAPPING_SHA256) {
    throw new Error('Accepted Driving Range QR mapping has changed');
  }
  if (hashes.get('driving-range-installation.pdf') !== ACCEPTED_PDF_SHA256) {
    throw new Error('Accepted Driving Range installation PDF has changed');
  }

  const mapping = JSON.parse(await readFile(
    path.join(assetDirectory, 'driving-range-bay-mapping.json'), 'utf8',
  ));
  verifyMapping(mapping);

  const canonicalInventory = [...hashes]
    .map(([name, digest]) => `${name}\0${digest}\n`)
    .join('');
  if (sha256(canonicalInventory) !== ACCEPTED_INVENTORY_SHA256) {
    throw new Error('Driving Range asset contents differ from the accepted release');
  }
  return REQUIRED_FILE_COUNT;
}

async function main() {
  const distDirectory = path.resolve(process.argv[2] ?? 'dist');
  const count = await verifyDrivingRangeAssets(distDirectory);
  console.log(`Verified ${count} accepted Driving Range assets in ${distDirectory}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(`Driving Range asset verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
