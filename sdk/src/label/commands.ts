import { ValidationError } from "../errors";
import { cloneLabelDocument } from "./document";
import type { LabelDocument, LabelObject } from "./types";
import { validateLabelDocument } from "./validate";

export function updateLabelObject(
  document: LabelDocument,
  objectId: string,
  patch: Partial<LabelObject>,
): LabelDocument {
  const next = cloneLabelDocument(document);
  const object = findObject(next.objects, objectId);
  if (!object) throw new ValidationError(`找不到对象：${objectId}`);
  Object.assign(object, patch);
  validateLabelDocument(next);
  return next;
}

export function insertLabelObject(document: LabelDocument, object: LabelObject, index = document.objects.length): LabelDocument {
  const next = cloneLabelDocument(document);
  if (findObject(next.objects, object.id)) throw new ValidationError(`对象 ID 已存在：${object.id}`);
  next.objects.splice(Math.max(0, Math.min(index, next.objects.length)), 0, cloneLabelObject(object));
  validateLabelDocument(next);
  return next;
}

export function removeLabelObject(document: LabelDocument, objectId: string): LabelDocument {
  const next = cloneLabelDocument(document);
  const removed = removeObject(next.objects, objectId);
  if (!removed) throw new ValidationError(`找不到对象：${objectId}`);
  validateLabelDocument(next);
  return next;
}

export function duplicateLabelObject(document: LabelDocument, objectId: string, newId: string): LabelDocument {
  const next = cloneLabelDocument(document);
  const object = findObject(next.objects, objectId);
  if (!object) throw new ValidationError(`找不到对象：${objectId}`);
  if (findObject(next.objects, newId)) throw new ValidationError(`对象 ID 已存在：${newId}`);
  const copy = cloneLabelObject(object);
  copy.id = newId;
  copy.x += 1;
  copy.y += 1;
  next.objects.push(copy);
  validateLabelDocument(next);
  return next;
}

function findObject(objects: LabelObject[], id: string): LabelObject | undefined {
  for (const object of objects) {
    if (object.id === id) return object;
    if (object.type === "group") {
      const found = findObject(object.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function removeObject(objects: LabelObject[], id: string): boolean {
  const index = objects.findIndex((object) => object.id === id);
  if (index >= 0) {
    objects.splice(index, 1);
    return true;
  }
  return objects.some((object) => object.type === "group" && removeObject(object.children, id));
}

function cloneLabelObject<T extends LabelObject>(object: T): T {
  return JSON.parse(JSON.stringify(object)) as T;
}
