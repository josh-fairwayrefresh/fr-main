'use strict';

const fs = require('node:fs');
const { Firestore } = require('@google-cloud/firestore');
const { GoogleAuth, OAuth2Client } = require('google-auth-library');
const { resolveRuntimeEnvironment } = require('../lib/environment');
const { provisionQrBays, validateBayMappings } = require('../lib/qr_requests');

(async () => {
  const { projectId } = resolveRuntimeEnvironment();
  const [file, mode] = process.argv.slice(2);
  if (!file || !['--check', '--apply'].includes(mode)) throw new Error('Provide mapping fixture and --check or --apply');
  const fixture = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (fixture.projectId !== projectId || !/^CUST-\d{4,}$/.test(fixture.customer_id) ||
      !/^COURSE-\d{4,}$/.test(fixture.range_course_id)) throw new Error('Explicit matching project/Customer/Course identities required');
  validateBayMappings(fixture.bays);
  if (mode === '--check') {
    console.log('Validated 52 explicit mappings; no data changed.');
    return;
  }
  const token = process.env.FAIRWAY_TOOL_ACCESS_TOKEN;
  const client = new OAuth2Client();
  if (token) client.setCredentials({ access_token: token });
  const db = new Firestore({ projectId,
    ...(token ? { auth: new GoogleAuth({ authClient: client, projectId }) } : {}) });
  console.log(JSON.stringify(await provisionQrBays(db, fixture.customer_id, fixture.range_course_id, fixture.bays)));
})().catch((error) => { console.error(error); process.exitCode = 1; });
