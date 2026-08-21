import { ValidationError } from "./errors";
import { expandPageJob, type PageJob, type PageJobSettings } from "./jobs";
import {
  normalizePrinterProfile,
  SUPVAN_T50_PROFILE,
  type PrinterProfileInput,
} from "./protocol/profile";

export enum PaperType {
  Gap = 1,
  BlackMark = 2,
  BlackMarkCard = 5,
}

export enum PrinterState {
  Ready = 0,
  HeadOverheat = 1,
  CoverOpen = 2,
  MediaNotInstalled = 3,
  MediaLow = 4,
  MediaNotDetected = 5,
  MediaUnrecognized = 6,
  MediaEmpty = 7,
  BatteryLow = 8,
  CommunicationError = 9,
}

export interface RasterPage {
  width: number;
  height: number;
  /** RGBA (width * height * 4) or grayscale (width * height) pixels. */
  data: Uint8Array | Uint8ClampedArray;
  repeat?: number;
}

export type PrintDirection = 0 | 1 | 2 | 3;

export interface PrintSettings extends PageJobSettings {
  materialWidth?: number;
  materialHeight?: number;
  copies?: number;
  /** Shared BLE/USB direction code: 0 = 0°, 1 = 180°, 2 = 270°, 3 = 90°. */
  direction?: PrintDirection;
  /** @deprecated Use direction. Kept as a compatibility alias for BLE callers. */
  rotate?: PrintDirection | 4;
  density?: number;
  horizontalOffset?: number;
  verticalOffset?: number;
  paperType?: PaperType;
  gap?: number;
  oneByOne?: boolean;
  tailLength?: number;
  speed?: number;
  /** Optional page-width override; it cannot exceed materialWidth * dotsPerMm. */
  maxWidthDots?: number;
  /** @deprecated Use maxWidthDots. */
  maxDotValue?: number;
  /** Protocol dots per millimeter. */
  dotsPerMm?: number;
  /** @deprecated Use dotsPerMm. */
  dpi?: number;
}

export interface ResolvedPrintSettings {
  materialWidth: number;
  materialHeight: number;
  copies: number;
  direction: PrintDirection;
  density: number;
  horizontalOffset: number;
  verticalOffset: number;
  paperType: PaperType;
  gap: number;
  oneByOne: boolean;
  tailLength: number;
  speed: number;
  maxWidthDots: number;
  /** Protocol dots per millimeter. */
  dotsPerMm: number;
}

export type PrintJob = PageJob<RasterPage, PrintSettings>;

export interface LabelBoxInfo {
  uuidHex: string;
  codeHex: string;
  serialNumber: number;
  typeCode: number;
  rawHeight: number;
  height: number;
  width: number;
  rawGap: number;
  gap: number;
  remaining: number;
  template5mm: number;
  template40mm: number;
  timestampDigits: string;
  raw: Uint8Array;
}

export interface PrinterStatusFlags {
  bufferFull: boolean;
  headOverheat: boolean;
  labelReadWriteError: boolean;
  mediaNotDetected: boolean;
  mediaLow: boolean;
  mediaEmpty: boolean;
  mediaUnrecognized: boolean;
  mediaNotInstalled: boolean;
  batteryLow: boolean;
  busy: boolean;
  coverOpen: boolean;
  usbInserted: boolean;
  printing: boolean;
  secondDeviceBusy: boolean;
  labelNotInstalled: boolean;
  charging: boolean;
}

export interface PrinterMetrics {
  printedPages: number;
  totalPages: number;
  temperatureC?: number;
  voltageV?: number;
}

export interface PrinterStatus {
  state: PrinterState;
  flags: PrinterStatusFlags;
  metrics: PrinterMetrics;
  /** @deprecated Use state, flags and metrics; localize status text in the UI. */
  description: string;
  /** @deprecated Use state and flags to build an application-specific message. */
  errorMessage: string;
  /** @deprecated Read metrics.printedPages. */
  printedPages: number;
  /** @deprecated Read metrics.totalPages. */
  totalPages: number;
  raw: Uint8Array;
  rawFlags: Uint8Array;
  /** @deprecated Read metrics.temperatureC. */
  temperatureC?: number;
  /** @deprecated Read metrics.voltageV. */
  voltageV?: number;
  /** @deprecated Read flags.bufferFull. */
  bufferFull: boolean;
  /** @deprecated Read flags.headOverheat. */
  headOverheat: boolean;
  /** @deprecated Read flags.labelReadWriteError. */
  labelReadWriteError: boolean;
  /** @deprecated Read flags.mediaNotDetected. */
  mediaNotDetected: boolean;
  /** @deprecated Read flags.mediaLow. */
  mediaLow: boolean;
  /** @deprecated Read flags.mediaEmpty. */
  mediaEmpty: boolean;
  /** @deprecated Read flags.mediaUnrecognized. */
  mediaUnrecognized: boolean;
  /** @deprecated Read flags.mediaNotInstalled. */
  mediaNotInstalled: boolean;
  /** @deprecated Read flags.batteryLow. */
  batteryLow: boolean;
  /** @deprecated Read flags.busy. */
  busy: boolean;
  /** @deprecated Read flags.coverOpen. */
  coverOpen: boolean;
  /** @deprecated Read flags.usbInserted. */
  usbInserted: boolean;
  /** @deprecated Read flags.printing. */
  printing: boolean;
  /** @deprecated Read flags.secondDeviceBusy. */
  secondDeviceBusy: boolean;
  /** @deprecated Read flags.labelNotInstalled. */
  labelNotInstalled: boolean;
  /** @deprecated Read flags.charging. */
  charging: boolean;
  /** @deprecated Use state and flags. */
  ready: boolean;
}

const DEFAULT_SETTINGS: Omit<ResolvedPrintSettings, "maxWidthDots"> = {
  materialWidth: 48,
  materialHeight: 30,
  copies: 1,
  direction: 0,
  density: 4,
  horizontalOffset: 0,
  verticalOffset: 0,
  paperType: PaperType.Gap,
  gap: 3,
  oneByOne: true,
  tailLength: 0,
  speed: 40,
  dotsPerMm: SUPVAN_T50_PROFILE.dotsPerMm,
};

const PRINT_DIRECTIONS = [0, 1, 2, 3] as const;
const LEGACY_ROTATIONS = [0, 1, 2, 3, 4] as const;
const LEGACY_ROTATE_TO_DIRECTION: readonly PrintDirection[] = [0, 3, 1, 2, 0];

function inRange(value: number, min: number, max: number, name: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`${name} 必须在 ${min}-${max} 范围内`);
  }
}

export function resolvePrintSettings(
  settings: PrintSettings = {},
  labelBox?: LabelBoxInfo,
  profile: PrinterProfileInput = SUPVAN_T50_PROFILE,
): ResolvedPrintSettings {
  const {
    direction: requestedDirection,
    rotate,
    maxWidthDots: requestedMaxWidthDots,
    maxDotValue: legacyMaxDotValue,
    dotsPerMm: requestedDotsPerMm,
    dpi: legacyDpi,
    ...sharedSettings
  } = settings;
  const resolvedProfile = normalizePrinterProfile(profile);
  if (requestedDirection !== undefined && !PRINT_DIRECTIONS.includes(requestedDirection)) {
    throw new ValidationError("direction 必须是 0-3");
  }
  if (
    requestedMaxWidthDots !== undefined &&
    legacyMaxDotValue !== undefined &&
    requestedMaxWidthDots !== legacyMaxDotValue
  ) {
    throw new ValidationError("maxWidthDots 与旧 maxDotValue 不一致");
  }
  if (requestedDotsPerMm !== undefined && legacyDpi !== undefined && requestedDotsPerMm !== legacyDpi) {
    throw new ValidationError("dotsPerMm 与旧 dpi 不一致");
  }
  if (rotate !== undefined && !LEGACY_ROTATIONS.includes(rotate)) {
    throw new ValidationError("rotate 必须是 0-4");
  }
  const legacyDirection = rotate === undefined ? undefined : LEGACY_ROTATE_TO_DIRECTION[rotate];
  if (requestedDirection !== undefined && legacyDirection !== undefined && requestedDirection !== legacyDirection) {
    throw new ValidationError("direction 与旧 rotate 不一致");
  }
  const direction = requestedDirection ?? legacyDirection ?? DEFAULT_SETTINGS.direction;
  const materialWidth = settings.materialWidth ?? labelBox?.width ?? DEFAULT_SETTINGS.materialWidth;
  const materialHeight = settings.materialHeight ?? labelBox?.height ?? DEFAULT_SETTINGS.materialHeight;
  const gap = settings.gap ?? labelBox?.gap ?? DEFAULT_SETTINGS.gap;
  const dotsPerMm = requestedDotsPerMm ?? legacyDpi ?? resolvedProfile.dotsPerMm;
  inRange(materialWidth, 1, 50, "标签宽度");
  inRange(materialHeight, 1, 120, "标签高度");
  inRange(dotsPerMm, 0.1, 32, "点/mm 点密度");
  const pageWidthDots = Math.max(1, Math.round(materialWidth * dotsPerMm));
  const requestedWidthDots = requestedMaxWidthDots ?? legacyMaxDotValue;
  if (requestedWidthDots !== undefined && requestedWidthDots > pageWidthDots) {
    throw new ValidationError(
      `maxWidthDots 不能超过当前页面宽度 ${pageWidthDots} 点（${materialWidth}mm × ${dotsPerMm} 点/mm）`,
    );
  }
  const result: ResolvedPrintSettings = {
    ...DEFAULT_SETTINGS,
    ...sharedSettings,
    direction,
    maxWidthDots: requestedWidthDots ?? pageWidthDots,
    dotsPerMm,
    materialWidth,
    materialHeight,
    gap,
  };
  inRange(result.copies, 1, 99, "打印份数");
  inRange(result.density, 0, 9, "打印浓度");
  inRange(result.gap, 0, 8, "标签间隙");
  inRange(result.speed, 20, 60, "打印速度");
  inRange(result.horizontalOffset, -9, 9, "水平偏移");
  inRange(result.verticalOffset, -9, 9, "垂直偏移");
  inRange(result.maxWidthDots, 1, pageWidthDots, "当前页面最大打印点数");
  if (![PaperType.Gap, PaperType.BlackMark, PaperType.BlackMarkCard].includes(result.paperType)) {
    throw new ValidationError("不支持的标签纸类型");
  }
  return result;
}

export function expandPrintPages(job: PrintJob): RasterPage[] {
  const settings = resolvePrintSettings(job.settings);
  return expandPageJob({ ...job, settings }, {
    taskName: "打印任务",
    validatePage: (page) => {
    if (!Number.isInteger(page.width) || !Number.isInteger(page.height) || page.width <= 0 || page.height <= 0) {
      throw new ValidationError("栅格页宽高必须是正整数");
    }
    const expectedGray = page.width * page.height;
    if (page.data.length !== expectedGray && page.data.length !== expectedGray * 4) {
      throw new ValidationError("栅格页像素长度与宽高不匹配");
    }
    },
  });
}

export { expandPageJob } from "./jobs";
export type { PageJob, PageJobSettings, RepeatablePage } from "./jobs";
