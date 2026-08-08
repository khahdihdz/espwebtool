# ESP32 Flash Tool

Nạp firmware cho **ESP32 DevKit V1** trực tiếp từ **điện thoại Android + cáp USB OTG** —
không cần máy tính cho lần nạp đầu tiên. Sau lần nạp đầu, firmware trên ESP32 tự cập nhật
qua Wi-Fi bằng OTA, cũng không cần USB/PC.

```
Android (Chrome) ──USB OTG──▶ ESP32 DevKit V1 (CP2102/CH340)
        │
        ▼
  Web Serial API ──▶ esptool-js ──▶ ESP32 ROM Bootloader
```

## Mục đích

Một web app chạy hoàn toàn phía trình duyệt (không có backend xử lý firmware) giao tiếp
trực tiếp với ROM bootloader của ESP32 qua Web Serial API, dùng thư viện chính thức
[`esptool-js`](https://github.com/espressif/esptool-js) của Espressif — **không tự phát
minh lại giao thức bootloader**.

## Tính năng

- Kết nối / ngắt kết nối ESP32 qua USB Serial (CP2102, CH340, CH341...)
- Đọc thông tin chip: tên chip, MAC, dung lượng flash, tần số thạch anh, tính năng
- Xoá flash (chip erase)
- Chọn 1 hoặc nhiều file `.bin` với offset tuỳ chỉnh (mặc định `0x10000` cho app image;
  hỗ trợ thêm dòng cho `bootloader.bin @0x1000`, `partitions.bin @0x8000`)
- Kiểm tra magic byte `0xE9` của ESP image trước khi cho phép flash — không flash file
  không hợp lệ
- Flash với tiến trình thời gian thực (thanh trace dạng sóng)
- **Verify thật**: MD5 được tính cục bộ và so với MD5 mà chính ESP32 đọc lại từ flash
  (không chỉ tin lệnh ghi trả về "thành công")
- Log console có thể copy/xoá
- Trang `/system-check`: tự kiểm tra HTTPS, Web Serial, WebUSB, Web Crypto, File API,
  Service Worker
- Trang `/ota`: kiểm tra bản cập nhật từ một `manifest.json` (thiết bị mới là bên thực sự
  tải & ghi OTA, trang này chỉ hiển thị)
- Trang `/help`: hướng dẫn, xử lý lỗi, giới hạn WebUSB/Web Serial trên Android, fallback
- PWA: cài vào màn hình chính, có dark/light theo hệ thống

## Phần cứng

- ESP32 DevKit V1 (ESP32-WROOM-32, 30 chân)
- USB-UART: CP2102 / CP210x hoặc CH340 / CH341
- Điện thoại Android hỗ trợ USB OTG (USB Host)
- Cáp USB OTG **có dây dữ liệu** (không phải cáp chỉ sạc)

## Tương thích trình duyệt (đọc kỹ trước khi dùng)

Web Serial API **chỉ** chạy trên trình duyệt nền Chromium:

| Trình duyệt Android          | Hỗ trợ |
|-------------------------------|--------|
| Chrome for Android            | ✅ |
| Edge / Brave / Cốc Cốc (Chromium) | ✅ (thường có) |
| Samsung Internet (bản mới)    | ⚠️ tuỳ phiên bản |
| Firefox for Android           | ❌ |
| Bất kỳ trình duyệt nào trên iOS/iPadOS (kể cả Chrome iOS, dùng engine WebKit bắt buộc) | ❌ |

Trang bắt buộc chạy qua **HTTPS** (hoặc `localhost` khi dev) — nếu không, `navigator.serial`
sẽ không tồn tại, không phải do lỗi code. Dùng trang `/system-check` để tự kiểm tra thiết bị
của bạn thay vì đoán.

## Giới hạn thực tế của WebUSB/Web Serial trên Android

- Không có quyền truy cập `/dev/bus/usb` trực tiếp từ JavaScript — mọi thứ phải qua API
  do trình duyệt cấp, đúng như thiết kế sandbox của nền tảng.
- Người dùng phải chọn thiết bị qua hộp thoại hệ thống mỗi phiên, không thể tự động kết
  nối lại ngầm.
- Một số ROM Android tuỳ biến hoặc trình duyệt mặc định của hãng máy có thể giới hạn thêm
  quyền USB ngoài chuẩn Chromium.
- Nếu trình duyệt không hỗ trợ, **không có cách nào để một web app thuần vượt qua** giới
  hạn này — cần chuyển sang kiến trúc khác (xem mục Fallback bên dưới).

## Fallback khi trình duyệt không hỗ trợ

1. **Android WebView tuỳ biến + USB Host API** — đóng gói trang trong app WebView, dùng
   Android USB Host API (Kotlin/Java) làm cầu nối tới CP2102/CH340, expose qua
   `addJavascriptInterface`.
2. **Termux bridge** — cài Termux + `esptool`/`pyserial`, flash bằng dòng lệnh thật trên
   chính điện thoại.
3. **ESP Web Tools** — nếu firmware đã đóng gói theo chuẩn manifest của ESP Web Tools và
   trình duyệt có Web Serial, có thể dùng công cụ có sẵn thay vì trang này.

## Cấu trúc project

```
esp32-web-flasher/
├── index.html              # trang Flash chính
├── ota.html                 # OTA dashboard (kiểm tra manifest, không tự flash qua web)
├── help.html                 # hướng dẫn + troubleshooting (tĩnh)
├── system-check.html         # tự kiểm tra tương thích trình duyệt
├── src/
│   ├── main.ts                # logic trang Flash (kết nối, erase, flash, verify, log)
│   ├── ota.ts                  # logic trang OTA
│   ├── system-check.ts         # logic trang kiểm tra
│   ├── flasher.ts               # bọc esptool-js: connect/erase/writeFlash/verify/reset
│   ├── firmware.ts               # parse ESP image header, SHA-256, offset parsing
│   ├── capabilities.ts            # feature detection Web Serial/WebUSB/crypto...
│   ├── logger.ts                   # log console + IEspLoaderTerminal cho esptool-js
│   ├── pwa.ts                       # đăng ký service worker
│   └── style.css                     # design tokens (giao diện "bench instrument")
├── public/
│   ├── manifest.json
│   ├── service-worker.js
│   ├── favicon.svg
│   └── icons/
├── firmware-demo/
│   ├── platformio.ini
│   └── src/main.cpp            # firmware demo: Wi-Fi provisioning + OTA + rollback
├── vite.config.ts
├── package.json
└── README.md
```

## Chạy local

```bash
npm install
npm run dev
```

Mở bằng Chrome for Android trỏ tới IP máy dev qua HTTPS, hoặc dùng
`npm run build && npm run preview` rồi expose qua một tunnel HTTPS (vd. `cloudflared
tunnel`, `ngrok`) vì Web Serial cần HTTPS thật trên thiết bị không phải localhost.

```bash
npm run build     # build production -> dist/
npm run preview   # xem thử bản build
```

## Deploy

### Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Không cần biến môi trường, không cần server riêng — toàn bộ flash chạy trong trình duyệt.

### Vercel

- Framework Preset: **Vite**
- Build Command: `npm run build`
- Output Directory: `dist`

Cả hai đều tự cấp HTTPS, thoả điều kiện bắt buộc của Web Serial API.

## Hướng dẫn sử dụng trên Android

1. Cắm ESP32 vào điện thoại bằng cáp USB OTG.
2. Mở trang bằng Chrome for Android.
3. Vào `/index.html`, bấm **Kết nối ESP32**, chọn đúng thiết bị trong hộp thoại hệ thống.
4. Nếu không tự vào bootloader được (Auto Boot qua DTR/RTS thất bại — một số board rời
   không nối đúng chân):
   - Giữ **BOOT**
   - Nhấn rồi thả **RESET/EN**
   - Thả **BOOT**
   - Bấm lại "Kết nối ESP32"
5. Chọn `firmware.bin`, kiểm tra offset (mặc định `0x10000`).
6. Bấm **Flash Firmware**, chờ tới khi log báo `SUCCESS` và có `VERIFY SUCCESS`.

## Hướng dẫn build firmware demo

```bash
cd firmware-demo
pio run                       # biên dịch
pio run -t upload             # (tuỳ chọn) nạp qua USB nếu bạn có PC lúc này
```

File cần cho lần nạp đầu qua Web Flash Tool (đường dẫn output của PlatformIO):

| File | Offset |
|---|---|
| `.pio/build/esp32dev/bootloader.bin` | `0x1000` |
| `.pio/build/esp32dev/partitions.bin` | `0x8000` |
| `.pio/build/esp32dev/firmware.bin` | `0x10000` |

> Firmware demo trong repo này viết theo đúng API công khai của arduino-esp32 nhưng **chưa
> được biên dịch/nạp thử trên phần cứng thật** trong môi trường tạo ra repo (không có
> toolchain xtensa ở đây). Hãy chạy `pio run` và sửa các lỗi biên dịch có thể phát sinh do
> khác phiên bản arduino-esp32/PlatformIO trước khi nạp lên board thật.

Để tạo `firmware-v1.0.1.bin` cho việc test OTA: đổi `build_flags` trong `platformio.ini`
thành `-D FIRMWARE_VERSION=\"1.0.1\"` rồi `pio run` lại — bạn sẽ có hai bản `.bin` khác
version để thử luồng "có bản mới → tải → verify → ghi → reboot".

## Hướng dẫn OTA

1. Sau lần flash đầu, nếu chưa có Wi-Fi đã lưu, ESP32 tự mở AP `ESP32-SETUP`.
2. Kết nối điện thoại vào AP đó, mở `192.168.4.1`, nhập SSID/mật khẩu Wi-Fi nhà bạn.
3. ESP32 khởi động lại, kết nối Wi-Fi, tự kiểm tra `manifest.json` bạn cấu hình trong
   `firmware-demo/src/main.cpp` (biến `manifestUrl`).
4. Nếu có bản mới: thiết bị tự tải qua HTTPS, xác minh MD5 (`Update.setMD5`), ghi vào OTA
   partition, rồi khởi động lại.
5. Có cơ chế rollback thủ công dựa trên bộ đếm số lần boot chưa xác nhận — nếu bản mới
   crash-loop trước khi Wi-Fi kết nối thành công, thiết bị tự quay lại partition cũ.

### Định dạng `manifest.json`

```json
{
  "version": "1.0.1",
  "url": "https://github.com/you/repo/releases/download/v1.0.1/firmware-v1.0.1.bin",
  "md5": "d41d8cd98f00b204e9800998ecf8427e",
  "sha256": "…",
  "size": 1490000,
  "notes": "Sửa lỗi kết nối Wi-Fi"
}
```

Có thể host trên **GitHub Releases** (đính kèm `manifest.json` cùng file `.bin` trong cùng
release).

## Giới hạn về xác minh OTA cần biết

- `Update.h` của ESP32 Arduino core xác minh bằng **MD5**, không hỗ trợ SHA-256 ở tầng ghi
  flash — vì vậy manifest nên có trường `md5` để firmware thực sự chặn ghi khi sai lệch;
  trường `sha256` trong manifest chủ yếu để hiển thị/đối chiếu thủ công ở trang `/ota`.
- Rollback tự động qua `esp_ota_mark_app_valid_cancel_rollback()` chỉ có hiệu lực khi
  sdkconfig bật `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE` — mặc định **không** bật trên build
  Arduino/PlatformIO thông thường. Firmware demo có thêm cơ chế rollback thủ công (đếm số
  lần boot chưa xác nhận) hoạt động độc lập với cấu hình sdkconfig, xem `main.cpp`.
- `WiFiClientSecure::setInsecure()` trong firmware demo bỏ qua xác minh chứng chỉ TLS —
  chỉ để demo chạy được ngay không cần nạp root CA. **Không dùng trong production**; hãy
  thay bằng `client.setCACert(...)` với root CA thật của máy chủ firmware.

## Troubleshooting

Xem đầy đủ tại trang `/help` trong app (bằng tiếng Việt, đúng các lỗi trong spec gốc):
không tìm thấy thiết bị, không vào được bootloader, permission denied, verify failed, USB
bị rút giữa chừng, trình duyệt không hỗ trợ API.

## Checklist kiểm thử thực tế

- [ ] Android nhận USB
- [ ] Browser nhận USB (hộp thoại chọn cổng hiện ra)
- [ ] ESP32 bootloader sync
- [ ] Detect đúng chip ESP32
- [ ] Đọc MAC
- [ ] Đọc flash size
- [ ] Erase
- [ ] Flash
- [ ] Verify (MD5 khớp)
- [ ] Reset, ESP32 boot vào firmware mới
- [ ] Wi-Fi provisioning qua AP `ESP32-SETUP`
- [ ] OTA phát hiện bản mới
- [ ] OTA verify MD5 trước khi ghi
- [ ] OTA rollback khi firmware mới crash-loop

## Giấy phép

MIT — xem `LICENSE`.
