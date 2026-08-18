import { ValidationError } from "./errors";
import { SUPVAN_T50_PROFILE, type PrinterProfile } from "./protocol/profile";

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

export interface PrintSettings {
  materialWidth?: number;
  materialHeight?: number;
  copies?: number;
  rotate?: 0 | 1 | 2 | 3 | 4;
  density?: number;
  horizontalOffset?: number;
  verticalOffset?: number;
  paperType?: PaperType;
  gap?: number;
  oneByOne?: boolean;
  tailLength?: number;
  direction?: 0 | 1 | 2 | 3;
  speed?: number;
  maxDotValue?: number;
  /** Protocol dots per millimeter. Python SDK calls this field dpi; T50 uses 8.0. */
  dpi?: number;
}

export interface ResolvedPrintSettings {
  materialWidth: number;
  materialHeight: number;
  copies: number;
  rotate: 0 | 1 | 2 | 3 | 4;
  density: number;
  horizontalOffset: number;
  verticalOffset: number;
  paperType: PaperType;
  gap: number;
  oneByOne: boolean;
  tailLength: number;
  direction: 0 | 1 | 2 | 3;
  speed: number;
  maxDotValue: number;
  /** Protocol dots per millimeter. */
  dpi: number;
}

export interface PrintJob {
  pages: RasterPage[];
  settings?: PrintSettings;
}

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

export interface PrinterStatus {
  state: PrinterState;
  description: string;
  errorMessage: string;
  printedPages: number;
  totalPages: number;
  raw: Uint8Array;
  rawFlags: Uint8Array;
  temperatureC?: number;
  voltageV?: number;
  bufferFull: boolean;
  labelReadWriteError: boolean;
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
  ready: boolean;
}

const DEFAULT_SETTINGS: ResolvedPrintSettings = {
  materialWidth: 48,
  materialHeight: 30,
  copies: 1,
  rotate: 0,
  density: 4,
  horizontalOffset: 0,
  verticalOffset: 0,
  paperType: PaperType.Gap,
  gap: 3,
  oneByOne: true,
  tailLength: 0,
  direction: 0,
  speed: 40,
  maxDotValue: SUPVAN_T50_PROFILE.maxWidthDots,
  dpi: SUPVAN_T50_PROFILE.dpi,
};

function inRange(value: number, min: number, max: number, name: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`${name} 必须在 ${min}-${max} 范围内`);
  }
}

export function resolvePrintSettings(
  settings: PrintSettings = {},
  labelBox?: LabelBoxInfo,
  profile: PrinterProfile = SUPVAN_T50_PROFILE,
): ResolvedPrintSettings {
  const result: ResolvedPrintSettings = {
    ...DEFAULT_SETTINGS,
    ...settings,
    maxDotValue: settings.maxDotValue ?? profile.maxWidthDots,
    dpi: settings.dpi ?? profile.dpi,
    materialWidth: settings.materialWidth ?? labelBox?.width ?? DEFAULT_SETTINGS.materialWidth,
    materialHeight:
      settings.materialHeight ?? labelBox?.height ?? DEFAULT_SETTINGS.materialHeight,
    gap: settings.gap ?? labelBox?.gap ?? DEFAULT_SETTINGS.gap,
  };
  inRange(result.materialWidth, 1, 50, "标签宽度");
  inRange(result.materialHeight, 1, 120, "标签高度");
  inRange(result.copies, 1, 99, "打印份数");
  inRange(result.density, 0, 9, "打印浓度");
  inRange(result.gap, 0, 8, "标签间隙");
  inRange(result.speed, 20, 60, "打印速度");
  inRange(result.horizontalOffset, -9, 9, "水平偏移");
  inRange(result.verticalOffset, -9, 9, "垂直偏移");
  inRange(result.maxDotValue, 1, 384, "最大打印点数");
  inRange(result.dpi, 0.1, 32, "DPI 点密度");
  if (![0, 1, 2, 3, 4].includes(result.rotate)) {
    throw new ValidationError("rotate 必须是 0-4");
  }
  if (![0, 1, 2, 3].includes(result.direction)) {
    throw new ValidationError("direction 必须是 0-3");
  }
  if (![PaperType.Gap, PaperType.BlackMark, PaperType.BlackMarkCard].includes(result.paperType)) {
    throw new ValidationError("不支持的标签纸类型");
  }
  return result;
}

export function expandPrintPages(job: PrintJob): RasterPage[] {
  if (job.pages.length === 0) {
    throw new ValidationError("打印任务至少需要一页");
  }
  const settings = resolvePrintSettings(job.settings);
  const repeated = job.pages.map((page) => ({ page, repeat: page.repeat ?? 1 }));
  repeated.forEach(({ page, repeat }) => {
    if (!Number.isInteger(page.width) || !Number.isInteger(page.height) || page.width <= 0 || page.height <= 0) {
      throw new ValidationError("栅格页宽高必须是正整数");
    }
    if (!Number.isInteger(repeat) || repeat < 1) {
      throw new ValidationError("页面 repeat 必须是正整数");
    }
    const expectedGray = page.width * page.height;
    if (page.data.length !== expectedGray && page.data.length !== expectedGray * 4) {
      throw new ValidationError("栅格页像素长度与宽高不匹配");
    }
  });

  const result: RasterPage[] = [];
  if (settings.oneByOne) {
    for (let copy = 0; copy < settings.copies; copy += 1) {
      for (const { page, repeat } of repeated) {
        for (let index = 0; index < repeat; index += 1) result.push(page);
      }
    }
  } else {
    for (const { page, repeat } of repeated) {
      for (let index = 0; index < repeat * settings.copies; index += 1) result.push(page);
    }
  }
  return result;
}
