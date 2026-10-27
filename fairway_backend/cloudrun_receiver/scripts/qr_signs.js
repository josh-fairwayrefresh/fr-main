'use strict';

const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
const { validateBayMappings } = require('../lib/qr_requests');

const repositoryRoot = path.resolve(__dirname, '../../..');
const fairwayLogo = path.join(repositoryRoot, 'fairway_webapp/cart_operator_dashboard/public/icons/logo-and-name-row-banner.jpg');
const monarchLogo = path.join(repositoryRoot, 'docs/logo_source_files/customers/monarch-bay-golf-club/monarch-bay-golf-club.png');

async function generateSigns({ bays, origin, outputDirectory, edition = 'sandbox', customerId, courseId }) {
  const url = new URL(origin);
  const production = edition === 'production';
  if (!['sandbox', 'production'].includes(edition) ||
      (production && (!/^CUST-\d{4,}$/.test(customerId || '') || !/^COURSE-\d{4,}$/.test(courseId || '')))) {
    throw new Error('Production signs require explicit Customer and Course identities');
  }
  if (url.protocol !== 'https:' ||
      !(production ? url.host === 'app.fairwayrefresh.com' : /^fairway-refresh-sandbox-[a-z0-9-]+\.web\.app$/.test(url.host)) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(production ? 'Installation signs require the permanent production origin' : 'This mode generates sandbox signs only');
  }
  validateBayMappings(bays);
  for (const logo of [fairwayLogo, monarchLogo]) fs.accessSync(logo, fs.constants.R_OK);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const pdf = new PDFDocument({ autoFirstPage: false, size: 'LETTER', margin: 48,
    info: { Title: production ? 'Driving Range — 26 Installation Signs, 52 Bay Sides' : 'SANDBOX URLs — 26 Driving Range Review Signs, 52 Bay Sides' } });
  const pdfName = production ? 'driving-range-installation.pdf' : 'sandbox-url-bay-signs.pdf';
  const mappingName = production ? 'driving-range-bay-mapping.json' : 'sandbox-bay-mapping.json';
  const pdfFile = path.join(outputDirectory, pdfName);
  const stream = fs.createWriteStream(pdfFile);
  pdf.pipe(stream);
  const mapping = [];
  for (const bay of bays) {
    const target = `${url.origin}/range/${bay.id}`;
    const png = await QRCode.toBuffer(target, { type: 'png', errorCorrectionLevel: 'M', margin: 4, width: 960 });
    const decodedPng = PNG.sync.read(png);
    const decoded = jsQR(new Uint8ClampedArray(decodedPng.data), decodedPng.width, decodedPng.height);
    if (decoded?.data !== target) throw new Error(`QR verification failed for bay ${bay.bay_number}`);
    const stem = `${production ? 'production' : 'sandbox'}-bay-${String(bay.bay_number).padStart(2, '0')}${bay.bay_side}`;
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
      ...(production ? { customer_id: customerId, course_id: courseId } : {}),
      url: target, qr_png: `${stem}.png`, qr_svg: `${stem}.svg`, decoded: true });
  }
  pdf.end();
  await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });
  fs.writeFileSync(path.join(outputDirectory, mappingName), JSON.stringify({
    environment: edition, production_printing_authorized: production, signs: mapping,
  }, null, 2));
  const heading = production ? 'Driving Range installation signs' : 'Sandbox URL review signs';
  const description = production
    ? 'These 26 signs contain 52 independent bay-side QR codes using permanent production URLs. Each page has A on the left and B on the right. Service availability is controlled independently by restaurant staff.'
    : 'These 26 signs contain 52 independent bay-side QR codes using SANDBOX URLs for Monarch field testing, not production launch. Each page has A on the left and B on the right. Existing links remain side A. Printed pages intentionally omit test footers at CPO direction.';
  fs.writeFileSync(path.join(outputDirectory, 'index.html'), `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading}</title><h1>${heading}</h1><p>${description} <a href="${pdfName}">Download ${production ? 'installation' : 'sandbox-URL review'} PDF (26 Letter portrait pages)</a></p><ol>${mapping.map((bay) => `<li><a href="${bay.url}">Bay ${bay.bay_number}${bay.bay_side}</a> · <a href="${bay.qr_svg}">Raw QR image (not a complete sign)</a></li>`).join('')}</ol><p><a href="${mappingName}">Verified 52-side bay-to-URL register</a></p>`);
  const legacyPdf = path.join(outputDirectory, 'sandbox-bay-signs.pdf');
  if (fs.existsSync(legacyPdf)) fs.unlinkSync(legacyPdf);
  return mapping;
}

if (require.main === module) {
  const [fixtureFile, origin, outputDirectory, edition = 'sandbox'] = process.argv.slice(2);
  if (!fixtureFile || !origin || !outputDirectory) throw new Error('Usage: node qr_signs.js private-fixture.json https://sandbox.web.app output-directory');
  const fixture = JSON.parse(fs.readFileSync(fixtureFile));
  generateSigns({ bays: fixture.bays, origin, outputDirectory, edition,
    customerId: fixture.customer_id, courseId: fixture.range_course_id })
    .then((mapping) => console.log(`Verified ${mapping.length} ${edition} QR mappings`))
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
module.exports = { generateSigns };
