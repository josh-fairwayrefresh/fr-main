'use strict';

const crypto = require('crypto');
const {
  USER_ACCESS_COLLECTION,
  getUserAccess,
} = require('./user_access');

const COURSE_SUBSCRIPTIONS_COLLECTION = 'course_push_subscriptions';
const NOTIFICATION_PREFERENCES_COLLECTION = 'user_notification_preferences';

async function listAllCourses(db) {
  const customers = await db.collection('customers').get();
  const courseSnapshots = await Promise.all(customers.docs.map((customer) => (
    db.collection('customers').doc(customer.id).collection('courses').get()
  )));
  return courseSnapshots.flatMap((snapshot, index) => snapshot.docs.map((course) => ({
    ...course.data(),
    customer_id: customers.docs[index].id,
    course_id: course.id,
    customer_name: customers.docs[index].data().customer_name || customers.docs[index].id,
  }))).filter((course) => (
    typeof course.course_name === 'string'
  ));
}

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
  const access = await getUserAccess(db, operatorUid);
  if (!access) return null;

  const courses = access.user_type === 'fairway_staff'
    ? await listAllCourses(db)
    : access.courses;
  return courses.length > 0 ? { ...access, courses } : null;
}

async function getNotificationPreferences(db, operatorUid, courses) {
  const preferences = await Promise.all(courses.map(async (course) => {
    const preferenceRef = db.collection(NOTIFICATION_PREFERENCES_COLLECTION)
      .doc(operatorUid).collection('courses').doc(course.course_id);
    const preference = await preferenceRef.get();
    if (preference.exists) {
      return [course.course_id, preference.data().enabled === true];
    }

    const activeSubscription = await db.collection(COURSE_SUBSCRIPTIONS_COLLECTION)
      .doc(course.course_id).collection('subscriptions')
      .where('operator_uid', '==', operatorUid)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    return [course.course_id, !activeSubscription.empty];
  }));
  return Object.fromEntries(preferences);
}

async function setNotificationPreference(db, operatorUid, courseId, enabled, now = new Date()) {
  if (typeof courseId !== 'string' || typeof enabled !== 'boolean') {
    throw new Error('Invalid notification preference');
  }
  const assignment = await getOperatorAssignment(db, operatorUid);
  const course = assignment?.courses.find((candidate) => candidate.course_id === courseId);
  if (!course) {
    throw new Error('Operator is not authorized for this Course');
  }

  await db.collection(NOTIFICATION_PREFERENCES_COLLECTION)
    .doc(operatorUid).collection('courses').doc(courseId).set({
      course_id: courseId,
      enabled,
      updated_at: now,
    });
  return { course_id: courseId, enabled };
}

async function isNotificationEnabled(db, operatorUid, courseId) {
  const preference = await db.collection(NOTIFICATION_PREFERENCES_COLLECTION)
    .doc(operatorUid).collection('courses').doc(courseId).get();
  if (preference.exists) {
    return preference.data().enabled === true;
  }

  const legacySubscription = await db.collection(COURSE_SUBSCRIPTIONS_COLLECTION)
    .doc(courseId).collection('subscriptions')
    .where('operator_uid', '==', operatorUid)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  return !legacySubscription.empty;
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
  USER_ACCESS_COLLECTION,
  getOperatorAssignment,
  getNotificationPreferences,
  isNotificationEnabled,
  isValidSubscription,
  registerPushSubscription,
  setNotificationPreference,
  subscriptionId,
};