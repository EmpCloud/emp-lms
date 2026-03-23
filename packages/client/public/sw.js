const CACHE_VERSION = 'emp-lms-v1';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;

const APP_SHELL_URLS = [
  '/',
  '/index.html',
];

// ---- Install: pre-cache app shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  self.skipWaiting();
});

// ---- Activate: clean old caches ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_SHELL_CACHE && key !== API_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---- Fetch strategies ----
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API requests: network-first strategy
  if (url.pathname.startsWith('/api/courses') || url.pathname.startsWith('/api/enrollments')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Static assets (images, fonts, CSS, JS bundles): cache-first strategy
  if (
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.match(/\.(css|js|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigation requests (SPA): serve cached app shell
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_SHELL_CACHE));
    return;
  }
});

// Network-first: try network, fall back to cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // For navigation, fall back to cached index.html
    if (request.mode === 'navigate') {
      const shell = await caches.match('/index.html');
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Cache-first: try cache, fall back to network
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}
