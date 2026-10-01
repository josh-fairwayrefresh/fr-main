const SANDBOX_PROJECT_PREFIX = 'fairway-refresh-sandbox-';
const PRODUCTION_PROJECT_ID = 'savvy-kit-496703-r5';
const PRODUCTION_PROJECT_NUMBER = '936892386735';

function required(name) {
  const values = {
    VITE_FAIRWAY_ENV: import.meta.env.VITE_FAIRWAY_ENV,
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_ADMIN_API_BASE_URL: import.meta.env.VITE_ADMIN_API_BASE_URL,
  };
  const value = values[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required sandbox configuration: ${name}`);
  }
  return value.trim();
}

const fairwayEnvironment = required('VITE_FAIRWAY_ENV');
if (!['sandbox', 'production'].includes(fairwayEnvironment)) {
  throw new Error(`Unsupported Fairway environment: ${fairwayEnvironment}`);
}

const firebaseConfig = Object.freeze({
  apiKey: required('VITE_FIREBASE_API_KEY'),
  authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: required('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: required('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: required('VITE_FIREBASE_APP_ID'),
});
const apiBaseUrl = required('VITE_API_BASE_URL').replace(/\/$/, '');
const adminApiBaseUrl = required('VITE_ADMIN_API_BASE_URL').replace(/\/$/, '');

if (fairwayEnvironment === 'sandbox' && !firebaseConfig.projectId.startsWith(SANDBOX_PROJECT_PREFIX)) {
  throw new Error('Sandbox Firebase project ID does not use the required sandbox prefix');
}
if (fairwayEnvironment === 'production' && firebaseConfig.projectId !== PRODUCTION_PROJECT_ID) {
  throw new Error('Production Firebase project ID does not match the approved production project');
}
if (!firebaseConfig.authDomain.includes(firebaseConfig.projectId)) {
  throw new Error('Firebase auth domain does not match the configured sandbox project');
}
if (!firebaseConfig.storageBucket.includes(firebaseConfig.projectId)) {
  throw new Error('Firebase storage bucket does not match the configured sandbox project');
}
if (!apiBaseUrl.startsWith('https://')) {
  throw new Error('Sandbox API base URL must use HTTPS');
}
const apiUrl = new URL(apiBaseUrl);
const expectedReceiverPrefix = fairwayEnvironment === 'production'
  ? `fairway-button-receiver-${PRODUCTION_PROJECT_NUMBER}`
  : 'fairway-button-receiver-sandbox';
if (!apiUrl.hostname.startsWith(expectedReceiverPrefix) || !apiUrl.hostname.endsWith('.run.app')) {
  throw new Error('API URL does not match the configured Fairway environment');
}
const adminApiUrl = new URL(adminApiBaseUrl);
const expectedAdminPrefix = fairwayEnvironment === 'production'
  ? `fairway-admin-${PRODUCTION_PROJECT_NUMBER}`
  : 'fairway-button-receiver-sandbox';
if (adminApiUrl.protocol !== 'https:' ||
    !adminApiUrl.hostname.startsWith(expectedAdminPrefix) ||
    !adminApiUrl.hostname.endsWith('.run.app')) {
  throw new Error('Admin API URL does not match the configured Fairway environment');
}

export { adminApiBaseUrl, apiBaseUrl, fairwayEnvironment, firebaseConfig };
