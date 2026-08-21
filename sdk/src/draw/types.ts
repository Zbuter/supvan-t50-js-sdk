import type { RasterPage } from "../types";
import type { PageJob, PageJobSettings } from "../jobs";

/** Formats understood by the shared draw-object renderer. */
export enum DrawObjectFormat {
  Text = "TEXT",
  Ean13 = "EAN_13",
  Code128 = "CODE_128",
  QrCode = "QR_CODE",
  Image = "IMAGE",
  Rectangle = "RECTANGLE",
  Line = "LINE",
}

export enum DrawFontStyle {
  Normal = 0,
  Bold = 1,
  Underline = 4,
  Strikeout = 8,
}

export type DrawAlign = "left" | "center" | "right";

export interface DrawObjectBase {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface TextObject extends DrawObjectBase {
  format: DrawObjectFormat.Text;
  content: string;
  fontFamily?: string;
  fontWeight?: string;
  fontSize?: number;
  fontStyle?: DrawFontStyle | number;
  align?: DrawAlign;
  antiColor?: boolean;
  autoReturn?: boolean;
  lineHeight?: number;
}

export interface QrCodeObject extends DrawObjectBase {
  format: DrawObjectFormat.QrCode;
  content: string;
  antiColor?: boolean;
}

export interface BarcodeObject extends DrawObjectBase {
  format: DrawObjectFormat.Code128 | DrawObjectFormat.Ean13;
  content: string;
  antiColor?: boolean;
}

export interface ImageObject extends DrawObjectBase {
  format: DrawObjectFormat.Image;
  image: CanvasImageSource | string | RasterPage;
  resourceId?: string;
  symbolId?: string;
}

export interface RectangleObject extends DrawObjectBase {
  format: DrawObjectFormat.Rectangle;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface LineObject extends DrawObjectBase {
  format: DrawObjectFormat.Line;
  stroke?: string;
  strokeWidth?: number;
}

/** Canonical object model consumed by the renderer. */
export type DrawObject =
  | TextObject
  | QrCodeObject
  | BarcodeObject
  | ImageObject
  | RectangleObject
  | LineObject;

export interface DrawPage {
  width: number;
  height: number;
  objects: DrawObject[];
  repeat?: number;
}

export type DrawJob = PageJob<DrawPage, PageJobSettings>;
