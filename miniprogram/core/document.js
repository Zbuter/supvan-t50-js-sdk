const SUPPORTED_TYPES = new Set([
  "text",
  "qr",
  "barcode",
  "image",
  "symbol",
  "rectangle",
  "line",
  "path",
  "group",
]);

let idSequence = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function roundMm(value) {
  return Math.round(Number(value) * 100) / 100;
}

function createId(prefix = "object") {
  idSequence = (idSequence + 1) % 100000;
  return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label}必须是正数`);
}

function validateObject(object, ids) {
  if (!object || typeof object !== "object" || !SUPPORTED_TYPES.has(object.type)) {
    throw new Error("标签中包含不支持的对象");
  }
  if (typeof object.id !== "string" || !object.id || ids.has(object.id)) {
    throw new Error("标签对象 ID 必须唯一");
  }
  ids.add(object.id);
  if (![object.x, object.y].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("标签对象坐标无效");
  }
  assertPositive(object.width, "对象宽度");
  assertPositive(object.height, "对象高度");
  if (object.type === "text") {
    if (typeof object.text !== "string") throw new Error("文字内容无效");
    assertPositive(object.fontSize, "文字字号");
  }
  if ((object.type === "qr" || object.type === "barcode") && typeof object.content !== "string") {
    throw new Error("码内容无效");
  }
  if (object.type === "image" && typeof object.resourceId !== "string") {
    throw new Error("图片资源无效");
  }
  if (object.type === "group") {
    if (!Array.isArray(object.children)) throw new Error("组合对象无效");
    object.children.forEach((child) => validateObject(child, ids));
  }
}

function validateDocument(document) {
  if (!document || typeof document !== "object" || document.version !== 1) {
    throw new Error("不是受支持的标签文档");
  }
  assertPositive(document.width, "标签宽度");
  assertPositive(document.height, "标签高度");
  if (document.width > 50 || document.height > 120) throw new Error("标签尺寸超出 T50 支持范围");
  if (!Array.isArray(document.objects)) throw new Error("标签对象列表无效");
  if (document.objects.length > 300) throw new Error("单张标签最多支持 300 个对象");
  const ids = new Set();
  document.objects.forEach((object) => validateObject(object, ids));
  return document;
}

function createDocument(width = 40, height = 30, objects = [], options = {}) {
  const document = {
    version: 1,
    width: roundMm(width),
    height: roundMm(height),
    objects: clone(objects),
    name: options.name || "未命名标签",
    print: {
      copies: 1,
      density: 4,
      speed: 40,
      gap: 3,
      direction: 0,
      ...(options.print || {}),
    },
    ...(options.resources ? { resources: clone(options.resources) } : {}),
    ...(options.variables ? { variables: clone(options.variables) } : {}),
  };
  return validateDocument(document);
}

function parseDocument(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch (_error) {
      throw new Error("标签 JSON 无法解析");
    }
  }
  return clone(validateDocument(parsed));
}

function serializeDocument(document) {
  return JSON.stringify(validateDocument(document));
}

function objectDefaults(type) {
  switch (type) {
    case "text":
      return { width: 22, height: 6, text: "双击编辑文字", fontSize: 4, fontWeight: "normal", align: "center", autoReturn: true };
    case "qr":
      return { width: 13, height: 13, content: "https://supvan.com", errorCorrection: "M" };
    case "barcode":
      return { width: 28, height: 9, content: "690123456789", format: "CODE_128" };
    case "rectangle":
      return { width: 24, height: 12, fill: "transparent", stroke: "#000000", strokeWidth: 0.35 };
    case "line":
      return { width: 24, height: 1, stroke: "#000000", strokeWidth: 0.35 };
    case "image":
      return { width: 14, height: 14, resourceId: "" };
    default:
      return { width: 12, height: 8 };
  }
}

function clampObject(document, object) {
  const next = object;
  next.width = roundMm(Math.max(0.5, Math.min(next.width, document.width)));
  next.height = roundMm(Math.max(0.5, Math.min(next.height, document.height)));
  next.x = roundMm(Math.max(0, Math.min(next.x, document.width - next.width)));
  next.y = roundMm(Math.max(0, Math.min(next.y, document.height - next.height)));
  next.rotation = ((Math.round(Number(next.rotation || 0) / 90) * 90) % 360 + 360) % 360;
  return next;
}

function createObject(type, document, overrides = {}) {
  if (!SUPPORTED_TYPES.has(type)) throw new Error(`不支持的对象类型：${type}`);
  const defaults = objectDefaults(type);
  const width = Math.min(defaults.width, document.width - 2 > 0 ? document.width - 2 : document.width);
  const height = Math.min(defaults.height, document.height - 2 > 0 ? document.height - 2 : document.height);
  const object = {
    id: createId(type),
    type,
    name: type,
    x: roundMm((document.width - width) / 2),
    y: roundMm((document.height - height) / 2),
    rotation: 0,
    ...defaults,
    width: roundMm(width),
    height: roundMm(height),
    ...clone(overrides),
  };
  return clampObject(document, object);
}

function findObject(document, id) {
  return document.objects.find((object) => object.id === id);
}

function addObject(document, object) {
  if (findObject(document, object.id)) throw new Error("对象 ID 已存在");
  document.objects.push(clampObject(document, clone(object)));
  validateDocument(document);
  return document;
}

function updateObject(document, id, patch) {
  const object = findObject(document, id);
  if (!object) throw new Error("没有找到选中的对象");
  Object.assign(object, clone(patch));
  clampObject(document, object);
  validateDocument(document);
  return object;
}

function removeObject(document, id) {
  const index = document.objects.findIndex((object) => object.id === id);
  if (index < 0) return false;
  document.objects.splice(index, 1);
  return true;
}

function duplicateObject(document, id) {
  const source = findObject(document, id);
  if (!source) throw new Error("没有找到选中的对象");
  const copy = clone(source);
  copy.id = createId(source.type);
  copy.x += 1;
  copy.y += 1;
  clampObject(document, copy);
  document.objects.push(copy);
  return copy;
}

module.exports = {
  addObject,
  clampObject,
  clone,
  createDocument,
  createId,
  createObject,
  duplicateObject,
  findObject,
  parseDocument,
  removeObject,
  roundMm,
  serializeDocument,
  updateObject,
  validateDocument,
};
