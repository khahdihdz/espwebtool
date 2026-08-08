/**
 * Đọc và kiểm tra file firmware .bin theo đúng định dạng ESP image header
 * của Espressif — không đoán mò. Tham chiếu: esptool.py `image_info`.
 *
 * Header 8 byte đầu của một ESP app image:
 *   byte 0      : magic number, luôn luôn 0xE9
 *   byte 1      : số lượng segment
 *   byte 2      : flash mode (0=QIO,1=QOUT,2=DIO,3=DOUT)
 *   byte 3      : nibble cao = flash size, nibble thấp = flash frequency
 *   byte 4..7   : entry point (uint32 little-endian)
 */

export interface ParsedImage {
  valid: boolean;
  magic: number;
  segmentCount?: number;
  flashMode?: string;
  flashFreq?: string;
  flashSize?: string;
  entryPoint?: string;
  reason?: string;
}

const FLASH_MODES: Record<number, string> = { 0: "QIO", 1: "QOUT", 2: "DIO", 3: "DOUT" };
const FLASH_FREQ: Record<number, string> = { 0: "40MHz", 1: "26MHz", 2: "20MHz", 0xf: "80MHz" };
const FLASH_SIZE: Record<number, string> = {
  0: "1MB",
  1: "2MB",
  2: "4MB",
  3: "8MB",
  4: "16MB",
  5: "32MB",
  6: "64MB",
  7: "128MB",
};

export function parseEspImage(bytes: Uint8Array): ParsedImage {
  if (bytes.length < 8) {
    return { valid: false, magic: -1, reason: "File quá nhỏ, không đủ 8 byte header." };
  }
  const magic = bytes[0];
  if (magic !== 0xe9) {
    return {
      valid: false,
      magic,
      reason: `Byte đầu tiên là 0x${magic.toString(16).padStart(2, "0")}, không phải 0xE9. ` +
        `Đây không phải là ESP app image hợp lệ (có thể là bootloader chưa đóng gói đúng, ` +
        `file bị hỏng, hoặc không phải firmware ESP32).`,
    };
  }
  const segmentCount = bytes[1];
  const flashModeByte = bytes[2];
  const sizeFreqByte = bytes[3];
  const flashSizeNibble = (sizeFreqByte >> 4) & 0x0f;
  const flashFreqNibble = sizeFreqByte & 0x0f;
  const entryPoint =
    (bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24)) >>> 0;

  return {
    valid: true,
    magic,
    segmentCount,
    flashMode: FLASH_MODES[flashModeByte] ?? `unknown(${flashModeByte})`,
    flashFreq: FLASH_FREQ[flashFreqNibble] ?? `unknown(${flashFreqNibble})`,
    flashSize: FLASH_SIZE[flashSizeNibble] ?? `unknown(${flashSizeNibble})`,
    entryPoint: "0x" + entryPoint.toString(16).padStart(8, "0"),
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function parseOffset(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = s.toLowerCase().startsWith("0x") ? parseInt(s, 16) : parseInt(s, 10);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

export async function readFileAsBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}
