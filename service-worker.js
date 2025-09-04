importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js");


// ✅ List of static files (previously precached)
const STATIC_FILES = [
  "/",
  "/index.html",
  "/styles.css",
  "/main.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

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
    cacheName: "feeds",
    networkTimeoutSeconds: 5
  })
);

workbox.routing.registerRoute(
  ({request}) => request.destination === "image",
  new workbox.strategies.CacheFirst({
    cacheName: "chapter-images"
  })
);

// TODO: Need to rewird that part as it's just for images and other files are
// handled differently!
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CACHE_URL' && event.data.url) {
    console.warn('I am gonna download an image ' + event.data.url)
    // Most of the services will require no-cors to download the images...
    const request_mode =  event.data.isImage ? 'no-cors' : 'cors'
    const request = new Request(event.data.url);
    caches.open("chapter-images").then(cache => {
      fetch(request, {mode: request_mode}).then(response => {
        cache.put(event.data.url, response.clone());
        console.log('Cached URL: ' + event.data.url);
        // Send message back to the client that caching is done
        event.source.postMessage({ 
          type: 'CACHE_URL_DONE', 
          url: event.data.url 
        });
      });
    });
  }
});