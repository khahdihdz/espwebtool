export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Chỉ đăng ký khi chạy qua HTTPS/localhost — navigator.serviceWorker vốn đã
  // không tồn tại trong ngữ cảnh không bảo mật nên đây chủ yếu là an toàn kép.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((err) => {
      console.warn("Không đăng ký được service worker:", err);
    });
  });
}
