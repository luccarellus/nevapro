/**
 * Neva Pro Service Worker
 * 
 * Strategies:
 * - Static assets (JS, CSS, images, fonts): Cache-first (fast loads, offline support)
 * - Navigation (HTML): Network-first with cache fallback (always fresh, offline capable)
 * - API calls: Network-only (never cache sensitive data)
 */

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `neva-static-${CACHE_VERSION}`;
const PAGES_CACHE = `neva-pages-${CACHE_VERSION}`;
const IMAGE_CACHE = `neva-images-${CACHE_VERSION}`;

// Assets to pre-cache on install (the app shell)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/favicon.png',
  '/icon-512.png',
  '/logo.png',
  '/logotopo.png',
];

// Cache size limits
const MAX_STATIC_ENTRIES = 150;
const MAX_IMAGE_ENTRIES = 60;
const MAX_PAGE_ENTRIES = 10;

// ============ INSTALL ============
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache failed for some assets:', err);
      });
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// ============ ACTIVATE ============
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // Delete old versioned caches
            if (name.startsWith('neva-static-') && name !== STATIC_CACHE) return true;
            if (name.startsWith('neva-pages-') && name !== PAGES_CACHE) return true;
            if (name.startsWith('neva-images-') && name !== IMAGE_CACHE) return true;
            // Delete any legacy caches
            if (name.startsWith('neva-') && !name.includes(CACHE_VERSION)) return true;
            return false;
          })
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ============ FETCH ============
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http
  if (!url.protocol.startsWith('http')) return;

  // Strategy selection based on request type
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (isImage(url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
  } else if (isNavigation(request)) {
    event.respondWith(networkFirst(request, PAGES_CACHE));
  } else if (isApiCall(url)) {
    // API calls: network only (never cache)
    return;
  } else {
    // Other requests: network first with cache fallback
    event.respondWith(networkFirst(request, PAGES_CACHE));
  }
});

// ============ STRATEGIES ============

/**
 * Cache-first: serve from cache, fallback to network.
 * Perfect for versioned static assets (JS, CSS bundles).
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      trimCache(cacheName, cacheName === IMAGE_CACHE ? MAX_IMAGE_ENTRIES : MAX_STATIC_ENTRIES);
    }
    return response;
  } catch (err) {
    // Offline and not in cache
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Network-first: try network, fallback to cache.
 * Good for HTML pages (always fresh when online).
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      trimCache(cacheName, MAX_PAGE_ENTRIES);
    }
    return response;
  } catch (err) {
    // Network failed, try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/index.html');
      if (offlinePage) return offlinePage;
    }

    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// ============ HELPERS ============

/** Static assets: JS, CSS, WOFF/WOFF2 fonts */
function isStaticAsset(url) {
  const pathname = url.pathname;
  return (
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.ttf') ||
    pathname.endsWith('.eot') ||
    pathname.endsWith('.svg')
  );
}

/** Images: PNG, JPG, GIF, WebP, ICO */
function isImage(url) {
  const pathname = url.pathname;
  return (
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.avif')
  );
}

/** Navigation requests (HTML page loads) */
function isNavigation(request) {
  return request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
}

/** API calls to our backend */
function isApiCall(url) {
  return url.pathname.startsWith('/api/');
}

/** Trim cache to max entries (LRU - removes oldest) */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    // Delete oldest entries (first in array = oldest)
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
  }
}

// ============ MESSAGE HANDLER ============
// Allows the app to force cache updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});
