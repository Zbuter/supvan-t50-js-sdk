import { Line, type Canvas, type FabricObject } from "fabric";

import { SNAP_RELEASE_THRESHOLD, SNAP_THRESHOLD } from "../constants";
import type { CanvasBounds } from "./alignment";
import { editorData, getEditorData, setEditorData } from "./objectFactory";

interface Candidate {
  delta: number;
  position: number;
  sourceIndex: number;
}

interface ActiveSnap {
  position: number;
  sourceIndex: number;
}

export class SnapGuideManager {
  private guides: Line[] = [];
  private guideKey?: string;
  private activeX?: ActiveSnap;
  private activeY?: ActiveSnap;

  constructor(
    private readonly canvas: Canvas,
    private readonly getCanvasBounds: () => CanvasBounds = () => ({ width: canvas.width, height: canvas.height }),
  ) {}

  clear(render = true): void {
    this.clearGuides();
    this.activeX = undefined;
    this.activeY = undefined;
    if (render) this.canvas.requestRenderAll();
  }

  snap(target: FabricObject): void {
    const moving = target.getBoundingRect();
    const movingX = [moving.left, moving.left + moving.width / 2, moving.left + moving.width];
    const movingY = [moving.top, moving.top + moving.height / 2, moving.top + moving.height];
    const canvasBounds = this.getCanvasBounds();
    const xTargets = [0, canvasBounds.width / 2, canvasBounds.width];
    const yTargets = [0, canvasBounds.height / 2, canvasBounds.height];
    for (const object of this.canvas.getObjects()) {
      if (object === target || getEditorData(object)?.kind === "guide") continue;
      const item = object.getBoundingRect();
      xTargets.push(item.left, item.left + item.width / 2, item.left + item.width);
      yTargets.push(item.top, item.top + item.height / 2, item.top + item.height);
    }
    const x = this.resolveAxis(movingX, xTargets, this.activeX);
    const y = this.resolveAxis(movingY, yTargets, this.activeY);
    this.activeX = x ? { position: x.position, sourceIndex: x.sourceIndex } : undefined;
    this.activeY = y ? { position: y.position, sourceIndex: y.sourceIndex } : undefined;
    if (x) target.set({ left: target.left + x.delta });
    if (y) target.set({ top: target.top + y.delta });
    target.setCoords();
    this.updateGuides(x, y, canvasBounds);
  }

  private clearGuides(): void {
    this.withoutAutoRender(() => {
      for (const guide of this.guides) this.canvas.remove(guide);
    });
    this.guides = [];
    this.guideKey = undefined;
  }

  private updateGuides(x: Candidate | undefined, y: Candidate | undefined, canvasBounds: CanvasBounds): void {
    const key = `${x?.position ?? "none"}:${y?.position ?? "none"}:${canvasBounds.width}:${canvasBounds.height}`;
    if (this.guideKey === key) return;
    this.clearGuides();
    if (x) this.addGuide([x.position, 0, x.position, canvasBounds.height]);
    if (y) this.addGuide([0, y.position, canvasBounds.width, y.position]);
    this.guideKey = key;
  }

  private resolveAxis(sources: number[], targets: number[], active?: ActiveSnap): Candidate | undefined {
    if (active) {
      const delta = active.position - sources[active.sourceIndex]!;
      if (Math.abs(delta) <= SNAP_RELEASE_THRESHOLD) {
        return { delta, position: active.position, sourceIndex: active.sourceIndex };
      }
    }
    return this.closest(sources, targets);
  }

  private closest(sources: number[], targets: number[]): Candidate | undefined {
    let result: Candidate | undefined;
    for (const [sourceIndex, source] of sources.entries()) {
      for (const target of targets) {
        const delta = target - source;
        if (Math.abs(delta) <= SNAP_THRESHOLD && (!result || Math.abs(delta) < Math.abs(result.delta))) {
          result = { delta, position: target, sourceIndex };
        }
      }
    }
    return result;
  }

  private addGuide(points: [number, number, number, number]): void {
    const guide = new Line(points, {
      stroke: "#00a06b",
      strokeWidth: 1,
      strokeDashArray: [5, 4],
      selectable: false,
      evented: false,
      excludeFromExport: true,
    });
    setEditorData(guide, editorData("guide"));
    this.guides.push(guide);
    this.withoutAutoRender(() => {
      this.canvas.add(guide);
      this.canvas.bringObjectToFront(guide);
    });
  }

  private withoutAutoRender(action: () => void): void {
    const renderOnAddRemove = this.canvas.renderOnAddRemove;
    this.canvas.renderOnAddRemove = false;
    try {
      action();
    } finally {
      this.canvas.renderOnAddRemove = renderOnAddRemove;
    }
  }
}
