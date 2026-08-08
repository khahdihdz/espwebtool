import type { IEspLoaderTerminal } from "esptool-js";

export type LogLevel = "info" | "warn" | "err" | "muted";

/**
 * Viết log ra khu vực console trên UI, đồng thời hiện thực IEspLoaderTerminal
 * để truyền thẳng cho ESPLoader — nhờ vậy log hiển thị đúng những gì thư viện
 * bootloader thực sự gửi/nhận, không phải log giả do UI tự bịa ra.
 */
export class UiLogger implements IEspLoaderTerminal {
  private el: HTMLElement;
  private lineBuffer = "";

  constructor(logElement: HTMLElement) {
    this.el = logElement;
  }

  private timestamp(): string {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
  }

  private appendLine(text: string, level: LogLevel = "info") {
    if (!text) return;
    const row = document.createElement("div");
    row.className = "log__line" + (level !== "info" ? ` log__line--${level}` : "");
    row.textContent = `${this.timestamp()} ${text}`;
    this.el.appendChild(row);
    this.el.scrollTop = this.el.scrollHeight;
  }

  line(text: string, level: LogLevel = "info") {
    this.appendLine(text, level);
  }

  clean(): void {
    this.el.innerHTML = "";
  }

  write(data: string): void {
    // esptool-js gọi write() cho log không xuống dòng (streaming) — gom lại
    // theo dòng để UI không bị vỡ log thành trăm phần tử rời rạc.
    this.lineBuffer += data;
    if (this.lineBuffer.includes("\n")) {
      const parts = this.lineBuffer.split("\n");
      this.lineBuffer = parts.pop() ?? "";
      for (const p of parts) this.appendLine(p);
    }
  }

  writeLine(data: string): void {
    if (this.lineBuffer) {
      this.appendLine(this.lineBuffer + data);
      this.lineBuffer = "";
    } else {
      this.appendLine(data);
    }
  }

  getPlainText(): string {
    return Array.from(this.el.querySelectorAll(".log__line"))
      .map((n) => n.textContent ?? "")
      .join("\n");
  }
}
