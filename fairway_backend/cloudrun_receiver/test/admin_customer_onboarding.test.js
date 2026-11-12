'use strict';

const assert = require('assert');
const { FakeFirestore } = require('./fake_firestore');
const { createFairwayHandlers, verifyFirebaseIdToken } = require('../index');

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

const PASSWORD = 'Initial-Secret-4821';
const NEW_PASSWORD = 'Replacement-Secret-9375';

function createResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    send(payload) { this.body = payload; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function createRequest({ body, headers = {}, method = 'GET', path }) {
  return { body, method, path, get: (name) => headers[name.toLowerCase()] };
}

/*
 * Stateful Firebase Auth double. Tokens are "<uid>#<generation>"; revoking
 * refresh tokens advances the generation, and the verifier mirrors
 * verifyIdToken(token, true) by rejecting disabled or revoked identities.
 */
function createFakeAuth(initialUsers = []) {
  const users = new Map(initialUsers.map((user) => [user.uid, { disabled: false, ...user }]));
  const generations = new Map();
  const calls = [];
  const failures = {};
  let sequence = 0;
  const notFound = () => Object.assign(new Error('User not found'), { code: 'auth/user-not-found' });
  const fail = (operation) => {
    if (failures[operation]) throw Object.assign(new Error(`${operation} failed`), { code: failures[operation] });
  };
  const auth = {
    users,
    calls,
    failures,
    async getUser(uid) {
      if (!users.has(uid)) throw notFound();
      return { ...users.get(uid) };
    },
    async listUsers() {
      return { users: [...users.values()].map((user) => ({ ...user })), pageToken: undefined };
    },
    async createUser(properties) {
      calls.push(['createUser', { ...properties, password: properties.password ? '[provided]' : undefined }]);
      fail('createUser');
      if ([...users.values()].some((user) => user.email === properties.email)) {
        throw Object.assign(new Error('The email address is already in use by another account.'), {
          code: 'auth/email-already-exists',
        });
      }
      sequence += 1;
      const user = { uid: `created-${sequence}`, email: properties.email, disabled: properties.disabled === true };
      users.set(user.uid, { ...user, password: properties.password });
      return { ...user };
    },
    async updateUser(uid, properties) {
      calls.push(['updateUser', uid, Object.keys(properties).sort().join(',')]);
      fail('updateUser');
      if (!users.has(uid)) throw notFound();
      Object.assign(users.get(uid), properties);
      return { ...users.get(uid) };
    },
    async deleteUser(uid) {
      calls.push(['deleteUser', uid]);
      fail('deleteUser');
      users.delete(uid);
    },
    async revokeRefreshTokens(uid) {
      calls.push(['revokeRefreshTokens', uid]);
      fail('revokeRefreshTokens');
      generations.set(uid, (generations.get(uid) || 0) + 1);
    },
    tokenFor(uid) {
      return `${uid}#${generations.get(uid) || 0}`;
    },
    async verify(token) {
      const [uid, generation] = String(token).split('#');
      const user = users.get(uid);
      if (!user) throw notFound();
      if (user.disabled) throw Object.assign(new Error('disabled'), { code: 'auth/user-disabled' });
      if (Number(generation) < (generations.get(uid) || 0)) {
        throw Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' });
      }
      return { uid };
    },
  };
  return auth;
}

async function seedFleet(db) {
  await db.collection('customers').doc('CUST-0001').set({ customer_name: 'Monarch Bay', comments: null });
  await db.collection('customers').doc('CUST-0001').collection('courses').doc('COURSE-0001')
    .set({ course_name: 'Tony Lema', timezone: 'America/Los_Angeles', service_suspension: null, comments: null });
  await db.collection('customers').doc('CUST-0002').set({ customer_name: 'Placeholder Hills', comments: null });
  await db.collection('customers').doc('CUST-0002').collection('courses').doc('COURSE-0002')
    .set({ course_name: 'Test Links', timezone: 'America/Los_Angeles', service_suspension: null, comments: null });
  await db.collection('user_access').doc('staff-uid').set({
    schema_version: 2, admin: true, customer_id: null, course_ids: [],
  });
}

async function createHarness({ protectedSystemAdminUids = [], users = [] } = {}) {
  const db = new FakeFirestore();
  await seedFleet(db);
  const auth = createFakeAuth([
    { uid: 'staff-uid', email: 'admin@fairwayrefresh.com' },
    ...users,
  ]);
  const { fairwayAdmin } = createFairwayHandlers(db, {
    firebaseAuth: auth,
    protectedSystemAdminUids,
    verifyOperatorToken: (token) => auth.verify(token),
    fetchImpl: async () => { throw new Error('network disabled in tests'); },
  });
  const request = async ({ method = 'GET', path, body, token = auth.tokenFor('staff-uid') }) => {
    const res = createResponse();
    await fairwayAdmin(createRequest({
      method, path, body, headers: { authorization: `Bearer ${token}` },
    }), res);
    return res;
  };
  return { db, auth, request };
}

function customerUser(overrides = {}) {
  return {
    username: 'pro.shop',
    password: PASSWORD,
    admin: false,
    customer_id: 'CUST-0001',
    course_ids: ['COURSE-0001'],
    ...overrides,
  };
}

async function captureConsole(fn) {
  const lines = [];
  const originals = {};
  for (const level of ['log', 'warn', 'error', 'info']) {
    originals[level] = console[level];
    console[level] = (...args) => lines.push(args.map((arg) => (
      typeof arg === 'string' ? arg : JSON.stringify(arg, Object.getOwnPropertyNames(arg || {}))
    )).join(' '));
  }
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, originals);
  }
}

test('revocation-checked Firebase verification is the single operator token authority', async () => {
  const authPath = require.resolve('firebase-admin/auth');
  const appPath = require.resolve('firebase-admin/app');
  const saved = { auth: require.cache[authPath], app: require.cache[appPath] };
  const verifications = [];
  require.cache[appPath] = { id: appPath, filename: appPath, loaded: true,
    exports: { getApps: () => [{}], initializeApp: () => assert.fail('already initialized') } };
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true,
    exports: { getAuth: () => ({ verifyIdToken: async (token, checkRevoked) => {
      verifications.push(checkRevoked);
      return { uid: token };
    } }) } };
  try {
    assert.deepStrictEqual(await verifyFirebaseIdToken('operator-uid'), { uid: 'operator-uid' });
    assert.deepStrictEqual(verifications, [true]);
  } finally {
    if (saved.auth) require.cache[authPath] = saved.auth; else delete require.cache[authPath];
    if (saved.app) require.cache[appPath] = saved.app; else delete require.cache[appPath];
  }
});

test('Admin creates a Customer user disabled-first and enables it only after its access record exists', async () => {
  const { db, auth, request } = await createHarness();
  const response = await request({ method: 'POST', path: '/api/v1/admin/users', body: customerUser() });

  assert.strictEqual(response.statusCode, 201);
  assert.strictEqual(response.body.email, 'pro.shop@fairwayrefresh.com');
  assert.strictEqual(response.body.disabled, false);
  assert.deepStrictEqual(response.body.authorization.course_ids, ['COURSE-0001']);
  assert.ok(!JSON.stringify(response.body).includes(PASSWORD));
  assert.deepStrictEqual(auth.calls, [
    ['createUser', { email: 'pro.shop@fairwayrefresh.com', password: '[provided]', disabled: true }],
    ['updateUser', response.body.uid, 'disabled'],
  ]);
  const stored = (await db.collection('user_access').doc(response.body.uid).get()).data();
  assert.strictEqual(stored.schema_version, 2);
  assert.strictEqual(stored.admin, false);
  assert.strictEqual(stored.customer_id, 'CUST-0001');
  assert.deepStrictEqual(stored.course_ids, ['COURSE-0001']);
  assert.strictEqual(stored.user_type, 'customer_staff');
  assert.strictEqual(stored.updated_by, 'staff-uid');
  assert.ok(!JSON.stringify(stored).includes(PASSWORD));

  const access = await request({ path: '/api/v1/access/bootstrap', token: auth.tokenFor(response.body.uid) });
  assert.strictEqual(access.statusCode, 200);
  assert.deepStrictEqual(access.body, {
    admin: false, customer_id: 'CUST-0001', course_ids: ['COURSE-0001'], user_type: 'customer_staff',
  });
  const adminDenied = await request({ path: '/api/v1/admin/users', token: auth.tokenFor(response.body.uid) });
  assert.strictEqual(adminDenied.statusCode, 403);
});

test('Admin user creation supports all-Courses scope and global Admins while preserving the scope contract', async () => {
  const { db, request } = await createHarness();
  const allCourses = await request({ method: 'POST', path: '/api/v1/admin/users',
    body: customerUser({ username: 'gm', course_ids: [] }) });
  assert.strictEqual(allCourses.statusCode, 201);
  assert.deepStrictEqual(allCourses.body.authorization.course_ids, []);
  assert.deepStrictEqual(
    (await db.collection('user_access').doc(allCourses.body.uid).get()).data().courses.map((course) => course.course_id),
    ['COURSE-0001']
  );

  const admin = await request({ method: 'POST', path: '/api/v1/admin/users',
    body: customerUser({ username: 'ops-admin', admin: true, customer_id: null, course_ids: [] }) });
  assert.strictEqual(admin.statusCode, 201);
  assert.strictEqual(admin.body.authorization.admin, true);
  assert.strictEqual((await db.collection('user_access').doc(admin.body.uid).get()).data().user_type, 'fairway_staff');

  const scopedAdmin = await request({ method: 'POST', path: '/api/v1/admin/users',
    body: customerUser({ username: 'scoped-admin', admin: true }) });
  assert.strictEqual(scopedAdmin.statusCode, 400);
  assert.strictEqual(scopedAdmin.body.error, 'admin_scope_must_be_global');
});

test('Admin user creation rejects cross-Customer and unknown entitlements before creating an account', async () => {
  const { auth, request } = await createHarness();
  const cases = [
    [customerUser({ course_ids: ['COURSE-0002'] }), 'course_not_in_customer'],
    [customerUser({ customer_id: 'CUST-9999', course_ids: [] }), 'customer_not_found'],
    [customerUser({ customer_id: null, course_ids: [] }), 'customer_required'],
    [customerUser({ course_ids: ['COURSE-0001', 'COURSE-0001'] }), 'invalid_user_request'],
  ];
  for (const [body, error] of cases) {
    // eslint-disable-next-line no-await-in-loop
    const response = await request({ method: 'POST', path: '/api/v1/admin/users', body });
    assert.strictEqual(response.statusCode, 400, error);
    assert.strictEqual(response.body.error, error);
  }
  assert.deepStrictEqual(auth.calls, []);
});

test('Admin user creation validates the managed username and password policy without contacting Auth', async () => {
  const { auth, request } = await createHarness();
  for (const username of ['', 'Pro.Shop', 'pro shop', 'pro@shop', 'pro..shop', '.pro', 'pro-', 'a'.repeat(65), 42]) {
    // eslint-disable-next-line no-await-in-loop
    const response = await request({ method: 'POST', path: '/api/v1/admin/users', body: customerUser({ username }) });
    assert.strictEqual(response.statusCode, 400, String(username));
    assert.strictEqual(response.body.error, 'invalid_username');
  }
  const short = await request({ method: 'POST', path: '/api/v1/admin/users', body: customerUser({ password: 'short-pass' }) });
  assert.strictEqual(short.statusCode, 400);
  assert.strictEqual(short.body.error, 'password_length');
  const long = await request({ method: 'POST', path: '/api/v1/admin/users', body: customerUser({ password: 'x'.repeat(129) }) });
  assert.strictEqual(long.body.error, 'password_length');
  const extra = await request({ method: 'POST', path: '/api/v1/admin/users', body: { ...customerUser(), email: 'x@example.test' } });
  assert.strictEqual(extra.body.error, 'invalid_user_request');
  assert.deepStrictEqual(auth.calls, []);
});

test('Admin user creation reports an existing username without changing access records', async () => {
  const { db, request } = await createHarness({ users: [{ uid: 'existing-uid', email: 'pro.shop@fairwayrefresh.com' }] });
  const response = await request({ method: 'POST', path: '/api/v1/admin/users', body: customerUser() });
  assert.strictEqual(response.statusCode, 409);
  assert.strictEqual(response.body.error, 'user_already_exists');
  assert.strictEqual((await db.collection('user_access').doc('existing-uid').get()).exists, false);
});

test('Admin user creation compensates a failed access write and never logs or echoes the password', async () => {
  const { db, auth, request } = await createHarness();
  const originalCollection = db.collection.bind(db);
  db.collection = (name) => {
    const collection = originalCollection(name);
    if (name !== 'user_access') return collection;
    const originalDoc = collection.doc.bind(collection);
    collection.doc = (id) => {
      const ref = originalDoc(id);
      if (String(id).startsWith('created-')) {
        ref.set = async () => { throw Object.assign(new Error(`write rejected ${PASSWORD}`), { code: 'unavailable' }); };
      }
      return ref;
    };
    return collection;
  };

  const { result, lines } = await captureConsole(() => request({
    method: 'POST', path: '/api/v1/admin/users', body: customerUser(),
  }));
  assert.strictEqual(result.statusCode, 500);
  assert.strictEqual(result.body.error, 'user_creation_failed');
  assert.deepStrictEqual(auth.calls.map((call) => call[0]), ['createUser', 'deleteUser']);
  assert.strictEqual([...auth.users.values()].some((user) => user.email === 'pro.shop@fairwayrefresh.com'), false);
  assert.ok(lines.length > 0);
  assert.ok(lines.every((line) => !line.includes(PASSWORD)), lines.join('\n'));

  auth.calls.length = 0;
  auth.failures.deleteUser = 'auth/internal-error';
  const incomplete = await captureConsole(() => request({
    method: 'POST', path: '/api/v1/admin/users', body: customerUser(),
  }));
  assert.strictEqual(incomplete.result.statusCode, 500);
  assert.strictEqual(incomplete.result.body.error, 'user_creation_incomplete');
  assert.strictEqual(incomplete.result.body.disabled, true);
  assert.strictEqual(auth.users.get(incomplete.result.body.uid).disabled, true, 'the orphaned account stays disabled');
  assert.ok(incomplete.lines.every((line) => !line.includes(PASSWORD)));
  assert.ok(!JSON.stringify(incomplete.result.body).includes(PASSWORD));
});

test('Admin user creation leaves a disabled account when activation fails and it can be reactivated', async () => {
  const { auth, request } = await createHarness();
  auth.failures.updateUser = 'auth/internal-error';
  const { result } = await captureConsole(() => request({
    method: 'POST', path: '/api/v1/admin/users', body: customerUser(),
  }));
  assert.strictEqual(result.statusCode, 500);
  assert.strictEqual(result.body.error, 'user_activation_incomplete');
  assert.strictEqual(auth.users.get(result.body.uid).disabled, true);
  assert.strictEqual((await request({ path: '/api/v1/access/bootstrap', token: auth.tokenFor(result.body.uid) })).statusCode, 401);

  delete auth.failures.updateUser;
  const reactivated = await request({ method: 'PUT', path: `/api/v1/admin/users/${result.body.uid}/status`, body: { disabled: false } });
  assert.strictEqual(reactivated.statusCode, 200);
  assert.strictEqual((await request({ path: '/api/v1/access/bootstrap', token: auth.tokenFor(result.body.uid) })).statusCode, 200);
});

test('Admin password reset replaces the password and revokes existing sessions', async () => {
  const { auth, request } = await createHarness({
    users: [{ uid: 'customer-uid', email: 'pro.shop@fairwayrefresh.com' }, { uid: 'protected-uid', email: 'owner@fairwayrefresh.com' }],
    protectedSystemAdminUids: ['protected-uid'],
  });
  const previousToken = auth.tokenFor('customer-uid');
  const { result, lines } = await captureConsole(() => request({
    method: 'PUT', path: '/api/v1/admin/users/customer-uid/password', body: { password: NEW_PASSWORD },
  }));
  assert.strictEqual(result.statusCode, 200);
  assert.deepStrictEqual(result.body, { uid: 'customer-uid', password_reset: true, sessions_revoked: true });
  assert.strictEqual(auth.users.get('customer-uid').password, NEW_PASSWORD);
  assert.deepStrictEqual(auth.calls, [
    ['updateUser', 'customer-uid', 'password'],
    ['revokeRefreshTokens', 'customer-uid'],
  ]);
  assert.ok(lines.every((line) => !line.includes(NEW_PASSWORD)));
  assert.strictEqual((await request({ path: '/api/v1/access/bootstrap', token: previousToken })).statusCode, 401);

  const short = await request({ method: 'PUT', path: '/api/v1/admin/users/customer-uid/password', body: { password: 'tiny' } });
  assert.strictEqual(short.body.error, 'password_length');
  const self = await request({ method: 'PUT', path: '/api/v1/admin/users/staff-uid/password', body: { password: NEW_PASSWORD } });
  assert.strictEqual(self.statusCode, 409);
  assert.strictEqual(self.body.error, 'cannot_modify_own_account');
  const protectedReset = await request({ method: 'PUT', path: '/api/v1/admin/users/protected-uid/password', body: { password: NEW_PASSWORD } });
  assert.strictEqual(protectedReset.statusCode, 403);
  assert.strictEqual(protectedReset.body.error, 'protected_system_admin');
  const unknown = await captureConsole(() => request({
    method: 'PUT', path: '/api/v1/admin/users/missing-uid/password', body: { password: NEW_PASSWORD },
  }));
  assert.strictEqual(unknown.result.statusCode, 404);
});

test('deactivation preserves entitlements, denies existing sessions, and reactivation restores access', async () => {
  const { db, auth, request } = await createHarness();
  const created = await request({ method: 'POST', path: '/api/v1/admin/users', body: customerUser() });
  const uid = created.body.uid;
  const issuedToken = auth.tokenFor(uid);
  assert.strictEqual((await request({ path: '/api/v1/access/bootstrap', token: issuedToken })).statusCode, 200);
  auth.calls.length = 0;

  const deactivated = await request({ method: 'PUT', path: `/api/v1/admin/users/${uid}/status`, body: { disabled: true } });
  assert.strictEqual(deactivated.statusCode, 200);
  assert.deepStrictEqual(deactivated.body, { uid, disabled: true });
  assert.deepStrictEqual(auth.calls, [['updateUser', uid, 'disabled'], ['revokeRefreshTokens', uid]]);
  assert.strictEqual((await request({ path: '/api/v1/access/bootstrap', token: issuedToken })).statusCode, 401);
  assert.strictEqual((await request({ path: '/api/v1/inventory/bootstrap', token: issuedToken })).statusCode, 401);
  const stored = (await db.collection('user_access').doc(uid).get()).data();
  assert.deepStrictEqual(stored.course_ids, ['COURSE-0001'], 'entitlements are retained for reactivation');

  const directory = await request({ path: '/api/v1/admin/users' });
  const listed = directory.body.users.find((item) => item.uid === uid);
  assert.strictEqual(listed.disabled, true);
  assert.strictEqual(listed.status, 'PROVISIONED');

  const reactivated = await request({ method: 'PUT', path: `/api/v1/admin/users/${uid}/status`, body: { disabled: false } });
  assert.strictEqual(reactivated.statusCode, 200);
  assert.strictEqual((await request({ path: '/api/v1/access/bootstrap', token: issuedToken })).statusCode, 401,
    'revoked sessions stay revoked after reactivation');
  assert.strictEqual((await request({ path: '/api/v1/access/bootstrap', token: auth.tokenFor(uid) })).statusCode, 200);
});

test('deactivation protects self, protected system Admins, and the last active Admin', async () => {
  const { db, auth, request } = await createHarness({
    users: [{ uid: 'protected-uid', email: 'owner@fairwayrefresh.com' }, { uid: 'second-admin', email: 'second@fairwayrefresh.com' }],
    protectedSystemAdminUids: ['protected-uid'],
  });
  await db.collection('user_access').doc('protected-uid').set({ schema_version: 2, admin: true, customer_id: null, course_ids: [] });
  await db.collection('user_access').doc('second-admin').set({ schema_version: 2, admin: true, customer_id: null, course_ids: [] });

  const self = await request({ method: 'PUT', path: '/api/v1/admin/users/staff-uid/status', body: { disabled: true } });
  assert.strictEqual(self.statusCode, 409);
  assert.strictEqual(self.body.error, 'cannot_modify_own_account');
  const protectedAdmin = await request({ method: 'PUT', path: '/api/v1/admin/users/protected-uid/status', body: { disabled: true } });
  assert.strictEqual(protectedAdmin.statusCode, 403);
  assert.strictEqual(protectedAdmin.body.error, 'protected_system_admin');

  const otherAdmin = await request({ method: 'PUT', path: '/api/v1/admin/users/second-admin/status', body: { disabled: true } });
  assert.strictEqual(otherAdmin.statusCode, 200, 'an Admin may be deactivated while other active Admins remain');
  assert.strictEqual(auth.users.get('second-admin').disabled, true);
  assert.strictEqual(auth.users.get('protected-uid').disabled, false);
  const actingToken = auth.tokenFor('staff-uid');
  const bad = await request({ method: 'PUT', path: '/api/v1/admin/users/second-admin/status',
    body: { disabled: 'yes' }, token: actingToken });
  assert.strictEqual(bad.body.error, 'invalid_status_request');
  const missing = await request({ method: 'PUT', path: '/api/v1/admin/users/missing-uid/status',
    body: { disabled: true }, token: actingToken });
  assert.strictEqual(missing.statusCode, 404);
});

test('the last active Admin cannot be deactivated by another Admin', async () => {
  const { db, auth, request } = await createHarness({ users: [{ uid: 'customer-uid', email: 'pro.shop@fairwayrefresh.com' }] });
  await db.collection('user_access').doc('target-admin').set({ schema_version: 2, admin: true, customer_id: null, course_ids: [] });
  auth.users.set('target-admin', { uid: 'target-admin', email: 'target@fairwayrefresh.com', disabled: false });
  await db.collection('user_access').doc('staff-uid').set({ schema_version: 2, admin: true, customer_id: null, course_ids: [] });
  const ok = await request({ method: 'PUT', path: '/api/v1/admin/users/target-admin/status', body: { disabled: true } });
  assert.strictEqual(ok.statusCode, 200, 'the acting Admin remains active');

  const solo = await createHarness();
  await solo.db.collection('user_access').doc('target-admin').set({ schema_version: 2, admin: true, customer_id: null, course_ids: [] });
  solo.auth.users.set('target-admin', { uid: 'target-admin', email: 'target@fairwayrefresh.com', disabled: false });
  // Simulate the acting Admin's Auth account no longer being counted as active.
  const originalList = solo.auth.listUsers;
  solo.auth.listUsers = async () => {
    const page = await originalList();
    return { ...page, users: page.users.filter((user) => user.uid !== 'staff-uid') };
  };
  const blocked = await solo.request({ method: 'PUT', path: '/api/v1/admin/users/target-admin/status', body: { disabled: true } });
  assert.strictEqual(blocked.statusCode, 409);
  assert.strictEqual(blocked.body.error, 'last_admin_required');
  assert.strictEqual(solo.auth.users.get('target-admin').disabled, false);
});

test('Customer users cannot manage users', async () => {
  const { auth, request } = await createHarness({ users: [{ uid: 'customer-uid', email: 'pro.shop@fairwayrefresh.com' }] });
  const token = auth.tokenFor('customer-uid');
  for (const [method, path, body] of [
    ['POST', '/api/v1/admin/users', customerUser({ username: 'escalate' })],
    ['PUT', '/api/v1/admin/users/staff-uid/password', { password: NEW_PASSWORD }],
    ['PUT', '/api/v1/admin/users/staff-uid/status', { disabled: true }],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const response = await request({ method, path, body, token });
    assert.strictEqual(response.statusCode, 403, path);
  }
  assert.deepStrictEqual(auth.calls, []);
});

test('Course operation type is chosen at creation, propagates to the fleet, and is immutable afterwards', async () => {
  const { db, request } = await createHarness();
  const path = '/api/v1/admin/customers/CUST-0001/courses';
  const range = await request({ method: 'POST', path,
    body: { course_name: 'North Range', timezone: 'America/Los_Angeles', comments: null, operation_kind: 'driving_range' } });
  assert.strictEqual(range.statusCode, 201);
  assert.strictEqual(range.body.operation_kind, 'driving_range');
  const cart = await request({ method: 'POST', path,
    body: { course_name: 'Marina', timezone: 'America/Los_Angeles', comments: null, operation_kind: 'cart' } });
  assert.strictEqual(cart.body.operation_kind, 'cart');

  const fleet = await request({ path: '/api/v1/admin/fleet' });
  const courses = fleet.body.customers.find((customer) => customer.customer_id === 'CUST-0001').courses;
  const listedRange = courses.find((course) => course.course_id === range.body.course_id);
  assert.strictEqual(listedRange.operation_kind, 'driving_range');
  assert.ok(listedRange.service_suspension, 'Driving Range Courses start suspended');
  assert.strictEqual(courses.find((course) => course.course_id === cart.body.course_id).operation_kind, 'cart');

  const invalid = await request({ method: 'POST', path,
    body: { course_name: 'Bad', timezone: 'America/Los_Angeles', comments: null, operation_kind: 'kiosk' } });
  assert.strictEqual(invalid.statusCode, 400);
  assert.strictEqual(invalid.body.error, 'Invalid Course operation kind');

  const change = await request({ method: 'PATCH', path: `${path}/${range.body.course_id}`,
    body: { course_name: 'North Range', operation_kind: 'cart' } });
  assert.strictEqual(change.statusCode, 400);
  assert.match(change.body.error, /cannot be changed/);
  const stored = await db.collection('customers').doc('CUST-0001').collection('courses').doc(range.body.course_id).get();
  assert.strictEqual(stored.data().operation_kind, 'driving_range');
  assert.strictEqual(stored.data().course_name, 'North Range');

  const unknownCustomer = await request({ method: 'POST', path: '/api/v1/admin/customers/CUST-9999/courses',
    body: { course_name: 'Ghost', timezone: 'America/Los_Angeles', comments: null } });
  assert.strictEqual(unknownCustomer.statusCode, 404);
  const badZone = await request({ method: 'POST', path,
    body: { course_name: 'Zone', timezone: 'Pacific Time', comments: null } });
  assert.strictEqual(badZone.statusCode, 400);
  assert.match(badZone.body.error, /IANA/);

  const userCourses = await request({ method: 'POST', path: '/api/v1/admin/users',
    body: customerUser({ username: 'range.staff', course_ids: [range.body.course_id] }) });
  assert.strictEqual(userCourses.statusCode, 201, 'new Courses are immediately assignable to users');
});

run();
