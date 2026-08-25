const { clone, createDocument } = require("./document");

const TEMPLATES = [
  {
    id: "blank-40x30",
    name: "空白标签",
    description: "40 × 30 mm，自由添加内容",
    tone: "mint",
    document: createDocument(40, 30, [], { name: "未命名" }),
  },
  {
    id: "storage-40x30",
    name: "收纳分类",
    description: "标题、分类和边框",
    tone: "sand",
    document: createDocument(40, 30, [
      { id: "storage-frame", type: "rectangle", x: 2, y: 2, width: 36, height: 26, rotation: 0, fill: "transparent", stroke: "#000000", strokeWidth: 0.45 },
      { id: "storage-title", type: "text", x: 7, y: 8.2, width: 26, height: 6, rotation: 0, text: "收纳盒", fontSize: 5, fontWeight: "bold", align: "center" },
      { id: "storage-line", type: "line", x: 8, y: 15.2, width: 24, height: 1, rotation: 0, stroke: "#000000", strokeWidth: 0.5 },
      { id: "storage-note", type: "text", x: 8, y: 18, width: 24, height: 4.5, rotation: 0, text: "分类 / 日期", fontSize: 3, align: "center" },
    ], { name: "收纳分类" }),
  },
  {
    id: "coffee-40x30",
    name: "咖啡商品",
    description: "品名、规格、条码与二维码",
    tone: "coffee",
    document: createDocument(40, 30, [
      { id: "coffee-name", type: "text", x: 2, y: 2, width: 28, height: 6, rotation: 0, text: "轻焙咖啡豆", fontSize: 4.8, fontWeight: "bold", align: "left" },
      { id: "coffee-info", type: "text", x: 2, y: 8.8, width: 29, height: 4, rotation: 0, text: "净含量 250g · 2026.08", fontSize: 2.5, align: "left" },
      { id: "coffee-barcode", type: "barcode", x: 2, y: 14, width: 25, height: 11, rotation: 0, content: "690123456789", format: "CODE_128" },
      { id: "coffee-qr", type: "qr", x: 29, y: 13.5, width: 9, height: 9, rotation: 0, content: "https://supvan.com", errorCorrection: "M" },
    ], { name: "咖啡商品" }),
  },
  {
    id: "asset-50x30",
    name: "资产标签",
    description: "资产名称、编号与扫码信息",
    tone: "blue",
    document: createDocument(50, 30, [
      { id: "asset-title", type: "text", x: 2, y: 2, width: 34, height: 5.5, rotation: 0, text: "设备资产标签", fontSize: 4.4, fontWeight: "bold", align: "left" },
      { id: "asset-number", type: "text", x: 2, y: 9, width: 33, height: 4.5, rotation: 0, text: "编号：T50-2026-001", fontSize: 2.8, align: "left" },
      { id: "asset-owner", type: "text", x: 2, y: 15, width: 33, height: 4.5, rotation: 0, text: "部门：设备管理部", fontSize: 2.8, align: "left" },
      { id: "asset-line", type: "line", x: 2, y: 22, width: 34, height: 1, rotation: 0, stroke: "#000000", strokeWidth: 0.35 },
      { id: "asset-qr", type: "qr", x: 38, y: 4, width: 10, height: 10, rotation: 0, content: "ASSET:T50-2026-001", errorCorrection: "M" },
    ], { name: "资产标签" }),
  },
];

function listTemplates() {
  return TEMPLATES.map(({ document, ...template }) => ({
    ...template,
    size: `${document.width} × ${document.height} mm`,
  }));
}

function getTemplate(id) {
  const template = TEMPLATES.find((item) => item.id === id);
  return template ? clone(template.document) : null;
}

function createBlank(width, height) {
  return createDocument(Number(width), Number(height), [], { name: "未命名" });
}

module.exports = { createBlank, getTemplate, listTemplates };
