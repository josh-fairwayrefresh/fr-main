#!/usr/bin/env node
'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { resolveSandboxEnvironment } = require('../lib/environment');

const SANDBOX_ADMIN_EMAIL = 'admin@fairwayrefresh.com';

async function main() {
  const environment = resolveSandboxEnvironment();
  initializeApp({ projectId: environment.projectId });
  const auth = getAuth();

  let user;
  try {
    user = await auth.getUserByEmail(SANDBOX_ADMIN_EMAIL);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }
    user = await auth.createUser({
      email: SANDBOX_ADMIN_EMAIL,
      emailVerified: true,
      displayName: 'Fairway Sandbox Administrator',
    });
  }

  await auth.setCustomUserClaims(user.uid, { admin: true });
  console.log(JSON.stringify({
    project_id: environment.projectId,
    sandbox_admin_email: SANDBOX_ADMIN_EMAIL,
    sandbox_admin_uid: user.uid,
    admin_claim: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Sandbox administrator configuration failed: ${error.message}`);
  process.exitCode = 1;
});
