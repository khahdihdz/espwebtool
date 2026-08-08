import "./style.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const manifestUrl = $("manifestUrl") as HTMLInputElement;
const btnCheckUpdate = $("btnCheckUpdate") as HTMLButtonElement;
const curVersion = $("curVersion");
const latestVersion = $("latestVersion");
const latestSha = $("latestSha");
const currentVersionInput = $("currentVersionInput") as HTMLInputElement;
const updateResult = $("updateResult");
const btnDownload = $("btnDownload") as HTMLAnchorElement;

interface OtaManifest {
  version: string;
  url: string;
  sha256: string;
  size?: number;
  notes?: string;
}

btnCheckUpdate.addEventListener("click", async () => {
  const url = manifestUrl.value.trim();
  updateResult.classList.add("hidden");
  btnDownload.classList.add("hidden");

  if (!url) {
    showResult(false, "Nhập URL manifest.json trước (thường host cùng GitHub Releases với firmware).");
    return;
  }
  if (!url.startsWith("https://")) {
    showResult(false, "Manifest phải tải qua HTTPS — không dùng HTTP cho OTA.");
    return;
  }

  btnCheckUpdate.disabled = true;
  btnCheckUpdate.textContent = "Đang kiểm tra...";
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = (await res.json()) as OtaManifest;

    if (!manifest.version || !manifest.url || !manifest.sha256) {
      throw new Error("Manifest thiếu trường bắt buộc (version / url / sha256).");
    }

    latestVersion.textContent = manifest.version;
    latestSha.textContent = manifest.sha256;
    curVersion.textContent = currentVersionInput.value.trim() || "chưa nhập";

    const current = currentVersionInput.value.trim();
    if (current && current === manifest.version) {
      showResult(true, `Thiết bị đã ở phiên bản mới nhất (${manifest.version}).`);
    } else {
      showResult(
        true,
        `Có bản mới: <b>${manifest.version}</b>${manifest.notes ? ` — ${manifest.notes}` : ""}. ` +
          `ESP32 sẽ tự tải, kiểm tra SHA-256 <code>${manifest.sha256.slice(0, 16)}…</code> rồi mới ghi vào OTA partition.`
      );
      btnDownload.href = manifest.url;
      btnDownload.classList.remove("hidden");
    }
  } catch (err: any) {
    showResult(
      false,
      `Không kiểm tra được manifest: ${err?.message ?? err}. Nếu đây là lỗi CORS, máy chủ lưu manifest ` +
        `cần bật header <code>Access-Control-Allow-Origin</code> để trình duyệt được phép đọc — bản thân firmware ESP32 không bị giới hạn này.`
    );
  } finally {
    btnCheckUpdate.disabled = false;
    btnCheckUpdate.textContent = "🔍 Kiểm tra bản cập nhật";
  }
});

function showResult(ok: boolean, html: string) {
  updateResult.classList.remove("hidden");
  updateResult.className = "callout " + (ok ? "callout--ok" : "callout--err");
  updateResult.innerHTML = `<p>${html}</p>`;
}
