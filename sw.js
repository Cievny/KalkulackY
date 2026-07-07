// Service worker cievny.sk – offline záchranná sieť.
// Stratégia: navigácie a dáta = network-first (čerstvé HTML, žiadne staré nálezy),
// statika (ikony, manifest, auth.js) = cache-first. Supabase sa NIKDY necachuje.
const VERSION = 'v1';
const CACHE = 'cievny-' + VERSION;
const PRECACHE = [
  '/', '/tools/', '/tools/auth.js', '/manifest.webmanifest',
  '/tools/login/', '/tools/Program/', '/tools/EVK/', '/tools/PEVAR/',
  '/tools/CAS-generator/', '/tools/Aorta/', '/tools/kontroly/'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(PRECACHE.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
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
  if (url.origin !== location.origin) return; // Supabase a externé služby idú vždy po sieti

  const isStatic = /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname);
  if (isStatic) {
    // cache-first pre nemenné statické súbory
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r.ok) { const cl = r.clone(); caches.open(CACHE).then(c => c.put(req, cl)); }
        return r;
      }))
    );
    return;
  }

  // network-first pre HTML/JS – čerstvý obsah, cache len ako offline fallback
  e.respondWith(
    fetch(req).then(r => {
      if (r.ok) { const cl = r.clone(); caches.open(CACHE).then(c => c.put(req, cl)); }
      return r;
    }).catch(() =>
      caches.match(req).then(hit => hit ||
        (req.mode === 'navigate' ? caches.match('/tools/') : undefined))
    )
  );
});
