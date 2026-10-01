'use strict';

const crypto = require('crypto');

const OPERATOR_ASSIGNMENTS_COLLECTION = 'operator_course_assignments';
const COURSE_SUBSCRIPTIONS_COLLECTION = 'course_push_subscriptions';

function subscriptionId(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

function isValidSubscription(subscription) {
  return Boolean(
    subscription &&
    typeof subscription === 'object' &&
    typeof subscription.endpoint === 'string' &&
    subscription.endpoint.startsWith('https://') &&
    subscription.keys &&
    typeof subscription.keys.auth === 'string' &&
    subscription.keys.auth.length > 0 &&
    typeof subscription.keys.p256dh === 'string' &&
    subscription.keys.p256dh.length > 0
  );
}

async function getOperatorAssignment(db, operatorUid) {
  const snapshot = await db.collection(OPERATOR_ASSIGNMENTS_COLLECTION).doc(operatorUid).get();
  if (!snapshot.exists || snapshot.data().enabled !== true) {
    return null;
  }

  const assignment = snapshot.data();
  const courses = Array.isArray(assignment.courses)
    ? assignment.courses.filter((course) => (
      course &&
      typeof course.customer_id === 'string' &&
      typeof course.course_id === 'string' &&
      typeof course.course_name === 'string'
    ))
    : [];

  return courses.length > 0 ? { courses } : null;
}

async function registerPushSubscription(db, operatorUid, {
  courseId,
  subscription,
  userAgent = null,
  vapidKeyVersion,
  now = new Date(),
} = {}) {
  if (!isValidSubscription(subscription)) {
    throw new Error('Invalid push subscription');
  }

  const assignment = await getOperatorAssignment(db, operatorUid);
  const course = assignment?.courses.find((candidate) => candidate.course_id === courseId);
  if (!course) {
    throw new Error('Operator is not authorized for this Course');
  }

  const id = subscriptionId(subscription.endpoint);
  const ref = db.collection(COURSE_SUBSCRIPTIONS_COLLECTION).doc(courseId)
    .collection('subscriptions').doc(id);
  const existing = await ref.get();
  const record = {
    operator_uid: operatorUid,
    customer_id: course.customer_id,
    course_id: course.course_id,
    endpoint: subscription.endpoint,
    keys: {
      auth: subscription.keys.auth,
      p256dh: subscription.keys.p256dh,
    },
    status: 'active',
    user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : null,
    vapid_key_version: vapidKeyVersion,
    created_at: existing.exists ? existing.data().created_at : now,
    updated_at: now,
    last_seen_at: now,
    last_success_at: existing.exists ? existing.data().last_success_at || null : null,
    last_failure_code: null,
  };
  await ref.set(record);

  return {
    subscription_id: id,
    course_id: course.course_id,
    status: record.status,
    last_success_at: record.last_success_at,
  };
}

module.exports = {
  COURSE_SUBSCRIPTIONS_COLLECTION,
  OPERATOR_ASSIGNMENTS_COLLECTION,
  getOperatorAssignment,
  isValidSubscription,
  registerPushSubscription,
  subscriptionId,
};