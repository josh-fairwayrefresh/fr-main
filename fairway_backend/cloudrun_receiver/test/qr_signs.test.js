'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { generateSigns } = require('../scripts/qr_signs');
const QRCode = require('qrcode');
const { PNG } = require('pngjs');

const bays = Array.from({ length: 52 }, (_, index) => ({
  id: `synthetic-bay-${String(index + 1).padStart(11, '0')}`,
  bay_number: Math.floor(index / 2) + 1, bay_side: index % 2 ? 'B' : 'A',
}));

test('52 sandbox side codes decode to unique expected URLs on 26 Letter pages', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fairway-qr-signs-'));
  try {
    const mapping = await generateSigns({
      bays, origin: 'https://fairway-refresh-sandbox-test.web.app', outputDirectory: directory,
    });
    assert.equal(mapping.length, 52);
    assert.equal(new Set(mapping.map((row) => row.url)).size, 52);
    assert.ok(mapping.every((row, index) => row.decoded &&
      row.bay_number === Math.floor(index / 2) + 1 && row.bay_side === (index % 2 ? 'B' : 'A')));
    const pdf = await fs.readFile(path.join(directory, 'sandbox-url-bay-signs.pdf'));
    const structure = pdf.toString('latin1');
    assert.equal((structure.match(/\/Type \/Page\b/g) || []).length, 26);
    assert.match(structure, /\/MediaBox \[0 0 612 792\]/);
    assert.match(structure, /Helvetica-Bold/);
    const firstQr = PNG.sync.read(await fs.readFile(path.join(directory, mapping[0].qr_png)));
    const modules = QRCode.create(mapping[0].url, { errorCorrectionLevel: 'M' }).modules.size;
    const quietPixels = Math.floor(firstQr.width * 4 / (modules + 8));
    for (let y = 0; y < firstQr.height; y += 1) {
      for (let x = 0; x < firstQr.width; x += 1) {
        if (x >= quietPixels && y >= quietPixels &&
            x < firstQr.width - quietPixels && y < firstQr.height - quietPixels) continue;
        const offset = (y * firstQr.width + x) * 4;
        assert.ok(firstQr.data.subarray(offset, offset + 4).every((value) => value === 255),
          'QR quiet zone must remain opaque white for four modules on every edge');
      }
    }
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'sandbox-bay-mapping.json'), 'utf8'));
    assert.equal(manifest.production_printing_authorized, false);
    assert.equal((await fs.readdir(directory)).filter((name) => name.endsWith('.svg')).length, 52);
    assert.match(await fs.readFile(path.join(directory, 'index.html'), 'utf8'), /SANDBOX URLs/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('review sign generator rejects production origins and duplicate/missing identities', async () => {
  await assert.rejects(generateSigns({ bays, origin: 'https://app.fairwayrefresh.com', outputDirectory: '.' }), /sandbox signs only/);
  await assert.rejects(generateSigns({ bays: bays.slice(1), origin: 'https://fairway-refresh-sandbox-test.web.app', outputDirectory: '.' }), /52 unique/);
  const duplicate = bays.map((bay) => ({ ...bay }));
  duplicate[25].id = duplicate[0].id;
  await assert.rejects(generateSigns({ bays: duplicate, origin: 'https://fairway-refresh-sandbox-test.web.app', outputDirectory: '.' }), /52 unique/);
  const wrongSide = bays.map((bay) => ({ ...bay }));
  wrongSide[1].bay_side = 'A';
  await assert.rejects(generateSigns({ bays: wrongSide, origin: 'https://fairway-refresh-sandbox-test.web.app', outputDirectory: '.' }), /52 unique/);
  await assert.rejects(generateSigns({ bays, origin: 'https://fairway-refresh-sandbox-test.web.app/path', outputDirectory: '.' }), /sandbox signs only/);
});

test('explicit installation edition requires permanent production origin and Course mapping', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fairway-qr-installation-'));
  try {
    const options = { bays, origin: 'https://app.fairwayrefresh.com', outputDirectory: directory, edition: 'production' };
    await assert.rejects(generateSigns(options), /explicit Customer and Course/);
    await assert.rejects(generateSigns({ ...options, customerId: 'CUST-0001', courseId: 'COURSE-0003',
      origin: 'https://fairway-refresh-sandbox-test.web.app' }), /permanent production origin/);
    const mapping = await generateSigns({ ...options, customerId: 'CUST-0001', courseId: 'COURSE-0003' });
    assert.equal(mapping.length, 52);
    assert.ok(mapping.every((row) => row.url.startsWith('https://app.fairwayrefresh.com/range/') &&
      row.customer_id === 'CUST-0001' && row.course_id === 'COURSE-0003'));
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'driving-range-bay-mapping.json')));
    assert.equal(manifest.environment, 'production');
    assert.equal(manifest.production_printing_authorized, true);
    const pdf = await fs.readFile(path.join(directory, 'driving-range-installation.pdf'));
    assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 26);
    assert.ok(!(await fs.readdir(directory)).some((name) => name.startsWith('sandbox-')));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
