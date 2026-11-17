#!/usr/bin/env node
'use strict';

// API: args <firestore|auth> [config-file] [hash-config-secret-file], or
// RECOVERY_ACTION, RECOVERY_CONFIG_JSON, RECOVERY_AUTH_HASH_CONFIG_FILE.
// JSON config fields/default-deny gates are illustrated in config.example.json.
// Auth secret JSON: {algorithm:"SCRYPT",key:<base64>,saltSeparator:<base64>,
// rounds:<source integer>,memoryCost:<source integer>}. Capture/custody is separate.
// Canonical runbook: docs/RECOVERY_GUIDE.md. This CLI never provisions resources.
const fs = require('node:fs/promises');
const { authorize, exportFirestore, exportAuth, hashOptions } = require('./jobs.cjs');
let stage = 'configuration';

async function main() {
  const [actionArg, configPath, hashConfigPath] = process.argv.slice(2);
  const action = actionArg || process.env.RECOVERY_ACTION;
  const config = JSON.parse(configPath ? await fs.readFile(configPath, 'utf8') : process.env.RECOVERY_CONFIG_JSON);
  authorize(config, action);
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('RECOVERY_CHECK_FAILED');
  }
  let hashConfig;
  if (action === 'auth') {
    stage = 'hash-custody';
    // Mount a separately authorized Secret Manager version; never pass the key as an argument.
    hashConfig = JSON.parse(await fs.readFile(hashConfigPath || process.env.RECOVERY_AUTH_HASH_CONFIG_FILE, 'utf8'));
    hashOptions(hashConfig);
  }
  const { Storage } = require('@google-cloud/storage');
  stage = 'storage-client';
  const bucket = new Storage({ projectId: config.recoveryProject }).bucket(config.bucket);
  let result;
  if (action === 'firestore') {
    const { v1 } = require('@google-cloud/firestore');
    const firestore = new v1.FirestoreAdminClient();
    try {
      result = await exportFirestore(config, { bucket, firestore });
    } finally {
      await firestore.close();
    }
  } else {
    stage = 'auth-client';
    const { initializeApp, applicationDefault, deleteApp } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');
    const app = initializeApp({ projectId: config.sourceProject, credential: applicationDefault() });
    try {
      stage = 'source-config-token';
      const credential = await app.options.credential.getAccessToken();
      stage = 'source-config-read';
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/admin/v2/projects/${config.sourceProject}/config`,
        { headers: { Authorization: `Bearer ${credential.access_token}` } },
      );
      if (!response.ok) throw new Error('RECOVERY_SOURCE_CONFIG_UNAVAILABLE');
      const projectConfig = await response.json();
      stage = 'auth-export';
      result = await exportAuth(config, { bucket, auth: getAuth(app), projectConfig }, hashConfig);
    } finally {
      await deleteApp(app);
    }
  }
  process.stdout.write(`${JSON.stringify({ event: 'recovery_succeeded', action, ...result })}\n`);
}

main().catch((error) => {
  // SDK error payloads can contain identity records, credentials and request bodies.
  const allowed = new Set(['RECOVERY_SOURCE_CONFIG_UNAVAILABLE',
    'RECOVERY_SOURCE_IDENTITY_MISMATCH', 'RECOVERY_SOURCE_HASH_MISMATCH',
    'RECOVERY_AUTH_ENUMERATION_FAILED']);
  const code = allowed.has(error.message) ? error.message : 'RECOVERY_JOB_FAILED';
  process.stderr.write(`${JSON.stringify({ event: 'recovery_failed', severity: 'ERROR', code, stage })}\n`);
  process.exitCode = 1;
});
