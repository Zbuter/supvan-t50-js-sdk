import {
  ActiveSelection,
  Canvas,
  FabricImage,
  IText,
  Textbox,
  type FabricObject,
} from "fabric";
import { computed, reactive, ref, shallowRef } from "vue";

import type { RasterPage } from "shuofang-t50-sdk";
import {
  DEFAULT_LABEL_SIZE,
  EDITOR_DOTS_PER_MM,
  LABEL_SIZE_LIMITS,
  MAX_AUTO_FIT_ZOOM,
  THERMAL_BLACK,
} from "../constants";
import { alignSelection, type CanvasBounds } from "../services/alignment";
import { downloadPng, exportRaster } from "../services/exportLabel";
import { EditorHistory } from "../services/history";
import {
  applyStrokeStyle,
  configureEditorObject,
  createCode,
  createImage,
  createLine,
  createRectangle,
  createText,
  getEditorData,
  getStrokeStyle,
  isStrokeStyle,
  normalizeShapeScale,
  setEditorData,
  setShapeStrokeWidth,
  updateCodeObject,
} from "../services/objectFactory";
import { SnapGuideManager } from "../services/snapGuides";
import {
  nextPreviewRotation,
  normalizeAngle,
  previewCanvasSize,
  previewViewportTransform,
  type PreviewRotation,
} from "../services/rotation";
import type {
  AlignAction,
  ContextMenuState,
  EditorPageSummary,
  EditorObjectKind,
  LabelSize,
  SelectionModel,
} from "../types";

interface EditorPage extends EditorPageSummary {
  snapshot: string;
}

const EMPTY_SELECTION: SelectionModel = {
  count: 0,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  angle: 0,
  fill: THERMAL_BLACK,
  stroke: THERMAL_BLACK,
  strokeWidth: 2,
  strokeStyle: "solid",
  content: "",
  fontSize: 24,
  fontFamily: "Microsoft YaHei",
  fontWeight: "normal",
  textAlign: "left",
};

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function createPageId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `page-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useLabelEditor() {
  const fabricCanvas = shallowRef<Canvas>();
  const label = reactive<LabelSize>({ ...DEFAULT_LABEL_SIZE });
  const zoom = ref(1);
  const previewRotation = ref<PreviewRotation>(0);
  const ready = ref(false);
  const canUndo = ref(false);
  const canRedo = ref(false);
  const selection = ref<SelectionModel>({ ...EMPTY_SELECTION });
  const pages = ref<EditorPage[]>([]);
  const activePageIndex = ref(0);
  const pageBusy = ref(false);
  const contextMenu = reactive<ContextMenuState>({ visible: false, x: 0, y: 0 });
  const displayWidth = computed(
    () => previewCanvasSize(label.width, label.height, previewRotation.value).width * EDITOR_DOTS_PER_MM * zoom.value,
  );
  const displayHeight = computed(
    () => previewCanvasSize(label.width, label.height, previewRotation.value).height * EDITOR_DOTS_PER_MM * zoom.value,
  );
  const pageSummaries = computed<EditorPageSummary[]>(() =>
    pages.value.map(({ id, name }) => ({ id, name })),
  );
  let history: EditorHistory | undefined;
  let snapGuides: SnapGuideManager | undefined;
  let clipboard: FabricObject | undefined;
  let pageLoading = false;
  let pageSaveScheduled = false;
  let selectionUpdateFrame: number | undefined;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  const disposers: VoidFunction[] = [];

  function canvas(): Canvas {
    if (!fabricCanvas.value) throw new Error("标签画布尚未初始化");
    return fabricCanvas.value;
  }

  function physicalCanvasBounds(): CanvasBounds {
    return {
      width: label.width * EDITOR_DOTS_PER_MM,
      height: label.height * EDITOR_DOTS_PER_MM,
    };
  }

  function canvasSnapshot(current = canvas()): string {
    return JSON.stringify(current.toObject(["data"]));
  }

  function saveCurrentPage(): void {
    if (pageLoading) return;
    const page = pages.value[activePageIndex.value];
    if (page) page.snapshot = canvasSnapshot();
  }

  function schedulePageSave(): void {
    if (pageLoading || pageSaveScheduled) return;
    pageSaveScheduled = true;
    queueMicrotask(() => {
      pageSaveScheduled = false;
      saveCurrentPage();
    });
  }

  function resetHistory(current = canvas()): void {
    history?.dispose();
    canUndo.value = false;
    canRedo.value = false;
    history = new EditorHistory(current, (state) => {
      canUndo.value = state.canUndo;
      canRedo.value = state.canRedo;
    });
    history.capture();
  }

  function captureDocumentChange(): void {
    history?.capture();
    saveCurrentPage();
  }

  function configureCanvasObjects(current = canvas()): void {
    current.getObjects().forEach(configureEditorObject);
  }

  function renumberPages(): void {
    pages.value.forEach((page, index) => {
      page.name = `第 ${index + 1} 页`;
    });
  }

  function blankPageSnapshot(): string {
    const state = canvas().toObject(["data"]);
    return JSON.stringify({ ...state, objects: [], background: "#ffffff" });
  }

  async function restorePage(index: number): Promise<void> {
    const page = pages.value[index];
    if (!page) return;
    pageBusy.value = true;
    pageLoading = true;
    try {
      const current = canvas();
      history?.dispose();
      current.discardActiveObject();
      activePageIndex.value = index;
      await current.loadFromJSON(page.snapshot);
      configureCanvasObjects(current);
      applyDimensions();
      resetHistory(current);
      contextMenu.visible = false;
      updateSelection();
    } finally {
      pageLoading = false;
      pageBusy.value = false;
    }
  }

  async function selectPage(index: number): Promise<void> {
    if (pageBusy.value || index === activePageIndex.value || !pages.value[index]) return;
    saveCurrentPage();
    await restorePage(index);
  }

  async function addPage(): Promise<void> {
    if (pageBusy.value) return;
    saveCurrentPage();
    const index = activePageIndex.value + 1;
    pages.value.splice(index, 0, {
      id: createPageId(),
      name: "",
      snapshot: blankPageSnapshot(),
    });
    renumberPages();
    await restorePage(index);
  }

  async function duplicatePage(): Promise<void> {
    if (pageBusy.value) return;
    saveCurrentPage();
    const source = pages.value[activePageIndex.value];
    if (!source) return;
    const index = activePageIndex.value + 1;
    pages.value.splice(index, 0, {
      id: createPageId(),
      name: "",
      snapshot: source.snapshot,
    });
    renumberPages();
    await restorePage(index);
  }

  async function removePage(): Promise<void> {
    if (pageBusy.value || pages.value.length <= 1) return;
    const index = activePageIndex.value;
    pages.value.splice(index, 1);
    renumberPages();
    await restorePage(Math.min(index, pages.value.length - 1));
  }

  function applyDimensions(): void {
    if (!fabricCanvas.value) return;
    const physicalWidth = label.width * EDITOR_DOTS_PER_MM;
    const physicalHeight = label.height * EDITOR_DOTS_PER_MM;
    const displaySize = previewCanvasSize(physicalWidth, physicalHeight, previewRotation.value);
    const width = displaySize.width;
    const height = displaySize.height;
    fabricCanvas.value.setDimensions({ width, height });
    fabricCanvas.value.setDimensions(
      { width: Math.round(width * zoom.value), height: Math.round(height * zoom.value) },
      { cssOnly: true },
    );
    fabricCanvas.value.setViewportTransform(previewViewportTransform(physicalWidth, physicalHeight, previewRotation.value));
    fabricCanvas.value.requestRenderAll();
  }

  function updateSelection(): void {
    if (!fabricCanvas.value) return;
    const objects = fabricCanvas.value.getActiveObjects();
    const active = fabricCanvas.value.getActiveObject();
    if (!active || objects.length === 0) {
      selection.value = { ...EMPTY_SELECTION };
      return;
    }
    const rect = active.getBoundingRect();
    const single = objects.length === 1 ? objects[0] : undefined;
    const data = single ? getEditorData(single) : undefined;
    const text = single instanceof IText ? single : undefined;
    const shape = data?.kind === "rectangle" || data?.kind === "line" ? single : undefined;
    const width = shape ? shape.width * Math.abs(shape.scaleX) : single ? active.getScaledWidth() : rect.width;
    const height = shape ? shape.height * Math.abs(shape.scaleY) : single ? active.getScaledHeight() : rect.height;
    selection.value = {
      count: objects.length,
      kind: data?.kind,
      x: rounded(rect.left / EDITOR_DOTS_PER_MM),
      y: rounded(rect.top / EDITOR_DOTS_PER_MM),
      width: rounded(width / EDITOR_DOTS_PER_MM),
      height: rounded(height / EDITOR_DOTS_PER_MM),
      angle: rounded(normalizeAngle(active.angle)),
      fill: THERMAL_BLACK,
      stroke: THERMAL_BLACK,
      strokeWidth: single?.strokeWidth ?? 2,
      strokeStyle: single ? getStrokeStyle(single) : "solid",
      content: text?.text ?? data?.content ?? "",
      fontSize: text?.fontSize ?? 24,
      fontFamily: text?.fontFamily ?? "Microsoft YaHei",
      fontWeight: String(text?.fontWeight ?? "normal"),
      textAlign: (text?.textAlign as SelectionModel["textAlign"] | undefined) ?? "left",
    };
  }

  function scheduleSelectionUpdate(): void {
    if (selectionUpdateFrame !== undefined) return;
    selectionUpdateFrame = requestAnimationFrame(() => {
      selectionUpdateFrame = undefined;
      updateSelection();
    });
  }

  async function addObject(kind: Exclude<EditorObjectKind, "image" | "guide">): Promise<void> {
    const current = canvas();
    const bounds = physicalCanvasBounds();
    const left = Math.max(8, bounds.width / 2 - (kind === "barcode" ? 88 : 48));
    const top = Math.max(8, bounds.height / 2 - (kind === "barcode" ? 36 : 48));
    let object: FabricObject;
    if (kind === "text") object = createText(left, top);
    else if (kind === "rectangle") object = createRectangle(left, top);
    else if (kind === "line") object = createLine(left, top);
    else if (kind === "qrcode") object = createCode("qrcode", "https://supvan.com", left, top);
    else object = createCode("barcode", "6901234567892", left, top);
    current.add(object);
    current.setActiveObject(object);
    current.requestRenderAll();
    updateSelection();
  }

  async function addImageFile(file: File): Promise<void> {
    const current = canvas();
    const bounds = physicalCanvasBounds();
    const object = await createImage(file, bounds.width / 2 - 80, bounds.height / 2 - 55);
    current.add(object);
    current.setActiveObject(object);
    current.requestRenderAll();
    updateSelection();
  }

  function removeSelection(): void {
    const current = canvas();
    const objects = current.getActiveObjects();
    if (objects.length === 0) return;
    current.discardActiveObject();
    current.remove(...objects);
    current.requestRenderAll();
    contextMenu.visible = false;
    updateSelection();
  }

  async function duplicateSelection(offset = 10): Promise<void> {
    const current = canvas();
    const selected = current.getActiveObjects();
    if (selected.length === 0) return;
    await history?.transaction(async () => {
      current.discardActiveObject();
      const clones = await Promise.all(selected.map((object) => object.clone(["data"])));
      for (const clone of clones) {
        clone.set({ left: clone.left + offset, top: clone.top + offset });
        configureEditorObject(clone);
        const data = getEditorData(clone);
        if (data) setEditorData(clone, { ...data, id: crypto.randomUUID() });
        clone.setCoords();
        current.add(clone);
      }
      current.setActiveObject(clones.length === 1 ? clones[0]! : new ActiveSelection(clones, { canvas: current }));
      current.requestRenderAll();
    });
    saveCurrentPage();
    updateSelection();
  }

  function changeLayer(action: "front" | "forward" | "backward" | "back"): void {
    const current = canvas();
    const selected = current.getActiveObjects();
    if (selected.length === 0) return;
    const ordered = action === "back" || action === "backward" ? [...selected].reverse() : selected;
    for (const object of ordered) {
      if (action === "front") current.bringObjectToFront(object);
      else if (action === "forward") current.bringObjectForward(object);
      else if (action === "backward") current.sendObjectBackwards(object);
      else current.sendObjectToBack(object);
    }
    current.requestRenderAll();
    captureDocumentChange();
    contextMenu.visible = false;
  }

  function align(action: AlignAction): void {
    if (alignSelection(canvas(), action, physicalCanvasBounds)) {
      captureDocumentChange();
      updateSelection();
    }
  }

  function selectAll(): void {
    const current = canvas();
    const objects = current.getObjects().filter((object) => getEditorData(object)?.kind !== "guide");
    if (objects.length === 0) return;
    current.setActiveObject(objects.length === 1 ? objects[0]! : new ActiveSelection(objects, { canvas: current }));
    current.requestRenderAll();
    updateSelection();
  }

  function nudge(dx: number, dy: number): void {
    const current = canvas();
    const active = current.getActiveObject();
    if (!active) return;
    active.set({ left: active.left + dx, top: active.top + dy });
    active.setCoords();
    current.requestRenderAll();
    captureDocumentChange();
    updateSelection();
  }

  function rotateSelection(delta: number): void {
    const current = canvas();
    const active = current.getActiveObject();
    if (!active || !Number.isFinite(delta)) return;
    const center = active.getCenterPoint();
    active.set({ angle: normalizeAngle(active.angle + delta) });
    // Fabric objects use a top-left origin for editing. Re-anchor after
    // changing the angle so the visual rotation always happens around the
    // object's center instead of moving its top-left corner.
    active.setPositionByOrigin(center, "center", "center");
    active.setCoords();
    current.requestRenderAll();
    captureDocumentChange();
    updateSelection();
  }

  function scaleSelection(factor: number): void {
    const current = canvas();
    const active = current.getActiveObject();
    const objects = current.getActiveObjects();
    if (!active || objects.length === 0 || !Number.isFinite(factor) || factor <= 0) return;

    const center = active.getCenterPoint();
    const single = objects.length === 1 ? objects[0] : undefined;
    if (single instanceof Textbox) {
      single.set({
        width: Math.max(single.minWidth ?? 20, single.width * factor),
        fontSize: Math.max(6, Math.min(160, single.fontSize * factor)),
      });
      single.setPositionByOrigin(center, "center", "center");
    } else {
      active.set({ scaleX: active.scaleX * factor, scaleY: active.scaleY * factor });
      active.setPositionByOrigin(center, "center", "center");
    }
    active.setCoords();
    current.requestRenderAll();
    captureDocumentChange();
    updateSelection();
  }

  function updateSelectedProperty(key: keyof SelectionModel, value: string | number): void {
    const current = canvas();
    const active = current.getActiveObject();
    const single = current.getActiveObjects().length === 1 ? current.getActiveObjects()[0] : undefined;
    if (!active) return;
    const rect = active.getBoundingRect();
    const numeric = typeof value === "number" ? value : Number(value);
    if (key === "x" && Number.isFinite(numeric)) active.set({ left: active.left + numeric * 8 - rect.left });
    else if (key === "y" && Number.isFinite(numeric)) active.set({ top: active.top + numeric * 8 - rect.top });
    else if (key === "width" && numeric > 0) {
      const targetWidth = numeric * EDITOR_DOTS_PER_MM;
      if (single instanceof Textbox) {
        single.set({ width: Math.max(single.minWidth ?? 20, targetWidth / Math.max(0.01, single.scaleX)) });
      } else if (single && ["rectangle", "line"].includes(getEditorData(single)?.kind ?? "")) {
        single.set({ scaleX: targetWidth / Math.max(1, single.width) });
      } else {
        active.set({ scaleX: active.scaleX * (targetWidth / Math.max(1, active.getScaledWidth())) });
      }
    }
    else if (key === "height" && numeric > 0) {
      const targetHeight = numeric * EDITOR_DOTS_PER_MM;
      if (single instanceof Textbox) {
        const currentHeight = Math.max(1, single.getScaledHeight());
        single.set({
          fontSize: Math.max(6, Math.min(160, single.fontSize * (targetHeight / currentHeight))),
          scaleY: 1,
        });
      } else if (single && getEditorData(single)?.kind === "rectangle") {
        single.set({ scaleY: targetHeight / Math.max(1, single.height) });
      } else {
        active.set({ scaleY: active.scaleY * (targetHeight / Math.max(1, active.getScaledHeight())) });
      }
    }
    else if (key === "angle" && Number.isFinite(numeric)) {
      const center = active.getCenterPoint();
      active.set({ angle: normalizeAngle(numeric) });
      active.setPositionByOrigin(center, "center", "center");
    }
    else if (key === "fill" && single) single.set({ fill: THERMAL_BLACK });
    else if (key === "stroke" && single) single.set({ stroke: THERMAL_BLACK });
    else if (key === "strokeWidth" && single && numeric >= 0.5 && numeric <= 32) {
      setShapeStrokeWidth(single, numeric);
    }
    else if (key === "strokeStyle" && single && isStrokeStyle(value)) applyStrokeStyle(single, value);
    else if (key === "content" && single instanceof IText) {
      single.set({ text: String(value) });
      const data = getEditorData(single);
      if (data) data.content = String(value);
    } else if (key === "content" && single instanceof FabricImage) {
      updateCodeObject(single, String(value));
    } else if (key === "fontSize" && single instanceof IText && numeric > 0) single.set({ fontSize: numeric });
    else if (key === "fontFamily" && single instanceof IText) single.set({ fontFamily: String(value) });
    else if (key === "fontWeight" && single instanceof IText) single.set({ fontWeight: String(value) });
    else if (key === "textAlign" && single instanceof IText) {
      single.set({ textAlign: String(value) as SelectionModel["textAlign"] });
    }
    if (single) normalizeShapeScale(single);
    active.setCoords();
    current.requestRenderAll();
    captureDocumentChange();
    updateSelection();
  }

  function setLabelSize(size: Pick<LabelSize, "width" | "height"> & Partial<LabelSize>): void {
    if (
      size.width < LABEL_SIZE_LIMITS.width.min ||
      size.width > LABEL_SIZE_LIMITS.width.max ||
      size.height < LABEL_SIZE_LIMITS.height.min ||
      size.height > LABEL_SIZE_LIMITS.height.max
    ) return;
    label.id = size.id ?? "custom";
    label.name = size.name ?? `${size.width} x ${size.height} mm`;
    label.width = rounded(size.width);
    label.height = rounded(size.height);
    applyDimensions();
  }

  function rotateLabel(): void {
    previewRotation.value = nextPreviewRotation(previewRotation.value);
    applyDimensions();
  }

  function setZoom(value: number): void {
    zoom.value = Math.min(2, Math.max(0.35, Math.round(value * 20) / 20));
    applyDimensions();
  }

  function zoomWithWheel(event: WheelEvent): void {
    if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const steps = Math.max(-4, Math.min(4, -delta / 100));
    setZoom(zoom.value * 1.1 ** steps);
  }

  function fitToArea(width: number, height: number): void {
    const logicalSize = previewCanvasSize(label.width, label.height, previewRotation.value);
    const logicalWidth = logicalSize.width * EDITOR_DOTS_PER_MM;
    const logicalHeight = logicalSize.height * EDITOR_DOTS_PER_MM;
    const fitted = Math.floor(Math.min(width / logicalWidth, height / logicalHeight, MAX_AUTO_FIT_ZOOM) * 20) / 20;
    setZoom(fitted);
  }

  async function undo(): Promise<void> {
    await history?.undo();
    configureCanvasObjects();
    canvas().requestRenderAll();
    saveCurrentPage();
    updateSelection();
  }

  async function redo(): Promise<void> {
    await history?.redo();
    configureCanvasObjects();
    canvas().requestRenderAll();
    saveCurrentPage();
    updateSelection();
  }

  async function copySelection(): Promise<void> {
    const active = canvas().getActiveObject();
    clipboard = active ? await active.clone(["data"]) : undefined;
  }

  async function pasteSelection(): Promise<void> {
    if (!clipboard) return;
    const current = canvas();
    const clone = await clipboard.clone(["data"]);
    if (clone instanceof ActiveSelection) clone.forEachObject(configureEditorObject);
    else configureEditorObject(clone);
    clone.set({ left: clone.left + 10, top: clone.top + 10 });
    if (clone instanceof ActiveSelection) {
      clone.canvas = current;
      clone.forEachObject((object) => current.add(object));
      clone.setCoords();
    } else {
      current.add(clone);
    }
    current.setActiveObject(clone);
    current.requestRenderAll();
    clipboard = await clone.clone(["data"]);
    updateSelection();
  }

  function handleKeyboard(event: KeyboardEvent): void {
    if (isTypingTarget(event.target)) return;
    const modifier = event.ctrlKey || event.metaKey;
    const zoomIn = event.key === "+" || event.key === "=" || event.code === "NumpadAdd";
    const zoomOut = event.key === "-" || event.key === "_" || event.code === "NumpadSubtract";
    if (zoomIn && !event.altKey) {
      event.preventDefault();
      setZoom(zoom.value + 0.1);
    } else if (zoomOut && !event.altKey) {
      event.preventDefault();
      setZoom(zoom.value - 0.1);
    } else if (event.key === "0") {
      event.preventDefault();
      setZoom(1);
    } else if (modifier && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAll();
    } else if (modifier && event.key.toLowerCase() === "d") {
      event.preventDefault();
      void duplicateSelection();
    } else if (modifier && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void copySelection();
    } else if (modifier && event.key.toLowerCase() === "v") {
      event.preventDefault();
      void pasteSelection();
    } else if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      void (event.shiftKey ? redo() : undo());
    } else if (modifier && event.key.toLowerCase() === "y") {
      event.preventDefault();
      void redo();
    } else if (modifier && event.key.toLowerCase() === "s") {
      event.preventDefault();
      download();
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeSelection();
    } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const distance = event.shiftKey ? 8 : 1;
      if (event.key === "ArrowLeft") nudge(-distance, 0);
      else if (event.key === "ArrowRight") nudge(distance, 0);
      else if (event.key === "ArrowUp") nudge(0, -distance);
      else nudge(0, distance);
    } else if (event.key === "Escape") {
      canvas().discardActiveObject();
      canvas().requestRenderAll();
      contextMenu.visible = false;
      updateSelection();
    }
  }

  async function initialize(element: HTMLCanvasElement): Promise<void> {
    if (fabricCanvas.value) return;
    const current = new Canvas(element, {
      width: label.width * EDITOR_DOTS_PER_MM,
      height: label.height * EDITOR_DOTS_PER_MM,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
      selection: true,
      selectionColor: "rgba(22, 122, 83, 0.08)",
      selectionBorderColor: "#167a53",
      selectionLineWidth: 1,
      fireRightClick: true,
      stopContextMenu: true,
    });
    fabricCanvas.value = current;
    snapGuides = new SnapGuideManager(current, physicalCanvasBounds);
    resetHistory(current);
    const refresh = (): void => {
      const active = current.getActiveObject();
      active?.set({ snapAngle: 90, snapThreshold: 8 });
      scheduleSelectionUpdate();
    };
    const showContextMenu = (target: FabricObject, pointer: PointerEvent): void => {
      if (!current.getActiveObjects().includes(target)) current.setActiveObject(target);
      contextMenu.visible = true;
      contextMenu.x = pointer.clientX;
      contextMenu.y = pointer.clientY;
      updateSelection();
    };
    const cancelLongPress = (): void => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = undefined;
    };
    disposers.push(
      current.on("object:added", schedulePageSave),
      current.on("object:removed", schedulePageSave),
      current.on("object:modified", schedulePageSave),
      current.on("selection:created", refresh),
      current.on("selection:updated", refresh),
      current.on("selection:cleared", refresh),
      current.on("object:scaling", refresh),
      current.on("object:rotating", refresh),
      current.on("object:moving", ({ target }) => {
        if (target) snapGuides?.snap(target);
        scheduleSelectionUpdate();
      }),
      current.on("object:modified", ({ target }) => {
        if (target) {
          target.set({ angle: normalizeAngle(target.angle) });
          normalizeShapeScale(target);
        }
        snapGuides?.clear();
        updateSelection();
      }),
      current.on("mouse:up", () => {
        cancelLongPress();
        snapGuides?.clear(false);
      }),
      current.on("mouse:move", cancelLongPress),
      current.on("mouse:out", cancelLongPress),
      current.on("mouse:down", ({ e, target }) => {
        const pointer = e as PointerEvent;
        if (pointer.button === 2 && target) {
          showContextMenu(target, pointer);
        } else if (pointer.button === 0) {
          contextMenu.visible = false;
          cancelLongPress();
          const isTouch = pointer.pointerType === "touch" || pointer.type === "touchstart";
          if (target && isTouch) {
            longPressTimer = setTimeout(() => {
              longPressTimer = undefined;
              showContextMenu(target, pointer);
            }, 550);
          }
        }
      }),
    );
    window.addEventListener("keydown", handleKeyboard);
    applyDimensions();

    const title = createText(18, 16);
    title.set({ text: "轻焙咖啡豆", fontSize: 30, fontWeight: "bold" });
    const titleData = getEditorData(title);
    if (titleData) titleData.content = title.text;
    const subtitle = createText(20, 58);
    subtitle.set({ text: "净含量 250g  ·  2026.08", fontSize: 16 });
    const subtitleData = getEditorData(subtitle);
    if (subtitleData) subtitleData.content = subtitle.text;
    const barcode = createCode("barcode", "6901234567892", 18, 112);
    barcode.set({ scaleX: barcode.scaleX * 0.88, scaleY: barcode.scaleY * 0.82 });
    const bounds = physicalCanvasBounds();
    const qr = createCode("qrcode", "https://supvan.com", bounds.width - 92, 102);
    qr.set({ scaleX: qr.scaleX * 0.75, scaleY: qr.scaleY * 0.75 });
    current.add(title, subtitle, barcode, qr);
    current.discardActiveObject();
    current.requestRenderAll();
    history?.capture();
    pages.value = [{ id: createPageId(), name: "第 1 页", snapshot: canvasSnapshot(current) }];
    activePageIndex.value = 0;
    ready.value = true;
  }

  async function dispose(): Promise<void> {
    window.removeEventListener("keydown", handleKeyboard);
    if (selectionUpdateFrame !== undefined) cancelAnimationFrame(selectionUpdateFrame);
    selectionUpdateFrame = undefined;
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = undefined;
    disposers.splice(0).forEach((disposeEvent) => disposeEvent());
    history?.dispose();
    snapGuides?.clear();
    if (fabricCanvas.value) await fabricCanvas.value.dispose();
    fabricCanvas.value = undefined;
    ready.value = false;
  }

  function withPrintDimensions<T>(action: () => T): T {
    const current = canvas();
    const physicalWidth = label.width * EDITOR_DOTS_PER_MM;
    const physicalHeight = label.height * EDITOR_DOTS_PER_MM;
    try {
      current.setDimensions({ width: physicalWidth, height: physicalHeight });
      current.setViewportTransform(previewViewportTransform(physicalWidth, physicalHeight, 0));
      current.requestRenderAll();
      return action();
    } finally {
      applyDimensions();
    }
  }

  function raster(): RasterPage {
    return withPrintDimensions(() => exportRaster(canvas()));
  }

  function download(): void {
    withPrintDimensions(() => downloadPng(canvas()));
  }

  async function rasterPages(): Promise<RasterPage[]> {
    saveCurrentPage();
    const physicalWidth = label.width * EDITOR_DOTS_PER_MM;
    const physicalHeight = label.height * EDITOR_DOTS_PER_MM;
    const element = document.createElement("canvas");
    const temporary = new Canvas(element, {
      width: label.width * EDITOR_DOTS_PER_MM,
      height: label.height * EDITOR_DOTS_PER_MM,
      backgroundColor: "#ffffff",
    });
    try {
      const output: RasterPage[] = [];
      for (const page of pages.value) {
        await temporary.loadFromJSON(page.snapshot);
        configureCanvasObjects(temporary);
        temporary.setDimensions({
          width: label.width * EDITOR_DOTS_PER_MM,
          height: label.height * EDITOR_DOTS_PER_MM,
        });
        temporary.setViewportTransform(previewViewportTransform(physicalWidth, physicalHeight, 0));
        temporary.requestRenderAll();
        output.push(exportRaster(temporary));
      }
      return output;
    } finally {
      await temporary.dispose();
    }
  }

  return {
    fabricCanvas,
    label,
    zoom,
    previewRotation,
    ready,
    canUndo,
    canRedo,
    selection,
    pages: pageSummaries,
    activePageIndex,
    pageBusy,
    contextMenu,
    displayWidth,
    displayHeight,
    initialize,
    dispose,
    addObject,
    addImageFile,
    removeSelection,
    duplicateSelection,
    changeLayer,
    align,
    rotateSelection,
    scaleSelection,
    selectAll,
    updateSelectedProperty,
    selectPage,
    addPage,
    duplicatePage,
    removePage,
    setLabelSize,
    rotateLabel,
    setZoom,
    zoomWithWheel,
    fitToArea,
    undo,
    redo,
    raster,
    rasterPages,
    download,
  };
}

export type LabelEditor = ReturnType<typeof useLabelEditor>;
