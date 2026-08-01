// =====================================================================
// admin.js — Trang quản trị firmware (chạy hoàn toàn ở trình duyệt, không backend)
// =====================================================================

function showToast(message, variant = "info", title = "Thông báo") {
  const icons = { info: "bi-info-circle-fill", success: "bi-check-circle-fill", warning: "bi-exclamation-triangle-fill", danger: "bi-x-octagon-fill" };
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div class="toast-header">
      <i class="bi ${icons[variant] || icons.info} me-2"></i>
      <strong class="me-auto">${title}</strong>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast"></button>
    </div>
    <div class="toast-body">${message}</div>`;
  container.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 4000 });
  toast.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

document.getElementById("year").textContent = new Date().getFullYear();

/* ---------------------------------------------------------------------
 * TAB 1 — ĐÓNG GÓI FIRMWARE & SINH MANIFEST.JSON
 * ------------------------------------------------------------------- */

const DEFAULT_OFFSETS = {
  ESP32: [
    { path: "bootloader.bin", offset: 4096 },
    { path: "partitions.bin", offset: 32768 },
    { path: "boot_app0.bin", offset: 57344 },
    { path: "firmware.bin", offset: 65536 },
  ],
  "ESP32-S2": [
    { path: "bootloader.bin", offset: 4096 },
    { path: "partitions.bin", offset: 32768 },
    { path: "boot_app0.bin", offset: 57344 },
    { path: "firmware.bin", offset: 65536 },
  ],
  "ESP32-S3": [
    { path: "bootloader.bin", offset: 0 },
    { path: "partitions.bin", offset: 32768 },
    { path: "boot_app0.bin", offset: 57344 },
    { path: "firmware.bin", offset: 65536 },
  ],
  "ESP32-C3": [
    { path: "bootloader.bin", offset: 0 },
    { path: "partitions.bin", offset: 32768 },
    { path: "boot_app0.bin", offset: 57344 },
    { path: "firmware.bin", offset: 65536 },
  ],
  ESP8266: [{ path: "firmware.bin", offset: 0 }],
};

const partsBody = document.getElementById("partsBody");

function addPartRow(name = "", offset = "") {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input class="form-control form-control-sm select-console part-name" value="${name}" placeholder="firmware.bin"></td>
    <td><input class="form-control form-control-sm select-console part-offset" value="${offset}" placeholder="65536"></td>
    <td><button class="btn btn-sm btn-outline-light btn-remove-part"><i class="bi bi-trash"></i></button></td>`;
  tr.querySelector(".btn-remove-part").addEventListener("click", () => { tr.remove(); renderManifest(); });
  tr.querySelectorAll("input").forEach((i) => i.addEventListener("input", renderManifest));
  partsBody.appendChild(tr);
}

document.getElementById("btnAddPart").addEventListener("click", () => addPartRow());

document.getElementById("btnAutoOffsets").addEventListener("click", () => {
  const chip = document.getElementById("fChip").value;
  partsBody.innerHTML = "";
  DEFAULT_OFFSETS[chip].forEach((p) => addPartRow(p.path, p.offset));
  renderManifest();
  showToast(`Đã điền offset mặc định cho ${chip}.`, "success", "Đã điền offset");
});

// Kéo-thả / chọn file .bin — tự thêm dòng theo tên file, gợi ý offset theo chip nếu khớp
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");

function handleFiles(files) {
  const chip = document.getElementById("fChip").value;
  const defaults = DEFAULT_OFFSETS[chip];
  [...files].forEach((file) => {
    const match = defaults.find((d) => d.path === file.name);
    addPartRow(file.name, match ? match.offset : "");
  });
  renderManifest();
  showToast(`Đã thêm ${files.length} file firmware vào danh sách.`, "success", "Đã tải lên");
}

fileInput.addEventListener("change", (e) => handleFiles(e.target.files));
["dragenter", "dragover"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((evt) =>
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); })
);
dropZone.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));

function buildManifestObject() {
  const parts = [...partsBody.querySelectorAll("tr")]
    .map((tr) => ({
      path: tr.querySelector(".part-name").value.trim(),
      offset: parseInt(tr.querySelector(".part-offset").value.trim() || "0", 10),
    }))
    .filter((p) => p.path);

  return {
    name: document.getElementById("fName").value.trim() || "Firmware",
    version: document.getElementById("fVersion").value.trim() || "1.0.0",
    new_install_prompt_erase: document.getElementById("fErase").checked,
    builds: [
      {
        chipFamily: document.getElementById("fChip").value,
        parts,
      },
    ],
  };
}

function renderManifest() {
  const manifest = buildManifestObject();
  document.getElementById("manifestPreview").textContent = JSON.stringify(manifest, null, 2);
}

["fName", "fVersion", "fChip", "fErase"].forEach((id) =>
  document.getElementById(id).addEventListener("input", renderManifest)
);
document.getElementById("fChip").addEventListener("change", renderManifest);

document.getElementById("btnCopyManifest").addEventListener("click", async () => {
  await navigator.clipboard.writeText(document.getElementById("manifestPreview").textContent);
  showToast("Đã sao chép manifest.json vào bộ nhớ tạm.", "success", "Đã sao chép");
});

document.getElementById("btnDownloadManifest").addEventListener("click", () => {
  const blob = new Blob([document.getElementById("manifestPreview").textContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "manifest.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Đã tải manifest.json — hãy đặt file này cùng thư mục với các file .bin.", "success", "Đã tải xuống");
});

// Khởi tạo 4 dòng mặc định cho ESP32
DEFAULT_OFFSETS.ESP32.forEach((p) => addPartRow(p.path, p.offset));
renderManifest();

/* ---------------------------------------------------------------------
 * TAB 2 — QUẢN LÝ PHIÊN BẢN (lưu trong localStorage của trình duyệt)
 * ------------------------------------------------------------------- */

const STORAGE_KEY = "espFlashStudio.versions";

function loadVersions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}
function saveVersions(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function renderVersionsTable() {
  const list = loadVersions();
  const body = document.getElementById("versionsBody");
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="text-dim text-center py-4">Chưa có phiên bản nào.</td></tr>`;
    return;
  }
  body.innerHTML = list
    .map(
      (v, i) => `
      <tr>
        <td><code>${v.board}</code></td>
        <td><span class="badge-version">${v.version}</span></td>
        <td class="small text-dim">${v.manifest}</td>
        <td class="small">${v.date || "—"}</td>
        <td><button class="btn btn-sm btn-outline-light btn-del-version" data-i="${i}"><i class="bi bi-trash text-danger"></i></button></td>
      </tr>`
    )
    .join("");

  body.querySelectorAll(".btn-del-version").forEach((btn) =>
    btn.addEventListener("click", () => {
      const list = loadVersions();
      list.splice(Number(btn.dataset.i), 1);
      saveVersions(list);
      renderVersionsTable();
      showToast("Đã xoá phiên bản khỏi danh sách.", "warning", "Đã xoá");
    })
  );
}

document.getElementById("btnAddVersion").addEventListener("click", () => {
  const board = document.getElementById("vBoardKey").value.trim();
  const version = document.getElementById("vVersion").value.trim();
  const manifest = document.getElementById("vManifestPath").value.trim();
  const date = document.getElementById("vDate").value;
  const notes = document.getElementById("vNotes").value.split("\n").map((s) => s.trim()).filter(Boolean);

  if (!board || !version || !manifest) {
    showToast("Vui lòng nhập đủ mã board, phiên bản và đường dẫn manifest.", "danger", "Thiếu thông tin");
    return;
  }

  const list = loadVersions();
  list.unshift({ board, version, manifest, date, notes });
  saveVersions(list);
  renderVersionsTable();
  showToast(`Đã thêm phiên bản ${version} cho "${board}".`, "success", "Đã thêm");

  ["vBoardKey", "vVersion", "vManifestPath", "vDate", "vNotes"].forEach((id) => (document.getElementById(id).value = ""));
});

document.getElementById("btnExportBoards").addEventListener("click", () => {
  const list = loadVersions();
  if (list.length === 0) {
    showToast("Danh sách đang trống, chưa có gì để xuất.", "warning", "Không có dữ liệu");
    return;
  }
  const boards = {};
  list.forEach((v) => {
    if (!boards[v.board]) boards[v.board] = { label: v.board, versions: {} };
    boards[v.board].versions[v.version] = { manifest: v.manifest, date: v.date, notes: v.notes };
  });
  const output = { defaultBoard: Object.keys(boards)[0], boards };
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "boards.json";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Đã xuất boards.json — hãy hợp nhất thủ công với file gốc trong /firmware/.", "success", "Đã xuất");
});

renderVersionsTable();

/* ---------------------------------------------------------------------
 * TAB 3 — KIỂM TRA ĐỊNH DẠNG MANIFEST CÓ SẴN
 * ------------------------------------------------------------------- */

document.getElementById("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById("importText").value = await file.text();
});

document.getElementById("btnValidate").addEventListener("click", () => {
  const raw = document.getElementById("importText").value.trim();
  const resultEl = document.getElementById("validateResult");
  if (!raw) {
    resultEl.innerHTML = `<div class="alert alert-warning-glass mb-0">Vui lòng dán hoặc tải lên nội dung manifest.json.</div>`;
    return;
  }
  try {
    const data = JSON.parse(raw);
    const errors = [];
    if (!data.name) errors.push('Thiếu trường "name".');
    if (!data.version) errors.push('Thiếu trường "version".');
    if (!Array.isArray(data.builds) || data.builds.length === 0) {
      errors.push('Thiếu hoặc rỗng trường "builds" (mảng).');
    } else {
      data.builds.forEach((b, i) => {
        if (!b.chipFamily) errors.push(`builds[${i}]: thiếu "chipFamily".`);
        if (!Array.isArray(b.parts) || b.parts.length === 0) errors.push(`builds[${i}]: thiếu "parts".`);
        else
          b.parts.forEach((p, j) => {
            if (!p.path) errors.push(`builds[${i}].parts[${j}]: thiếu "path".`);
            if (typeof p.offset !== "number") errors.push(`builds[${i}].parts[${j}]: "offset" phải là số.`);
          });
      });
    }

    if (errors.length === 0) {
      resultEl.innerHTML = `<div class="alert alert-warning-glass mb-0" style="border-color:rgba(0,217,163,.4)"><i class="bi bi-check-circle-fill text-accent"></i> Manifest hợp lệ theo chuẩn ESP Web Tools.</div>`;
    } else {
      resultEl.innerHTML = `<div class="alert alert-warning-glass mb-0"><i class="bi bi-exclamation-triangle-fill"></i> Phát hiện ${errors.length} vấn đề:<ul class="mb-0 mt-2">${errors.map((e) => `<li>${e}</li>`).join("")}</ul></div>`;
    }
  } catch (err) {
    resultEl.innerHTML = `<div class="alert alert-warning-glass mb-0"><i class="bi bi-x-octagon-fill text-danger"></i> JSON không hợp lệ: ${err.message}</div>`;
  }
});
