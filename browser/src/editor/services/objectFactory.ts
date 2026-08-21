import { code128 } from "bwip-js/browser";
import { FabricImage, Line, Rect, Textbox, type FabricObject } from "fabric";
import qrcodeGenerator from "qrcode-generator";
import { packMonochromeBitmap } from "shuofang-t50-sdk";

import { THERMAL_BLACK } from "../constants";
import { createThermalCanvas } from "./monochrome";
import type { EditorFabricObject, EditorObjectData, StrokeStyle } from "../types";

function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `label-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function editorData(kind: EditorObjectData["kind"], content?: string): EditorObjectData {
  return { id: id(), kind, content };
}

export function getEditorData(object: FabricObject): EditorObjectData | undefined {
  return (object as EditorFabricObject).data;
}

export function setEditorData(object: FabricObject, data: EditorObjectData): void {
  (object as EditorFabricObject).data = data;
}

export function isStrokeStyle(value: string | number): value is StrokeStyle {
  return value === "solid" || value === "dashed" || value === "dotted";
}

export function getStrokeStyle(object: FabricObject): StrokeStyle {
  const stored = getEditorData(object)?.strokeStyle;
  if (stored) return stored;
  if (!object.strokeDashArray?.length) return "solid";
  return object.strokeLineCap === "round" ? "dotted" : "dashed";
}

function strokeDashArray(style: StrokeStyle, width: number): number[] | null {
  if (style === "solid") return null;
  if (style === "dashed") return [width * 4, width * 2.5];
  return [width, width * 2];
}

export function applyStrokeStyle(object: FabricObject, style: StrokeStyle): void {
  const width = Math.max(0.5, object.strokeWidth || 1);
  object.set({
    strokeDashArray: strokeDashArray(style, width),
    strokeLineCap: style === "dotted" ? "round" : "butt",
  });
  const data = getEditorData(object);
  if (data) data.strokeStyle = style;
}

export function setShapeStrokeWidth(object: FabricObject, width: number): void {
  object.set({ strokeWidth: width });
  applyStrokeStyle(object, getStrokeStyle(object));
}

function commonStyle(): Partial<FabricObject> {
  return {
    originX: "left",
    originY: "top",
    cornerColor: "#ffffff",
    cornerStrokeColor: "#167a53",
    borderColor: "#167a53",
    cornerStyle: "rect",
    transparentCorners: false,
    cornerSize: 8,
    lockScalingFlip: true,
    snapAngle: 90,
    snapThreshold: 8,
    padding: 2,
  };
}

export function configureTextControls(object: Textbox): void {
  // Textbox's side controls change its width and reflow text. Corner scaling
  // would stretch glyphs, so keep only width and rotation controls visible.
  object.setControlsVisibility({
    tl: false,
    tr: false,
    bl: false,
    br: false,
    mt: false,
    mb: false,
    ml: true,
    mr: true,
    mtr: true,
  });
  // T50 is a monochrome thermal printer; keep editor and raster output consistent.
  object.set({ fill: THERMAL_BLACK });
}

export function configureEditorObject(object: FabricObject): void {
  object.set({ snapAngle: 90, snapThreshold: 8 });
  if (object instanceof Textbox) configureTextControls(object);

  const kind = getEditorData(object)?.kind;
  if (kind !== "rectangle" && kind !== "line") return;
  object.set({ stroke: THERMAL_BLACK });
  const style = getStrokeStyle(object);
  object.set({ strokeUniform: true });
  applyStrokeStyle(object, style);

  if (object instanceof Line) {
    object.setControlsVisibility({
      tl: false,
      tr: false,
      bl: false,
      br: false,
      mt: false,
      mb: false,
      ml: true,
      mr: true,
      mtr: true,
    });
  }
}

export function normalizeShapeScale(object: FabricObject): boolean {
  const kind = getEditorData(object)?.kind;
  if ((kind !== "rectangle" && kind !== "line") || !(object instanceof Rect || object instanceof Line)) return false;

  const scaleX = Math.abs(object.scaleX);
  const scaleY = Math.abs(object.scaleY);
  if (Math.abs(scaleX - 1) < 0.0001 && Math.abs(scaleY - 1) < 0.0001) return false;

  const center = object.getRelativeCenterPoint();
  object.set({
    width: Math.max(1, object.width * scaleX),
    height: object instanceof Line ? Math.max(0, object.height * scaleY) : Math.max(1, object.height * scaleY),
    scaleX: 1,
    scaleY: 1,
  });
  object.setPositionByOrigin(center, "center", "center");
  object.setCoords();
  return true;
}

export function createText(left: number, top: number): Textbox {
  const object = new Textbox("双击编辑文字", {
    ...commonStyle(),
    left,
    top,
    width: 184,
    fontFamily: "Microsoft YaHei",
    fontSize: 28,
    fill: THERMAL_BLACK,
    fontWeight: "normal",
    lineHeight: 1.05,
    splitByGrapheme: true,
  });
  configureTextControls(object);
  setEditorData(object, editorData("text", object.text));
  return object;
}

export function createRectangle(left: number, top: number): Rect {
  const object = new Rect({
    ...commonStyle(),
    left,
    top,
    width: 112,
    height: 64,
    fill: "transparent",
    stroke: THERMAL_BLACK,
    strokeWidth: 2,
    strokeUniform: true,
  });
  setEditorData(object, { ...editorData("rectangle"), strokeStyle: "solid" });
  configureEditorObject(object);
  return object;
}

export function createLine(left: number, top: number): Line {
  const object = new Line([0, 0, 120, 0], {
    ...commonStyle(),
    left,
    top,
    stroke: THERMAL_BLACK,
    strokeWidth: 2,
    strokeUniform: true,
  });
  setEditorData(object, { ...editorData("line"), strokeStyle: "solid" });
  configureEditorObject(object);
  return object;
}

function renderCodeCanvas(kind: "barcode" | "qrcode", content: string): HTMLCanvasElement {
  const element = document.createElement("canvas");
  if (kind === "qrcode") {
    const code = qrcodeGenerator(0, "M");
    code.addData(content);
    code.make();
    const cellSize = 4;
    const modules = code.getModuleCount();
    element.width = modules * cellSize;
    element.height = modules * cellSize;
    const context = element.getContext("2d");
    if (!context) throw new Error("无法创建二维码画布");
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, element.width, element.height);
    context.fillStyle = "#000000";
    for (let row = 0; row < modules; row += 1) {
      for (let column = 0; column < modules; column += 1) {
        if (code.isDark(row, column)) context.fillRect(column * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  } else {
    code128(element, {
      bcid: "code128",
      text: content,
      scale: 2,
      height: 10,
      includetext: false,
      paddingwidth: 0,
      paddingheight: 0,
      backgroundcolor: "FFFFFF",
      barcolor: "000000",
    });
  }
  return element;
}

export function createCode(
  kind: "barcode" | "qrcode",
  content: string,
  left: number,
  top: number,
): FabricImage {
  const element = renderCodeCanvas(kind, content);
  const targetWidth = kind === "qrcode" ? 96 : 176;
  const targetHeight = kind === "qrcode" ? 96 : 72;
  const object = new FabricImage(element, {
    ...commonStyle(),
    left,
    top,
    scaleX: targetWidth / element.width,
    scaleY: targetHeight / element.height,
    imageSmoothing: false,
  });
  setEditorData(object, {
    ...editorData(kind, content),
    ...(kind === "barcode" ? { barcodeType: "code128" as const } : {}),
  });
  return object;
}

export function updateCodeObject(object: FabricImage, content: string): void {
  const data = getEditorData(object);
  if (!data || (data.kind !== "barcode" && data.kind !== "qrcode")) return;
  const width = object.getScaledWidth();
  const height = object.getScaledHeight();
  const element = renderCodeCanvas(data.kind, content);
  object.setElement(element);
  object.set({ scaleX: width / element.width, scaleY: height / element.height });
  data.content = content;
  object.setCoords();
}

export async function createImage(file: File, left: number, top: number): Promise<FabricImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("图片解码失败"));
    element.src = dataUrl;
  });
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("图片尺寸无效");
  const element = createThermalCanvas(image, width, height);
  const object = new FabricImage(element, {
    imageSmoothing: false,
  });
  const scale = Math.min(160 / Math.max(1, object.width), 110 / Math.max(1, object.height), 1);
  object.set({
    ...commonStyle(),
    left,
    top,
    scaleX: scale,
    scaleY: scale,
  });
  const context = element.getContext("2d");
  const bitmap = context
    ? packMonochromeBitmap(element.width, element.height, context.getImageData(0, 0, element.width, element.height).data)
    : undefined;
  setEditorData(object, { ...editorData("image", file.name), ...(bitmap ? { bitmap } : {}) });
  return object;
}
