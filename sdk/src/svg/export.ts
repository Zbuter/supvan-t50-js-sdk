import qrcode from "qrcode-generator";

import { bitmapRowRuns } from "../label/bitmap";
import { code128Modules, ean13Modules } from "../draw/barcode";
import type { LabelDocument, LabelObject, LabelPath, LabelResources } from "../label/types";
import { validateLabelDocument } from "../label/validate";

export function labelDocumentToSvgString(document: LabelDocument): string {
  validateLabelDocument(document);
  const body = document.objects.map((object) => objectToSvg(object, document.resources, 0, 0)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${number(document.width)}mm" height="${number(document.height)}mm" viewBox="0 0 ${number(document.width)} ${number(document.height)}" data-supvan-format="2"><title>${escapeXml(document.name ?? "SUPVAN 标签")}</title>${body}</svg>`;
}

function objectToSvg(object: LabelObject, resources: LabelResources | undefined, parentX: number, parentY: number): string {
  if (object.hidden) return "";
  const x = object.x + parentX;
  const y = object.y + parentY;
  const transform = object.rotation ? ` transform="rotate(${number(object.rotation)} ${number(x + object.width / 2)} ${number(y + object.height / 2)})"` : "";
  const opacity = object.opacity === undefined ? "" : ` opacity="${number(object.opacity)}"`;
  const metadata = ` data-object-id="${escapeAttribute(object.id)}" data-object-type="${object.type}"`;
  if (object.type === "group") {
    const groupTransform = ` transform="translate(${number(x)} ${number(y)})${object.rotation ? ` rotate(${number(object.rotation)} ${number(object.width / 2)} ${number(object.height / 2)})` : ""}"`;
    return `<g${groupTransform}${opacity}${metadata} data-group-width="${number(object.width)}" data-group-height="${number(object.height)}">${object.children.map((child) => objectToSvg(child, resources, 0, 0)).join("")}</g>`;
  }
  const common = ` x="${number(x)}" y="${number(y)}" width="${number(object.width)}" height="${number(object.height)}"${transform}${opacity}${metadata}`;
  if (object.type === "text") {
    const anchor = object.align === "center" ? "middle" : object.align === "right" ? "end" : "start";
    const textX = anchor === "middle" ? x + object.width / 2 : anchor === "end" ? x + object.width : x;
    const textCommon = ` x="${number(textX)}" y="${number(y)}" width="${number(object.width)}" height="${number(object.height)}"${transform}${opacity}${metadata}`;
    return `<text${textCommon} font-family="${escapeAttribute(object.fontFamily ?? "sans-serif")}" font-size="${number(object.fontSize)}" font-weight="${object.fontWeight ?? "normal"}" text-anchor="${anchor}" dominant-baseline="hanging" fill="${object.inverted ? "white" : "black"}">${escapeXml(object.text)}</text>`;
  }
  if (object.type === "qr") return qrToSvg(object, x, y, transform, opacity, metadata);
  if (object.type === "barcode") return barcodeToSvg(object, x, y, transform, opacity, metadata);
  if (object.type === "rectangle") return `<rect${common} fill="${escapeAttribute(object.fill ?? "transparent")}" stroke="${escapeAttribute(object.stroke ?? "black")}" stroke-width="${number(object.strokeWidth ?? 0.35)}"/>`;
  if (object.type === "line") return `<line x1="${number(x)}" y1="${number(y + object.height / 2)}" x2="${number(x + object.width)}" y2="${number(y + object.height / 2)}" stroke="${escapeAttribute(object.stroke ?? "black")}" stroke-width="${number(object.strokeWidth ?? 0.35)}"${transform}${opacity}${metadata}/>`;
  if (object.type === "image") return imageToSvg(object, resources, x, y, transform, opacity, metadata);
  if (object.type === "symbol") {
    const symbol = resources?.symbols?.[object.symbolId];
    return symbol ? pathObjectToSvg(symbol, x, y, object.width, object.height, object.rotation ?? 0, opacity, `${metadata} data-symbol-id="${escapeAttribute(object.symbolId)}"`) : `<g data-supvan-symbol="${escapeAttribute(object.symbolId)}"${common}/>`;
  }
  if (object.type === "path") return pathObjectToSvg(object, x, y, object.width, object.height, object.rotation ?? 0, opacity, metadata);
  return "";
}

function imageToSvg(object: Extract<LabelObject, { type: "image" }>, resources: LabelResources | undefined, x: number, y: number, transform: string, opacity: string, metadata: string): string {
  const resource = resources?.images?.[object.resourceId];
  const common = ` x="${number(x)}" y="${number(y)}" width="${number(object.width)}" height="${number(object.height)}"${transform}${opacity}${metadata}`;
  if (resource) {
    const href = resource.data.startsWith("data:") ? resource.data : `data:${resource.mime};base64,${resource.data}`;
    return `<image${common} preserveAspectRatio="${object.fit === "contain" ? "xMidYMid meet" : object.fit === "cover" ? "xMidYMid slice" : "none"}" href="${escapeAttribute(href)}"/>`;
  }
  const bitmap = resources?.bitmaps?.[object.resourceId];
  if (!bitmap) return `<g data-supvan-image="${escapeAttribute(object.resourceId)}"${common}/>`;
  const scaleX = object.width / bitmap.widthDots;
  const scaleY = object.height / bitmap.heightDots;
  const runs = bitmapRowRuns(bitmap).map((run) => `<rect x="${number(x + run.x * scaleX)}" y="${number(y + run.y * scaleY)}" width="${number(run.width * scaleX)}" height="${number(scaleY)}"/>`).join("");
  return `<g data-supvan-bitmap="${escapeAttribute(object.resourceId)}"${transform}${opacity}${metadata}>${runs}</g>`;
}

function qrToSvg(object: Extract<LabelObject, { type: "qr" }>, x: number, y: number, transform: string, opacity: string, metadata: string): string {
  const code = qrcode(0, object.errorCorrection ?? "M");
  code.addData(object.content);
  code.make();
  const modules = code.getModuleCount();
  const cellWidth = object.width / modules;
  const cellHeight = object.height / modules;
  let body = `<rect x="${number(x)}" y="${number(y)}" width="${number(object.width)}" height="${number(object.height)}" fill="${object.inverted ? "black" : "white"}"/>`;
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!code.isDark(row, column)) continue;
      body += `<rect x="${number(x + column * cellWidth)}" y="${number(y + row * cellHeight)}" width="${number(cellWidth)}" height="${number(cellHeight)}" fill="${object.inverted ? "white" : "black"}"/>`;
    }
  }
  return `<g x="${number(x)}" y="${number(y)}" width="${number(object.width)}" height="${number(object.height)}"${transform}${opacity}${metadata} data-object-content="${escapeAttribute(object.content)}">${body}</g>`;
}

function barcodeToSvg(object: Extract<LabelObject, { type: "barcode" }>, x: number, y: number, transform: string, opacity: string, metadata: string): string {
  const modules = object.format === "EAN_13" ? ean13Modules(object.content) : code128Modules(object.content);
  const quiet = Math.max(0.5, object.width * 0.08);
  const usable = Math.max(0.1, object.width - quiet * 2);
  const scale = usable / modules.length;
  let body = `<rect x="${number(x)}" y="${number(y)}" width="${number(object.width)}" height="${number(object.height)}" fill="${object.inverted ? "black" : "white"}"/>`;
  modules.forEach((bar, index) => { if (bar) body += `<rect x="${number(x + quiet + index * scale)}" y="${number(y)}" width="${number(scale)}" height="${number(object.height)}" fill="${object.inverted ? "white" : "black"}"/>`; });
  return `<g x="${number(x)}" y="${number(y)}" width="${number(object.width)}" height="${number(object.height)}"${transform}${opacity}${metadata} data-object-content="${escapeAttribute(object.content)}">${body}</g>`;
}

function pathObjectToSvg(object: Extract<LabelObject, { type: "path" }>, x: number, y: number, width: number, height: number, rotation: number, opacity: string, metadata: string): string {
  const [vx, vy, vw, vh] = object.viewBox;
  const scaleX = width / vw;
  const scaleY = height / vh;
  const paths = object.paths.map((path) => pathToSvg(path, scaleX, scaleY)).join("");
  const rotate = rotation ? ` rotate(${number(rotation)} ${number(width / 2)} ${number(height / 2)})` : "";
  return `<g transform="translate(${number(x)} ${number(y)}) scale(${number(scaleX)} ${number(scaleY)}) translate(${number(-vx)} ${number(-vy)})${rotate}"${opacity}${metadata} data-view-box="${number(vx)} ${number(vy)} ${number(vw)} ${number(vh)}">${paths}</g>`;
}

function pathToSvg(path: LabelPath, scaleX: number, scaleY: number): string {
  return `<path d="${escapeAttribute(path.d)}" fill="${escapeAttribute(path.fill ?? "black")}" stroke="${escapeAttribute(path.stroke ?? "none")}" stroke-width="${number((path.strokeWidth ?? 0) / Math.max(scaleX, scaleY))}"/>`;
}

function number(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : "0";
}

function escapeXml(value: string): string {
  return value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeXml(value).replace(/"/g, "&quot;");
}
