const { normalizeDocument } = require("./transfer");

function createBlankDocument() {
  return {
    version: 1,
    name: "空白标签",
    width: 40,
    height: 30,
    objects: [],
  };
}

function createObject(document, type) {
  const geometry = defaultGeometry(document, type);
  const base = {
    id: `mini-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    rotation: 0,
  };
  if (type === "text") return { ...base, type, text: "双击编辑文字", fontSize: Math.min(5, geometry.height * 0.75), fontFamily: "Microsoft YaHei", fontWeight: "normal", align: "left" };
  if (type === "qr") return { ...base, type, content: "https://supvan.com" };
  if (type === "barcode") return { ...base, type, format: "CODE_128", content: "6901234567892" };
  if (type === "rectangle") return { ...base, type, fill: "transparent", stroke: "#000000", strokeWidth: 0.35 };
  if (type === "line") return { ...base, type, stroke: "#000000", strokeWidth: 0.35 };
  throw new Error("不支持添加此元素类型");
}

function defaultGeometry(document, type) {
  const pageWidth = Math.max(1, Number(document.width) || 40);
  const pageHeight = Math.max(1, Number(document.height) || 30);
  let width = type === "rectangle" ? pageWidth - 4 : type === "barcode" ? 22 : type === "text" ? 24 : type === "line" ? pageWidth - 4 : 8;
  let height = type === "rectangle" ? pageHeight - 4 : type === "barcode" ? 8 : type === "text" ? 6 : type === "line" ? 0.5 : 8;
  width = Math.min(pageWidth, Math.max(0.5, width));
  height = Math.min(pageHeight, Math.max(0.5, height));
  return {
    x: Math.max(0, Math.round((pageWidth - width) / 2 * 100) / 100),
    y: Math.max(0, Math.round((pageHeight - height) / 2 * 100) / 100),
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
  };
}

function updateObject(document, objectId, patch) {
  const next = JSON.parse(JSON.stringify(document));
  const object = next.objects.find((item) => item.id === objectId);
  if (!object) throw new Error("找不到标签对象");
  Object.assign(object, patch);
  return normalizeDocument(next);
}

function objectLabel(object) {
  if (object.type === "text") return "文字";
  if (object.type === "qr") return "二维码";
  if (object.type === "barcode") return "条码";
  if (object.type === "image") return "图片";
  if (object.type === "rectangle") return "矩形";
  if (object.type === "line") return "直线";
  return object.type || "对象";
}

module.exports = {
  createBlankDocument,
  createObject,
  objectLabel,
  updateObject,
};
