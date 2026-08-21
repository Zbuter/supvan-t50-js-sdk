const { createBlankDocument, createObject, objectLabel } = require("../../domain/document");
const { normalizeDocument } = require("../../domain/transfer");
const { consumePending, saveDocument } = require("../../services/document-store");
const { renderDocument } = require("../../services/canvas-renderer");

const ALIGN_VALUES = ["left", "center", "right"];
const ALIGN_LABELS = ["左对齐", "居中", "右对齐"];
const BARCODE_VALUES = ["CODE_128", "EAN_13"];
const BARCODE_LABELS = ["CODE 128", "EAN-13"];

Page({
  data: {
    document: null,
    selectedObjectIndex: -1,
    selectedObject: null,
    variables: [],
    pageWidth: "",
    pageHeight: "",
    previewWidth: 0,
    previewHeight: 0,
    previewStyle: "",
    fineTuneEnabled: false,
    fineTuneStep: 1,
    status: "",
  },

  onLoad() {
    let document = consumePending();
    if (!document) document = createBlankDocument();
    try {
      this.setDocument(normalizeDocument(document));
    } catch (error) {
      this.setData({ status: error.message || "标签数据无效" });
      this.setDocument(createBlankDocument());
    }
  },

  onReady() {
    this.initCanvas();
  },

  setDocument(document) {
    const preview = calculatePreviewSize(document);
    const selection = buildSelectionState(document, this.data.selectedObject && this.data.selectedObject.id);
    this.setData({
      document,
      selectedObjectIndex: selection.index,
      selectedObject: selection.form,
      variables: buildVariableForms(document),
      pageWidth: String(document.width),
      pageHeight: String(document.height),
      previewWidth: preview.width,
      previewHeight: preview.height,
      previewStyle: preview.style,
    }, () => {
      this.initCanvas();
      this.renderCanvas();
    });
  },

  initCanvas() {
    if (this.canvasNode) return;
    wx.createSelectorQuery().in(this).select("#preview").fields({ node: true, size: true }).exec((result) => {
      const item = result && result[0];
      if (!item || !item.node) return;
      this.canvasNode = item.node;
      this.canvasContext = this.canvasNode.getContext("2d");
      this.renderCanvas();
    });
  },

  renderCanvas() {
    if (!this.canvasNode || !this.canvasContext || !this.data.document) return;
    this.imageCache = this.imageCache || {};
    renderDocument(this.canvasNode, this.canvasContext, this.data.document, {
      dotsPerMm: getDotsPerMm(),
      imageCache: this.imageCache,
      selectedObjectId: this.data.selectedObject && this.data.selectedObject.id,
      onImageLoaded: () => this.renderCanvas(),
    });
  },

  onCanvasTap(event) {
    if (!this.data.document || !this.data.document.objects.length) return;
    const touch = event.changedTouches && event.changedTouches[0]
      || event.touches && event.touches[0]
      || event.detail
      || {};
    if (touch.x !== undefined && touch.y !== undefined) {
      this.selectObjectAtPreviewPoint(Number(touch.x), Number(touch.y));
      return;
    }
    if (!Number.isFinite(Number(touch.clientX)) || !Number.isFinite(Number(touch.clientY))) return;
    wx.createSelectorQuery().in(this).select("#preview").boundingClientRect((rect) => {
      if (!rect) return;
      this.selectObjectAtPreviewPoint(Number(touch.clientX) - rect.left, Number(touch.clientY) - rect.top);
    }).exec();
  },

  selectObjectAtPreviewPoint(cssX, cssY) {
    if (!Number.isFinite(cssX) || !Number.isFinite(cssY) || !this.data.previewWidth || !this.data.previewHeight) return;
    const point = { x: cssX / this.data.previewWidth * this.data.document.width, y: cssY / this.data.previewHeight * this.data.document.height };
    const objectId = hitTestObjects(this.data.document.objects, point.x, point.y);
    const selection = buildSelectionState(this.data.document, objectId);
    this.setData({
      selectedObjectIndex: selection.index,
      selectedObject: selection.form,
      status: selection.form ? "已选中元素" : "没有点中元素",
    }, () => this.renderCanvas());
  },

  onPageInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field === "width" ? "pageWidth" : "pageHeight"]: event.detail.value });
  },

  applyPageSize() {
    const width = parsePositiveNumber(this.data.pageWidth);
    const height = parsePositiveNumber(this.data.pageHeight);
    if (!width || !height) {
      this.setData({ status: "页面宽度和高度必须是大于 0 的数字" });
      return;
    }
    const document = clone(this.data.document);
    document.width = width;
    document.height = height;
    try {
      this.replaceDocument(normalizeDocument(document), "页面尺寸已应用");
    } catch (error) {
      this.setData({ status: error.message || "页面尺寸无效" });
    }
  },

  addObject(event) {
    const type = event.currentTarget.dataset.type;
    if (!["text", "qr", "barcode", "rectangle", "line"].includes(type)) return;
    try {
      const document = clone(this.data.document);
      const object = createObject(document, type);
      document.objects.push(object);
      this.replaceDocument(normalizeDocument(document), `${objectLabel(object)}已添加`, object.id);
    } catch (error) {
      this.setData({ status: error.message || "元素添加失败" });
    }
  },

  onObjectInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!field || !this.data.selectedObject) return;
    this.setData({ [`selectedObject.${field}`]: event.detail.value });
  },

  onObjectPickerChange(event) {
    const field = event.currentTarget.dataset.field;
    if (!field || !this.data.selectedObject) return;
    const value = Number(event.detail.value);
    this.setData({ [`selectedObject.${field}Index`]: value });
  },

  applyObject() {
    const form = this.data.selectedObject;
    const index = this.data.document && this.data.document.objects.findIndex((object) => object.id === (form && form.id));
    const current = index >= 0 && this.data.document ? this.data.document.objects[index] : null;
    if (!form || !current) return;
    const patch = {};
    if (form.canEditContent && form.hasContent) {
      if (current.type === "text") patch.text = String(form.content || "");
      if (current.type === "qr" || current.type === "barcode") patch.content = String(form.content || "");
    }
    if (form.canEditPosition) {
      ["x", "y"].forEach((field) => {
        const value = parseNonNegativeNumber(form[field]);
        if (value !== undefined) patch[field] = value;
      });
      if (patch.x === undefined || patch.y === undefined) {
        this.setData({ status: "X 和 Y 必须是大于或等于 0 的数字" });
        return;
      }
    }
    if (form.canEditSize) {
      ["width", "height"].forEach((field) => {
        const value = parsePositiveNumber(form[field]);
        if (value !== undefined) patch[field] = value;
      });
      if (patch.width === undefined || patch.height === undefined) {
        this.setData({ status: "宽度和高度必须是大于 0 的数字" });
        return;
      }
    }
    if (form.canEditRotation) {
      const rotation = parseNumber(form.rotation);
      if (rotation === undefined) {
        this.setData({ status: "旋转角度必须是数字" });
        return;
      }
      patch.rotation = rotation;
    }
    if (current.type === "text" && form.canEditStyle) {
      const fontSize = parsePositiveNumber(form.fontSize);
      if (fontSize === undefined) {
        this.setData({ status: "字号必须是大于 0 的数字" });
        return;
      }
      patch.fontSize = fontSize;
      patch.align = ALIGN_VALUES[form.alignIndex] || "left";
    }
    if (current.type === "barcode" && form.canEditStyle) patch.format = BARCODE_VALUES[form.formatIndex] || "CODE_128";
    const document = clone(this.data.document);
    Object.assign(document.objects[index], patch);
    try {
      this.replaceDocument(normalizeDocument(document), "对象修改已应用");
    } catch (error) {
      this.setData({ status: error.message || "对象参数无效，请检查数字范围" });
    }
  },

  moveSelectedObject(event) {
    const form = this.data.selectedObject;
    const index = this.data.document && this.data.document.objects.findIndex((object) => object.id === (form && form.id));
    const current = index >= 0 && this.data.document ? this.data.document.objects[index] : null;
    if (!form || !current) return;
    if (!form.canEditPosition) {
      this.setData({ status: "当前元素的位置已锁定" });
      return;
    }
    const direction = event.currentTarget.dataset.direction;
    const vectors = {
      left: [-1, 0],
      right: [1, 0],
      up: [0, -1],
      down: [0, 1],
    };
    const vector = vectors[direction];
    const step = Number(this.data.fineTuneStep) || (this.data.fineTuneEnabled ? 0.1 : 1);
    if (!vector || !Number.isFinite(step)) return;
    const dx = vector[0] * step;
    const dy = vector[1] * step;
    const document = clone(this.data.document);
    const object = document.objects[index];
    object.x = clamp(object.x + dx, 0, Math.max(0, document.width - object.width));
    object.y = clamp(object.y + dy, 0, Math.max(0, document.height - object.height));
    try {
      this.replaceDocument(normalizeDocument(document), "位置微调已应用");
    } catch (error) {
      this.setData({ status: error.message || "位置调整失败" });
    }
  },

  toggleFineTune() {
    const enabled = !this.data.fineTuneEnabled;
    this.setData({
      fineTuneEnabled: enabled,
      fineTuneStep: enabled ? 0.1 : 1,
      status: enabled ? "已开启 0.1 mm 微调" : "已切换为 1 mm 移动",
    });
  },

  rotateSelectedObject() {
    const form = this.data.selectedObject;
    const index = this.data.document && this.data.document.objects.findIndex((object) => object.id === (form && form.id));
    const current = index >= 0 && this.data.document ? this.data.document.objects[index] : null;
    if (!form || !current) return;
    if (!form.canEditRotation) {
      this.setData({ status: "当前元素的旋转已锁定" });
      return;
    }
    const document = clone(this.data.document);
    const object = document.objects[index];
    object.rotation = ((Number(object.rotation) || 0) + 90) % 360;
    try {
      this.replaceDocument(normalizeDocument(document), "已旋转 90°");
    } catch (error) {
      this.setData({ status: error.message || "旋转失败" });
    }
  },

  onVariableInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this.setData({ [`variables[${index}].value`]: event.detail.value });
  },

  applyVariables() {
    const document = clone(this.data.document);
    document.variables = document.variables || {};
    this.data.variables.forEach((form) => {
      if (!document.variables[form.name]) return;
      document.variables[form.name].value = form.value;
    });
    try {
      this.replaceDocument(normalizeDocument(document), "变量已应用");
    } catch (error) {
      this.setData({ status: error.message || "变量内容无效" });
    }
  },

  replaceDocument(document, status, preferredObjectId) {
    const preview = calculatePreviewSize(document);
    const selection = buildSelectionState(document, preferredObjectId || (this.data.selectedObject && this.data.selectedObject.id));
    this.setData({
      document,
      selectedObjectIndex: selection.index,
      selectedObject: selection.form,
      variables: buildVariableForms(document),
      pageWidth: String(document.width),
      pageHeight: String(document.height),
      previewWidth: preview.width,
      previewHeight: preview.height,
      previewStyle: preview.style,
      status,
    }, () => this.renderCanvas());
  },

  saveLabel() {
    try {
      saveDocument(normalizeDocument(this.data.document));
      this.setData({ status: "已保存到本机最近标签" });
    } catch (error) {
      this.setData({ status: error.message || "保存失败" });
    }
  },

  goBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.navigateTo({ url: "/pages/home/index" }) });
  },
});

function buildObjectForms(document) {
  return (document.objects || []).map((object) => ({
    id: object.id,
    title: object.name || objectLabel(object),
    typeLabel: objectLabel(object),
    type: object.type,
    hasContent: object.type === "text" || object.type === "qr" || object.type === "barcode",
    content: object.type === "text" ? object.text : object.type === "qr" || object.type === "barcode" ? object.content : "",
    x: String(object.x),
    y: String(object.y),
    width: String(object.width),
    height: String(object.height),
    rotation: String(object.rotation || 0),
    fontSize: object.type === "text" ? String(object.fontSize) : "",
    alignIndex: Math.max(0, ALIGN_VALUES.indexOf(object.align || "left")),
    formatIndex: object.type === "barcode" ? Math.max(0, BARCODE_VALUES.indexOf(object.format || "CODE_128")) : 0,
    alignOptions: ALIGN_LABELS,
    formatOptions: BARCODE_LABELS,
    canEditContent: canEdit(object, "content"),
    canEditPosition: canEdit(object, "position"),
    canEditSize: canEdit(object, "size"),
    canEditRotation: canEdit(object, "rotation"),
    canEditStyle: canEdit(object, "style"),
  }));
}

function buildSelectionState(document, preferredId) {
  const forms = buildObjectForms(document);
  if (!forms.length) return { index: -1, form: null };
  if (!preferredId) return { index: -1, form: null };
  const index = forms.findIndex((form) => form.id === preferredId);
  if (index < 0) return { index: -1, form: null };
  return {
    index,
    form: forms[index],
  };
}

function buildVariableForms(document) {
  return Object.entries(document.variables || {}).map(([name, variable]) => ({
    name,
    label: variable.label || name,
    type: variable.type || "text",
    value: variable.value === undefined ? "" : String(variable.value),
  }));
}

function canEdit(object, property) {
  if (object.locked) return false;
  return !object.editable || object.editable[property] !== false;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function hitTestObjects(objects, x, y, parentX = 0, parentY = 0) {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    if (hitTestObject(object, x, y, parentX, parentY)) return object.id;
  }
  return undefined;
}

function hitTestObject(object, x, y, parentX, parentY) {
  if (!object || object.hidden) return false;
  if (object.type === "group") {
    return hitTestObjects(object.children || [], x, y, parentX + object.x, parentY + object.y) !== undefined
      || pointInObject(object, x, y, parentX, parentY);
  }
  return pointInObject(object, x, y, parentX, parentY);
}

function pointInObject(object, x, y, parentX, parentY) {
  const centerX = parentX + object.x + object.width / 2;
  const centerY = parentY + object.y + object.height / 2;
  const angle = -(Number(object.rotation) || 0) * Math.PI / 180;
  const offsetX = x - centerX;
  const offsetY = y - centerY;
  const localX = offsetX * Math.cos(angle) - offsetY * Math.sin(angle);
  const localY = offsetX * Math.sin(angle) + offsetY * Math.cos(angle);
  return Math.abs(localX) <= object.width / 2 && Math.abs(localY) <= object.height / 2;
}

function calculatePreviewSize(document) {
  let windowWidth = 375;
  try {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    windowWidth = Number(info.windowWidth || windowWidth);
  } catch {
    // Use the standard phone width when system information is unavailable in a test shell.
  }
  // Account for page/card/canvas padding so flex layout never shrinks only the
  // canvas width and changes the physical label aspect ratio.
  const width = Math.max(1, Math.min(windowWidth - 88, 680));
  const height = Math.max(1, Math.round(width * document.height / document.width));
  return { width: Math.round(width), height, style: `width: ${Math.round(width)}px; height: ${height}px;` };
}

function getDotsPerMm() {
  const app = typeof getApp === "function" ? getApp() : null;
  return Number(app && app.globalData && app.globalData.dotsPerMm) || 8;
}

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parsePositiveNumber(value) {
  const number = parseNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function parseNonNegativeNumber(value) {
  const number = parseNumber(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
