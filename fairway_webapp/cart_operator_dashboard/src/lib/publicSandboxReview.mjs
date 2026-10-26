export function publicSandboxReviewEnabled(environment, config, location, enabled) {
  return enabled === 'true' && environment === 'sandbox' &&
    ['fairway-refresh-sandbox-qr1', 'fairway-refresh-sandbox-260930'].includes(config.projectId) &&
    location.origin === `https://${config.projectId}.web.app` &&
    (location.pathname === '/' || location.pathname === '/inventory' || location.pathname.startsWith('/requests/'));
}

export async function preparePublicReviewer(user, apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/api/v1/sandbox/review-access`, {
    method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!response.ok) throw new Error(`Public sandbox review access failed (${response.status}). Reload to retry.`);
}
