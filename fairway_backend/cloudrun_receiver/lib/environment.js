'use strict';

const PRODUCTION_PROJECT_ID = 'savvy-kit-496703-r5';
const SANDBOX_PROJECT_PREFIX = 'fairway-refresh-sandbox-';
const PRODUCTION_HOSTING_ORIGIN = `https://${PRODUCTION_PROJECT_ID}.web.app`;
const PRODUCTION_CUSTOM_DOMAIN_ORIGIN = 'https://app.fairwayrefresh.com';
const PRODUCTION_ADMIN_ORIGINS = Object.freeze([
  PRODUCTION_HOSTING_ORIGIN,
  PRODUCTION_CUSTOM_DOMAIN_ORIGIN,
]);

function parseAllowedOrigins(value) {
  return value ? value.split(',').map((origin) => origin.trim()).filter(Boolean) : [];
}

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
      allowedAdminOrigins: parseAllowedOrigins(env.FAIRWAY_ALLOWED_ORIGIN),
    };
  }

  const expectedProjectId = env.FAIRWAY_GCP_PROJECT;
  const runtimeProjectId = env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT;
  const serviceMode = env.FAIRWAY_SERVICE_MODE;
  if (env.FAIRWAY_ENV !== 'production' || !['admin', 'receiver'].includes(serviceMode)) {
    throw new Error('Production runtime requires an explicit supported service mode');
  }
  if (expectedProjectId !== PRODUCTION_PROJECT_ID || runtimeProjectId !== PRODUCTION_PROJECT_ID) {
    throw new Error('Production project configuration must match the production project');
  }
  const configuredAdminOrigins = parseAllowedOrigins(env.FAIRWAY_ALLOWED_ORIGIN);
  if (serviceMode === 'admin'
      && (configuredAdminOrigins.length !== PRODUCTION_ADMIN_ORIGINS.length
        || PRODUCTION_ADMIN_ORIGINS.some((origin) => !configuredAdminOrigins.includes(origin)))) {
    throw new Error('Production Admin origins must match the canonical production origins');
  }
  if (serviceMode === 'receiver' && env.FAIRWAY_ALLOWED_ORIGIN) {
    throw new Error('Production receiver must not configure an Admin browser origin');
  }

  return Object.freeze({
    environment: 'production',
    projectId: PRODUCTION_PROJECT_ID,
    serviceMode,
    allowedAdminOrigins: serviceMode === 'admin' ? PRODUCTION_ADMIN_ORIGINS : [],
  });
}

module.exports = {
  PRODUCTION_ADMIN_ORIGINS,
  PRODUCTION_CUSTOM_DOMAIN_ORIGIN,
  PRODUCTION_PROJECT_ID,
  PRODUCTION_HOSTING_ORIGIN,
  SANDBOX_PROJECT_PREFIX,
  resolveRuntimeEnvironment,
  resolveSandboxEnvironment,
};
