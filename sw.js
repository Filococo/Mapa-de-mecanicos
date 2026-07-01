const CACHE_NAME = 'panne-v5';
const DATA_CACHE = 'panne-data-v5';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Install: pre-cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// Activate: limpiar caches antiguas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== DATA_CACHE)
            .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isSupabase = url.hostname.includes('supabase.co');
  const isHTML = isSameOrigin && (url.pathname.endsWith('/') || url.pathname.endsWith('index.html'));

  // Shell HTML: network-first, fallback a cache
  if (isHTML) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets propios (iconos, manifest): cache-first
  if (isSameOrigin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Supabase API: network-first, fallback a cache de datos
  if (isSupabase) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Solo cachear GETs exitosos de mecanicos
          if (event.request.method === 'GET' && url.pathname.includes('mecanicos')) {
            const clone = response.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Sin internet: responder con datos cacheados
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            // Respuesta de emergencia si no hay nada cacheado
            return new Response(
              JSON.stringify({ data: [], error: { message: 'Sin conexión a internet' } }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Recursos externos (fonts, CDN): network-first con fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
