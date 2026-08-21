export type LabelDocumentVersion = 1;
export type LabelAlign = "left" | "center" | "right";
export type LabelObjectType =
  | "text"
  | "qr"
  | "barcode"
  | "image"
  | "symbol"
  | "rectangle"
  | "line"
  | "path"
  | "group";

export interface ObjectEditablePolicy {
  position?: boolean;
  size?: boolean;
  rotation?: boolean;
  content?: boolean;
  style?: boolean;
  symbol?: boolean;
}

export interface LabelObjectBase {
  id: string;
  type: LabelObjectType;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  locked?: boolean;
  hidden?: boolean;
  opacity?: number;
  editable?: ObjectEditablePolicy;
  bindings?: LabelVariableBinding[];
}

export interface LabelTextObject extends LabelObjectBase {
  type: "text";
  text: string;
  fontFamily?: string;
  fontSize: number;
  fontWeight?: "normal" | "bold";
  align?: LabelAlign;
  underline?: boolean;
  strikeout?: boolean;
  autoReturn?: boolean;
  lineHeight?: number;
  inverted?: boolean;
}

export interface LabelQrCodeObject extends LabelObjectBase {
  type: "qr";
  content: string;
  errorCorrection?: "L" | "M" | "Q" | "H";
  inverted?: boolean;
}

export interface LabelBarcodeObject extends LabelObjectBase {
  type: "barcode";
  format: "CODE_128" | "EAN_13";
  content: string;
  inverted?: boolean;
}

export interface LabelImageObject extends LabelObjectBase {
  type: "image";
  resourceId: string;
  fit?: "fill" | "contain" | "cover";
}

export interface LabelSymbolObject extends LabelObjectBase {
  type: "symbol";
  symbolId: string;
  preserveAspectRatio?: boolean;
}

export interface LabelRectangleObject extends LabelObjectBase {
  type: "rectangle";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface LabelLineObject extends LabelObjectBase {
  type: "line";
  stroke?: string;
  strokeWidth?: number;
}

export interface LabelPath {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface LabelPathObject extends LabelObjectBase {
  type: "path";
  viewBox: [number, number, number, number];
  paths: LabelPath[];
}

export interface LabelGroupObject extends LabelObjectBase {
  type: "group";
  children: LabelObject[];
}

export type LabelObject =
  | LabelTextObject
  | LabelQrCodeObject
  | LabelBarcodeObject
  | LabelImageObject
  | LabelSymbolObject
  | LabelRectangleObject
  | LabelLineObject
  | LabelPathObject
  | LabelGroupObject;

export interface LabelVariable {
  label: string;
  type: "text" | "number" | "date" | "select";
  value?: string | number;
  options?: Array<{ label: string; value: string }>;
}

export interface LabelVariableBinding {
  field: string;
  variable: string;
}

export interface LabelImageResource {
  mime: string;
  data: string;
  widthDots?: number;
  heightDots?: number;
}

/** A packed monochrome bitmap resource. Each bit is one black/white dot. */
export interface LabelBitmapResource {
  encoding: "bitset-v1";
  widthDots: number;
  heightDots: number;
  data: string;
}

export interface LabelResources {
  images?: Record<string, LabelImageResource>;
  bitmaps?: Record<string, LabelBitmapResource>;
  symbols?: Record<string, LabelPathObject>;
}

export interface LabelPrintMetadata {
  copies?: number;
  density?: number;
  speed?: number;
  gap?: number;
  direction?: 0 | 1 | 2 | 3;
}

export interface LabelPage {
  width: number;
  height: number;
  objects: LabelObject[];
}

export interface LabelDocument {
  version: LabelDocumentVersion;
  id?: string;
  name?: string;
  width: number;
  height: number;
  objects: LabelObject[];
  variables?: Record<string, LabelVariable>;
  resources?: LabelResources;
  print?: LabelPrintMetadata;
  metadata?: Record<string, unknown>;
}

export function isLabelObject(value: unknown): value is LabelObject {
  if (!value || typeof value !== "object") return false;
  const object = value as Partial<LabelObjectBase>;
  return typeof object.id === "string" && typeof object.type === "string";
}
