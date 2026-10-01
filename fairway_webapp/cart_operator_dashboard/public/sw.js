self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(payload.title || 'Fairway Refresh', {
    body: payload.body || 'New golfer request',
    icon: '/icons/fairway-192.png',
    badge: '/icons/fairway-192.png',
    tag: payload.tag || payload.request_id,
    renotify: false,
    data: { url: payload.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin)) {
        if ('navigate' in client) await client.navigate(destination);
        return client.focus();
      }
    }
    return self.clients.openWindow(destination);
  }));
});