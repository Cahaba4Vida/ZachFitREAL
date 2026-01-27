const SW_VERSION = "2026-01-27-1";
const CACHE_NAME = `zachfitapp-${SW_VERSION}`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  try {
    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/.netlify/")) {
        return; // never cache API or identity endpoints
      }
    }
  } catch (e) {
    // ignore
  }

  event.respondWith(
    caches.match(request).then((cached) =>
      cached ||
      fetch(request).then((response) => {
        // Only cache successful same-origin requests
        try {
          if (response && response.status === 200 && request.url.startsWith(self.location.origin)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
        } catch (e) {
          // best-effort caching only
        }
        return response;
      })
    )
  );
});
