#!/usr/bin/env node
'use strict';

// Sensitive export objects remain in memory. This command never targets production Auth.
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { rehearseImport, importRecord } = require('./jobs.cjs');
let stage = 'configuration';

async function main() {
  const [project, database, prefix, authorization] = process.argv.slice(2);
  if (project !== 'fairway-refresh-recovery' || database !== 'recovery-import-20261116'
      || !/^auth\/\d{4}-\d\d-\d\d\/[a-f0-9-]+$/.test(prefix || '')
      || !['--authorize-real-import', '--verify-existing'].includes(authorization)) throw new Error('ISOLATION_REQUIRED');
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT = project;
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const headers = { Authorization: `Bearer ${token}`, 'X-Goog-User-Project': project };
  async function read(url) {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error('NATIVE_READ_FAILED');
    return Buffer.from(await response.arrayBuffer());
  }
  const storage = `https://storage.googleapis.com/storage/v1/b/${project}-exports/o/`;
  const object = async (name) => read(`${storage}${encodeURIComponent(name)}?alt=media`);
  stage = 'completion-manifest';
  const completed = JSON.parse(await object(`${prefix}/completed.json`));
  if (completed.status !== 'auth_export_completed'
      || completed.sourceProject !== 'savvy-kit-496703-r5') throw new Error('EXPORT_REQUIRED');
  async function checked(entry) {
    if (!entry.object.startsWith(`${prefix}/`)) throw new Error('OBJECT_SCOPE_MISMATCH');
    const bytes = await object(entry.object);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('HASH_MISMATCH');
    return JSON.parse(bytes);
  }
  stage = 'protected-export-verification';
  const records = (await Promise.all(completed.pages.map(checked))).flat();
  if (records.length !== completed.userCount) throw new Error('COUNT_MISMATCH');
  const hash = await checked(completed.hashConfiguration);
  stage = 'sign-in-isolation';
  const config = JSON.parse(await read(
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`));
  if (config.authorizedDomains?.length || config.signIn?.email?.enabled
      || config.signIn?.phoneNumber?.enabled || config.signIn?.anonymous?.enabled) {
    throw new Error('RECOVERY_SIGN_IN_MUST_REMAIN_DISABLED');
  }
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/${database}/documents/user_access`;
  stage = 'access-read';
  const access = JSON.parse(await read(`${base}?pageSize=1000`));
  if (access.nextPageToken) throw new Error('ACCESS_PAGINATION_REQUIRED');
  const uids = new Set(records.map((record) => record.uid));
  const related = {};
  let unmatchedAccess = 0;
  for (const document of access.documents || []) {
    const uid = document.name.split('/').at(-1);
    if (uids.has(uid)) related[uid] = document.fields;
    else unmatchedAccess++;
  }
  const app = initializeApp({ projectId: project, credential: {
    getAccessToken: async () => ({ access_token: token, expires_in: 3600 }),
  } });
  try {
    stage = 'identity-import-and-comparison';
    const nativeAuth = getAuth(app);
    const auth = { app };
    for (const method of ['listUsers', 'importUsers', 'getUser']) {
      auth[method] = async (...args) => {
        stage = method;
        try {
          const result = await nativeAuth[method](...args);
          if (method === 'getUser') {
            const expected = importRecord(records.find((record) => record.uid === args[0]));
            const actual = importRecord(result.toJSON(), { requirePasswordHash: false });
            const differingFields = [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
              .filter((key) => !['passwordHash', 'passwordSalt'].includes(key)
                && !isDeepStrictEqual(expected[key], actual[key]));
            if (differingFields.length) process.stderr.write(`${JSON.stringify({ differingFields })}\n`);
          }
          return result;
        } catch (error) {
          const codes = new Set(['auth/insufficient-permission', 'auth/invalid-credential',
            'auth/internal-error', 'auth/invalid-password-hash', 'auth/invalid-hash-key',
            'auth/invalid-hash-algorithm', 'auth/project-not-found']);
          process.stderr.write(`${JSON.stringify({
            operation: method, code: codes.has(error.code) ? error.code : 'SDK_REQUEST_FAILED',
          })}\n`);
          throw new Error('ISOLATED_SDK_REQUEST_FAILED');
        }
      };
    }
    const result = await rehearseImport({
      recoveryProject: project, recoveryProjectNumber: '883080774039',
      destinationProject: project, authorizeImportRehearsal: true,
      identityClass: 'real', authorizeRealIdentityImport: true, allowCloudOperations: true,
      verifyExistingOnly: authorization === '--verify-existing',
    }, { auth, access: { get: async (uid) => JSON.parse(await read(
      `${base}/${encodeURIComponent(uid)}`)).fields } }, records, related, hash);
    stage = 'password-material-readback';
    const recovered = await nativeAuth.listUsers(1000);
    if (recovered.pageToken || recovered.users.length !== records.length) throw new Error('COUNT_MISMATCH');
    for (const original of records) {
      const expected = importRecord(original);
      const actual = importRecord(recovered.users.find((user) => user.uid === original.uid).toJSON());
      if (!isDeepStrictEqual(expected.passwordHash, actual.passwordHash)
          || !isDeepStrictEqual(expected.passwordSalt, actual.passwordSalt)) {
        throw new Error('PASSWORD_MATERIAL_MISMATCH');
      }
    }
    process.stdout.write(`${JSON.stringify({
      ...result, recoveryProject: project, recoveryDatabase: database,
      sourceExport: prefix, usersVerified: records.length,
      uidAccessRelationshipsVerified: Object.keys(related).length,
      passwordHashAndSaltBytesVerified: true,
      existingAccessWithoutAuthIdentity: unmatchedAccess,
      signInEnabled: false, productionWrites: 0,
      verifiedAt: new Date().toISOString(),
    }, null, 2)}\n`);
  } finally {
    await deleteApp(app);
  }
}

main().catch(() => {
  process.stderr.write(`Isolated identity rehearsal failed at ${stage}; sensitive API payload suppressed.\n`);
  process.exitCode = 1;
});
