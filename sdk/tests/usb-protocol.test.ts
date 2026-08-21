import { describe, expect, it } from "vitest";

import {
  buildMediaConfig,
  buildVendorRequest,
  hidReports,
  prepareUsbRaster,
  usbImageFrames,
} from "../src/protocol";
import { PaperType, resolvePrintSettings } from "../src";
import { toHex } from "../src/internal";

describe("native USB protocol", () => {
  const settings = resolvePrintSettings({
    materialWidth: 48,
    materialHeight: 8,
    gap: 3,
    density: 4,
    paperType: PaperType.Gap,
  });

  it("builds the vendor request with big-endian command parameters", () => {
    expect(toHex(buildVendorRequest(0x10, 0x1234, 0x5678))).toBe("c0401234100008005678");
  });

  it("keeps the native driver media block at 80 bytes", () => {
    const media = buildMediaConfig(settings);
    expect(media).toHaveLength(80);
    expect(media[26]).toBe(PaperType.Gap);
    expect(media[28]).toBe(8);
    expect(media[30]).toBe(3);
  });

  it("centers and mirrors USB raster data", () => {
    const data = new Uint8Array(16 * 2);
    data.fill(255);
    data[0] = 0;
    const prepared = prepareUsbRaster({ width: 16, height: 2, data }, settings);
    expect(prepared.width).toBe(384);
    expect(prepared.data[199]).toBe(0);
  });

  it("creates the verified USB frame header", () => {
    const data = new Uint8Array(384 * 10);
    data.fill(255);
    data[383] = 0;
    const frame = usbImageFrames({ width: 384, height: 10, data }, settings, true)[0];
    expect(frame).toHaveLength(4096);
    expect(frame?.[2]).toBe(0x0e);
    expect(frame?.[3]).toBe(0x50);
    expect(frame?.slice(4, 7)).toEqual(new Uint8Array([10, 0, 48]));
    expect((frame?.[14] ?? 0) & 1).toBe(1);
  });

  it("preserves the vendor zero tail report", () => {
    const reports = hidReports(Uint8Array.from({ length: 64 }, (_, index) => index));
    expect(reports).toHaveLength(2);
    expect(reports[0]).toEqual(Uint8Array.from({ length: 64 }, (_, index) => index));
    expect(reports[1]).toEqual(new Uint8Array(64));
  });
});
