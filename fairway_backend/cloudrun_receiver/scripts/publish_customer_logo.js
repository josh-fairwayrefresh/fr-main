'use strict';

// Publishes a Customer-owned menu logo from approved source artwork.
// Usage: FAIRWAY_ENV=<env> FAIRWAY_GCP_PROJECT=<project> node scripts/publish_customer_logo.js \
//   --customer CUST-0001 --input <approved.png> --expected-source-sha256 <sha256> [--apply]
// Without --apply only the deterministic web derivative is computed; nothing is written.

const fs = require('node:fs');
const crypto = require('node:crypto');
const { Firestore } = require('@google-cloud/firestore');
const { GoogleAuth, OAuth2Client } = require('google-auth-library');
const { resolveRuntimeEnvironment } = require('../lib/environment');
const { prepareLogoPng, setLogo } = require('../lib/customer_branding');

function options(argv) {
  const result = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--apply') result.apply = true;
    else if (['--customer', '--input', '--expected-source-sha256'].includes(flag) && argv[index + 1]) {
      result[flag.slice(2)] = argv[index += 1];
    } else throw new Error(`Unexpected argument: ${flag}`);
  }
  if (!/^CUST-\d{4,}$/.test(result.customer || '') || !result.input ||
      !/^[a-f0-9]{64}$/.test(result['expected-source-sha256'] || '')) {
    throw new Error('Provide --customer CUST-####, --input <png> and --expected-source-sha256 <hex>');
  }
  return result;
}

(async () => {
  const { projectId } = resolveRuntimeEnvironment();
  const args = options(process.argv.slice(2));
  const source = fs.readFileSync(args.input);
  const sourceSha = crypto.createHash('sha256').update(source).digest('hex');
  if (sourceSha !== args['expected-source-sha256']) throw new Error(`Source artwork SHA-256 mismatch: ${sourceSha}`);
  const derivative = prepareLogoPng(source);
  const summary = {
    project_id: projectId, customer_id: args.customer, source_sha256: sourceSha,
    derivative: { sha256: derivative.sha256, width: derivative.width, height: derivative.height, byte_length: derivative.byte_length, crop: derivative.crop },
  };
  if (!args.apply) {
    console.log(JSON.stringify({ ...summary, applied: false }, null, 2));
    return;
  }
  const token = process.env.FAIRWAY_TOOL_ACCESS_TOKEN;
  const client = new OAuth2Client();
  if (token) client.setCredentials({ access_token: token });
  const db = new Firestore({ projectId, ...(token ? { auth: new GoogleAuth({ authClient: client, projectId }) } : {}) });
  const actor = process.env.FAIRWAY_TOOL_ACTOR || 'publish_customer_logo';
  const result = await setLogo(db, args.customer, { png_base64: derivative.buffer.toString('base64'), source_sha256: sourceSha }, actor);
  console.log(JSON.stringify({ ...summary, applied: true, logo_url: result.logo.logo_url }, null, 2));
})().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
