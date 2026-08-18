export type PreviewRotation = 0 | 1 | 2 | 3;

export interface PreviewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ViewportTransform = [number, number, number, number, number, number];

export function normalizePreviewRotation(value: number): PreviewRotation {
  const turns = ((Math.round(value) % 4) + 4) % 4;
  return turns as PreviewRotation;
}

export function nextPreviewRotation(rotation: PreviewRotation): PreviewRotation {
  return normalizePreviewRotation(rotation + 1);
}

export function previewCanvasSize(width: number, height: number, rotation: PreviewRotation): PreviewRect {
  return rotation % 2 === 0
    ? { left: 0, top: 0, width, height }
    : { left: 0, top: 0, width: height, height: width };
}

/** Map print-space coordinates into the editor's rotated viewport. */
export function previewViewportTransform(width: number, height: number, rotation: PreviewRotation): ViewportTransform {
  switch (rotation) {
    case 1:
      return [0, 1, -1, 0, height, 0];
    case 2:
      return [-1, 0, 0, -1, width, height];
    case 3:
      return [0, -1, 1, 0, 0, width];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

/** Project an axis-aligned print-space rectangle into the rotated view. */
export function projectPreviewRect(
  rect: PreviewRect,
  printWidth: number,
  printHeight: number,
  rotation: PreviewRotation,
): PreviewRect {
  switch (rotation) {
    case 1:
      return {
        left: printHeight - rect.top - rect.height,
        top: rect.left,
        width: rect.height,
        height: rect.width,
      };
    case 2:
      return {
        left: printWidth - rect.left - rect.width,
        top: printHeight - rect.top - rect.height,
        width: rect.width,
        height: rect.height,
      };
    case 3:
      return {
        left: rect.top,
        top: printWidth - rect.left - rect.width,
        width: rect.height,
        height: rect.width,
      };
    default:
      return rect;
  }
}
