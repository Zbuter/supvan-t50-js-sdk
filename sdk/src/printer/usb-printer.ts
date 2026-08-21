import { HID_INPUT_PAYLOAD_SIZE, USB_COMMANDS } from "../constants";
import { CommunicationError, DeviceError, TimeoutError } from "../errors";
import { normalizePrinterProfile, SUPVAN_T50_PROFILE, type PrinterProfile, type PrinterProfileInput } from "../protocol/profile";
import { parseLabelBoxData } from "../protocol/ble";
import {
  buildMediaConfig,
  buildVendorRequest,
  parseUsbStatus,
  selectUsbTransferBlock,
  usbImageFrames,
} from "../protocol/usb";
import type { PrinterTransport } from "../transports/transport";
import {
  expandPrintPages,
  resolvePrintSettings,
  PrinterState,
  type LabelBoxInfo,
  type PrintJob,
  type PrinterStatus,
} from "../types";
import { concatBytes, sleep } from "../utils/bytes";
import type { TimeoutOptions } from "../timeouts";

export interface UsbPrinterOptions {
  timeouts?: Pick<TimeoutOptions, "readTimeoutMs" | "printTimeoutMs">;
  autoReadLabelBox?: boolean;
  /** @deprecated Use timeouts.printTimeoutMs. */
  timeoutMs?: number;
  /** @deprecated Use timeouts.readTimeoutMs. */
  ioTimeoutMs?: number;
  pollIntervalMs?: number;
  profile?: PrinterProfileInput;
}

export class UsbPrinter {
  private readonly timeoutMs: number;
  private readonly ioTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly profile: PrinterProfile;
  private readonly autoReadLabelBox: boolean;
  private totalPages = 0;

  constructor(
    readonly transport: PrinterTransport,
    options: UsbPrinterOptions = {},
  ) {
    if (transport.kind !== "usb") throw new TypeError("UsbPrinter 需要 USB transport");
    this.timeoutMs = options.timeouts?.printTimeoutMs ?? options.timeoutMs ?? 120000;
    this.ioTimeoutMs = options.timeouts?.readTimeoutMs ?? options.ioTimeoutMs ?? 2000;
    this.pollIntervalMs = options.pollIntervalMs ?? 50;
    this.profile = normalizePrinterProfile(options.profile ?? SUPVAN_T50_PROFILE);
    this.autoReadLabelBox = options.autoReadLabelBox ?? true;
  }

  get connected(): boolean {
    return this.transport.connected;
  }

  async connect(): Promise<void> {
    await this.transport.connect();
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }

  private async readPayload(length: number, timeoutMs = this.ioTimeoutMs): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < length && Date.now() < deadline) {
      try {
        // WebHID removes the protocol prefix before queuing data, leaving 63
        // bytes per 64-byte input report. Consume that whole payload so its
        // padding cannot become the next command's response.
        const readSize = Math.max(length - received, HID_INPUT_PAYLOAD_SIZE);
        const chunk = await this.transport.read(readSize, Math.max(1, deadline - Date.now()));
        chunks.push(chunk);
        received += chunk.length;
      } catch (error) {
        if (error instanceof TimeoutError) break;
        throw error;
      }
    }
    if (received < length) throw new CommunicationError(`USB 短读：${received}/${length}`);
    return concatBytes(chunks).slice(0, length);
  }

  private async command(
    command: number,
    value1 = 0,
    value2?: number,
    responseLength = 8,
  ): Promise<Uint8Array> {
    if (!this.connected) throw new CommunicationError("USB 打印机尚未连接");
    await this.transport.write(buildVendorRequest(command, value1, value2));
    return this.readPayload(responseLength);
  }

  private async commandStatus(command: number, value1 = 0, value2?: number): Promise<PrinterStatus> {
    return parseUsbStatus(await this.command(command, value1, value2), this.totalPages);
  }

  private assertNoFatal(status: PrinterStatus): void {
    if (status.state !== PrinterState.Ready && status.state !== PrinterState.BatteryLow) {
      throw new DeviceError(status.errorMessage || status.description);
    }
  }

  async getStatus(): Promise<PrinterStatus> {
    return this.commandStatus(USB_COMMANDS.inquiryStatus);
  }

  async readLabelBox(): Promise<LabelBoxInfo> {
    return parseLabelBoxData(await this.command(USB_COMMANDS.returnMaterial, 0, undefined, 57));
  }

  async stop(): Promise<boolean> {
    let status = await this.getStatus();
    if (!status.flags.printing) return true;
    await this.commandStatus(USB_COMMANDS.stopPrint);
    const deadline = Date.now() + Math.min(this.timeoutMs, 6000);
    while (Date.now() < deadline) {
      await sleep(Math.max(this.pollIntervalMs, 20));
      status = await this.getStatus();
      if (!status.flags.printing) return true;
    }
    return false;
  }

  private async waitCommandReady(deadline: number): Promise<PrinterStatus> {
    while (Date.now() < deadline) {
      const status = await this.getStatus();
      this.assertNoFatal(status);
      if (!status.flags.busy) return status;
      await sleep(Math.max(this.pollIntervalMs, 10));
    }
    throw new CommunicationError("等待 USB 设备检测命令超时");
  }

  async print(job: PrintJob): Promise<void> {
    const missingMedia =
      job.settings?.materialWidth === undefined ||
      job.settings?.materialHeight === undefined ||
      job.settings?.gap === undefined;
    const labelBox = missingMedia && this.autoReadLabelBox ? await this.readLabelBox() : undefined;
    const settings = resolvePrintSettings(job.settings, labelBox, this.profile);
    const pages = expandPrintPages({ ...job, settings });
    this.totalPages = pages.length;
    const frames = pages.flatMap((page, index) => usbImageFrames(page, settings, index === pages.length - 1));
    const deadline = Date.now() + this.timeoutMs;

    const media = buildMediaConfig(settings);
    await this.command(USB_COMMANDS.setMedia, media.length);
    await this.transport.write(media);
    await this.readPayload(4);

    await this.commandStatus(USB_COMMANDS.checkDevice);
    let status = await this.waitCommandReady(deadline);
    this.assertNoFatal(status);
    if (status.flags.printing) throw new DeviceError("打印机正在执行其他任务");

    status = await this.commandStatus(USB_COMMANDS.startPrint, 1);
    this.assertNoFatal(status);
    let frameIndex = 0;
    while (frameIndex < frames.length) {
      if (Date.now() >= deadline) {
        await this.stop();
        throw new CommunicationError("USB 图像传输超时");
      }
      if (status.flags.bufferFull) {
        await sleep(Math.max(this.pollIntervalMs, 5));
        status = await this.getStatus();
        this.assertNoFatal(status);
        if (!status.flags.printing) throw new DeviceError("打印任务在传输完成前终止");
        continue;
      }
      const block = selectUsbTransferBlock(frames.slice(frameIndex));
      await this.command(USB_COMMANDS.transferData, block.data.length);
      await this.transport.write(block.data);
      await this.readPayload(4);
      status = await this.commandStatus(USB_COMMANDS.bufferFull, block.data.length, settings.speed);
      this.assertNoFatal(status);
      frameIndex += block.frameCount;
    }

    const startGrace = Math.min(deadline, Date.now() + 3000);
    let observedPrinting = status.flags.printing;
    while (Date.now() < deadline) {
      await sleep(Math.max(this.pollIntervalMs, 10));
      status = await this.getStatus();
      this.assertNoFatal(status);
      observedPrinting ||= status.flags.printing;
      if (status.metrics.printedPages >= this.totalPages) return;
      if (!status.flags.printing) {
        if (!observedPrinting && Date.now() < startGrace) continue;
        throw new DeviceError(`USB 打印任务提前结束：${status.metrics.printedPages}/${this.totalPages} 页`);
      }
    }
    await this.stop();
    throw new CommunicationError("等待 USB 打印完成超时");
  }
}
