const CACHE_NAME = "dcamisas-cache-v5.8";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/styles.css",
  "./src/logo-data.min.js",
  "./src/data-demo.min.js",
  "./src/sheets-api.min.js",
  "./src/app.min.js",
  "./public/logo.jpg",
  "./public/icon-192.png",
  "./public/icon-512.png"
];

// Instalación del Service Worker con actualización inmediata
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log("Cache addAll notice:", err));
    })
  );
});

// Activación y limpieza de caches antiguos
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("Limpiando versión antigua de caché:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptor de peticiones
self.addEventListener("fetch", (e) => {
  // Ignorar llamadas directas a la API de Google Apps Script (esas siempre deben ser en vivo)
  if (e.request.url.includes("script.google.com")) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    }).catch(() => {
      return caches.match("./index.html");
    })
  );
});
