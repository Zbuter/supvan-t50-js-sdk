import { SUPVAN_VENDOR_ID, T50_PRODUCT_IDS } from "../constants";
import { CapabilityError, CommunicationError } from "../errors";
import { hidReports } from "../protocol/usb";
import { AsyncByteQueue, type PrinterTransport } from "./transport";

interface HidInputReportEventLike extends Event {
  readonly data: DataView;
}

interface HidDeviceLike extends EventTarget {
  readonly opened: boolean;
  readonly productName: string;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
}

interface HidApiLike {
  requestDevice(options: {
    filters: Array<{ vendorId: number; productId?: number }>;
  }): Promise<HidDeviceLike[]>;
}

function hidApi(): HidApiLike {
  const api = (navigator as Navigator & { hid?: HidApiLike }).hid;
  if (!api || !globalThis.isSecureContext) {
    throw new CapabilityError("WebHID 需要 Chromium 内核浏览器和 HTTPS/localhost");
  }
  return api;
}

export class WebHidTransport implements PrinterTransport {
  readonly kind = "usb" as const;
  private readonly queue = new AsyncByteQueue();

  constructor(private readonly device: HidDeviceLike) {}

  static async request(): Promise<WebHidTransport> {
    const devices = await hidApi().requestDevice({
      filters: T50_PRODUCT_IDS.map((productId) => ({ vendorId: SUPVAN_VENDOR_ID, productId })),
    });
    const device = devices[0];
    if (!device) throw new CapabilityError("未选择硕方 USB HID 打印机");
    return new WebHidTransport(device);
  }

  get name(): string {
    return this.device.productName || "硕方 USB HID 打印机";
  }

  get connected(): boolean {
    return this.device.opened;
  }

  private readonly onInputReport = (event: Event): void => {
    const { data } = event as HidInputReportEventLike;
    const report = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    // The native driver discards the first on-wire protocol byte on HID reads.
    this.queue.push(report.slice(Math.min(1, report.length)));
  };

  async connect(): Promise<void> {
    if (!this.device.opened) await this.device.open();
    this.device.addEventListener("inputreport", this.onInputReport);
  }

  async disconnect(): Promise<void> {
    this.device.removeEventListener("inputreport", this.onInputReport);
    this.queue.clear();
    if (this.device.opened) await this.device.close();
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.connected) throw new CommunicationError("USB HID 尚未连接");
    for (const report of hidReports(data)) {
      await this.device.sendReport(0, report.slice().buffer as ArrayBuffer);
    }
  }

  async read(size = 512, timeoutMs = 2000): Promise<Uint8Array> {
    if (!this.connected) throw new CommunicationError("USB HID 尚未连接");
    return this.queue.read(size, timeoutMs);
  }
}
