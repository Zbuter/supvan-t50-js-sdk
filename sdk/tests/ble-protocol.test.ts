import { describe, expect, it } from "vitest";

import {
  bleImageFrames,
  buildBulkOuter512,
  buildPrintBulkPacket,
  buildR1,
  buildR2,
  bulkPackets,
  parseBleLabelBox,
  prepareBleRaster,
} from "../src/protocol";
import { PaperType, resolvePrintSettings } from "../src";
import { toHex } from "../src/internal";

describe("BLE protocol", () => {
  it("builds verified R1 and R2 control layouts", () => {
    expect(toHex(buildR1(0x11))).toBe("7e5a0c001001aa110100000100000000");
    expect(toHex(buildR2(0x5c, 512, 2))).toBe("7e5a0c001001aa5c0500000100020200");
  });

  it("parses the captured label-box response", () => {
    const frame = Uint8Array.from(Buffer.from(
      "7e5a3900000355306d0a000000000000000000000000001d" +
        "f1e4ef131080cb47fa3227048d07b11501281e03fa000000" +
        "a406b00419080c11271e000001",
      "hex",
    ));
    const box = parseBleLabelBox(frame);
    expect(box).toMatchObject({
      uuidHex: "F1E4EF131080CB",
      codeHex: "47FA3227048D07B1",
      serialNumber: 277,
      width: 40,
      height: 30,
      gap: 3,
      remaining: 250,
    });
  });

  it("packs BLE columns and page flags into a 4096-byte frame", () => {
    const settings = resolvePrintSettings({
      materialWidth: 48,
      materialHeight: 8,
      gap: 3,
      density: 4,
      paperType: PaperType.Gap,
    });
    const data = new Uint8Array(384 * 64);
    data.fill(255);
    data[32 * 384] = 0;
    const frames = bleImageFrames({ width: 384, height: 64, data }, settings, true);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(4096);
    expect(frames[0]?.[2]).toBe(0x0e);
    expect(frames[0]?.[3]).toBe(0x50);
    expect(frames[0]?.[6]).toBe(48);
  });

  it("accepts 50 mm media while rejecting wider material", () => {
    const settings = resolvePrintSettings({ materialWidth: 50, dotsPerMm: 8 });
    expect(settings.materialWidth).toBe(50);
    expect(settings.maxWidthDots).toBe(400);
    expect(
      resolvePrintSettings({ materialWidth: 50, dotsPerMm: 8, maxDotValue: 400 }).maxWidthDots,
    ).toBe(400);
    expect(
      () => resolvePrintSettings({ materialWidth: 50, dotsPerMm: 8, maxDotValue: 401 }),
    ).toThrow("当前页面宽度");
    expect(() => resolvePrintSettings({ materialWidth: 51 })).toThrow("1-50 范围内");
  });

  it("uses the shared direction field and preserves the legacy BLE alias", () => {
    const common = resolvePrintSettings({ direction: 3, materialWidth: 1, materialHeight: 1, dpi: 8 });
    const legacy = resolvePrintSettings({ rotate: 1, materialWidth: 1, materialHeight: 1, dpi: 8 });
    const page = { width: 2, height: 1, data: Uint8Array.of(0, 255) };
    expect(common.direction).toBe(3);
    expect(legacy.direction).toBe(3);
    expect(prepareBleRaster(page, common)).toEqual(prepareBleRaster(page, legacy));
    expect(() => resolvePrintSettings({ direction: 0, rotate: 1 })).toThrow("不一致");
  });

  it("normalizes canonical geometry names and rejects conflicting aliases", () => {
    const settings = resolvePrintSettings({
      materialWidth: 40,
      materialHeight: 1,
      dotsPerMm: 8,
      maxWidthDots: 320,
    });
    expect(settings.dotsPerMm).toBe(8);
    expect(settings.maxWidthDots).toBe(320);
    expect(() => resolvePrintSettings({ dotsPerMm: 8, dpi: 9 })).toThrow("不一致");
    expect(() => resolvePrintSettings({ maxWidthDots: 320, maxDotValue: 384 })).toThrow("不一致");
  });

  it("rejects source pixels wider than the model instead of scaling them", () => {
    const settings = resolvePrintSettings({ materialWidth: 50, materialHeight: 30, dpi: 8 });
    expect(() => bleImageFrames({
      width: 401,
      height: 240,
      data: new Uint8Array(401 * 240),
    }, settings)).toThrow("不会自动缩放");
  });

  it("uses 500-byte inner packets and fixed 512-byte outer packets", () => {
    const data = new Uint8Array(501);
    data.fill(7);
    const packets = bulkPackets(data);
    expect(packets).toHaveLength(2);
    expect(packets.every((packet) => packet.length === 512)).toBe(true);
    expect(packets[0]?.slice(0, 8)).toEqual(
      buildBulkOuter512(buildPrintBulkPacket(0, 2, data.slice(0, 500))).slice(0, 8),
    );
  });
});
