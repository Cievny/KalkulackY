// Service worker cievny.sk – v3.
// HTML a JS idú VŽDY po sieti a NIKDY sa necachujú: chránené stránky podáva
// server len prihláseným (Cache-Control: no-store) a na zdieľanom zariadení
// (TV, tablet) nesmie ostať ich kópia po odhlásení. Cache-first je len pre
// nemenné statické súbory (ikony, manifest). Supabase sa nikdy necachuje.
const VERSION = 'v3';
const CACHE = 'cievny-' + VERSION;
const PRECACHE = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(PRECACHE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // zmaže aj cache v1/v2, ktoré obsahovali chránené stránky
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // Supabase a externé služby vždy po sieti

  const isStatic = /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname);
  if (!isStatic) return;                                 // HTML/JS: nezasahuj – čistá sieť, bez cache

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok && !r.redirected && r.type === 'basic') {
        const cl = r.clone();
        caches.open(CACHE).then(c => c.put(req, cl));
      }
      return r;
    }))
  );
});
