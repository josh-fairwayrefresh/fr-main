#!/usr/bin/env node
'use strict';

const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const USER_ACCESS_COLLECTION = 'user_access';
const LEGACY_COURSE_COLLECTIONS = [
  ['operator_course_assignments', 'courses'],
  ['inventory_course_memberships', 'courses'],
];
const BATCH_SIZE = 400;

function parseArgs(args) {
  const projectIndex = args.indexOf('--project');
  const projectId = projectIndex >= 0 ? args[projectIndex + 1] : null;
  if (!projectId || projectId.startsWith('--')) {
    throw new Error('Pass an explicit --project ID. No default project is used.');
  }
  const unknown = args.filter((arg, index) => (
    arg !== '--project' && arg !== projectId && arg !== '--apply'
  ));
  if (unknown.length) throw new Error(`Unknown arguments: ${unknown.join(', ')}`);
  return { projectId, apply: args.includes('--apply') };
}

function classifyEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return null;
  const localPart = email.slice(0, email.indexOf('@')).toLowerCase();
  return localPart.startsWith('monarch') ? 'customer_staff' : 'fairway_staff';
}

function validCoursePair(course) {
  return Boolean(
    course &&
    typeof course.customer_id === 'string' &&
    typeof course.course_id === 'string'
  );
}

async function listAllUsers(auth) {
  const users = [];
  let pageToken;
  do {
    // eslint-disable-next-line no-await-in-loop
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function main() {
  const { projectId, apply } = parseArgs(process.argv.slice(2));
  const app = initializeApp({
    credential: applicationDefault(),
    projectId,
  }, `user-access-migration-${projectId}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  try {
    const users = await listAllUsers(auth);
    const counts = {
      project_id: projectId,
      mode: apply ? 'apply' : 'dry-run',
      fairway_staff: 0,
      customer_staff: 0,
      skipped_without_email: 0,
      already_classified: 0,
      records_to_create: 0,
      records_created: 0,
      users_without_courses: 0,
      course_assignments_to_migrate: 0,
    };
    let batch = db.batch();
    let writesInBatch = 0;

    for (const user of users) {
      const userType = classifyEmail(user.email);
      if (!userType) {
        counts.skipped_without_email += 1;
        continue;
      }
      counts[userType] += 1;
      const accessRef = db.collection(USER_ACCESS_COLLECTION).doc(user.uid);
      // eslint-disable-next-line no-await-in-loop
      const existingAccess = await accessRef.get();
      if (existingAccess.exists) {
        counts.already_classified += 1;
        continue;
      }

      const coursePairs = new Map();
      for (const [collectionName, coursesField] of LEGACY_COURSE_COLLECTIONS) {
        // eslint-disable-next-line no-await-in-loop
        const legacy = await db.collection(collectionName).doc(user.uid).get();
        if (!legacy.exists || legacy.data().enabled !== true) continue;
        const legacyCourses = legacy.data()[coursesField];
        if (!Array.isArray(legacyCourses)) continue;
        for (const course of legacyCourses.filter(validCoursePair)) {
          const key = `${course.customer_id}/${course.course_id}`;
          coursePairs.set(key, {
            customer_id: course.customer_id,
            course_id: course.course_id,
            course_name: typeof course.course_name === 'string' ? course.course_name : null,
          });
        }
      }

      const courses = [];
      for (const course of coursePairs.values()) {
        let courseName = course.course_name;
        if (!courseName) {
          const courseRef = db.collection('customers').doc(course.customer_id)
            .collection('courses').doc(course.course_id);
          // eslint-disable-next-line no-await-in-loop
          const courseSnapshot = await courseRef.get();
          if (!courseSnapshot.exists) continue;
          courseName = courseSnapshot.data().course_name;
        }
        if (typeof courseName !== 'string') continue;
        courses.push({ ...course, course_name: courseName });
      }

      counts.records_to_create += 1;
      counts.course_assignments_to_migrate += courses.length;
      if (!courses.length) counts.users_without_courses += 1;
      if (apply) {
        batch.create(accessRef, {
          user_type: userType,
          enabled: true,
          courses,
          course_ids: [...new Set(courses.map((course) => course.course_id))],
          updated_at: FieldValue.serverTimestamp(),
          updated_by: 'user-access-migration-v1',
        });
        writesInBatch += 1;
        counts.records_created += 1;
        if (writesInBatch === BATCH_SIZE) {
          // eslint-disable-next-line no-await-in-loop
          await batch.commit();
          batch = db.batch();
          writesInBatch = 0;
        }
      }
    }
    if (writesInBatch) await batch.commit();
    console.log(JSON.stringify(counts, null, 2));
  } finally {
    await app.delete();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`User access migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { classifyEmail, parseArgs };
