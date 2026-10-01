'use strict';

const functions = require('@google-cloud/functions-framework');
const { Firestore } = require('@google-cloud/firestore');
const webpush = require('web-push');
const { dispatchRequestNotifications } = require('./lib/notification_dispatch');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function requestIdFromEvent(event) {
  const documentPath = event?.subject || event?.data?.value?.name;
  const match = typeof documentPath === 'string'
    ? documentPath.match(/(?:^|\/)documents\/requests\/([^/]+)$/)
    : null;
  if (!match) throw new Error('Firestore event does not identify a request document');
  return match[1];
}

functions.cloudEvent('fairwayRequestNotifier', async (event) => {
  const projectId = required('FAIRWAY_GCP_PROJECT');
  if (projectId !== 'savvy-kit-496703-r5' || process.env.GOOGLE_CLOUD_PROJECT !== projectId) {
    throw new Error('Notification sender project configuration mismatch');
  }

  webpush.setVapidDetails(
    required('FAIRWAY_VAPID_SUBJECT'),
    required('FAIRWAY_VAPID_PUBLIC_KEY'),
    required('FAIRWAY_VAPID_PRIVATE_KEY')
  );
  const db = new Firestore({ projectId });
  return dispatchRequestNotifications(db, requestIdFromEvent(event), webpush.sendNotification);
});

module.exports = { requestIdFromEvent };