'use strict';

const assert = require('assert');
const { FakeFirestore } = require('./fake_firestore');
const { deriveCredentialVerifier } = require('../lib/fleet/credentials');
const {
  createFairwayHandlers,
  resolveProtectedSystemAdminUids,
} = require('../index');
const { resolveRuntimeEnvironment, resolveSandboxEnvironment } = require('../lib/environment');

let passed = 0;
let failed = 0;
const pending = [];
const SERVICE_SCHEDULE = Object.freeze({
  days: [0, 1, 2, 3, 4, 5, 6],
  start: '00:00',
  end: '23:59',
});

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

function createResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createRequest({ body = {}, headers = {}, method = 'GET', path } = {}) {
  return {
    body,
    method,
    path,
    get(name) {
      return headers[name.toLowerCase()] || headers[name];
    },
  };
}

function createAdminApi(db, serviceControlV2Active = false) {
  const { fairwayAdmin } = createFairwayHandlers(db, {
    serviceControlV2Active,
    verifyOperatorToken: async (token) => {
      const uid = token === 'admin-token' || token === 'staff-token'
        ? 'staff-uid'
        : token === 'customer-admin-token' ? 'customer-uid' : 'operator-uid';
      return { uid, admin: token === 'admin-token' || token === 'customer-admin-token' };
    },
  });

  return async ({ method, path, body, token = 'admin-token' }) => {
    if (token === 'admin-token' || token === 'staff-token') {
      await db.collection('user_access').doc('staff-uid').set({
        schema_version: 2,
        admin: true,
        customer_id: null,
        course_ids: [],
      });
    } else if (token === 'customer-admin-token') {
      const uid = 'customer-uid';
      await db.collection('user_access').doc(uid).set({
        schema_version: 2,
        admin: false,
        customer_id: 'CUST-0001',
        course_ids: ['COURSE-0001'],
      });
    }
    const res = createResponse();
    await fairwayAdmin(createRequest({
      method,
      path,
      body,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }), res);
    return res;
  };
}

function createAdminUserApi(
  db,
  authUsers = [],
  protectedSystemAdminUids = [],
  authOverrides = {}
) {
  const firebaseAuth = {
    getUser: async (uid) => {
      const user = authUsers.find((item) => item.uid === uid);
      if (!user) {
        const error = new Error('User not found');
        error.code = 'auth/user-not-found';
        throw error;
      }
      return user;
    },
    listUsers: async () => ({ users: authUsers, pageToken: undefined }),
    ...authOverrides,
  };
  const { fairwayAdmin } = createFairwayHandlers(db, {
    firebaseAuth,
    protectedSystemAdminUids,
    verifyOperatorToken: async (token) => ({ uid: token === 'admin-token' ? 'staff-uid' : 'customer-uid' }),
  });

  return async ({ method, path, body, token = 'admin-token' }) => {
    const res = createResponse();
    await fairwayAdmin(createRequest({
      method,
      path,
      body,
      headers: { authorization: `Bearer ${token}` },
    }), res);
    return res;
  };
}

const PRODUCTION_PROJECT_ID = 'savvy-kit-496703-r5';

test('protected Admin configuration resolves the production project mapping', () => {
  const configuration = {
    [PRODUCTION_PROJECT_ID]: ['synthetic-protected-admin-uid'],
  };
  assert.deepStrictEqual(
    resolveProtectedSystemAdminUids(PRODUCTION_PROJECT_ID, configuration),
    ['synthetic-protected-admin-uid']
  );
  assert.ok(resolveProtectedSystemAdminUids(PRODUCTION_PROJECT_ID).length > 0);
});

test('protected Admin configuration fails closed when the production project mapping is missing', () => {
  assert.throws(
    () => resolveProtectedSystemAdminUids(PRODUCTION_PROJECT_ID, {}),
    /Protected System Administrator configuration is invalid/
  );
});

test('protected Admin configuration fails closed when the production mapping is empty', () => {
  assert.throws(
    () => resolveProtectedSystemAdminUids(PRODUCTION_PROJECT_ID, {
      [PRODUCTION_PROJECT_ID]: [],
    }),
    /Protected System Administrator configuration is invalid/
  );
});

test('protected Admin configuration fails closed when malformed or keyed to another project', () => {
  assert.throws(
    () => resolveProtectedSystemAdminUids(PRODUCTION_PROJECT_ID, {
      'savvy-kit-496703-r5-typo': ['synthetic-protected-admin-uid'],
    }),
    /Protected System Administrator configuration is invalid/
  );
  assert.throws(
    () => resolveProtectedSystemAdminUids(PRODUCTION_PROJECT_ID, {
      [PRODUCTION_PROJECT_ID]: ['synthetic-protected-admin-uid', ''],
    }),
    /Protected System Administrator configuration is invalid/
  );
  assert.throws(
    () => resolveProtectedSystemAdminUids(PRODUCTION_PROJECT_ID, {
      [PRODUCTION_PROJECT_ID]: [' synthetic-protected-admin-uid '],
    }),
    /Protected System Administrator configuration is invalid/
  );
  assert.throws(
    () => resolveProtectedSystemAdminUids(PRODUCTION_PROJECT_ID, {
      [PRODUCTION_PROJECT_ID]: ['synthetic-protected-admin-uid', 'synthetic-protected-admin-uid'],
    }),
    /Protected System Administrator configuration is invalid/
  );
  assert.throws(
    () => resolveProtectedSystemAdminUids(PRODUCTION_PROJECT_ID, null),
    /Protected System Administrator configuration is invalid/
  );
});

test('an unmapped synthetic sandbox project remains usable by isolated test handlers', () => {
  assert.deepStrictEqual(
    resolveProtectedSystemAdminUids('fairway-refresh-sandbox-test', {}),
    []
  );
});

async function seedHierarchy(db) {
  await db.collection('customers').doc('CUST-0001').set({
    customer_name: 'Old Customer',
    comments: null,
  });
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001').set({
    course_name: 'Old Course',
    timezone: 'America/Los_Angeles',
    service_schedule: SERVICE_SCHEDULE,
    service_suspension: null,
    comments: null,
  });
}

test('Admin Course cutover requires the activation gate and is explicit/idempotent', async () => {
  const db = new FakeFirestore();
  await seedHierarchy(db);
  const path = '/api/v1/admin/customers/CUST-0001/courses/COURSE-0001/service-cutover';
  const disabled = await createAdminApi(db)({ method: 'POST', path, body: {} });
  assert.equal(disabled.statusCode, 503);
  assert.equal((await db.collection('customers').doc('CUST-0001')
    .collection('courses').doc('COURSE-0001').get()).data().service_schema_version, undefined);

  const request = createAdminApi(db, true);
  const cutover = await request({ method: 'POST', path, body: {} });
  assert.equal(cutover.statusCode, 200, JSON.stringify(cutover.body));
  assert.equal(cutover.body.already_initialized, false);
  assert.equal(cutover.body.service_state.status, 'ready');
  const courseRef = db.collection('customers').doc('CUST-0001')
    .collection('courses').doc('COURSE-0001');
  const migrated = (await courseRef.get()).data();
  assert.equal(migrated.service_schema_version, 2);
  assert.equal(migrated.service_schedule, undefined);
  const repeated = await request({ method: 'POST', path, body: {} });
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.body.already_initialized, true);
});

test('sandbox backend environment validation fails closed', () => {
  assert.throws(() => resolveSandboxEnvironment({}), /FAIRWAY_ENV/);
  assert.throws(() => resolveSandboxEnvironment({
    FAIRWAY_ENV: 'sandbox',
    FAIRWAY_GCP_PROJECT: 'fairway-refresh-sandbox-test',
    GOOGLE_CLOUD_PROJECT: 'savvy-kit-496703-r5',
  }), /production project/);
  assert.throws(() => resolveSandboxEnvironment({
    FAIRWAY_ENV: 'sandbox',
    FAIRWAY_GCP_PROJECT: 'fairway-refresh-sandbox-a',
    GOOGLE_CLOUD_PROJECT: 'fairway-refresh-sandbox-b',
  }), /does not match/);
  assert.deepStrictEqual(resolveSandboxEnvironment({
    FAIRWAY_ENV: 'sandbox',
    FAIRWAY_GCP_PROJECT: 'fairway-refresh-sandbox-test',
    GOOGLE_CLOUD_PROJECT: 'fairway-refresh-sandbox-test',
  }), {
    environment: 'sandbox',
    projectId: 'fairway-refresh-sandbox-test',
  });
});

test('production Admin environment and dedicated handler fail closed', async () => {
  const production = {
    FAIRWAY_ENV: 'production',
    FAIRWAY_SERVICE_MODE: 'admin',
    FAIRWAY_GCP_PROJECT: 'savvy-kit-496703-r5',
    GOOGLE_CLOUD_PROJECT: 'savvy-kit-496703-r5',
    FAIRWAY_ALLOWED_ORIGIN: 'https://savvy-kit-496703-r5.web.app,https://app.fairwayrefresh.com',
  };
  assert.strictEqual(resolveRuntimeEnvironment(production).serviceMode, 'admin');
  const receiver = {
    ...production,
    FAIRWAY_SERVICE_MODE: 'receiver',
    FAIRWAY_ALLOWED_ORIGIN: '',
  };
  assert.strictEqual(resolveRuntimeEnvironment(receiver).serviceMode, 'receiver');
  assert.deepStrictEqual(resolveRuntimeEnvironment(receiver).allowedAdminOrigins, []);
  assert.throws(() => resolveRuntimeEnvironment({
    ...receiver,
    FAIRWAY_ALLOWED_ORIGIN: production.FAIRWAY_ALLOWED_ORIGIN,
  }), /must not configure/);
  assert.throws(() => resolveRuntimeEnvironment({ ...production, FAIRWAY_ALLOWED_ORIGIN: 'https://example.com' }), /canonical production origins/);
  assert.throws(() => resolveRuntimeEnvironment({
    ...production,
    FAIRWAY_ALLOWED_ORIGIN: 'https://savvy-kit-496703-r5.web.app',
  }), /canonical production origins/);

  const { fairwayAdmin } = createFairwayHandlers(new FakeFirestore(), {
    allowedAdminOrigins: resolveRuntimeEnvironment(production).allowedAdminOrigins,
    verifyOperatorToken: async () => ({ uid: 'admin-uid', admin: true }),
  });
  const wrongOrigin = createResponse();
  await fairwayAdmin(createRequest({
    method: 'GET', path: '/api/v1/admin/fleet', headers: { origin: 'https://example.com' },
  }), wrongOrigin);
  assert.strictEqual(wrongOrigin.statusCode, 403);
  const nonAdminPath = createResponse();
  await fairwayAdmin(createRequest({ method: 'POST', path: '/api/v1/button-events' }), nonAdminPath);
  assert.strictEqual(nonAdminPath.statusCode, 404);
  for (const origin of resolveRuntimeEnvironment(production).allowedAdminOrigins) {
    const preflight = createResponse();
    await fairwayAdmin(createRequest({
      method: 'OPTIONS', path: '/api/v1/admin/fleet', headers: { origin },
    }), preflight);
    assert.strictEqual(preflight.statusCode, 204);
    assert.strictEqual(preflight.headers['Access-Control-Allow-Origin'], origin);
    assert.match(preflight.headers['Access-Control-Allow-Methods'], /PUT/);
  }
});

const ADMIN_ROUTES = [
  { method: 'GET', path: '/api/v1/admin/fleet' },
  { method: 'GET', path: '/api/v1/admin/devices/FRB-0001/health-history' },
  { method: 'POST', path: '/api/v1/admin/customers', body: { customer_name: 'Name' } },
  { method: 'PATCH', path: '/api/v1/admin/customers/CUST-0001', body: { customer_name: 'Name' } },
  { method: 'POST', path: '/api/v1/admin/customers/CUST-0001/courses', body: { course_name: 'Course', timezone: 'UTC' } },
  { method: 'PATCH', path: '/api/v1/admin/customers/CUST-0001/courses/COURSE-0001', body: { course_name: 'Course' } },
  { method: 'PATCH', path: '/api/v1/admin/customers/CUST-0001/courses/COURSE-0001/inventory-menu', body: { public_menu_slug: 'monarch-bay' } },
  { method: 'POST', path: '/api/v1/admin/devices', body: { location: null } },
  { method: 'POST', path: '/api/v1/admin/devices/FRB-0001/credential-recovery' },
  { method: 'POST', path: '/api/v1/admin/devices/FRB-0001/credential-rotations', body: { reason: 'test rotation' } },
  { method: 'GET', path: '/api/v1/admin/devices/FRB-0001/credential-rotations' },
  { method: 'GET', path: '/api/v1/admin/devices/FRB-0001/credential-rotations/123e4567-e89b-12d3-a456-426614174000' },
  { method: 'POST', path: '/api/v1/admin/devices/FRB-0001/credential-rotations/123e4567-e89b-12d3-a456-426614174000/activate', body: { confirmed: true } },
  { method: 'POST', path: '/api/v1/admin/devices/FRB-0001/credential-rotations/123e4567-e89b-12d3-a456-426614174000/cancel', body: { confirmed: true } },
  { method: 'PATCH', path: '/api/v1/admin/devices/FRB-0001/assignment', body: { location: null } },
  { method: 'PATCH', path: '/api/v1/admin/devices/FRB-0001/state', body: { state: 'maintenance' } },
  { method: 'PATCH', path: '/api/v1/admin/devices/FRB-0001/metadata', body: { comments: 'note' } },
  { method: 'POST', path: '/api/v1/admin/devices/FRB-0001/service' },
  { method: 'POST', path: '/api/v1/admin/devices/FRB-0001/commission' },
  { method: 'GET', path: '/api/v1/admin/export/device-sim' },
  { method: 'PUT', path: '/api/v1/admin/users/test-uid/access', body: { admin: false, customer_id: 'CUST-0001', course_ids: [] } },
];

test('every admin route rejects non-admin tokens before any write', async () => {
  for (const route of ADMIN_ROUTES) {
    const db = new FakeFirestore();
    await db.collection('user_access').doc('operator-uid').set({
      schema_version: 2,
      admin: false,
      customer_id: 'CUST-0001',
      course_ids: ['COURSE-0001'],
    });
    const request = createAdminApi(db);
    const before = JSON.stringify([...db._docs.entries()]);
    // eslint-disable-next-line no-await-in-loop
    const res = await request({ ...route, token: 'operator-token' });
    assert.strictEqual(res.statusCode, 403, `${route.method} ${route.path}`);
    assert.strictEqual(JSON.stringify([...db._docs.entries()]), before, `${route.path} wrote before authorization`);
  }
});

test('every admin route rejects a missing Firebase token before any write', async () => {
  for (const route of ADMIN_ROUTES) {
    const db = new FakeFirestore();
    const request = createAdminApi(db);
    // eslint-disable-next-line no-await-in-loop
    const res = await request({ ...route, token: null });
    assert.strictEqual(res.statusCode, 401, `${route.method} ${route.path}`);
    assert.strictEqual(db._docs.size, 0, `${route.path} wrote before authentication`);
  }
});

test('Firestore user class, not an Admin token claim, is the Admin authorization boundary', async () => {
  const db = new FakeFirestore();
  const request = createAdminApi(db);
  const staffRoute = await request({ method: 'GET', path: '/api/v1/admin/fleet', token: 'staff-token' });
  assert.notStrictEqual(staffRoute.statusCode, 403);
  const customerWithLegacyAdminClaim = await request({
    method: 'GET', path: '/api/v1/admin/fleet', token: 'customer-admin-token',
  });
  assert.strictEqual(customerWithLegacyAdminClaim.statusCode, 403);
});

test('credential rotation routes require Admin access and redact status and fleet responses', async () => {
  const db = new FakeFirestore();
  await db.collection('devices').doc('FRB-0091').set({
    state: 'deployed',
    credential: deriveCredentialVerifier('admin-api-test-active-credential'),
    credential_generation: 0,
  });
  const request = createAdminApi(db);
  const prepared = await request({
    method: 'POST',
    path: '/api/v1/admin/devices/FRB-0091/credential-rotations',
    body: { reason: 'Authorized test rotation' },
  });
  assert.strictEqual(prepared.statusCode, 201);
  assert.strictEqual(prepared.headers['Cache-Control'], 'no-store');
  assert.strictEqual(prepared.body.device_id, 'FRB-0091');
  assert.strictEqual(prepared.body.state, 'prepared');
  assert.strictEqual(typeof prepared.body.one_time_credential, 'string');

  const pendingStatus = await request({
    method: 'GET',
    path: '/api/v1/admin/devices/FRB-0091/credential-rotations',
  });
  assert.strictEqual(pendingStatus.statusCode, 200);
  assert.strictEqual(pendingStatus.body.operation_id, prepared.body.operation_id);
  assert.strictEqual(pendingStatus.body.plaintext_credential, undefined);

  const status = await request({
    method: 'GET',
    path: `/api/v1/admin/devices/FRB-0091/credential-rotations/${prepared.body.operation_id}`,
  });
  assert.strictEqual(status.statusCode, 200);
  assert.strictEqual(status.headers['Cache-Control'], 'no-store');
  assert.strictEqual(status.body.can_activate, true);
  assert.strictEqual(JSON.stringify(status.body).includes(prepared.body.one_time_credential), false);

  const fleet = await request({ method: 'GET', path: '/api/v1/admin/fleet' });
  assert.strictEqual(fleet.statusCode, 200);
  assert.strictEqual(JSON.stringify(fleet.body).includes(prepared.body.one_time_credential), false);

  const cancelled = await request({
    method: 'POST',
    path: `/api/v1/admin/devices/FRB-0091/credential-rotations/${prepared.body.operation_id}/cancel`,
    body: { confirmed: true },
  });
  assert.strictEqual(cancelled.statusCode, 200);
  assert.strictEqual(cancelled.body.state, 'cancelled');
  assert.strictEqual(cancelled.headers['Cache-Control'], 'no-store');
});

test('customer and Course routes allocate backend IDs, validate configuration, and synchronize Device display copies', async () => {
  const db = new FakeFirestore();
  const request = createAdminApi(db);

  const customer = await request({
    method: 'POST',
    path: '/api/v1/admin/customers',
    body: { customer_name: 'Monarch Bay GC', comments: 'pilot' },
  });
  assert.strictEqual(customer.statusCode, 201);
  assert.match(customer.body.customer_id, /^CUST-\d{4}$/);

  const invalidCourse = await request({
    method: 'POST',
    path: `/api/v1/admin/customers/${customer.body.customer_id}/courses`,
    body: { course_name: 'Bad', timezone: 'Not/A_Real_Zone' },
  });
  assert.strictEqual(invalidCourse.statusCode, 400);

  const course = await request({
    method: 'POST',
    path: `/api/v1/admin/customers/${customer.body.customer_id}/courses`,
    body: {
      course_name: 'Tony Lema Course',
      timezone: 'America/Los_Angeles',
      comments: null,
    },
  });
  assert.strictEqual(course.statusCode, 201);
  assert.match(course.body.course_id, /^COURSE-\d{4}$/);

  await db.collection('devices').doc('FRB-0099').set({
    customer_id: customer.body.customer_id,
    customer_name: 'Monarch Bay GC',
    course_id: course.body.course_id,
    course_name: 'Tony Lema Course',
  });

  const customerUpdate = await request({
    method: 'PATCH',
    path: `/api/v1/admin/customers/${customer.body.customer_id}`,
    body: { customer_name: 'Monarch Bay Golf Club' },
  });
  assert.strictEqual(customerUpdate.statusCode, 200);

  const staleCourseUpdate = await request({
    method: 'PATCH',
    path: `/api/v1/admin/customers/${customer.body.customer_id}/courses/${course.body.course_id}`,
    body: {
      course_name: 'Tony Lema',
      timezone: 'UTC',
      service_schedule: { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' },
      comments: 'winter schedule',
    },
  });
  assert.strictEqual(staleCourseUpdate.statusCode, 409);
  const courseUpdate = await request({
    method: 'PATCH',
    path: `/api/v1/admin/customers/${customer.body.customer_id}/courses/${course.body.course_id}`,
    body: { course_name: 'Tony Lema', timezone: 'UTC', comments: 'updated' },
  });
  assert.strictEqual(courseUpdate.statusCode, 200);

  const device = await db.collection('devices').doc('FRB-0099').get();
  assert.strictEqual(device.data().customer_name, 'Monarch Bay Golf Club');
  assert.strictEqual(device.data().course_name, 'Tony Lema');
});

test('retired health history route is unavailable', async () => {
  const db = new FakeFirestore();
  await db.collection('devices').doc('FRB-0001').set({ state: 'deployed' });

  const res = await createAdminApi(db)({
    method: 'GET',
    path: '/api/v1/admin/devices/FRB-0001/health-history',
  });
  assert.strictEqual(res.statusCode, 404);
});

test('fleet identity availability requires explicit authoritative provenance', async () => {
  const db = new FakeFirestore();
  await db.collection('devices').doc('FRB-0001').set({
    hardware_revision: 'Prototype 1.2',
    firmware_generation: 'LP 1.2',
    system_identity: {
      source: 'verified_provenance',
      observed_at: new Date('2026-09-12T00:00:00.000Z'),
    },
  });
  await db.collection('devices').doc('FRB-0002').set({
    hardware_revision: 'stale hardware',
    firmware_generation: 'stale firmware',
  });

  const res = await createAdminApi(db)({ method: 'GET', path: '/api/v1/admin/fleet' });
  const verified = res.body.devices.find((device) => device.device_id === 'FRB-0001');
  const unverified = res.body.devices.find((device) => device.device_id === 'FRB-0002');
  assert.strictEqual(verified.field_status.hardware_revision, 'available');
  assert.strictEqual(verified.field_status.firmware_generation, 'available');
  assert.strictEqual(verified.system_identity.source, 'verified_provenance');
  assert.strictEqual(unverified.field_status.hardware_revision, 'known_stale');
  assert.strictEqual(unverified.field_status.firmware_generation, 'known_stale');
  assert.strictEqual(unverified.system_identity, null);
});

test('device provisioning returns plaintext once and never exposes or persists a digest', async () => {
  const db = new FakeFirestore();
  await seedHierarchy(db);
  const request = createAdminApi(db);
  const provisioned = await request({
    method: 'POST',
    path: '/api/v1/admin/devices',
    body: {
      sim_iccid: '8900000000000000001',
    },
  });

  assert.strictEqual(provisioned.statusCode, 201);
  assert.strictEqual(provisioned.headers['Cache-Control'], 'no-store');
  assert.match(provisioned.body.device_id, /^FRB-\d{4}$/);
  assert.strictEqual(typeof provisioned.body.one_time_credential, 'string');
  assert.strictEqual('credential' in provisioned.body, false);
  assert.strictEqual(JSON.stringify(provisioned.body).includes('digest'), false);

  const stored = await db.collection('devices').doc(provisioned.body.device_id).get();
  assert.strictEqual(stored.data().credential.algorithm, 'sha256');
  assert.strictEqual(stored.data().customer_id, null);
  assert.strictEqual(stored.data().customer_name, null);
  assert.strictEqual(stored.data().course_id, null);
  assert.strictEqual(stored.data().location, null);
  assert.strictEqual(JSON.stringify(stored.data()).includes(provisioned.body.one_time_credential), false);

  const fleet = await request({ method: 'GET', path: '/api/v1/admin/fleet' });
  assert.strictEqual(JSON.stringify(fleet.body).includes(stored.data().credential.digest), false);
  assert.strictEqual(JSON.stringify(fleet.body).includes(provisioned.body.one_time_credential), false);

  const invalidStateOverride = await request({
    method: 'POST',
    path: '/api/v1/admin/devices',
    body: { state: 'deployed' },
  });
  assert.strictEqual(invalidStateOverride.statusCode, 400);
});

test('partial provisioning failure returns the allocated Device ID and bounded recovery details', async () => {
  const db = new FakeFirestore();
  await seedHierarchy(db);
  const brokenDb = {
    collection(name) {
      const collection = db.collection(name);
      if (name !== 'devices') {
        return collection;
      }
      return {
        doc(id) {
          const document = collection.doc(id);
          return {
            collection: (...args) => document.collection(...args),
            get: (...args) => document.get(...args),
            set: (...args) => document.set(...args),
            update: async () => {
              throw new Error('sensitive simulated credential storage failure');
            },
          };
        },
        get: (...args) => collection.get(...args),
        where: (...args) => collection.where(...args),
        limit: (...args) => collection.limit(...args),
      };
    },
    batch: (...args) => db.batch(...args),
    runTransaction: (...args) => db.runTransaction(...args),
  };

  const res = await createAdminApi(brokenDb)({
    method: 'POST',
    path: '/api/v1/admin/devices',
    body: { sim_iccid: null },
  });

  assert.strictEqual(res.statusCode, 409);
  assert.match(res.body.device_id, /^FRB-\d{4}$/);
  assert.strictEqual(res.body.stage, 'issue_credential');
  assert.strictEqual(res.body.recovery_required, true);
  assert.strictEqual(JSON.stringify(res.body).includes('sensitive simulated'), false);

  const recovery = await createAdminApi(db)({
    method: 'POST',
    path: `/api/v1/admin/devices/${res.body.device_id}/credential-recovery`,
  });
  assert.strictEqual(recovery.statusCode, 200);
  assert.strictEqual(recovery.headers['Cache-Control'], 'no-store');
  assert.strictEqual(recovery.body.device_id, res.body.device_id);
  assert.strictEqual(typeof recovery.body.one_time_credential, 'string');

  const repeatedRecovery = await createAdminApi(db)({
    method: 'POST',
    path: `/api/v1/admin/devices/${res.body.device_id}/credential-recovery`,
  });
  assert.strictEqual(repeatedRecovery.statusCode, 409);
  assert.match(repeatedRecovery.body.error, /already has a credential/i);
});

test('concurrent credential recovery returns exactly one one-time credential', async () => {
  const db = new FakeFirestore();
  await db.collection('devices').doc('FRB-0099').set({
    state: 'in_inventory',
    credential: null,
  });
  const request = createAdminApi(db);

  const responses = await Promise.all([
    request({ method: 'POST', path: '/api/v1/admin/devices/FRB-0099/credential-recovery' }),
    request({ method: 'POST', path: '/api/v1/admin/devices/FRB-0099/credential-recovery' }),
  ]);

  assert.deepStrictEqual(responses.map((response) => response.statusCode).sort(), [200, 409]);
  const success = responses.find((response) => response.statusCode === 200);
  assert.strictEqual(success.headers['Cache-Control'], 'no-store');
  assert.strictEqual(typeof success.body.one_time_credential, 'string');
});

test('inventory assignment route rejects Customer assignment', async () => {
  const db = new FakeFirestore();
  await db.collection('customers').doc('CUST-0001').set({ customer_name: 'Synthetic One' });
  await db.collection('customers').doc('CUST-0002').set({ customer_name: 'Synthetic Two' });
  await db.collection('devices').doc('FRB-0099').set({
    state: 'in_inventory',
    customer_id: null,
    customer_name: null,
  });
  const request = createAdminApi(db);

  const response = await request({
    method: 'PATCH',
    path: '/api/v1/admin/devices/FRB-0099/assignment',
    body: { customer_id: 'CUST-0001' },
  });

  assert.strictEqual(response.statusCode, 409);
  const stored = await db.collection('devices').doc('FRB-0099').get();
  assert.strictEqual(stored.data().customer_id, null);
});

test('assignment, state, metadata, service, and commission routes enforce canonical Device behavior', async () => {
  const db = new FakeFirestore();
  await seedHierarchy(db);
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0002').set({
    course_name: 'Second Course',
    timezone: 'UTC',
    service_schedule: SERVICE_SCHEDULE,
    service_suspension: null,
  });
  await db.collection('customers').doc('CUST-0002').set({ customer_name: 'Other Customer' });
  await db.collection('devices').doc('FRB-0001').set({
    state: 'in_inventory',
    customer_id: null,
    customer_name: null,
    course_id: null,
    course_name: null,
    location: null,
    credential: { algorithm: 'sha256', digest: 'never-return-this', updated_at: new Date() },
  });
  const request = createAdminApi(db);

  const inventoryAssignment = await request({
    method: 'PATCH',
    path: '/api/v1/admin/devices/FRB-0001/assignment',
    body: { customer_id: 'CUST-0001', course_id: 'COURSE-0002', location: { type: 'custom', name: 'Practice Green' } },
  });
  assert.strictEqual(inventoryAssignment.statusCode, 409);

  const missingDeployment = await request({
    method: 'PATCH',
    path: '/api/v1/admin/devices/FRB-0001/state',
    body: { state: 'deployed', customer_id: null, course_id: null, location: null },
  });
  assert.strictEqual(missingDeployment.statusCode, 400);

  const assignment = await request({
    method: 'PATCH',
    path: '/api/v1/admin/devices/FRB-0001/state',
    body: { state: 'deployed', customer_id: 'CUST-0001', course_id: 'COURSE-0002', location: { type: 'custom', name: 'Practice Green' } },
  });
  assert.strictEqual(assignment.statusCode, 200);
  assert.strictEqual(assignment.body.customer_name, 'Old Customer');
  assert.strictEqual(assignment.body.course_name, 'Second Course');
  assert.strictEqual(assignment.body.device_id, 'FRB-0001');
  assert.strictEqual(assignment.body.credential, undefined);

  const clearedDeployment = await request({
    method: 'PATCH',
    path: '/api/v1/admin/devices/FRB-0001/assignment',
    body: { course_id: null, location: null },
  });
  assert.strictEqual(clearedDeployment.statusCode, 400);

  const transfer = await request({
    method: 'PATCH',
    path: '/api/v1/admin/devices/FRB-0001/assignment',
    body: { customer_id: 'CUST-0002' },
  });
  assert.strictEqual(transfer.statusCode, 409);

  const state = await request({
    method: 'PATCH',
    path: '/api/v1/admin/devices/FRB-0001/state',
    body: { state: 'in_inventory' },
  });
  assert.strictEqual(state.statusCode, 200);
  assert.strictEqual(state.body.state, 'in_inventory');
  assert.strictEqual(state.body.customer_id, null);
  assert.strictEqual(state.body.customer_name, null);
  assert.strictEqual(state.body.course_id, null);
  assert.strictEqual(state.body.course_name, null);
  assert.strictEqual(state.body.location, null);

  const invalidState = await request({
    method: 'PATCH',
    path: '/api/v1/admin/devices/FRB-0001/state',
    body: { state: 'deleted' },
  });
  assert.strictEqual(invalidState.statusCode, 400);

  const metadata = await request({
    method: 'PATCH',
    path: '/api/v1/admin/devices/FRB-0001/metadata',
    body: {
      comments: 'serviced',
      sim_iccid: '8900000000000000002',
    },
  });
  assert.strictEqual(metadata.statusCode, 200);
  assert.strictEqual(metadata.body.comments, 'serviced');

  for (const field of ['hardware_revision', 'firmware_generation']) {
    const systemTruthMetadata = await request({
      method: 'PATCH',
      path: '/api/v1/admin/devices/FRB-0001/metadata',
      body: { [field]: 'manually changed' },
    });
    assert.strictEqual(systemTruthMetadata.statusCode, 400);
  }

  const forbiddenMetadata = await request({
    method: 'PATCH',
    path: '/api/v1/admin/devices/FRB-0001/metadata',
    body: { credential: null },
  });
  assert.strictEqual(forbiddenMetadata.statusCode, 400);

  const service = await request({ method: 'POST', path: '/api/v1/admin/devices/FRB-0001/service' });
  const commission = await request({ method: 'POST', path: '/api/v1/admin/devices/FRB-0001/commission' });
  assert.strictEqual(service.statusCode, 200);
  assert.strictEqual(commission.statusCode, 200);

  const stored = await db.collection('devices').doc('FRB-0001').get();
  assert.strictEqual(stored.data().service.last_service_by, 'staff-uid');
  assert.strictEqual(stored.data().commissioning.commissioned_by, 'staff-uid');
  assert.ok(stored.data().service.last_service_at, 'service time must be backend-owned');
  assert.ok(stored.data().commissioning.commissioned_at, 'commissioning time must be backend-owned');
  assert.strictEqual(stored.data().device_id, undefined, 'Device identity must remain document-ID only');
});

test('device-SIM CSV includes fleet mapping and excludes all credential data', async () => {
  const db = new FakeFirestore();
  await db.collection('devices').doc('FRB-0001').set({
    sim_iccid: '8900000000000000001',
    customer_id: 'CUST-0001',
    customer_name: 'Monarch Bay GC',
    course_id: 'COURSE-0001',
    course_name: 'Tony Lema Course',
    state: 'deployed',
    credential: { algorithm: 'sha256', digest: 'secret-digest', updated_at: new Date() },
  });

  const res = await createAdminApi(db)({ method: 'GET', path: '/api/v1/admin/export/device-sim' });
  assert.strictEqual(res.statusCode, 200);
  assert.match(res.headers['Content-Type'], /^text\/csv/);
  assert.match(res.body, /FRB-0001/);
  assert.match(res.body, /8900000000000000001/);
  assert.strictEqual(res.body.includes('credential'), false);
  assert.strictEqual(res.body.includes('secret-digest'), false);
});

test('CORS advertises GET, POST, PUT, and PATCH for admin browser clients', async () => {
  const db = new FakeFirestore();
  const res = createResponse();
  await createFairwayHandlers(db).fairwayButtonReceiver(createRequest({ method: 'OPTIONS', path: '/' }), res);
  assert.match(res.headers['Access-Control-Allow-Methods'], /GET/);
  assert.match(res.headers['Access-Control-Allow-Methods'], /PUT/);
  assert.match(res.headers['Access-Control-Allow-Methods'], /PATCH/);
});

test('Admin User Management reconciles provisioned, unprovisioned, malformed, and orphaned records read-only', async () => {
  const db = new FakeFirestore();
  await seedHierarchy(db);
  await db.collection('user_access').doc('staff-uid').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  await db.collection('user_access').doc('customer-uid').set({
    schema_version: 2, admin: false, customer_id: 'CUST-0001', course_ids: [],
  });
  await db.collection('user_access').doc('malformed-uid').set({
    schema_version: 1, admin: true, customer_id: null, course_ids: [],
  });
  await db.collection('user_access').doc('invalid-course-uid').set({
    schema_version: 2, admin: false, customer_id: 'CUST-0001', course_ids: ['COURSE-9999'],
  });
  await db.collection('user_access').doc('orphan-uid').set({
    schema_version: 2, admin: false, customer_id: 'CUST-0001', course_ids: [],
  });
  await db.collection('user_access').doc('orphan-malformed-uid').set({
    schema_version: 2, admin: true, customer_id: 'CUST-0001', course_ids: [],
  });
  const before = [...db._docs.entries()];
  const request = createAdminUserApi(db, [
    { uid: 'staff-uid', email: 'admin@example.test', displayName: 'Admin', disabled: false },
    { uid: 'customer-uid', email: 'customer@example.test', disabled: false },
    { uid: 'malformed-uid', email: 'malformed@example.test', disabled: false },
    { uid: 'invalid-course-uid', email: 'invalid@example.test', disabled: false },
    { uid: 'new-uid', email: 'new@example.test', displayName: '', disabled: true },
  ]);

  const response = await request({ method: 'GET', path: '/api/v1/admin/users' });
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body.complete, true);
  assert.strictEqual(response.body.next_page_token, null);
  const users = new Map(response.body.users.map((user) => [user.uid, user]));
  assert.strictEqual(users.get('staff-uid').status, 'PROVISIONED');
  assert.strictEqual(users.get('staff-uid').authorization.admin, true);
  assert.strictEqual(users.get('customer-uid').status, 'PROVISIONED');
  assert.deepStrictEqual(users.get('customer-uid').authorization.course_ids, []);
  assert.strictEqual(users.get('malformed-uid').status, 'CONFIGURATION ERROR');
  assert.strictEqual(users.get('malformed-uid').access_record_valid, false);
  assert.strictEqual(users.get('invalid-course-uid').status, 'CONFIGURATION ERROR');
  assert.strictEqual(users.get('new-uid').status, 'NOT PROVISIONED');
  assert.strictEqual(users.get('new-uid').authorization, null);
  assert.strictEqual(users.get('new-uid').disabled, true);
  assert.strictEqual(users.get('orphan-uid').status, 'ORPHANED RECORD');
  assert.strictEqual(users.get('orphan-uid').authorization.customer_id, 'CUST-0001');
  assert.strictEqual(users.get('orphan-malformed-uid').status, 'ORPHANED RECORD');
  assert.strictEqual(users.get('orphan-malformed-uid').access_record_valid, false);
  assert.deepStrictEqual([...db._docs.entries()], before);
});

test('Admin User Management enumerates every Firebase Auth page before returning success', async () => {
  const db = new FakeFirestore();
  await db.collection('user_access').doc('staff-uid').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  const authUsers = Array.from({ length: 2001 }, (_, index) => ({
    uid: index === 0 ? 'staff-uid' : `user-${index}`,
    email: `user-${index}@example.test`,
  }));
  const pageTokens = [];
  const request = createAdminUserApi(db, authUsers, [], {
    listUsers: async (maxResults, pageToken) => {
      pageTokens.push(pageToken || null);
      const offset = pageToken ? Number(pageToken) : 0;
      const users = authUsers.slice(offset, offset + maxResults);
      const nextOffset = offset + users.length;
      return {
        users,
        pageToken: nextOffset < authUsers.length ? String(nextOffset) : undefined,
      };
    },
  });

  const response = await request({ method: 'GET', path: '/api/v1/admin/users' });
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body.complete, true);
  assert.strictEqual(response.body.users.length, authUsers.length);
  assert.strictEqual(new Set(response.body.users.map((user) => user.uid)).size, authUsers.length);
  assert.deepStrictEqual(pageTokens, [null, '1000', '2000']);
});

test('Admin User Management returns an explicit failure instead of a partial directory', async () => {
  const db = new FakeFirestore();
  await db.collection('user_access').doc('staff-uid').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  const before = [...db._docs.entries()];
  const request = createAdminUserApi(db, [
    { uid: 'staff-uid', email: 'admin@example.test' },
    { uid: 'partial-uid', email: 'partial@example.test' },
  ], [], {
    listUsers: async (maxResults, pageToken) => {
      if (!pageToken) return {
        users: [{ uid: 'staff-uid', email: 'admin@example.test' }],
        pageToken: 'next-page',
      };
      throw new Error('simulated Auth page failure');
    },
  });

  const response = await request({ method: 'GET', path: '/api/v1/admin/users' });
  assert.strictEqual(response.statusCode, 503);
  assert.strictEqual(response.body.error, 'user_directory_unavailable');
  assert.strictEqual(response.body.complete, undefined);
  assert.deepStrictEqual([...db._docs.entries()], before);
});

test('Admin User Management rejects directories beyond entry and response-size limits', async () => {
  const oversizedUsersDb = new FakeFirestore();
  await oversizedUsersDb.collection('user_access').doc('staff-uid').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  const oversizedUsers = createAdminUserApi(oversizedUsersDb, [], [], {
    listUsers: async (maxResults, pageToken) => {
      const offset = pageToken ? Number(pageToken) : 0;
      const count = Math.min(maxResults, 10001 - offset);
      return {
        users: Array.from({ length: count }, (_, index) => ({
          uid: offset + index === 0 ? 'staff-uid' : `user-${offset + index}`,
        })),
        pageToken: offset + count < 10001 ? String(offset + count) : undefined,
      };
    },
  });
  const entryLimitResponse = await oversizedUsers({
    method: 'GET',
    path: '/api/v1/admin/users',
  });
  assert.strictEqual(entryLimitResponse.statusCode, 503);
  assert.strictEqual(entryLimitResponse.body.error, 'user_directory_too_large');
  assert.strictEqual(entryLimitResponse.body.complete, undefined);

  const oversizedResponseDb = new FakeFirestore();
  await oversizedResponseDb.collection('user_access').doc('staff-uid').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  const oversizedResponse = createAdminUserApi(oversizedResponseDb, [
    { uid: 'staff-uid', email: 'admin@example.test' },
    { uid: 'large-user', displayName: 'x'.repeat(8 * 1024 * 1024) },
  ]);
  const responseLimit = await oversizedResponse({
    method: 'GET',
    path: '/api/v1/admin/users',
  });
  assert.strictEqual(responseLimit.statusCode, 503);
  assert.strictEqual(responseLimit.body.error, 'user_directory_too_large');
  assert.strictEqual(responseLimit.body.complete, undefined);
});

test('Admin User Management writes strict course-scoped access with empty meaning all courses for that Customer', async () => {
  const db = new FakeFirestore();
  await seedHierarchy(db);
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0002')
    .set({ course_name: 'Second Course' });
  await db.collection('user_access').doc('staff-uid').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  const request = createAdminUserApi(db, [
    { uid: 'staff-uid', email: 'admin@example.test', disabled: false },
    { uid: 'customer-uid', email: 'customer@example.test', disabled: false },
  ]);

  const response = await request({
    method: 'PUT',
    path: '/api/v1/admin/users/customer-uid/access',
    body: { admin: false, customer_id: 'CUST-0001', course_ids: [] },
  });
  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.body.authorization.course_ids, []);
  const stored = await db.collection('user_access').doc('customer-uid').get();
  assert.strictEqual(stored.data().admin, false);
  assert.deepStrictEqual(stored.data().course_ids, []);
  assert.deepStrictEqual(stored.data().courses.map((course) => course.course_id), ['COURSE-0001', 'COURSE-0002']);

  const invalid = await request({
    method: 'PUT',
    path: '/api/v1/admin/users/customer-uid/access',
    body: { admin: false, customer_id: 'CUST-0001', course_ids: ['COURSE-9999'] },
  });
  assert.strictEqual(invalid.statusCode, 400);
  assert.strictEqual(invalid.body.error, 'course_not_in_customer');
});

test('Admin User Management cannot demote a protected system Admin', async () => {
  const db = new FakeFirestore();
  await seedHierarchy(db);
  await db.collection('user_access').doc('staff-uid').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  await db.collection('user_access').doc('protected-uid').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  const request = createAdminUserApi(db, [
    { uid: 'staff-uid', email: 'admin@example.test', disabled: false },
    { uid: 'protected-uid', email: 'protected@example.test', disabled: false },
  ], ['protected-uid']);

  const response = await request({
    method: 'PUT',
    path: '/api/v1/admin/users/protected-uid/access',
    body: { admin: false, customer_id: 'CUST-0001', course_ids: [] },
  });
  assert.strictEqual(response.statusCode, 403);
  assert.strictEqual(response.body.error, 'protected_system_admin');
  assert.strictEqual((await db.collection('user_access').doc('protected-uid').get()).data().admin, true);
});

test('Admin User Management can preserve global access for a protected system Admin', async () => {
  const db = new FakeFirestore();
  await seedHierarchy(db);
  await db.collection('user_access').doc('staff-uid').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  const request = createAdminUserApi(db, [
    { uid: 'staff-uid', email: 'admin@example.test', disabled: false },
    { uid: 'protected-uid', email: 'protected@example.test', disabled: false },
  ], ['protected-uid']);

  const response = await request({
    method: 'PUT',
    path: '/api/v1/admin/users/protected-uid/access',
    body: { admin: true, customer_id: null, course_ids: [] },
  });
  assert.strictEqual(response.statusCode, 200);
  assert.strictEqual(response.body.authorization.admin, true);
  assert.strictEqual((await db.collection('user_access').doc('protected-uid').get()).data().admin, true);
});

test('Admin User Management denies customer users and protects the last active Admin', async () => {
  const db = new FakeFirestore();
  await seedHierarchy(db);
  await db.collection('user_access').doc('staff-uid').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
  await db.collection('user_access').doc('customer-uid').set({
    schema_version: 2, admin: false, customer_id: 'CUST-0001', course_ids: [],
  });
  const request = createAdminUserApi(db, [
    { uid: 'staff-uid', email: 'admin@example.test', disabled: false },
    { uid: 'customer-uid', email: 'customer@example.test', disabled: false },
  ]);

  const denied = await request({
    method: 'GET',
    path: '/api/v1/admin/users',
    token: 'customer-token',
  });
  assert.strictEqual(denied.statusCode, 403);

  const demotion = await request({
    method: 'PUT',
    path: '/api/v1/admin/users/staff-uid/access',
    body: { admin: false, customer_id: 'CUST-0001', course_ids: [] },
  });
  assert.strictEqual(demotion.statusCode, 409);
  assert.strictEqual(demotion.body.error, 'last_admin_required');
  assert.strictEqual((await db.collection('user_access').doc('staff-uid').get()).data().admin, true);
});

run();