import { ValidationError } from "../errors";
import { unpackMonochromeBitmap } from "./bitmap";
import type {
  LabelDocument,
  LabelGroupObject,
  LabelObject,
  LabelResources,
} from "./types";

const OBJECT_TYPES = new Set([
  "text",
  "qr",
  "barcode",
  "image",
  "symbol",
  "rectangle",
  "line",
  "path",
  "group",
]);

export interface LabelValidationOptions {
  maxObjects?: number;
  maxTextLength?: number;
}

export function validateLabelDocument(
  value: unknown,
  options: LabelValidationOptions = {},
): asserts value is LabelDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("LabelDocument 必须是对象");
  }
  const document = value as Partial<LabelDocument>;
  if (document.version !== 1) throw new ValidationError("不支持的 LabelDocument 版本");
  assertPositive(document.width, "标签宽度");
  assertPositive(document.height, "标签高度");
  if (!Array.isArray(document.objects)) throw new ValidationError("LabelDocument objects 必须是数组");
  const maxObjects = options.maxObjects ?? 1000;
  if (document.objects.length > maxObjects) throw new ValidationError(`对象数量不能超过 ${maxObjects}`);
  validateObjects(document.objects, options, new Set());
  if (document.resources) validateResources(document.resources);
}

function validateObjects(
  objects: LabelObject[],
  options: LabelValidationOptions,
  ids: Set<string>,
): void {
  for (const object of objects) {
    if (!object || typeof object !== "object" || !OBJECT_TYPES.has(object.type)) {
      throw new ValidationError("存在不支持的标签对象类型");
    }
    if (!object.id || ids.has(object.id)) throw new ValidationError("标签对象 ID 必须唯一");
    ids.add(object.id);
    assertFiniteNonNegative(object.x, "对象 x");
    assertFiniteNonNegative(object.y, "对象 y");
    assertPositive(object.width, "对象宽度");
    assertPositive(object.height, "对象高度");
    if (object.rotation !== undefined && !Number.isFinite(object.rotation)) throw new ValidationError("对象 rotation 必须是数字");
    if (object.type === "text") {
      if (typeof object.text !== "string") throw new ValidationError("文字对象 text 必须是字符串");
      if (object.text.length > (options.maxTextLength ?? 10000)) throw new ValidationError("文字内容过长");
      assertPositive(object.fontSize, "文字字号");
    } else if (object.type === "qr" || object.type === "barcode") {
      if (typeof object.content !== "string") throw new ValidationError("码对象 content 必须是字符串");
    } else if (object.type === "image") {
      if (!object.resourceId) throw new ValidationError("图片对象需要 resourceId");
    } else if (object.type === "symbol") {
      if (!object.symbolId) throw new ValidationError("素材对象需要 symbolId");
    } else if (object.type === "path") {
      if (!Array.isArray(object.paths)) throw new ValidationError("路径对象 paths 必须是数组");
      object.paths.forEach((path) => {
        if (!path || typeof path.d !== "string") throw new ValidationError("路径对象 d 必须是字符串");
      });
    } else if (object.type === "group") {
      validateObjects(object.children, options, ids);
    }
  }
}

function validateResources(resources: LabelResources): void {
  for (const [id, image] of Object.entries(resources.images ?? {})) {
    if (!id || !image || typeof image.data !== "string" || typeof image.mime !== "string") {
      throw new ValidationError("图片资源格式无效");
    }
  }
  for (const [id, bitmap] of Object.entries(resources.bitmaps ?? {})) {
    if (!id || bitmap.encoding !== "bitset-v1" || !Number.isInteger(bitmap.widthDots) || bitmap.widthDots <= 0 || !Number.isInteger(bitmap.heightDots) || bitmap.heightDots <= 0 || typeof bitmap.data !== "string") {
      throw new ValidationError("位图资源格式无效");
    }
    try {
      unpackMonochromeBitmap(bitmap);
    } catch {
      throw new ValidationError("位图资源点位数据无效");
    }
  }
  for (const [id, symbol] of Object.entries(resources.symbols ?? {})) {
    if (!id || symbol.type !== "path") throw new ValidationError("素材资源必须是 path 对象");
  }
}

function assertPositive(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new ValidationError(`${label}必须是正数`);
}

function assertFiniteNonNegative(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new ValidationError(`${label}必须是大于等于 0 的数字`);
}

export function validateLabelObjectTree(object: LabelObject): void {
  validateObjects([object], {}, new Set());
}

export function childObjects(object: LabelObject): LabelObject[] {
  return object.type === "group" ? object.children : [];
}

export function isGroupObject(object: LabelObject): object is LabelGroupObject {
  return object.type === "group";
}
