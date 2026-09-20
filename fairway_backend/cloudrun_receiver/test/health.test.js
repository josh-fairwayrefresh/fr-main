'use strict';

const assert = require('assert');
const { FakeFirestore } = require('./fake_firestore');
const {
  isValidHealthObservation,
  recordHealthObservation,
  computeNextHealthReportAt,
  resolveEffectiveDeviceConfig,
} = require('../lib/fleet/health');

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
  if (failed > 0) {
    process.exitCode = 1;
  }
}

const VALID_OBSERVATION = Object.freeze({
  attempts: 1,
  registration_state: 1,
  http_status: 200,
  modem_temperature_m_c: 32000,
  rsrp_dbm: -95,
  rsrq_db: -10,
  snr_db: 12,
  serving_cell_id: 123456,
  serving_band: 20,
  psm_tau_s: 11160,
  psm_active_time_s: 0,
  battery_voltage_u_v: 4000000,
  battery_soc_pct: 87,
  https_succeeded: true,
});

const MINIMAL_NULL_OBSERVATION = Object.freeze({
  attempts: 3,
  registration_state: null,
  http_status: null,
  modem_temperature_m_c: null,
  rsrp_dbm: null,
  rsrq_db: null,
  snr_db: null,
  serving_cell_id: null,
  serving_band: null,
  psm_tau_s: null,
  psm_active_time_s: null,
  battery_voltage_u_v: null,
  battery_soc_pct: null,
  https_succeeded: null,
});

// --- A. Health observation validation ---

test('valid observation accepted', () => {
  assert.strictEqual(isValidHealthObservation(VALID_OBSERVATION), true);
});

test('minimal observation with all nullable fields null accepted', () => {
  assert.strictEqual(isValidHealthObservation(MINIMAL_NULL_OBSERVATION), true);
});

// --- WP4 pre-build CHECK 3: literal firmware-constructed payload shapes ---
//
// send_health_report_request() serializes http_status/https_succeeded from
// whatever health_snapshot currently holds at the moment the body is built,
// which is BEFORE this transmission's own outcome is known (see main.c
// send_health_report_request()/send_http_request()). These fixtures are the
// exact three shapes that can actually occur, proven against the real
// validator rather than assumed.

const FIRMWARE_FIRST_ATTEMPT_OBSERVATION = Object.freeze({
  // First attempt of a health_report cycle (including boot bootstrap):
  // http_status/https_succeeded are always null here because no response to
  // *this* transmission exists yet. psm_tau_s/psm_active_time_s are null
  // because PSM may not yet have been granted this early (both share the
  // single firmware psm_valid gate).
  attempts: 1,
  registration_state: 1,
  http_status: null,
  modem_temperature_m_c: 32000,
  rsrp_dbm: -95,
  rsrq_db: -10,
  snr_db: 12,
  serving_cell_id: 123456,
  serving_band: 20,
  psm_tau_s: null,
  psm_active_time_s: null,
  battery_voltage_u_v: 4000000,
  battery_soc_pct: 87,
  https_succeeded: null,
});

const FIRMWARE_RETRY_AFTER_TRANSPORT_FAILURE_OBSERVATION = Object.freeze({
  // Retry (attempt 2) after attempt 1 failed at the transport level
  // (connect/send/recv/timeout) without ever receiving an HTTP response:
  // http_status/https_succeeded remain null, unchanged from attempt 1,
  // because send_http_request() never reaches its status-line parse.
  ...FIRMWARE_FIRST_ATTEMPT_OBSERVATION,
  attempts: 2,
});

const FIRMWARE_RETRY_AFTER_HTTP_FAILURE_OBSERVATION = Object.freeze({
  // Retry (attempt 2) after attempt 1 DID receive an HTTP response that was
  // itself unsuccessful (e.g. a 500): http_status/https_succeeded now
  // reflect that first attempt's real outcome.
  ...FIRMWARE_FIRST_ATTEMPT_OBSERVATION,
  attempts: 2,
  http_status: 500,
  https_succeeded: false,
});

test('CHECK 3: actual firmware first-attempt health_report payload is accepted', () => {
  assert.strictEqual(isValidHealthObservation(FIRMWARE_FIRST_ATTEMPT_OBSERVATION), true);
});

test('CHECK 3: actual firmware retry payload after a transport-level failure is accepted', () => {
  assert.strictEqual(isValidHealthObservation(FIRMWARE_RETRY_AFTER_TRANSPORT_FAILURE_OBSERVATION), true);
});

test('CHECK 3: actual firmware retry payload after a received HTTP failure is accepted', () => {
  assert.strictEqual(isValidHealthObservation(FIRMWARE_RETRY_AFTER_HTTP_FAILURE_OBSERVATION), true);
});

test('missing required attempts field rejected', () => {
  const { attempts, ...rest } = VALID_OBSERVATION;
  assert.strictEqual(isValidHealthObservation(rest), false);
});

test('negative attempts rejected', () => {
  assert.strictEqual(isValidHealthObservation({ ...VALID_OBSERVATION, attempts: -1 }), false);
});

test('non-integer numeric field rejected', () => {
  assert.strictEqual(isValidHealthObservation({ ...VALID_OBSERVATION, rsrp_dbm: -95.5 }), false);
});

test('non-boolean https_succeeded rejected', () => {
  assert.strictEqual(isValidHealthObservation({ ...VALID_OBSERVATION, https_succeeded: 'yes' }), false);
});

test('out-of-range battery_soc_pct rejected', () => {
  assert.strictEqual(isValidHealthObservation({ ...VALID_OBSERVATION, battery_soc_pct: 101 }), false);
});

test('out-of-range http_status rejected', () => {
  assert.strictEqual(isValidHealthObservation({ ...VALID_OBSERVATION, http_status: 999 }), false);
});

test('negative psm duration rejected', () => {
  assert.strictEqual(isValidHealthObservation({ ...VALID_OBSERVATION, psm_tau_s: -1 }), false);
});

test('unknown extra key rejected', () => {
  assert.strictEqual(isValidHealthObservation({ ...VALID_OBSERVATION, extra_field: 1 }), false);
});

test('client-supplied received_at rejected (server-owned, not client-controlled)', () => {
  assert.strictEqual(isValidHealthObservation({ ...VALID_OBSERVATION, received_at: 'fake' }), false);
});

test('missing nullable field key rejected (stable shape required)', () => {
  const { rsrp_dbm, ...rest } = VALID_OBSERVATION;
  assert.strictEqual(isValidHealthObservation(rest), false);
});

test('non-object observation rejected', () => {
  assert.strictEqual(isValidHealthObservation(null), false);
  assert.strictEqual(isValidHealthObservation(undefined), false);
  assert.strictEqual(isValidHealthObservation('x'), false);
  assert.strictEqual(isValidHealthObservation([1, 2]), false);
});

// --- B/C. Health persistence (latest_health + immutable history) ---

test('valid health_report updates latest_health and appends exactly one history observation with the same received_at', async () => {
  const db = new FakeFirestore();
  await db.collection('devices').doc('FRB-TEST').set({ state: 'deployed' });

  const receivedAt = new Date('2026-01-15T17:00:00.000Z');
  await recordHealthObservation(db, 'FRB-TEST', VALID_OBSERVATION, receivedAt);

  const deviceDoc = await db.collection('devices').doc('FRB-TEST').get();
  const latest = deviceDoc.data().latest_health;
  assert.strictEqual(latest.received_at, receivedAt);
  assert.strictEqual(latest.attempts, VALID_OBSERVATION.attempts);
  assert.strictEqual(deviceDoc.data().state, 'deployed', 'unrelated Device fields must be untouched');

  const historySnap = await db.collection('devices').doc('FRB-TEST').collection('health_history').where('attempts', '==', 1).get();
  assert.strictEqual(historySnap.size, 1);
  assert.strictEqual(historySnap.docs[0].data().received_at, receivedAt, 'latest and history must share the same receive timestamp');
});

test('repeated health reports append history rather than overwrite it', async () => {
  const db = new FakeFirestore();
  await db.collection('devices').doc('FRB-TEST').set({ state: 'deployed' });

  await recordHealthObservation(db, 'FRB-TEST', VALID_OBSERVATION, new Date('2026-01-15T09:00:00.000Z'));
  await recordHealthObservation(db, 'FRB-TEST', VALID_OBSERVATION, new Date('2026-01-15T17:00:00.000Z'));

  const historySnap = await db.collection('devices').doc('FRB-TEST').collection('health_history').where('attempts', '==', 1).get();
  assert.strictEqual(historySnap.size, 2, 'history must accumulate, not overwrite');

  const deviceDoc = await db.collection('devices').doc('FRB-TEST').get();
  assert.strictEqual(
    deviceDoc.data().latest_health.received_at.toISOString(),
    '2026-01-15T17:00:00.000Z',
    'latest_health must reflect only the most recent observation'
  );
});

test('malformed report is rejected before touching latest_health or history', async () => {
  const db = new FakeFirestore();
  await db.collection('devices').doc('FRB-TEST').set({ state: 'deployed' });

  await assert.rejects(
    recordHealthObservation(db, 'FRB-TEST', { attempts: -1 }, new Date()),
    /Invalid health observation/
  );

  const deviceDoc = await db.collection('devices').doc('FRB-TEST').get();
  assert.strictEqual(deviceDoc.data().latest_health, undefined);

  const historySnap = await db.collection('devices').doc('FRB-TEST').collection('health_history').limit(1).get();
  assert.strictEqual(historySnap.empty, true);
});

// --- Timezone / DST-aware scheduling ---

const LA = 'America/Los_Angeles';
const TIMES = ['09:00', '17:00'];

test('before 09:00 local (standard time) -> next is today 09:00', () => {
  const now = new Date('2026-01-15T16:00:00.000Z'); // 08:00 PST
  const next = computeNextHealthReportAt(now, LA, TIMES);
  assert.strictEqual(next.toISOString(), '2026-01-15T17:00:00.000Z'); // 09:00 PST = 17:00 UTC
});

test('between 09:00 and 17:00 local (standard time) -> next is today 17:00', () => {
  const now = new Date('2026-01-15T18:00:00.000Z'); // 10:00 PST
  const next = computeNextHealthReportAt(now, LA, TIMES);
  assert.strictEqual(next.toISOString(), '2026-01-16T01:00:00.000Z'); // 17:00 PST = 01:00 UTC next day
});

test('after 17:00 local (standard time) -> next is tomorrow 09:00 (next-day rollover)', () => {
  const now = new Date('2026-01-16T03:00:00.000Z'); // 19:00 PST Jan 15
  const next = computeNextHealthReportAt(now, LA, TIMES);
  assert.strictEqual(next.toISOString(), '2026-01-16T17:00:00.000Z'); // Jan 16 09:00 PST = 17:00 UTC
});

test('ordinary daylight-time date computes correct PDT (UTC-7) offset', () => {
  const now = new Date('2026-07-15T17:00:00.000Z'); // 10:00 PDT
  const next = computeNextHealthReportAt(now, LA, TIMES);
  assert.strictEqual(next.toISOString(), '2026-07-16T00:00:00.000Z'); // 17:00 PDT = 00:00 UTC next day
});

test('spring-forward transition (2026-03-08): correct post-transition PDT offset used', () => {
  const now = new Date('2026-03-09T12:00:00.000Z'); // 04:00 PDT Mar 9 (after the Mar 8 spring-forward)
  const next = computeNextHealthReportAt(now, LA, TIMES);
  assert.strictEqual(next.toISOString(), '2026-03-09T16:00:00.000Z'); // 09:00 PDT = 16:00 UTC
});

test('fall-back transition (2026-11-01): correct post-transition PST offset used', () => {
  const now = new Date('2026-11-02T12:00:00.000Z'); // 04:00 PST Nov 2 (after the Nov 1 fall-back)
  const next = computeNextHealthReportAt(now, LA, TIMES);
  assert.strictEqual(next.toISOString(), '2026-11-02T17:00:00.000Z'); // 09:00 PST = 17:00 UTC
});

test('exact schedule boundary is treated as already reached, not returned as next', () => {
  const now = new Date('2026-01-15T17:00:00.000Z'); // exactly 09:00 PST
  const next = computeNextHealthReportAt(now, LA, TIMES);
  assert.strictEqual(next.toISOString(), '2026-01-16T01:00:00.000Z'); // must be today's 17:00, not the instant equal to now
});

// --- D. Effective configuration resolution ---

async function seedAssignedDevice(db) {
  await db.collection('customers').doc('CUST-0001').set({ customer_name: 'Monarch Bay GC' });
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001').set({
    course_name: 'Tony Lema Course',
    timezone: LA,
    health_report_schedule: { times: TIMES },
  });
  await db.collection('devices').doc('FRB-0001').set({
    state: 'deployed',
    customer_id: 'CUST-0001',
    course_id: 'COURSE-0001',
  });
}

test('effective config resolves the assigned Course timezone/schedule and computes next_health_report_at', async () => {
  const db = new FakeFirestore();
  await seedAssignedDevice(db);

  const config = await resolveEffectiveDeviceConfig(db, 'FRB-0001', new Date('2026-01-15T16:00:00.000Z'));
  assert.strictEqual(config.timezone, LA);
  assert.deepStrictEqual(config.health_report_schedule, { times: TIMES });
  assert.strictEqual(config.next_health_report_at, '2026-01-15T17:00:00.000Z');
});

test('reassignment to a different Course changes subsequent config resolution', async () => {
  const db = new FakeFirestore();
  await seedAssignedDevice(db);
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0002').set({
    course_name: 'Second Course',
    timezone: 'America/New_York',
    health_report_schedule: { times: ['06:00'] },
  });

  await db.collection('devices').doc('FRB-0001').set({ course_id: 'COURSE-0002' }, { merge: true });

  const config = await resolveEffectiveDeviceConfig(db, 'FRB-0001', new Date('2026-01-15T00:00:00.000Z'));
  assert.strictEqual(config.timezone, 'America/New_York');
});

test('cross-Customer hierarchy inconsistency resolves to null rather than a wrong Course', async () => {
  const db = new FakeFirestore();
  await seedAssignedDevice(db);
  // Device claims a Course ID that only exists under a different Customer.
  await db.collection('customers').doc('CUST-0002').set({ customer_name: 'Other Customer' });
  await db.collection('customers').doc('CUST-0002').collection('courses').doc('COURSE-0099').set({
    course_name: 'Foreign Course',
    timezone: LA,
    health_report_schedule: { times: TIMES },
  });
  await db.collection('devices').doc('FRB-0001').set({ course_id: 'COURSE-0099' }, { merge: true });

  const config = await resolveEffectiveDeviceConfig(db, 'FRB-0001', new Date());
  assert.strictEqual(config, null);
});

test('unassigned Device resolves to null effective config', async () => {
  const db = new FakeFirestore();
  await db.collection('devices').doc('FRB-0002').set({ state: 'in_inventory' });

  const config = await resolveEffectiveDeviceConfig(db, 'FRB-0002', new Date());
  assert.strictEqual(config, null);
});

test('unknown Device resolves to null effective config', async () => {
  const db = new FakeFirestore();
  const config = await resolveEffectiveDeviceConfig(db, 'FRB-9999', new Date());
  assert.strictEqual(config, null);
});

run();
