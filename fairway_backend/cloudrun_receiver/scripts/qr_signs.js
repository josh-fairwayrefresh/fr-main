'use strict';

const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');

const repositoryRoot = path.resolve(__dirname, '../../..');
const fairwayLogo = path.join(repositoryRoot, 'fairway_webapp/cart_operator_dashboard/public/icons/logo-and-name-row-banner.jpg');
const monarchLogo = path.join(repositoryRoot, 'docs/logo_source_files/customers/monarch-bay-golf-club/monarch-bay-golf-club.png');

async function generateSigns({ bays, origin, outputDirectory }) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || !/^fairway-refresh-sandbox-[a-z0-9-]+\.web\.app$/.test(url.host) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('This increment generates sandbox signs only');
  }
  if (bays.length !== 26 || new Set(bays.map((bay) => bay.id)).size !== 26 ||
      bays.some((bay, index) => bay.bay_number !== index + 1 || !/^[A-Za-z0-9_-]{24,64}$/.test(bay.id))) {
    throw new Error('Exactly 26 unique, ordered bay identities are required');
  }
  for (const logo of [fairwayLogo, monarchLogo]) fs.accessSync(logo, fs.constants.R_OK);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const pdf = new PDFDocument({ autoFirstPage: false, size: 'LETTER', margin: 48,
    info: { Title: 'SANDBOX URLs — 26 Driving Range Review Signs' } });
  const pdfFile = path.join(outputDirectory, 'sandbox-url-bay-signs.pdf');
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
    pdf.rect(0, 0, 612, 792).fill('#ffffff');
    pdf.image(fairwayLogo, 48, 48, { fit: [230, 154], align: 'center', valign: 'center' });
    pdf.image(monarchLogo, 334, 48, { fit: [230, 154], align: 'center', valign: 'center' });
    pdf.fillColor('#111111').font('Helvetica-Bold').fontSize(18)
      .text('AT', 288, 116, { width: 36, align: 'center' });
    pdf.fontSize(30).text('WANT FOOD OR DRINKS?', 48, 226, { width: 516, align: 'center' });
    pdf.fontSize(24).text('SCAN TO REQUEST A SERVER.', 48, 272, { width: 516, align: 'center' });
    pdf.fontSize(64).text(`BAY ${bay.bay_number}`, 48, 321, { width: 516, align: 'center' });
    pdf.image(png, 144, 396, { width: 324, height: 324 });
    mapping.push({ bay_number: bay.bay_number, url: target, qr_png: `${stem}.png`, qr_svg: `${stem}.svg`, decoded: true });
  }
  pdf.end();
  await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
  fs.writeFileSync(path.join(outputDirectory, 'sandbox-bay-mapping.json'), JSON.stringify({
    environment: 'sandbox', production_printing_authorized: false, signs: mapping,
  }, null, 2));
  fs.writeFileSync(path.join(outputDirectory, 'index.html'), `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sandbox bay signs</title><h1>Sandbox URL review signs</h1><p>These 26 signs use SANDBOX URLs for Monarch field testing, not production launch. Printed pages intentionally omit test footers at CPO direction. <a href="sandbox-url-bay-signs.pdf">Download sandbox-URL review PDF (26 Letter portrait pages)</a></p><ol>${mapping.map((bay) => `<li><a href="${bay.url}">Bay ${bay.bay_number}</a> · <a href="${bay.qr_svg}">Raw QR image (not a complete sign)</a></li>`).join('')}</ol><p><a href="sandbox-bay-mapping.json">Verified bay-to-URL mapping</a></p>`);
  const legacyPdf = path.join(outputDirectory, 'sandbox-bay-signs.pdf');
  if (fs.existsSync(legacyPdf)) fs.unlinkSync(legacyPdf);
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
