import { ActiveSelection, type Canvas, type FabricObject } from "fabric";

import type { AlignAction } from "../types";

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface CanvasBounds {
  width: number;
  height: number;
}

function bounds(object: FabricObject): Bounds {
  const rect = object.getBoundingRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
}

function groupBounds(items: FabricObject[]): Bounds {
  const all = items.map(bounds);
  const left = Math.min(...all.map((item) => item.left));
  const top = Math.min(...all.map((item) => item.top));
  const right = Math.max(...all.map((item) => item.right));
  const bottom = Math.max(...all.map((item) => item.bottom));
  return {
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    width: right - left,
    height: bottom - top,
  };
}

function move(object: FabricObject, dx: number, dy: number): void {
  object.set({ left: object.left + dx, top: object.top + dy });
  object.setCoords();
}

export function alignSelection(
  canvas: Canvas,
  action: AlignAction,
  getCanvasBounds: () => CanvasBounds = () => ({ width: canvas.width, height: canvas.height }),
): boolean {
  const items = canvas.getActiveObjects();
  if (items.length === 0) return false;
  canvas.discardActiveObject();
  const canvasBounds = getCanvasBounds();
  const target =
    items.length === 1
      ? {
          left: 0,
          top: 0,
          right: canvasBounds.width,
          bottom: canvasBounds.height,
          centerX: canvasBounds.width / 2,
          centerY: canvasBounds.height / 2,
          width: canvasBounds.width,
          height: canvasBounds.height,
        }
      : groupBounds(items);

  if (action === "distribute-horizontal" && items.length > 2) {
    const sorted = [...items].sort((left, right) => bounds(left).left - bounds(right).left);
    const first = bounds(sorted[0]!);
    const last = bounds(sorted.at(-1)!);
    const width = sorted.reduce((total, item) => total + bounds(item).width, 0);
    const gap = (last.right - first.left - width) / (sorted.length - 1);
    let cursor = first.left;
    for (const item of sorted) {
      const current = bounds(item);
      move(item, cursor - current.left, 0);
      cursor += current.width + gap;
    }
  } else if (action === "distribute-vertical" && items.length > 2) {
    const sorted = [...items].sort((left, right) => bounds(left).top - bounds(right).top);
    const first = bounds(sorted[0]!);
    const last = bounds(sorted.at(-1)!);
    const height = sorted.reduce((total, item) => total + bounds(item).height, 0);
    const gap = (last.bottom - first.top - height) / (sorted.length - 1);
    let cursor = first.top;
    for (const item of sorted) {
      const current = bounds(item);
      move(item, 0, cursor - current.top);
      cursor += current.height + gap;
    }
  } else {
    for (const item of items) {
      const current = bounds(item);
      if (action === "left") move(item, target.left - current.left, 0);
      else if (action === "center-horizontal") move(item, target.centerX - current.centerX, 0);
      else if (action === "right") move(item, target.right - current.right, 0);
      else if (action === "top") move(item, 0, target.top - current.top);
      else if (action === "center-vertical") move(item, 0, target.centerY - current.centerY);
      else if (action === "bottom") move(item, 0, target.bottom - current.bottom);
    }
  }
  canvas.setActiveObject(items.length === 1 ? items[0]! : new ActiveSelection(items, { canvas }));
  canvas.requestRenderAll();
  return true;
}
