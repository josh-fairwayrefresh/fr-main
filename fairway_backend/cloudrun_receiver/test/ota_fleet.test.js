'use strict';

const assert = require('node:assert/strict');
const { FakeFirestore } = require('./fake_firestore');
const { createOtaService, nextCourseCheckTime, HARDWARE_ID } = require('../lib/ota/ota_service');
const { ACCEPTED_RELEASES, PRODUCTION_FINGERPRINT } = require('../lib/ota/accepted_releases');
const { PUBLICATION_APPROVALS, publicationEligible } = require('../lib/ota/publication_policy');
const { capability, approval } = require('./ota_fixtures');
const { updateDeviceState, updateDeviceAssignment } = require('../lib/fleet/devices');

const RELEASE = 'OTA-0.1alt';
const DIGEST = 'a'.repeat(64);
const IDS = ['FRB-0005', 'FRB-0011', 'FRB-0012', 'FRB-0013', 'FRB-0014'];

async function setup({ hq = 'America/Los_Angeles', approvals } = {}) {
  const db = new FakeFirestore();
  let time = new Date('2026-03-08T07:00:00Z');
  const options = {
    artifactDeliveryEnabled: true,
    now: () => new Date(time), headquartersTimeZone: hq,
    artifactStore: {
      async upload() { assert.fail('Fleet fixtures are preseeded; publication is not expected.'); },
      createReadStream() { assert.fail('These tests authorize grants without streaming fixture bytes.'); },
    },
    acceptedReleases: { [RELEASE]: DIGEST },
    publicationApprovals: approvals || { [RELEASE]: approval(DIGEST, IDS) },
  };
  const ota = createOtaService(db, options);
  for (const [customer, zone] of [['CUST-0001', 'America/New_York'], ['CUST-0002', 'America/Los_Angeles']]) {
    await db.collection('customers').doc(customer).set({ customer_name: customer });
    await db.collection('customers').doc(customer).collection('courses').doc('COURSE-0001')
      .set({ course_name: `Course ${zone}`, timezone: zone });
  }
  for (const [id, state, customer] of [
    ['FRB-0005', 'deployed', 'CUST-0002'], ['FRB-0011', 'deployed', 'CUST-0001'],
    ['FRB-0012', 'deployed', 'CUST-0002'], ['FRB-0013', 'in_inventory', null],
    ['FRB-0014', 'maintenance', null], ['FRB-0015', 'retired', null],
  ]) {
    await db.collection('devices').doc(id).set({
      state, customer_id: customer, course_id: customer ? 'COURSE-0001' : null,
      ota_capability: capability(id === 'FRB-0005' ? 'one_time' : 'nightly'),
      credential: { digest: 'DO-NOT-EXPOSE' },
    });
  }
  await db.collection('ota_releases').doc(RELEASE).set({
    state: 'published', release_id: RELEASE, sha256: DIGEST, version_string: '0.1.0+2',
    version: { major: 0, minor: 1, revision: 0, build: 2 },
    size_bytes: 512, object_path: 'LOCAL-TEST-ONLY/fixture.bin',
    hardware_ids: [HARDWARE_ID], provenance: { signing_fingerprint: PRODUCTION_FINGERPRINT },
    created_at: time,
  });
  return { db, ota, options, setTime(value) { time = new Date(value); } };
}

async function run() {
  let count = 0;
  async function test(name, fn) { await fn(); count++; console.log(`PASS: ${name}`); }

  await test('fixed local 00:30 handles Pacific/Eastern DST and non-Pacific course zones', () => {
    for (const [zone, now, expected] of [
      ['America/Los_Angeles', '2026-03-08T09:00:00Z', '2026-03-09T07:30:00.000Z'],
      ['America/Los_Angeles', '2026-11-01T08:00:00Z', '2026-11-02T08:30:00.000Z'],
      ['America/New_York', '2026-03-08T04:00:00Z', '2026-03-08T05:30:00.000Z'],
      ['Asia/Tokyo', '2026-03-08T07:00:00Z', '2026-03-08T15:30:00.000Z'],
      ['America/Los_Angeles', '2026-07-10T07:30:00Z', '2026-07-11T07:30:00.000Z'],
    ]) assert.equal(nextCourseCheckTime(zone, new Date(now)).toISOString(), expected);
  });
  await test('approved headquarters policy works by default without an environment override', async () => {
    const { db, options } = await setup();
    delete options.headquartersTimeZone;
    const ota = createOtaService(db, options);
    const fleet = await ota.listFleet();
    assert.equal(fleet.headquarters_timezone, 'America/Los_Angeles');
    assert.equal(fleet.headquarters_timezone_status, 'configured');
    for (const id of ['FRB-0013', 'FRB-0014']) {
      const device = fleet.devices.find((item) => item.device_id === id);
      assert.equal(device.eligible, true);
      assert.equal(device.next_window, '2026-03-08T08:30:00.000Z');
    }
  });
  await test('dropdown eligibility uses the same accepted bytes, trust and hardware gate as assignment', async () => {
    for (const mutation of [
      { sha256: 'c'.repeat(64) }, { hardware_ids: ['other-board'] },
      { provenance: { signing_fingerprint: 'wrong' } }, { state: 'publish_failed' },
      { size_bytes: 434177 }, { size_bytes: 442368 },
    ]) {
      const { db, ota } = await setup();
      await db.collection('ota_releases').doc(RELEASE).update(mutation);
      assert.equal((await ota.listReleases())[0].assignable, false);
      await assert.rejects(ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0005'] }, 'admin'),
        (error) => ['release_not_eligible', 'release_unavailable'].includes(error.code));
    }
  });
  await test('withdrawn releases cannot be confirmed from a stale review', async () => {
    const { db, ota } = await setup();
    const review = await ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0012'] }, 'admin');
    await db.collection('ota_releases').doc(RELEASE).update({ state: 'publish_failed' });
    await assert.rejects(ota.confirmAssignment(review.review_id, 'admin'),
      (error) => error.code === 'release_unavailable');
    assert.equal((await db.collection('ota_assignments').get()).size, 0);
  });
  await test('published governed replacement withdraws only new selection and preserves active old delivery', async () => {
    const { db, options } = await setup();
    const old = 'OTA-0.1alt-r2';
    const replacement = 'OTA-0.1alt-r3';
    const fixture = (await db.collection('ota_releases').doc(RELEASE).get()).data();
    const approvals = {
      [old]: { ...approval(DIGEST, IDS), build_base_commit: '1'.repeat(40), build_source_sha256: '2'.repeat(64) },
      [replacement]: { ...approval(DIGEST, IDS), build_base_commit: '1'.repeat(40), build_source_sha256: '2'.repeat(64) },
    };
    const ota = createOtaService(db, {
      ...options, publicationApprovals: approvals,
      acceptedReleases: { [old]: DIGEST, [replacement]: DIGEST },
    });
    await db.collection('ota_releases').doc(old).set({ ...fixture, release_id: old });
    const active = await ota.prepareAssignment({ release_id: old, device_ids: ['FRB-0005'] }, 'admin');
    await ota.confirmAssignment(active.review_id, 'admin');
    const stale = await ota.prepareAssignment({ release_id: old, device_ids: ['FRB-0012'] }, 'admin');
    const oldAssignment = (await db.collection('ota_assignments').doc('FRB-0005').get()).data();
    await db.collection('ota_releases').doc(replacement).set({
      ...fixture, state: 'publish_failed', release_id: replacement,
    });
    assert.equal((await ota.listReleases()).find((release) => release.release_id === old).assignable, true);
    await db.collection('ota_releases').doc(replacement).update({ state: 'published' });
    assert.equal((await ota.listReleases()).find((release) => release.release_id === old).assignable, false);
    assert.equal((await ota.listReleases()).find((release) => release.release_id === replacement).assignable, true);
    await assert.rejects(ota.prepareAssignment({ release_id: old, device_ids: ['FRB-0012'] }, 'admin'),
      (error) => error.code === 'release_superseded');
    await assert.rejects(ota.confirmAssignment(stale.review_id, 'admin'),
      (error) => error.code === 'release_superseded');
    const device = (await db.collection('devices').doc('FRB-0005').get()).data();
    assert.equal((await ota.checkForUpdate('FRB-0005', device, HARDWARE_ID)).update_available, true);
    assert.deepEqual((await db.collection('ota_assignments').doc('FRB-0005').get()).data(), oldAssignment);
  });
  await test('missing artifact storage never produces a success-shaped offer or download token', async () => {
    const { db, ota, options } = await setup();
    const review = await ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0005'] }, 'admin');
    await ota.confirmAssignment(review.review_id, 'admin');
    const unavailable = createOtaService(db, { ...options, artifactStore: null });
    const device = (await db.collection('devices').doc('FRB-0005').get()).data();
    await assert.rejects(unavailable.checkForUpdate('FRB-0005', device, HARDWARE_ID),
      (error) => error.code === 'artifact_storage_unavailable');
    assert.equal((await db.collection('ota_download_tokens').get()).size, 0);
    assert.equal((await ota.listDeployments())[0].offered_at, null);
  });
  await test('1.0 replacement retires only new selection and keeps active prior delivery', async () => {
    const { db, options, setTime } = await setup();
    const old = 'OTA-1.0-r2';
    const replacement = 'OTA-1.0-r3';
    const fixture = (await db.collection('ota_releases').doc(RELEASE).get()).data();
    const ota = createOtaService(db, {
      ...options,
      publicationApprovals: Object.fromEntries([old, replacement].map((id) => [id, {
        ...approval(DIGEST, IDS), build_base_commit: '1'.repeat(40),
        build_source_sha256: '2'.repeat(64),
      }])),
      acceptedReleases: { [old]: DIGEST, [replacement]: DIGEST },
    });
    await db.collection('ota_releases').doc(old).set({ ...fixture, release_id: old, version_string: '1.0.0+2' });
    const review = await ota.prepareAssignment({ release_id: old, device_ids: ['FRB-0012'] }, 'admin');
    await ota.confirmAssignment(review.review_id, 'admin');
    const assignmentRef = db.collection('ota_assignments').doc('FRB-0012');
    const before = (await assignmentRef.get()).data();
    await db.collection('ota_releases').doc(replacement).set({
      ...fixture, release_id: replacement, version_string: '1.0.0+3',
    });
    const releases = await ota.listReleases();
    assert.equal(releases.find((item) => item.release_id === old).assignable, false);
    assert.equal(releases.find((item) => item.release_id === replacement).assignable, true);
    await assert.rejects(ota.prepareAssignment({ release_id: old, device_ids: ['FRB-0011'] }, 'admin'),
      (error) => error.code === 'release_superseded');
    setTime('2026-03-09T08:00:00Z');
    const device = (await db.collection('devices').doc('FRB-0012').get()).data();
    const offer = await ota.checkForUpdate('FRB-0012', device, HARDWARE_ID);
    assert.equal(offer.update_available, true);
    assert.equal(offer.release_id, old);
    assert.deepEqual((await assignmentRef.get()).data(), before);
  });
  await test('five publication prerequisites are independently mandatory and USB baseline is excluded', () => {
    const record = approval(DIGEST);
    assert.equal(publicationEligible(RELEASE, DIGEST, { [RELEASE]: record }), true);
    for (const field of Object.keys(record)) {
      const missing = { ...record };
      delete missing[field];
      assert.equal(publicationEligible(RELEASE, DIGEST, { [RELEASE]: missing }), false, field);
    }
    for (const usbOnly of ['OTA-0.1', 'OTA-0.1-r3', 'OTA-0.1-r4']) {
      assert.equal(publicationEligible(usbOnly, DIGEST, { [usbOnly]: record }), false, usbOnly);
    }
  });
  await test('0.1alt r4 replacement withdraws r3 from new selection and keeps r3 history', async () => {
    const { db, options } = await setup();
    const fixture = (await db.collection('ota_releases').doc(RELEASE).get()).data();
    const ids = ['OTA-0.1alt-r3', 'OTA-0.1alt-r4'];
    const ota = createOtaService(db, {
      ...options,
      publicationApprovals: Object.fromEntries(ids.map((id) => [id, {
        ...approval(DIGEST, IDS), build_base_commit: '1'.repeat(40), build_source_sha256: '2'.repeat(64),
      }])),
      acceptedReleases: Object.fromEntries(ids.map((id) => [id, DIGEST])),
    });
    await db.collection('ota_releases').doc(ids[0]).set({ ...fixture, release_id: ids[0], version_string: '0.1.0+5' });
    await db.collection('ota_releases').doc(ids[1]).set({ ...fixture, release_id: ids[1], version_string: '0.1.0+7' });
    const releases = await ota.listReleases();
    assert.equal(releases.find((item) => item.release_id === ids[0]).assignable, false);
    assert.equal(releases.find((item) => item.release_id === ids[1]).assignable, true);
    await assert.rejects(ota.prepareAssignment({ release_id: ids[0], device_ids: ['FRB-0005'] }, 'admin'),
      (error) => error.code === 'release_superseded');
    const review = await ota.prepareAssignment({ release_id: ids[1], device_ids: ['FRB-0005'] }, 'admin');
    assert.equal(review.devices[0].schedule, 'bootstrap_900_seconds');
    assert.equal((await db.collection('ota_releases').doc(ids[0]).get()).data().state, 'published');
  });
  await test('production publication approvals pin only the accepted successor bytes and FRB-0005', () => {
    const accepted = {
      'OTA-0.1alt-r2': '2f146c14586740fd7b0097e6a67ef2be3e82b20aa7d6b4d8cd792f39ef667844',
      'OTA-1.0-r2': '21fe0f3df7cf775631b1d0af5f534ba35927e099e72b1b3184ee4713c4ba594c',
      'OTA-0.1alt-r3': '79e53b5643fcc78cabb152e89eeac4fc1377587dd58b71c51d41c0cb7637275d',
      'OTA-1.0-r3': '2869c2f47cb1b6a35665235e6b24bacd401aaafe8dfa59f632514d0cf0ebd41d',
    };
    assert.deepEqual(Object.keys(PUBLICATION_APPROVALS).sort(), Object.keys(accepted).sort());
    for (const [releaseId, digest] of Object.entries(accepted)) {
      assert.equal(ACCEPTED_RELEASES[releaseId], digest);
      assert.equal(publicationEligible(releaseId, digest), true);
      assert.equal(publicationEligible(releaseId, '0'.repeat(64)), false);
      assert.deepEqual(PUBLICATION_APPROVALS[releaseId].device_ids, ['FRB-0005']);
      const base = releaseId === 'OTA-0.1alt-r3' ? 'a99c45cf97de478c5c199381e48e6061d9de5fcd'
        : releaseId === 'OTA-1.0-r3' ? '00530a1a5875c3217e1de7e0368cd8b323fe1173'
        : '11213b4ad0607486df12f28d764f6d6abd90cdb6';
      assert.equal(PUBLICATION_APPROVALS[releaseId].build_base_commit, base);
      assert.equal(PUBLICATION_APPROVALS[releaseId].build_source_sha256,
        releaseId.endsWith('-r3') ? '7db7dfa0a8f8070eb93253cecddc82bce09b66d5585f165ef3041afca52b7051'
          : '47bbaa7c2543469f336e81d91121c49d1334400cc5ac426b20ff8cd44e414dc3');
    }
  });
  await test('fleet projects canonical categories once, hides retired devices and never exposes credential verifiers', async () => {
    const { ota } = await setup();
    const fleet = await ota.listFleet();
    assert.equal(fleet.customers.length, 2);
    assert.equal(fleet.devices.length, 5);
    assert.equal(new Set(fleet.devices.map((item) => item.device_id)).size, 5);
    assert.equal(fleet.devices.find((item) => item.device_id === 'FRB-0014').state, 'maintenance');
    assert.equal(JSON.stringify(fleet).includes('DO-NOT-EXPOSE'), false);
  });
  await test('multi-device authorization is exact, audited, atomic and idempotent', async () => {
    const { db, ota } = await setup();
    const review = await ota.prepareAssignment({ release_id: RELEASE, device_ids: IDS.slice(1) }, 'admin');
    assert.equal((await db.collection('ota_assignments').get()).size, 0);
    const result = await ota.confirmAssignment(review.review_id, 'admin');
    assert.deepEqual(result.assignments.map((item) => item.device_id), IDS.slice(1));
    assert.equal((await db.collection('ota_assignments').get()).size, 4);
    const repeated = await ota.confirmAssignment(review.review_id, 'admin');
    assert.deepEqual(repeated, result);
    for (const item of result.assignments) {
      const event = await db.collection('ota_deployments').doc(item.deployment_id).collection('events').doc('assigned').get();
      assert.equal(event.data().authorization_id, review.review_id);
    }
  });
  await test('membership additions never expand exact reviewed IDs', async () => {
    const { db, ota } = await setup();
    const review = await ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0012'] }, 'admin');
    await db.collection('devices').doc('FRB-0099').set({
      state: 'deployed', customer_id: 'CUST-0002', course_id: 'COURSE-0001', ota_capability: capability(),
    });
    await ota.confirmAssignment(review.review_id, 'admin');
    assert.deepEqual((await db.collection('ota_assignments').get()).docs.map((doc) => doc.id), ['FRB-0012']);
  });
  await test('changed device state, course timezone and review expiration require fresh review', async () => {
    for (const mutation of ['state', 'timezone', 'expiry']) {
      const { db, ota, setTime } = await setup();
      const review = await ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0012'] }, 'admin');
      if (mutation === 'state') await db.collection('devices').doc('FRB-0012').update({ state: 'maintenance' });
      if (mutation === 'timezone') await db.collection('customers').doc('CUST-0002').collection('courses')
        .doc('COURSE-0001').update({ timezone: 'Asia/Tokyo' });
      if (mutation === 'expiry') setTime('2026-03-08T07:06:00Z');
      await assert.rejects(ota.confirmAssignment(review.review_id, 'admin'),
        (error) => ['review_changed', 'review_expired'].includes(error.code));
      assert.equal((await db.collection('ota_assignments').get()).size, 0);
    }
  });
  await test('duplicate/conflicting targets, forged review owner and direct assignments fail closed', async () => {
    const { ota } = await setup();
    await assert.rejects(ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0012', 'FRB-0012'] }, 'admin'),
      (error) => error.code === 'invalid_selection');
    await assert.rejects(ota.prepareAssignment({ release_id: 'untrusted/path', device_ids: ['FRB-0012'] }, 'admin'),
      (error) => error.code === 'invalid_selection');
    await assert.rejects(ota.assignRelease('FRB-0012', RELEASE, 'admin'),
      (error) => error.code === 'assignment_review_required');
    const body = { release_id: RELEASE, device_ids: ['FRB-0012'] };
    const review = await ota.prepareAssignment(body, 'admin');
    await assert.rejects(ota.confirmAssignment(review.review_id, 'different-admin'),
      (error) => error.code === 'invalid_review');
    await ota.confirmAssignment(review.review_id, 'admin');
    const next = await ota.prepareAssignment(body, 'admin');
    assert.ok(next.devices[0].current_assignment_id);
  });
  await test('transaction failure creates no partial assignment for multiple devices', async () => {
    const { db, ota } = await setup();
    const review = await ota.prepareAssignment({ release_id: RELEASE, device_ids: IDS.slice(1) }, 'admin');
    db.failNextTransactionCommit = true;
    await assert.rejects(ota.confirmAssignment(review.review_id, 'admin'), /Simulated/);
    assert.equal((await db.collection('ota_assignments').get()).size, 0);
    assert.equal((await db.collection('ota_deployments').get()).size, 0);
  });
  await test('competing reviewed authorizations cannot create conflicting assignments', async () => {
    const { db, ota } = await setup();
    const body = { release_id: RELEASE, device_ids: ['FRB-0012'] };
    const reviews = await Promise.all([ota.prepareAssignment(body, 'admin'), ota.prepareAssignment(body, 'admin')]);
    const results = await Promise.allSettled(reviews.map((review) => ota.confirmAssignment(review.review_id, 'admin')));
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(results.find((item) => item.status === 'rejected').reason.code, 'review_changed');
    assert.equal((await db.collection('ota_deployments').get()).size, 1);
  });
  await test('post-authorization tenant or timezone changes block both discovery and existing artifact grants', async () => {
    for (const change of ['customer', 'timezone']) {
      const { db, ota } = await setup();
      const review = await ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0005'] }, 'admin');
      await ota.confirmAssignment(review.review_id, 'admin');
      const deviceRef = db.collection('devices').doc('FRB-0005');
      const offered = await ota.checkForUpdate('FRB-0005', (await deviceRef.get()).data(), HARDWARE_ID);
      if (change === 'customer') await deviceRef.update({ customer_id: 'CUST-0001' });
      else await db.collection('customers').doc('CUST-0002').collection('courses').doc('COURSE-0001')
        .update({ timezone: 'Asia/Tokyo' });
      await assert.rejects(ota.checkForUpdate('FRB-0005', (await deviceRef.get()).data(), HARDWARE_ID),
        (error) => error.code === 'assignment_changed');
      await assert.rejects(ota.getAuthorizedArtifact(offered.artifact_path.split('/').pop()),
        (error) => error.code === 'assignment_changed');
      const projected = (await ota.listFleet()).devices.find((item) => item.device_id === 'FRB-0005');
      assert.equal(projected.eligible, true, 'old delivery restrictions do not block assigning a new target');
      assert.match(projected.assignment_notice, /delivery is blocked/);
    }
  });
  await test('headquarters config absence blocks only Inventory/Maintenance, not deployed work', async () => {
    const { ota } = await setup({ hq: null });
    const fleet = await ota.listFleet();
    assert.equal(fleet.devices.find((item) => item.device_id === 'FRB-0012').eligible, true);
    assert.equal(fleet.devices.find((item) => item.device_id === 'FRB-0013').eligible, false);
    assert.equal(fleet.devices.find((item) => item.device_id === 'FRB-0014').eligible, false);
    await assert.rejects(ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0014'] }, 'admin'),
      (error) => error.code === 'timezone_unresolved');
  });
  await test('Maintenance clears active deployment through the canonical asset lifecycle without retiring communication', async () => {
    const { db, ota } = await setup();
    await updateDeviceState(db, 'FRB-0012', 'maintenance');
    const record = (await db.collection('devices').doc('FRB-0012').get()).data();
    assert.equal(record.customer_id, null);
    assert.equal(record.course_id, null);
    assert.equal(record.location, null);
    await assert.rejects(updateDeviceAssignment(db, 'FRB-0012', { customerId: 'CUST-0001' }),
      /Maintenance devices cannot have an active assignment/);
    const asset = (await ota.listFleet()).devices.find((item) => item.device_id === 'FRB-0012');
    assert.equal(asset.state, 'maintenance');
    assert.equal(asset.eligible, true);
    assert.equal(asset.timezone, 'America/Los_Angeles');
  });
  await test('missing capability, retired state, and release target restrictions cannot be bypassed', async () => {
    const { db, ota } = await setup();
    await db.collection('devices').doc('FRB-0012').update({ ota_capability: null });
    for (const id of ['FRB-0012', 'FRB-0015']) {
      await assert.rejects(ota.prepareAssignment({ release_id: RELEASE, device_ids: [id] }, 'admin'),
        (error) => error.code === 'device_not_eligible');
    }
    const restricted = await setup({ approvals: { [RELEASE]: approval(DIGEST, ['FRB-0005']) } });
    await assert.rejects(restricted.ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0011'] }, 'admin'),
      (error) => error.code === 'device_not_eligible');
  });
  await test('default governance blocks preexisting published records instead of trusting their existence', async () => {
    const { db, options } = await setup();
    const ota = createOtaService(db, { ...options, publicationApprovals: {} });
    assert.equal((await ota.listReleases())[0].assignable, false);
    await assert.rejects(ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0005'] }, 'admin'),
      (error) => error.code === 'release_not_eligible');
  });
  await test('Inventory and Maintenance use HQ eligibility and unchanged discovery/download contracts', async () => {
    const { db, ota, setTime } = await setup();
    const review = await ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0013', 'FRB-0014'] }, 'admin');
    await ota.confirmAssignment(review.review_id, 'admin');
    for (const id of ['FRB-0013', 'FRB-0014']) {
      const device = (await db.collection('devices').doc(id).get()).data();
      assert.equal(await ota.getNextCheck(device), Date.parse('2026-03-08T08:30:00Z'));
      assert.equal((await ota.checkForUpdate(id, device, HARDWARE_ID)).update_available, false);
    }
    setTime('2026-03-08T08:30:00Z');
    for (const id of ['FRB-0013', 'FRB-0014']) {
      const device = (await db.collection('devices').doc(id).get()).data();
      const update = await ota.checkForUpdate(id, device, HARDWARE_ID);
      assert.equal(update.update_available, true);
      assert.equal(update.next_check_at_utc_ms, Date.parse('2026-03-09T07:30:00Z'));
      const grant = await ota.getAuthorizedArtifact(update.artifact_path.split('/').pop());
      assert.equal(grant.grant.device_id, id);
    }
    assert.deepEqual((await ota.listDeviceStatus()).map((item) => item.device_id).sort(), ['FRB-0013', 'FRB-0014']);
  });
  await test('only matching successful confirmation promotes a physically initialized bootstrap to nightly', async () => {
    const { db, ota, options } = await setup();
    const review = await ota.prepareAssignment({ release_id: RELEASE, device_ids: ['FRB-0005'] }, 'admin');
    const result = await ota.confirmAssignment(review.review_id, 'admin');
    const deploymentId = result.assignments[0].deployment_id;
    await assert.rejects(ota.reportUpdateEvent(deploymentId, 'FRB-0005',
      { state: 'confirmed', firmware_version: '0.1.0+1', error_code: 0 }),
    (error) => error.code === 'firmware_version_mismatch');
    assert.equal((await ota.listFleet()).devices.find((item) => item.device_id === 'FRB-0005').confirmed_firmware_version, null);
    for (const state of ['downloading', 'verifying', 'staged', 'activation_pending', 'trial_boot', 'confirmed']) {
      await ota.reportUpdateEvent(deploymentId, 'FRB-0005', { state, firmware_version: '0.1.0+2', error_code: 0 });
    }
    const digest = 'b'.repeat(64);
    await db.collection('ota_releases').doc('OTA-1.0').set({
      state: 'published', sha256: digest, hardware_ids: [HARDWARE_ID],
      size_bytes: 512,
      version_string: '1.0.0+1', provenance: { signing_fingerprint: PRODUCTION_FINGERPRINT },
    });
    const nextOta = createOtaService(db, {
      ...options, acceptedReleases: { ...options.acceptedReleases, 'OTA-1.0': digest },
      publicationApprovals: { ...options.publicationApprovals, 'OTA-1.0': approval(digest, ['FRB-0005']) },
    });
    const next = await nextOta.prepareAssignment({ release_id: 'OTA-1.0', device_ids: ['FRB-0005'] }, 'admin');
    assert.equal(next.devices[0].schedule, 'nightly_0030');
    assert.equal(next.devices[0].next_window, '2026-03-08T08:30:00.000Z');
    assert.equal((await db.collection('devices').doc('FRB-0005').get()).data().ota_capability.schedule_mode, 'one_time');
  });
  await test('bootstrap may target any approved compatible successor without pretending it is already nightly', async () => {
    const { db, options } = await setup();
    const digest = 'b'.repeat(64);
    for (const [id, version] of [['OTA-0.1alt-r2', '0.1.0+3'], ['OTA-1.0-r2', '1.0.0+2']]) {
      await db.collection('ota_releases').doc(id).set({
        state: 'published', release_id: id, sha256: digest, version_string: version,
        size_bytes: 512,
        hardware_ids: [HARDWARE_ID], provenance: { signing_fingerprint: PRODUCTION_FINGERPRINT },
      });
    }
    const ota = createOtaService(db, {
      ...options,
      acceptedReleases: { 'OTA-0.1alt-r2': digest, 'OTA-1.0-r2': digest },
      publicationApprovals: {
        'OTA-0.1alt-r2': { ...approval(digest, ['FRB-0005']),
          build_base_commit: '1'.repeat(40), build_source_sha256: '2'.repeat(64) },
        'OTA-1.0-r2': { ...approval(digest, ['FRB-0005']),
          build_base_commit: '1'.repeat(40), build_source_sha256: '2'.repeat(64) },
      },
    });
    const first = await ota.prepareAssignment({
      release_id: 'OTA-0.1alt-r2', device_ids: ['FRB-0005'],
    }, 'admin');
    assert.equal(first.devices[0].schedule, 'bootstrap_900_seconds');
    const direct = await ota.prepareAssignment({
      release_id: 'OTA-1.0-r2', device_ids: ['FRB-0005'],
    }, 'admin');
    assert.equal(direct.devices[0].schedule, 'bootstrap_900_seconds');
    await db.collection('ota_device_status').doc('FRB-0005').set({ confirmed_schedule_mode: 'nightly' });
    const second = await ota.prepareAssignment({
      release_id: 'OTA-1.0-r2', device_ids: ['FRB-0005'],
    }, 'admin');
    assert.equal(second.devices[0].schedule, 'nightly_0030');
    assert.equal(second.devices[0].next_window, '2026-03-08T08:30:00.000Z');
  });
  await test('normal review supersedes every earlier lifecycle state without destroying installation evidence', async () => {
    for (const state of ['assigned', 'downloading', 'verifying', 'staged', 'activation_pending',
      'trial_boot', 'confirmed', 'failed', 'rolled_back']) {
      const { db, ota } = await setup();
      const body = { release_id: RELEASE, device_ids: ['FRB-0005'] };
      const firstReview = await ota.prepareAssignment(body, 'admin');
      const first = await ota.confirmAssignment(firstReview.review_id, 'admin');
      const oldId = first.assignments[0].deployment_id;
      const oldRef = db.collection('ota_deployments').doc(oldId);
      await oldRef.update({ state, reported_at: { [state]: new Date('2026-03-08T06:59:00Z') } });
      await db.collection('ota_device_status').doc('FRB-0005').set({
        last_check_at: new Date('2026-03-08T06:00:00Z'), confirmed_firmware_version: '0.1.0+4',
      });
      const fleetDevice = (await ota.listFleet()).devices.find((device) => device.device_id === 'FRB-0005');
      assert.equal(fleetDevice.eligible, true);
      assert.equal(fleetDevice.bootstrap_check_observed, true);
      const review = await ota.prepareAssignment(body, 'admin');
      assert.equal(review.devices[0].current_assignment_id, oldId);
      assert.equal(review.devices[0].last_result.state, state);
      const next = await ota.confirmAssignment(review.review_id, 'admin');
      const newId = next.assignments[0].deployment_id;
      assert.notEqual(newId, oldId);
      assert.equal(next.assignments[0].replaces_deployment_id, oldId);
      assert.equal((await db.collection('ota_assignments').doc('FRB-0005').get()).data().deployment_id, newId);
      const old = (await oldRef.get()).data();
      assert.equal(old.state, state);
      assert.ok(old.reported_at[state]);
      assert.equal(old.superseded_by, newId);
      const event = (await oldRef.collection('events').doc('superseded').get()).data();
      assert.equal(event.previous_state, state);
      assert.equal(event.authorization_id, review.review_id);
      await ota.confirmAssignment(firstReview.review_id, 'admin');
      await ota.confirmAssignment(review.review_id, 'admin');
      assert.equal((await db.collection('ota_assignments').doc('FRB-0005').get()).data().deployment_id, newId);
      assert.equal((await db.collection('ota_deployments').get()).size, 2);
      assert.equal((await db.collection('ota_device_status').doc('FRB-0005').get()).data()
        .last_check_at.toISOString(), '2026-03-08T06:00:00.000Z', 'assignment never rearms or rewrites checks');
      assert.equal((await db.collection('ota_device_status').doc('FRB-0005').get()).data()
        .confirmed_firmware_version, '0.1.0+4', 'assignment is not evidence of running firmware');
    }
  });
  await test('replacement invalidates old artifact grants but late old confirmation cannot clear the new target', async () => {
    const { db, ota } = await setup();
    const body = { release_id: RELEASE, device_ids: ['FRB-0005'] };
    const first = await ota.confirmAssignment((await ota.prepareAssignment(body, 'admin')).review_id, 'admin');
    const oldId = first.assignments[0].deployment_id;
    const device = (await db.collection('devices').doc('FRB-0005').get()).data();
    const offered = await ota.checkForUpdate('FRB-0005', device, HARDWARE_ID);
    const next = await ota.confirmAssignment((await ota.prepareAssignment(body, 'admin')).review_id, 'admin');
    const newId = next.assignments[0].deployment_id;
    await assert.rejects(ota.getAuthorizedArtifact(offered.artifact_path.split('/').pop()),
      (error) => error.code === 'download_not_authorized');
    await ota.confirmRunningFirmware('FRB-0005', {
      device_id: 'FRB-0005', firmware_version: '0.1.0+2', confirmation_sequence: 1, deployment_id: oldId,
    });
    assert.equal((await db.collection('ota_assignments').doc('FRB-0005').get()).data().deployment_id, newId);
    assert.equal((await ota.checkForUpdate('FRB-0005', device, HARDWARE_ID)).deployment_id, newId);
    assert.equal((await db.collection('ota_deployments').doc(oldId).get()).data().superseded_by, newId);
  });
  await test('changed or completed prior target requires a fresh review rather than silently replacing a different target', async () => {
    for (const change of ['reassigned', 'completed']) {
      const { db, ota } = await setup();
      const body = { release_id: RELEASE, device_ids: ['FRB-0005'] };
      await ota.confirmAssignment((await ota.prepareAssignment(body, 'admin')).review_id, 'admin');
      const stale = await ota.prepareAssignment(body, 'admin');
      if (change === 'reassigned') {
        await ota.confirmAssignment((await ota.prepareAssignment(body, 'other-admin')).review_id, 'other-admin');
      } else {
        await ota.confirmRunningFirmware('FRB-0005', {
          firmware_version: '0.1.0+2', confirmation_sequence: 1,
          deployment_id: stale.devices[0].current_assignment_id,
        });
      }
      await assert.rejects(ota.confirmAssignment(stale.review_id, 'admin'),
        (error) => error.code === 'review_changed');
    }
  });
  await test('failed replacement transaction preserves the old target and creates no supersession history', async () => {
    const { db, ota } = await setup();
    const body = { release_id: RELEASE, device_ids: ['FRB-0005'] };
    const old = await ota.confirmAssignment((await ota.prepareAssignment(body, 'admin')).review_id, 'admin');
    const oldId = old.assignments[0].deployment_id;
    const review = await ota.prepareAssignment(body, 'admin');
    db.failNextTransactionCommit = true;
    await assert.rejects(ota.confirmAssignment(review.review_id, 'admin'), /Simulated/);
    assert.equal((await db.collection('ota_assignments').doc('FRB-0005').get()).data().deployment_id, oldId);
    const oldRef = db.collection('ota_deployments').doc(oldId);
    assert.equal((await oldRef.get()).data().superseded_by, undefined);
    assert.equal((await oldRef.collection('events').doc('superseded').get()).exists, false);
    assert.equal((await db.collection('ota_deployments').get()).size, 1);
  });
  await test('delayed superseded reports cannot overwrite newer running evidence or the latest target', async () => {
    const { db, ota } = await setup();
    const body = { release_id: RELEASE, device_ids: ['FRB-0005'] };
    const old = await ota.confirmAssignment((await ota.prepareAssignment(body, 'admin')).review_id, 'admin');
    const oldId = old.assignments[0].deployment_id;
    for (const state of ['downloading', 'verifying', 'staged', 'activation_pending', 'trial_boot']) {
      await ota.reportUpdateEvent(oldId, 'FRB-0005', { state, firmware_version: '0.1.0+2' });
    }
    const next = await ota.confirmAssignment((await ota.prepareAssignment(body, 'admin')).review_id, 'admin');
    const latest = (await db.collection('ota_assignments').doc('FRB-0005').get()).data();
    await ota.confirmRunningFirmware('FRB-0005', {
      firmware_version: '0.1.0+4', confirmation_sequence: 9,
    });
    const status = (await db.collection('ota_device_status').doc('FRB-0005').get()).data();
    await assert.rejects(ota.confirmRunningFirmware('FRB-0005', {
      firmware_version: '0.1.0+2', confirmation_sequence: 8, deployment_id: oldId,
    }), (error) => error.code === 'stale_confirmation');
    await ota.reportUpdateEvent(oldId, 'FRB-0005', {
      state: 'confirmed', firmware_version: '0.1.0+2',
    });
    assert.deepEqual((await db.collection('ota_assignments').doc('FRB-0005').get()).data(), latest);
    assert.deepEqual((await db.collection('ota_device_status').doc('FRB-0005').get()).data(), status);
    assert.equal((await db.collection('ota_deployments').doc(oldId).get()).data().superseded_by,
      next.assignments[0].deployment_id);
  });
  await test('pre-revision nightly assignments retain delivery authorization without weakening placement or trust checks', async () => {
    const { db, ota } = await setup();
    const body = { release_id: RELEASE, device_ids: ['FRB-0005'] };
    await db.collection('ota_device_status').doc('FRB-0005').set({ confirmed_schedule_mode: 'nightly' });
    const review = await ota.prepareAssignment(body, 'admin');
    const result = await ota.confirmAssignment(review.review_id, 'admin');
    const assignmentRef = db.collection('ota_assignments').doc('FRB-0005');
    const old = (await assignmentRef.get()).data();
    const current = review.devices[0];
    const { basis_version, ...legacy } = old;
    await assignmentRef.set({ ...legacy, basis_hash: current.legacy_basis_hash,
      not_before: new Date('2026-03-08T06:00:00Z') });
    const device = (await db.collection('devices').doc('FRB-0005').get()).data();
    assert.equal((await ota.checkForUpdate('FRB-0005', device, HARDWARE_ID)).deployment_id,
      result.assignments[0].deployment_id);
  });
  await test('discovery re-reads the latest target atomically before issuing an offer and token', async () => {
    const { db, ota } = await setup();
    const body = { release_id: RELEASE, device_ids: ['FRB-0005'] };
    const first = await ota.confirmAssignment((await ota.prepareAssignment(body, 'admin')).review_id, 'admin');
    const review = await ota.prepareAssignment(body, 'admin');
    const runTransaction = db.runTransaction.bind(db);
    let replaced = false;
    let latest;
    db.runTransaction = async (callback) => {
      if (!replaced) {
        replaced = true;
        latest = await ota.confirmAssignment(review.review_id, 'admin');
      }
      return runTransaction(callback);
    };
    const device = (await db.collection('devices').doc('FRB-0005').get()).data();
    const offered = await ota.checkForUpdate('FRB-0005', device, HARDWARE_ID);
    assert.equal(replaced, true);
    assert.notEqual(offered.deployment_id, first.assignments[0].deployment_id);
    assert.equal(offered.deployment_id, latest.assignments[0].deployment_id);
    const grants = (await db.collection('ota_download_tokens').get()).docs.map((doc) => doc.data());
    assert.equal(grants.length, 1);
    assert.equal(grants[0].deployment_id, offered.deployment_id);
  });
  await test('failed discovery transaction leaves no partial old offer or download authorization', async () => {
    const { db, ota } = await setup();
    const body = { release_id: RELEASE, device_ids: ['FRB-0005'] };
    const assigned = await ota.confirmAssignment((await ota.prepareAssignment(body, 'admin')).review_id, 'admin');
    db.failNextTransactionCommit = true;
    const device = (await db.collection('devices').doc('FRB-0005').get()).data();
    await assert.rejects(ota.checkForUpdate('FRB-0005', device, HARDWARE_ID), /Simulated/);
    assert.equal((await db.collection('ota_download_tokens').get()).size, 0);
    assert.equal((await db.collection('ota_deployments').doc(assigned.assignments[0].deployment_id)
      .get()).data().offered_at, null);
    assert.equal((await db.collection('ota_assignments').doc('FRB-0005').get()).data().deployment_id,
      assigned.assignments[0].deployment_id);
  });
  console.log(`${count} fleet/governance tests passed`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
