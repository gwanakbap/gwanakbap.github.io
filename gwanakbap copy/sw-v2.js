const STATIC_CACHE = 'gwanakbap-cache-v1.3.4';

const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'gwanakbapIcon.png',
];

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
          .filter(key => key !== STATIC_CACHE)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 💡 Firebase 데이터베이스 및 구글 시트 요청은 캐시를 타지 않고 항상 네트워크에서 가져옴 (필수 방어)
  if (url.origin.includes('firebaseio.com') || url.pathname.includes('export?format=csv')) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then(cachedRes => cachedRes || fetch(request))
  );
});