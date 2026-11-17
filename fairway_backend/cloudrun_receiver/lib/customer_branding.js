'use strict';

// Customer-owned branding. Every menu of a Customer inherits this branding;
// menus never own or override a logo.

const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const inventory = require('./inventory');

const PROFILE_COLLECTION = 'branding';
const PROFILE_DOCUMENT = 'profile';
const LOGO_COLLECTION = 'branding_logos';
const LOGO_CONTENT_TYPE = 'image/png';
const MAX_LOGO_BYTES = 900 * 1024;
const MAX_LOGO_DIMENSION = 2048;
const DEFAULT_LOGO_WIDTH = 640;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Supplied transparent derivatives retain a faint (<2% opacity) matte haze;
// margins at or below this alpha are invisible and may be trimmed.
const TRIM_ALPHA_THRESHOLD = 4;

function fail(status, code, message) {
  throw new inventory.InventoryError(status, code, message);
}
function customerId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) fail(400, 'invalid_id', 'Invalid identifier');
  return value;
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function customerRef(db, id) {
  return db.collection('customers').doc(customerId(id));
}
function profileRef(db, id) {
  return customerRef(db, id).collection(PROFILE_COLLECTION).doc(PROFILE_DOCUMENT);
}
function logoRef(db, id, digest) {
  return customerRef(db, id).collection(LOGO_COLLECTION).doc(digest);
}
function publicLogoPath(id, digest) {
  return `/api/v1/public/customers/${encodeURIComponent(id)}/logo/${digest}`;
}

function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length ||
      !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail(400, 'invalid_logo', 'Customer logo must be a PNG image');
  }
  try {
    return PNG.sync.read(buffer);
  } catch {
    fail(400, 'invalid_logo', 'Customer logo PNG could not be decoded');
  }
}

function validateLogoPng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_LOGO_BYTES) {
    fail(400, 'invalid_logo', `Customer logo must be a PNG no larger than ${MAX_LOGO_BYTES} bytes`);
  }
  const image = decodePng(buffer);
  if (image.width < 1 || image.height < 1 || image.width > MAX_LOGO_DIMENSION || image.height > MAX_LOGO_DIMENSION) {
    fail(400, 'invalid_logo', `Customer logo dimensions must not exceed ${MAX_LOGO_DIMENSION} pixels`);
  }
  return { width: image.width, height: image.height, byte_length: buffer.length, sha256: sha256(buffer) };
}

function opaqueBounds(image) {
  let left = image.width; let right = -1; let top = image.height; let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] <= TRIM_ALPHA_THRESHOLD) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) fail(400, 'invalid_logo', 'Customer logo has no visible artwork');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

// Area-average resample in premultiplied alpha so transparent edges do not darken.
function resample(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const premultiplied = new Float64Array(sourceWidth * sourceHeight * 4);
  for (let index = 0; index < sourceWidth * sourceHeight; index += 1) {
    const alpha = source[index * 4 + 3] / 255;
    premultiplied[index * 4] = source[index * 4] * alpha;
    premultiplied[index * 4 + 1] = source[index * 4 + 1] * alpha;
    premultiplied[index * 4 + 2] = source[index * 4 + 2] * alpha;
    premultiplied[index * 4 + 3] = source[index * 4 + 3];
  }
  const horizontal = new Float64Array(targetWidth * sourceHeight * 4);
  const xScale = sourceWidth / targetWidth;
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let out = 0; out < targetWidth; out += 1) {
      const start = out * xScale; const end = start + xScale;
      const sum = [0, 0, 0, 0];
      for (let x = Math.floor(start); x < Math.ceil(end); x += 1) {
        const weight = Math.min(end, x + 1) - Math.max(start, x);
        const offset = (y * sourceWidth + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) sum[channel] += premultiplied[offset + channel] * weight;
      }
      const target = (y * targetWidth + out) * 4;
      for (let channel = 0; channel < 4; channel += 1) horizontal[target + channel] = sum[channel] / xScale;
    }
  }
  const vertical = new Float64Array(targetWidth * targetHeight * 4);
  const scale = sourceHeight / targetHeight;
  for (let x = 0; x < targetWidth; x += 1) {
    for (let out = 0; out < targetHeight; out += 1) {
      const start = out * scale; const end = start + scale;
      const sum = [0, 0, 0, 0];
      for (let y = Math.floor(start); y < Math.ceil(end); y += 1) {
        const weight = Math.min(end, y + 1) - Math.max(start, y);
        const offset = (y * targetWidth + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) sum[channel] += horizontal[offset + channel] * weight;
      }
      const target = (out * targetWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) vertical[target + channel] = sum[channel] / scale;
    }
  }
  const result = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let index = 0; index < targetWidth * targetHeight; index += 1) {
    const alpha = vertical[index * 4 + 3];
    const factor = alpha > 0 ? 255 / alpha : 0;
    for (let channel = 0; channel < 3; channel += 1) {
      result[index * 4 + channel] = Math.max(0, Math.min(255, Math.round(vertical[index * 4 + channel] * factor)));
    }
    result[index * 4 + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
  }
  return result;
}

// Deterministic web derivative of approved artwork: removes only invisible
// margins and scales proportionally; never redraws or recolors.
function prepareLogoPng(sourceBuffer, { maxWidth = DEFAULT_LOGO_WIDTH } = {}) {
  if (!Number.isInteger(maxWidth) || maxWidth < 64 || maxWidth > MAX_LOGO_DIMENSION) {
    fail(400, 'invalid_logo', 'Invalid logo derivative width');
  }
  const image = decodePng(sourceBuffer);
  const bounds = opaqueBounds(image);
  const cropped = Buffer.alloc(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y += 1) {
    image.data.copy(cropped, y * bounds.width * 4,
      ((bounds.top + y) * image.width + bounds.left) * 4,
      ((bounds.top + y) * image.width + bounds.left + bounds.width) * 4);
  }
  const width = Math.min(maxWidth, bounds.width);
  const height = Math.max(1, Math.round(bounds.height * (width / bounds.width)));
  if (height > MAX_LOGO_DIMENSION) fail(400, 'invalid_logo', 'Customer logo is too tall');
  const output = new PNG({ width, height });
  output.data = width === bounds.width ? cropped : resample(cropped, bounds.width, bounds.height, width, height);
  // Invisible haze is normalized to fully transparent so the PNG compresses.
  for (let offset = 0; offset < output.data.length; offset += 4) {
    if (output.data[offset + 3] <= TRIM_ALPHA_THRESHOLD) output.data.fill(0, offset, offset + 4);
  }
  const buffer = PNG.sync.write(output, { colorType: 6, deflateLevel: 9 });
  return { buffer, source_sha256: sha256(sourceBuffer), crop: bounds, ...validateLogoPng(buffer) };
}

function profileModel(id, profile) {
  const logo = profile?.logo || null;
  return {
    customer_id: id,
    logo: logo ? {
      sha256: logo.sha256, content_type: logo.content_type, width: logo.width, height: logo.height,
      byte_length: logo.byte_length, source_sha256: logo.source_sha256 || null,
      updated_at: logo.updated_at || null, logo_url: publicLogoPath(id, logo.sha256),
    } : null,
  };
}

async function getBranding(db, id) {
  const [customer, profile] = await Promise.all([customerRef(db, id).get(), profileRef(db, id).get()]);
  if (!customer.exists) fail(404, 'customer_not_found', 'Customer not found');
  return profileModel(id, profile.data());
}

async function setLogo(db, id, body, actorUid) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['png_base64', 'source_sha256'].includes(key)) ||
      typeof body.png_base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.png_base64)) {
    fail(400, 'invalid_input', 'Provide png_base64 and optional source_sha256');
  }
  if (body.source_sha256 !== undefined && (typeof body.source_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(body.source_sha256))) {
    fail(400, 'invalid_input', 'source_sha256 must be a SHA-256 hex digest');
  }
  const buffer = Buffer.from(body.png_base64, 'base64');
  const metadata = validateLogoPng(buffer);
  const now = new Date();
  return db.runTransaction(async (tx) => {
    const [customer, existing] = await Promise.all([
      tx.get(customerRef(db, id)), tx.get(logoRef(db, id, metadata.sha256)),
    ]);
    if (!customer.exists) fail(404, 'customer_not_found', 'Customer not found');
    if (!existing.exists) {
      tx.set(logoRef(db, id, metadata.sha256), {
        ...metadata, content_type: LOGO_CONTENT_TYPE, data: buffer,
        source_sha256: body.source_sha256 || null, created_at: now, created_by: actorUid,
      });
    }
    const logo = {
      ...metadata, content_type: LOGO_CONTENT_TYPE, source_sha256: body.source_sha256 || null,
      updated_at: now, updated_by: actorUid,
    };
    tx.set(profileRef(db, id), { schema_version: 1, logo }, { merge: true });
    return profileModel(id, { logo });
  });
}

// Read inside an existing public-menu transaction so the menu and the
// Customer branding are resolved from one consistent snapshot.
async function publicBranding(tx, db, id) {
  const profile = await tx.get(profileRef(db, id));
  const logo = profile.data()?.logo;
  return { logo_url: logo?.sha256 ? publicLogoPath(id, logo.sha256) : null };
}

// Content-addressed and immutable: any logo ever published for this Customer
// remains retrievable by its hash. Menus reference only the current logo.
async function publicLogo(db, id, digest) {
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) fail(404, 'logo_not_found', 'Logo not found');
  const logo = await logoRef(db, id, digest).get();
  if (!logo.exists) fail(404, 'logo_not_found', 'Logo not found');
  const data = Buffer.from(logo.data().data);
  if (sha256(data) !== digest || logo.data().content_type !== LOGO_CONTENT_TYPE) {
    fail(404, 'logo_not_found', 'Logo not found');
  }
  return { type: LOGO_CONTENT_TYPE, data };
}

module.exports = {
  DEFAULT_LOGO_WIDTH,
  LOGO_COLLECTION,
  MAX_LOGO_BYTES,
  PROFILE_COLLECTION,
  getBranding,
  prepareLogoPng,
  publicBranding,
  publicLogo,
  publicLogoPath,
  setLogo,
  validateLogoPng,
};
