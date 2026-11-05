/* =========================================================================
   sw.js — çevrimdışı destek (GitHub Pages uyumlu, göreli yollar)
   ========================================================================= */
const VERSION = 'portfoy-v2.0.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/icon-maskable.svg',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/util.js',
  './assets/js/store.js',
  './assets/js/catalog.js',
  './assets/js/rates.js',
  './assets/js/calc.js',
  './assets/js/charts.js',
  './assets/js/ui.js',
  './assets/js/views/dashboard.js',
  './assets/js/views/entry.js',
  './assets/js/views/history.js',
  './assets/js/views/analytics.js',
  './assets/js/views/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Kur verisi gibi dış kaynaklar doğrudan gider, önbelleğe alınmaz
  if (url.origin !== location.origin) return;

  // Navigasyon: ağ önce, önbellek yedeği
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Diğer statik dosyalar: önbellek önce, arka planda güncelle
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
