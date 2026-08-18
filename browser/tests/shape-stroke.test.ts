import { describe, expect, it } from "vitest";

import { THERMAL_BLACK } from "../src/editor/constants";
import {
  applyStrokeStyle,
  createLine,
  createRectangle,
  getStrokeStyle,
  normalizeShapeScale,
  setShapeStrokeWidth,
} from "../src/editor/services/objectFactory";

describe("shape stroke behavior", () => {
  it("keeps shapes monochrome for thermal output", () => {
    expect(createRectangle(10, 12).stroke).toBe(THERMAL_BLACK);
    expect(createLine(20, 24).stroke).toBe(THERMAL_BLACK);
    expect(createRectangle(10, 12).snapAngle).toBe(90);
    expect(createLine(20, 24).snapThreshold).toBe(8);
  });

  it("keeps rectangle and line strokes independent from object scaling", () => {
    const rectangle = createRectangle(10, 12);
    const line = createLine(20, 24);

    expect(rectangle.strokeUniform).toBe(true);
    expect(line.strokeUniform).toBe(true);
    expect(line.isControlVisible("ml")).toBe(true);
    expect(line.isControlVisible("mr")).toBe(true);
    expect(line.isControlVisible("br")).toBe(false);
    expect(line.isControlVisible("mb")).toBe(false);
  });

  it("bakes scale into shape dimensions without changing stroke width", () => {
    const rectangle = createRectangle(10, 12);
    rectangle.set({ scaleX: 1.5, scaleY: 0.5 });
    const scaledCenter = rectangle.getRelativeCenterPoint();

    expect(normalizeShapeScale(rectangle)).toBe(true);
    expect(rectangle.scaleX).toBe(1);
    expect(rectangle.scaleY).toBe(1);
    expect(rectangle.width).toBe(168);
    expect(rectangle.height).toBe(32);
    expect(rectangle.strokeWidth).toBe(2);
    expect(rectangle.getRelativeCenterPoint()).toEqual(scaledCenter);

    const line = createLine(20, 24);
    line.set({ scaleX: 2, scaleY: 3 });
    expect(normalizeShapeScale(line)).toBe(true);
    expect(line.width).toBe(240);
    expect(line.height).toBe(0);
    expect(line.scaleX).toBe(1);
    expect(line.scaleY).toBe(1);
    expect(line.strokeWidth).toBe(2);
  });

  it("updates line width and dash pattern as independent properties", () => {
    const line = createLine(20, 24);
    const geometryWidth = line.width;

    applyStrokeStyle(line, "dashed");
    expect(getStrokeStyle(line)).toBe("dashed");
    expect(line.strokeDashArray).toEqual([8, 5]);

    setShapeStrokeWidth(line, 4);
    expect(line.strokeWidth).toBe(4);
    expect(line.width).toBe(geometryWidth);
    expect(line.strokeDashArray).toEqual([16, 10]);

    applyStrokeStyle(line, "dotted");
    expect(line.strokeLineCap).toBe("round");
    expect(line.strokeDashArray).toEqual([4, 8]);

    applyStrokeStyle(line, "solid");
    expect(line.strokeDashArray).toBeNull();
  });
});
