importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const STATIC_CACHE = 'gwanakon-cache-v1.4.3';

const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'gwanakonIcon.png',
];

// Firebase 백그라운드 푸시 설정
firebase.initializeApp({
  apiKey: "AIzaSyDvEGZcUtz8PIyOLg9M_v71dL7aQG1ntwk",
  authDomain: "gwanak-on.firebaseapp.com",
  databaseURL: "https://gwanak-on-default-rtdb.firebaseio.com",
  projectId: "gwanak-on",
  storageBucket: "gwanak-on.firebasestorage.app",
  messagingSenderId: "101226390647",
  appId: "1:101226390647:web:67c72a62b3079c16e4d272"
});

const messaging = firebase.messaging();

// 백그라운드에서 푸시 수신 시 동작
messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] 백그라운드 푸시 수신:', payload);
});

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
  event.respondWith(
    caches.match(request).then(cachedRes => cachedRes || fetch(request))
  );
});