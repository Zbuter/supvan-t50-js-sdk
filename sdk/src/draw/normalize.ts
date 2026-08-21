import { ValidationError } from "../errors";
import {
  DrawFontStyle,
  DrawObjectFormat,
  type DrawAlign,
  type DrawObject,
  type ImageObject,
} from "./types";

type InputRecord = Record<string, unknown>;

/**
 * Convert legacy draw-object shapes into the canonical discriminated union.
 * The renderer intentionally does not contain compatibility-field handling.
 */
export function normalizeDrawObject(input: unknown): DrawObject {
  const source = asRecord(input);
  const format = normalizeFormat(source);
  const base = {
    x: requiredNumber(source, "x"),
    y: requiredNumber(source, "y"),
    width: requiredNumber(source, "width"),
    height: requiredNumber(source, "height"),
    rotation: optionalNumber(source, "rotation"),
  };

  if (format === DrawObjectFormat.Text) {
    return {
      ...base,
      format,
      content: contentValue(source, false),
      fontFamily: optionalString(source, ["fontFamily", "font_family", "fontName", "font_name"], "fontFamily"),
      fontWeight: optionalString(source, ["fontWeight", "font_weight"], "fontWeight"),
      fontSize: optionalNumber(source, "fontSize", "font_size"),
      fontStyle: optionalNumber(source, "fontStyle", "font_style") as DrawFontStyle | number | undefined,
      align: normalizeAlign(aliasValue(source, ["align"], "align")),
      antiColor: optionalBoolean(source, "antiColor", "anti_color"),
      autoReturn: optionalBoolean(source, "autoReturn", "auto_return"),
      lineHeight: optionalNumber(source, "lineHeight", "line_height"),
    };
  }

  if (format === DrawObjectFormat.QrCode) {
    return {
      ...base,
      format,
      content: contentValue(source, true),
      antiColor: optionalBoolean(source, "antiColor", "anti_color"),
    };
  }

  if (format === DrawObjectFormat.Code128 || format === DrawObjectFormat.Ean13) {
    return {
      ...base,
      format,
      content: contentValue(source, true),
      antiColor: optionalBoolean(source, "antiColor", "anti_color"),
    };
  }

  if (format === DrawObjectFormat.Image) {
    const image = source.image;
    if (image === undefined) throw new ValidationError("IMAGE 对象需要 image");
    return { ...base, format, image: image as ImageObject["image"] };
  }

  if (format === DrawObjectFormat.Rectangle) {
    return {
      ...base,
      format,
      fill: optionalString(source, ["fill"], "fill"),
      stroke: optionalString(source, ["stroke"], "stroke"),
      strokeWidth: optionalNumber(source, "strokeWidth", "stroke_width"),
    };
  }

  return {
    ...base,
    format: DrawObjectFormat.Line,
    stroke: optionalString(source, ["stroke"], "stroke"),
    strokeWidth: optionalNumber(source, "strokeWidth", "stroke_width"),
  };
}

function asRecord(input: unknown): InputRecord {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError("绘制对象必须是对象");
  }
  return input as InputRecord;
}

function normalizeFormat(source: InputRecord): DrawObjectFormat {
  const values = ["format", "type", "kind"]
    .map((key) => source[key])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(formatValue);
  const unique = Array.from(new Set(values));
  if (unique.length > 1) throw new ValidationError("绘制对象的 format、type、kind 值冲突");
  return unique[0] ?? DrawObjectFormat.Text;
}

function formatValue(value: string): DrawObjectFormat {
  const raw = value.trim().toUpperCase().replace(/[-\s]/g, "_");
  if (raw === "QRCODE" || raw === "QR_CODE") return DrawObjectFormat.QrCode;
  if (raw === "CODE128" || raw === "BARCODE" || raw === "CODE_128") return DrawObjectFormat.Code128;
  if (raw === "EAN13" || raw === "EAN_13") return DrawObjectFormat.Ean13;
  if (raw === "RECT" || raw === "RECTANGLE") return DrawObjectFormat.Rectangle;
  if (raw === "IMAGE" || raw === "IMG") return DrawObjectFormat.Image;
  if (raw === "LINE") return DrawObjectFormat.Line;
  if (raw === "TEXT") return DrawObjectFormat.Text;
  throw new ValidationError(`不支持的绘制对象格式：${raw}`);
}

function contentValue(source: InputRecord, required: boolean): string {
  const value = aliasValue(source, ["content", "text"], "content");
  if (value === undefined) {
    if (required) throw new ValidationError("二维码或条码对象需要 content");
    return "";
  }
  if (typeof value !== "string") throw new ValidationError("绘制对象 content 必须是字符串");
  return value;
}

function requiredNumber(source: InputRecord, key: string): number {
  const value = source[key];
  if (typeof value !== "number") throw new ValidationError(`绘制对象 ${key} 必须是数字`);
  return value;
}

function optionalNumber(source: InputRecord, ...keys: string[]): number | undefined {
  const value = aliasValue(source, keys, keys[0] ?? "数值");
  if (value === undefined) return undefined;
  if (typeof value !== "number") throw new ValidationError(`绘制对象 ${keys[0] ?? "数值"} 必须是数字`);
  return value;
}

function optionalString(source: InputRecord, keys: string[], label: string): string | undefined {
  const value = aliasValue(source, keys, label);
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ValidationError(`绘制对象 ${label} 必须是字符串`);
  return value;
}

function optionalBoolean(source: InputRecord, ...keys: string[]): boolean | undefined {
  const value = aliasValue(source, keys, keys[0] ?? "布尔值");
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new ValidationError(`绘制对象 ${keys[0] ?? "布尔值"} 必须是布尔值`);
  return value;
}

function normalizeAlign(value: unknown): DrawAlign | undefined {
  if (value === undefined) return undefined;
  if (value === 0 || value === "left") return "left";
  if (value === 1 || value === "center") return "center";
  if (value === 2 || value === "right") return "right";
  throw new ValidationError("绘制对象 align 必须是 left、center、right 或 0、1、2");
}

function aliasValue(source: InputRecord, keys: string[], label: string): unknown {
  const present = keys.filter((key) => source[key] !== undefined);
  if (!present.length) return undefined;
  const first = source[present[0]!];
  if (present.some((key) => !Object.is(source[key], first))) {
    throw new ValidationError(`绘制对象 ${label} 的兼容字段值冲突`);
  }
  return first;
}
