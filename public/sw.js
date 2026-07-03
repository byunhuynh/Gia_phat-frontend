// ==========================================
// Service Worker cho DMS (FIXED)
// Chỉ cache static file, không cache API
// ==========================================

const CACHE_NAME = "nm-dms-v2"; // 🔥 đổi version để clear cache cũ

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // 🔥 Không cache nếu là API

  if (
    request.url.includes("/api") ||
    request.url.includes("/me") ||
    request.url.includes("/refresh")
  ) {
    // 🔥 Không cache nếu có Authorization header
    if (request.headers.has("Authorization")) {
      return;
    }

    // 🔥 Chỉ cache file tĩnh
    if (
      request.destination === "script" ||
      request.destination === "style" ||
      request.destination === "image" ||
      request.destination === "font"
    ) {
      event.respondWith(
        caches.match(request).then((cached) => {
          return (
            cached ||
            fetch(request).then((response) => {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, clone);
              });
              return response;
            })
          );
        }),
      );
    }
  }
});
