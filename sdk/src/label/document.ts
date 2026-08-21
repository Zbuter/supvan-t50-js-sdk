import { ValidationError } from "../errors";
import type { LabelDocument, LabelObject } from "./types";
import { validateLabelDocument } from "./validate";

export function createLabelDocument(
  width: number,
  height: number,
  objects: LabelObject[] = [],
  options: Partial<Omit<LabelDocument, "version" | "width" | "height" | "objects">> = {},
): LabelDocument {
  const document: LabelDocument = {
    version: 1,
    width: roundDimension(width),
    height: roundDimension(height),
    objects: clone(objects),
    ...clone(options),
  };
  validateLabelDocument(document);
  return document;
}

export function cloneLabelDocument(document: LabelDocument): LabelDocument {
  return clone(document);
}

export function serializeLabelDocument(document: LabelDocument): string {
  validateLabelDocument(document);
  return JSON.stringify(document);
}

export function deserializeLabelDocument(value: string | unknown): LabelDocument {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ValidationError("LabelDocument JSON 无法解析");
    }
  }
  const migrated = migrateLabelDocument(parsed);
  validateLabelDocument(migrated);
  return migrated;
}

export function migrateLabelDocument(value: unknown): LabelDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("LabelDocument 必须是对象");
  const source = value as Record<string, unknown>;
  if (source.version === 1 && typeof source.width === "number" && typeof source.height === "number" && Array.isArray(source.objects)) {
    return clone(source as unknown as LabelDocument);
  }
  throw new ValidationError("无法识别的 LabelDocument 格式");
}

function roundDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new ValidationError("标签尺寸必须是正数");
  return Math.round(value * 100) / 100;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
