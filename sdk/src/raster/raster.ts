import { ValidationError } from "../errors";
import type { RasterPage } from "../types";

export interface GrayRaster {
  width: number;
  height: number;
  data: Uint8Array;
}

export function toGrayscale(page: RasterPage): GrayRaster {
  const pixelCount = page.width * page.height;
  if (page.data.length === pixelCount) {
    return { width: page.width, height: page.height, data: new Uint8Array(page.data) };
  }
  if (page.data.length !== pixelCount * 4) {
    throw new ValidationError("栅格数据必须是灰度或 RGBA 格式");
  }
  const data = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const source = index * 4;
    const alpha = (page.data[source + 3] ?? 255) / 255;
    const luminance =
      (page.data[source] ?? 0) * 0.299 +
      (page.data[source + 1] ?? 0) * 0.587 +
      (page.data[source + 2] ?? 0) * 0.114;
    data[index] = Math.round(luminance * alpha + 255 * (1 - alpha));
  }
  return { width: page.width, height: page.height, data };
}

export function createGrayRaster(width: number, height: number, fill = 255): GrayRaster {
  const data = new Uint8Array(width * height);
  data.fill(fill);
  return { width, height, data };
}

export function resizeRaster(source: GrayRaster, width: number, height: number): GrayRaster {
  if (width === source.width && height === source.height) return source;
  const output = createGrayRaster(width, height);
  const xScale = source.width / width;
  const yScale = source.height / height;
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, (y + 0.5) * yScale - 0.5);
    const y0 = Math.max(0, Math.floor(sourceY));
    const y1 = Math.min(source.height - 1, y0 + 1);
    const yWeight = sourceY - y0;
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, (x + 0.5) * xScale - 0.5);
      const x0 = Math.max(0, Math.floor(sourceX));
      const x1 = Math.min(source.width - 1, x0 + 1);
      const xWeight = sourceX - x0;
      const top =
        (source.data[y0 * source.width + x0] ?? 255) * (1 - xWeight) +
        (source.data[y0 * source.width + x1] ?? 255) * xWeight;
      const bottom =
        (source.data[y1 * source.width + x0] ?? 255) * (1 - xWeight) +
        (source.data[y1 * source.width + x1] ?? 255) * xWeight;
      output.data[y * width + x] = Math.round(top * (1 - yWeight) + bottom * yWeight);
    }
  }
  return output;
}

export function rotateRaster(source: GrayRaster, clockwiseQuarterTurns: number): GrayRaster {
  const turns = ((clockwiseQuarterTurns % 4) + 4) % 4;
  if (turns === 0) return source;
  if (turns === 2) {
    const output = createGrayRaster(source.width, source.height);
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        output.data[(source.height - 1 - y) * source.width + source.width - 1 - x] =
          source.data[y * source.width + x] ?? 255;
      }
    }
    return output;
  }
  const output = createGrayRaster(source.height, source.width);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const value = source.data[y * source.width + x] ?? 255;
      if (turns === 1) {
        output.data[x * output.width + (output.width - 1 - y)] = value;
      } else {
        output.data[(output.height - 1 - x) * output.width + y] = value;
      }
    }
  }
  return output;
}

export function pasteRaster(target: GrayRaster, source: GrayRaster, left: number, top: number): void {
  for (let y = 0; y < source.height; y += 1) {
    const targetY = top + y;
    if (targetY < 0 || targetY >= target.height) continue;
    for (let x = 0; x < source.width; x += 1) {
      const targetX = left + x;
      if (targetX < 0 || targetX >= target.width) continue;
      target.data[targetY * target.width + targetX] = source.data[y * source.width + x] ?? 255;
    }
  }
}

export function mirrorRaster(source: GrayRaster): GrayRaster {
  const output = createGrayRaster(source.width, source.height);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      output.data[y * source.width + source.width - 1 - x] =
        source.data[y * source.width + x] ?? 255;
    }
  }
  return output;
}

export interface RgbaImageData {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export function rasterFromImageData(image: RgbaImageData): RasterPage {
  return { width: image.width, height: image.height, data: image.data };
}
