/**
 * Protocol-level geometry for a printer family. `dpi` keeps the Python SDK
 * naming (8 points/mm for T50); `physicalDpi` is the human-facing value.
 */
export interface PrinterProfile {
  id: string;
  name: string;
  dpi: number;
  physicalDpi: number;
  maxWidthDots: number;
}

export const SUPVAN_T50_PROFILE: PrinterProfile = Object.freeze({
  id: "t50",
  name: "T50 · 203 DPI",
  dpi: 8,
  physicalDpi: 203,
  maxWidthDots: 384,
});

export function dotsForMm(value: number, profile: PrinterProfile = SUPVAN_T50_PROFILE): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("毫米尺寸必须是正数");
  return Math.max(1, Math.round(value * profile.dpi));
}
