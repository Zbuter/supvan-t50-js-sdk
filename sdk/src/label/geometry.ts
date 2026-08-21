import { ValidationError } from "../errors";
import type { LabelDocument, LabelObject } from "./types";
import { validateLabelDocument } from "./validate";

export interface LabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ResizeMode = "keep-objects" | "scale-objects";

export function objectRect(object: LabelObject): LabelRect {
  return { x: object.x, y: object.y, width: object.width, height: object.height };
}

export function documentBounds(document: LabelDocument): LabelRect {
  return { x: 0, y: 0, width: document.width, height: document.height };
}

export function resizeLabelDocument(
  document: LabelDocument,
  width: number,
  height: number,
  options: { mode?: ResizeMode; scaleFontSize?: boolean } = {},
): LabelDocument {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) throw new ValidationError("标签尺寸必须是正数");
  const mode = options.mode ?? "keep-objects";
  const next = clone(document);
  if (mode === "scale-objects") {
    const scaleX = width / document.width;
    const scaleY = height / document.height;
    next.objects.forEach((object) => scaleObject(object, scaleX, scaleY, options.scaleFontSize ?? true));
  }
  next.width = round(width);
  next.height = round(height);
  validateLabelDocument(next);
  return next;
}

function scaleObject(object: LabelObject, scaleX: number, scaleY: number, scaleFontSize: boolean): void {
  object.x = round(object.x * scaleX);
  object.y = round(object.y * scaleY);
  object.width = round(object.width * scaleX);
  object.height = round(object.height * scaleY);
  if (scaleFontSize && object.type === "text") object.fontSize = round(object.fontSize * Math.min(scaleX, scaleY));
  if (object.type === "group") object.children.forEach((child) => scaleObject(child, scaleX, scaleY, scaleFontSize));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function flattenLabelObjects(objects: LabelObject[]): LabelObject[] {
  const output: LabelObject[] = [];
  const visit = (object: LabelObject): void => {
    output.push(object);
    if (object.type === "group") object.children.forEach(visit);
  };
  objects.forEach(visit);
  return output;
}

export function objectOverflowsPage(document: LabelDocument, object: LabelObject): boolean {
  return object.x < 0 || object.y < 0 || object.x + object.width > document.width || object.y + object.height > document.height;
}

export function clampObjectToPage(document: LabelDocument, object: LabelObject): LabelObject {
  const next = clone(object);
  next.x = Math.max(0, Math.min(next.x, Math.max(0, document.width - next.width)));
  next.y = Math.max(0, Math.min(next.y, Math.max(0, document.height - next.height)));
  return next;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
