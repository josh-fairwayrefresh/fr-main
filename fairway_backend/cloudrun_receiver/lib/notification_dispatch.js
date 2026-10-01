'use strict';

const crypto = require('crypto');
const { COURSE_SUBSCRIPTIONS_COLLECTION } = require('./operator_notifications');

const DISPATCH_COLLECTION = 'notification_dispatches';
const MAX_ATTEMPTS = 5;
const LEASE_MS = 60 * 1000;

function notificationTopic(requestId) {
  return crypto.createHash('sha256').update(requestId).digest('base64url').slice(0, 32);
}

function notificationPayload(requestId, request) {
  const location = request.device_label || (request.hole ? `Hole ${request.hole}` : request.course_name);
  return {
    title: 'Fairway Refresh',
    body: `Refresh requested — ${location || 'Course request'}`,
    tag: requestId,
    request_id: requestId,
    course_id: request.course_id,
    url: `/requests/${encodeURIComponent(requestId)}?course=${encodeURIComponent(request.course_id)}`,
  };
}

async function acquireDispatch(db, requestId, subscriptionId, now) {
  const ref = db.collection(DISPATCH_COLLECTION).doc(requestId)
    .collection('subscriptions').doc(subscriptionId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() : null;
    if (current?.status === 'accepted' || current?.status === 'terminal_failure') {
      return null;
    }
    const leaseUntil = current?.lease_until instanceof Date
      ? current.lease_until
      : current?.lease_until?.toDate?.();
    if (current?.status === 'sending' && leaseUntil instanceof Date && leaseUntil > now) {
      return null;
    }

    const attempts = (current?.attempts || 0) + 1;
    if (attempts > MAX_ATTEMPTS) {
      transaction.set(ref, {
        status: 'terminal_failure',
        attempts: current?.attempts || MAX_ATTEMPTS,
        last_failure_code: 'retry_exhausted',
        updated_at: now,
      }, { merge: true });
      return null;
    }

    transaction.set(ref, {
      status: 'sending',
      attempts,
      lease_until: new Date(now.getTime() + LEASE_MS),
      updated_at: now,
    }, { merge: true });
    return { attempts, ref };
  });
}

function responseCode(error) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : null;
}

async function dispatchRequestNotifications(db, requestId, sendNotification, now = new Date()) {
  const requestSnapshot = await db.collection('requests').doc(requestId).get();
  if (!requestSnapshot.exists) return { skipped: 'missing_request' };

  const request = requestSnapshot.data();
  if (request.event_type !== 'button_press' || typeof request.course_id !== 'string') {
    return { skipped: 'not_course_request' };
  }

  const subscriptions = await db.collection(COURSE_SUBSCRIPTIONS_COLLECTION)
    .doc(request.course_id).collection('subscriptions')
    .where('status', '==', 'active').get();
  const payload = JSON.stringify(notificationPayload(requestId, request));
  const transientFailures = [];
  let accepted = 0;

  for (const subscriptionSnapshot of subscriptions.docs) {
    const acquired = await acquireDispatch(db, requestId, subscriptionSnapshot.id, now);
    if (!acquired) continue;

    const subscription = subscriptionSnapshot.data();
    try {
      await sendNotification({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      }, payload, {
        TTL: 300,
        urgency: 'high',
        topic: notificationTopic(requestId),
      });
      const batch = db.batch();
      batch.set(acquired.ref, {
        status: 'accepted',
        accepted_at: now,
        lease_until: null,
        last_failure_code: null,
        updated_at: now,
      }, { merge: true });
      batch.set(subscriptionSnapshot.ref, {
        last_success_at: now,
        last_failure_code: null,
        updated_at: now,
      }, { merge: true });
      await batch.commit();
      accepted += 1;
    } catch (error) {
      const code = responseCode(error);
      const expired = code === 404 || code === 410;
      const transient = code === 429 || (code !== null && code >= 500) || code === null;
      const exhausted = acquired.attempts >= MAX_ATTEMPTS;
      const batch = db.batch();
      batch.set(acquired.ref, {
        status: transient && !exhausted ? 'pending' : 'terminal_failure',
        lease_until: null,
        last_failure_code: code || 'transport_error',
        updated_at: now,
      }, { merge: true });
      batch.set(subscriptionSnapshot.ref, {
        status: expired ? 'revoked' : subscription.status,
        last_failure_code: code || 'transport_error',
        updated_at: now,
      }, { merge: true });
      await batch.commit();
      if (transient && !exhausted) transientFailures.push(code || 'transport_error');
    }
  }

  if (transientFailures.length > 0) {
    const error = new Error('Transient Web Push delivery failure');
    error.failures = transientFailures;
    throw error;
  }

  return { accepted, subscriptions: subscriptions.size };
}

module.exports = {
  DISPATCH_COLLECTION,
  MAX_ATTEMPTS,
  dispatchRequestNotifications,
  notificationPayload,
  notificationTopic,
};