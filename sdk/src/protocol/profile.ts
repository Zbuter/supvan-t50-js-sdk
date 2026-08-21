/** Protocol-level geometry for a printer family. */
export interface PrinterProfile {
  id: string;
  name: string;
  /** Protocol density in dots per millimeter. */
  dotsPerMm: number;
  physicalDpi: number;
}

/**
 * Profile input accepted by public APIs. `dpi` is kept only for older callers
 * and is normalized to `dotsPerMm` before protocol work begins.
 */
export type PrinterProfileInput = Omit<PrinterProfile, "dotsPerMm"> & {
  dotsPerMm?: number;
  /** @deprecated Use dotsPerMm. */
  dpi?: number;
  /** @deprecated Page width is derived from materialWidth and dotsPerMm. */
  maxWidthDots?: number;
};

export const SUPVAN_T50_PROFILE: PrinterProfile = Object.freeze({
  id: "t50",
  name: "T50 · 203 DPI",
  dotsPerMm: 8,
  physicalDpi: 203,
});

export function normalizePrinterProfile(profile: PrinterProfileInput = SUPVAN_T50_PROFILE): PrinterProfile {
  const dotsPerMm = profile.dotsPerMm ?? profile.dpi;
  if (dotsPerMm === undefined) throw new RangeError("PrinterProfile.dotsPerMm 不能为空");
  if (profile.dotsPerMm !== undefined && profile.dpi !== undefined && profile.dotsPerMm !== profile.dpi) {
    throw new RangeError("PrinterProfile.dotsPerMm 与旧 dpi 不一致");
  }
  if (!Number.isFinite(dotsPerMm) || dotsPerMm <= 0) throw new RangeError("PrinterProfile.dotsPerMm 必须是正数");
  return {
    id: profile.id,
    name: profile.name,
    dotsPerMm,
    physicalDpi: profile.physicalDpi,
  };
}

export function dotsForMm(value: number, profile: PrinterProfileInput = SUPVAN_T50_PROFILE): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("毫米尺寸必须是正数");
  return Math.max(1, Math.round(value * normalizePrinterProfile(profile).dotsPerMm));
}
