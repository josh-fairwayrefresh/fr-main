const PRODUCTION_PROJECT_NUMBER = '936892386735';

export function expectedCloudRunServicePrefix(environment, service) {
  if (environment === 'production') {
    if (service === 'receiver') return `fairway-button-receiver-${PRODUCTION_PROJECT_NUMBER}`;
    if (service === 'admin') return `fairway-admin-${PRODUCTION_PROJECT_NUMBER}`;
    return null;
  }
  if (environment === 'sandbox') {
    if (service === 'receiver') return 'fairway-button-receiver-sandbox';
    if (service === 'admin') return 'fairway-admin-sandbox';
  }
  return null;
}

export function isExpectedCloudRunUrl(value, environment, service) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const prefix = expectedCloudRunServicePrefix(environment, service);
  return Boolean(prefix && url.protocol === 'https:' &&
    url.hostname.startsWith(prefix) && url.hostname.endsWith('.run.app'));
}