import { TimeoutError } from "../errors";
import { sleep } from "../utils/bytes";

export type TransportKind = "ble" | "usb";

export type BulkAckMode = "required" | "optional" | "none";
export type PageSubmissionMode = "separate" | "batched";
export type CompletionMode = "device-confirmed" | "submit-confirmed";

export interface TransportCapabilities {
  bulkAck: BulkAckMode;
  pageSubmission: PageSubmissionMode;
  completion: CompletionMode;
}

export interface PrinterTransport {
  readonly kind: TransportKind;
  readonly name: string;
  readonly connected: boolean;
  readonly capabilities?: TransportCapabilities;
  /** @deprecated Use capabilities.bulkAck. */
  readonly bulkAckRequired?: boolean;
  /** @deprecated Use capabilities.bulkAck. */
  readonly bulkAckOptional?: boolean;
  /** @deprecated Use capabilities.pageSubmission. */
  readonly separatePhysicalPages?: boolean;
  /** @deprecated Use capabilities.completion. */
  readonly printCompletionOnSubmit?: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Writes one logical protocol payload. Transport-specific chunking happens inside. */
  write(data: Uint8Array): Promise<void>;
  /** Returns up to size bytes after at least one byte is available. */
  read(size?: number, timeoutMs?: number): Promise<Uint8Array>;
}

export function getTransportCapabilities(transport: PrinterTransport): TransportCapabilities {
  if (transport.capabilities) return transport.capabilities;
  if (transport.bulkAckRequired && transport.bulkAckOptional) {
    throw new TypeError("PrinterTransport 不能同时要求或允许 bulk ACK");
  }
  return {
    bulkAck: transport.bulkAckRequired ? "required" : transport.bulkAckOptional ? "optional" : "none",
    pageSubmission: transport.separatePhysicalPages ? "separate" : "batched",
    completion: transport.printCompletionOnSubmit ? "submit-confirmed" : "device-confirmed",
  };
}

export async function writeChunked(
  write: (data: Uint8Array) => Promise<void>,
  data: Uint8Array,
  chunkSize: number,
  delayMs = 0,
): Promise<void> {
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    await write(data.slice(offset, offset + chunkSize));
    if (delayMs > 0 && offset + chunkSize < data.length) await sleep(delayMs);
  }
}

export class AsyncByteQueue {
  private buffer = new Uint8Array();
  private listeners = new Set<() => void>();

  push(data: Uint8Array): void {
    if (data.length === 0) return;
    const next = new Uint8Array(this.buffer.length + data.length);
    next.set(this.buffer);
    next.set(data, this.buffer.length);
    this.buffer = next;
    for (const listener of this.listeners) listener();
    this.listeners.clear();
  }

  clear(): void {
    this.buffer = new Uint8Array();
    for (const listener of this.listeners) listener();
    this.listeners.clear();
  }

  async read(size = 512, timeoutMs = 2000): Promise<Uint8Array> {
    if (this.buffer.length === 0) {
      await new Promise<void>((resolve, reject) => {
        const onData = (): void => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          this.listeners.delete(onData);
          reject(new TimeoutError("等待设备数据超时"));
        }, timeoutMs);
        this.listeners.add(onData);
      });
    }
    const length = Math.min(Math.max(1, size), this.buffer.length);
    const result = this.buffer.slice(0, length);
    this.buffer = this.buffer.slice(length);
    return result;
  }
}
