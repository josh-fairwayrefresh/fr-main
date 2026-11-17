'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  authorize, exportFirestore, exportAuth, importRecord, rehearseImport,
} = require('../jobs.cjs');

const config = {
  sourceProject: 'synthetic-source-project',
  recoveryProject: 'synthetic-recovery-project',
  recoveryProjectNumber: '123456789',
  bucket: 'synthetic-recovery-bucket',
  allowCloudOperations: true,
};
const hash = {
  algorithm: 'SCRYPT', key: Buffer.from('synthetic-key').toString('base64'),
  saltSeparator: '', rounds: 8, memoryCost: 14,
};
const projectConfig = {
  name: `projects/${config.sourceProject}/config`,
  multiTenant: { allowTenants: true },
  signIn: { hashConfig: {
    algorithm: hash.algorithm, signerKey: hash.key, saltSeparator: hash.saltSeparator,
    rounds: hash.rounds, memoryCost: hash.memoryCost,
  } },
};
const record = {
  uid: 'recovery-synthetic-user-1', email: 'person@example.invalid',
  emailVerified: true, disabled: true, displayName: 'Synthetic',
  customClaims: { admin: false, customerId: 'synthetic-customer' },
  providerData: [{
    providerId: 'google.com', uid: 'recovery-synthetic-provider-1',
    email: 'person@example.invalid', displayName: 'Synthetic',
  }],
  passwordHash: Buffer.from('synthetic-password-hash').toString('base64'),
  passwordSalt: Buffer.from('synthetic-salt').toString('base64'),
  metadata: { creationTime: 'Mon, 16 Nov 2026 10:00:00 GMT' },
  multiFactor: { enrolledFactors: [{
    uid: 'synthetic-factor', factorId: 'phone', phoneNumber: '+12025550123',
    displayName: 'Synthetic MFA', enrollmentTime: 'Mon, 16 Nov 2026 10:00:00 GMT',
  }] },
};

function storage() {
  const objects = new Map();
  const metadata = {
    projectNumber: config.recoveryProjectNumber,
    iamConfiguration: {
      uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced',
    },
    lifecycle: { rule: [{ action: { type: 'Delete' }, condition: { age: 30 } }] },
  };
  return {
    objects, metadata,
    getMetadata: async () => [metadata],
    file: (name) => ({
      save: async (bytes, options) => {
        assert.equal(options.preconditionOpts.ifGenerationMatch, 0);
        assert.equal(options.validation, 'crc32c');
        assert(!objects.has(name));
        objects.set(name, bytes);
      },
      download: async () => [objects.get(name)],
    }),
  };
}

function firestoreFixture() {
  const name = `projects/${config.sourceProject}/databases/(default)`;
  const now = Date.parse('2026-11-16T18:14:48Z');
  const operation = { name: `${name}/operations/synthetic`, done: true };
  const db = {
    name, pointInTimeRecoveryEnablement: 'POINT_IN_TIME_RECOVERY_ENABLED',
    earliestVersionTime: { seconds: (now - 3600000) / 1000 },
  };
  const requests = [];
  return { now, operation, db, requests, firestore: {
    getDatabase: async () => [db],
    exportDocuments: async (request) => {
      requests.push(request);
      operation.promise = async () => [{ outputUriPrefix: request.outputUriPrefix }];
      return [operation];
    },
  } };
}

function authFixture(users = [record]) {
  return {
    app: { options: { projectId: config.recoveryProject } },
    tenantManager: () => ({ listTenants: async () => ({ tenants: [] }) }),
    listUsers: async () => ({ users: users.map((user) => ({ toJSON: () => user })) }),
  };
}

test('Firebase Auth without multitenancy uses authoritative config and verifies hash correspondence', async () => {
  const auth = authFixture();
  auth.tenantManager = () => { throw new Error('Unsupported tenant endpoint must not be used'); };
  const native = { ...projectConfig, multiTenant: {} };
  await exportAuth(config, { bucket: storage(), auth, projectConfig: native }, hash);
  await assert.rejects(exportAuth(config, { bucket: storage(), auth, projectConfig: native },
    { ...hash, key: Buffer.from('wrong-key').toString('base64') }));
  await assert.rejects(exportAuth(config, { bucket: storage(), auth }, hash));
});

test('native numeric project identity requires an explicitly matching source number', async () => {
  const native = { ...projectConfig, name: 'projects/123456789/config' };
  await exportAuth({ ...config, sourceProjectNumber: '123456789' },
    { bucket: storage(), auth: authFixture(), projectConfig: native }, hash);
  await assert.rejects(exportAuth({ ...config, sourceProjectNumber: '987654321' },
    { bucket: storage(), auth: authFixture(), projectConfig: native }, hash),
  /RECOVERY_SOURCE_IDENTITY_MISMATCH/);
});

test('Firebase URL-safe unpadded credential encoding preserves exact bytes', () => {
  const bytes = Buffer.from([251, 255, 254, 1]);
  const restored = importRecord({ uid: 'synthetic', passwordHash: bytes.toString('base64url'),
    passwordSalt: bytes.toString('base64url') });
  assert.deepEqual(restored.passwordHash, bytes);
  assert.deepEqual(restored.passwordSalt, bytes);
  assert.throws(() => importRecord({ uid: 'synthetic', passwordHash: 'A' }));
  assert.throws(() => importRecord({ uid: 'synthetic', passwordHash: 'Zm9v===' }));
});

test('lookup verification accepts absent hashes but export/import still requires password material', () => {
  const lookup = { uid: 'synthetic', providerData: [{ providerId: 'password', uid: 'synthetic' }] };
  assert.throws(() => importRecord(lookup));
  assert.equal(importRecord(lookup, { requirePasswordHash: false }).uid, lookup.uid);
});

test('verify-existing checks exact UID membership without reimporting identities', async () => {
  let imports = 0;
  const auth = {
    app: { options: { projectId: config.recoveryProject } },
    listUsers: async () => ({ users: [{ uid: record.uid }] }),
    importUsers: async () => { imports++; throw new Error('Must never import'); },
    getUser: async () => ({ toJSON: () => ({ ...record, passwordHash: undefined, passwordSalt: undefined }) }),
  };
  const settings = { ...config, destinationProject: config.recoveryProject,
    authorizeImportRehearsal: true, identityClass: 'synthetic', verifyExistingOnly: true };
  await rehearseImport(settings, { auth, access: {} }, [record], {}, hash);
  assert.equal(imports, 0);
  auth.listUsers = async () => ({ users: [{ uid: 'unexpected' }] });
  await assert.rejects(rehearseImport(settings, { auth, access: {} }, [record], {}, hash));
});

test('all cloud operations disabled by default; separate production authorizations', () => {
  assert.throws(() => authorize({ ...config, allowCloudOperations: undefined }, 'auth'));
  const production = { ...config, sourceProject: 'savvy-kit-496703-r5' };
  assert.throws(() => authorize(production, 'auth'));
  assert.throws(() => authorize({ ...production, authorizeProductionFirestoreExport: true }, 'auth'));
  authorize({ ...production, authorizeProductionAuthExport: true }, 'auth');
  assert.throws(() => authorize(production, 'firestore'));
  authorize({ ...production, authorizeProductionFirestoreExport: true }, 'firestore');
});

test('reject production, acceptance sandbox and same-project destinations', () => {
  for (const recoveryProject of ['savvy-kit-496703-r5', 'fairway-refresh-sandbox-test', config.sourceProject]) {
    assert.throws(() => authorize({ ...config, recoveryProject }, 'firestore'));
  }
});

test('managed export waits for completion; default snapshot is past whole minute', async () => {
  const fixture = firestoreFixture();
  const bucket = storage();
  assert.deepEqual(await exportFirestore(config, { bucket, firestore: fixture.firestore }, fixture.now),
    { status: 'managed_export_completed', restorationVerified: false });
  assert.equal(fixture.requests[0].snapshotTime.seconds % 60, 0);
  assert.equal(fixture.requests[0].snapshotTime.nanos, 0);
  assert.equal(bucket.objects.size, 1);
  const manifest = JSON.parse([...bucket.objects.values()][0]);
  assert.equal(manifest.snapshotTime, '2026-11-16T18:12:00Z');
  assert.equal(manifest.restorationVerified, false);
});

for (const [label, change] of [
  ['wrong bucket project', (f, b) => { b.metadata.projectNumber = '999'; }],
  ['public bucket', (f, b) => { b.metadata.iamConfiguration.publicAccessPrevention = 'inherited'; }],
  ['missing lifecycle', (f, b) => { delete b.metadata.lifecycle; }],
  ['early deletion', (f, b) => { b.metadata.lifecycle.rule.push({
    action: { type: 'Delete' }, condition: { age: 29, matchesPrefix: ['auth/'] },
  }); }],
  ['deletion without creation-age floor', (f, b) => { b.metadata.lifecycle.rule.push({
    action: { type: 'Delete' }, condition: { daysSinceNoncurrentTime: 1 },
  }); }],
  ['prefix-only thirty-day deletion', (f, b) => {
    b.metadata.lifecycle.rule[0].condition.matchesPrefix = ['firestore/'];
  }],
  ['longer-only deletion', (f, b) => { b.metadata.lifecycle.rule[0].condition.age = 31; }],
  ['retention beyond thirty days', (f, b) => {
    b.metadata.retentionPolicy = { retentionPeriod: '2678400' };
  }],
  ['locked retention', (f, b) => {
    b.metadata.retentionPolicy = { retentionPeriod: '2592000', isLocked: true };
  }],
  ['invalid retention', (f, b) => {
    b.metadata.retentionPolicy = { retentionPeriod: 'invalid' };
  }],
  ['disabled PITR', (f) => { f.db.pointInTimeRecoveryEnablement = 'DISABLED'; }],
  ['unknown earliest timestamp', (f) => { delete f.db.earliestVersionTime; }],
  ['uncompleted operation', (f) => { f.operation.done = false; }],
  ['operation error', (f) => { f.operation.error = { message: 'SECRET' }; }],
]) {
  test(`managed export fails closed: ${label}`, async () => {
    const f = firestoreFixture();
    const bucket = storage();
    change(f, bucket);
    await assert.rejects(exportFirestore(config, { bucket, firestore: f.firestore }, f.now),
      { message: 'RECOVERY_JOB_FAILED' });
    assert.equal(bucket.objects.size, 0);
  });
}

test('invalid, future and out-of-window snapshot times fail before export', async () => {
  for (const snapshotTime of ['2026-11-16T18:12:01Z', '2026-11-16T19:00:00Z',
    '2026-11-16T16:00:00Z', '2026-02-31T12:00:00Z']) {
    const f = firestoreFixture();
    await assert.rejects(exportFirestore({ ...config, snapshotTime },
      { bucket: storage(), firestore: f.firestore }, f.now));
    assert.equal(f.requests.length, 0);
  }
});

test('thirty-day global lifecycle accepts optional unlocked retention up to thirty days', async () => {
  for (const retentionPolicy of [undefined, { retentionPeriod: '86400' },
    { retentionPeriod: '2592000', isLocked: false }]) {
    const f = firestoreFixture();
    const bucket = storage();
    if (retentionPolicy) bucket.metadata.retentionPolicy = retentionPolicy;
    assert.equal((await exportFirestore(config, { bucket, firestore: f.firestore }, f.now)).status,
      'managed_export_completed');
  }
});

test('native managed operation rejection and unexpected output never publish completion', async () => {
  for (const promise of [
    async () => { throw new Error('SECRET'); },
    async () => [{ outputUriPrefix: 'gs://wrong/data' }],
  ]) {
    const f = firestoreFixture();
    const bucket = storage();
    f.firestore.exportDocuments = async () => [{ ...f.operation, promise }];
    await assert.rejects(exportFirestore(config, { bucket, firestore: f.firestore }, f.now),
      { message: 'RECOVERY_JOB_FAILED' });
    assert.equal(bucket.objects.size, 0);
  }
});

test('Auth pages preserve native UID, disabled, claims, providers and supported MFA with protected hash config', async () => {
  const bucket = storage();
  const auth = authFixture();
  const seen = [];
  auth.listUsers = async (size, token) => {
    seen.push([size, token]);
    return token ? { users: [] } : { users: [{ toJSON: () => record }], pageToken: 'next' };
  };
  assert.equal((await exportAuth(config, { bucket, auth, projectConfig }, hash)).status, 'auth_export_completed');
  assert.equal(seen.length, 2);
  const content = [...bucket.objects.entries()];
  assert.deepEqual(JSON.parse(content.find(([key]) => key.endsWith('users-0.json'))[1]), [record]);
  assert.deepEqual(JSON.parse(content.find(([key]) => key.endsWith('password-hash-config.json'))[1]), hash);
  const manifest = JSON.parse(content.find(([key]) => key.endsWith('completed.json'))[1]);
  assert.equal(manifest.userCount, 1);
  assert.equal(manifest.atomicSnapshot, false);
  assert(Number.isFinite(Date.parse(manifest.startedAt)));
  assert(Number.isFinite(Date.parse(manifest.completedAt)));
  assert(Date.parse(manifest.startedAt) <= Date.parse(manifest.completedAt));
});

test('Auth failures/partial pagination never produce a completion marker or leak SDK payload', async () => {
  const auth = authFixture();
  let count = 0;
  auth.listUsers = async () => {
    if (count++) throw new Error('SECRET identity payload');
    return { users: [{ toJSON: () => record }], pageToken: 'next' };
  };
  const bucket = storage();
  await assert.rejects(exportAuth(config, { bucket, auth, projectConfig }, hash), { message: 'RECOVERY_AUTH_ENUMERATION_FAILED' });
  assert(![...bucket.objects.keys()].some((key) => key.endsWith('completed.json')));
});

test('Auth rejects missing hash config, redacted passwords, tenants, TOTP and repeated page tokens', async () => {
  for (const mutation of [
    (a) => { a.tenantManager = () => ({ listTenants: async () => ({ tenants: [{}] }) }); },
    (a) => { a.listUsers = async () => ({ users: [{ toJSON: () => ({
      ...record, providerData: [{ providerId: 'password' }], passwordHash: undefined,
    }) }] }); },
    (a) => { a.listUsers = async () => ({ users: [{ toJSON: () => ({
      ...record, multiFactor: { enrolledFactors: [{ factorId: 'totp' }] },
    }) }] }); },
    (a) => { a.listUsers = async () => ({ users: [], pageToken: 'repeated' }); },
  ]) {
    const auth = authFixture();
    const bucket = storage();
    mutation(auth);
    await assert.rejects(exportAuth(config, { bucket, auth, projectConfig }, hash));
    assert(![...bucket.objects.keys()].some((key) => key.endsWith('completed.json')));
  }
  await assert.rejects(exportAuth(config, { bucket: storage(), auth: authFixture(), projectConfig }, undefined));
});

function rehearsal() {
  const userAccess = { [record.uid]: { schemaVersion: 3, customerIds: ['synthetic-customer'], disabled: true } };
  const auth = authFixture([]);
  auth.importUsers = async (users, options) => {
    assert(Buffer.isBuffer(users[0].passwordHash));
    assert(Buffer.isBuffer(options.hash.key));
    assert.deepEqual(users[0].multiFactor, record.multiFactor);
    return { successCount: users.length, failureCount: 0, errors: [] };
  };
  auth.getUser = async () => ({ toJSON: () => record });
  return {
    config: { ...config, destinationProject: config.recoveryProject,
      authorizeImportRehearsal: true, identityClass: 'synthetic' },
    adapters: { auth, access: { get: async (uid) => userAccess[uid] } },
    userAccess,
  };
}

test('synthetic controlled import preserves UID/user_access, disabled/claims/providers/MFA and decodes hashes', async () => {
  const r = rehearsal();
  assert.deepEqual(await rehearseImport(r.config, r.adapters, [record], r.userAccess, hash),
    { status: 'import_attributes_and_access_verified', loginVerified: false });
  assert.equal(importRecord(record).uid, record.uid);
});

for (const [label, mutation] of [
  ['missing authorization', (r) => { r.config.authorizeImportRehearsal = false; }],
  ['real identity missing explicit gate', (r) => { r.config.identityClass = 'real'; }],
  ['wrong actual SDK project', (r) => { r.adapters.auth.app.options.projectId = config.sourceProject; }],
  ['nonempty target', (r) => { r.adapters.auth.listUsers = async () => ({ users: [{}] }); }],
  ['partial import', (r) => { r.adapters.auth.importUsers = async () => ({
    successCount: 0, failureCount: 1, errors: [{ error: { message: 'SECRET' } }],
  }); }],
  ['SDK import error', (r) => { r.adapters.auth.importUsers = async () => { throw new Error('SECRET'); }; }],
  ['attribute mismatch', (r) => { r.adapters.auth.getUser = async () => ({
    toJSON: () => ({ ...record, disabled: false }),
  }); }],
  ['access mismatch', (r) => { r.adapters.access.get = async () => ({ admin: true }); }],
  ['orphaned access UID', (r) => { r.userAccess.orphan = {}; }],
]) {
  test(`import fails closed: ${label}`, async () => {
    const r = rehearsal();
    mutation(r);
    await assert.rejects(rehearseImport(r.config, r.adapters, [record], r.userAccess, hash),
      { message: 'RECOVERY_JOB_FAILED' });
  });
}

test('real-looking identity cannot be passed as synthetic fixture', async () => {
  const r = rehearsal();
  await assert.rejects(rehearseImport(r.config, r.adapters,
    [{ ...record, email: 'not-synthetic@example.com' }], r.userAccess, hash));
});

test('CLI fails nonzero with redacted output before loading any SDK when not authorized', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs')], {
    env: { ...process.env, RECOVERY_ACTION: 'auth', RECOVERY_CONFIG_JSON: JSON.stringify({
      ...config, sourceProject: 'savvy-kit-496703-r5', privateData: 'SECRET',
    }) }, encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), {
    event: 'recovery_failed', severity: 'ERROR', code: 'RECOVERY_JOB_FAILED', stage: 'configuration',
  });
});

test('CLI emits native-monitoring success heartbeat only after completed synthetic managed operation', () => {
  const script = `
    const Module = require('node:module');
    const original = Module._load;
    const objects = new Map();
    const bucket = {
      getMetadata: async () => [{
        projectNumber: '123456789',
        iamConfiguration: {uniformBucketLevelAccess: {enabled:true},publicAccessPrevention:'enforced'},
        lifecycle: {rule:[{action:{type:'Delete'},condition:{age:30}}]}
      }],
      file: (name) => ({
        save: async (bytes) => {objects.set(name,bytes)},
        download: async () => [objects.get(name)]
      })
    };
    Module._load = function(name, ...args) {
      if (name === '@google-cloud/storage') return {Storage: class {bucket() {return bucket}}};
      if (name === '@google-cloud/firestore') return {v1:{FirestoreAdminClient:class {
        async getDatabase({name}) {return [{name,
          pointInTimeRecoveryEnablement:'POINT_IN_TIME_RECOVERY_ENABLED',
          earliestVersionTime:{seconds:Math.floor(Date.now()/1000)-3600}}]}
        async exportDocuments(request) {return [{
          name:request.name+'/operations/synthetic',done:true,
          promise:async()=>[{outputUriPrefix:request.outputUriPrefix}]
        }]}
        async close() {}
      }}};
      return original.call(this,name,...args);
    };
    require(${JSON.stringify(path.join(__dirname, '../cli.cjs'))});
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    env: { ...process.env, FIREBASE_AUTH_EMULATOR_HOST: '', FIRESTORE_EMULATOR_HOST: '',
      RECOVERY_ACTION: 'firestore', RECOVERY_CONFIG_JSON: JSON.stringify(config) },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    event: 'recovery_succeeded', action: 'firestore',
    status: 'managed_export_completed', restorationVerified: false,
  });
  assert.equal(result.stderr, '');
});
