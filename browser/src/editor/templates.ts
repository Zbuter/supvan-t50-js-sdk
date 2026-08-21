import {
  createLabelDocument,
  createLabelTemplate,
  cloneTemplateDocument,
  packMonochromeBitmap,
  type LabelDocument,
  type LabelTemplate,
} from "shuofang-t50-sdk";

function bitmapTemplateResource() {
  const widthDots = 96;
  const heightDots = 64;
  const pixels = new Uint8Array(widthDots * heightDots).fill(255);
  for (let y = 0; y < heightDots; y += 1) {
    for (let x = 0; x < widthDots; x += 1) {
      const border = x < 3 || y < 3 || x >= widthDots - 3 || y >= heightDots - 3;
      const stripe = y >= 27 && y < 31 && x > 12 && x < widthDots - 12;
      if (border || stripe) pixels[y * widthDots + x] = 0;
    }
  }
  return packMonochromeBitmap(widthDots, heightDots, pixels);
}

function document(name: string, objects: LabelDocument["objects"], resources?: LabelDocument["resources"]): LabelDocument {
  return createLabelDocument(40, 30, objects, { name, resources });
}

const coffeeTemplate = createLabelTemplate(
  "coffee-basic",
  "咖啡豆基础标签",
  document("咖啡豆基础标签", [
    { id: "coffee-title", type: "text", x: 2, y: 2, width: 25, height: 6, text: "轻焙咖啡豆", fontSize: 5, fontWeight: "bold" },
    { id: "coffee-subtitle", type: "text", x: 2, y: 9, width: 28, height: 4, text: "净含量 250g  ·  2026.08", fontSize: 3 },
    { id: "coffee-barcode", type: "barcode", format: "CODE_128", x: 2, y: 15, width: 22, height: 8, content: "6901234567892" },
    { id: "coffee-qr", type: "qr", x: 29, y: 14, width: 8, height: 8, content: "https://supvan.com" },
    { id: "coffee-rule", type: "line", x: 2, y: 13.5, width: 35, height: 0.5, stroke: "#000000", strokeWidth: 0.35 },
  ]),
  { category: "食品" },
);

const storageBitmap = bitmapTemplateResource();
const storageTemplate = createLabelTemplate(
  "storage-outline",
  "收纳黑白图模板",
  document(
    "收纳黑白图模板",
    [
      { id: "storage-image", type: "image", x: 4, y: 4, width: 32, height: 22, resourceId: "storage-frame", fit: "fill" },
      { id: "storage-title", type: "text", x: 8, y: 10, width: 24, height: 5, text: "收纳盒", fontSize: 4, fontWeight: "bold", align: "center" },
      { id: "storage-note", type: "text", x: 8, y: 16, width: 24, height: 4, text: "分类 / 日期", fontSize: 2.5, align: "center" },
    ],
    { bitmaps: { "storage-frame": storageBitmap } },
  ),
  { category: "收纳", description: "只保存 1-bit 黑白点位，适合无后端模板。" },
);

const blankTemplate = createLabelTemplate(
  "blank-40x30",
  "空白 40 × 30 mm",
  document("空白 40 × 30 mm", []),
  { category: "基础" },
);

export const BUILT_IN_TEMPLATES: readonly LabelTemplate[] = [coffeeTemplate, storageTemplate, blankTemplate];

export function cloneBuiltInTemplate(id: string): LabelDocument | undefined {
  const template = BUILT_IN_TEMPLATES.find((item) => item.id === id);
  return template ? cloneTemplateDocument(template) : undefined;
}
