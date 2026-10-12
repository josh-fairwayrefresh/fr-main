'use strict';

const crypto = require('crypto');
const {
  USER_ACCESS_COLLECTION,
  getUserAccess,
  resolveAuthorizedCourses,
} = require('./user_access');

const COURSE_SUBSCRIPTIONS_COLLECTION = 'course_push_subscriptions';
const NOTIFICATION_PREFERENCES_COLLECTION = 'user_notification_preferences';

function subscriptionId(endpoint) {
  return crypto.createHash('sha256').update(endpoint).digest('hex');
}

function notificationPreferenceId(customerId, courseId) {
  return crypto.createHash('sha256')
    .update(JSON.stringify([customerId, courseId]))
    .digest('hex');
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

  const courses = await resolveAuthorizedCourses(db, access);
  return courses.length > 0 ? { ...access, courses } : null;
}

async function getNotificationPreferences(db, operatorUid, courses) {
  const preferences = await Promise.all(courses.map(async (course) => {
    const coursePreferences = db.collection(NOTIFICATION_PREFERENCES_COLLECTION)
      .doc(operatorUid).collection('courses');
    const preferenceRef = coursePreferences.doc(
      notificationPreferenceId(course.customer_id, course.course_id)
    );
    const preference = await preferenceRef.get();
    if (preference.exists) {
      return [`${course.customer_id}/${course.course_id}`, preference.data().enabled === true];
    }
    const hasDuplicateCourseId = courses.some((candidate) => (
      candidate.course_id === course.course_id && candidate.customer_id !== course.customer_id
    ));
    const legacyPreference = hasDuplicateCourseId
      ? null
      : await coursePreferences.doc(course.course_id).get();
    if (legacyPreference?.exists) {
      return [`${course.customer_id}/${course.course_id}`, legacyPreference.data().enabled === true];
    }

    const activeSubscription = await db.collection(COURSE_SUBSCRIPTIONS_COLLECTION)
      .doc(course.course_id).collection('subscriptions')
      .where('operator_uid', '==', operatorUid)
      .where('customer_id', '==', course.customer_id)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    return [`${course.customer_id}/${course.course_id}`, !activeSubscription.empty];
  }));
  return Object.fromEntries(preferences);
}

async function setNotificationPreference(db, operatorUid, customerId, courseId, enabled, now = new Date()) {
  if (typeof customerId !== 'string' || typeof courseId !== 'string' || typeof enabled !== 'boolean') {
    throw new Error('Invalid notification preference');
  }
  const assignment = await getOperatorAssignment(db, operatorUid);
  const course = assignment?.courses.find((candidate) => (
    candidate.customer_id === customerId && candidate.course_id === courseId
  ));
  if (!course) {
    throw new Error('Operator is not authorized for this Course');
  }

  await db.collection(NOTIFICATION_PREFERENCES_COLLECTION)
    .doc(operatorUid).collection('courses')
    .doc(notificationPreferenceId(customerId, courseId)).set({
      customer_id: customerId,
      course_id: courseId,
      enabled,
      updated_at: now,
    });
  return { customer_id: customerId, course_id: courseId, enabled };
}

async function isNotificationEnabled(db, operatorUid, customerId, courseId) {
  const preference = await db.collection(NOTIFICATION_PREFERENCES_COLLECTION)
    .doc(operatorUid).collection('courses')
    .doc(notificationPreferenceId(customerId, courseId)).get();
  if (preference.exists) {
    return preference.data().enabled === true;
  }
  const assignment = await getOperatorAssignment(db, operatorUid);
  const hasDuplicateCourseId = assignment?.courses.some((course) => (
    course.course_id === courseId && course.customer_id !== customerId
  ));
  if (!hasDuplicateCourseId) {
    const legacyPreference = await db.collection(NOTIFICATION_PREFERENCES_COLLECTION)
      .doc(operatorUid).collection('courses').doc(courseId).get();
    if (legacyPreference.exists) return legacyPreference.data().enabled === true;
  }

  const legacySubscription = await db.collection(COURSE_SUBSCRIPTIONS_COLLECTION)
    .doc(courseId).collection('subscriptions')
    .where('operator_uid', '==', operatorUid)
    .where('customer_id', '==', customerId)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  return !legacySubscription.empty;
}

async function registerPushSubscription(db, operatorUid, {
  customerId,
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
  const course = assignment?.courses.find((candidate) => (
    candidate.customer_id === customerId && candidate.course_id === courseId
  ));
  if (!course) {
    throw new Error('Operator is not authorized for this Course');
  }

  const id = subscriptionId(`${customerId}/${courseId}/${subscription.endpoint}`);
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