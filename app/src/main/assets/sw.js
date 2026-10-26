/* Offline shell.
   guide.json, navigations and code (js/css/manifest) are network-first, so an
   updated deploy reaches users on the very next load; fonts and images stay
   cache-first because they never change between releases. */
var CACHE = 'aion2gs-v2';
var SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/config.js',
  './js/theme.js',
  './js/fx.js',
  './js/app.js',
  './js/guide-data.js',
  './manifest.webmanifest',
  './icons/icon-192.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  var isGuide = /guide\.json$/.test(url.pathname);
  var isNav = event.request.mode === 'navigate';
  var isCode = /\.(js|css|webmanifest)$/.test(url.pathname) || /sw\.js$/.test(url.pathname);
  var isStatic = /\.(woff2?|png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname);

  if (isGuide || isNav || isCode) {
    event.respondWith(
      fetch(event.request)
        .then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(event.request, copy); }).catch(function () {});
          return res;
        })
        .catch(function () {
          return caches.match(event.request).then(function (hit) {
            return hit || (isNav ? caches.match('./index.html') : Response.error());
          });
        })
    );
    return;
  }

  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(function (hit) {
        if (hit) return hit;
        return fetch(event.request).then(function (res) {
          if (res && res.status === 200 && res.type === 'same-origin') {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(event.request, copy); }).catch(function () {});
          }
          return res;
        });
      })
    );
    return;
  }

  event.respondWith(fetch(event.request).catch(function () { return Response.error(); }));
});
