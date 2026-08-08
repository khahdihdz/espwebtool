/**
 * ESP32 Flash Tool — Firmware Demo
 * ---------------------------------
 * Mục đích: firmware tối thiểu để kiểm thử toàn bộ chuỗi:
 *   Web Flash Tool (USB) -> nạp lần đầu -> Wi-Fi provisioning -> OTA qua HTTPS
 *
 * QUAN TRỌNG — vui lòng đọc trước khi coi đây là "đã kiểm chứng trên phần cứng":
 *   File này viết bằng Arduino framework (qua PlatformIO) và tuân theo đúng API
 *   công khai của arduino-esp32 (Preferences, WiFi, HTTPClient, Update, esp_ota_ops).
 *   Nó CHƯA được biên dịch/nạp thử trên phần cứng thật trong môi trường tạo ra
 *   repo này (không có toolchain xtensa ở đây). Hãy chạy `pio run` trước, sửa
 *   lỗi biên dịch nếu phiên bản arduino-esp32 bạn dùng có API khác, rồi mới nạp.
 *
 * Giới hạn được nêu rõ thay vì giả vờ không có:
 *   - ESP32 Update library (Update.h) xác minh bằng MD5, KHÔNG hỗ trợ SHA-256
 *     ở tầng ghi flash. Vì vậy manifest OTA nên cung cấp "md5"; trường "sha256"
 *     trong manifest chỉ dùng để đối chiếu thủ công/hiển thị, không được
 *     Update.h dùng để chặn ghi.
 *   - Rollback tự động qua esp_ota_mark_app_valid_cancel_rollback() chỉ thật
 *     sự có hiệu lực khi sdkconfig bật CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE —
 *     mặc định KHÔNG bật trên build Arduino/PlatformIO thông thường. Vì vậy
 *     firmware này có thêm một cơ chế rollback thủ công dựa trên bộ đếm số lần
 *     boot chưa xác nhận, hoạt động độc lập với cấu hình sdkconfig.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <ArduinoJson.h>

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "1.0.0"
#endif

static const char *AP_SSID = "ESP32-SETUP";
static const uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000;
static const uint8_t MAX_UNCONFIRMED_BOOTS = 3; // vượt quá số này -> rollback thủ công

Preferences prefs;
WebServer configServer(80);
bool wifiProvisioningMode = false;

// ---------------------------------------------------------------- rollback thủ công
// Ý tưởng: mỗi lần khởi động, tăng "boot_count". Sau khi firmware coi như chạy
// ổn định (ở đây: kết nối Wi-Fi thành công), xoá boot_count về 0 ("đã xác nhận").
// Nếu một bản OTA lỗi khiến thiết bị crash-loop trước khi tới bước xác nhận,
// boot_count sẽ vượt MAX_UNCONFIRMED_BOOTS và ta chủ động quay lại partition
// trước đó bằng esp_ota_set_boot_partition().
void rollbackGuard_onBoot() {
  uint32_t bootCount = prefs.getUInt("boot_count", 0) + 1;
  prefs.putUInt("boot_count", bootCount);
  Serial.printf("[rollback-guard] boot_count = %u\n", bootCount);

  if (bootCount > MAX_UNCONFIRMED_BOOTS) {
    Serial.println("[rollback-guard] Qua ngưỡng boot chưa xác nhận -> thử rollback về bản trước.");
    const esp_partition_t *running = esp_ota_get_running_partition();
    const esp_partition_t *other = esp_ota_get_next_update_partition(running);
    if (other != nullptr) {
      esp_err_t err = esp_ota_set_boot_partition(other);
      if (err == ESP_OK) {
        prefs.putUInt("boot_count", 0);
        Serial.println("[rollback-guard] Đã đổi boot partition. Khởi động lại...");
        delay(200);
        ESP.restart();
      } else {
        Serial.printf("[rollback-guard] esp_ota_set_boot_partition lỗi: %d\n", err);
      }
    }
  }
}

void rollbackGuard_confirmBootOk() {
  prefs.putUInt("boot_count", 0);
  // Nếu sdkconfig có bật app rollback, dòng dưới sẽ hủy trạng thái "pending
  // verify" của ESP-IDF. Nếu không bật, hàm này là no-op an toàn.
  esp_ota_mark_app_valid_cancel_rollback();
  Serial.println("[rollback-guard] Đã xác nhận firmware chạy ổn định.");
}

// ---------------------------------------------------------------- Wi-Fi provisioning
void handleRoot() {
  String html =
    "<!doctype html><html lang='vi'><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>ESP32 Wi-Fi Setup</title>"
    "<body style='font-family:sans-serif;max-width:360px;margin:32px auto;padding:0 16px'>"
    "<h2>Cấu hình Wi-Fi cho ESP32</h2>"
    "<form method='POST' action='/save'>"
    "<label>Wi-Fi SSID</label><br><input name='ssid' style='width:100%;padding:8px' required><br><br>"
    "<label>Mật khẩu</label><br><input name='pass' type='password' style='width:100%;padding:8px'><br><br>"
    "<button type='submit' style='width:100%;padding:10px'>KẾT NỐI</button>"
    "</form></body></html>";
  configServer.send(200, "text/html", html);
}

void handleSave() {
  String ssid = configServer.arg("ssid");
  String pass = configServer.arg("pass");
  if (ssid.length() == 0) {
    configServer.send(400, "text/plain", "Thiếu SSID");
    return;
  }
  prefs.putString("wifi_ssid", ssid);
  prefs.putString("wifi_pass", pass);
  configServer.send(200, "text/html", "<p>Đã lưu. ESP32 sẽ khởi động lại và kết nối Wi-Fi...</p>");
  delay(1500);
  ESP.restart();
}

void startProvisioningPortal() {
  wifiProvisioningMode = true;
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID);
  Serial.printf("[wifi] Không có Wi-Fi đã lưu. Mở AP cấu hình: %s (IP %s)\n", AP_SSID, WiFi.softAPIP().toString().c_str());
  configServer.on("/", handleRoot);
  configServer.on("/save", HTTP_POST, handleSave);
  configServer.begin();
}

bool connectSavedWifi() {
  String ssid = prefs.getString("wifi_ssid", "");
  String pass = prefs.getString("wifi_pass", "");
  if (ssid.length() == 0) return false;

  Serial.printf("[wifi] Đang kết nối tới \"%s\"...\n", ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] Connected. IP: %s  RSSI: %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    return true;
  }
  Serial.println("[wifi] Kết nối thất bại (hết thời gian chờ).");
  return false;
}

// ---------------------------------------------------------------- OTA
struct OtaManifest {
  String version;
  String url;
  String md5;    // dùng để verify thực sự (Update.h hỗ trợ MD5)
  String sha256; // chỉ để hiển thị / đối chiếu thủ công
  size_t size = 0;
};

bool fetchManifest(const String &manifestUrl, OtaManifest &out) {
  WiFiClientSecure client;
  client.setInsecure(); // DEMO ONLY — production nên dùng client.setCACert(...) với root CA thật
  HTTPClient https;
  if (!https.begin(client, manifestUrl)) return false;
  int code = https.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("[ota] Không tải được manifest, HTTP %d\n", code);
    https.end();
    return false;
  }
  String body = https.getString();
  https.end();

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.printf("[ota] Manifest không phải JSON hợp lệ: %s\n", err.c_str());
    return false;
  }
  out.version = doc["version"] | "";
  out.url = doc["url"] | "";
  out.md5 = doc["md5"] | "";
  out.sha256 = doc["sha256"] | "";
  out.size = doc["size"] | 0;
  return out.version.length() > 0 && out.url.length() > 0;
}

bool performOtaUpdate(const OtaManifest &manifest) {
  Serial.printf("[ota] Tải firmware mới: %s (v%s)\n", manifest.url.c_str(), manifest.version.c_str());

  WiFiClientSecure client;
  client.setInsecure(); // DEMO ONLY, xem ghi chú fetchManifest()
  HTTPClient https;
  if (!https.begin(client, manifest.url)) {
    Serial.println("[ota] Không mở được kết nối tải firmware.");
    return false;
  }
  int code = https.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("[ota] HTTP %d khi tải firmware.\n", code);
    https.end();
    return false;
  }

  int len = https.getSize();
  if (len <= 0) {
    Serial.println("[ota] Không xác định được kích thước firmware (Content-Length thiếu).");
    https.end();
    return false;
  }
  if (manifest.size > 0 && (size_t)len != manifest.size) {
    Serial.printf("[ota] Cảnh báo: size manifest (%u) khác Content-Length thực tế (%d).\n", (unsigned)manifest.size, len);
  }

  if (!Update.begin(len)) {
    Serial.println("[ota] Update.begin() thất bại — không đủ chỗ trên OTA partition?");
    Update.printError(Serial);
    https.end();
    return false;
  }

  if (manifest.md5.length() == 32) {
    Update.setMD5(manifest.md5.c_str());
  } else {
    Serial.println("[ota] Cảnh báo: manifest không có MD5 hợp lệ — sẽ KHÔNG xác minh checksum trước khi ghi.");
  }

  WiFiClient *stream = https.getStreamPtr();
  size_t written = Update.writeStream(*stream);
  https.end();

  if (written != (size_t)len) {
    Serial.printf("[ota] Chỉ ghi được %u / %d byte.\n", (unsigned)written, len);
    Update.abort();
    return false;
  }

  if (!Update.end()) {
    Serial.println("[ota] Update.end() báo lỗi (có thể do MD5 không khớp).");
    Update.printError(Serial);
    return false;
  }

  if (!Update.isFinished()) {
    Serial.println("[ota] Update chưa hoàn tất đúng cách.");
    return false;
  }

  Serial.println("[ota] Ghi OTA thành công. Lưu phiên bản mới và khởi động lại.");
  prefs.putString("fw_version", manifest.version);
  prefs.putUInt("boot_count", 0); // reset bộ đếm để lần boot tới được tính là "mới"
  delay(300);
  ESP.restart();
  return true; // không thực sự tới đây
}

void checkForOtaUpdate(const String &manifestUrl) {
  OtaManifest manifest;
  if (!fetchManifest(manifestUrl, manifest)) {
    Serial.println("[ota] Không kiểm tra được bản cập nhật.");
    return;
  }
  String current = prefs.getString("fw_version", FIRMWARE_VERSION);
  if (manifest.version == current) {
    Serial.printf("[ota] Đã ở bản mới nhất (%s).\n", current.c_str());
    return;
  }
  Serial.printf("[ota] Có bản mới: %s (đang chạy %s). Bắt đầu cập nhật...\n", manifest.version.c_str(), current.c_str());
  performOtaUpdate(manifest);
}

// ---------------------------------------------------------------- setup / loop
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println("ESP32 Flash Tool Demo");
  Serial.printf("Version: %s\n", FIRMWARE_VERSION);
  Serial.println("ESP32 boot OK");

  prefs.begin("esp32ft", false);
  if (prefs.getString("fw_version", "").length() == 0) {
    prefs.putString("fw_version", FIRMWARE_VERSION);
  }

  rollbackGuard_onBoot();

  bool wifiOk = connectSavedWifi();
  if (!wifiOk) {
    startProvisioningPortal();
    return; // vòng loop() sẽ chỉ phục vụ config portal cho tới khi có Wi-Fi
  }

  // Wi-Fi kết nối được coi là dấu hiệu "firmware ổn định" cho demo này.
  rollbackGuard_confirmBootOk();

  Serial.println("Wi-Fi: Connected");
  Serial.println("OTA: Ready");

  // Đặt URL manifest thật của bạn ở đây (hoặc đọc từ Preferences nếu muốn cấu
  // hình qua config portal thay vì hard-code).
  const char *manifestUrl = "https://example.com/firmware/manifest.json";
  checkForOtaUpdate(manifestUrl);
}

void loop() {
  if (wifiProvisioningMode) {
    configServer.handleClient();
    return;
  }
  // Nơi đặt logic ứng dụng thật của bạn.
  delay(1000);
}
