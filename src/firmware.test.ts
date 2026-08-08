import { describe, it, expect } from "vitest";
import { parseEspImage, parseOffset, formatBytes } from "./firmware";

function makeImage(overrides: Partial<{ magic: number; segments: number; flashMode: number; sizeFreq: number }> = {}) {
  const bytes = new Uint8Array(64);
  bytes[0] = overrides.magic ?? 0xe9;
  bytes[1] = overrides.segments ?? 3;
  bytes[2] = overrides.flashMode ?? 2; // DIO
  bytes[3] = overrides.sizeFreq ?? 0x20; // size=2 (4MB), freq=0 (40MHz)
  bytes[4] = 0x00;
  bytes[5] = 0x10;
  bytes[6] = 0x00;
  bytes[7] = 0x40; // entry ~ 0x40001000
  return bytes;
}

describe("parseEspImage", () => {
  it("accepts a well-formed ESP image (magic 0xE9)", () => {
    const result = parseEspImage(makeImage());
    expect(result.valid).toBe(true);
    expect(result.segmentCount).toBe(3);
    expect(result.flashMode).toBe("DIO");
    expect(result.flashSize).toBe("4MB");
    expect(result.flashFreq).toBe("40MHz");
  });

  it("rejects a file with the wrong magic byte", () => {
    const result = parseEspImage(makeImage({ magic: 0x00 }));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/0xE9/);
  });

  it("rejects an empty file", () => {
    const result = parseEspImage(new Uint8Array(0));
    expect(result.valid).toBe(false);
  });

  it("rejects a file shorter than the header", () => {
    const result = parseEspImage(new Uint8Array([0xe9, 0x01, 0x02]));
    expect(result.valid).toBe(false);
  });

  it("rejects an oversized garbage file with wrong magic", () => {
    const bytes = new Uint8Array(2_000_000).fill(0xff);
    const result = parseEspImage(bytes);
    expect(result.valid).toBe(false);
  });
});

describe("parseOffset", () => {
  it("parses hex offsets with 0x prefix", () => {
    expect(parseOffset("0x10000")).toBe(0x10000);
    expect(parseOffset("0x1000")).toBe(0x1000);
  });

  it("parses decimal offsets", () => {
    expect(parseOffset("65536")).toBe(65536);
  });

  it("returns null for invalid input", () => {
    expect(parseOffset("")).toBeNull();
    expect(parseOffset("not-a-number")).toBeNull();
  });

  it("returns null for negative offsets", () => {
    // parseInt of "-5" is -5, function should reject negatives
    expect(parseOffset("-5")).toBeNull();
  });
});

describe("formatBytes", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1_492_000)).toBe("1.42 MB");
  });
});
