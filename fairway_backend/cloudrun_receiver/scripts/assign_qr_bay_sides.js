'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { Firestore } = require('@google-cloud/firestore');
const { GoogleAuth, OAuth2Client } = require('google-auth-library');
const { resolveSandboxEnvironment } = require('../lib/environment');

async function assignBaySides(db, fixture) {
  if (fixture.projectId !== 'fairway-refresh-sandbox-qr1' || fixture.bays.length !== 26 ||
      new Set(fixture.bays.map((bay) => bay.id)).size !== 26 ||
      fixture.bays.some((bay, index) => bay.bay_number !== index + 1 ||
        !/^[A-Za-z0-9_-]{24,64}$/.test(bay.id))) {
    throw new Error('The original 26-bay QR sandbox fixture is required');
  }
  const bays = fixture.bays.flatMap((bay) => [
    { id: bay.id, bay_number: bay.bay_number, bay_side: 'A' },
    { id: crypto.createHash('sha256').update(`fairway-qr-side-B:${bay.id}`).digest('base64url').slice(0, 24),
      bay_number: bay.bay_number, bay_side: 'B' },
  ]);
  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all(bays.map((bay) =>
      transaction.get(db.collection('qr_bays').doc(bay.id))));
    for (let index = 0; index < bays.length; index += 1) {
      const bay = bays[index];
      const snapshot = snapshots[index];
      if (!snapshot.exists) {
        if (bay.bay_side === 'A') throw new Error(`Missing original bay ${bay.bay_number}`);
        continue;
      }
      const stored = snapshot.data();
      if (stored.customer_id !== fixture.customer_id || stored.course_id !== fixture.range_course_id ||
          stored.bay_number !== bay.bay_number ||
          (stored.bay_side !== bay.bay_side && !(bay.bay_side === 'A' && stored.bay_side === undefined))) {
        throw new Error(`Conflicting bay assignment: ${bay.bay_number}${bay.bay_side}`);
      }
    }
    for (let index = 0; index < bays.length; index += 1) {
      const bay = bays[index];
      const snapshot = snapshots[index];
      if (!snapshot.exists) {
        transaction.set(snapshot.ref, {
          customer_id: fixture.customer_id, course_id: fixture.range_course_id,
          bay_number: bay.bay_number, bay_side: bay.bay_side, enabled: true, active_request_id: null,
        });
      } else if (snapshot.data().bay_side === undefined) {
        transaction.update(snapshot.ref, { bay_side: 'A' });
      }
    }
  });
  return { projectId: fixture.projectId, customer_id: fixture.customer_id,
    cart_course_id: fixture.cart_course_id, range_course_id: fixture.range_course_id, bays };
}

if (require.main === module) {
  (async () => {
    const { projectId } = resolveSandboxEnvironment();
    if (projectId !== 'fairway-refresh-sandbox-qr1') throw new Error('Only the isolated QR sandbox is authorized');
    const [input, output] = process.argv.slice(2);
    if (!input || !output || fs.existsSync(output)) throw new Error('Provide original fixture and a new private output path');
    const token = process.env.FAIRWAY_TOOL_ACCESS_TOKEN;
    const client = new OAuth2Client();
    if (token) client.setCredentials({ access_token: token });
    const db = new Firestore({ projectId,
      ...(token ? { auth: new GoogleAuth({ authClient: client, projectId }) } : {}) });
    const result = await assignBaySides(db, JSON.parse(fs.readFileSync(input, 'utf8')));
    fs.writeFileSync(output, JSON.stringify(result, null, 2), { mode: 0o600, flag: 'wx' });
    console.log('Verified 52 sandbox bay sides; existing A URLs and request claims preserved.');
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { assignBaySides };
