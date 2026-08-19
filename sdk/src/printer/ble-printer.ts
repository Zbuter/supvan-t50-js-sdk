import { CommunicationError, DeviceError, TimeoutError } from "../errors";
import {
  bleImageFrames,
  buildR1,
  buildR2,
  bulkPackets,
  compressedBleBatches,
  parseBleLabelBox,
  parseBleResponse,
  parseBleStatus,
} from "../protocol/ble";
import type { PrinterTransport } from "../transports/transport";
import { SUPVAN_T50_PROFILE, type PrinterProfile } from "../protocol/profile";
import {
  expandPrintPages,
  resolvePrintSettings,
  type LabelBoxInfo,
  type PrintJob,
  type PrinterStatus,
  type RasterPage,
  type ResolvedPrintSettings,
} from "../types";
import { concatBytes, sleep } from "../utils/bytes";

export interface BlePrinterOptions {
  commandTimeoutMs?: number;
  printTimeoutMs?: number;
  profile?: PrinterProfile;
}

export class BlePrinter {
  private readonly commandTimeoutMs: number;
  private readonly printTimeoutMs: number;
  private readonly profile: PrinterProfile;

  constructor(
    readonly transport: PrinterTransport,
    options: BlePrinterOptions = {},
  ) {
    if (transport.kind !== "ble") throw new TypeError("BlePrinter 需要 BLE transport");
    this.commandTimeoutMs = options.commandTimeoutMs ?? 3000;
    this.printTimeoutMs = options.printTimeoutMs ?? 120000;
    this.profile = options.profile ?? SUPVAN_T50_PROFILE;
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

  private async readFrame(timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    const chunks: Uint8Array[] = [];
    let length = 0;
    let total: number | undefined;
    while (Date.now() < deadline) {
      try {
        const part = await this.transport.read(512, Math.max(1, deadline - Date.now()));
        chunks.push(part);
        length += part.length;
        const data = concatBytes(chunks);
        if (total === undefined && data.length >= 4) total = (data[2] ?? 0) + ((data[3] ?? 0) << 8) + 4;
        if (total !== undefined && length >= total) return data.slice(0, total);
      } catch (error) {
        if (error instanceof TimeoutError) break;
        throw error;
      }
    }
    throw new CommunicationError(`等待 BLE 响应超时，已收到 ${length} 字节`);
  }

  private async exchange(command: Uint8Array, expectedCommand: number, timeoutMs = this.commandTimeoutMs): Promise<Uint8Array> {
    if (!this.connected) throw new CommunicationError("打印机尚未连接");
    await this.transport.write(command);
    return parseBleResponse(await this.readFrame(timeoutMs), expectedCommand);
  }

  async getStatus(timeoutMs = this.commandTimeoutMs): Promise<PrinterStatus> {
    return parseBleStatus(await this.exchange(buildR1(0x11), 0x11, timeoutMs));
  }

  async readLabelBox(timeoutMs = this.commandTimeoutMs): Promise<LabelBoxInfo> {
    return parseBleLabelBox(await this.exchange(buildR1(0x30), 0x30, timeoutMs));
  }

  async stop(): Promise<void> {
    await this.exchange(buildR1(0x14), 0x14);
  }

  private async sendCompressed(data: Uint8Array): Promise<void> {
    const packets = bulkPackets(data);
    await this.exchange(buildR2(0x5c, 512, packets.length), 0x5c);
    for (const packet of packets) {
      await this.transport.write(packet);
      if (this.transport.bulkAckRequired) {
        parseBleResponse(await this.readFrame(this.commandTimeoutMs), 0xbb);
      }
    }
    await this.exchange(buildR1(0x10, 0), 0x10, Math.max(this.commandTimeoutMs, 5000));
  }

  private async waitFor(
    predicate: (status: PrinterStatus) => boolean,
    timeoutMs: number,
    description: string,
  ): Promise<PrinterStatus> {
    const deadline = Date.now() + timeoutMs;
    let last: PrinterStatus | undefined;
    while (Date.now() < deadline) {
      last = await this.getStatus(Math.max(100, deadline - Date.now()));
      if (last.state !== 0 && last.state !== 8) {
        throw new DeviceError(last.errorMessage || last.description);
      }
      if (predicate(last)) return last;
      await sleep(100);
    }
    throw new CommunicationError(`等待${description}超时；最后状态：${last?.description ?? "无响应"}`);
  }

  private async printOnce(pages: RasterPage[], settings: ResolvedPrintSettings): Promise<void> {
    const initial = await this.getStatus();
    if (!initial.ready) throw new DeviceError(initial.errorMessage || initial.description);
    const pageBatches = pages.map((page, index) =>
      compressedBleBatches(bleImageFrames(page, settings, index === pages.length - 1)),
    );
    await this.exchange(buildR1(0x13), 0x13);
    const afterStart = await this.getStatus();
    if (!afterStart.ready && !afterStart.printing && !afterStart.busy) {
      throw new DeviceError(afterStart.errorMessage || afterStart.description);
    }
    let firstBatch = true;
    for (const batches of pageBatches) {
      for (const batch of batches) {
        if (!firstBatch) await this.waitFor((status) => !status.bufferFull, 10000, "打印缓冲区就绪");
        await this.sendCompressed(batch.data);
        firstBatch = false;
      }
    }
    if (this.transport.printCompletionOnSubmit) return;
    const deadline = Date.now() + this.printTimeoutMs;
    let observedPrinting = false;
    let last = initial;
    while (Date.now() < deadline) {
      last = await this.getStatus(Math.max(100, deadline - Date.now()));
      if (last.state !== 0 && last.state !== 8 && !last.printing && !last.busy) {
        throw new DeviceError(last.description);
      }
      observedPrinting ||= last.printing || last.busy;
      if (last.printedPages > initial.printedPages && !last.printing && !last.busy) return;
      if (observedPrinting && !last.printing && !last.busy) return;
      await sleep(100);
    }
    throw new CommunicationError(`等待 BLE 实际出纸超时；最后页计数 ${last.printedPages}`);
  }

  async print(job: PrintJob): Promise<void> {
    const missingMedia =
      job.settings?.materialWidth === undefined ||
      job.settings?.materialHeight === undefined ||
      job.settings?.gap === undefined;
    const labelBox = missingMedia ? await this.readLabelBox() : undefined;
    const settings = resolvePrintSettings(job.settings, labelBox, this.profile);
    const pages = expandPrintPages({ ...job, settings });
    if (this.transport.separatePhysicalPages && pages.length > 1) {
      for (const page of pages) await this.printOnce([page], settings);
      return;
    }
    await this.printOnce(pages, settings);
  }
}
