import type { FabricObject } from "fabric";

export type EditorObjectKind = "text" | "barcode" | "qrcode" | "image" | "rectangle" | "line" | "guide";

export type StrokeStyle = "solid" | "dashed" | "dotted";

export interface EditorObjectData {
  id: string;
  kind: EditorObjectKind;
  content?: string;
  barcodeType?: "code128" | "ean13";
  strokeStyle?: StrokeStyle;
}

export type EditorFabricObject = FabricObject & { data?: EditorObjectData };

export interface LabelSize {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface EditorPageSummary {
  id: string;
  name: string;
}

export interface PrintSettingsModel {
  density: number;
  gap: number;
  speed: number;
  copies: number;
}

export type AlignAction =
  | "left"
  | "center-horizontal"
  | "right"
  | "top"
  | "center-vertical"
  | "bottom"
  | "distribute-horizontal"
  | "distribute-vertical";

export interface SelectionModel {
  count: number;
  kind?: EditorObjectKind;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  textAlign: "left" | "center" | "right";
}

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
}

export type DeviceMethod = "bluetooth" | "webhid";
