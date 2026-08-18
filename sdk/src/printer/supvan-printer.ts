import type { PrinterTransport } from "../transports/transport";
import type { PrinterProfile } from "../protocol/profile";
import type { LabelBoxInfo, PrintJob, PrinterStatus } from "../types";
import { BlePrinter, type BlePrinterOptions } from "./ble-printer";
import { UsbPrinter, type UsbPrinterOptions } from "./usb-printer";

export interface SupvanPrinterOptions {
  ble?: BlePrinterOptions;
  usb?: UsbPrinterOptions;
  profile?: PrinterProfile;
}

export class SupvanPrinter {
  private readonly backend: BlePrinter | UsbPrinter;

  constructor(
    readonly transport: PrinterTransport,
    options: SupvanPrinterOptions = {},
  ) {
    this.backend =
      transport.kind === "ble"
        ? new BlePrinter(transport, { ...options.ble, profile: options.profile ?? options.ble?.profile })
        : new UsbPrinter(transport, { ...options.usb, profile: options.profile ?? options.usb?.profile });
  }

  get connected(): boolean {
    return this.backend.connected;
  }

  async connect(): Promise<void> {
    await this.backend.connect();
  }

  async disconnect(): Promise<void> {
    await this.backend.disconnect();
  }

  async getStatus(): Promise<PrinterStatus> {
    return this.backend.getStatus();
  }

  async readLabelBox(): Promise<LabelBoxInfo> {
    return this.backend.readLabelBox();
  }

  async print(job: PrintJob): Promise<void> {
    await this.backend.print(job);
  }

  async stop(): Promise<boolean | void> {
    return this.backend.stop();
  }
}
