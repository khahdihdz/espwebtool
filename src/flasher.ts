import { ESPLoader, Transport } from "esptool-js";
import SparkMD5 from "spark-md5";
import type { UiLogger } from "./logger";

export interface FirmwareFile {
  offset: number;
  name: string;
  data: Uint8Array;
}

export interface ChipInfo {
  description: string;
  features: string[];
  crystalFreq: number;
  mac: string;
  flashSize: string;
}

/**
 * Bọc quanh esptool-js — thư viện chính thức của Espressif hiện thực đúng
 * ESP32 ROM Bootloader Protocol (sync / mem_begin / flash_begin / SLIP framing
 * / stub loader...). Chúng ta KHÔNG tự phát minh giao thức, chỉ điều phối UI.
 */
export class Esp32Flasher {
  private transport: Transport | null = null;
  private loader: ESPLoader | null = null;
  private logger: UiLogger;

  constructor(logger: UiLogger) {
    this.logger = logger;
  }

  get isConnected(): boolean {
    return this.loader !== null;
  }

  /** Mở hộp thoại chọn cổng USB Serial của trình duyệt rồi đồng bộ với ROM bootloader. */
  async connect(baudrate = 115200): Promise<ChipInfo> {
    if (!("serial" in navigator)) {
      throw new Error(
        "navigator.serial không tồn tại. Trình duyệt này không hỗ trợ Web Serial API " +
          "(chỉ có trên Chrome/Edge/Chromium cho Android, không có trên Firefox/Safari)."
      );
    }
    const port = await (navigator as any).serial.requestPort();
    this.transport = new Transport(port, true);
    this.loader = new ESPLoader({
      transport: this.transport,
      baudrate,
      terminal: this.logger,
      debugLogging: false,
    });

    this.logger.line("Đang đồng bộ với ESP32 ROM Bootloader (sync)...");
    await this.loader.main("default_reset");
    this.logger.line(`Đã kết nối. Chip: ${this.loader.chip.CHIP_NAME}`, "info");

    return this.readChipInfo();
  }

  async readChipInfo(): Promise<ChipInfo> {
    if (!this.loader) throw new Error("Chưa kết nối ESP32.");
    const description = await this.loader.chip.getChipDescription(this.loader);
    const features = await this.loader.chip.getChipFeatures(this.loader);
    const crystalFreq = await this.loader.chip.getCrystalFreq(this.loader);
    const mac = await this.loader.chip.readMac(this.loader);
    const flashSize = await this.loader.detectFlashSize();
    return { description, features, crystalFreq, mac, flashSize };
  }

  async eraseFlash(): Promise<void> {
    if (!this.loader) throw new Error("Chưa kết nối ESP32.");
    this.logger.line("Bắt đầu xoá toàn bộ flash (chip erase)...", "warn");
    await this.loader.eraseFlash();
    this.logger.line("Đã xoá flash xong.");
  }

  /**
   * Ghi một hoặc nhiều file firmware vào các offset tương ứng.
   * MD5 của từng file được tính cục bộ và so với MD5 mà ESP32 đọc lại từ flash
   * ngay trong thư viện (writeFlash ném lỗi nếu không khớp) — đây là bước
   * VERIFY thật, không phải chỉ tin vào việc lệnh ghi trả về "thành công".
   */
  async writeFirmware(
    files: FirmwareFile[],
    opts: {
      eraseAll: boolean;
      compress: boolean;
      onProgress: (fileIndex: number, written: number, total: number) => void;
    }
  ): Promise<void> {
    if (!this.loader) throw new Error("Chưa kết nối ESP32.");
    await this.loader.writeFlash({
      fileArray: files.map((f) => ({ address: f.offset, data: f.data })),
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: opts.eraseAll,
      compress: opts.compress,
      reportProgress: opts.onProgress,
      calculateMD5Hash: (image) => SparkMD5.ArrayBuffer.hash(toArrayBuffer(image)),
    });
  }

  /** Đọc lại MD5 một vùng flash trực tiếp từ chip để so khớp thêm lần nữa, độc lập với writeFlash. */
  async flashMd5(address: number, size: number): Promise<string> {
    if (!this.loader) throw new Error("Chưa kết nối ESP32.");
    return this.loader.flashMd5sum(address, size);
  }

  async resetDevice(): Promise<void> {
    if (!this.loader) throw new Error("Chưa kết nối ESP32.");
    await this.loader.after("hard_reset");
    this.logger.line("Đã gửi lệnh reset tới ESP32.");
  }

  async disconnect(): Promise<void> {
    try {
      await this.transport?.disconnect();
    } finally {
      this.transport = null;
      this.loader = null;
    }
  }
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}
