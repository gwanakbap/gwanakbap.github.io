const STATIC_CACHE = 'static-cache-v0.1.4';
const DATA_CACHE = 'data-cache-v1';

const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'images/icon.png',
  'data/version.json',
  'scripts/updateMeals.js'
];

const DATA_PATH = 'data/meals.json';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => ![STATIC_CACHE, DATA_CACHE].includes(key))
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.url.includes(DATA_PATH)) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (!res || res.status !== 200) throw new Error('Network error');

          const clone = res.clone();
          caches.open(DATA_CACHE).then(cache => cache.put(request, clone));

          return res;
        })
        .catch(() => caches.match(request))
    );
  } else {
    event.respondWith(
      caches.match(request).then(cachedRes => cachedRes || fetch(request))
    );
  }
});
