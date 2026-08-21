import type { PrinterStatus, PrinterStatusFlags, PrinterMetrics } from "../types";
import { PrinterState } from "../types";

const DESCRIPTIONS: Record<PrinterState, string> = {
  [PrinterState.Ready]: "准备就绪",
  [PrinterState.HeadOverheat]: "打印头温度过高",
  [PrinterState.CoverOpen]: "上盖未关好",
  [PrinterState.MediaNotInstalled]: "耗材未装好",
  [PrinterState.MediaLow]: "耗材余量不足",
  [PrinterState.MediaNotDetected]: "未检测到耗材",
  [PrinterState.MediaUnrecognized]: "未识别到耗材",
  [PrinterState.MediaEmpty]: "耗材已用完",
  [PrinterState.BatteryLow]: "电池电压低",
  [PrinterState.CommunicationError]: "通信异常",
};

export interface StatusFields
  extends Omit<PrinterStatus, "state" | "flags" | "metrics" | "description" | "errorMessage" | "ready"> {}

function statusFlagError(fields: StatusFields): string {
  if (fields.headOverheat) return DESCRIPTIONS[PrinterState.HeadOverheat];
  if (fields.coverOpen) return DESCRIPTIONS[PrinterState.CoverOpen];
  if (fields.mediaNotInstalled || fields.labelNotInstalled) return DESCRIPTIONS[PrinterState.MediaNotInstalled];
  if (fields.mediaLow) return DESCRIPTIONS[PrinterState.MediaLow];
  if (fields.mediaNotDetected || fields.labelReadWriteError) return DESCRIPTIONS[PrinterState.MediaNotDetected];
  if (fields.mediaEmpty) return DESCRIPTIONS[PrinterState.MediaEmpty];
  if (fields.mediaUnrecognized) return DESCRIPTIONS[PrinterState.MediaUnrecognized];
  if (fields.batteryLow) return DESCRIPTIONS[PrinterState.BatteryLow];
  return "";
}

export function makeStatus(state: PrinterState, fields: StatusFields): PrinterStatus {
  const flags: PrinterStatusFlags = {
    bufferFull: fields.bufferFull,
    headOverheat: fields.headOverheat,
    labelReadWriteError: fields.labelReadWriteError,
    mediaNotDetected: fields.mediaNotDetected,
    mediaLow: fields.mediaLow,
    mediaEmpty: fields.mediaEmpty,
    mediaUnrecognized: fields.mediaUnrecognized,
    mediaNotInstalled: fields.mediaNotInstalled,
    batteryLow: fields.batteryLow,
    busy: fields.busy,
    coverOpen: fields.coverOpen,
    usbInserted: fields.usbInserted,
    printing: fields.printing,
    secondDeviceBusy: fields.secondDeviceBusy,
    labelNotInstalled: fields.labelNotInstalled,
    charging: fields.charging,
  };
  const metrics: PrinterMetrics = {
    printedPages: fields.printedPages,
    totalPages: fields.totalPages,
    temperatureC: fields.temperatureC,
    voltageV: fields.voltageV,
  };
  const flagError = statusFlagError(fields);
  const blockingMessage =
    state !== PrinterState.Ready
      ? DESCRIPTIONS[state]
      : flagError ||
        (fields.secondDeviceBusy
          ? "打印机被其他设备占用"
          : fields.printing
            ? "打印机正在打印"
            : fields.busy
              ? "打印机正忙"
              : "");
  const description =
    state === PrinterState.Ready && flagError
      ? flagError
      : fields.printing && state === PrinterState.Ready
        ? "打印中"
        : DESCRIPTIONS[state];
  return {
    state,
    flags,
    metrics,
    description,
    errorMessage: blockingMessage,
    ready:
      state === PrinterState.Ready &&
      !flagError &&
      !fields.busy &&
      !fields.printing &&
      !fields.secondDeviceBusy,
    ...fields,
  };
}

export function stateFromFlags(main0: number, main1: number, fixed0: number, fixed1: number): PrinterState {
  if (main1 & 0x08) return PrinterState.HeadOverheat;
  if (fixed0 & 0x08) return PrinterState.CoverOpen;
  if (main0 & 0x10 || fixed1 & 0x01) return PrinterState.MediaNotInstalled;
  if (main0 & 0x20) return PrinterState.MediaLow;
  if (main0 & 0x02) return PrinterState.MediaNotDetected;
  if (main0 & 0x08) return PrinterState.MediaUnrecognized;
  if (main0 & 0x04) return PrinterState.MediaEmpty;
  if (main0 & 0x40) return PrinterState.BatteryLow;
  return PrinterState.Ready;
}
