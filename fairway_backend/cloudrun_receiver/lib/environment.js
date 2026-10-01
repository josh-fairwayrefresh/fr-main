'use strict';

const PRODUCTION_PROJECT_ID = 'savvy-kit-496703-r5';
const SANDBOX_PROJECT_PREFIX = 'fairway-refresh-sandbox-';
const PRODUCTION_HOSTING_ORIGIN = `https://${PRODUCTION_PROJECT_ID}.web.app`;

function resolveSandboxEnvironment(env = process.env) {
  const fairwayEnvironment = env.FAIRWAY_ENV;
  const expectedProjectId = env.FAIRWAY_GCP_PROJECT;
  const runtimeProjectId = env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT;

  if (fairwayEnvironment !== 'sandbox') {
    throw new Error('FAIRWAY_ENV must be explicitly set to sandbox');
  }
  if (!expectedProjectId || !runtimeProjectId) {
    throw new Error('Sandbox project configuration is required');
  }
  if (expectedProjectId === PRODUCTION_PROJECT_ID || runtimeProjectId === PRODUCTION_PROJECT_ID) {
    throw new Error('Sandbox backend refuses the production project');
  }
  if (!expectedProjectId.startsWith(SANDBOX_PROJECT_PREFIX)) {
    throw new Error('Sandbox project ID does not use the required sandbox prefix');
  }
  if (expectedProjectId !== runtimeProjectId) {
    throw new Error('Configured sandbox project does not match the runtime project');
  }

  return Object.freeze({
    environment: fairwayEnvironment,
    projectId: expectedProjectId,
  });
}

function resolveRuntimeEnvironment(env = process.env) {
  if (env.FAIRWAY_ENV === 'sandbox') {
    return {
      ...resolveSandboxEnvironment(env),
      serviceMode: env.FAIRWAY_SERVICE_MODE || 'receiver',
      allowedAdminOrigin: env.FAIRWAY_ALLOWED_ORIGIN || null,
    };
  }

  const expectedProjectId = env.FAIRWAY_GCP_PROJECT;
  const runtimeProjectId = env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT;
  if (env.FAIRWAY_ENV !== 'production' || env.FAIRWAY_SERVICE_MODE !== 'admin') {
    throw new Error('Production runtime is permitted only for the dedicated Admin service');
  }
  if (expectedProjectId !== PRODUCTION_PROJECT_ID || runtimeProjectId !== PRODUCTION_PROJECT_ID) {
    throw new Error('Production Admin project configuration must match the production project');
  }
  if (env.FAIRWAY_ALLOWED_ORIGIN !== PRODUCTION_HOSTING_ORIGIN) {
    throw new Error('Production Admin origin must match production Hosting');
  }

  return Object.freeze({
    environment: 'production',
    projectId: PRODUCTION_PROJECT_ID,
    serviceMode: 'admin',
    allowedAdminOrigin: PRODUCTION_HOSTING_ORIGIN,
  });
}

module.exports = {
  PRODUCTION_PROJECT_ID,
  PRODUCTION_HOSTING_ORIGIN,
  SANDBOX_PROJECT_PREFIX,
  resolveRuntimeEnvironment,
  resolveSandboxEnvironment,
};
