import type { Canvas, FabricObject } from "fabric";
import { describe, expect, it } from "vitest";

import { SnapGuideManager } from "../src/editor/services/snapGuides";

interface MockObject {
  left: number;
  top: number;
  width: number;
  height: number;
  getBoundingRect: () => { left: number; top: number; width: number; height: number };
  set: (values: Record<string, number>) => void;
  setCoords: () => void;
}

function mockObject(left: number, top: number, width: number, height: number): MockObject {
  const object: MockObject = {
    left,
    top,
    width,
    height,
    getBoundingRect() {
      return { left: object.left, top: object.top, width: object.width, height: object.height };
    },
    set(values) {
      Object.assign(object, values);
    },
    setCoords() {},
  };
  return object;
}

function mockCanvas(objects: FabricObject[]): Canvas {
  const canvas = {
    width: 200,
    height: 200,
    renderOnAddRemove: true,
    getObjects: () => objects,
    add(object: FabricObject) {
      objects.push(object);
      return object;
    },
    remove(object: FabricObject) {
      const index = objects.indexOf(object);
      if (index >= 0) objects.splice(index, 1);
      return object;
    },
    bringObjectToFront() {},
    requestRenderAll() {},
  } as unknown as Canvas;
  return canvas;
}

describe("snap guides", () => {
  it("keeps an active snap until the pointer clearly leaves the guide", () => {
    const target = mockObject(91, 30, 18, 18);
    const objects = [target as unknown as FabricObject];
    const manager = new SnapGuideManager(mockCanvas(objects), () => ({ width: 200, height: 200 }));

    manager.snap(target as unknown as FabricObject);
    expect(target.left).toBe(91);

    target.left = 98;
    manager.snap(target as unknown as FabricObject);
    expect(target.left).toBe(91);

    target.left = 105;
    manager.snap(target as unknown as FabricObject);
    expect(target.left).toBe(105);
  });
});
