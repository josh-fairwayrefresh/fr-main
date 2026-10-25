'use strict';

const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');

async function generateSigns({ bays, origin, outputDirectory }) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || !/^fairway-refresh-sandbox-[a-z0-9-]+\.web\.app$/.test(url.host)) {
    throw new Error('This increment generates sandbox signs only');
  }
  if (bays.length !== 26 || new Set(bays.map((bay) => bay.id)).size !== 26 ||
      bays.some((bay, index) => bay.bay_number !== index + 1 || !/^[A-Za-z0-9_-]{24,64}$/.test(bay.id))) {
    throw new Error('Exactly 26 unique, ordered bay identities are required');
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  const pdf = new PDFDocument({ autoFirstPage: false, size: 'LETTER', margin: 48,
    info: { Title: 'SANDBOX TEST Driving Range — 26 Bay Signs' } });
  const pdfFile = path.join(outputDirectory, 'sandbox-bay-signs.pdf');
  const stream = fs.createWriteStream(pdfFile);
  pdf.pipe(stream);
  const mapping = [];
  for (const bay of bays) {
    const target = `${url.origin}/range/${bay.id}`;
    const png = await QRCode.toBuffer(target, { type: 'png', errorCorrectionLevel: 'M', margin: 4, width: 960 });
    const decodedPng = PNG.sync.read(png);
    const decoded = jsQR(new Uint8ClampedArray(decodedPng.data), decodedPng.width, decodedPng.height);
    if (decoded?.data !== target) throw new Error(`QR verification failed for bay ${bay.bay_number}`);
    const stem = `sandbox-bay-${String(bay.bay_number).padStart(2, '0')}`;
    fs.writeFileSync(path.join(outputDirectory, `${stem}.png`), png);
    fs.writeFileSync(path.join(outputDirectory, `${stem}.svg`),
      await QRCode.toString(target, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }));
    pdf.addPage();
    pdf.fillColor('#8c3500').fontSize(16).text('SANDBOX TEST — NOT FOR PRODUCTION', { align: 'center' });
    pdf.fillColor('#153c2b').fontSize(25).text('Fairway Refresh', 48, 95, { align: 'center' });
    pdf.fontSize(48).text(`BAY ${bay.bay_number}`, 48, 145, { align: 'center' });
    pdf.fontSize(20).text('Scan to request a server', 48, 215, { align: 'center' });
    pdf.image(png, 126, 263, { width: 360, height: 360 });
    pdf.fillColor('#222222').fontSize(11).text(target, 48, 652, { align: 'center', width: 516 });
    pdf.fontSize(13).text('No login, ordering or payment required.', 48, 706, { align: 'center' });
    mapping.push({ bay_number: bay.bay_number, url: target, qr_png: `${stem}.png`, qr_svg: `${stem}.svg`, decoded: true });
  }
  pdf.end();
  await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
  fs.writeFileSync(path.join(outputDirectory, 'sandbox-bay-mapping.json'), JSON.stringify({
    environment: 'sandbox', production_printing_authorized: false, signs: mapping,
  }, null, 2));
  fs.writeFileSync(path.join(outputDirectory, 'index.html'), `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sandbox bay signs</title><h1>SANDBOX TEST — NOT FOR PRODUCTION</h1><p>26 verified bay links. <a href="sandbox-bay-signs.pdf">Download print-ready signs (26 pages)</a></p><ol>${mapping.map((bay) => `<li><a href="${bay.url}">Bay ${bay.bay_number}</a> · <a href="${bay.qr_svg}">QR sign image</a></li>`).join('')}</ol><p><a href="sandbox-bay-mapping.json">Verified bay-to-URL mapping</a></p>`);
  return mapping;
}

if (require.main === module) {
  const [fixtureFile, origin, outputDirectory] = process.argv.slice(2);
  if (!fixtureFile || !origin || !outputDirectory) throw new Error('Usage: node qr_signs.js private-fixture.json https://sandbox.web.app output-directory');
  generateSigns({ bays: JSON.parse(fs.readFileSync(fixtureFile)).bays, origin, outputDirectory })
    .then((mapping) => console.log(`Verified ${mapping.length} sandbox QR mappings`))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
module.exports = { generateSigns };
