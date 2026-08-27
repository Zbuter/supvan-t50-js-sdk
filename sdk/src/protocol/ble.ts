import {
  BLE_MAX_LINES_PER_FRAME,
  BYTES_PER_LINE,
  FRAME_HEADER_SIZE,
  FRAME_SIZE,
  PRINT_DIRECTION_TURNS,
  PRINT_WIDTH_DOTS,
} from "../constants";
import { lzmaCompressFrames } from "../compression/lzma";
import { CommunicationError, ValidationError } from "../errors";
import {
  createGrayRaster,
  pasteRaster,
  resizeRaster,
  rotateRaster,
  toGrayscale,
  type GrayRaster,
} from "../raster/raster";
import { makeStatus, stateFromFlags } from "./status";
import { PaperType, type LabelBoxInfo, type PrinterStatus, type RasterPage, type ResolvedPrintSettings } from "../types";
import { assertUInt, readI16LE, readU16LE, readU32LE, sum16, writeU16LE } from "../utils/bytes";

const PARAMETER_TEMPLATE = new Uint8Array([
  48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  121, 1, 1, 91, 235, 93, 155, 179, 48, 117, 1, 50, 50, 1, 3, 0,
  224, 1, 0, 0, 164, 6, 176, 4, 23, 8, 17, 11, 48, 57, 0, 0,
  135, 220, 151, 205, 1, 224, 159, 64, 149, 68, 77, 133, 236, 167, 205, 0,
  0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

export function buildR1(command: number, value = 0): Uint8Array {
  assertUInt(command, 8, "command");
  assertUInt(value, 16, "value");
  const frame = new Uint8Array(16);
  frame.set([0x7e, 0x5a, 12, 0, 0x10, 1, 0xaa, command], 0);
  frame.set([0, 1, value & 0xff, value >>> 8, 0, 0], 10);
  writeU16LE(frame, 8, sum16(frame, 10));
  return frame;
}

export function buildR2(command: number, transferSize: number, packetCount: number): Uint8Array {
  assertUInt(command, 8, "command");
  assertUInt(transferSize, 16, "transferSize");
  assertUInt(packetCount, 16, "packetCount");
  const frame = new Uint8Array(16);
  frame.set([0x7e, 0x5a, 12, 0, 0x10, 1, 0xaa, command], 0);
  frame.set(
    [0, 1, transferSize & 0xff, transferSize >>> 8, packetCount & 0xff, packetCount >>> 8],
    10,
  );
  writeU16LE(frame, 8, sum16(frame, 10));
  return frame;
}

export function buildDataQuery(command: number, data: Uint8Array): Uint8Array {
  assertUInt(command, 8, "command");
  const frame = new Uint8Array(data.length + 12);
  const payloadLength = data.length + 8;
  frame.set(
    [0x7e, 0x5a, payloadLength & 0xff, payloadLength >>> 8, 0x10, 1, 0xaa, command],
    0,
  );
  frame.set([0, 1], 10);
  frame.set(data, 12);
  writeU16LE(frame, 8, sum16(frame, 10));
  return frame;
}

export function parseBleResponse(frame: Uint8Array, expectedCommand?: number): Uint8Array {
  if (frame.length < 12 || frame[0] !== 0x7e || frame[1] !== 0x5a) {
    throw new CommunicationError("无效的硕方 BLE 响应帧");
  }
  const declared = readU16LE(frame, 2) + 4;
  if (declared !== frame.length) {
    throw new CommunicationError(`BLE 响应长度不匹配：声明 ${declared}，收到 ${frame.length}`);
  }
  if (expectedCommand !== undefined && frame[7] !== expectedCommand) {
    throw new CommunicationError(`BLE 响应命令不匹配：0x${(frame[7] ?? 0).toString(16)}`);
  }
  if (readU16LE(frame, 8) !== sum16(frame, 10)) {
    throw new CommunicationError("BLE 响应校验和错误");
  }
  return frame;
}

export function parseBleStatus(frame: Uint8Array): PrinterStatus {
  parseBleResponse(frame, 0x11);
  if (frame.length < 26) throw new CommunicationError("BLE 状态响应字段不完整");
  const main0 = frame[14] ?? 0;
  const main1 = frame[15] ?? 0;
  const fixed0 = frame[16] ?? 0;
  const fixed1 = frame[17] ?? 0;
  return makeStatus(stateFromFlags(main0, main1, fixed0, fixed1), {
    printedPages: readU16LE(frame, 18),
    totalPages: 0,
    raw: frame,
    rawFlags: frame.slice(14, 18),
    temperatureC: readI16LE(frame, 22) / 10,
    voltageV: readU16LE(frame, 24) / 1000,
    bufferFull: Boolean(main0 & 0x01),
    headOverheat: Boolean(main1 & 0x08),
    labelReadWriteError: Boolean(main0 & 0x02),
    mediaNotDetected: Boolean(main0 & 0x02),
    mediaLow: Boolean(main0 & 0x20),
    mediaEmpty: Boolean(main0 & 0x04),
    mediaUnrecognized: Boolean(main0 & 0x08),
    mediaNotInstalled: Boolean(main0 & 0x10),
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

function signedByte(value: number): number {
  return value >= 128 ? value - 256 : value;
}

export function parseLabelBoxData(data: Uint8Array): LabelBoxInfo {
  const marker = data.indexOf(0x1d);
  const start = marker + 1;
  if (marker < 0 || data.length < start + 35) {
    throw new CommunicationError("标签盒响应字段不完整");
  }
  const rawGap = signedByte(data[start + 19] ?? 0);
  const hex = (part: Uint8Array): string =>
    Array.from(part, (value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
  const timestampDigits = Array.from(data.slice(start + 29, start + 35), signedByte)
    .map((value) => (value < 10 ? `0${value}` : String(value)))
    .join("");
  const rawHeight = data[start + 18] ?? 0;
  return {
    uuidHex: hex(data.slice(start, start + 7)),
    codeHex: hex(data.slice(start + 7, start + 15)),
    serialNumber: readU16LE(data, start + 15),
    typeCode: data[start + 17] ?? 0,
    rawHeight,
    height: Math.min(rawHeight, 50),
    width: data[start + 17] ?? 0,
    rawGap,
    gap: rawGap <= 8 ? rawGap : 3,
    remaining: readU32LE(data, start + 20),
    template5mm: readU16LE(data, start + 24),
    template40mm: readU16LE(data, start + 26),
    timestampDigits,
    raw: data,
  };
}

export function parseBleLabelBox(frame: Uint8Array): LabelBoxInfo {
  parseBleResponse(frame, 0x30);
  return parseLabelBoxData(frame);
}

export function makeParameterBlock(settings: ResolvedPrintSettings): Uint8Array {
  const block = PARAMETER_TEMPLATE.slice();
  block[26] = settings.paperType;
  block[27] = settings.materialWidth & 0xff;
  block[28] = settings.materialHeight & 0xff;
  block[30] = settings.gap & 0xff;
  block[31] = settings.tailLength & 0xff;
  return block;
}

export function prepareBleRaster(page: RasterPage, settings: ResolvedPrintSettings): GrayRaster {
  let source = toGrayscale(page);
  const turns = PRINT_DIRECTION_TURNS[settings.direction];
  source = rotateRaster(source, turns);
  const printHeight = Math.max(1, Math.round(settings.materialHeight * settings.dotsPerMm));
  if (source.width > settings.maxWidthDots) {
    throw new ValidationError(
      `图像宽度 ${source.width} 点超过当前页面打印宽度 ${settings.maxWidthDots} 点；页面内容不会自动缩放`,
    );
  }
  if (source.height > printHeight) {
    throw new ValidationError(
      `图像高度 ${source.height} 点超过标签高度 ${printHeight} 点；协议不会自动缩放`,
    );
  }
  // The BLE frame layout is tied to the 384-dot T50 thermal head. Narrower
  // media changes the content size, not the 48-byte line stride. The verified
  // reference implementation also scales only content wider than the head.
  if (source.width > PRINT_WIDTH_DOTS) {
    const scale = PRINT_WIDTH_DOTS / source.width;
    source = resizeRaster(
      source,
      PRINT_WIDTH_DOTS,
      Math.max(1, Math.round(source.height * scale)),
    );
  }
  const canvas = createGrayRaster(PRINT_WIDTH_DOTS, printHeight);
  const x = Math.floor((PRINT_WIDTH_DOTS - source.width) / 2) + settings.horizontalOffset;
  const y = Math.floor((canvas.height - source.height) / 2) + settings.verticalOffset;
  pasteRaster(canvas, source, x, y);
  return rotateRaster(canvas, 3);
}

function packColumns(image: GrayRaster, bytesPerLine: number, threshold = 190): {
  columns: Uint8Array[];
  leading: number;
  trailing: number;
} {
  const columns: Uint8Array[] = [];
  let leading = 0;
  let last = 0;
  let found = false;
  for (let x = 0; x < image.width; x += 1) {
    const column = new Uint8Array(bytesPerLine);
    let black = false;
    for (let y = 0; y < image.height; y += 1) {
      if ((image.data[y * image.width + x] ?? 255) < threshold) {
        column[Math.floor(y / 8)]! |= 1 << (y % 8);
        black = true;
      }
    }
    if (black) {
      if (!found) {
        leading = x;
        found = true;
      }
      last = x;
    }
    columns.push(column);
  }
  return { columns, leading, trailing: Math.max(image.width - last - 4, 1) };
}

function frameFlags(first: boolean, last: boolean, jobLast: boolean, density: number): [number, number] {
  return [
    (first ? 0x02 : 0) | (last ? 0x04 : 0) | (jobLast ? 0x08 : 0),
    ((density & 0x0f) << 2) | 0x40,
  ];
}

export function bleImageFrames(
  page: RasterPage,
  settings: ResolvedPrintSettings,
  jobLastPage = false,
): Uint8Array[] {
  const bytesPerLine = BYTES_PER_LINE;
  const maxLinesPerFrame = BLE_MAX_LINES_PER_FRAME;
  const { columns, leading, trailing } = packColumns(prepareBleRaster(page, settings), bytesPerLine);
  let printable = Math.max(0, columns.length - leading - trailing);
  if (printable === 0) printable = 1;
  const result: Uint8Array[] = [];
  let offset = 0;
  while (offset < printable) {
    const count = Math.min(maxLinesPerFrame, printable - offset);
    const first = offset === 0;
    const last = offset + count >= printable;
    const frame = new Uint8Array(FRAME_SIZE);
    frame.set(frameFlags(first, last, last && jobLastPage, settings.density), 2);
    writeU16LE(frame, 4, count);
    frame[6] = bytesPerLine;
    let before: number;
    let after: number;
    if (settings.paperType === PaperType.BlackMark) {
      const totalBlank = leading + trailing;
      if (totalBlank < 13) [before, after] = [12, 1];
      else if (leading < 12) [before, after] = [12, Math.max(1, trailing - (12 - leading))];
      else if (trailing === 0) [before, after] = [Math.max(1, leading - 1), 1];
      else [before, after] = [leading, trailing];
    } else {
      before = Math.min(800, Math.max(1, leading));
      after = Math.min(800, Math.max(1, trailing));
    }
    writeU16LE(frame, 8, before);
    writeU16LE(frame, 10, after);
    for (let index = 0; index < count; index += 1) {
      const column = columns[leading + offset + index];
      if (column) frame.set(column, FRAME_HEADER_SIZE + index * bytesPerLine);
    }
    const used = FRAME_HEADER_SIZE + count * bytesPerLine;
    let checksum = sum16(frame, 2, FRAME_HEADER_SIZE);
    for (let boundary = 255; boundary < used; boundary += 256) checksum += frame[boundary] ?? 0;
    writeU16LE(frame, 0, checksum & 0xffff);
    result.push(frame);
    offset += count;
  }
  return result;
}

export interface CompressedBatch {
  frameCount: number;
  data: Uint8Array;
  speed: number;
}

function transferSpeed(average: number): number {
  if (average > 3000) return 10;
  if (average > 2800) return 15;
  if (average > 2500) return 20;
  if (average > 2000) return 25;
  if (average > 1500) return 40;
  if (average > 1000) return 45;
  if (average > 500) return 55;
  return 60;
}

export function compressedBleBatches(frames: readonly Uint8Array[], maxFrames = 4): CompressedBatch[] {
  const result: CompressedBatch[] = [];
  let index = 0;
  while (index < frames.length) {
    let count = Math.min(maxFrames, frames.length - index);
    let data: Uint8Array = new Uint8Array();
    while (count > 0) {
      data = lzmaCompressFrames(frames.slice(index, index + count));
      if (data.length <= FRAME_SIZE || count === 1) break;
      count -= 1;
    }
    if (count === 0) throw new ValidationError("无法生成 BLE 压缩批次");
    result.push({ frameCount: count, data, speed: transferSpeed(Math.floor(data.length / count)) });
    index += count;
  }
  return result;
}

export function buildPrintBulkPacket(packetIndex: number, packetCount: number, data: Uint8Array): Uint8Array {
  assertUInt(packetIndex, 8, "packetIndex");
  assertUInt(packetCount, 8, "packetCount");
  if (data.length > 500) throw new ValidationError("BLE 打印分包不能超过 500 字节");
  const packet = new Uint8Array(506);
  packet.set([0xaa, 0xbb], 0);
  packet.set([packetIndex, packetCount], 4);
  packet.set(data, 6);
  writeU16LE(packet, 2, sum16(packet, 4));
  return packet;
}

export function buildBulkOuter512(inner: Uint8Array): Uint8Array {
  if (inner.length !== 506) throw new ValidationError("BLE 内层打印包必须为 506 字节");
  const result = new Uint8Array(512);
  result.set([0x7e, 0x5a, 0xfc, 0x01, 0x10, 0x02], 0);
  result.set(inner, 6);
  return result;
}

export function bulkPackets(data: Uint8Array): Uint8Array[] {
  const total = Math.ceil(data.length / 500);
  if (total > 0xff) throw new ValidationError("BLE 批量传输超过 255 个分包");
  return Array.from({ length: total }, (_, index) =>
    buildBulkOuter512(buildPrintBulkPacket(index, total, data.slice(index * 500, (index + 1) * 500))),
  );
}
