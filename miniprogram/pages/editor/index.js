const { EditorEngine } = require("../../core/editor-engine");
const {
  addObject,
  clampObject,
  clone,
  createObject,
  roundMm,
  validateDocument,
} = require("../../core/document");
const {
  hitTest,
  localPoint,
  nearPoint,
  objectCenter,
  resizeHandle,
  screenToDocument,
} = require("../../core/geometry");
const { CanvasRenderer, rasterizeDocument } = require("../../core/renderer");
const { getTemplate, listTemplates } = require("../../core/templates");
const { chooseAndConvertImage, convertDocumentImagesToBitmaps } = require("../../services/image-import");
const { getPrinterService } = require("../../services/printer-service");
const storage = require("../../services/storage");
const { decodeLabelTransfer, encodeLabelTransfer } = require("../../vendor/t50-core");

const TYPE_NAMES = {
  text: "文字",
  qr: "二维码",
  barcode: "条形码",
  image: "图片",
  rectangle: "矩形",
  line: "直线",
  path: "图形",
  symbol: "素材",
  group: "组合",
};

const NUDGE_STEPS = [0, 1, 0.1];
const DIRECTION_OPTIONS = [
  { label: "0°", value: 0 },
  { label: "180°", value: 1 },
  { label: "270°", value: 2 },
  { label: "90°", value: 3 },
];

function callWx(name, options = {}) {
  return new Promise((resolve, reject) => wx[name]({ ...options, success: resolve, fail: reject }));
}

function toast(message, duration = 2200) {
  wx.showToast({ title: String(message), icon: "none", duration });
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

Page({
  data: {
    statusBarHeight: 24,
    documentName: "未命名标签",
    sizeLabel: "40 × 30 mm",
    objectCount: 0,
    selected: false,
    selectedType: "",
    selectedTypeName: "未选择对象",
    selectedPosition: "点按画布中的内容进行选择",
    canUndo: false,
    canRedo: false,
    nudgeIndex: 0,
    nudgeLabel: "微调",
    nudgeActive: false,
    activeSheet: "",
    propertyForm: {},
    templates: [],
    labelWidth: "40",
    labelHeight: "30",
    scaleOnResize: false,
    devices: [],
    scanning: false,
    deviceBusy: false,
    deviceConnected: false,
    deviceName: "未连接",
    deviceStatus: "点击连接打印机",
    printCopies: 1,
    printDensity: 4,
    printGap: 3,
    printDirectionIndex: 0,
    directionOptions: DIRECTION_OPTIONS,
    qrLevels: ["L", "M", "Q", "H"],
    printing: false,
  },

  onLoad() {
    try {
      this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight || 24 });
    } catch (_error) {}
    const document = storage.takePending() || storage.loadWorking() || getTemplate("blank-40x30");
    this.engine = new EditorEngine(document);
    this.printerService = getPrinterService();
    this.renderer = null;
    this.canvasRect = null;
    this.gesture = null;
    this.guides = {};
    this.lastTap = { id: null, time: 0 };
    this.discoveryTimer = null;
    this.resumePrintAfterConnect = false;
    this.printStopRequested = false;
    this.setData({ templates: listTemplates() });
    this.syncView(false);
  },

  onReady() {
    this.initCanvas();
  },

  onShow() {
    if (this.printerService) this.syncDevice();
  },

  onHide() {
    if (this.engine) storage.saveWorking(this.engine.document);
  },

  onUnload() {
    if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
    if (this.printerService) this.printerService.stopScan().catch(() => {});
    if (this.engine) storage.saveWorking(this.engine.document);
  },

  initCanvas() {
    wx.createSelectorQuery()
      .in(this)
      .select("#editorCanvas")
      .fields({ node: true, size: true, rect: true })
      .exec((result) => {
        const field = result && result[0];
        if (!field || !field.node || !field.width || !field.height) return;
        const pixelRatio = Math.min(3, wx.getWindowInfo ? wx.getWindowInfo().pixelRatio || 2 : 2);
        field.node.width = Math.round(field.width * pixelRatio);
        field.node.height = Math.round(field.height * pixelRatio);
        this.canvasRect = { left: field.left || 0, top: field.top || 0 };
        this.renderer = new CanvasRenderer(field.node, field.width, field.height, pixelRatio);
        this.renderCanvas();
      });
  },

  renderCanvas() {
    if (!this.renderer || !this.engine) return;
    this.renderer.render(this.engine.document, {
      selectedId: this.engine.selectedId,
      guides: this.guides,
    });
  },

  syncView(save = true) {
    const document = this.engine.document;
    const selected = this.engine.selectedObject;
    const nudgeIndex = this.data.nudgeIndex;
    const nudgeStep = NUDGE_STEPS[nudgeIndex];
    const printer = this.printerService ? this.printerService.snapshot() : {
      connected: false,
      deviceName: "未连接",
      statusText: "点击连接打印机",
    };
    this.setData({
      documentName: document.name || "未命名标签",
      sizeLabel: `${document.width} × ${document.height} mm`,
      objectCount: document.objects.length,
      selected: Boolean(selected),
      selectedType: selected ? selected.type : "",
      selectedTypeName: selected ? TYPE_NAMES[selected.type] || "对象" : "未选择对象",
      selectedPosition: selected
        ? `X ${selected.x.toFixed(1)} · Y ${selected.y.toFixed(1)} · ${selected.width.toFixed(1)} × ${selected.height.toFixed(1)} mm`
        : "点按画布中的内容进行选择",
      canUndo: this.engine.undoStack.length > 0,
      canRedo: this.engine.redoStack.length > 0,
      nudgeLabel: nudgeStep ? `${nudgeStep}mm` : "微调",
      nudgeActive: nudgeStep > 0,
      labelWidth: String(document.width),
      labelHeight: String(document.height),
      deviceConnected: printer.connected,
      deviceName: printer.deviceName,
      deviceStatus: printer.statusText,
    });
    if (save) storage.saveWorking(document);
  },

  syncDevice() {
    const printer = this.printerService.snapshot();
    this.setData({
      deviceConnected: printer.connected,
      deviceName: printer.deviceName,
      deviceStatus: printer.statusText,
      printing: printer.printing,
    });
  },

  canvasPoint(event, changed = false) {
    const list = changed ? event.changedTouches : event.touches;
    const touch = list && list[0];
    if (!touch || !this.canvasRect) return null;
    if (Number.isFinite(touch.x) && Number.isFinite(touch.y)) return { x: touch.x, y: touch.y };
    return { x: touch.clientX - this.canvasRect.left, y: touch.clientY - this.canvasRect.top };
  },

  onCanvasTouchStart(event) {
    if (!this.renderer || !this.renderer.viewport || !event.touches || event.touches.length !== 1) return;
    const screenPoint = this.canvasPoint(event);
    if (!screenPoint) return;
    const point = screenToDocument(this.renderer.viewport, screenPoint);
    const selected = this.engine.selectedObject;
    const handleRadius = 14 / this.renderer.viewport.scale;
    const resizing = selected && !selected.locked && nearPoint(point, resizeHandle(selected), handleRadius);
    const hit = resizing ? selected : hitTest(this.engine.document.objects, point);
    if (!hit) {
      this.engine.select(null);
      this.gesture = null;
      this.syncView(false);
      this.renderCanvas();
      return;
    }

    this.engine.select(hit.id);
    const now = Date.now();
    const doubleTap = this.lastTap.id === hit.id && now - this.lastTap.time < 330;
    this.lastTap = { id: hit.id, time: now };
    this.syncView(false);
    this.renderCanvas();
    if (doubleTap) {
      this.openProperties();
      return;
    }

    this.engine.beginGesture();
    this.gesture = {
      mode: resizing ? "resize" : "drag",
      start: point,
      initial: clone(hit),
      moved: false,
    };
  },

  onCanvasTouchMove(event) {
    if (!this.gesture || !this.renderer || !this.renderer.viewport) return;
    const screenPoint = this.canvasPoint(event);
    if (!screenPoint) return;
    const point = screenToDocument(this.renderer.viewport, screenPoint);
    const gesture = this.gesture;
    gesture.moved = true;
    if (gesture.mode === "drag") {
      this.guides = this.engine.previewMove(
        gesture.initial.x + point.x - gesture.start.x,
        gesture.initial.y + point.y - gesture.start.y,
        true,
      );
    } else {
      const local = localPoint(gesture.initial, point);
      const center = objectCenter(gesture.initial);
      let width = Math.max(1, Math.abs(local.x - center.x) * 2);
      let height = Math.max(1, Math.abs(local.y - center.y) * 2);
      if (gesture.initial.type === "qr") {
        const side = Math.max(width, height);
        width = side;
        height = side;
      } else if (gesture.initial.type === "image") {
        const resizeScale = Math.max(width / gesture.initial.width, height / gesture.initial.height);
        width = gesture.initial.width * resizeScale;
        height = gesture.initial.height * resizeScale;
      }
      this.engine.previewResize(width, height);
      this.guides = {};
    }
    this.renderCanvas();
  },

  onCanvasTouchEnd() {
    if (!this.gesture) return;
    this.engine.endGesture();
    this.gesture = null;
    this.guides = {};
    this.syncView(true);
    this.renderCanvas();
  },

  onCanvasTouchCancel() {
    if (!this.gesture) return;
    this.engine.cancelGesture();
    this.gesture = null;
    this.guides = {};
    this.syncView(false);
    this.renderCanvas();
  },

  goBack() {
    storage.saveWorking(this.engine.document);
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: "/pages/home/index" });
  },

  undo() {
    if (this.engine.undo()) {
      this.syncView(true);
      this.renderCanvas();
    }
  },

  redo() {
    if (this.engine.redo()) {
      this.syncView(true);
      this.renderCanvas();
    }
  },

  saveDraft() {
    const draft = storage.saveDraft(this.engine.document);
    toast(`已保存：${draft.name}`);
  },

  openSheet(name) {
    this.setData({ activeSheet: name });
  },

  closeSheet() {
    if (this.data.activeSheet === "device") {
      if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
      this.printerService.stopScan().catch(() => {});
      this.setData({ scanning: false });
    }
    this.setData({ activeSheet: "" });
  },

  stopPropagation() {},

  openAdd() {
    this.openSheet("add");
  },

  async addElement(event) {
    const type = event.currentTarget.dataset.type;
    if (type === "image") {
      this.closeSheet();
      await this.addImage();
      return;
    }
    try {
      this.engine.add(type);
      this.closeSheet();
      this.syncView(true);
      this.renderCanvas();
      if (["text", "qr", "barcode"].includes(type)) this.openProperties();
    } catch (error) {
      toast(error.message || "添加对象失败");
    }
  },

  async addImage() {
    wx.showLoading({ title: "转换黑白图片" });
    try {
      const imported = await chooseAndConvertImage(190);
      this.engine.commit(() => {
        const document = this.engine.document;
        if (!document.resources) document.resources = {};
        if (!document.resources.bitmaps) document.resources.bitmaps = {};
        document.resources.bitmaps[imported.id] = imported.resource;
        const maxWidth = Math.min(document.width * 0.55, imported.resource.widthDots / 8);
        const width = Math.max(4, maxWidth);
        const height = Math.max(4, width * imported.resource.heightDots / imported.resource.widthDots);
        const object = createObject("image", document, {
          resourceId: imported.id,
          width,
          height,
          fit: "contain",
        });
        addObject(document, object);
        this.engine.selectedId = object.id;
      });
      this.syncView(true);
      this.renderCanvas();
    } catch (error) {
      if (!String(error.errMsg || "").includes("cancel")) toast(error.message || "图片导入失败");
    } finally {
      wx.hideLoading();
    }
  },

  toggleNudge() {
    const nudgeIndex = (this.data.nudgeIndex + 1) % NUDGE_STEPS.length;
    this.setData({ nudgeIndex }, () => this.syncView(false));
  },

  nudge(event) {
    const step = NUDGE_STEPS[this.data.nudgeIndex];
    if (!step || !this.engine.selectedObject) return;
    const dx = Number(event.currentTarget.dataset.dx || 0) * step;
    const dy = Number(event.currentTarget.dataset.dy || 0) * step;
    this.engine.nudgeSelected(dx, dy);
    this.syncView(true);
    this.renderCanvas();
  },

  rotateSelected() {
    if (!this.engine.selectedObject) return;
    this.engine.rotateSelected();
    this.syncView(true);
    this.renderCanvas();
  },

  duplicateSelected() {
    if (!this.engine.selectedObject) return;
    this.engine.duplicateSelected();
    this.syncView(true);
    this.renderCanvas();
  },

  removeSelected() {
    if (!this.engine.selectedObject) return;
    this.engine.removeSelected();
    this.syncView(true);
    this.renderCanvas();
  },

  openProperties() {
    const object = this.engine.selectedObject;
    if (!object) return toast("请先点选画布中的对象");
    this.setData({
      propertyForm: {
        name: object.name || TYPE_NAMES[object.type] || "对象",
        x: String(object.x),
        y: String(object.y),
        width: String(object.width),
        height: String(object.height),
        text: object.text || "",
        content: object.content || "",
        fontSize: String(object.fontSize || 4),
        fontWeight: object.fontWeight || "normal",
        align: object.align || "left",
        errorCorrection: object.errorCorrection || "M",
        format: object.format || "CODE_128",
        strokeWidth: String(object.strokeWidth || 0.35),
        fit: object.fit || "contain",
      },
      activeSheet: "property",
    });
  },

  onPropertyInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`propertyForm.${field}`]: event.detail.value });
  },

  onPropertyChoice(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`propertyForm.${field}`]: event.currentTarget.dataset.value });
  },

  applyProperties() {
    const object = this.engine.selectedObject;
    if (!object) return this.closeSheet();
    const form = this.data.propertyForm;
    const patch = {
      name: form.name || object.name,
      x: numberOr(form.x, object.x),
      y: numberOr(form.y, object.y),
      width: numberOr(form.width, object.width),
      height: numberOr(form.height, object.height),
    };
    if (object.type === "text") {
      patch.text = form.text;
      patch.fontSize = Math.max(0.8, numberOr(form.fontSize, object.fontSize));
      patch.fontWeight = form.fontWeight;
      patch.align = form.align;
    } else if (object.type === "qr") {
      patch.content = form.content;
      patch.errorCorrection = form.errorCorrection;
    } else if (object.type === "barcode") {
      patch.content = form.content;
      patch.format = form.format;
    } else if (object.type === "rectangle" || object.type === "line") {
      patch.strokeWidth = Math.max(0.1, numberOr(form.strokeWidth, object.strokeWidth || 0.35));
    } else if (object.type === "image") {
      patch.fit = form.fit;
    }
    try {
      this.engine.patchSelected(patch);
      this.closeSheet();
      this.syncView(true);
      this.renderCanvas();
    } catch (error) {
      toast(error.message || "属性设置无效");
    }
  },

  openTemplates() {
    this.openSheet("templates");
  },

  async applyTemplate(event) {
    const document = getTemplate(event.currentTarget.dataset.id);
    if (!document) return;
    const result = await callWx("showModal", {
      title: "使用这个模板？",
      content: "当前画布会被模板副本替换，仍可通过撤销恢复。",
      confirmText: "使用模板",
    });
    if (!result.confirm) return;
    this.engine.replaceDocument(document);
    this.closeSheet();
    this.syncView(true);
    this.renderCanvas();
  },

  async copyTransfer() {
    try {
      const value = encodeLabelTransfer({
        magic: "SUPVAN_LABEL",
        version: 1,
        document: this.engine.document,
        source: { app: "supvan-t50-miniprogram", timestamp: Date.now() },
      });
      await callWx("setClipboardData", { data: value });
      toast("可编辑标签数据已复制");
    } catch (error) {
      toast(error.message || "复制失败");
    }
  },

  async importTransfer() {
    wx.showLoading({ title: "导入可编辑标签", mask: true });
    try {
      const result = await callWx("getClipboardData");
      const transfer = decodeLabelTransfer(result.data);
      const document = await convertDocumentImagesToBitmaps(transfer.document);
      wx.hideLoading();
      this.engine.replaceDocument(document);
      this.closeSheet();
      this.syncView(true);
      this.renderCanvas();
      toast("已导入可编辑标签");
    } catch (error) {
      wx.hideLoading();
      toast(error.message || "剪贴板中没有可编辑标签", 2600);
    }
  },

  openSizeSheet() {
    this.setData({
      labelWidth: String(this.engine.document.width),
      labelHeight: String(this.engine.document.height),
      activeSheet: "size",
    });
  },

  onLabelSizeInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },

  onDocumentName(event) {
    this.setData({ documentName: event.detail.value });
  },

  onScaleResize(event) {
    this.setData({ scaleOnResize: event.detail.value });
  },

  applyLabelSize() {
    const width = Number(this.data.labelWidth);
    const height = Number(this.data.labelHeight);
    if (!Number.isFinite(width) || width < 1 || width > 50 || !Number.isFinite(height) || height < 1 || height > 120) {
      return toast("宽度需为 1–50 mm，高度需为 1–120 mm");
    }
    this.engine.commit(() => {
      const document = this.engine.document;
      document.name = this.data.documentName.trim() || "未命名标签";
      const scaleX = width / document.width;
      const scaleY = height / document.height;
      if (this.data.scaleOnResize) {
        document.objects.forEach((object) => {
          object.x *= scaleX;
          object.y *= scaleY;
          object.width *= scaleX;
          object.height *= scaleY;
          if (object.type === "text") object.fontSize *= Math.min(scaleX, scaleY);
        });
      }
      document.width = roundMm(width);
      document.height = roundMm(height);
      document.objects.forEach((object) => clampObject(document, object));
      validateDocument(document);
    });
    this.closeSheet();
    this.syncView(true);
    this.renderCanvas();
  },

  async openDevice() {
    this.setData({ activeSheet: "device", devices: [], scanning: true });
    try {
      await this.printerService.startScan((devices) => this.setData({ devices }));
      if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
      this.discoveryTimer = setTimeout(async () => {
        await this.printerService.stopScan().catch(() => {});
        this.setData({ scanning: false });
      }, 9000);
    } catch (error) {
      this.setData({ scanning: false });
      toast(error.message || "无法搜索蓝牙设备");
    }
  },

  async rescanDevices() {
    await this.openDevice();
  },

  async connectDevice(event) {
    const device = this.data.devices.find((item) => item.deviceId === event.currentTarget.dataset.id);
    if (!device) return;
    this.setData({ deviceBusy: true, scanning: false });
    wx.showLoading({ title: "连接打印机" });
    try {
      await this.printerService.connect(device);
      this.syncDevice();
      this.closeSheet();
      toast("打印机已连接");
      if (this.resumePrintAfterConnect) {
        this.resumePrintAfterConnect = false;
        this.openPrint();
      }
    } catch (error) {
      toast(error.message || "连接失败", 2800);
    } finally {
      wx.hideLoading();
      this.setData({ deviceBusy: false });
    }
  },

  async disconnectDevice() {
    this.setData({ deviceBusy: true });
    try {
      await this.printerService.disconnect();
      this.syncDevice();
      this.closeSheet();
    } finally {
      this.setData({ deviceBusy: false });
    }
  },

  async refreshDeviceStatus() {
    if (!this.printerService.connected) return;
    this.setData({ deviceBusy: true });
    try {
      const status = await this.printerService.refreshStatus();
      this.setData({ deviceStatus: status.displayText });
    } catch (error) {
      toast(error.message || "状态读取失败");
    } finally {
      this.setData({ deviceBusy: false });
    }
  },

  openPrint() {
    if (!this.printerService.connected) {
      this.resumePrintAfterConnect = true;
      this.openDevice();
      return;
    }
    const print = this.engine.document.print || {};
    const directionIndex = Math.max(0, DIRECTION_OPTIONS.findIndex((item) => item.value === (print.direction || 0)));
    this.setData({
      activeSheet: "print",
      printCopies: print.copies || 1,
      printDensity: print.density === undefined ? 4 : print.density,
      printGap: print.gap === undefined ? 3 : print.gap,
      printDirectionIndex: directionIndex,
    });
  },

  onPrintCopies(event) {
    this.setData({ printCopies: Math.max(1, Math.min(99, Number(event.detail.value || 1))) });
  },

  onPrintDensity(event) {
    this.setData({ printDensity: event.detail.value });
  },

  onPrintGap(event) {
    this.setData({ printGap: event.detail.value });
  },

  onPrintDirection(event) {
    this.setData({ printDirectionIndex: Number(event.detail.value) });
  },

  async startPrint() {
    if (this.data.printing) return;
    this.printStopRequested = false;
    this.setData({ printing: true });
    wx.showLoading({ title: "生成打印点阵", mask: true });
    try {
      const document = this.engine.document;
      document.print = {
        ...(document.print || {}),
        copies: Number(this.data.printCopies),
        density: Number(this.data.printDensity),
        gap: Number(this.data.printGap),
        direction: DIRECTION_OPTIONS[this.data.printDirectionIndex].value,
      };
      storage.saveWorking(document);
      const raster = rasterizeDocument(document, 8, 190);
      wx.hideLoading();
      await this.printerService.print(raster, document, document.print);
      if (this.printStopRequested) {
        toast("打印已停止");
        return;
      }
      this.closeSheet();
      await callWx("showModal", { title: "打印完成", content: "打印机已确认任务完成。", showCancel: false });
    } catch (error) {
      if (this.printStopRequested) {
        toast("打印已停止");
        return;
      }
      await callWx("showModal", {
        title: "打印没有完成",
        content: error.message || "请检查打印机状态后重试。",
        showCancel: false,
      });
    } finally {
      wx.hideLoading();
      this.setData({ printing: false });
      this.syncDevice();
    }
  },

  async stopPrint() {
    this.printStopRequested = true;
    try {
      await this.printerService.stop();
    } catch (error) {
      toast(error.message || "停止失败");
    } finally {
      this.setData({ printing: false });
    }
  },
});
