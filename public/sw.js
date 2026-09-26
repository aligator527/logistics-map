// Service worker: the map keeps working offline with the data seen last.
//   page            network first, the cached copy when offline
//   assets/*        cache first (file names carry a content hash)
//   data/*, geo/*   stale-while-revalidate (shown at once, refreshed in the background)
//   anything else   (JMA live data, PR TIMES images, fonts …) straight to the network
const VERSION = 'lm-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(VERSION).then((x) => x.put('./', c)); return r; })
      .catch(() => caches.match('./').then((r) => r ?? Response.error())));
    return;
  }
  if (path.startsWith('assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then((x) => x.put(req, c)); } return r; })));
    return;
  }
  if (path.startsWith('data/') || path.startsWith('geo/')) {
    e.respondWith(caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req);
      const fresh = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => hit ?? Response.error());
      return hit ?? fresh;
    }));
  }
});
