/**
 * Kiểm tra khả năng thực tế của trình duyệt — không bao giờ giả định
 * Web Serial / WebUSB tồn tại chỉ vì đang chạy Chrome trên Android.
 * Mọi nơi trong app gọi flow flash đều phải đi qua các cờ này trước.
 */

export interface CapabilityReport {
  https: boolean;
  webSerial: boolean;
  webUsb: boolean;
  webCrypto: boolean;
  serviceWorker: boolean;
  fileApi: boolean;
  isAndroid: boolean;
  isChromiumFamily: boolean;
  ready: boolean; // true nếu đủ điều kiện flash qua USB Serial
}

export function detectCapabilities(): CapabilityReport {
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  // Web Serial / WebUSB hiện chỉ được Chromium (Chrome, Edge, Brave, Opera, Samsung
  // Internet bản mới) hỗ trợ. Firefox và Safari (kể cả trên Android) KHÔNG hỗ trợ,
  // dù trang có HTTPS và code không lỗi gì.
  const isChromiumFamily = /Chrome|Chromium|CriOS|Edg\//i.test(ua) && !/Firefox|FxiOS/i.test(ua);

  const https = window.isSecureContext === true;
  const webSerial = typeof (navigator as any).serial !== "undefined";
  const webUsb = typeof (navigator as any).usb !== "undefined";
  const webCrypto = typeof window.crypto !== "undefined" && typeof window.crypto.subtle !== "undefined";
  const serviceWorker = "serviceWorker" in navigator;
  const fileApi = typeof window.File !== "undefined" && typeof window.FileReader !== "undefined";

  return {
    https,
    webSerial,
    webUsb,
    webCrypto,
    serviceWorker,
    fileApi,
    isAndroid,
    isChromiumFamily,
    ready: https && webSerial && webCrypto && fileApi,
  };
}

/** Thông điệp giải thích lý do không sẵn sàng + fallback đề xuất, bằng tiếng Việt. */
export function explainNotReady(cap: CapabilityReport): string[] {
  const reasons: string[] = [];
  if (!cap.https) {
    reasons.push(
      "Trang chưa chạy trên HTTPS (hoặc localhost). Web Serial API bị trình duyệt chặn hoàn toàn ở " +
        "ngữ cảnh không bảo mật — đây là giới hạn của trình duyệt, không phải lỗi của công cụ này."
    );
  }
  if (!cap.webSerial) {
    reasons.push(
      "Trình duyệt hiện tại không cung cấp navigator.serial. Web Serial API mới chỉ được các trình duyệt " +
        "nền Chromium (Chrome, Edge, Brave, Cốc Cốc bản Chromium, Samsung Internet bản mới) hỗ trợ. " +
        "Firefox và Safari trên Android KHÔNG hỗ trợ, kể cả khi có HTTPS."
    );
    reasons.push(
      "Phương án thay thế: mở trang này bằng Chrome for Android, hoặc dùng một WebView Android tuỳ chỉnh " +
        "có bật USB Host bridge (xem trang /help), hoặc dùng Termux + esptool trên máy."
    );
  }
  if (!cap.webCrypto) {
    reasons.push("Thiếu Web Crypto API (crypto.subtle) nên không thể tính SHA-256 để xác minh firmware.");
  }
  if (!cap.fileApi) {
    reasons.push("Thiếu File API nên không thể đọc file firmware .bin từ máy.");
  }
  return reasons;
}
