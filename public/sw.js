// ── l-host Service Worker ─────────────────────────────────────────────────
//  Strategy:
//   • App shell (HTML, CSS, JS)  → Network-first (always fresh)
//   • /api/thumb + /api/preview  → Cache-first (image thumbnails)
//   • /file (video/audio)        → BYPASS SW entirely — browser handles range
//                                  requests natively; SW interception breaks
//                                  range/seek on some mobile browsers.
//   • Everything else            → Network-first
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_SHELL   = 'lhost-shell-v19';
const CACHE_THUMBS  = 'lhost-thumbs-v19';
const THUMBS_MAX_ENTRIES = 200;   // LRU cap so cache can't grow unbounded

const SHELL_ASSETS = [
  '/',
  '/app.js',
  '/style.css',
  '/index.html',
  '/aerograb.js',
  '/aerograb-animation.js',
  '/manifest.json',
  '/brand.svg',
  '/twh-logo.png',
];

// ── Install: precache shell assets and skip waiting ───────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_SHELL)
      .then(cache => cache.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete ALL old caches, claim clients immediately ───────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_SHELL && k !== CACHE_THUMBS)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // 1. Non-GET — never intercept
  if (request.method !== 'GET') return;

  // 2. Video/audio streams — bypass completely
  if (url.pathname === '/file') return;

  // 3. Thumbnails → cache-first (only change when file changes)
  if (url.pathname.startsWith('/api/thumb') ||
      url.pathname.startsWith('/api/preview')) {
    e.respondWith(cacheFirst(CACHE_THUMBS, request));
    return;
  }

  // 4. App shell + everything else → network-first (always get fresh updates)
  e.respondWith(networkFirst(request));
});

// ── Helper: cache-first (with LRU trim for thumb cache) ──────────────────────
async function cacheFirst(cacheName, request) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      trimCache(cache, THUMBS_MAX_ENTRIES);   // fire-and-forget
    }
    return response;
  } catch (_) {
    return new Response('Offline', { status: 503 });
  }
}

// LRU trim: when cache exceeds max, drop the oldest entries (FIFO order = insertion).
async function trimCache(cache, maxEntries) {
  try {
    const keys = await cache.keys();
    const overflow = keys.length - maxEntries;
    if (overflow <= 0) return;
    for (let i = 0; i < overflow; i++) await cache.delete(keys[i]);
  } catch (_) {}
}

// ── Helper: network-first ─────────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_SHELL);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
