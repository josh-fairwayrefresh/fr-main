'use strict';

const { resolveSandboxEnvironment } = require('./environment');

function publicReviewConfiguration(env = process.env) {
  if (env.FAIRWAY_PUBLIC_REVIEW !== 'true') return null;
  const { projectId } = resolveSandboxEnvironment(env);
  if (!['fairway-refresh-sandbox-qr1', 'fairway-refresh-sandbox-260930'].includes(projectId)) {
    throw new Error('Public review is restricted to the authorized review projects');
  }
  const scope = JSON.parse(env.FAIRWAY_PUBLIC_REVIEW_SCOPE || 'null');
  if (!scope || !/^CUST-\d+$/.test(scope.customer_id) ||
      !Array.isArray(scope.course_ids) || !scope.course_ids.length ||
      scope.course_ids.some((id) => !/^COURSE-\d+$/.test(id)) ||
      new Set(scope.course_ids).size !== scope.course_ids.length) {
    throw new Error('Public review requires an explicit Customer/Course scope');
  }
  return { schema_version: 2, admin: false, customer_id: scope.customer_id, course_ids: scope.course_ids };
}

async function provisionPublicReviewer(db, identity, access) {
  if (identity.firebase?.sign_in_provider !== 'anonymous') return false;
  const ref = db.collection('user_access').doc(identity.uid);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const courses = await Promise.all(access.course_ids.map((id) => transaction.get(
      db.collection('customers').doc(access.customer_id).collection('courses').doc(id),
    )));
    if (courses.some((course) => !course.exists)) throw new Error('Public review Course configuration is unavailable');
    if (existing.exists) {
      const current = existing.data();
      if (current.schema_version !== 2 || current.admin !== false || current.customer_id !== access.customer_id ||
          JSON.stringify(current.course_ids) !== JSON.stringify(access.course_ids)) {
        throw new Error('Existing reviewer access does not match the configured review scope');
      }
    } else transaction.set(ref, access);
  });
  return true;
}

module.exports = { publicReviewConfiguration, provisionPublicReviewer };
