// Service Worker for AppByMari Web Push Notifications
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const payloadData = data.data || {};
  const soundType = payloadData.soundType || data.soundType || 'general_announcement';

  let soundFile = '/sounds/general-announcement.wav';
  let vibratePattern = [200, 100, 200];

  if (soundType === 'admin_support') {
    soundFile = '/sounds/admin-support-case.wav';
    vibratePattern = [250, 100, 250, 100, 350];
  } else if (soundType === 'case_resolved') {
    soundFile = '/sounds/case-resolved.wav';
    vibratePattern = [150, 80, 150, 80, 250];
  }

  const title = data.title || 'แจ้งเตือนจาก AppByMari';
  const targetUrl = data.url || payloadData.url || '/';

  const options = {
    body: data.body || 'มีรายการอัปเดตใหม่',
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/badge-72x72.png',
    tag: data.tag || ('appbymari-' + Date.now()),
    renotify: true,
    requireInteraction: true,
    vibrate: vibratePattern,
    sound: soundFile,
    data: {
      url: targetUrl,
      soundType,
      soundFile,
      timestamp: Date.now(),
      ...payloadData,
    },
    actions: [
      {
        action: 'open',
        title: 'ดูรายการ',
      },
      {
        action: 'close',
        title: 'ปิด',
      },
    ],
  };

  const setBadgePromise = ('setAppBadge' in navigator)
    ? (typeof payloadData.badgeCount === 'number' && payloadData.badgeCount > 0
        ? navigator.setAppBadge(payloadData.badgeCount)
        : navigator.setAppBadge()
      ).catch(() => {})
    : Promise.resolve();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      setBadgePromise,
      // Inform foreground or background tabs to play sound or refresh unread badges
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          client.postMessage({
            type: 'APP_PUSH_NOTIFICATION_RECEIVED',
            soundType,
            soundFile,
            title,
            body: options.body,
            url: targetUrl,
            data: options.data,
          });
        }
      }),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {});
  }

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(targetUrl);
          }
          return client;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
