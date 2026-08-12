const CACHE_VERSION = 'pbys-v9.3.0';
self.addEventListener('install', event => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (clients.length) {
      const client = clients[0];
      await client.focus();
      return;
    }
    await self.clients.openWindow('./');
  })());
});
