import { describe, expect, it } from "vitest";

import {
  DrawObjectFormat,
  normalizeDrawObject,
  normalizeAngle,
  renderDrawJob,
  renderDrawPage,
  type DrawCanvasContext,
  type DrawPage,
} from "../src";

function context(): DrawCanvasContext {
  return {
    fillStyle: "#ffffff",
    strokeStyle: "#000000",
    lineWidth: 1,
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "top",
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    clearRect: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    fillText: () => undefined,
    measureText: (value) => ({ width: value.length * 8 } as TextMetrics),
    drawImage: () => undefined,
  } as DrawCanvasContext;
}

describe("draw-object preview renderer", () => {
  it("normalizes legacy aliases into the canonical object model", () => {
    expect(normalizeDrawObject({
      x: 0,
      y: 0,
      width: 20,
      height: 5,
      type: "text",
      text: "测试",
      font_name: "SimHei",
      font_size: 4,
      anti_color: true,
    })).toMatchObject({
      format: DrawObjectFormat.Text,
      content: "测试",
      fontFamily: "SimHei",
      fontSize: 4,
      antiColor: true,
    });
    expect(() => normalizeDrawObject({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      format: DrawObjectFormat.Text,
      kind: DrawObjectFormat.QrCode,
    })).toThrow("format、type、kind 值冲突");
  });

  it("renders text and QR objects at printer dots without scaling", () => {
    const page: DrawPage = {
      width: 30,
      height: 20,
      objects: [
        { x: 0, y: 0, width: 20, height: 5, content: "测试", format: DrawObjectFormat.Text, autoReturn: true },
        { x: 2, y: 8, width: 12, height: 12, content: "https://example.com", format: DrawObjectFormat.QrCode },
      ],
    };
    const target = context();
    expect(renderDrawPage(target, page)).toEqual({ width: 240, height: 160 });
  });

  it("keeps copies and repeat order identical to print jobs", () => {
    const first: DrawPage = { width: 10, height: 10, objects: [] };
    const second: DrawPage = { width: 10, height: 10, objects: [] };
    const targets = renderDrawJob(
      { pages: [{ ...first, repeat: 2 }, second], settings: { copies: 2 } },
      (size, page, copy) => ({ context: context(), width: size.width, height: size.height, page, copy }),
    );
    expect(targets.map((target) => target.page.repeat ?? 1)).toEqual([2, 2, 1, 2, 2, 1]);
    expect(targets.every((target) => target.width === 80 && target.height === 80)).toBe(true);
  });

  it("normalizes arbitrary rotation to one turn", () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-90)).toBe(270);
  });

  it("uses the page width instead of a fixed 384-dot limit", () => {
    expect(renderDrawPage(context(), { width: 50, height: 30, objects: [] })).toEqual({
      width: 400,
      height: 240,
    });
  });
});
