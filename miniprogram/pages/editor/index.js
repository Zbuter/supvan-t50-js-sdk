const { EditorEngine } = require("../../core/editor-engine");
const {
  addObject,
  clampObject,
  clone,
  createDocument,
  createObject,
  roundMm,
  validateDocument,
} = require("../../core/document");
const {
  computeViewport,
  hitTest,
  localPoint,
  nearPoint,
  objectCenter,
  resizeHandle,
  screenToDocument,
} = require("../../core/geometry");
const { MAX_PAGES, createWorkspace, validateWorkspace } = require("../../core/workspace");
const { readNavigationMetrics } = require("../../core/navigation");
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
const SPEED_OPTIONS = [20, 25, 30, 35, 40, 45, 50, 55, 60];
const FONT_FAMILIES = ["sans-serif", "Microsoft YaHei", "SimHei", "Arial", "serif", "monospace"];
const LABEL_SIZE_PRESETS = [
  { label: "30 × 20", width: 30, height: 20 },
  { label: "40 × 30", width: 40, height: 30 },
  { label: "50 × 30", width: 50, height: 30 },
  { label: "50 × 40", width: 50, height: 40 },
  { label: "40 × 60", width: 40, height: 60 },
  { label: "50 × 70", width: 50, height: 70 },
  { label: "50 × 80", width: 50, height: 80 },
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

function resizeDocument(document, width, height, scaleObjects, name) {
  const scaleX = width / document.width;
  const scaleY = height / document.height;
  document.name = name;
  if (scaleObjects) {
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
  return document;
}

Page({
  data: {
    statusBarHeight: 24,
    menuRightInset: 16,
    navigationHeight: 72,
    documentName: "未命名标签",
    sizeLabel: "40 × 30 mm",
    objectCount: 0,
    pageCount: 1,
    activePageNumber: 1,
    pages: [],
    selected: false,
    selectedType: "",
    selectedTypeName: "未选择对象",
    selectedPosition: "点按画布中的内容进行选择",
    canUndo: false,
    canRedo: false,
    nudgeIndex: 0,
    nudgeLabel: "微调",
    nudgeActive: false,
    zoomPercent: 100,
    viewZoomed: false,
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
    deviceReady: false,
    deviceName: "未连接",
    deviceStatus: "点击连接打印机",
    deviceDetails: [],
    printCopies: 1,
    printDensity: 4,
    printGap: 3,
    printSpeed: 40,
    printSpeedIndex: 4,
    printDirectionIndex: 0,
    directionOptions: DIRECTION_OPTIONS,
    speedOptions: SPEED_OPTIONS,
    fontFamilies: FONT_FAMILIES,
    labelSizePresets: LABEL_SIZE_PRESETS,
    qrLevels: ["L", "M", "Q", "H"],
    printing: false,
  },

  onLoad() {
    this.setData(readNavigationMetrics(wx));
    const workspace = storage.takePendingWorkspace() || storage.loadWorkingWorkspace() || validateWorkspace(getTemplate("blank-40x30"));
    this.workspaceId = workspace.workspaceId;
    this.pages = workspace.pages;
    this.activePageIndex = workspace.activePageIndex;
    this.engine = new EditorEngine(this.pages[this.activePageIndex]);
    this.printerService = getPrinterService();
    this.renderer = null;
    this.canvasRect = null;
    this.gesture = null;
    this.viewGesture = null;
    this.view = { zoom: 1, panX: 0, panY: 0 };
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
    if (this.engine) this.saveWorking();
  },

  onUnload() {
    if (this.discoveryTimer) clearTimeout(this.discoveryTimer);
    if (this.printerService) this.printerService.stopScan().catch(() => {});
    if (this.engine) this.saveWorking();
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
      zoom: this.view.zoom,
      panX: this.view.panX,
      panY: this.view.panY,
    });
  },

  persistCurrentPage() {
    if (!this.engine || !this.pages) return;
    this.pages[this.activePageIndex] = clone(this.engine.document);
  },

  workspaceSnapshot() {
    this.persistCurrentPage();
    return validateWorkspace({
      workspaceVersion: 1,
      workspaceId: this.workspaceId,
      activePageIndex: this.activePageIndex,
      pages: this.pages,
    });
  },

  saveWorking() {
    storage.saveWorkingWorkspace(this.workspaceSnapshot());
  },

  pageModels() {
    return this.pages.map((page, index) => ({
      index,
      number: index + 1,
      name: `第 ${index + 1} 页`,
      objectCount: index === this.activePageIndex ? this.engine.document.objects.length : page.objects.length,
      active: index === this.activePageIndex,
    }));
  },

  syncView(save = true) {
    const document = this.engine.document;
    const selected = this.engine.selectedObject;
    const nudgeIndex = this.data.nudgeIndex;
    const nudgeStep = NUDGE_STEPS[nudgeIndex];
    const printer = this.printerService ? this.printerService.snapshot() : {
      connected: false,
      ready: false,
      deviceName: "未连接",
      statusText: "点击连接打印机",
      details: [],
    };
    this.setData({
      documentName: document.name || "未命名标签",
      sizeLabel: `${document.width} × ${document.height} mm`,
      objectCount: document.objects.length,
      pageCount: this.pages.length,
      activePageNumber: this.activePageIndex + 1,
      pages: this.pageModels(),
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
      zoomPercent: Math.round(this.view.zoom * 100),
      viewZoomed: this.view.zoom > 1 || this.view.panX !== 0 || this.view.panY !== 0,
      labelWidth: String(document.width),
      labelHeight: String(document.height),
      deviceConnected: printer.connected,
      deviceReady: printer.ready,
      deviceName: printer.deviceName,
      deviceStatus: printer.statusText,
      deviceDetails: printer.details || [],
    });
    if (save) this.saveWorking();
  },

  syncDevice() {
    const printer = this.printerService.snapshot();
    this.setData({
      deviceConnected: printer.connected,
      deviceReady: printer.ready,
      deviceName: printer.deviceName,
      deviceStatus: printer.statusText,
      deviceDetails: printer.details || [],
      printing: printer.printing,
    });
  },

  touchPoint(touch) {
    if (!touch || !this.canvasRect) return null;
    if (Number.isFinite(touch.x) && Number.isFinite(touch.y)) return { x: touch.x, y: touch.y };
    return { x: touch.clientX - this.canvasRect.left, y: touch.clientY - this.canvasRect.top };
  },

  canvasPoint(event, changed = false) {
    const list = changed ? event.changedTouches : event.touches;
    return this.touchPoint(list && list[0]);
  },

  clampView() {
    if (!this.renderer) return;
    if (this.view.zoom <= 1) {
      this.view.panX = 0;
      this.view.panY = 0;
      return;
    }
    const base = computeViewport(this.renderer.width, this.renderer.height, this.engine.document, {
      padding: 26,
      zoom: this.view.zoom,
    });
    const visible = 48;
    this.view.panX = Math.max(
      visible - (base.left + base.width),
      Math.min(this.renderer.width - visible - base.left, this.view.panX),
    );
    this.view.panY = Math.max(
      visible - (base.top + base.height),
      Math.min(this.renderer.height - visible - base.top, this.view.panY),
    );
  },

  updateZoomState() {
    this.setData({
      zoomPercent: Math.round(this.view.zoom * 100),
      viewZoomed: this.view.zoom > 1 || this.view.panX !== 0 || this.view.panY !== 0,
    });
  },

  setViewZoom(value, anchor) {
    if (!this.renderer || !this.renderer.viewport) return;
    const zoom = Math.max(1, Math.min(4, Math.round(Number(value) * 20) / 20));
    const point = anchor || { x: this.renderer.width / 2, y: this.renderer.height / 2 };
    const documentPoint = screenToDocument(this.renderer.viewport, point);
    const base = computeViewport(this.renderer.width, this.renderer.height, this.engine.document, { padding: 26, zoom });
    this.view.zoom = zoom;
    this.view.panX = point.x - (base.left + documentPoint.x * base.scale);
    this.view.panY = point.y - (base.top + documentPoint.y * base.scale);
    this.clampView();
    this.updateZoomState();
    this.renderCanvas();
  },

  zoomIn() {
    this.setViewZoom(this.view.zoom + 0.25);
  },

  zoomOut() {
    this.setViewZoom(this.view.zoom - 0.25);
  },

  resetView() {
    this.view = { zoom: 1, panX: 0, panY: 0 };
    this.viewGesture = null;
    this.updateZoomState();
    this.renderCanvas();
  },

  beginViewGesture(touches) {
    const first = this.touchPoint(touches && touches[0]);
    const second = this.touchPoint(touches && touches[1]);
    if (!first || !second || !this.renderer || !this.renderer.viewport) return false;
    if (this.gesture && this.gesture.mode !== "pan") this.engine.cancelGesture();
    this.gesture = null;
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    this.viewGesture = {
      startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      startZoom: this.view.zoom,
      anchorDocument: screenToDocument(this.renderer.viewport, midpoint),
    };
    return true;
  },

  onCanvasTouchStart(event) {
    if (!this.renderer || !this.renderer.viewport || !event.touches) return;
    if (event.touches.length >= 2) {
      this.beginViewGesture(event.touches);
      return;
    }
    if (event.touches.length !== 1) return;
    const screenPoint = this.canvasPoint(event);
    if (!screenPoint) return;
    const point = screenToDocument(this.renderer.viewport, screenPoint);
    const selected = this.engine.selectedObject;
    const handleRadius = 14 / this.renderer.viewport.scale;
    const resizing = selected && !selected.locked && nearPoint(point, resizeHandle(selected), handleRadius);
    const hit = resizing ? selected : hitTest(this.engine.document.objects, point);
    if (!hit) {
      this.engine.select(null);
      this.gesture = this.view.zoom > 1 ? {
        mode: "pan",
        startScreen: screenPoint,
        initialPanX: this.view.panX,
        initialPanY: this.view.panY,
      } : null;
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
    if (!this.renderer || !this.renderer.viewport || !event.touches) return;
    if (event.touches.length >= 2) {
      if (!this.viewGesture && !this.beginViewGesture(event.touches)) return;
      const first = this.touchPoint(event.touches[0]);
      const second = this.touchPoint(event.touches[1]);
      if (!first || !second) return;
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const zoom = Math.max(1, Math.min(4, this.viewGesture.startZoom * distance / this.viewGesture.startDistance));
      const roundedZoom = Math.round(zoom * 100) / 100;
      const base = computeViewport(this.renderer.width, this.renderer.height, this.engine.document, { padding: 26, zoom: roundedZoom });
      this.view.zoom = roundedZoom;
      this.view.panX = midpoint.x - (base.left + this.viewGesture.anchorDocument.x * base.scale);
      this.view.panY = midpoint.y - (base.top + this.viewGesture.anchorDocument.y * base.scale);
      this.clampView();
      this.renderCanvas();
      return;
    }
    if (!this.gesture) return;
    const screenPoint = this.canvasPoint(event);
    if (!screenPoint) return;
    if (this.gesture.mode === "pan") {
      this.view.panX = this.gesture.initialPanX + screenPoint.x - this.gesture.startScreen.x;
      this.view.panY = this.gesture.initialPanY + screenPoint.y - this.gesture.startScreen.y;
      this.clampView();
      this.renderCanvas();
      return;
    }
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
    if (this.viewGesture) {
      this.viewGesture = null;
      this.updateZoomState();
      return;
    }
    if (!this.gesture) return;
    if (this.gesture.mode === "pan") {
      this.gesture = null;
      this.updateZoomState();
      return;
    }
    this.engine.endGesture();
    this.gesture = null;
    this.guides = {};
    this.syncView(true);
    this.renderCanvas();
  },

  onCanvasTouchCancel() {
    if (this.viewGesture) {
      this.viewGesture = null;
      this.updateZoomState();
    }
    if (!this.gesture) return;
    if (this.gesture.mode !== "pan") this.engine.cancelGesture();
    this.gesture = null;
    this.guides = {};
    this.syncView(false);
    this.renderCanvas();
  },

  goBack() {
    this.saveWorking();
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
    const draft = storage.saveDraft(this.workspaceSnapshot());
    toast(`已保存：${draft.name}`);
  },

  loadPage(index, closeSheet = true) {
    if (!this.pages[index] || index === this.activePageIndex) {
      if (closeSheet) this.closeSheet();
      return;
    }
    this.persistCurrentPage();
    this.activePageIndex = index;
    this.engine = new EditorEngine(this.pages[index]);
    this.guides = {};
    this.gesture = null;
    this.view = { zoom: 1, panX: 0, panY: 0 };
    if (closeSheet) this.setData({ activeSheet: "" });
    this.syncView(true);
    this.renderCanvas();
  },

  openPages() {
    this.openSheet("pages");
  },

  selectPage(event) {
    this.loadPage(Number(event.currentTarget.dataset.index));
  },

  addPage() {
    if (this.pages.length >= MAX_PAGES) return toast(`最多支持 ${MAX_PAGES} 页`);
    this.persistCurrentPage();
    const current = this.engine.document;
    const document = createDocument(current.width, current.height, [], {
      name: current.name,
      print: current.print,
    });
    const index = this.activePageIndex + 1;
    this.pages.splice(index, 0, document);
    this.loadPage(index, false);
    this.setData({ activeSheet: "pages" });
  },

  duplicatePage() {
    if (this.pages.length >= MAX_PAGES) return toast(`最多支持 ${MAX_PAGES} 页`);
    this.persistCurrentPage();
    const index = this.activePageIndex + 1;
    this.pages.splice(index, 0, clone(this.engine.document));
    this.loadPage(index, false);
    this.setData({ activeSheet: "pages" });
  },

  async removePage() {
    if (this.pages.length <= 1) return toast("至少保留一页标签");
    const result = await callWx("showModal", {
      title: "删除当前页？",
      content: `将删除第 ${this.activePageIndex + 1} 页，此操作不会删除其他页面。`,
      confirmText: "删除",
      confirmColor: "#c94c43",
    });
    if (!result.confirm) return;
    const index = this.activePageIndex;
    this.pages.splice(index, 1);
    this.activePageIndex = Math.min(index, this.pages.length - 1);
    this.engine = new EditorEngine(this.pages[this.activePageIndex]);
    this.view = { zoom: 1, panX: 0, panY: 0 };
    this.syncView(true);
    this.renderCanvas();
    this.setData({ activeSheet: "pages" });
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

  alignSelected(event) {
    if (!this.engine.selectedObject) return;
    this.engine.alignSelected(event.currentTarget.dataset.action);
    this.syncView(true);
    this.renderCanvas();
    this.openProperties();
  },

  scaleSelected(event) {
    if (!this.engine.selectedObject) return;
    this.engine.scaleSelected(Number(event.currentTarget.dataset.factor));
    this.syncView(true);
    this.renderCanvas();
    this.openProperties();
  },

  changeLayer(event) {
    if (!this.engine.selectedObject) return;
    this.engine.changeLayer(event.currentTarget.dataset.action);
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
        rotation: String(object.rotation || 0),
        text: object.text || "",
        content: object.content || "",
        fontSize: String(object.fontSize || 4),
        fontWeight: object.fontWeight || "normal",
        fontFamily: object.fontFamily || "sans-serif",
        fontFamilyIndex: Math.max(0, FONT_FAMILIES.indexOf(object.fontFamily || "sans-serif")),
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

  onFontFamily(event) {
    const fontFamilyIndex = Number(event.detail.value);
    this.setData({
      "propertyForm.fontFamilyIndex": fontFamilyIndex,
      "propertyForm.fontFamily": FONT_FAMILIES[fontFamilyIndex],
    });
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
      rotation: numberOr(form.rotation, object.rotation || 0),
    };
    if (object.type === "text") {
      patch.text = form.text;
      patch.fontSize = Math.max(0.8, numberOr(form.fontSize, object.fontSize));
      patch.fontWeight = form.fontWeight;
      patch.fontFamily = form.fontFamily;
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
      content: "模板会作为新的单页标签打开，当前多页工作区会被替换。",
      confirmText: "使用模板",
    });
    if (!result.confirm) return;
    this.pages = [document];
    this.workspaceId = createWorkspace(document).workspaceId;
    this.activePageIndex = 0;
    this.engine = new EditorEngine(document);
    this.view = { zoom: 1, panX: 0, panY: 0 };
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
      this.pages = [document];
      this.workspaceId = createWorkspace(document).workspaceId;
      this.activePageIndex = 0;
      this.engine = new EditorEngine(document);
      this.view = { zoom: 1, panX: 0, panY: 0 };
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

  chooseLabelSize(event) {
    this.setData({
      labelWidth: String(event.currentTarget.dataset.width),
      labelHeight: String(event.currentTarget.dataset.height),
    });
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
    const name = this.data.documentName.trim() || "未命名标签";
    this.engine.commit(() => resizeDocument(this.engine.document, width, height, this.data.scaleOnResize, name));
    this.persistCurrentPage();
    this.pages = this.pages.map((page, index) => index === this.activePageIndex
      ? clone(this.engine.document)
      : resizeDocument(clone(page), width, height, this.data.scaleOnResize, name));
    this.view = { zoom: 1, panX: 0, panY: 0 };
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
      await this.printerService.refreshStatus();
      this.syncDevice();
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
    const speedIndex = Math.max(0, SPEED_OPTIONS.findIndex((value) => value === (print.speed || 40)));
    this.setData({
      activeSheet: "print",
      printCopies: print.copies || 1,
      printDensity: print.density === undefined ? 4 : print.density,
      printGap: print.gap === undefined ? 3 : print.gap,
      printSpeed: print.speed || 40,
      printSpeedIndex: speedIndex,
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

  onPrintSpeed(event) {
    const printSpeedIndex = Number(event.detail.value);
    this.setData({ printSpeedIndex, printSpeed: SPEED_OPTIONS[printSpeedIndex] });
  },

  onPrintDirection(event) {
    this.setData({ printDirectionIndex: Number(event.detail.value) });
  },

  async startPrint() {
    if (this.data.printing) return;
    if (!this.data.deviceReady) {
      toast("打印机尚未就绪，请检查设备状态");
      await this.refreshDeviceStatus();
      return;
    }
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
        speed: Number(this.data.printSpeed),
        direction: DIRECTION_OPTIONS[this.data.printDirectionIndex].value,
      };
      const workspace = this.workspaceSnapshot();
      storage.saveWorkingWorkspace(workspace);
      const raster = workspace.pages.map((page) => rasterizeDocument(page, 8, 190));
      wx.hideLoading();
      await this.printerService.print(raster, document, document.print);
      if (this.printStopRequested) {
        toast("打印已停止");
        return;
      }
      this.closeSheet();
      await callWx("showModal", {
        title: "打印完成",
        content: `${workspace.pages.length} 页 × ${document.print.copies} 份已由打印机确认完成。`,
        showCancel: false,
      });
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
