'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { FakeFirestore } = require('./fake_firestore');
process.env.FAIRWAY_ENV = 'sandbox';
process.env.FAIRWAY_GCP_PROJECT = 'fairway-refresh-sandbox-test';
process.env.GOOGLE_CLOUD_PROJECT = 'fairway-refresh-sandbox-test';
const { createFairwayHandlers } = require('../index');
const { generateDeviceCredential } = require('../lib/fleet/credentials');
const { createOtaService, HARDWARE_ID, OtaError, nextCourseCheckTime,
  MAX_SIGNED_IMAGE_BYTES, validateArtifact } = require('../lib/ota/ota_service');
const { Writable, Readable } = require('stream');
const { PRODUCTION_FINGERPRINT } = require('../lib/ota/accepted_releases');
const { approval, capability } = require('./ota_fixtures');

const DEVICE_ID = 'FRB-0005';
const RELEASE_ID = 'OTA-0.1alt';
const VERSION = { major: 0, minor: 1, revision: 0, build: 2 };
const VERSION_STRING = '0.1.0+2';

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  pending.push({ name, fn });
}

async function run() {
  for (const { name, fn } of pending) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fn();
      passed += 1;
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${name}`);
      console.error(error);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

function createArtifact() {
  const artifact = Buffer.alloc(512, 0x5a);
  Buffer.from([0x3d, 0xb8, 0xf3, 0x96]).copy(artifact);
  artifact[20] = VERSION.major;
  artifact[21] = VERSION.minor;
  artifact.writeUInt16LE(VERSION.revision, 22);
  artifact.writeUInt32LE(VERSION.build, 24);
  return artifact;
}

function createReleaseBody(artifact = createArtifact()) {
  const sha256 = crypto.createHash('sha256').update(artifact).digest('hex');
  return {
    release_id: RELEASE_ID,
    version: VERSION,
    version_string: VERSION_STRING,
    hardware_ids: [HARDWARE_ID],
    artifact_base64: artifact.toString('base64'),
    sha256,
    manifest: {
      release_id: RELEASE_ID, version_string: VERSION_STRING,
      sha256, size_bytes: artifact.length, board: HARDWARE_ID,
      device_credentials_embedded: false,
      signing: { fingerprint: PRODUCTION_FINGERPRINT, algorithm: 'ECDSA-P256', private_key_in_artifacts: false },
      generated_mcuboot_public_key_fingerprint: PRODUCTION_FINGERPRINT,
      build_source_sha256: '6c786dd3257d5c05c4b792fa3d33f90d6473a790036dbc1377f886395433040c',
      source_commit: '2d72b5de401b3faecb09a5e86a5410156692d18e', ncs_version: '3.1.1',
    },
    notes: 'FRB-0005 commissioning release',
  };
}

const testAcceptedReleases = { [RELEASE_ID]: createReleaseBody().sha256 };

function createArtifactStore() {
  const objects = new Map();
  return {
    objects,
    async upload(path, contents, metadata) {
      objects.set(path, { contents: Buffer.from(contents), metadata });
    },
    createReadStream(path, range) {
      const { Readable } = require('stream');
      const object = objects.get(path);
      if (!object) throw new Error('Artifact does not exist');
      return Readable.from(object.contents.subarray(range.start, range.end + 1));
    },
  };
}

function createRequest({ method = 'POST', path = '/', body = {}, headers = {} } = {}) {
  return {
    method,
    path,
    body,
    get(name) { return headers[name.toLowerCase()] || headers[name]; },
  };
}

function createJsonResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}

async function setUp() {
  const db = new FakeFirestore();
  const artifactStore = createArtifactStore();
  let currentTime = new Date('2026-03-08T07:00:00.000Z');
  const ota = createOtaService(db, {
    artifactDeliveryEnabled: true,
    artifactStore, now: () => new Date(currentTime), acceptedReleases: testAcceptedReleases,
    publicationApprovals: { [RELEASE_ID]: approval(testAcceptedReleases[RELEASE_ID]) },
  });
  const assignForTest = async (deviceId, releaseId, uid) => {
    const review = await ota.prepareAssignment({ release_id: releaseId, device_ids: [deviceId] }, uid);
    const result = await ota.confirmAssignment(review.review_id, uid);
    return { ...result.assignments[0], state: 'assigned' };
  };
  await db.collection('devices').doc(DEVICE_ID).set({
    state: 'deployed',
    customer_id: 'CUST-0002',
    course_id: 'COURSE-0002',
    ota_capability: capability('one_time'),
  });
  await db.collection('customers').doc('CUST-0002').collection('courses').doc('COURSE-0002')
    .set({ timezone: 'America/Los_Angeles' });
  await db.collection('customers').doc('CUST-0002').set({ customer_name: 'Local test customer' });
  return {
    db,
    ota: { ...ota, assignRelease: assignForTest },
    artifactStore,
    setTime(value) { currentTime = new Date(value); },
  };
}

test('running confirmations persist once, reject stale/conflicting reports and allow real version changes', async () => {
  const { ota, db, setTime } = await setUp();
  const first = { firmware_version: '0.1.0+4', confirmation_sequence: 1 };
  const ack = await ota.confirmRunningFirmware(DEVICE_ID, first);
  assert.deepStrictEqual(ack, { device_id: DEVICE_ID, ...first, acknowledged: true });
  const ref = db.collection('ota_device_status').doc(DEVICE_ID);
  const initial = (await ref.get()).data();
  assert.strictEqual(initial.confirmed_firmware_version, first.firmware_version);
  assert.strictEqual(initial.confirmed_deployment_id, null);
  setTime('2026-03-08T08:00:00Z');
  await ota.confirmRunningFirmware(DEVICE_ID, first);
  assert.deepStrictEqual((await ref.get()).data(), initial);
  await assert.rejects(ota.confirmRunningFirmware(DEVICE_ID, {
    ...first, firmware_version: '0.1.0+5',
  }), (error) => error.code === 'conflicting_confirmation');
  await ota.confirmRunningFirmware(DEVICE_ID, {
    firmware_version: '0.1.0+5', confirmation_sequence: 2,
  });
  await assert.rejects(ota.confirmRunningFirmware(DEVICE_ID, first),
    (error) => error.code === 'stale_confirmation');
  await ota.confirmRunningFirmware(DEVICE_ID, {
    firmware_version: '0.1.0+4', confirmation_sequence: 3,
  });
  assert.strictEqual((await ref.get()).data().confirmed_firmware_version, '0.1.0+4');
  for (const sequence of [0, -1, 1.5, '4', 0x80000000]) {
    await assert.rejects(ota.confirmRunningFirmware(DEVICE_ID, {
      ...first, confirmation_sequence: sequence,
    }), (error) => error.code === 'invalid_confirmation');
  }
});

test('bound running confirmation atomically records completion, clears only its assignment and retains fleet history', async () => {
  const { ota, db } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  const assigned = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  const device = (await db.collection('devices').doc(DEVICE_ID).get()).data();
  const offer = await ota.checkForUpdate(DEVICE_ID, device, HARDWARE_ID);
  const token = offer.artifact_path.split('/').pop();
  await ota.getAuthorizedArtifact(token);
  const assignmentRef = db.collection('ota_assignments').doc(DEVICE_ID);
  assert.strictEqual((await assignmentRef.get()).exists, true);
  const deploymentRef = db.collection('ota_deployments').doc(assigned.deployment_id);
  const initialEvents = (await deploymentRef.collection('events').get()).size;
  const report = {
    firmware_version: VERSION_STRING, confirmation_sequence: 1,
    deployment_id: assigned.deployment_id,
  };
  await Promise.all([
    ota.confirmRunningFirmware(DEVICE_ID, report),
    ota.confirmRunningFirmware(DEVICE_ID, report),
  ]);
  assert.strictEqual((await assignmentRef.get()).exists, false);
  const deployment = (await deploymentRef.get()).data();
  assert.strictEqual(deployment.state, 'confirmed');
  assert.strictEqual(deployment.confirmation_source, 'authenticated_running_image');
  assert.strictEqual(deployment.confirmation_sequence, 1);
  assert.strictEqual(deployment.reported_at.downloading, undefined);
  const events = await deploymentRef.collection('events').get();
  assert.strictEqual(events.size, initialEvents + 1);
  assert.strictEqual(events.docs.filter((event) => event.data().state === 'confirmed').length, 1);
  const status = (await db.collection('ota_device_status').doc(DEVICE_ID).get()).data();
  assert.strictEqual(status.last_deployment_id, assigned.deployment_id);
  const fleet = (await ota.listFleet()).devices.find((item) => item.device_id === DEVICE_ID);
  assert.strictEqual(fleet.pending, null);
  assert.strictEqual(fleet.last_result.deployment_id, assigned.deployment_id);
  assert.strictEqual(fleet.last_result.state, 'confirmed');
  assert.strictEqual(fleet.eligible, true);
  await assert.rejects(ota.getAuthorizedArtifact(token),
    (error) => error.code === 'download_not_authorized');
  const duplicate = await ota.reportUpdateEvent(assigned.deployment_id, DEVICE_ID, {
    state: 'confirmed', firmware_version: VERSION_STRING,
  });
  assert.strictEqual(duplicate.duplicate, true);
  assert.strictEqual((await deploymentRef.collection('events').get()).size, initialEvents + 1);
  await db.collection('devices').doc(DEVICE_ID).update({ ota_capability: null });
  const blocked = (await ota.listFleet()).devices.find((item) => item.device_id === DEVICE_ID);
  assert.strictEqual(blocked.eligible, false);
  assert.strictEqual(blocked.last_result.deployment_id, assigned.deployment_id);
});

test('unbound or mismatched running evidence never guesses which assignment to complete', async () => {
  for (const evidence of [
    { firmware_version: VERSION_STRING },
    { firmware_version: VERSION_STRING, deployment_id: 'older-deployment' },
    { firmware_version: '0.1.0+4', match: true },
  ]) {
    const { ota, db } = await setUp();
    await ota.registerRelease(createReleaseBody(), 'admin-1');
    const assigned = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
    const assignmentRef = db.collection('ota_assignments').doc(DEVICE_ID);
    const before = (await assignmentRef.get()).data();
    await ota.confirmRunningFirmware(DEVICE_ID, {
      firmware_version: evidence.firmware_version, confirmation_sequence: 1,
      ...(evidence.match ? { deployment_id: assigned.deployment_id }
        : evidence.deployment_id ? { deployment_id: evidence.deployment_id } : {}),
    });
    assert.deepStrictEqual((await assignmentRef.get()).data(), before);
    assert.strictEqual((await ota.listDeployments())[0].state, 'assigned');
  }
});

test('duplicate, stale and delayed older-deployment reports cannot clear a newer matching-version assignment', async () => {
  const { ota, db, setTime } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  const old = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  const report = {
    firmware_version: VERSION_STRING, confirmation_sequence: 2,
    deployment_id: old.deployment_id,
  };
  await ota.confirmRunningFirmware(DEVICE_ID, report);
  const statusRef = db.collection('ota_device_status').doc(DEVICE_ID);
  const initial = (await statusRef.get()).data();
  const next = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  const assignmentRef = db.collection('ota_assignments').doc(DEVICE_ID);
  const before = (await assignmentRef.get()).data();
  setTime('2026-03-08T08:00:00Z');
  await ota.confirmRunningFirmware(DEVICE_ID, report);
  await assert.rejects(ota.confirmRunningFirmware(DEVICE_ID, { ...report, confirmation_sequence: 1 }),
    (error) => error.code === 'stale_confirmation');
  assert.deepStrictEqual((await statusRef.get()).data(), initial);
  await ota.confirmRunningFirmware(DEVICE_ID, { ...report, confirmation_sequence: 3 });
  await ota.reportUpdateEvent(old.deployment_id, DEVICE_ID, {
    state: 'confirmed', firmware_version: VERSION_STRING,
  });
  assert.deepStrictEqual((await assignmentRef.get()).data(), before);
  assert.strictEqual((await ota.listDeployments()).find(
    (item) => item.deployment_id === next.deployment_id).state, 'assigned');
});

test('failed confirmation commit leaves version, deployment, event and assignment unchanged until retry', async () => {
  const { ota, db } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  const assigned = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  const before = new Map(db._docs);
  const report = {
    firmware_version: VERSION_STRING, confirmation_sequence: 1,
    deployment_id: assigned.deployment_id,
  };
  db.failNextTransactionCommit = true;
  await assert.rejects(ota.confirmRunningFirmware(DEVICE_ID, report), /Simulated transaction commit failure/);
  assert.deepStrictEqual(db._docs, before);
  await ota.confirmRunningFirmware(DEVICE_ID, report);
  assert.strictEqual((await db.collection('ota_assignments').doc(DEVICE_ID).get()).exists, false);
});

test('legacy confirmed lifecycle atomically clears its matching assignment but not a newer assignment', async () => {
  const { ota, db } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  const old = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  for (const state of ['downloading', 'verifying', 'staged', 'activation_pending', 'trial_boot']) {
    await ota.reportUpdateEvent(old.deployment_id, DEVICE_ID, { state, firmware_version: VERSION_STRING });
    assert.strictEqual((await db.collection('ota_assignments').doc(DEVICE_ID).get()).exists, true);
  }
  const before = new Map(db._docs);
  db.failNextTransactionCommit = true;
  await assert.rejects(ota.reportUpdateEvent(old.deployment_id, DEVICE_ID, {
    state: 'confirmed', firmware_version: VERSION_STRING,
  }), /Simulated transaction commit failure/);
  assert.deepStrictEqual(db._docs, before);
  await ota.reportUpdateEvent(old.deployment_id, DEVICE_ID, {
    state: 'confirmed', firmware_version: VERSION_STRING,
  });
  assert.strictEqual((await db.collection('ota_assignments').doc(DEVICE_ID).get()).exists, false);
  const next = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  await ota.reportUpdateEvent(old.deployment_id, DEVICE_ID, {
    state: 'confirmed', firmware_version: VERSION_STRING,
  });
  assert.strictEqual((await db.collection('ota_assignments').doc(DEVICE_ID).get()).data().deployment_id,
    next.deployment_id);
});

test('running confirmation route authenticates the exact active Device and registry projects only confirmed evidence', async () => {
  const { db } = await setUp();
  const { secret, verifier } = generateDeviceCredential();
  await db.collection('devices').doc(DEVICE_ID).update({
    credential: verifier, firmware_generation: 'historical metadata',
  });
  await db.collection('user_access').doc('admin-1').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  const handlers = createFairwayHandlers(db, {
    verifyOperatorToken: async () => ({ uid: 'admin-1' }),
  });
  const body = { device_id: DEVICE_ID, firmware_version: '0.1.0+4', confirmation_sequence: 1 };
  const call = async (credential, payload = body) => {
    const response = createJsonResponse();
    await handlers.fairwayButtonReceiver(createRequest({
      path: '/api/v1/device-ota/confirmation',
      headers: { 'x-fairway-device-key': credential }, body: payload,
    }), response);
    return response;
  };
  assert.strictEqual((await call('wrong')).statusCode, 401);
  assert.strictEqual((await db.collection('ota_device_status').get()).size, 0);
  assert.strictEqual((await call(secret, { ...body, device_id: 'FRB-0006' })).statusCode, 404);
  await db.collection('devices').doc('FRB-0006').set({
    state: 'maintenance', credential: generateDeviceCredential().verifier,
  });
  assert.strictEqual((await call(secret, { ...body, device_id: 'FRB-0006' })).statusCode, 401);
  const response = await call(secret);
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body.acknowledged, true);
  assert.strictEqual(response.headers['Cache-Control'], 'private, no-store');
  const fleetResponse = createJsonResponse();
  await handlers.fairwayAdmin(createRequest({
    method: 'GET', path: '/api/v1/admin/fleet',
    headers: { authorization: 'Bearer test-admin-token' },
  }), fleetResponse);
  assert.strictEqual(fleetResponse.statusCode, 200);
  const device = fleetResponse.body.devices.find((item) => item.device_id === DEVICE_ID);
  assert.strictEqual(device.confirmed_firmware_version, body.firmware_version);
  assert.ok(device.confirmed_firmware_at);
  assert.strictEqual(device.firmware_generation, 'historical metadata');
  await db.collection('devices').doc(DEVICE_ID).update({ state: 'retired' });
  assert.strictEqual((await call(secret, { ...body, confirmation_sequence: 2 })).statusCode, 403);
});

test('delayed legacy deployment confirmation cannot replace newer sequence-protected running evidence', async () => {
  const { ota, db } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  const assignment = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  await ota.confirmRunningFirmware(DEVICE_ID, {
    firmware_version: '0.1.0+5', confirmation_sequence: 2,
  });
  const ref = db.collection('ota_device_status').doc(DEVICE_ID);
  const before = (await ref.get()).data();
  for (const state of ['downloading', 'verifying', 'staged', 'activation_pending', 'trial_boot', 'confirmed']) {
    await ota.reportUpdateEvent(assignment.deployment_id, DEVICE_ID, {
      state, firmware_version: VERSION_STRING, error_code: 0,
    });
  }
  assert.deepStrictEqual((await ref.get()).data(), before);
  assert.strictEqual((await ota.listDeployments())[0].state, 'confirmed');
});

test('production routes authorize Admin/device operations and stream ranged artifacts', async () => {
  const db = new FakeFirestore();
  const artifactStore = createArtifactStore();
  const now = () => new Date('2026-03-08T07:00:00.000Z');
  const { secret, verifier } = generateDeviceCredential();
  await db.collection('devices').doc(DEVICE_ID).set({
    state: 'deployed',
    customer_id: 'CUST-0002',
    course_id: 'COURSE-0002',
    credential: verifier,
    ota_capability: capability('one_time'),
  });
  await db.collection('customers').doc('CUST-0002').collection('courses').doc('COURSE-0002')
    .set({ timezone: 'America/Los_Angeles' });
  await db.collection('customers').doc('CUST-0002').set({ customer_name: 'Local test customer' });
  await db.collection('user_access').doc('admin-1').set({
    schema_version: 2,
    admin: true,
    customer_id: null,
    course_ids: [],
  });
  const handlers = createFairwayHandlers(db, {
    artifactDeliveryEnabled: true,
    artifactStore,
    acceptedOtaReleases: testAcceptedReleases,
    otaPublicationApprovals: { [RELEASE_ID]: approval(testAcceptedReleases[RELEASE_ID]) },
    now,
    verifyOperatorToken: async (token) => {
      if (token !== 'admin-token') throw new Error('invalid test token');
      return { uid: 'admin-1' };
    },
  });

  const releaseResponse = createJsonResponse();
  await handlers.fairwayAdmin(createRequest({
    method: 'POST',
    path: '/api/v1/admin/ota/releases',
    headers: { authorization: 'Bearer admin-token' },
    body: createReleaseBody(),
  }), releaseResponse);
  assert.strictEqual(releaseResponse.statusCode, 201);

  const unauthorizedAdmin = createJsonResponse();
  await handlers.fairwayAdmin(createRequest({
    method: 'POST',
    path: '/api/v1/admin/ota/releases',
    headers: { authorization: 'Bearer invalid-token' },
    body: createReleaseBody(),
  }), unauthorizedAdmin);
  assert.strictEqual(unauthorizedAdmin.statusCode, 401);

  const reviewResponse = createJsonResponse();
  await handlers.fairwayAdmin(createRequest({
    method: 'POST',
    path: '/api/v1/admin/ota/assignment-reviews',
    headers: { authorization: 'Bearer admin-token' },
    body: { release_id: RELEASE_ID, device_ids: [DEVICE_ID] },
  }), reviewResponse);
  assert.strictEqual(reviewResponse.statusCode, 201);
  const assignmentResponse = createJsonResponse();
  await handlers.fairwayAdmin(createRequest({
    method: 'POST',
    path: `/api/v1/admin/ota/assignment-reviews/${reviewResponse.body.review_id}/confirm`,
    headers: { authorization: 'Bearer admin-token' },
  }), assignmentResponse);
  assert.strictEqual(assignmentResponse.statusCode, 200);

  const checkResponse = createJsonResponse();
  await handlers.fairwayButtonReceiver(createRequest({
    method: 'POST',
    path: '/api/v1/device-ota/check',
    headers: { 'x-fairway-device-key': secret },
    body: { device_id: DEVICE_ID, hardware_id: HARDWARE_ID },
  }), checkResponse);
  assert.strictEqual(checkResponse.statusCode, 200);
  assert.strictEqual(checkResponse.body.update_available, true);
  assert.strictEqual(checkResponse.headers['Cache-Control'], 'private, no-store');
  assert.strictEqual(checkResponse.headers['Referrer-Policy'], 'no-referrer');

  const unauthorizedDevice = createJsonResponse();
  await handlers.fairwayButtonReceiver(createRequest({
    method: 'POST',
    path: '/api/v1/device-ota/check',
    headers: { 'x-fairway-device-key': 'wrong-key' },
    body: { device_id: DEVICE_ID, hardware_id: HARDWARE_ID },
  }), unauthorizedDevice);
  assert.strictEqual(unauthorizedDevice.statusCode, 401);
  assert.strictEqual(unauthorizedDevice.headers['Cache-Control'], 'private, no-store');

  const token = checkResponse.body.artifact_path.split('/').pop();
  const chunks = [];
  const downloadResponse = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  downloadResponse.headers = {};
  downloadResponse.set = function set(key, value) { this.headers[key] = value; return this; };
  downloadResponse.status = function status(code) { this.statusCode = code; return this; };
  downloadResponse.json = function json(value) { this.body = value; return this; };
  downloadResponse.send = function send(value) { this.body = value; return this; };
  const finished = new Promise((resolve, reject) => {
    downloadResponse.once('finish', resolve);
    downloadResponse.once('error', reject);
  });
  await handlers.fairwayButtonReceiver(createRequest({
    method: 'GET',
    path: `/api/v1/device-ota/artifacts/${token}`,
    headers: { range: 'bytes=0-31' },
  }), downloadResponse);
  await finished;
  assert.strictEqual(downloadResponse.statusCode, 206);
  assert.strictEqual(downloadResponse.headers['Content-Range'], 'bytes 0-31/512');
  assert.strictEqual(Buffer.concat(chunks).length, 32);
  artifactStore.createReadStream = () => { throw new Error(`Sensitive transport URL /api/v1/device-ota/artifacts/${token}`); };
  const logged = [];
  const originalError = console.error;
  const failedDownload = createJsonResponse();
  try {
    console.error = (...args) => logged.push(args.join(' '));
    await handlers.fairwayButtonReceiver(createRequest({
      method: 'GET', path: `/api/v1/device-ota/artifacts/${token}`,
    }), failedDownload);
  } finally { console.error = originalError; }
  assert.strictEqual(failedDownload.statusCode, 502);
  assert.strictEqual(failedDownload.headers['Cache-Control'], 'private, no-store');
  assert.ok(logged.some((line) => line.includes('OTA artifact retrieval failed')));
  assert.ok(logged.every((line) => !line.includes(token)));
  artifactStore.createReadStream = () => new Readable({
    read() { this.destroy(new Error(`Sensitive stream URL /api/v1/device-ota/artifacts/${token}`)); },
  });
  const streamFailure = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  streamFailure.headers = {};
  streamFailure.set = function set(key, value) { this.headers[key] = value; return this; };
  streamFailure.status = function status(code) { this.statusCode = code; return this; };
  streamFailure.send = function send(value) { this.end(value); return this; };
  const failedStreamFinished = new Promise((resolve, reject) => {
    streamFailure.once('finish', resolve);
    streamFailure.once('error', reject);
  });
  try {
    console.error = (...args) => logged.push(args.join(' '));
    await handlers.fairwayButtonReceiver(createRequest({
      method: 'GET', path: `/api/v1/device-ota/artifacts/${token}`,
    }), streamFailure);
    await failedStreamFinished;
  } finally { console.error = originalError; }
  assert.strictEqual(streamFailure.statusCode, 502);
  assert.ok(logged.some((line) => line.includes('OTA artifact stream failed')));
  assert.ok(logged.every((line) => !line.includes(token)));
});

test('nightly schedule stays at 12:30 a.m. course-local time across DST', () => {
  assert.strictEqual(
    nextCourseCheckTime('America/Los_Angeles', new Date('2026-03-08T07:00:00.000Z')).toISOString(),
    '2026-03-08T08:30:00.000Z'
  );
  assert.strictEqual(
    nextCourseCheckTime('America/Los_Angeles', new Date('2026-03-08T09:00:00.000Z')).toISOString(),
    '2026-03-09T07:30:00.000Z'
  );
});

test('release registration validates version identity, hardware, digest, and signed-image size', async () => {
  const { ota, artifactStore } = await setUp();
  const artifact = createArtifact();
  const result = await ota.registerRelease(createReleaseBody(artifact), 'admin-1');
  assert.deepStrictEqual(result, {
    release_id: RELEASE_ID,
    state: 'published',
    sha256: crypto.createHash('sha256').update(artifact).digest('hex'),
  });
  assert.strictEqual(artifactStore.objects.size, 1);
  assert.strictEqual((await ota.listReleases())[0].version_string, VERSION_STRING);

  await assert.rejects(
    ota.registerRelease({ ...createReleaseBody(), version_string: '1.0.0+1' }, 'admin-1'),
    (error) => error instanceof OtaError && error.code === 'invalid_version'
  );
  const mismatchedImage = createArtifact();
  mismatchedImage.writeUInt32LE(1, 24);
  const mismatchBody = createReleaseBody(mismatchedImage);
  await assert.rejects(
    ota.registerRelease(mismatchBody, 'admin-1'),
    (error) => error instanceof OtaError && error.code === 'invalid_version'
  );
  await assert.rejects(
    ota.registerRelease({ ...createReleaseBody(), hardware_ids: ['nrf9160dk/nrf9160/ns'] }, 'admin-1'),
    (error) => error instanceof OtaError && error.code === 'unsupported_hardware'
  );
});

test('device assignment, authenticated discovery, artifact grant, and expiry are enforced', async () => {
  const { db, ota, artifactStore, setTime } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  await assert.rejects(
    ota.assignRelease('FRB-0006', RELEASE_ID, 'admin-1'),
    (error) => error instanceof OtaError && error.code === 'unknown_device'
  );

  const assigned = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  assert.strictEqual(assigned.state, 'assigned');
  const device = (await db.collection('devices').doc(DEVICE_ID).get()).data();
  const update = await ota.checkForUpdate(DEVICE_ID, device, HARDWARE_ID);
  assert.strictEqual(update.update_available, true);
  assert.strictEqual(update.release_id, RELEASE_ID);
  assert.strictEqual(update.image_size, 512);
  assert.strictEqual(update.next_check_at_utc_ms, Date.parse('2026-03-08T08:30:00.000Z'));

  const token = update.artifact_path.split('/').pop();
  const authorized = await ota.getAuthorizedArtifact(token);
  assert.strictEqual(authorized.grant.device_id, DEVICE_ID);
  assert.strictEqual(artifactStore.objects.has(authorized.grant.object_path), true);

  setTime('2026-03-08T07:31:00.000Z');
  await assert.rejects(
    ota.getAuthorizedArtifact(token),
    (error) => error instanceof OtaError && error.code === 'download_not_authorized'
  );
});

test('OTA lifecycle transitions are ordered, idempotent, and device-scoped', async () => {
  const { ota, setTime } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  const assigned = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  const report = (state, deviceId = DEVICE_ID) => ota.reportUpdateEvent(
    assigned.deployment_id,
    deviceId,
    { state, firmware_version: VERSION_STRING, error_code: 0 }
  );

  await assert.rejects(
    report('confirmed'),
    (error) => error instanceof OtaError && error.code === 'invalid_state_transition'
  );
  await assert.rejects(
    report('downloading', 'FRB-0006'),
    (error) => error instanceof OtaError && error.code === 'device_mismatch'
  );

  for (const state of ['downloading', 'verifying', 'staged', 'activation_pending', 'trial_boot', 'confirmed']) {
    // eslint-disable-next-line no-await-in-loop
    await report(state);
  }
  setTime('2026-03-08T07:01:00.000Z');
  assert.strictEqual((await report('confirmed')).duplicate, true);
  await assert.rejects(
    report('downloading'),
    (error) => error instanceof OtaError && error.code === 'invalid_state_transition'
  );
  assert.strictEqual((await ota.listDeployments())[0].state, 'confirmed');
  assert.strictEqual((await ota.listDeployments())[0].reported_at.confirmed.toISOString(), '2026-03-08T07:00:00.000Z');
});

test('default production publication rejects synthetic images even with matching supplied hashes', async () => {
  const db = new FakeFirestore();
  const ota = createOtaService(db, { artifactStore: createArtifactStore() });
  await assert.rejects(ota.registerRelease(createReleaseBody(), 'admin-1'),
    (error) => error.code === 'release_not_accepted');
  assert.strictEqual((await db.collection('ota_releases').get()).size, 0);
});

test('accepted-byte allowance cannot bypass publication governance and USB initialization is never published', async () => {
  const db = new FakeFirestore();
  const artifactStore = createArtifactStore();
  const ota = createOtaService(db, { artifactStore, acceptedReleases: testAcceptedReleases });
  await assert.rejects(ota.registerRelease(createReleaseBody(), 'admin-1'),
    (error) => error.code === 'publication_not_authorized');
  for (const releaseId of ['OTA-0.1', 'OTA-0.1-r3', 'OTA-0.1-r4']) {
    await assert.rejects(ota.registerRelease({ ...createReleaseBody(), release_id: releaseId }, 'admin-1'),
      (error) => error.code === 'physical_initialization_only');
  }
  assert.strictEqual((await db.collection('ota_releases').get()).size, 0);
  assert.strictEqual(artifactStore.objects.size, 0);
});

test('fleet review and confirmation routes reject missing identity and non-Admin access before mutation', async () => {
  const db = new FakeFirestore();
  await db.collection('user_access').doc('customer-user').set({
    schema_version: 2, admin: false, customer_id: 'CUST-0001', course_ids: ['COURSE-0001'],
  });
  const handlers = createFairwayHandlers(db, {
    artifactStore: createArtifactStore(),
    verifyOperatorToken: async () => ({ uid: 'customer-user' }),
  });
  for (const [method, path] of [
    ['GET', '/api/v1/admin/ota/fleet'],
    ['POST', '/api/v1/admin/ota/assignment-reviews'],
    ['POST', '/api/v1/admin/ota/assignment-reviews/00000000-0000-4000-8000-000000000001/confirm'],
  ]) {
    for (const authenticated of [false, true]) {
      const response = createJsonResponse();
      await handlers.fairwayAdmin(createRequest({
        method, path, headers: authenticated ? { authorization: 'Bearer local-customer-test' } : {},
        body: { release_id: RELEASE_ID, device_ids: [DEVICE_ID] },
      }), response);
      assert.strictEqual(response.statusCode, authenticated ? 403 : 401);
    }
  }
  assert.strictEqual((await db.collection('ota_authorization_reviews').get()).size, 0);
  assert.strictEqual((await db.collection('ota_assignments').get()).size, 0);
});

test('publication requires matching original production provenance and never assigns a device', async () => {
  const { db, ota } = await setUp();
  for (const change of [
    { signing: { fingerprint: 'sha256:wrong' } },
    { build_source_sha256: '0'.repeat(64) },
    { device_credentials_embedded: true },
    { size_bytes: 123 },
  ]) {
    const body = createReleaseBody();
    body.manifest = { ...body.manifest, ...change };
    await assert.rejects(ota.registerRelease(body, 'admin-1'),
      (error) => error.code === 'invalid_provenance');
  }
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  assert.strictEqual((await db.collection('ota_assignments').get()).size, 0);
  assert.strictEqual((await db.collection('ota_deployments').get()).size, 0);
  assert.strictEqual((await ota.listReleases())[0].provenance.signing_fingerprint, PRODUCTION_FINGERPRINT);
});

test('fixed nightly assignment gates discovery until exact UTC eligibility and records check evidence', async () => {
  const { db, ota, setTime } = await setUp();
  await db.collection('devices').doc(DEVICE_ID).update({ ota_capability: capability('nightly') });
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  const scheduled = '2026-03-08T08:30:00.000Z';
  const assigned = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1', scheduled);
  assert.strictEqual(assigned.not_before, scheduled);
  const device = (await db.collection('devices').doc(DEVICE_ID).get()).data();
  assert.strictEqual((await ota.checkForUpdate(DEVICE_ID, device, HARDWARE_ID)).update_available, false);
  assert.strictEqual((await db.collection('ota_download_tokens').get()).size, 0);
  assert.strictEqual((await ota.listDeployments())[0].state, 'assigned');
  assert.strictEqual((await ota.listDeviceStatus())[0].last_check_at.toISOString(), '2026-03-08T07:00:00.000Z');
  setTime(scheduled);
  const offered = await ota.checkForUpdate(DEVICE_ID, device, HARDWARE_ID);
  assert.strictEqual(offered.update_available, true);
  const deployment = (await ota.listDeployments())[0];
  assert.strictEqual(deployment.offered_at.toISOString(), scheduled);
  assert.strictEqual(deployment.state, 'assigned', 'an offer is not an installation');
  assert.strictEqual(deployment.firmware_version, null);
});

test('review rejects attempts to supply arbitrary schedule timestamps', async () => {
  const { ota } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  for (const date of ['2026-03-08T00:30', '2026-02-30T10:00:00Z', '2020-01-01T00:00:00Z', 123, 'bad']) {
    await assert.rejects(ota.prepareAssignment({ release_id: RELEASE_ID, device_ids: [DEVICE_ID], not_before: date }, 'admin-1'),
      (error) => error.code === 'invalid_selection');
  }
});

test('no assignment offers no update and a different/ineligible device cannot discover it', async () => {
  const { db, ota } = await setUp();
  await db.collection('devices').doc(DEVICE_ID).update({ ota_capability: capability('nightly') });
  const device = (await db.collection('devices').doc(DEVICE_ID).get()).data();
  assert.strictEqual((await ota.checkForUpdate(DEVICE_ID, device, HARDWARE_ID)).update_available, false);
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  await assert.rejects(ota.checkForUpdate('FRB-0006', device, HARDWARE_ID),
    (error) => error.code === 'unknown_device');
  await db.collection('devices').doc(DEVICE_ID).update({ state: 'retired' });
  await assert.rejects(ota.checkForUpdate(DEVICE_ID, { ...device, state: 'retired' }, HARDWARE_ID),
    (error) => error.code === 'device_not_eligible');
  assert.strictEqual((await db.collection('ota_assignments').get()).size, 1);
});

test('download grant is rejected when device eligibility or assignment changes', async () => {
  const { db, ota } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  const device = (await db.collection('devices').doc(DEVICE_ID).get()).data();
  const update = await ota.checkForUpdate(DEVICE_ID, device, HARDWARE_ID);
  const token = update.artifact_path.split('/').pop();
  await db.collection('devices').doc(DEVICE_ID).update({ state: 'inventory' });
  await assert.rejects(ota.getAuthorizedArtifact(token),
    (error) => error.code === 'device_not_eligible');
  await db.collection('devices').doc(DEVICE_ID).update({ state: 'deployed' });
  await db.collection('ota_assignments').doc(DEVICE_ID).update({ deployment_id: 'other' });
  await assert.rejects(ota.getAuthorizedArtifact(token),
    (error) => error.code === 'download_not_authorized');
});

test('active assignment may be superseded and wrong-version boot confirmation is still rejected', async () => {
  const { ota } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  const assigned = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  const replacement = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  assert.notStrictEqual(replacement.deployment_id, assigned.deployment_id);
  assert.strictEqual(replacement.replaces_deployment_id, assigned.deployment_id);
  await assert.rejects(ota.reportUpdateEvent(assigned.deployment_id, DEVICE_ID, {
    state: 'trial_boot', firmware_version: '0.1.0+1',
  }), (error) => error.code === 'firmware_version_mismatch');
  await assert.rejects(ota.reportUpdateEvent(assigned.deployment_id, DEVICE_ID, {
    state: 'confirmed', firmware_version: VERSION_STRING, error_code: -1,
  }), (error) => error.code === 'invalid_update_event');
});

test('download request remains distinct from installation and a reported failure releases the assignment', async () => {
  const { db, ota } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  const assigned = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  const device = (await db.collection('devices').doc(DEVICE_ID).get()).data();
  const update = await ota.checkForUpdate(DEVICE_ID, device, HARDWARE_ID);
  await ota.getAuthorizedArtifact(update.artifact_path.split('/').pop());
  const [before] = await ota.listDeployments();
  assert.strictEqual(before.state, 'assigned');
  assert.strictEqual(before.firmware_version, null);
  assert.ok(before.artifact_requested_at instanceof Date);
  await ota.reportUpdateEvent(assigned.deployment_id, DEVICE_ID, {
    state: 'failed', firmware_version: '0.1.0+1', error_code: -5,
  });
  assert.strictEqual((await ota.listDeployments())[0].state, 'failed');
  assert.strictEqual((await ota.checkForUpdate(DEVICE_ID, device, HARDWARE_ID)).update_available, false);
  await assert.rejects(ota.getAuthorizedArtifact(update.artifact_path.split('/').pop()),
    (error) => error.code === 'download_not_authorized');
  const replacement = await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  assert.notStrictEqual(replacement.deployment_id, assigned.deployment_id);
});

test('failed publication is visible, assign-ineligible, and retryable without device side effects', async () => {
  const { db, ota, artifactStore } = await setUp();
  const upload = artifactStore.upload;
  artifactStore.upload = async () => { throw new Error('test storage failure SECRET-TRANSPORT-DETAIL'); };
  const logged = [];
  const originalError = console.error;
  try {
    console.error = (...args) => logged.push(args.join(' '));
    await assert.rejects(ota.registerRelease(createReleaseBody(), 'admin-1'),
      (error) => error.code === 'artifact_upload_failed');
  } finally { console.error = originalError; }
  assert.ok(logged.some((line) => line.includes('artifact_upload_failed')));
  assert.ok(logged.every((line) => !line.includes('SECRET-TRANSPORT-DETAIL')));
  assert.strictEqual((await ota.listReleases())[0].state, 'publish_failed');
  await assert.rejects(ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1'),
    (error) => error.code === 'release_unavailable');
  artifactStore.upload = upload;
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  assert.strictEqual((await ota.listReleases())[0].state, 'published');
  assert.strictEqual((await db.collection('ota_assignments').get()).size, 0);
});

test('OTA inventory, assignment and publication routes require global Admin access', async () => {
  const db = new FakeFirestore();
  await db.collection('user_access').doc('operator-1').set({
    schema_version: 2, admin: false, customer_id: 'CUST-0002', course_ids: ['COURSE-0002'],
  });
  const handlers = createFairwayHandlers(db, {
    artifactStore: createArtifactStore(),
    verifyOperatorToken: async () => ({ uid: 'operator-1' }),
  });
  for (const [method, path] of [
    ['GET', '/api/v1/admin/ota/releases'],
    ['POST', '/api/v1/admin/ota/releases'],
    ['GET', '/api/v1/admin/ota/deployments'],
    ['POST', '/api/v1/admin/ota/devices/FRB-0005/assignment'],
  ]) {
    const res = createJsonResponse();
    await handlers.fairwayAdmin(createRequest({
      method, path, headers: { authorization: 'Bearer operator-token' }, body: createReleaseBody(),
    }), res);
    assert.strictEqual(res.statusCode, 403, path);
  }
});

test('effective image-size boundary includes header and TLVs, not raw slot space', () => {
  for (const size of [MAX_SIGNED_IMAGE_BYTES - 1, MAX_SIGNED_IMAGE_BYTES,
    MAX_SIGNED_IMAGE_BYTES + 1, 442368]) {
    const image = Buffer.alloc(size);
    createArtifact().copy(image);
    const body = createReleaseBody(image);
    const accepted = { [RELEASE_ID]: body.sha256 };
    if (size <= MAX_SIGNED_IMAGE_BYTES) {
      assert.strictEqual(validateArtifact(body, accepted).artifact.length, size);
    } else {
      assert.throws(() => validateArtifact(body, accepted),
        (error) => error.code === 'invalid_artifact');
    }
  }
});

test('delivery defaults closed even with published fixture and valid assignment', async () => {
  const { db, ota, artifactStore } = await setUp();
  await ota.registerRelease(createReleaseBody(), 'admin-1');
  await ota.assignRelease(DEVICE_ID, RELEASE_ID, 'admin-1');
  const device = (await db.collection('devices').doc(DEVICE_ID).get()).data();
  const disabled = createOtaService(db, {
    artifactStore, acceptedReleases: testAcceptedReleases,
    publicationApprovals: { [RELEASE_ID]: approval(testAcceptedReleases[RELEASE_ID]) },
    now: () => new Date('2026-03-08T07:00:00.000Z'),
  });
  await assert.rejects(disabled.checkForUpdate(DEVICE_ID, device, HARDWARE_ID),
    (error) => error.code === 'artifact_delivery_disabled');
  await assert.rejects(disabled.getAuthorizedArtifact('unissued-test-marker'),
    (error) => error.code === 'artifact_delivery_disabled');
  assert.strictEqual((await db.collection('ota_download_tokens').get()).size, 0);
});

test('operator authentication errors never log raw verifier credential details', async () => {
  const marker = 'SECRET-TEST-CREDENTIAL-DO-NOT-LOG';
  const handlers = createFairwayHandlers(new FakeFirestore(), {
    verifyOperatorToken: async () => { throw new Error(marker); },
  });
  const logged = [];
  const originalWarn = console.warn;
  try {
    console.warn = (...args) => logged.push(args.join(' '));
    const res = createJsonResponse();
    await handlers.fairwayAdmin(createRequest({
      method: 'GET', path: '/api/v1/admin/ota/releases',
      headers: { authorization: 'Bearer test-token' },
    }), res);
    assert.strictEqual(res.statusCode, 401);
  } finally { console.warn = originalWarn; }
  assert.ok(logged.some((line) => line.includes('invalid_token')));
  assert.ok(logged.every((line) => !line.includes(marker)));
});

test('qualified successor version is distinct and still needs accepted bytes and reviewed provenance', () => {
  const artifact = createArtifact();
  artifact.writeUInt32LE(3, 24);
  const body = createReleaseBody(artifact);
  body.release_id = 'OTA-0.1alt-r2';
  body.version = { ...VERSION, build: 3 };
  body.version_string = '0.1.0+3';
  Object.assign(body.manifest, {
    release_id: body.release_id, version_string: body.version_string,
    source_commit: '1'.repeat(40), build_source_sha256: '2'.repeat(64),
    generated_image_capacity: { max_signed_image_bytes: MAX_SIGNED_IMAGE_BYTES },
  });
  assert.throws(() => validateArtifact(body), (e) => e.code === 'release_not_accepted');
  const accepted = { [body.release_id]: body.sha256 };
  assert.throws(() => validateArtifact(body, accepted), (e) => e.code === 'invalid_provenance');
  assert.strictEqual(validateArtifact(body, accepted, {
    [body.release_id]: { build_base_commit: body.manifest.source_commit,
      build_source_sha256: body.manifest.build_source_sha256 },
  }).versionString, '0.1.0+3');
});

test('r4 successor provenance is bound to its own approved build source, not the original OTA 0.1 source', () => {
  const artifact = createArtifact();
  artifact.writeUInt32LE(7, 24);
  const body = createReleaseBody(artifact);
  body.release_id = 'OTA-0.1alt-r4';
  body.version = { ...VERSION, build: 7 };
  body.version_string = '0.1.0+7';
  Object.assign(body.manifest, {
    release_id: body.release_id, version_string: body.version_string,
    source_commit: '3'.repeat(40), build_source_sha256: '4'.repeat(64),
    generated_image_capacity: { max_signed_image_bytes: MAX_SIGNED_IMAGE_BYTES },
  });
  const accepted = { [body.release_id]: body.sha256 };
  const approval = { [body.release_id]: { build_base_commit: '3'.repeat(40),
    build_source_sha256: '4'.repeat(64) } };
  assert.strictEqual(validateArtifact(body, accepted, approval).versionString, '0.1.0+7');
  assert.throws(() => validateArtifact(body, accepted, {
    [body.release_id]: { ...approval[body.release_id], build_source_sha256: '5'.repeat(64) },
  }), (e) => e.code === 'invalid_provenance');
});

run();
