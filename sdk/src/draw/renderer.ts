import qrcode from "qrcode-generator";

import { ValidationError } from "../errors";
import { dotsForMm, SUPVAN_T50_PROFILE, type PrinterProfile } from "../protocol/profile";
import type { DrawCanvasContext, DrawRenderOptions, DrawRenderTarget } from "./runtime-types";
import { code128Modules, ean13Modules } from "./barcode";
import { DrawFontStyle, DrawObjectFormat, type DrawJob, type DrawObject, type DrawPage } from "./types";

export type { DrawCanvasContext, DrawRenderOptions, DrawRenderTarget } from "./runtime-types";
export type { DrawJob, DrawObject, DrawPage } from "./types";
export { DrawFontStyle, DrawObjectFormat } from "./types";

export interface DrawPageSize {
  width: number;
  height: number;
}

export function drawPageSize(page: Pick<DrawPage, "width" | "height">, profile: PrinterProfile = SUPVAN_T50_PROFILE): DrawPageSize {
  if (!Number.isFinite(page.width) || !Number.isFinite(page.height) || page.width <= 0 || page.height <= 0) {
    throw new ValidationError("绘制页面宽高必须大于 0");
  }
  const size = { width: dotsForMm(page.width, profile), height: dotsForMm(page.height, profile) };
  if (size.width > profile.maxWidthDots) {
    throw new ValidationError(`当前 ${profile.name} 最大支持 ${profile.maxWidthDots} 点，${page.width}mm 需要 ${size.width} 点；不会缩放`);
  }
  return size;
}

export function drawObject(
  context: DrawCanvasContext,
  object: DrawObject,
  profile: PrinterProfile = SUPVAN_T50_PROFILE,
  options: DrawRenderOptions = {},
): void {
  validateObject(object);
  const x = coordinateToDots(object.x, profile);
  const y = coordinateToDots(object.y, profile);
  const width = Math.max(1, dotsForMm(object.width, profile));
  const height = Math.max(1, dotsForMm(object.height, profile));
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate((normalizeAngle(object.rotation ?? 0) * Math.PI) / 180);
  context.translate(-width / 2, -height / 2);
  const format = normalizeFormat(object);
  if (format === DrawObjectFormat.Text) drawText(context, object, width, height, profile);
  else if (format === DrawObjectFormat.QrCode) drawQrCode(context, object, width, height);
  else if (format === DrawObjectFormat.Code128 || format === DrawObjectFormat.Ean13) {
    drawBarcode(context, object, width, height, format);
  } else if (format === DrawObjectFormat.Rectangle) drawRectangle(context, object, width, height, profile);
  else if (format === DrawObjectFormat.Line) drawLine(context, object, width, height, profile);
  else drawImage(context, object, width, height, options);
  context.restore();
}

export function renderDrawPage(
  context: DrawCanvasContext,
  page: DrawPage,
  profile: PrinterProfile = SUPVAN_T50_PROFILE,
  options: DrawRenderOptions = {},
): DrawPageSize {
  const size = drawPageSize(page, profile);
  context.clearRect(0, 0, size.width, size.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  for (const object of page.objects) drawObject(context, object, profile, options);
  return size;
}

export function renderDrawJob<T extends DrawRenderTarget>(
  job: DrawJob,
  targetFactory: (size: DrawPageSize, page: DrawPage, index: number) => T,
  profile: PrinterProfile = SUPVAN_T50_PROFILE,
  options: DrawRenderOptions = {},
): T[] {
  if (!job.pages.length) throw new ValidationError("绘制任务至少需要一页");
  const copies = job.settings?.copies ?? 1;
  if (!Number.isInteger(copies) || copies < 1 || copies > 99) throw new ValidationError("绘制任务 copies 必须是 1-99 的整数");
  const pages = job.pages.map((page) => {
    const repeat = page.repeat ?? 1;
    if (!Number.isInteger(repeat) || repeat < 1) throw new ValidationError("绘制页面 repeat 必须是正整数");
    drawPageSize(page, profile);
    return { page, repeat };
  });
  const ordered: DrawPage[] = [];
  const append = (page: DrawPage) => ordered.push(page);
  if (job.settings?.oneByOne ?? true) {
    for (let copy = 0; copy < copies; copy += 1) for (const item of pages) for (let repeat = 0; repeat < item.repeat; repeat += 1) append(item.page);
  } else {
    for (const item of pages) for (let repeat = 0; repeat < item.repeat; repeat += 1) for (let copy = 0; copy < copies; copy += 1) append(item.page);
  }
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
  return Math.max(0, Math.round(value * profile.dpi));
}

function normalizeFormat(object: DrawObject): DrawObjectFormat {
  const raw = String(object.format ?? object.type ?? object.kind ?? DrawObjectFormat.Text).trim().toUpperCase().replace(/[-\s]/g, "_");
  if (raw === "QRCODE") return DrawObjectFormat.QrCode;
  if (raw === "CODE128" || raw === "BARCODE") return DrawObjectFormat.Code128;
  if (raw === "EAN13") return DrawObjectFormat.Ean13;
  if (raw === "RECT") return DrawObjectFormat.Rectangle;
  if (raw === "IMAGE" || raw === "IMG") return DrawObjectFormat.Image;
  if (raw === "LINE") return DrawObjectFormat.Line;
  if (raw === "RECTANGLE") return DrawObjectFormat.Rectangle;
  if (raw === "QR_CODE") return DrawObjectFormat.QrCode;
  if (raw === "CODE_128") return DrawObjectFormat.Code128;
  if (raw === "EAN_13") return DrawObjectFormat.Ean13;
  if (raw === "TEXT") return DrawObjectFormat.Text;
  throw new ValidationError(`不支持的绘制对象格式：${raw}`);
}

function valueOf(object: DrawObject, camel: keyof DrawObject, snake: keyof DrawObject): unknown {
  return object[camel] ?? object[snake];
}

function drawText(context: DrawCanvasContext, object: DrawObject, width: number, height: number, profile: PrinterProfile): void {
  const style = Number(valueOf(object, "fontStyle", "font_style") ?? DrawFontStyle.Normal);
  const fontSize = Math.max(1, Math.round(Number(valueOf(object, "fontSize", "font_size") ?? 3) * profile.dpi));
  const fontName = String(valueOf(object, "fontName", "font_name") ?? object.fontFamily ?? object.font_family ?? "sans-serif");
  const fontWeight = style & DrawFontStyle.Bold || object.fontWeight === "bold" || object.font_weight === "bold" ? "bold" : "normal";
  const text = object.content ?? object.text ?? "";
  const lineFactor = Math.max(0.5, Number(valueOf(object, "lineHeight", "line_height") ?? 1.25));
  const lineHeight = Math.max(1, Math.round(fontSize * lineFactor));
  const autoReturn = Boolean(valueOf(object, "autoReturn", "auto_return") ?? false);
  const lines = autoReturn ? wrapText(context, text, width) : text.split("\n");
  const align = normalizeAlign(object.align);
  const fill = Boolean(valueOf(object, "antiColor", "anti_color")) ? "#ffffff" : "#000000";
  if (valueOf(object, "antiColor", "anti_color")) {
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
      context.lineWidth = Math.max(1, Math.round(profile.dpi / 8));
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

function drawQrCode(context: DrawCanvasContext, object: DrawObject, width: number, height: number): void {
  const code = qrcode(0, "M");
  code.addData(object.content ?? object.text ?? "");
  code.make();
  const modules = code.getModuleCount();
  const quiet = 4;
  const cell = Math.max(1, Math.floor(Math.min(width, height) / (modules + quiet * 2)));
  const size = modules * cell;
  const offsetX = Math.floor((width - size) / 2);
  const offsetY = Math.floor((height - size) / 2);
  const inverse = Boolean(valueOf(object, "antiColor", "anti_color"));
  context.fillStyle = inverse ? "#000000" : "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = inverse ? "#ffffff" : "#000000";
  for (let row = 0; row < modules; row += 1) for (let column = 0; column < modules; column += 1) if (code.isDark(row, column)) context.fillRect(offsetX + column * cell, offsetY + row * cell, cell, cell);
}

function drawBarcode(context: DrawCanvasContext, object: DrawObject, width: number, height: number, format: DrawObjectFormat): void {
  const modules = format === DrawObjectFormat.Ean13 ? ean13Modules(object.content ?? object.text ?? "") : code128Modules(object.content ?? object.text ?? "");
  const inverse = Boolean(valueOf(object, "antiColor", "anti_color"));
  const quiet = Math.max(4, Math.round(modules.length * 0.08));
  const usable = Math.max(1, width - quiet * 2);
  const scale = usable / modules.length;
  context.fillStyle = inverse ? "#000000" : "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = inverse ? "#ffffff" : "#000000";
  modules.forEach((bar, index) => { if (bar) context.fillRect(quiet + index * scale, 0, Math.max(0.5, scale + 0.05), height); });
}

function drawRectangle(context: DrawCanvasContext, object: DrawObject, width: number, height: number, profile: PrinterProfile): void {
  if (object.fill && object.fill !== "transparent") { context.fillStyle = thermalColor(object.fill); context.fillRect(0, 0, width, height); }
  context.strokeStyle = thermalColor(object.stroke ?? "#000000");
  context.lineWidth = Math.max(1, Math.round(Number(valueOf(object, "strokeWidth", "stroke_width") ?? 0.35) * profile.dpi));
  context.strokeRect(0, 0, width, height);
}

function drawLine(context: DrawCanvasContext, object: DrawObject, width: number, height: number, profile: PrinterProfile): void {
  context.strokeStyle = thermalColor(object.stroke ?? "#000000");
  context.lineWidth = Math.max(1, Math.round(Number(valueOf(object, "strokeWidth", "stroke_width") ?? 0.35) * profile.dpi));
  context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();
}

function drawImage(context: DrawCanvasContext, object: DrawObject, width: number, height: number, options: DrawRenderOptions): void {
  const source = options.imageResolver?.(object) ?? object.image;
  if (!source || typeof source === "string" || !("width" in source || "naturalWidth" in source)) throw new ValidationError("IMAGE 对象需要 imageResolver 或 CanvasImageSource");
  context.drawImage(source as CanvasImageSource, 0, 0, width, height);
}

function normalizeAlign(value: DrawObject["align"]): "left" | "center" | "right" {
  if (value === 1 || value === "center") return "center";
  if (value === 2 || value === "right") return "right";
  return "left";
}

function thermalColor(value: string): string {
  return value.toLowerCase() === "#ffffff" || value.toLowerCase() === "white" ? "#ffffff" : "#000000";
}
