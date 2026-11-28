// про.стим service worker: shows push notifications, opens the right page when one is tapped, and keeps
// the app shell and pictures in a cache, so the site opens fast and survives a bad connection.
// Pages and code always come from the network first, so a deploy is picked up on the next visit.

const SHELL_CACHE = 'prostim-shell-v2';
const MEDIA_CACHE = 'prostim-media';
const MEDIA_LIMIT = 240;
const SHELL = ['/', '/styles.css', '/app.js', '/data.js', '/icons.js', '/state.js', '/page.js', '/chat.js', '/ads.js', '/looks.js', '/social.js', '/ecosystem.js', '/trust.js', '/timeline.js', '/recommend.js', '/manifest.webmanifest', '/icon-192.png', '/badge-96.png'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('prostim-shell') && key !== SHELL_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request.mode === 'navigate' ? '/' : request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const cached = await cache.match(request.mode === 'navigate' ? '/' : request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    throw error;
  }
}

// Uploaded pictures never change under the same name, so the cache answers first.
async function cacheFirst(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone()).catch(() => {});
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - MEDIA_LIMIT))) await cache.delete(key);
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js' || url.pathname === '/agent.mjs') return;
  if (url.pathname.startsWith('/uploads/')) {
    if (/\.(jpe?g|png|webp|gif)$/i.test(url.pathname)) event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(networkFirst(request));
});

/* Push */

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    if (Number.isFinite(data.badge) && self.navigator.setAppBadge) await self.navigator.setAppBadge(data.badge).catch(() => {});
    await self.registration.showNotification(data.title || 'про.стим', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      lang: 'ru',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/#/activity' }
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      open.postMessage({ type: 'open', url: target });
      return;
    }
    await self.clients.openWindow(target);
  })());
});

// The browser rotated the subscription: hand the new one to the server under the same account.
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const key = event.oldSubscription?.options?.applicationServerKey;
    const subscription = event.newSubscription || (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);
    if (!subscription) return;
    await fetch('/api/push/subscribe', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...subscription.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
  })());
});
