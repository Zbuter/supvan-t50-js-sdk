import type { LabelDocument, LabelObject, LabelVariable } from "./types";

export function resolveDocumentVariables(document: LabelDocument): LabelDocument {
  const next = clone(document);
  const variables = next.variables ?? {};
  next.objects.forEach((object) => resolveObject(object, variables));
  return next;
}

export function variableValue(variable: LabelVariable | undefined): string {
  if (!variable || variable.value === undefined) return "";
  return String(variable.value);
}

function resolveObject(object: LabelObject, variables: Record<string, LabelVariable>): void {
  for (const binding of object.bindings ?? []) {
    const value = variableValue(variables[binding.variable]);
    if (object.type === "text" && binding.field === "text") object.text = value;
    else if ((object.type === "qr" || object.type === "barcode") && binding.field === "content") object.content = value;
  }
  if (object.type === "group") object.children.forEach((child) => resolveObject(child, variables));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
