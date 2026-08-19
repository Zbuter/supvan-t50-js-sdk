import type { LabelSize } from "./types";

export const LABEL_SIZES: LabelSize[] = [
  { id: "30x20", name: "30 x 20 mm", width: 30, height: 20 },
  { id: "40x30", name: "40 x 30 mm", width: 40, height: 30 },
  { id: "50x30", name: "50 x 30 mm", width: 50, height: 30 },
  { id: "50x40", name: "50 x 40 mm", width: 50, height: 40 },
  { id: "40x60", name: "40 x 60 mm", width: 40, height: 60 },
  { id: "50x70", name: "50 x 70 mm", width: 50, height: 70 },
  { id: "50x80", name: "50 x 80 mm", width: 50, height: 80 },
];

export const EDITOR_DOTS_PER_MM = 8;
// T50 is a monochrome thermal printer, so editable ink is always black.
export const THERMAL_BLACK = "#000000";
export const DEFAULT_LABEL_SIZE = LABEL_SIZES[1]!;
export const MAX_AUTO_FIT_ZOOM = 1;
export const LABEL_SIZE_LIMITS = {
  width: { min: 5, max: 50 },
  height: { min: 5, max: 120 },
} as const;
export const SNAP_THRESHOLD = 4;
export const SNAP_RELEASE_THRESHOLD = 8;
export const SNAP_SETTLE_DELAY_MS = 50;

export const FONT_FAMILIES = [
  "Microsoft YaHei",
  "SimHei",
  "Arial",
  "sans-serif",
  "serif",
] as const;
