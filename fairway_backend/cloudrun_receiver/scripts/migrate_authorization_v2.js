#!/usr/bin/env node
'use strict';

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const {
  AUTHORIZATION_SCHEMA_VERSION,
  normalizeLegacyAccessForMigration,
} = require('../lib/user_access');

const SANDBOX_PROJECT_ID = 'fairway-refresh-sandbox-260930';

function parseArgs(args) {
  const projectIndex = args.indexOf('--project');
  const projectId = projectIndex >= 0 ? args[projectIndex + 1] : null;
  if (projectId !== SANDBOX_PROJECT_ID) {
    throw new Error(`This migration is restricted to --project ${SANDBOX_PROJECT_ID}`);
  }
  const unknown = args.filter((arg, index) => (
    arg !== '--project' && arg !== projectId && arg !== '--apply'
  ));
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(', ')}`);
  return { projectId, apply: args.includes('--apply') };
}

async function main() {
  const { projectId, apply } = parseArgs(process.argv.slice(2));
  const app = initializeApp({
    credential: applicationDefault(),
    projectId,
  }, `authorization-v2-migration-${projectId}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  try {
    const accounts = new Set();
    let pageToken;
    do {
      // eslint-disable-next-line no-await-in-loop
      const page = await auth.listUsers(1000, pageToken);
      page.users.forEach((user) => accounts.add(user.uid));
      pageToken = page.pageToken;
    } while (pageToken);

    const accessSnapshot = await db.collection('user_access').get();
    const pending = [];
    for (const document of accessSnapshot.docs) {
      if (!accounts.has(document.id)) continue;
      const value = document.data();
      if (value.schema_version === AUTHORIZATION_SCHEMA_VERSION) continue;
      const legacy = normalizeLegacyAccessForMigration(value);
      if (!legacy) {
        throw new Error(`Cannot safely migrate malformed access record for UID ${document.id}`);
      }
      if (!legacy.admin) {
        const customer = await db.collection('customers').doc(legacy.customer_id).get();
        if (!customer.exists) {
          throw new Error(`Customer ${legacy.customer_id} is missing for UID ${document.id}`);
        }
        const courses = await db.collection('customers').doc(legacy.customer_id)
          .collection('courses').get();
        const courseIds = new Set(courses.docs.map((course) => course.id));
        if (legacy.course_ids.some((courseId) => !courseIds.has(courseId))) {
          throw new Error(`Course assignment is inconsistent for UID ${document.id}`);
        }
      }
      pending.push({
        uid: document.id,
        admin: legacy.admin,
        customer_id: legacy.admin ? null : legacy.customer_id,
        course_ids: legacy.admin ? [] : legacy.course_ids,
      });
    }

    if (apply) {
      const batch = db.batch();
      for (const item of pending) {
        batch.set(db.collection('user_access').doc(item.uid), {
          schema_version: AUTHORIZATION_SCHEMA_VERSION,
          admin: item.admin,
          customer_id: item.customer_id,
          course_ids: item.course_ids,
          updated_at: FieldValue.serverTimestamp(),
          updated_by: 'sandbox-authorization-v2-migration',
        }, { merge: true });
      }
      if (pending.length) await batch.commit();
    }

    console.log(JSON.stringify({
      project_id: projectId,
      mode: apply ? 'apply' : 'dry-run',
      existing_auth_users: accounts.size,
      records_to_migrate: pending.length,
      records: pending,
      unconfigured_users_remain_unconfigured: true,
    }, null, 2));
  } finally {
    await app.delete();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Authorization v2 migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
