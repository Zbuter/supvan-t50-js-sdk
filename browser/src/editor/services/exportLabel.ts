import type { Canvas } from "fabric";

import { decodeLabelTransfer, encodeLabelTransfer, type LabelDocument, type RasterPage } from "shuofang-t50-sdk";
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
  downloadRasterPng(raster, filename);
}

export async function copyLabelTransferToClipboard(document: LabelDocument): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("当前浏览器不支持复制标签数据，请使用 HTTPS 或 localhost");
  }
  const value = encodeLabelTransfer({
    magic: "SUPVAN_LABEL",
    version: 1,
    document,
    source: { app: "supvan-t50-browser", timestamp: Date.now() },
  });
  await navigator.clipboard.writeText(value);
}

export async function readLabelTransferFromClipboard(): Promise<LabelDocument> {
  if (!navigator.clipboard?.readText) {
    throw new Error("当前浏览器不支持读取剪贴板，请使用 HTTPS 或 localhost");
  }
  const value = await navigator.clipboard.readText();
  return decodeLabelTransfer(value).document;
}

function downloadRasterPng(raster: RasterPage, filename: string): void {
  const element = rasterToCanvas(raster);
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = element.toDataURL("image/png");
  anchor.click();
}

function rasterToCanvas(raster: RasterPage): HTMLCanvasElement {
  const element = document.createElement("canvas");
  element.width = raster.width;
  element.height = raster.height;
  const context = element.getContext("2d");
  if (!context) throw new Error("无法创建标签图像");
  context.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  return element;
}
