// =====================================================================
// Service Worker — ESP32 Flash Studio
// Chiến lược cache:
//  - Tài nguyên giao diện (HTML/CSS/JS/icon): cache-first, có làm mới nền
//  - Dữ liệu firmware (boards.json, manifest.json, *.bin): network-first
//    để luôn ưu tiên bản mới nhất, chỉ dùng cache khi mất mạng
// =====================================================================

const CACHE_VERSION = "esp32-flash-studio-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isFirmwareData(url) {
  return url.pathname.includes("/firmware/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Dữ liệu firmware: network-first, dự phòng bằng cache khi offline
  if (url.origin === location.origin && isFirmwareData(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Tài nguyên tĩnh cùng gốc: cache-first, làm mới nền (stale-while-revalidate)
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
