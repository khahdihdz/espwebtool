# ESP32 Flash Studio

Website nạp firmware cho ESP32 / ESP32-S2 / ESP32-S3 / ESP32-C3 / ESP8266 trực tiếp từ trình duyệt, sử dụng
[Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) và thư viện chính thức
[**esp-web-tools**](https://esphome.github.io/esp-web-tools/) của ESPHome. Không cần cài đặt driver, không cần
phần mềm, không cần backend — chỉ cần Chrome hoặc Edge.

Board mặc định: **ESP32 DevKit V1 (module ESP-WROOM-32, USB‑UART Silicon Labs CP2102)**.

---

## 1. Cấu trúc thư mục

```
├── index.html               # Trang chính
├── style.css                # Toàn bộ style (dark mode, PCB theme)
├── app.js                   # Logic ứng dụng (ES2022, module)
├── manifest.webmanifest     # Web App Manifest (PWA)
├── sw.js                    # Service Worker (offline cache)
├── robots.txt / sitemap.xml # SEO
├── vercel.json               # Cấu hình deploy Vercel
├── admin/
│   ├── index.html            # Trang quản trị (mô phỏng, không backend)
│   └── admin.js
├── assets/
│   ├── icons/                 # Icon PWA, favicon
│   └── img/                   # Ảnh Open Graph
└── firmware/
    ├── boards.json            # "Cơ sở dữ liệu" board & phiên bản (JSON tĩnh)
    ├── esp32-devkit-v1/
    │   ├── v1.0.0/  (manifest.json + bootloader.bin, partitions.bin, boot_app0.bin, firmware.bin)
    │   ├── v1.1.0/  ...
    │   └── v2.0.0/  ...
    ├── esp32-s2/v1.0.0/
    ├── esp32-s3/v1.0.0/
    ├── esp32-c3/v1.0.0/
    └── esp8266/v1.0.0/
```

> **Lưu ý quan trọng:** các file `.bin` có sẵn trong `/firmware/` chỉ là **file giữ chỗ (placeholder)** để bạn
> hình dung đúng cấu trúc thư mục. Bạn **phải thay bằng firmware thật** trước khi triển khai, nếu không việc
> nạp sẽ thất bại hoặc làm hỏng thiết bị.

---

## 2. Cách thêm firmware mới

1. Biên dịch firmware của bạn (Arduino IDE, PlatformIO, ESP-IDF, ESPHome…) để lấy ra các file `.bin` cần thiết.
   Với ESP32/S2/S3/C3, thông thường bạn cần 4 file: `bootloader.bin`, `partitions.bin`, `boot_app0.bin`,
   `firmware.bin`. Với ESP8266, thường chỉ cần 1 file `firmware.bin`.
2. Tạo thư mục mới theo mẫu `firmware/<ten-board>/<phien-ban>/`, ví dụ:
   ```
   firmware/esp32-devkit-v1/v2.1.0/
   ```
3. Copy các file `.bin` vào thư mục đó.
4. Tạo file `manifest.json` trong cùng thư mục (xem mục 3 bên dưới) hoặc dùng trang **/admin** để sinh tự động.
5. Mở `firmware/boards.json`, thêm một mục mới trong `versions` của board tương ứng:
   ```json
   "v2.1.0": {
     "manifest": "firmware/esp32-devkit-v1/v2.1.0/manifest.json",
     "date": "2026-08-01",
     "notes": ["Mô tả thay đổi phiên bản này…"]
   }
   ```
6. (Tuỳ chọn) Cập nhật `defaultVersion` của board nếu đây là bản phát hành mới nhất.
7. Commit & deploy lại.

---

## 3. Cách tạo manifest.json

`manifest.json` là định dạng chuẩn do ESP Web Tools quy định:

```json
{
  "name": "Tên dự án",
  "version": "2.1.0",
  "new_install_prompt_erase": true,
  "builds": [
    {
      "chipFamily": "ESP32",
      "parts": [
        { "path": "bootloader.bin", "offset": 4096 },
        { "path": "partitions.bin", "offset": 32768 },
        { "path": "boot_app0.bin", "offset": 57344 },
        { "path": "firmware.bin", "offset": 65536 }
      ]
    }
  ]
}
```

- `chipFamily` hợp lệ: `ESP32`, `ESP32-S2`, `ESP32-S3`, `ESP32-C3`, `ESP8266`.
- `offset` của ESP32-S2 giống ESP32 (bootloader ở `0x1000`); ESP32-S3/C3 bootloader thường ở `0x0`. Luôn kiểm
  tra lại theo cấu hình biên dịch thực tế (địa chỉ có thể khác nếu bạn tuỳ biến bảng phân vùng).
- ESP8266 thường chỉ có một phần duy nhất tại `offset: 0`.

**Cách nhanh nhất:** vào trang `/admin` → tab **"Đóng gói & sinh Manifest"** → chọn chip, kéo-thả các file
`.bin` vào, bấm **"Điền offset mặc định theo chip"** rồi **"Tải manifest.json"**.

---

## 4. Cách deploy lên Vercel

1. Đẩy toàn bộ mã nguồn lên một repository GitHub/GitLab/Bitbucket.
2. Vào [vercel.com](https://vercel.com) → **Add New… → Project** → chọn repository.
3. Framework Preset: chọn **Other** (đây là site tĩnh, không cần build step).
4. Build Command: để trống. Output Directory: để trống (thư mục gốc).
5. Bấm **Deploy**. Vercel tự cấp HTTPS — bắt buộc để Web Serial API hoạt động.
6. File `vercel.json` đã cấu hình sẵn header bảo mật, cache cho `/firmware/` và `/assets/`.

**Deploy nhanh bằng CLI:**
```bash
npm i -g vercel
vercel --prod
```

---

## 5. Cách deploy lên GitHub Pages

1. Đẩy mã nguồn lên GitHub, ví dụ repo `esp32-flash-studio`.
2. Vào **Settings → Pages** → **Source**: chọn nhánh (`main`) và thư mục gốc (`/root`).
3. Lưu lại, chờ vài phút để GitHub build. Trang sẽ có tại
   `https://<ten-user>.github.io/esp32-flash-studio/`.
4. GitHub Pages phục vụ qua HTTPS mặc định nên Web Serial hoạt động bình thường.
5. Nếu deploy ở subpath (không phải domain gốc), các đường dẫn tương đối trong `index.html`/`app.js`/
   `manifest.webmanifest` đã được viết dạng tương đối (`firmware/...`, `assets/...`) nên vẫn hoạt động đúng.

---

## 6. Cách nạp firmware bằng điện thoại Android

1. Mở **Google Chrome** hoặc **Microsoft Edge** trên Android (bản mới nhất).
2. Truy cập trang web (bắt buộc HTTPS).
3. Dùng **cáp USB‑C hỗ trợ truyền dữ liệu** (không phải cáp chỉ sạc) nối điện thoại với ESP32.
4. Nếu Android hỏi quyền truy cập USB, chọn **Cho phép**.
5. Bấm **"Cài đặt Firmware"** trên trang → chọn thiết bị có tên gần giống
   `Silicon Labs CP2102 USB to UART Bridge Controller` trong hộp thoại của trình duyệt.
6. Chờ quá trình nạp hoàn tất — không tắt màn hình hoặc rút cáp giữa chừng.
7. ESP32 sẽ tự khởi động lại sau khi nạp xong.

> Nếu điện thoại không hiện hộp thoại chọn thiết bị: kiểm tra cáp, cập nhật trình duyệt, và đảm bảo bạn không
> đang mở trang trong một WebView của ứng dụng khác (Web Serial chỉ hoạt động trong trình duyệt thật).

---

## 7. Cách xử lý lỗi Web Serial thường gặp

| Lỗi / hiện tượng | Nguyên nhân thường gặp | Cách khắc phục |
|---|---|---|
| Nút "Cài đặt Firmware" bị mờ | Trình duyệt không hỗ trợ `navigator.serial`, hoặc trang không chạy HTTPS | Dùng Chrome/Edge mới nhất; đảm bảo domain có HTTPS |
| Không hiện hộp thoại chọn cổng | Cáp chỉ sạc, không hỗ trợ dữ liệu | Đổi cáp USB‑C hỗ trợ truyền dữ liệu |
| Kết nối được nhưng nạp thất bại giữa chừng | Baudrate 921600 quá cao với một số board CP2102 đời cũ, nguồn USB không đủ dòng | Trang sẽ gợi ý thử lại ở tốc độ thấp hơn (460800); thử cổng USB khác |
| Trình duyệt không nhận diện được ESP32 | Chip chưa vào chế độ nạp (bootloader mode) | Giữ **BOOT** → nhấn rồi thả **EN** → thả **BOOT**, sau đó bấm lại nút cài đặt |
| Lỗi "Failed to download manifest" | Sai đường dẫn `manifest.json` hoặc file `.bin` không tồn tại đúng vị trí | Kiểm tra lại `firmware/boards.json` và cấu trúc thư mục `/firmware/` |
| Trên iOS/Safari không dùng được | Web Serial API hiện chưa được WebKit hỗ trợ | Dùng thiết bị Android/Windows/macOS với Chrome hoặc Edge |

---

## 8. Công nghệ sử dụng

- HTML5, CSS3, JavaScript ES2022 (module, không dùng framework)
- [Bootstrap 5.3](https://getbootstrap.com/) + Bootstrap Icons
- [esp-web-tools](https://github.com/esphome/esp-web-tools) (bản `@10`, tải qua unpkg CDN) —
  Web Component `<esp-web-install-button>`
- PWA: `manifest.webmanifest` + `sw.js` (cache-first cho tài nguyên tĩnh, network-first cho dữ liệu firmware)

## 9. Trình duyệt được hỗ trợ

| Trình duyệt | Máy tính | Android |
|---|---|---|
| Google Chrome | ✅ | ✅ |
| Microsoft Edge | ✅ | ✅ |
| Firefox | ❌ (chưa hỗ trợ Web Serial) | ❌ |
| Safari / iOS (mọi trình duyệt) | ❌ | ❌ (WebKit chưa hỗ trợ Web Serial) |

## 10. Giấy phép

Mã nguồn phát hành theo giấy phép mã nguồn mở (MIT). Thư viện `esp-web-tools` thuộc bản quyền của
ESPHome / Open Home Foundation, sử dụng theo giấy phép gốc của dự án đó.
