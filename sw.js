// sw.js
var CACHE_NAME = 'xd-app-v2';
var urlsToCache = [
  './',
  'index.html',
  'styles.css',
  'classics-reader.js',
  'app.js',
  'manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/pinyin-pro/3.28.1/index.min.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) { return response; }
        return fetch(event.request);
      })
  );
});
