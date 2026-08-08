import "./style.css";
import { detectCapabilities, explainNotReady } from "./capabilities";

const cap = detectCapabilities();

const rows: [string, boolean][] = [
  ["HTTPS / ngữ cảnh bảo mật", cap.https],
  ["Web Serial (navigator.serial)", cap.webSerial],
  ["WebUSB (navigator.usb)", cap.webUsb],
  ["Web Crypto (SHA-256)", cap.webCrypto],
  ["File API", cap.fileApi],
  ["Service Worker (PWA)", cap.serviceWorker],
  ["Trình duyệt nền Chromium", cap.isChromiumFamily],
];

const table = document.getElementById("checkTable")!;
table.innerHTML = rows
  .map(
    ([label, ok]) => `
    <tr>
      <td>${label}</td>
      <td><span class="tag ${ok ? "tag--ok" : "tag--bad"}">${ok ? "✓" : "✗"}</span></td>
    </tr>`
  )
  .join("");

const verdictBox = document.getElementById("verdictBox")!;
if (cap.ready) {
  verdictBox.innerHTML = `<p class="callout callout--ok" style="margin:0"><b>✓ READY TO FLASH</b><br/>Trình duyệt này có đủ API cần thiết để flash ESP32 qua USB Serial.</p>`;
} else {
  const reasons = explainNotReady(cap);
  verdictBox.innerHTML =
    `<p class="callout callout--err" style="margin:0 0 10px"><b>✗ BROWSER NOT SUPPORTED</b><br/>Thiếu ít nhất một API bắt buộc.</p>` +
    reasons.map((r) => `<p class="callout" style="margin-bottom:8px">${r}</p>`).join("");
}

const deviceKv = document.getElementById("deviceKv")!;
deviceKv.innerHTML = `
  <dt>Android</dt><dd>${cap.isAndroid ? "Có" : "Không / không xác định"}</dd>
  <dt>User agent</dt><dd style="font-size:11px">${navigator.userAgent}</dd>
`;
