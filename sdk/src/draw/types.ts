import type { RasterPage } from "../types";

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

/**
 * A physical label object. Coordinates and dimensions are millimeters.
 *
 * The snake_case aliases intentionally mirror the Python SDK so a document
 * can be shared between the two runtimes without a lossy conversion step.
 */
export interface DrawObject {
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  format?: DrawObjectFormat | string;
  type?: DrawObjectFormat | string;
  kind?: DrawObjectFormat | string;
  text?: string;
  fontName?: string;
  font_name?: string;
  fontFamily?: string;
  font_family?: string;
  fontWeight?: string;
  font_weight?: string;
  fontSize?: number;
  font_size?: number;
  fontStyle?: DrawFontStyle | number;
  font_style?: DrawFontStyle | number;
  align?: 0 | 1 | 2 | "left" | "center" | "right";
  antiColor?: boolean;
  anti_color?: boolean;
  autoReturn?: boolean;
  auto_return?: boolean;
  lineHeight?: number;
  line_height?: number;
  rotation?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  stroke_width?: number;
  /** A browser ImageBitmap/HTMLImageElement or a platform image source. */
  image?: CanvasImageSource | string | RasterPage;
}

export interface DrawPage {
  width: number;
  height: number;
  objects: DrawObject[];
  repeat?: number;
}

export interface DrawJob {
  pages: DrawPage[];
  /** Only copies and print order are consumed by the renderer. */
  settings?: {
    copies?: number;
    oneByOne?: boolean;
  };
}
