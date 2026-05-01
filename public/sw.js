const CACHE_NAME = 'workflow-v227';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (!url.startsWith(self.location.origin) || url.includes('/api/') || url.includes('/reset')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

/* ================================================================
   PUSH NOTIFICATIONS — works even when app is closed / screen locked
   ================================================================ */
self.addEventListener('push', (e) => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { payload = { title: 'WorkFlow', body: e.data.text() }; }
  const { title = 'WorkFlow', body = '', icon, tag, data } = payload;
  const type = data?.type || '';

  // Call notifications — persistent, loud, vibrate pattern like phone ring
  if (type === 'call') {
    e.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: icon || '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'incoming-call',
        data: data || {},
        vibrate: [500, 200, 500, 200, 500, 200, 500, 200, 500, 200, 500],
        requireInteraction: true, // stays on screen until user taps
        renotify: true, // re-alert even if same tag
        silent: false,
        actions: [
          { action: 'answer', title: '📞 Trả lời' },
          { action: 'decline', title: '❌ Từ chối' },
        ],
      })
    );
    return;
  }

  // Call ended — close ringing notification + tell open clients (with reason)
  if (type === 'call_end') {
    const reason = data.reason || 'ended';
    const conversationId = data.conversationId || '';
    e.waitUntil(Promise.all([
      self.registration.getNotifications({ tag: 'incoming-call' })
        .then(notifs => notifs.forEach(n => n.close())),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(clients => {
          clients.forEach(c => c.postMessage({
            type: 'call-ended',
            reason, conversationId,
          }));
        })
    ]));
    return;
  }

  // Message / task / other notifications
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: tag || 'workflow-' + Date.now(),
      data: data || {},
      vibrate: [200, 100, 200],
      requireInteraction: true,
      renotify: true,
      silent: false,
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  const action = e.action;
  const data = e.notification.data || {};
  e.notification.close();

  // Call actions
  if (data.type === 'call') {
    if (action === 'decline') return; // just close
    // answer or tap — open app to chat
    const url = data.url || '/?tab=chat';
    e.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        for (const c of list) {
          if (c.url.includes(self.location.origin) && 'focus' in c) {
            c.postMessage({ type: 'incoming_call', ...data });
            return c.focus();
          }
        }
        return clients.openWindow(url);
      })
    );
    return;
  }

  // Message — open conversation
  const url = data.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
