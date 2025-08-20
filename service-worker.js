const CACHE_NAME = 'comics-viewer';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/service-worker.js',
  '/icon-192.png',
  '/icon-512.png',
];


self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

async function driveResponseOrder(request) {
  console.log('trying to load ' + request.url)
  const cache = await caches.open(CACHE_NAME);
  match = await cache.match(request.url);
  if (match) {
    console.log('match found!')
    const content_type = match.headers.get('content-type') || '';
    if (content_type.startsWith('image/') || !content_type) {
      return match;
    }
  }
  return fetch(request).catch(() => {
    console.error('The fetch failed! return the match')
    return match
  }
  );
}

self.addEventListener("fetch", (event) => {
  event.respondWith(driveResponseOrder(event.request));
});


self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CACHE_URL' && event.data.url) {
    // Most of the services will require no-cors to download the images...
    const request_mode =  event.data.isImage ? 'no-cors' : 'cors'
    const request = new Request(event.data.url);
    caches.open(CACHE_NAME).then(cache => {
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

  if (event.data && event.data.type === 'REMOVE_URL' && event.data.url) {
    caches.open(CACHE_NAME).then(cache => {
      cache.delete(event.data.url).then(success => {
        if (success) {
          console.log('Removed from cache: ' + event.data.url);
        }
        event.source.postMessage({ type: 'REMOVE_URL_DONE', url: event.data.url });
      });
    });
  }
});