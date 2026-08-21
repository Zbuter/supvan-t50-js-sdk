import { ValidationError } from "../errors";
import type { LabelBitmapResource } from "./types";

export function packMonochromeBitmap(
  widthDots: number,
  heightDots: number,
  pixels: Uint8Array | Uint8ClampedArray,
  threshold = 128,
): LabelBitmapResource {
  assertSize(widthDots, heightDots);
  if (pixels.length !== widthDots * heightDots && pixels.length !== widthDots * heightDots * 4) {
    throw new ValidationError("位图像素长度与尺寸不匹配");
  }
  const packed = new Uint8Array(Math.ceil(widthDots * heightDots / 8));
  const rgba = pixels.length === widthDots * heightDots * 4;
  for (let index = 0; index < widthDots * heightDots; index += 1) {
    const value = rgba ? pixels[index * 4]! : pixels[index]!;
    const alpha = rgba ? pixels[index * 4 + 3]! : 255;
    const black = rgba ? value < threshold && alpha > 0 : value < threshold;
    if (black) packed[index >> 3] = (packed[index >> 3] ?? 0) | (1 << (7 - (index & 7)));
  }
  return { encoding: "bitset-v1", widthDots, heightDots, data: encodeBase64(packed) };
}

export function unpackMonochromeBitmap(resource: LabelBitmapResource): Uint8Array {
  assertSize(resource.widthDots, resource.heightDots);
  const packed = decodeBase64(resource.data);
  const expected = Math.ceil(resource.widthDots * resource.heightDots / 8);
  if (packed.length !== expected) throw new ValidationError("位图 Base64 数据长度无效");
  const output = new Uint8Array(resource.widthDots * resource.heightDots);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = packed[index >> 3]! & (1 << (7 - (index & 7))) ? 0 : 255;
  }
  return output;
}

export function bitmapRowRuns(resource: LabelBitmapResource): Array<{ x: number; y: number; width: number }> {
  const pixels = unpackMonochromeBitmap(resource);
  const runs: Array<{ x: number; y: number; width: number }> = [];
  for (let y = 0; y < resource.heightDots; y += 1) {
    let start = -1;
    for (let x = 0; x <= resource.widthDots; x += 1) {
      const black = x < resource.widthDots && pixels[y * resource.widthDots + x] === 0;
      if (black && start < 0) start = x;
      if (!black && start >= 0) {
        runs.push({ x: start, y, width: x - start });
        start = -1;
      }
    }
  }
  return runs;
}

function assertSize(widthDots: number, heightDots: number): void {
  if (!Number.isInteger(widthDots) || widthDots <= 0 || !Number.isInteger(heightDots) || heightDots <= 0) {
    throw new ValidationError("位图宽高必须是正整数");
  }
}

function encodeBase64(data: Uint8Array): string {
  if (typeof btoa === "function") {
    let binary = "";
    for (const value of data) binary += String.fromCharCode(value);
    return btoa(binary);
  }
  const nodeBuffer = (globalThis as typeof globalThis & {
    Buffer?: { from(value: Uint8Array): { toString(encoding: "base64"): string } };
  }).Buffer;
  if (nodeBuffer) return nodeBuffer.from(data).toString("base64");
  throw new ValidationError("当前运行时不支持位图编码");
}

function decodeBase64(value: string): Uint8Array {
  try {
    if (typeof atob === "function") {
      const binary = atob(value);
      return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    }
    const nodeBuffer = (globalThis as typeof globalThis & {
      Buffer?: { from(value: string, encoding: "base64"): Uint8Array };
    }).Buffer;
    if (nodeBuffer) return Uint8Array.from(nodeBuffer.from(value, "base64"));
    if (/^[0-9a-f]+$/i.test(value) && value.length % 2 === 0) {
      return Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
    }
  } catch {
    throw new ValidationError("位图 Base64 数据无效");
  }
  throw new ValidationError("当前运行时不支持位图编码");
}
