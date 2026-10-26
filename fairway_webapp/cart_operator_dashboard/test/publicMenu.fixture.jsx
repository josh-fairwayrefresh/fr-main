import React from 'react';
import { createRoot } from 'react-dom/client';
import PublicMenuApp from '../src/PublicMenuApp';

globalThis.menuRequests = [];
window.fetch = (url, options) => new Promise(resolve => {
  globalThis.menuRequests.push({
    url, options,
    finish: body => resolve(new Response(JSON.stringify(body), {
      status: body.error ? 503 : 200, headers: { 'Content-Type': 'application/json' },
    })),
  });
});
createRoot(document.getElementById('root')).render(<PublicMenuApp
  apiBaseUrl={location.origin}
  slug={new URLSearchParams(location.search).get('slug') || 'unbranded-course'}
/>);
