import type { PrinterStatus } from "../types";
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

export interface StatusFields extends Omit<PrinterStatus, "state" | "description" | "errorMessage" | "ready"> {}

export function makeStatus(state: PrinterState, fields: StatusFields): PrinterStatus {
  const description = fields.printing && state === PrinterState.Ready ? "打印中" : DESCRIPTIONS[state];
  const ready =
    state === PrinterState.Ready &&
    !fields.busy &&
    !fields.printing &&
    !fields.secondDeviceBusy;
  return {
    state,
    description,
    errorMessage: state === PrinterState.Ready ? "" : DESCRIPTIONS[state],
    ready,
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
