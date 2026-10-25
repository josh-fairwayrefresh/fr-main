'use strict';

const functions = require('@google-cloud/functions-framework');
const { Firestore } = require('@google-cloud/firestore');
const webpush = require('web-push');
const { dispatchRequestNotifications } = require('./lib/notification_dispatch');
const { resolveRuntimeEnvironment } = require('./lib/environment');

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
  const { projectId } = resolveRuntimeEnvironment();

  webpush.setVapidDetails(
    required('FAIRWAY_VAPID_SUBJECT'),
    required('FAIRWAY_VAPID_PUBLIC_KEY'),
    required('FAIRWAY_VAPID_PRIVATE_KEY')
  );
  const db = new Firestore({ projectId });
  return dispatchRequestNotifications(db, requestIdFromEvent(event), webpush.sendNotification);
});

module.exports = { requestIdFromEvent };