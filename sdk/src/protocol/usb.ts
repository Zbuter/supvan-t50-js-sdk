import { FRAME_SIZE, HID_REPORT_SIZE, USB_FRAME_DATA_SIZE } from "../constants";
import { lzmaCompressFrames } from "../compression/lzma";
import { CommunicationError, ValidationError } from "../errors";
import {
  createGrayRaster,
  mirrorRaster,
  pasteRaster,
  rotateRaster,
  toGrayscale,
  type GrayRaster,
} from "../raster/raster";
import { makeStatus, stateFromFlags } from "./status";
import type { PrinterStatus, RasterPage, ResolvedPrintSettings } from "../types";
import { assertUInt, readU16LE, sum16, writeU16LE } from "../utils/bytes";

const MEDIA_TEMPLATE = new Uint8Array([
  48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 121, 1, 1, 91,
  235, 93, 155, 179, 48, 117, 1, 50, 50, 1, 3, 0, 224, 1, 0, 0, 164, 6, 176, 4,
  23, 8, 17, 11, 48, 57, 0, 0, 135, 220, 151, 205, 1, 224, 159, 64, 149, 68, 77, 133,
  236, 167, 205, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

export function buildVendorRequest(command: number, value1 = 0, value2?: number): Uint8Array {
  assertUInt(command, 8, "command");
  assertUInt(value1, 16, "value1");
  if (value2 !== undefined) assertUInt(value2, 16, "value2");
  const result = new Uint8Array(value2 === undefined ? 8 : 10);
  result.set([0xc0, 0x40, value1 >>> 8, value1 & 0xff, command, 0, 8, 0]);
  if (value2 !== undefined) result.set([value2 >>> 8, value2 & 0xff], 8);
  return result;
}

export function buildMediaConfig(settings: ResolvedPrintSettings): Uint8Array {
  const data = MEDIA_TEMPLATE.slice();
  data[26] = [1, 2, 4, 5].includes(settings.paperType) ? settings.paperType : 1;
  data[28] = Math.min(Math.max(Math.trunc(settings.materialHeight), 0), 120);
  data[30] = Math.min(Math.max(Math.trunc(settings.gap), 2), 8);
  return data;
}

export function parseUsbStatus(data: Uint8Array, totalPages = 0): PrinterStatus {
  if (data.length < 8) throw new CommunicationError(`USB 状态应为 8 字节，实际 ${data.length} 字节`);
  const raw = data.slice(0, 8);
  const main0 = raw[0] ?? 0;
  const main1 = raw[1] ?? 0;
  const fixed0 = raw[2] ?? 0;
  const fixed1 = raw[3] ?? 0;
  return makeStatus(stateFromFlags(main0, main1, fixed0, fixed1), {
    printedPages: readU16LE(raw, 4),
    totalPages,
    raw,
    rawFlags: raw,
    bufferFull: Boolean(main0 & 0x01),
    labelReadWriteError: Boolean(main0 & 0x02),
    mediaEmpty: Boolean(main0 & 0x04),
    mediaUnrecognized: Boolean(main0 & 0x08),
    mediaNotInstalled: Boolean(main0 & 0x10) || Boolean(fixed1 & 0x01),
    batteryLow: Boolean(main0 & 0x40),
    busy: Boolean(main1 & 0x04),
    coverOpen: Boolean(fixed0 & 0x08),
    usbInserted: Boolean(fixed0 & 0x10),
    printing: Boolean(fixed0 & 0x40),
    secondDeviceBusy: Boolean(fixed0 & 0x80),
    labelNotInstalled: Boolean(fixed1 & 0x01),
    charging: Boolean(fixed1 & 0x80),
  });
}

export function prepareUsbRaster(page: RasterPage, settings: ResolvedPrintSettings): GrayRaster {
  let source = toGrayscale(page);
  const directionTurns = [0, 2, 3, 1][settings.direction] ?? 0;
  source = rotateRaster(source, directionTurns);
  if (source.width > settings.maxDotValue) {
    throw new ValidationError(
      `图像宽度 ${source.width} 点超过当前型号最大打印宽度 ${settings.maxDotValue} 点；协议不会自动缩放`,
    );
  }
  const target = createGrayRaster(settings.maxDotValue, source.height);
  const left = Math.floor((settings.maxDotValue - source.width) / 2) + settings.horizontalOffset;
  pasteRaster(target, source, left, settings.verticalOffset);
  return mirrorRaster(target);
}

function pageFlags(first: boolean, last: boolean, lastJob: boolean, density: number, paperType: number): [number, number] {
  return [
    (first ? 0x02 : 0) | (last ? 0x04 : 0) | (lastJob ? 0x08 : 0),
    ((paperType & 0x03) << 6) | ((density & 0x0f) << 2),
  ];
}

export function usbImageFrames(
  page: RasterPage,
  settings: ResolvedPrintSettings,
  lastJobPage = false,
  threshold = 190,
): Uint8Array[] {
  const image = prepareUsbRaster(page, settings);
  const bytesPerRow = Math.ceil(image.width / 8);
  const rowsPerFrame = Math.floor(USB_FRAME_DATA_SIZE / bytesPerRow);
  if (rowsPerFrame <= 0) throw new ValidationError("图像宽度超过 T50 USB 帧容量");
  const packed = new Uint8Array(bytesPerRow * image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if ((image.data[y * image.width + x] ?? 255) < threshold) {
        packed[y * bytesPerRow + Math.floor(x / 8)]! |= 1 << (x % 8);
      }
    }
  }
  const total = Math.max(1, Math.ceil(image.height / rowsPerFrame));
  const frames: Uint8Array[] = [];
  for (let index = 0; index < total; index += 1) {
    const startRow = index * rowsPerFrame;
    const rowCount = Math.min(rowsPerFrame, image.height - startRow);
    const frame = new Uint8Array(FRAME_SIZE);
    frame.set(
      pageFlags(index === 0, index === total - 1, lastJobPage && index === total - 1, settings.density, settings.paperType),
      2,
    );
    writeU16LE(frame, 4, rowCount);
    frame[6] = bytesPerRow;
    frame[8] = 1;
    frame[10] = 1;
    const dataLength = rowCount * bytesPerRow;
    frame.set(packed.slice(startRow * bytesPerRow, startRow * bytesPerRow + dataLength), 14);
    const used = 14 + dataLength;
    let checksum = sum16(frame, 2, 14);
    for (let position = 255; position < used; position += 256) checksum += frame[position] ?? 0;
    writeU16LE(frame, 0, checksum & 0xffff);
    frames.push(frame);
  }
  return frames;
}

export function selectUsbTransferBlock(
  frames: readonly Uint8Array[],
  maxFrames = 8,
  maxSize = FRAME_SIZE,
): { data: Uint8Array; frameCount: number } {
  let count = Math.min(maxFrames, frames.length);
  while (count > 0) {
    const data = lzmaCompressFrames(frames.slice(0, count));
    if (data.length <= maxSize) return { data, frameCount: count };
    count -= 1;
  }
  throw new CommunicationError("单个 USB 图像帧压缩后仍超过设备上限");
}

export function hidReports(payload: Uint8Array): Uint8Array[] {
  const reportCount = Math.floor(payload.length / HID_REPORT_SIZE) + 1;
  return Array.from({ length: reportCount }, (_, index) => {
    const report = new Uint8Array(HID_REPORT_SIZE);
    report.set(payload.slice(index * HID_REPORT_SIZE, (index + 1) * HID_REPORT_SIZE));
    return report;
  });
}
