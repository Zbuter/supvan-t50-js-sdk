import { ValidationError } from "../errors";
import { cloneLabelDocument } from "./document";
import type { LabelDocument } from "./types";
import { validateLabelDocument } from "./validate";

/** A reusable label starting point. The document is cloned before editing. */
export interface LabelTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  document: LabelDocument;
  /** Optional browser-facing preview; it is not required for persistence. */
  thumbnail?: string;
}

export function createLabelTemplate(
  id: string,
  name: string,
  document: LabelDocument,
  metadata: Omit<LabelTemplate, "id" | "name" | "document"> = {},
): LabelTemplate {
  if (!id.trim() || !name.trim()) throw new ValidationError("模板 ID 和名称不能为空");
  validateLabelDocument(document);
  return { id, name, document: cloneLabelDocument(document), ...metadata };
}

export function cloneTemplateDocument(template: LabelTemplate): LabelDocument {
  validateLabelDocument(template.document);
  return cloneLabelDocument(template.document);
}

export function cloneLabelTemplate(template: LabelTemplate): LabelTemplate {
  return { ...template, document: cloneTemplateDocument(template) };
}
