import type { Canvas } from "fabric";

import type { RasterPage } from "shuofang-t50-sdk";
import { toThermalPixels } from "./monochrome";

export function exportRaster(canvas: Canvas): RasterPage {
  const active = canvas.getActiveObject();
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  const element = canvas.toCanvasElement(1, {
    filter: (object) => !object.excludeFromExport,
  });
  const context = element.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法读取标签画布像素");
  const image = context.getImageData(0, 0, element.width, element.height);
  image.data.set(toThermalPixels(image.data));
  if (active) canvas.setActiveObject(active);
  canvas.requestRenderAll();
  return { width: image.width, height: image.height, data: image.data };
}

export function downloadPng(canvas: Canvas, filename = "label.png"): void {
  const raster = exportRaster(canvas);
  const element = document.createElement("canvas");
  element.width = raster.width;
  element.height = raster.height;
  const context = element.getContext("2d");
  if (!context) return;
  context.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = element.toDataURL("image/png");
  anchor.click();
}
