// =====================================================================
// ESP32 Flash Studio — app.js
// Toàn bộ logic chạy phía client, không cần backend.
// Sử dụng thư viện chính thức esp-web-tools (<esp-web-install-button>)
// để nạp firmware qua Web Serial API.
// =====================================================================

/* ---------------------------------------------------------------------
 * 0. TIỆN ÍCH DÙNG CHUNG
 * ------------------------------------------------------------------- */

/** Hiển thị Toast Notification (Bootstrap 5) */
function showToast(message, variant = "info", title = "Thông báo") {
  const icons = {
    info: "bi-info-circle-fill",
    success: "bi-check-circle-fill",
    warning: "bi-exclamation-triangle-fill",
    danger: "bi-x-octagon-fill",
  };
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "alert");
  el.innerHTML = `
    <div class="toast-header">
      <i class="bi ${icons[variant] || icons.info} me-2"></i>
      <strong class="me-auto">${title}</strong>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
    </div>
    <div class="toast-body">${message}</div>`;
  container.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 4500 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

/** Ghi một dòng vào bảng nhật ký (log console) */
function appendLog(line) {
  const logOutput = document.getElementById("logOutput");
  const time = new Date().toLocaleTimeString("vi-VN", { hour12: false });
  if (logOutput.dataset.empty === "1") {
    logOutput.textContent = "";
    logOutput.dataset.empty = "0";
  }
  logOutput.textContent += `[${time}] ${line}\n`;
  logOutput.scrollTop = logOutput.scrollHeight;
}
document.getElementById("logOutput").dataset.empty = "1";

/* ---------------------------------------------------------------------
 * 1. KIỂM TRA MÔI TRƯỜNG TRÌNH DUYỆT
 * ------------------------------------------------------------------- */

const env = {
  isSecureContext: window.isSecureContext === true,
  isHttps: location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1",
  hasSerial: "serial" in navigator,
  hasUsb: "usb" in navigator,
  isAndroid: /Android/i.test(navigator.userAgent),
  browserName: (() => {
    const ua = navigator.userAgent;
    if (/EdgA|Edge|Edg\//i.test(ua)) return "Microsoft Edge";
    if (/Chrome/i.test(ua) && !/OPR|Brave/i.test(ua)) return "Google Chrome";
    if (/Firefox/i.test(ua)) return "Mozilla Firefox";
    if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
    return "Không xác định";
  })(),
};

function renderEnvironmentChecks() {
  // Console card ở hero
  const setStat = (id, text, ok) => {
    const elm = document.getElementById(id);
    elm.textContent = text;
    elm.classList.toggle("ok", ok === true);
    elm.classList.toggle("bad", ok === false);
  };
  setStat("statBrowser", `${env.browserName}${env.isAndroid ? " · Android" : ""}`, env.hasSerial);
  setStat("statSerial", env.hasSerial ? "Được hỗ trợ" : "Không hỗ trợ", env.hasSerial);
  setStat("statHttps", env.isHttps ? "Đã bảo mật" : "Chưa bảo mật", env.isHttps);

  // Banner cảnh báo nếu không hỗ trợ Web Serial
  const canFlash = env.hasSerial && env.isHttps;
  const banner = document.getElementById("unsupportedBanner");
  const reasonEl = document.getElementById("unsupportedReason");
  if (!canFlash) {
    banner.style.display = "block";
    const reasons = [];
    if (!env.hasSerial) reasons.push("Trình duyệt của bạn không hỗ trợ Web Serial API");
    if (!env.isHttps) reasons.push("Trang không được tải qua kết nối HTTPS (secure context)");
    reasonEl.textContent = "Nguyên nhân: " + reasons.join("; ") + ".";
  } else {
    banner.style.display = "none";
  }

  // Bảng "Kiểm tra hệ thống" chi tiết
  const items = [
    {
      icon: "bi-hdd-network",
      title: "Kết nối HTTPS",
      ok: env.isHttps,
      okText: "Trang đang chạy trên kết nối bảo mật.",
      badText: "Web Serial yêu cầu HTTPS (hoặc localhost) mới hoạt động.",
    },
    {
      icon: "bi-usb-symbol",
      title: "Web Serial API",
      ok: env.hasSerial,
      okText: "Trình duyệt hỗ trợ giao tiếp cổng Serial.",
      badText: "Hãy dùng Chrome hoặc Edge phiên bản mới nhất.",
    },
    {
      icon: "bi-plug",
      title: "WebUSB API",
      ok: env.hasUsb,
      okText: "Trình duyệt hỗ trợ giao tiếp USB trực tiếp.",
      badText: "Không bắt buộc để nạp firmware, nhưng nên có để tương thích tối đa.",
    },
    {
      icon: "bi-shield-lock",
      title: "Ngữ cảnh bảo mật (Secure Context)",
      ok: env.isSecureContext,
      okText: "Trang thoả điều kiện bảo mật của trình duyệt.",
      badText: "Trình duyệt chặn Web Serial vì trang không an toàn.",
    },
  ];

  const grid = document.getElementById("checklistGrid");
  grid.innerHTML = items
    .map(
      (it) => `
      <div class="col-sm-6 col-lg-3">
        <div class="check-item ${it.ok ? "ok" : "bad"}">
          <i class="bi ${it.ok ? "bi-check-circle-fill" : "bi-x-circle-fill"} check-icon"></i>
          <div>
            <h6>${it.title}</h6>
            <p>${it.ok ? it.okText : it.badText}</p>
          </div>
        </div>
      </div>`
    )
    .join("");

  return canFlash;
}

const canFlash = renderEnvironmentChecks();

/* ---------------------------------------------------------------------
 * 2. TẢI DANH SÁCH BOARD / PHIÊN BẢN TỪ firmware/boards.json
 * ------------------------------------------------------------------- */

let boardsData = null;
let currentBoardKey = null;
let currentVersionKey = null;

async function loadBoards() {
  try {
    const res = await fetch("firmware/boards.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    boardsData = await res.json();
  } catch (err) {
    appendLog("Lỗi tải firmware/boards.json: " + err.message);
    showToast("Không thể tải danh sách firmware. Vui lòng kiểm tra lại kết nối.", "danger", "Lỗi tải dữ liệu");
    return;
  }

  const selBoard = document.getElementById("selBoard");
  selBoard.innerHTML = Object.entries(boardsData.boards)
    .map(([key, b]) => `<option value="${key}">${b.label}</option>`)
    .join("");
  selBoard.value = boardsData.defaultBoard;

  populateVersions(boardsData.defaultBoard);
  selectBoard(boardsData.defaultBoard, boardsData.boards[boardsData.defaultBoard].defaultVersion);

  selBoard.addEventListener("change", (e) => {
    const boardKey = e.target.value;
    populateVersions(boardKey);
    selectBoard(boardKey, boardsData.boards[boardKey].defaultVersion);
  });

  document.getElementById("selVersion").addEventListener("change", (e) => {
    selectBoard(currentBoardKey, e.target.value);
  });
}

function populateVersions(boardKey) {
  const board = boardsData.boards[boardKey];
  const selVersion = document.getElementById("selVersion");
  selVersion.innerHTML = Object.keys(board.versions)
    .map((v) => `<option value="${v}">${v}${v === board.defaultVersion ? " (mới nhất)" : ""}</option>`)
    .join("");
  selVersion.value = board.defaultVersion;
}

function selectBoard(boardKey, versionKey) {
  currentBoardKey = boardKey;
  currentVersionKey = versionKey;
  const board = boardsData.boards[boardKey];
  const version = board.versions[versionKey];

  // Cập nhật metadata
  document.getElementById("metaModule").textContent = board.module;
  document.getElementById("metaUsb").textContent = board.usbChip;
  document.getElementById("metaFlash").textContent = board.flashSize;
  document.getElementById("metaBaud").textContent =
    `${board.baudrate.toLocaleString("vi-VN")} bps (dự phòng ${board.fallbackBaudrate.toLocaleString("vi-VN")})`;

  // Cập nhật release notes
  document.getElementById("badgeVersion").textContent = versionKey;
  document.getElementById("releaseDate").textContent = "Ngày phát hành: " + (version.date || "—");
  document.getElementById("releaseList").innerHTML = version.notes.map((n) => `<li>${n}</li>`).join("");

  // Cập nhật manifest cho esp-web-install-button — đây là cách chính thức
  // để đổi firmware sẽ được nạp (theo tài liệu esp-web-tools)
  const installBtn = document.getElementById("espInstall");
  installBtn.setAttribute("manifest", version.manifest);

  appendLog(`Đã chọn board "${board.label}" — phiên bản ${versionKey}.`);
}

loadBoards();

/* ---------------------------------------------------------------------
 * 3. ĐIỀU KHIỂN <esp-web-install-button> (thư viện chính thức esp-web-tools)
 * ------------------------------------------------------------------- */

const espInstall = document.getElementById("espInstall");
const espActivate = document.getElementById("espActivate");
const btnInstall = document.getElementById("btnInstall");
const flashState = document.getElementById("flashState");
const flashProgress = document.getElementById("flashProgress");

// Bản đồ trạng thái nội bộ của esp-web-tools -> giao diện tiếng Việt.
// Lưu ý: esp-web-tools phát ra sự kiện "state-changed" trên chính thẻ
// <esp-web-install-button>; ta xử lý một cách "phòng thủ" (defensive)
// vì tên trường chi tiết có thể khác nhau giữa các phiên bản.
const STATE_MAP = {
  initializing: { icon: "bi-usb-plug", text: "Đang khởi tạo kết nối…", pill: "connecting" },
  manifest: { icon: "bi-file-earmark-arrow-down", text: "Đang tải manifest firmware…", pill: "connecting" },
  preparing: { icon: "bi-usb-plug-fill", text: "Đang chuẩn bị thiết bị…", pill: "connected" },
  erasing: { icon: "bi-eraser-fill", text: "Đang xoá bộ nhớ flash…", pill: "installing" },
  writing: { icon: "bi-cloud-arrow-down-fill", text: "Đang nạp firmware…", pill: "installing" },
  finished: { icon: "bi-check-circle-fill", text: "Đã hoàn thành!", pill: "done" },
  error: { icon: "bi-x-octagon-fill", text: "Đã xảy ra lỗi", pill: "error" },
};

function setFlashPill(iconClass, text, state) {
  flashState.dataset.state = state;
  flashState.querySelector(".status-pill__icon").innerHTML = `<i class="bi ${iconClass}"></i>`;
  flashState.querySelector(".status-pill__text").textContent = text;
}

// Nút "Cài đặt Firmware" của chúng ta chỉ chuyển tiếp click sang nút
// "activate" thật sự nằm bên trong esp-web-install-button.
btnInstall.addEventListener("click", () => {
  if (!canFlash) {
    showToast(
      "Trình duyệt hiện chưa hỗ trợ Web Serial. Vui lòng cập nhật Google Chrome lên phiên bản mới nhất hoặc dùng Microsoft Edge.",
      "warning",
      "Không thể cài đặt"
    );
    return;
  }
  appendLog("Người dùng bấm 'Cài đặt Firmware' — đang mở hộp thoại chọn cổng Serial…");
  espActivate.click();
});

espInstall.addEventListener("state-changed", (ev) => {
  const detail = ev.detail || {};
  const state = detail.state || "unknown";
  const message = detail.message || "";
  const map = STATE_MAP[state];

  appendLog(`Trạng thái: ${state}${message ? " — " + message : ""}`);

  if (map) {
    setFlashPill(map.icon, message || map.text, map.pill);
  } else if (message) {
    setFlashPill("bi-info-circle", message, "connected");
  }

  // Tiến trình phần trăm (nếu esp-web-tools cung cấp trong detail)
  if (typeof detail.progress === "number") {
    const pct = Math.round(detail.progress * (detail.progress <= 1 ? 100 : 1));
    flashProgress.style.width = pct + "%";
    flashProgress.textContent = pct + "%";
    flashProgress.parentElement.setAttribute("aria-valuenow", String(pct));
  }

  if (state === "preparing" || state === "manifest" || state === "initializing") {
    document.getElementById("statDevice").textContent = "Đang kết nối…";
    document.getElementById("statDevice").classList.remove("bad");
  }

  if (state === "erasing" || state === "writing") {
    document.getElementById("statDevice").textContent = "Silicon Labs CP2102 USB to UART Bridge Controller";
    document.getElementById("statDevice").classList.add("ok");
    showToast("Đang nạp firmware, vui lòng không rút cáp…", "info", "Đang nạp");
  }

  if (state === "finished") {
    flashProgress.style.width = "100%";
    flashProgress.textContent = "100%";
    showToast("Nạp firmware thành công! ESP32 sẽ tự khởi động lại.", "success", "Hoàn tất");
    const doneModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("doneModal"));
    doneModal.show();
  }

  if (state === "error") {
    showToast(
      "Nạp firmware thất bại: " + (message || "Lỗi không xác định") + ". Đang thử giảm tốc độ baudrate…",
      "danger",
      "Lỗi khi nạp"
    );
    handleFlashErrorFallback();
  }
});

/**
 * Khi gặp lỗi trong lúc nạp (thường do baudrate quá cao với board CP2102 đời cũ),
 * hướng dẫn người dùng thử lại — esp-web-tools sẽ tự thương lượng tốc độ thấp hơn
 * ở lần kết nối tiếp theo (461600 bps) nếu 921600 bps không ổn định.
 */
let fallbackNotified = false;
function handleFlashErrorFallback() {
  if (fallbackNotified) return;
  fallbackNotified = true;
  const board = boardsData?.boards?.[currentBoardKey];
  appendLog(
    `Gợi ý: thử lại với baudrate dự phòng ${board ? board.fallbackBaudrate : 460800} bps hoặc đưa board vào chế độ nạp thủ công (giữ BOOT → nhấn EN → thả EN → thả BOOT).`
  );
}

/* ---------------------------------------------------------------------
 * 4. NÚT "KIỂM TRA CẬP NHẬT"
 * ------------------------------------------------------------------- */

document.getElementById("btnCheckUpdate").addEventListener("click", () => {
  if (!boardsData) return;
  const board = boardsData.boards[currentBoardKey];
  const latest = board.defaultVersion;
  appendLog(`Kiểm tra cập nhật cho "${board.label}" — phiên bản đang chọn: ${currentVersionKey}, mới nhất: ${latest}.`);

  if (currentVersionKey === latest) {
    showToast(`Bạn đang ở phiên bản mới nhất (${latest}).`, "success", "Đã cập nhật");
  } else {
    showToast(
      `Đã có phiên bản mới: <strong>${latest}</strong>. Hãy chọn phiên bản này trong danh sách để nạp bản cập nhật.`,
      "warning",
      "Có bản cập nhật"
    );
    document.getElementById("selVersion").value = latest;
    selectBoard(currentBoardKey, latest);
    document.getElementById("cau-hinh").scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

/* ---------------------------------------------------------------------
 * 5. NÚT "XEM NHẬT KÝ" / XOÁ NHẬT KÝ
 * ------------------------------------------------------------------- */

document.getElementById("btnViewLog").addEventListener("click", () => {
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("logModal"));
  modal.show();
});

document.getElementById("btnClearLog").addEventListener("click", () => {
  const logOutput = document.getElementById("logOutput");
  logOutput.textContent = "Nhật ký đã được xoá.";
  logOutput.dataset.empty = "1";
});

/* ---------------------------------------------------------------------
 * 6. NÚT "KHỞI ĐỘNG LẠI ESP32" (sau khi nạp xong)
 * ------------------------------------------------------------------- */

document.getElementById("btnRestart").addEventListener("click", async () => {
  appendLog("Yêu cầu khởi động lại ESP32 (toggle DTR/RTS qua Web Serial)…");
  try {
    if (!("serial" in navigator)) throw new Error("Không hỗ trợ Web Serial");
    const ports = await navigator.serial.getPorts();
    const port = ports[0];
    if (!port) {
      showToast(
        "ESP32 thường tự khởi động lại ngay sau khi nạp xong. Nếu chưa thấy, hãy rút và cắm lại cáp USB.",
        "info",
        "Khởi động lại"
      );
      return;
    }
    await port.open({ baudRate: 115200 });
    await port.setSignals({ dataTerminalReady: false, requestToSend: true });
    await new Promise((r) => setTimeout(r, 120));
    await port.setSignals({ dataTerminalReady: false, requestToSend: false });
    await port.close();
    showToast("Đã gửi tín hiệu khởi động lại tới ESP32.", "success", "Khởi động lại");
  } catch (err) {
    appendLog("Không thể tự động khởi động lại: " + err.message);
    showToast(
      "Không thể tự động khởi động lại. ESP32 thường tự reset sau khi nạp — nếu chưa, hãy rút và cắm lại cáp USB hoặc nhấn nút EN trên board.",
      "info",
      "Khởi động lại thủ công"
    );
  }
});

/* ---------------------------------------------------------------------
 * 7. NĂM HIỆN TẠI Ở FOOTER
 * ------------------------------------------------------------------- */
document.getElementById("year").textContent = new Date().getFullYear();

/* ---------------------------------------------------------------------
 * 8. ĐĂNG KÝ SERVICE WORKER (PWA)
 * ------------------------------------------------------------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Không thể đăng ký Service Worker:", err);
    });
  });
}

/* ---------------------------------------------------------------------
 * 9. GỢI Ý CÀI ĐẶT PWA (beforeinstallprompt)
 * ------------------------------------------------------------------- */
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showToast(
    'Bạn có thể cài đặt trang này như một ứng dụng ngay trên màn hình chính. Chọn "Thêm vào Màn hình chính" trong menu trình duyệt.',
    "info",
    "Cài đặt ứng dụng"
  );
});
