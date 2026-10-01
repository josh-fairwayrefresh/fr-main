'use strict';

const REQUIRED = [
  'VITE_FAIRWAY_ENV', 'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID',
  'VITE_API_BASE_URL', 'VITE_ADMIN_API_BASE_URL',
];
const PRODUCTION_PROJECT_ID = 'savvy-kit-496703-r5';
const PRODUCTION_PROJECT_NUMBER = '936892386735';
const SANDBOX_PROJECT_PREFIX = 'fairway-refresh-sandbox-';

for (const name of REQUIRED) {
  if (typeof process.env[name] !== 'string' || process.env[name].trim().length === 0) {
    throw new Error(`Missing required frontend configuration: ${name}`);
  }
}
const environment = process.env.VITE_FAIRWAY_ENV;
if (!['sandbox', 'production'].includes(environment)) {
  throw new Error(`Unsupported Fairway environment: ${environment}`);
}
const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
if (environment === 'sandbox' && !projectId.startsWith(SANDBOX_PROJECT_PREFIX)) {
  throw new Error('Sandbox Firebase project ID does not use the required sandbox prefix');
}
if (environment === 'production' && projectId !== PRODUCTION_PROJECT_ID) {
  throw new Error('Production Firebase project ID does not match the approved production project');
}
if (!process.env.VITE_FIREBASE_AUTH_DOMAIN.includes(projectId) ||
    !process.env.VITE_FIREBASE_STORAGE_BUCKET.includes(projectId)) {
  throw new Error('Firebase endpoints do not match the configured project');
}
const apiUrl = new URL(process.env.VITE_API_BASE_URL);
const adminApiUrl = new URL(process.env.VITE_ADMIN_API_BASE_URL);
const receiverPrefix = environment === 'production'
  ? `fairway-button-receiver-${PRODUCTION_PROJECT_NUMBER}`
  : 'fairway-button-receiver-sandbox';
const adminPrefix = environment === 'production'
  ? `fairway-admin-${PRODUCTION_PROJECT_NUMBER}`
  : 'fairway-button-receiver-sandbox';
if (apiUrl.protocol !== 'https:' || !apiUrl.hostname.startsWith(receiverPrefix) || !apiUrl.hostname.endsWith('.run.app')) {
  throw new Error('API URL does not match the configured Fairway environment');
}
if (adminApiUrl.protocol !== 'https:' || !adminApiUrl.hostname.startsWith(adminPrefix) || !adminApiUrl.hostname.endsWith('.run.app')) {
  throw new Error('Admin API URL does not match the configured Fairway environment');
}

console.log(`Validated ${environment} frontend configuration for ${projectId}`);