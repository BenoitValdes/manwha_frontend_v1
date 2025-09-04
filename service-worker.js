importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js");

const FEED_CACHE = 'feeds';
const IMAGE_CACHE = 'chapter-images';
const STATIC_FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/main.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// Force new SW to activate immediately
self.skipWaiting();

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// ✅ Precache files without automatically creating routes
workbox.precaching.precache(
  STATIC_FILES.map((url) => ({ url, revision: null }))
);

// Network-first route for precached static files
workbox.routing.registerRoute(
  ({ request, url }) => STATIC_FILES.includes(url.pathname),
  new workbox.strategies.NetworkFirst({
    cacheName: workbox.core.cacheNames.precache, // points to precache
  })
);

// ✅ Feeds → network first, fallback to cache (latest only)
workbox.routing.registerRoute(
  ({url}) => url.pathname.endsWith(".xml") ||
             url.pathname.endsWith(".rss"),
  new workbox.strategies.NetworkFirst({
    cacheName: FEED_CACHE,
    networkTimeoutSeconds: 5
  })
);

workbox.routing.registerRoute(
  ({request}) => request.destination === "image",
  new workbox.strategies.CacheFirst({
    cacheName: IMAGE_CACHE
  })
);

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CACHE_URL' && event.data.url) {
    const request = new Request(event.data.url);
    caches.open(IMAGE_CACHE).then(cache => {
      fetch(request, {mode: 'no-cors'}).then(response => {
        cache.put(event.data.url, response.clone());
        // Send message back to the client that caching is done
        event.source.postMessage({ 
          type: 'CACHE_URL_DONE', 
          url: event.data.url 
        });
      });
    });
  }
  if (event.data && event.data.type === 'REMOVE_URL' && event.data.url) {
    caches.open(IMAGE_CACHE).then(cache => {
      cache.delete(event.data.url).then(success => {
        event.source.postMessage({ 
          type: 'REMOVE_URL_DONE', 
          url: event.data.url 
        });
      });
    });
  }
});