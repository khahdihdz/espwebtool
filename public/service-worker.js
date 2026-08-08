// Service worker cho ESP32 Flash Tool.
// Chỉ cache tài nguyên tĩnh (HTML/CSS/JS/icon) để app hoạt động như PWA khi
// mất mạng — KHÔNG can thiệp gì vào luồng USB Serial, việc đó chạy hoàn toàn
// trong tab và không đi qua service worker.

const CACHE_NAME = "esp32-flash-tool-v1";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/ota.html",
  "/help.html",
  "/system-check.html",
  "/manifest.json",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // không cache OTA/firmware server ngoài

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
