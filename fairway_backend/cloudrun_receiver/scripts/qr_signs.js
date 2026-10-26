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
  if (bays.length !== 52 || new Set(bays.map((bay) => bay.id)).size !== 52 ||
      bays.some((bay, index) => bay.bay_number !== Math.floor(index / 2) + 1 ||
        bay.bay_side !== (index % 2 ? 'B' : 'A') || !/^[A-Za-z0-9_-]{24,64}$/.test(bay.id))) {
    throw new Error('Exactly 52 unique, ordered bay-side identities (1A, 1B through 26A, 26B) are required');
  }
  for (const logo of [fairwayLogo, monarchLogo]) fs.accessSync(logo, fs.constants.R_OK);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const pdf = new PDFDocument({ autoFirstPage: false, size: 'LETTER', margin: 48,
    info: { Title: 'SANDBOX URLs — 26 Driving Range Review Signs, 52 Bay Sides' } });
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
    const stem = `sandbox-bay-${String(bay.bay_number).padStart(2, '0')}${bay.bay_side}`;
    fs.writeFileSync(path.join(outputDirectory, `${stem}.png`), png);
    fs.writeFileSync(path.join(outputDirectory, `${stem}.svg`),
      await QRCode.toString(target, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }));
    if (bay.bay_side === 'A') {
      pdf.addPage();
      pdf.rect(0, 0, 612, 792).fill('#ffffff');
      pdf.image(fairwayLogo, 48, 48, { fit: [230, 154], align: 'center', valign: 'center' });
      pdf.image(monarchLogo, 334, 48, { fit: [230, 154], align: 'center', valign: 'center' });
      pdf.fillColor('#111111').font('Helvetica-Bold').fontSize(18)
        .text('AT', 288, 116, { width: 36, align: 'center' });
      pdf.fontSize(30).text('WANT FOOD OR DRINKS?', 48, 226, { width: 516, align: 'center' });
      pdf.font('Helvetica').fontSize(22);
      const prefix = 'Use your';
      const suffix = 'and point it at the code';
      const prefixWidth = pdf.widthOfString(prefix);
      const instructionWidth = prefixWidth + 44 + pdf.widthOfString(suffix);
      const instructionX = (612 - instructionWidth) / 2;
      pdf.text(prefix, instructionX, 266, { lineBreak: false });
      const cameraX = instructionX + prefixWidth + 10;
      pdf.save().lineWidth(1.8).strokeColor('#111111');
      pdf.roundedRect(cameraX, 271, 24, 16, 2).stroke();
      pdf.moveTo(cameraX + 5, 271).lineTo(cameraX + 8, 267)
        .lineTo(cameraX + 16, 267).lineTo(cameraX + 19, 271).stroke();
      pdf.circle(cameraX + 12, 279, 4.5).stroke();
      pdf.restore();
      pdf.text(suffix, instructionX + prefixWidth + 44, 266, { lineBreak: false });
      pdf.text('to request a server.', 48, 294, { width: 516, align: 'center' });
    }
    const x = bay.bay_side === 'A' ? 48 : 318;
    pdf.fillColor('#111111').font('Helvetica-Bold').fontSize(42)
      .text(`BAY ${bay.bay_number}${bay.bay_side}`, x, 360, { width: 246, align: 'center' });
    pdf.image(png, x, 430, { width: 246, height: 246 });
    mapping.push({ bay_number: bay.bay_number, bay_side: bay.bay_side,
      url: target, qr_png: `${stem}.png`, qr_svg: `${stem}.svg`, decoded: true });
  }
  pdf.end();
  await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
  fs.writeFileSync(path.join(outputDirectory, 'sandbox-bay-mapping.json'), JSON.stringify({
    environment: 'sandbox', production_printing_authorized: false, signs: mapping,
  }, null, 2));
  fs.writeFileSync(path.join(outputDirectory, 'index.html'), `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sandbox bay signs</title><h1>Sandbox URL review signs</h1><p>These 26 signs contain 52 independent bay-side QR codes using SANDBOX URLs for Monarch field testing, not production launch. Each page has A on the left and B on the right. Existing links remain side A. Printed pages intentionally omit test footers at CPO direction. <a href="sandbox-url-bay-signs.pdf">Download sandbox-URL review PDF (26 Letter portrait pages)</a></p><ol>${mapping.map((bay) => `<li><a href="${bay.url}">Bay ${bay.bay_number}${bay.bay_side}</a> · <a href="${bay.qr_svg}">Raw QR image (not a complete sign)</a></li>`).join('')}</ol><p><a href="sandbox-bay-mapping.json">Verified 52-side bay-to-URL register</a></p>`);
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
