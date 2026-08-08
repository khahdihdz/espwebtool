import "./style.css";
import { detectCapabilities, explainNotReady } from "./capabilities";
import { UiLogger } from "./logger";
import { Esp32Flasher, type FirmwareFile } from "./flasher";
import { parseEspImage, sha256Hex, formatBytes, parseOffset, readFileAsBytes } from "./firmware";
import { registerServiceWorker } from "./pwa";
import SparkMD5 from "spark-md5";

registerServiceWorker();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusDot = $("statusDot");
const statusText = $("statusText");
const btnConnect = $("btnConnect") as HTMLButtonElement;
const btnDisconnect = $("btnDisconnect") as HTMLButtonElement;
const btnChipInfo = $("btnChipInfo") as HTMLButtonElement;
const chipInfoBox = $("chipInfoBox") as HTMLDListElement;
const fwRows = $("fwRows");
const btnAddFwRow = $("btnAddFwRow") as HTMLButtonElement;
const fwValidation = $("fwValidation");
const chkEraseAll = $("chkEraseAll") as HTMLInputElement;
const btnErase = $("btnErase") as HTMLButtonElement;
const btnFlash = $("btnFlash") as HTMLButtonElement;
const btnReset = $("btnReset") as HTMLButtonElement;
const trace = $("trace");
const progressLabel = $("progressLabel");
const progressPct = $("progressPct");
const verifyBox = $("verifyBox");
const logEl = $("log");
const btnCopyLog = $("btnCopyLog") as HTMLButtonElement;
const btnClearLog = $("btnClearLog") as HTMLButtonElement;
const unsupportedBanner = $("unsupportedBanner");
const pinDtr = $("pinDtr");
const pinRts = $("pinRts");
const pinBoot = $("pinBoot");

const logger = new UiLogger(logEl);
const flasher = new Esp32Flasher(logger);

const TRACE_SEGMENTS = 24;
for (let i = 0; i < TRACE_SEGMENTS; i++) {
  const bar = document.createElement("div");
  bar.className = "trace__bar";
  bar.style.height = "6px";
  trace.appendChild(bar);
}
const traceBars = Array.from(trace.querySelectorAll<HTMLDivElement>(".trace__bar"));

function setProgress(pct: number, label: string, state: "on" | "err" = "on") {
  const clamped = Math.max(0, Math.min(100, pct));
  const litCount = Math.round((clamped / 100) * TRACE_SEGMENTS);
  traceBars.forEach((bar, i) => {
    const lit = i < litCount;
    bar.classList.toggle("on", lit && state === "on");
    bar.classList.toggle("err", lit && state === "err");
    bar.style.height = lit ? `${10 + Math.round((i / TRACE_SEGMENTS) * 16)}px` : "6px";
  });
  progressLabel.textContent = label;
  progressPct.innerHTML = `<b>${clamped}%</b>`;
}

// ---------------------------------------------------------------- capability gate
const cap = detectCapabilities();
if (!cap.ready) {
  const reasons = explainNotReady(cap);
  unsupportedBanner.style.display = "block";
  unsupportedBanner.innerHTML =
    "<p><b>⚠️ Trình duyệt này chưa sẵn sàng để flash qua USB.</b></p>" +
    reasons.map((r) => `<p>${r}</p>`).join("");
  btnConnect.disabled = true;
  btnConnect.textContent = "🔌 Không khả dụng trên trình duyệt này";
}

// ---------------------------------------------------------------- firmware rows
interface RowState {
  el: HTMLDivElement;
  offsetInput: HTMLInputElement;
  fileInput: HTMLInputElement;
  nameEl: HTMLElement;
  data: Uint8Array | null;
  fileName: string | null;
  offset: number | null;
  valid: boolean | null; // null = chưa chọn file, true/false = kết quả kiểm tra
}

const rows: RowState[] = [];

function addFwRow(defaultOffset: string, removable: boolean) {
  const row = document.createElement("div");
  row.className = "fw-row";
  row.innerHTML = `
    <input type="text" value="${defaultOffset}" aria-label="Offset (hex)" />
    <span class="fw-row__name">Chưa chọn file</span>
    <label class="btn btn--ghost btn--sm fw-row__file">
      Chọn .bin
      <input type="file" accept=".bin" style="display:none" />
    </label>
    ${removable ? `<button class="fw-row__remove" title="Xoá dòng">✕</button>` : ""}
  `;
  fwRows.appendChild(row);

  const state: RowState = {
    el: row,
    offsetInput: row.querySelector("input[type=text]")!,
    fileInput: row.querySelector("input[type=file]")!,
    nameEl: row.querySelector(".fw-row__name")!,
    data: null,
    fileName: null,
    offset: parseOffset(defaultOffset),
    valid: null,
  };
  rows.push(state);

  state.offsetInput.addEventListener("input", () => {
    state.offset = parseOffset(state.offsetInput.value);
    revalidateAll();
  });

  state.fileInput.addEventListener("change", async () => {
    const file = state.fileInput.files?.[0];
    if (!file) return;
    state.data = await readFileAsBytes(file);
    state.fileName = file.name;
    state.nameEl.textContent = `${file.name} · ${formatBytes(state.data.length)}`;
    await revalidateAll();
  });

  const removeBtn = row.querySelector<HTMLButtonElement>(".fw-row__remove");
  removeBtn?.addEventListener("click", () => {
    fwRows.removeChild(row);
    const idx = rows.indexOf(state);
    if (idx >= 0) rows.splice(idx, 1);
    revalidateAll();
  });

  revalidateAll();
}

/** offset 0x1000 (bootloader) và 0x10000 (app), hoặc trường hợp chỉ có 1 file duy nhất,
 *  đều phải là một ESP app image hợp lệ (bắt đầu bằng 0xE9). offset 0x8000 (partition
 *  table) KHÔNG theo định dạng này nên không áp dụng kiểm tra magic byte. */
function requiresAppImageMagic(offset: number | null): boolean {
  if (offset === null) return false;
  if (rows.length === 1) return true;
  return offset === 0x1000 || offset === 0x10000;
}

async function revalidateAll() {
  let allOk = rows.length > 0;
  const messages: string[] = [];

  for (const r of rows) {
    if (!r.data) {
      allOk = false;
      continue;
    }
    if (r.offset === null) {
      allOk = false;
      messages.push(`❌ ${r.fileName}: offset không hợp lệ.`);
      continue;
    }
    if (requiresAppImageMagic(r.offset)) {
      const parsed = parseEspImage(r.data);
      r.valid = parsed.valid;
      if (!parsed.valid) {
        allOk = false;
        messages.push(`❌ Firmware không hợp lệ — ${r.fileName}: ${parsed.reason}`);
      } else {
        messages.push(
          `✓ ${r.fileName}: ESP image OK · segments=${parsed.segmentCount} · ` +
            `flash_mode=${parsed.flashMode} · entry=${parsed.entryPoint}`
        );
      }
    } else {
      r.valid = true; // vd. partition table — không kiểm tra magic byte
      messages.push(`✓ ${r.fileName}: ${formatBytes(r.data.length)} tại offset 0x${r.offset.toString(16)}`);
    }
  }

  if (messages.length) {
    fwValidation.classList.remove("hidden");
    fwValidation.className = "callout " + (allOk ? "callout--ok" : "callout--err");
    fwValidation.innerHTML = messages.map((m) => `<p>${m}</p>`).join("");
  } else {
    fwValidation.classList.add("hidden");
  }

  btnFlash.disabled = !flasher.isConnected || !allOk;
}

addFwRow("0x10000", false);
btnAddFwRow.addEventListener("click", () => addFwRow("0x1000", true));

// ---------------------------------------------------------------- connect flow
function setStatus(kind: "idle" | "busy" | "ok" | "err", text: string) {
  statusDot.className = `dot dot--${kind}`;
  statusText.innerHTML = `USB: <b>${text}</b>`;
}

function pulsePins() {
  [pinDtr, pinRts, pinBoot].forEach((p, i) => {
    setTimeout(() => p.classList.add("hot"), i * 180);
    setTimeout(() => p.classList.remove("hot"), 900 + i * 180);
  });
}

function renderChipInfo(info: {
  description: string;
  features: string[];
  crystalFreq: number;
  mac: string;
  flashSize: string;
}) {
  chipInfoBox.classList.remove("hidden");
  chipInfoBox.innerHTML = `
    <dt>Chip</dt><dd>${info.description}</dd>
    <dt>MAC</dt><dd>${info.mac}</dd>
    <dt>Flash size</dt><dd>${info.flashSize}</dd>
    <dt>Crystal</dt><dd>${info.crystalFreq} MHz</dd>
    <dt>Features</dt><dd>${info.features.join(", ")}</dd>
  `;
}

btnConnect.addEventListener("click", async () => {
  setStatus("busy", "Đang kết nối...");
  pulsePins();
  btnConnect.disabled = true;
  try {
    const info = await flasher.connect();
    setStatus("ok", "Đã kết nối");
    renderChipInfo(info);
    btnConnect.classList.add("hidden");
    btnDisconnect.classList.remove("hidden");
    btnChipInfo.disabled = false;
    btnErase.disabled = false;
    btnReset.disabled = false;
    revalidateAll();
  } catch (err: any) {
    setStatus("err", "Lỗi kết nối");
    if (err?.name === "NotFoundError") {
      logger.line("Không có thiết bị nào được chọn. Hãy cắm cáp USB OTG, cấp quyền USB rồi thử lại.", "err");
    } else {
      logger.line(`Không thể kết nối: ${err?.message ?? err}`, "err");
      logger.line("Nếu ESP32 chưa vào bootloader: giữ BOOT → nhấn RESET → thả RESET → thả BOOT → thử lại.", "warn");
    }
    btnConnect.disabled = false;
  }
});

btnDisconnect.addEventListener("click", async () => {
  await flasher.disconnect();
  setStatus("idle", "Chưa kết nối");
  btnConnect.classList.remove("hidden");
  btnConnect.disabled = false;
  btnDisconnect.classList.add("hidden");
  btnChipInfo.disabled = true;
  btnErase.disabled = true;
  btnFlash.disabled = true;
  btnReset.disabled = true;
  chipInfoBox.classList.add("hidden");
  logger.line("Đã ngắt kết nối USB.");
});

btnChipInfo.addEventListener("click", async () => {
  try {
    const info = await flasher.readChipInfo();
    renderChipInfo(info);
    logger.line(`Chip: ${info.description} · MAC: ${info.mac} · Flash: ${info.flashSize}`);
  } catch (err: any) {
    logger.line(`Không đọc được thông tin chip: ${err?.message ?? err}`, "err");
  }
});

btnErase.addEventListener("click", async () => {
  if (!confirm("Xoá toàn bộ flash? Thao tác này không thể hoàn tác.")) return;
  setBusy(true);
  setProgress(0, "Đang xoá flash...");
  try {
    await flasher.eraseFlash();
    setProgress(100, "Đã xoá flash");
  } catch (err: any) {
    logger.line(`Xoá flash thất bại: ${err?.message ?? err}`, "err");
    setProgress(0, "Lỗi xoá flash", "err");
  } finally {
    setBusy(false);
  }
});

btnReset.addEventListener("click", async () => {
  try {
    await flasher.resetDevice();
  } catch (err: any) {
    logger.line(`Reset thất bại: ${err?.message ?? err}`, "err");
  }
});

function setBusy(busy: boolean) {
  [btnErase, btnFlash, btnReset, btnChipInfo, btnDisconnect, btnAddFwRow].forEach((b) => (b.disabled = busy));
  if (!busy) revalidateAll();
}

// ---------------------------------------------------------------- flash flow
btnFlash.addEventListener("click", async () => {
  const files: FirmwareFile[] = rows
    .filter((r) => r.data && r.offset !== null)
    .map((r) => ({ offset: r.offset as number, name: r.fileName as string, data: r.data as Uint8Array }));

  if (!files.length) return;

  verifyBox.classList.add("hidden");
  setBusy(true);
  setProgress(0, "Chuẩn bị...");

  // Tính SHA-256 của từng file để hiển thị nhận dạng firmware (độc lập với MD5
  // dùng để verify — ROM bootloader của ESP32 chỉ hỗ trợ lệnh MD5, không có SHA-256).
  const shaEntries: string[] = [];
  for (const f of files) {
    const hash = await sha256Hex(f.data);
    shaEntries.push(`${f.name} (0x${f.offset.toString(16)}) · ${formatBytes(f.data.length)} · SHA-256 ${hash.slice(0, 16)}…`);
  }
  logger.line("Firmware đã kiểm tra: " + shaEntries.join(" | "));

  try {
    await flasher.writeFirmware(files, {
      eraseAll: chkEraseAll.checked,
      compress: true,
      onProgress: (fileIndex, written, total) => {
        const pct = total > 0 ? Math.floor((written / total) * 100) : 0;
        setProgress(pct, `Đang ghi file ${fileIndex + 1}/${files.length}...`);
      },
    });

    setProgress(100, "Hoàn tất — đang xác minh...");

    // writeFlash() đã verify MD5 nội bộ cho từng file (ném lỗi nếu sai) — tới đây
    // nghĩa là mọi file đều đã khớp MD5 đọc lại từ chip. Đọc lại một lần độc lập
    // để hiển thị rõ ràng trên UI, đúng tinh thần "không chỉ tin lệnh flash trả về OK".
    const verifyLines: string[] = [];
    let allVerified = true;
    for (const f of files) {
      try {
        const deviceMd5 = await flasher.flashMd5(f.offset, f.data.length);
        const localMd5 = await md5Hex(f.data);
        const ok = deviceMd5.toLowerCase() === localMd5.toLowerCase();
        allVerified = allVerified && ok;
        verifyLines.push(
          `${ok ? "✓" : "❌"} ${f.name} (0x${f.offset.toString(16)}) — flash MD5 <code>${deviceMd5}</code> ${
            ok ? "khớp" : "KHÔNG khớp file gốc"
          }`
        );
      } catch (e: any) {
        allVerified = false;
        verifyLines.push(`❌ ${f.name}: không đọc lại được MD5 từ chip (${e?.message ?? e})`);
      }
    }

    verifyBox.classList.remove("hidden");
    verifyBox.className = "callout " + (allVerified ? "callout--ok" : "callout--err");
    verifyBox.innerHTML =
      `<p><b>${allVerified ? "✓ VERIFY SUCCESS" : "❌ VERIFY FAILED"}</b></p>` +
      verifyLines.map((l) => `<p>${l}</p>`).join("");

    if (allVerified) {
      setProgress(100, "SUCCESS", "on");
      logger.line("SUCCESS — firmware đã được nạp và xác minh.");
    } else {
      setProgress(100, "VERIFY FAILED", "err");
      logger.line("VERIFY FAILED — không báo flash thành công vì dữ liệu trên flash không khớp.", "err");
    }
  } catch (err: any) {
    setProgress(0, "Flash thất bại", "err");
    logger.line(`Flash thất bại: ${err?.message ?? err}`, "err");
  } finally {
    setBusy(false);
  }
});

async function md5Hex(bytes: Uint8Array): Promise<string> {
  return SparkMD5.ArrayBuffer.hash(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  );
}

// ---------------------------------------------------------------- log actions
btnCopyLog.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(logger.getPlainText());
    btnCopyLog.textContent = "Đã copy ✓";
    setTimeout(() => (btnCopyLog.textContent = "Copy log"), 1500);
  } catch {
    logger.line("Không thể copy log (trình duyệt chặn clipboard).", "warn");
  }
});

btnClearLog.addEventListener("click", () => logger.clean());

logger.line("Sẵn sàng. Cắm ESP32 qua USB OTG rồi bấm 'Kết nối ESP32'.");
