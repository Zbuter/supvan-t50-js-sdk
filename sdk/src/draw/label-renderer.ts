import { ValidationError } from "../errors";
import { resolveDocumentVariables } from "../label/variables";
import type { LabelDocument, LabelObject } from "../label/types";
import { validateLabelDocument } from "../label/validate";
import { DrawObjectFormat, type DrawObject, type DrawPage } from "./types";

export interface LabelDrawAdapterOptions {
  resolveImage?: (resourceId: string, document: LabelDocument) => CanvasImageSource | undefined;
  resolveSymbol?: (symbolId: string, document: LabelDocument) => CanvasImageSource | undefined;
  resolvePath?: (object: Extract<LabelObject, { type: "path" }>, document: LabelDocument) => CanvasImageSource | undefined;
  resolveVariables?: boolean;
}

export function labelDocumentToDrawPage(document: LabelDocument, options: LabelDrawAdapterOptions = {}): DrawPage {
  validateLabelDocument(document);
  const resolved = options.resolveVariables === false ? document : resolveDocumentVariables(document);
  return {
    width: resolved.width,
    height: resolved.height,
    objects: resolved.objects.flatMap((object) => toDrawObjects(object, resolved, options)),
  };
}

function toDrawObjects(object: LabelObject, document: LabelDocument, options: LabelDrawAdapterOptions, parentX = 0, parentY = 0): DrawObject[] {
  if (object.hidden) return [];
  if (object.type === "group") {
    return object.children.flatMap((child) => toDrawObjects(child, document, options, parentX + object.x, parentY + object.y));
  }
  const base = { x: object.x + parentX, y: object.y + parentY, width: object.width, height: object.height, rotation: object.rotation };
  if (object.type === "text") return [{ ...base, format: DrawObjectFormat.Text, content: object.text, fontFamily: object.fontFamily, fontSize: object.fontSize, fontWeight: object.fontWeight, align: object.align, autoReturn: object.autoReturn, lineHeight: object.lineHeight, antiColor: object.inverted }];
  if (object.type === "qr") return [{ ...base, format: DrawObjectFormat.QrCode, content: object.content, antiColor: object.inverted }];
  if (object.type === "barcode") return [{ ...base, format: object.format === "EAN_13" ? DrawObjectFormat.Ean13 : DrawObjectFormat.Code128, content: object.content, antiColor: object.inverted }];
  if (object.type === "rectangle") return [{ ...base, format: DrawObjectFormat.Rectangle, fill: object.fill, stroke: object.stroke, strokeWidth: object.strokeWidth }];
  if (object.type === "line") return [{ ...base, format: DrawObjectFormat.Line, stroke: object.stroke, strokeWidth: object.strokeWidth }];
  if (object.type === "image") return [{ ...base, format: DrawObjectFormat.Image, resourceId: object.resourceId, image: options.resolveImage?.(object.resourceId, document) ?? "" }];
  if (object.type === "symbol") return [{ ...base, format: DrawObjectFormat.Image, symbolId: object.symbolId, resourceId: `symbol:${object.symbolId}`, image: options.resolveSymbol?.(object.symbolId, document) ?? "" }];
  if (object.type === "path") return [{ ...base, format: DrawObjectFormat.Image, resourceId: `path:${object.id}`, image: options.resolvePath?.(object, document) ?? "" }];
  throw new ValidationError("不支持的标签对象类型");
}

export function drawPageToLabelDocument(page: DrawPage): LabelDocument {
  const objects = page.objects.map((object, index): LabelObject => {
    const source = object as DrawObjectFields;
    const type = String(source.format ?? source.type ?? "TEXT").toUpperCase();
    const base = { id: `draw-${index + 1}`, x: source.x, y: source.y, width: source.width, height: source.height, rotation: source.rotation };
    if (type === DrawObjectFormat.Text) return { ...base, type: "text", text: source.content ?? source.text ?? "", fontSize: source.fontSize ?? 3, fontFamily: source.fontFamily, fontWeight: source.fontWeight === "bold" ? "bold" : "normal", align: normalizeAlign(source.align) };
    if (type === DrawObjectFormat.QrCode) return { ...base, type: "qr", content: source.content ?? "" };
    if (type === DrawObjectFormat.Ean13 || type === DrawObjectFormat.Code128) return { ...base, type: "barcode", format: type === DrawObjectFormat.Ean13 ? "EAN_13" : "CODE_128", content: source.content ?? "" };
    if (type === DrawObjectFormat.Rectangle) return { ...base, type: "rectangle", fill: source.fill, stroke: source.stroke, strokeWidth: source.strokeWidth };
    if (type === DrawObjectFormat.Line) return { ...base, type: "line", stroke: source.stroke, strokeWidth: source.strokeWidth };
    return { ...base, type: "image", resourceId: source.resourceId ?? `draw-image-${index + 1}` };
  });
  const document: LabelDocument = { version: 1, width: page.width, height: page.height, objects };
  validateLabelDocument(document);
  return document;
}

function normalizeAlign(value: DrawObjectFields["align"]): "left" | "center" | "right" {
  if (value === 1 || value === "center") return "center";
  if (value === 2 || value === "right") return "right";
  return "left";
}

type DrawObjectFields = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  format?: string;
  type?: string;
  content?: string;
  text?: string;
  fontFamily?: string;
  fontWeight?: string;
  fontSize?: number;
  align?: 0 | 1 | 2 | "left" | "center" | "right";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  resourceId?: string;
};
