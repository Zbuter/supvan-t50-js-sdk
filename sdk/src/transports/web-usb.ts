import { HID_REPORT_SIZE, SUPVAN_VENDOR_ID, T50_PRODUCT_IDS } from "../constants";
import { CapabilityError, CommunicationError, TimeoutError } from "../errors";
import { hidReports } from "../protocol/usb";
import { AsyncByteQueue, type PrinterTransport } from "./transport";

function usbApi(): USB {
  const api = navigator.usb;
  if (!api || !globalThis.isSecureContext) {
    throw new CapabilityError("WebUSB 需要 Chromium 内核浏览器和 HTTPS/localhost");
  }
  return api;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError("USB 读取超时")), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export class WebUsbTransport implements PrinterTransport {
  readonly kind = "usb" as const;
  private readonly queue = new AsyncByteQueue();
  private interfaceNumber?: number;
  private endpointIn?: number;
  private endpointOut?: number;
  private packetSize = HID_REPORT_SIZE;

  constructor(private readonly device: USBDevice) {}

  static async request(): Promise<WebUsbTransport> {
    const device = await usbApi().requestDevice({
      filters: T50_PRODUCT_IDS.map((productId) => ({ vendorId: SUPVAN_VENDOR_ID, productId })),
    });
    return new WebUsbTransport(device);
  }

  get name(): string {
    return this.device.productName || "硕方 WebUSB 打印机";
  }

  get connected(): boolean {
    return this.device.opened && this.interfaceNumber !== undefined;
  }

  async connect(): Promise<void> {
    try {
      if (!this.device.opened) await this.device.open();
      if (!this.device.configuration) {
        const configuration = this.device.configurations[0];
        if (!configuration) throw new CommunicationError("USB 设备没有配置描述符");
        await this.device.selectConfiguration(configuration.configurationValue);
      }
      const interfaces = this.device.configuration?.interfaces ?? [];
      const selected =
        interfaces.find((candidate) => candidate.alternate.interfaceClass === 0x03 && candidate.interfaceNumber === 0) ??
        interfaces.find((candidate) => candidate.alternate.interfaceClass === 0x03);
      if (!selected) throw new CommunicationError("USB 设备没有 HID 接口");
      this.interfaceNumber = selected.interfaceNumber;
      await this.device.claimInterface(selected.interfaceNumber);
      const endpoints = selected.alternate.endpoints;
      this.endpointIn = endpoints.find((endpoint) => endpoint.direction === "in")?.endpointNumber;
      const output = endpoints.find((endpoint) => endpoint.direction === "out");
      this.endpointOut = output?.endpointNumber;
      this.packetSize = endpoints.find((endpoint) => endpoint.direction === "in")?.packetSize ?? HID_REPORT_SIZE;
      if (this.endpointIn === undefined) throw new CommunicationError("USB HID 接口没有输入端点");
    } catch (error) {
      await this.disconnect();
      throw new CommunicationError(
        `WebUSB 无法占用 HID 接口，可改用 WebHID：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async disconnect(): Promise<void> {
    this.queue.clear();
    if (this.device.opened && this.interfaceNumber !== undefined) {
      try {
        await this.device.releaseInterface(this.interfaceNumber);
      } catch {
        // The interface may already have been released by the operating system.
      }
    }
    if (this.device.opened) await this.device.close();
    this.interfaceNumber = this.endpointIn = this.endpointOut = undefined;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.connected || this.interfaceNumber === undefined) {
      throw new CommunicationError("WebUSB 尚未连接");
    }
    for (const report of hidReports(data)) {
      const reportBuffer = report.slice().buffer as ArrayBuffer;
      if (this.endpointOut !== undefined) {
        const result = await this.device.transferOut(this.endpointOut, reportBuffer);
        if (result.status !== "ok") throw new CommunicationError(`WebUSB 写入失败：${result.status}`);
      } else {
        const result = await this.device.controlTransferOut(
          {
            requestType: "class",
            recipient: "interface",
            request: 0x09,
            value: 0x0200,
            index: this.interfaceNumber,
          },
          reportBuffer,
        );
        if (result.status !== "ok") throw new CommunicationError(`WebUSB HID SET_REPORT 失败：${result.status}`);
      }
    }
  }

  async read(size = 512, timeoutMs = 2000): Promise<Uint8Array> {
    if (!this.connected || this.endpointIn === undefined) {
      throw new CommunicationError("WebUSB 尚未连接");
    }
    try {
      return await this.queue.read(size, 1);
    } catch (error) {
      if (!(error instanceof TimeoutError)) throw error;
    }
    const result = await withTimeout(this.device.transferIn(this.endpointIn, this.packetSize), timeoutMs);
    if (result.status !== "ok" || !result.data) {
      throw new CommunicationError(`WebUSB 读取失败：${result.status}`);
    }
    const report = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);
    this.queue.push(report.slice(Math.min(1, report.length)));
    return this.queue.read(size, timeoutMs);
  }
}
