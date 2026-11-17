'use strict';

const { randomUUID, createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const PRODUCTION = 'savvy-kit-496703-r5';
const fail = () => { throw new Error('RECOVERY_CHECK_FAILED'); };
const requireCheck = (condition, code) => {
  if (!condition) {
    if (code) throw new Error(code);
    fail();
  }
};
const projectId = (value) => typeof value === 'string' && /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(value);

function isolation(config) {
  requireCheck(projectId(config.recoveryProject));
  requireCheck(config.recoveryProject !== PRODUCTION);
  requireCheck(!config.recoveryProject.startsWith('fairway-refresh-sandbox-'));
  requireCheck(/^[1-9][0-9]+$/.test(config.recoveryProjectNumber));
}

function authorize(config, action) {
  isolation(config);
  requireCheck(config.allowCloudOperations === true);
  requireCheck(projectId(config.sourceProject));
  requireCheck(config.sourceProject !== config.recoveryProject);
  requireCheck(['firestore', 'auth'].includes(action));
  if (config.sourceProject === PRODUCTION) {
    requireCheck(config[action === 'auth'
      ? 'authorizeProductionAuthExport' : 'authorizeProductionFirestoreExport'] === true);
  }
  requireCheck(typeof config.bucket === 'string' && /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(config.bucket));
}

async function checkBucket(config, bucket) {
  const [metadata] = await bucket.getMetadata();
  requireCheck(String(metadata.projectNumber) === config.recoveryProjectNumber);
  requireCheck(metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled === true);
  requireCheck(metadata.iamConfiguration?.publicAccessPrevention === 'enforced');
  const rules = metadata.lifecycle?.rule;
  requireCheck(Array.isArray(rules));
  const deletes = rules.filter((rule) => rule.action?.type === 'Delete');
  requireCheck(deletes.some((rule) => rule.condition?.age === 30
    && Object.keys(rule.condition).length === 1));
  // Every deletion rule must have a creation-age floor, including prefix/version rules.
  requireCheck(deletes.every((rule) => Number.isInteger(rule.condition?.age)
    && rule.condition.age >= 30));
  if (metadata.retentionPolicy) {
    const seconds = Number(metadata.retentionPolicy.retentionPeriod);
    requireCheck(Number.isFinite(seconds) && seconds > 0 && seconds <= 30 * 86400);
    requireCheck(metadata.retentionPolicy.isLocked !== true);
  }
}

async function immutableJSON(bucket, name, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  await bucket.file(name).save(bytes, {
    resumable: false,
    validation: 'crc32c',
    contentType: 'application/json',
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  const [stored] = await bucket.file(name).download({ validation: 'crc32c' });
  requireCheck(stored.equals(bytes));
  return { object: name, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function snapshot(value) {
  requireCheck(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:00Z$/.test(value));
  const time = Date.parse(value);
  requireCheck(Number.isFinite(time) && new Date(time).toISOString() === value.replace('Z', '.000Z'));
  return time;
}

async function exportFirestore(config, { bucket, firestore }, now = Date.now()) {
  authorize(config, 'firestore');
  await checkBucket(config, bucket);
  const snapshotTime = config.snapshotTime
    || new Date(Math.floor((now - 120000) / 60000) * 60000).toISOString().replace('.000Z', 'Z');
  const time = snapshot(snapshotTime);
  requireCheck(time < now);
  const name = `projects/${config.sourceProject}/databases/(default)`;
  const [database] = await firestore.getDatabase({ name });
  const earliest = Number(database.earliestVersionTime?.seconds) * 1000
    + Number(database.earliestVersionTime?.nanos || 0) / 1e6;
  requireCheck(database.name === name && database.pointInTimeRecoveryEnablement === 'POINT_IN_TIME_RECOVERY_ENABLED');
  requireCheck(Number.isFinite(earliest) && time >= earliest && time >= now - 7 * 86400000);
  const prefix = `firestore/${snapshotTime}/${randomUUID()}`;
  const outputUriPrefix = `gs://${config.bucket}/${prefix}/data`;
  const [operation] = await firestore.exportDocuments({
    name,
    outputUriPrefix,
    snapshotTime: { seconds: time / 1000, nanos: 0 },
  });
  requireCheck(typeof operation.name === 'string' && operation.name.startsWith(`${name}/operations/`));
  const [result] = await operation.promise();
  requireCheck(operation.done === true && !operation.error && result?.outputUriPrefix === outputUriPrefix);
  await immutableJSON(bucket, `${prefix}/completed.json`, {
    sourceDatabase: name, snapshotTime,
    operation: operation.name, outputUriPrefix, status: 'managed_export_completed',
    restorationVerified: false,
  });
  return { status: 'managed_export_completed', restorationVerified: false };
}

function base64(value, allowEmpty = false) {
  requireCheck(typeof value === 'string' && (allowEmpty || value.length > 0));
  // Firebase exports use URL-safe base64, sometimes without padding.
  requireCheck(/^[A-Za-z0-9+/_-]*={0,2}$/.test(value));
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Buffer.from(normalized, 'base64');
  requireCheck(bytes.toString('base64').replace(/=+$/, '') === normalized.replace(/=+$/, ''));
  requireCheck(!value.includes('=') || value.length % 4 === 0);
  return bytes;
}

function hashOptions(config) {
  requireCheck(config?.algorithm === 'SCRYPT');
  requireCheck(Number.isInteger(config.rounds) && config.rounds >= 1 && config.rounds <= 8);
  requireCheck(Number.isInteger(config.memoryCost) && config.memoryCost >= 1 && config.memoryCost <= 14);
  return { hash: {
    algorithm: 'SCRYPT', key: base64(config.key),
    saltSeparator: base64(config.saltSeparator, true),
    rounds: config.rounds, memoryCost: config.memoryCost,
  } };
}

function importRecord(record, { requirePasswordHash = true } = {}) {
  record = JSON.parse(JSON.stringify(record));
  requireCheck(record && typeof record.uid === 'string' && record.uid.length > 0);
  requireCheck(!record.tenantId);
  const user = {};
  for (const key of ['uid', 'email', 'emailVerified', 'displayName', 'photoURL',
    'phoneNumber', 'disabled', 'customClaims', 'providerData']) {
    if (record[key] !== undefined) user[key] = record[key];
  }
  if (record.metadata) {
    user.metadata = {};
    for (const key of ['creationTime', 'lastSignInTime']) {
      if (record.metadata[key] !== undefined) user.metadata[key] = record.metadata[key];
    }
  }
  if (record.passwordHash !== undefined) {
    user.passwordHash = base64(record.passwordHash);
    user.passwordSalt = base64(record.passwordSalt ?? '', true);
  }
  requireCheck(!requirePasswordHash
    || !record.providerData?.some((provider) => provider.providerId === 'password') || user.passwordHash);
  if (record.multiFactor) {
    requireCheck(Array.isArray(record.multiFactor.enrolledFactors));
    // Admin import supports phone factors, not export-only TOTP secrets.
    requireCheck(record.multiFactor.enrolledFactors.every((factor) => factor.factorId === 'phone'));
    user.multiFactor = record.multiFactor;
  }
  return user;
}

async function exportAuth(config, { bucket, auth, projectConfig }, hashConfig) {
  authorize(config, 'auth');
  const startedAt = new Date().toISOString();
  const options = hashOptions(hashConfig);
  requireCheck(options.hash.key.length > 0);
  await checkBucket(config, bucket);
  requireCheck(projectConfig?.name === `projects/${config.sourceProject}/config`
    || (/^[0-9]+$/.test(config.sourceProjectNumber || '')
      && projectConfig?.name === `projects/${config.sourceProjectNumber}/config`),
  'RECOVERY_SOURCE_IDENTITY_MISMATCH');
  const nativeHash = projectConfig.signIn?.hashConfig;
  requireCheck(nativeHash && nativeHash.algorithm === hashConfig.algorithm
    && nativeHash.signerKey === hashConfig.key
    && nativeHash.saltSeparator === hashConfig.saltSeparator
    && nativeHash.rounds === hashConfig.rounds && nativeHash.memoryCost === hashConfig.memoryCost,
  'RECOVERY_SOURCE_HASH_MISMATCH');
  if (projectConfig.multiTenant?.allowTenants === true) {
    const tenants = await auth.tenantManager().listTenants(1);
    requireCheck(tenants.tenants.length === 0 && !tenants.pageToken);
  }
  const prefix = `auth/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`;
  const pages = [];
  const tokens = new Set();
  const uids = new Set();
  let pageToken;
  do {
    let page;
    try {
      page = await auth.listUsers(1000, pageToken);
    } catch {
      throw new Error('RECOVERY_AUTH_ENUMERATION_FAILED');
    }
    requireCheck(Array.isArray(page.users));
    const users = page.users.map((user) => {
      const record = user.toJSON();
      importRecord(record);
      requireCheck(!uids.has(record.uid));
      uids.add(record.uid);
      return record;
    });
    pages.push(await immutableJSON(bucket, `${prefix}/users-${pages.length}.json`, users));
    pageToken = page.pageToken;
    requireCheck(!pageToken || !tokens.has(pageToken));
    if (pageToken) tokens.add(pageToken);
  } while (pageToken);
  const hash = await immutableJSON(bucket, `${prefix}/password-hash-config.json`, hashConfig);
  await immutableJSON(bucket, `${prefix}/completed.json`, {
    status: 'auth_export_completed', sourceProject: config.sourceProject,
    startedAt, completedAt: new Date().toISOString(), atomicSnapshot: false,
    userCount: uids.size, pages, hashConfiguration: hash,
    scope: 'default-project-users', restorationVerified: false,
    limitations: ['Provider/project configuration and secrets require separate custody.',
      'Auth enumeration is not an atomic snapshot; reconcile with Firestore user_access at recovery.'],
  });
  return { status: 'auth_export_completed', restorationVerified: false };
}

async function rehearseImport(config, { auth, access }, records, userAccess, hashConfig) {
  isolation(config);
  requireCheck(config.authorizeImportRehearsal === true);
  requireCheck(config.identityClass === 'synthetic' || (config.identityClass === 'real'
    && config.authorizeRealIdentityImport === true && config.allowCloudOperations === true));
  requireCheck(config.destinationProject === config.recoveryProject);
  requireCheck(auth.app?.options?.projectId === config.destinationProject);
  requireCheck(Array.isArray(records) && records.length > 0);
  if (config.identityClass === 'synthetic') {
    requireCheck(records.every((record) => record.uid?.startsWith('recovery-synthetic-')
      && (!record.email || record.email.endsWith('@example.invalid'))
      && (!record.phoneNumber || /^\+120255501[0-9]{2}$/.test(record.phoneNumber))
      && (record.providerData || []).every((provider) => provider.uid?.startsWith('recovery-synthetic-')
        && (!provider.email || provider.email.endsWith('@example.invalid')))
      && (record.multiFactor?.enrolledFactors || []).every((factor) => /^\+120255501[0-9]{2}$/.test(factor.phoneNumber))));
  }
  const users = records.map(importRecord);
  const ids = new Set(users.map((user) => user.uid));
  requireCheck(ids.size === users.length);
  requireCheck(userAccess && Object.keys(userAccess).every((uid) => ids.has(uid)));
  const options = hashOptions(hashConfig);
  const verifyOnly = config.verifyExistingOnly === true;
  const existing = await auth.listUsers(verifyOnly ? 1000 : 1);
  if (verifyOnly) {
    requireCheck(!existing.pageToken && existing.users.length === users.length
      && existing.users.every((user) => ids.has(user.uid)));
  } else {
    requireCheck(existing.users.length === 0 && !existing.pageToken);
    for (let offset = 0; offset < users.length; offset += 1000) {
      const batch = users.slice(offset, offset + 1000);
      const result = await auth.importUsers(batch, options);
      requireCheck(result.failureCount === 0 && result.successCount === batch.length && result.errors?.length === 0);
    }
  }
  for (const record of records) {
    const restored = importRecord((await auth.getUser(record.uid)).toJSON(), { requirePasswordHash: false });
    const expected = importRecord(record);
    // Passwords are intentionally not read back; this is identity/attribute verification, not login proof.
    delete restored.passwordHash;
    delete restored.passwordSalt;
    delete expected.passwordHash;
    delete expected.passwordSalt;
    requireCheck(isDeepStrictEqual(restored, expected));
    if (Object.hasOwn(userAccess, record.uid)) {
      requireCheck(isDeepStrictEqual(await access.get(record.uid), userAccess[record.uid]));
    }
  }
  return { status: 'import_attributes_and_access_verified', loginVerified: false };
}

const SAFE_CODES = new Set([
  'RECOVERY_SOURCE_IDENTITY_MISMATCH', 'RECOVERY_SOURCE_HASH_MISMATCH',
  'RECOVERY_AUTH_ENUMERATION_FAILED',
]);
const redacted = (operation) => async (...args) => {
  try { return await operation(...args); } catch (error) {
    throw new Error(SAFE_CODES.has(error.message) ? error.message : 'RECOVERY_JOB_FAILED');
  }
};

module.exports = {
  authorize, checkBucket, exportFirestore: redacted(exportFirestore),
  exportAuth: redacted(exportAuth), hashOptions,
  importRecord, rehearseImport: redacted(rehearseImport),
};
