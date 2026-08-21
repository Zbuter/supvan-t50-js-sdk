import qrcode from "qrcode-generator";

import { ValidationError } from "../errors";
import { expandPageJob } from "../jobs";
import {
  dotsForMm,
  normalizePrinterProfile,
  SUPVAN_T50_PROFILE,
  type PrinterProfile,
  type PrinterProfileInput,
} from "../protocol/profile";
import type { DrawCanvasContext, DrawRenderOptions, DrawRenderTarget } from "./runtime-types";
import { code128Modules, ean13Modules } from "./barcode";
import {
  DrawFontStyle,
  DrawObjectFormat,
  type BarcodeObject,
  type DrawJob,
  type DrawObject,
  type DrawPage,
  type ImageObject,
  type LineObject,
  type QrCodeObject,
  type RectangleObject,
  type TextObject,
} from "./types";

export type { DrawCanvasContext, DrawRenderOptions, DrawRenderTarget } from "./runtime-types";
export type { DrawJob, DrawObject, DrawPage } from "./types";
export { DrawFontStyle, DrawObjectFormat } from "./types";
export { normalizeDrawObject } from "./normalize";

export interface DrawPageSize {
  width: number;
  height: number;
}

export function drawPageSize(page: Pick<DrawPage, "width" | "height">, profile: PrinterProfileInput = SUPVAN_T50_PROFILE): DrawPageSize {
  const resolvedProfile = normalizePrinterProfile(profile);
  if (!Number.isFinite(page.width) || !Number.isFinite(page.height) || page.width <= 0 || page.height <= 0) {
    throw new ValidationError("绘制页面宽高必须大于 0");
  }
  const size = { width: dotsForMm(page.width, resolvedProfile), height: dotsForMm(page.height, resolvedProfile) };
  return size;
}

export function drawObject(
  context: DrawCanvasContext,
  object: DrawObject,
  profile: PrinterProfileInput = SUPVAN_T50_PROFILE,
  options: DrawRenderOptions = {},
): void {
  const resolvedProfile = normalizePrinterProfile(profile);
  validateObject(object);
  const x = coordinateToDots(object.x, resolvedProfile);
  const y = coordinateToDots(object.y, resolvedProfile);
  const width = Math.max(1, dotsForMm(object.width, resolvedProfile));
  const height = Math.max(1, dotsForMm(object.height, resolvedProfile));
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate((normalizeAngle(object.rotation ?? 0) * Math.PI) / 180);
  context.translate(-width / 2, -height / 2);
  switch (object.format) {
    case DrawObjectFormat.Text:
      drawText(context, object, width, height, resolvedProfile);
      break;
    case DrawObjectFormat.QrCode:
      drawQrCode(context, object, width, height);
      break;
    case DrawObjectFormat.Code128:
    case DrawObjectFormat.Ean13:
      drawBarcode(context, object, width, height, object.format);
      break;
    case DrawObjectFormat.Rectangle:
      drawRectangle(context, object, width, height, resolvedProfile);
      break;
    case DrawObjectFormat.Line:
      drawLine(context, object, width, height, resolvedProfile);
      break;
    case DrawObjectFormat.Image:
      drawImage(context, object, width, height, options);
      break;
  }
  context.restore();
}

export function renderDrawPage(
  context: DrawCanvasContext,
  page: DrawPage,
  profile: PrinterProfileInput = SUPVAN_T50_PROFILE,
  options: DrawRenderOptions = {},
): DrawPageSize {
  const resolvedProfile = normalizePrinterProfile(profile);
  const size = drawPageSize(page, resolvedProfile);
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  for (const object of page.objects) drawObject(context, object, resolvedProfile, options);
  return size;
}

export function renderDrawJob<T extends DrawRenderTarget>(
  job: DrawJob,
  targetFactory: (size: DrawPageSize, page: DrawPage, index: number) => T,
  profile: PrinterProfileInput = SUPVAN_T50_PROFILE,
  options: DrawRenderOptions = {},
): T[] {
  const ordered = expandPageJob(job, {
    taskName: "绘制任务",
    validatePage: (page) => drawPageSize(page, profile),
  });
  return ordered.map((page, index) => {
    const size = drawPageSize(page, profile);
    const target = targetFactory(size, page, index);
    renderDrawPage(target.context, page, profile, options);
    return target;
  });
}

export function normalizeAngle(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function validateObject(object: DrawObject): void {
  if (!Number.isFinite(object.x) || !Number.isFinite(object.y) || object.x < 0 || object.y < 0) throw new ValidationError("绘制对象坐标不能为负");
  if (!Number.isFinite(object.width) || !Number.isFinite(object.height) || object.width <= 0 || object.height <= 0) throw new ValidationError("绘制对象宽高必须大于 0");
}

function coordinateToDots(value: number, profile: PrinterProfile): number {
  return Math.max(0, Math.round(value * profile.dotsPerMm));
}

function drawText(context: DrawCanvasContext, object: TextObject, width: number, height: number, profile: PrinterProfile): void {
  const style = Number(object.fontStyle ?? DrawFontStyle.Normal);
  const fontSize = Math.max(1, Math.round(Number(object.fontSize ?? 3) * profile.dotsPerMm));
  const fontName = object.fontFamily ?? "sans-serif";
  const fontWeight = style & DrawFontStyle.Bold || object.fontWeight === "bold" ? "bold" : "normal";
  const text = object.content;
  const lineFactor = Math.max(0.5, Number(object.lineHeight ?? 1.25));
  const lineHeight = Math.max(1, Math.round(fontSize * lineFactor));
  const autoReturn = object.autoReturn ?? false;
  const lines = autoReturn ? wrapText(context, text, width) : text.split("\n");
  const align = object.align ?? "left";
  const fill = object.antiColor ? "#ffffff" : "#000000";
  if (object.antiColor) {
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
  }
  context.font = `${fontWeight} ${fontSize}px ${fontName}`;
  context.textBaseline = "top";
  context.textAlign = align;
  const totalHeight = lines.length * lineHeight;
  let y = Math.max(0, Math.floor((height - totalHeight) / 2));
  for (const line of lines) {
    const measured = context.measureText(line).width;
    const x = align === "left" ? 0 : align === "center" ? width / 2 : width;
    context.fillStyle = fill;
    context.fillText(line, x, y);
    if (style & DrawFontStyle.Underline || style & DrawFontStyle.Strikeout) {
      const lineX = align === "left" ? 0 : align === "center" ? (width - measured) / 2 : width - measured;
      context.strokeStyle = fill;
      context.lineWidth = Math.max(1, Math.round(profile.dotsPerMm / 8));
      if (style & DrawFontStyle.Underline) {
        context.beginPath(); context.moveTo(lineX, y + lineHeight - 1); context.lineTo(lineX + measured, y + lineHeight - 1); context.stroke();
      }
      if (style & DrawFontStyle.Strikeout) {
        context.beginPath(); context.moveTo(lineX, y + Math.floor(lineHeight / 2)); context.lineTo(lineX + measured, y + Math.floor(lineHeight / 2)); context.stroke();
      }
    }
    y += lineHeight;
    if (y >= height) break;
  }
}

function wrapText(context: DrawCanvasContext, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const character of Array.from(paragraph)) {
      const next = line + character;
      if (line && context.measureText(next).width > width) { lines.push(line); line = character; } else line = next;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

function drawQrCode(context: DrawCanvasContext, object: QrCodeObject, width: number, height: number): void {
  if (!object.content) throw new ValidationError("QR_CODE 内容不能为空");
  const code = qrcode(0, "M");
  code.addData(object.content);
  code.make();
  const modules = code.getModuleCount();
  const cellWidth = width / modules;
  const cellHeight = height / modules;
  const inverse = object.antiColor ?? false;
  context.fillStyle = inverse ? "#000000" : "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = inverse ? "#ffffff" : "#000000";
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!code.isDark(row, column)) continue;
      const left = Math.round(column * cellWidth);
      const top = Math.round(row * cellHeight);
      const right = Math.round((column + 1) * cellWidth);
      const bottom = Math.round((row + 1) * cellHeight);
      context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
    }
  }
}

function drawBarcode(context: DrawCanvasContext, object: BarcodeObject, width: number, height: number, format: DrawObjectFormat.Code128 | DrawObjectFormat.Ean13): void {
  const modules = format === DrawObjectFormat.Ean13 ? ean13Modules(object.content) : code128Modules(object.content);
  const inverse = object.antiColor ?? false;
  const quiet = Math.max(4, Math.round(modules.length * 0.08));
  const usable = Math.max(1, width - quiet * 2);
  const scale = usable / modules.length;
  context.fillStyle = inverse ? "#000000" : "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = inverse ? "#ffffff" : "#000000";
  modules.forEach((bar, index) => { if (bar) context.fillRect(quiet + index * scale, 0, Math.max(0.5, scale + 0.05), height); });
}

function drawRectangle(context: DrawCanvasContext, object: RectangleObject, width: number, height: number, profile: PrinterProfile): void {
  if (object.fill && object.fill !== "transparent") { context.fillStyle = thermalColor(object.fill); context.fillRect(0, 0, width, height); }
  context.strokeStyle = thermalColor(object.stroke ?? "#000000");
  context.lineWidth = Math.max(1, Math.round(Number(object.strokeWidth ?? 0.35) * profile.dotsPerMm));
  context.strokeRect(0, 0, width, height);
}

function drawLine(context: DrawCanvasContext, object: LineObject, width: number, height: number, profile: PrinterProfile): void {
  context.strokeStyle = thermalColor(object.stroke ?? "#000000");
  context.lineWidth = Math.max(1, Math.round(Number(object.strokeWidth ?? 0.35) * profile.dotsPerMm));
  context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();
}

function drawImage(context: DrawCanvasContext, object: ImageObject, width: number, height: number, options: DrawRenderOptions): void {
  const source = options.imageResolver?.(object) ?? object.image;
  if (!source || typeof source === "string" || "data" in source || !("width" in source || "naturalWidth" in source)) {
    throw new ValidationError("IMAGE 对象需要 imageResolver 或 CanvasImageSource");
  }
  context.drawImage(source as CanvasImageSource, 0, 0, width, height);
}

function thermalColor(value: string): string {
  return value.toLowerCase() === "#ffffff" || value.toLowerCase() === "white" ? "#ffffff" : "#000000";
}
