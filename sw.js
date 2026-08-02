const CACHE = 'playra-v13';
const SHELL = ['./', './index.html', './css/styles.css', './js/config.js', './js/backend.js', './js/app.js', './manifest.json', './icon.svg', './terms.html', './privacy.html', './legal.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Same-origin static assets only, stale-while-revalidate: serve the cached
// copy instantly, refresh it in the background so deploys propagate on the
// next load. Cross-origin requests (Supabase API/realtime, CDN, fonts) are
// never intercepted — caching live API data would serve stale LFG posts.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const refresh = fetch(e.request).then(res => {
          if (res && res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached || Response.error());
        return cached || refresh;
      })
    )
  );
});
