const CACHE = 'jana-address-offline-v5';
const SHELL = [
  '/',
  '/offline-map.html',
  '/assets/site.css',
  '/assets/site.js',
  '/assets/i18n.js',
  '/assets/geo.js',
  '/assets/streets.js',
  '/assets/parser.js',
  '/assets/geocode.js',
  '/assets/jarvis.js',
  '/manifest.json',
  '/vendor/maplibre-gl.js',
  '/vendor/maplibre-gl.css',
  '/vendor/pmtiles.js',
  '/assets/branches.js',
  '/fonts/Noto Sans Regular/0-255.pbf',
  '/fonts/Noto Sans Regular/1024-1279.pbf'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('jana-address-offline-') && key !== CACHE)
      .map(key => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/api/') || url.pathname.endsWith('.pmtiles')) return;

  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('/offline-map.html');
    return Response.error();
  }));
});
