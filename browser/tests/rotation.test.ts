import { describe, expect, it } from "vitest";

import {
  nextPreviewRotation,
  previewCanvasSize,
  previewViewportTransform,
  projectPreviewRect,
  type PreviewRotation,
} from "../src/editor/services/rotation";

describe("editor preview rotation", () => {
  it("cycles through all four quarter-turns", () => {
    let rotation: PreviewRotation = 0;
    rotation = nextPreviewRotation(rotation);
    expect(rotation).toBe(1);
    rotation = nextPreviewRotation(rotation);
    expect(rotation).toBe(2);
    rotation = nextPreviewRotation(rotation);
    expect(rotation).toBe(3);
    expect(nextPreviewRotation(rotation)).toBe(0);
  });

  it("swaps the preview dimensions only for quarter-turns", () => {
    expect(previewCanvasSize(320, 240, 0)).toMatchObject({ width: 320, height: 240 });
    expect(previewCanvasSize(320, 240, 1)).toMatchObject({ width: 240, height: 320 });
    expect(previewCanvasSize(320, 240, 2)).toMatchObject({ width: 320, height: 240 });
    expect(previewCanvasSize(320, 240, 3)).toMatchObject({ width: 240, height: 320 });
  });

  it("keeps viewport and popover coordinates aligned in every direction", () => {
    const rect = { left: 32, top: 48, width: 80, height: 40 };
    expect(previewViewportTransform(320, 240, 0)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(previewViewportTransform(320, 240, 1)).toEqual([0, 1, -1, 0, 240, 0]);
    expect(previewViewportTransform(320, 240, 2)).toEqual([-1, 0, 0, -1, 320, 240]);
    expect(previewViewportTransform(320, 240, 3)).toEqual([0, -1, 1, 0, 0, 320]);

    expect(projectPreviewRect(rect, 320, 240, 0)).toEqual(rect);
    expect(projectPreviewRect(rect, 320, 240, 1)).toEqual({ left: 152, top: 32, width: 40, height: 80 });
    expect(projectPreviewRect(rect, 320, 240, 2)).toEqual({ left: 208, top: 152, width: 80, height: 40 });
    expect(projectPreviewRect(rect, 320, 240, 3)).toEqual({ left: 48, top: 208, width: 40, height: 80 });
  });
});
