import type { PrinterProfile } from "./protocol/profile";
import { SUPVAN_T50_PROFILE } from "./protocol/profile";
import { toThermalPixels } from "./raster/thermal";
import type { RasterPage } from "./types";
import type { DrawObject } from "./draw/types";
import { drawPageSize, renderDrawJob, renderDrawPage, type DrawJob, type DrawPage, type DrawRenderOptions, type DrawRenderTarget } from "./draw/renderer";

export interface BrowserPreviewOptions extends DrawRenderOptions {
  profile?: PrinterProfile;
  canvas?: HTMLCanvasElement;
  canvasFactory?: (width: number, height: number) => HTMLCanvasElement;
  monochrome?: boolean;
}

export interface BrowserObjectPreviewOptions extends BrowserPreviewOptions {
  pageWidth?: number;
  pageHeight?: number;
}

/** Render a DrawPage to a real browser canvas at printer dots, without scaling. */
export function previewDrawPage(page: DrawPage, options: BrowserPreviewOptions = {}): HTMLCanvasElement {
  const profile = options.profile ?? SUPVAN_T50_PROFILE;
  const size = drawPageSize(page, profile);
  const canvas = options.canvas ?? options.canvasFactory?.(size.width, size.height) ?? createCanvas(size.width, size.height);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器不支持 Canvas 2D 上下文");
  renderDrawPage(context, page, profile, options);
  if (options.monochrome ?? true) forceThermalCanvas(canvas);
  return canvas;
}

/** Render one DrawObject on a physical label canvas. */
export function previewDrawObject(object: DrawObject, options: BrowserObjectPreviewOptions = {}): HTMLCanvasElement {
  const pageWidth = options.pageWidth ?? Math.max(1, object.x + object.width);
  const pageHeight = options.pageHeight ?? Math.max(1, object.y + object.height);
  return previewDrawPage({ width: pageWidth, height: pageHeight, objects: [object] }, options);
}

/** Render all physical pages, applying copies/repeat order like printer.print(). */
export function previewDrawJob(job: DrawJob, options: BrowserPreviewOptions = {}): HTMLCanvasElement[] {
  const profile = options.profile ?? SUPVAN_T50_PROFILE;
  return renderDrawJob(job, (size): DrawRenderTarget & { canvas: HTMLCanvasElement } => {
    const canvas = options.canvasFactory?.(size.width, size.height) ?? createCanvas(size.width, size.height);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器不支持 Canvas 2D 上下文");
    return { context, width: size.width, height: size.height, canvas };
  }, profile, options).map((target) => {
    const canvas = target.canvas;
    if (options.monochrome ?? true) forceThermalCanvas(canvas);
    return canvas;
  });
}

/** Alias matching the Python SDK's preview_job naming. */
export const previewJob = previewDrawJob;

export function rasterFromPreviewCanvas(canvas: HTMLCanvasElement, monochrome = true): RasterPage {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器不支持 Canvas 2D 上下文");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  if (monochrome) image.data.set(toThermalPixels(image.data));
  return { width: image.width, height: image.height, data: image.data };
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") throw new Error("previewDrawPage 只能在浏览器中创建默认 Canvas；小程序请传入 Canvas context");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function forceThermalCanvas(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器不支持 Canvas 2D 上下文");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  image.data.set(toThermalPixels(image.data));
  context.putImageData(image, 0, 0);
}
