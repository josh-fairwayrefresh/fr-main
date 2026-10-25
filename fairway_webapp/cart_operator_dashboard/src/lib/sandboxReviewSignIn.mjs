export function sandboxReviewSignIn(href, environment, config) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (!fragment.has('review_sign_in')) return null;
  if (environment !== 'sandbox' || config.projectId !== 'fairway-refresh-sandbox-qr1' ||
      url.origin !== 'https://fairway-refresh-sandbox-qr1.web.app' || url.pathname !== '/') {
    throw new Error('Private review sign-in is available only in the isolated QR sandbox.');
  }
  const email = fragment.get('email');
  const link = new URL(fragment.get('review_sign_in'));
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      link.origin !== 'https://fairway-refresh-sandbox-qr1.firebaseapp.com' ||
      link.pathname !== '/__/auth/action' || link.searchParams.get('mode') !== 'signIn' ||
      link.searchParams.get('apiKey') !== config.apiKey || !link.searchParams.get('oobCode')) {
    throw new Error('This private review sign-in link is invalid.');
  }
  return { email, link: link.href };
}
