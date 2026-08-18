import { TimeoutError } from "../errors";
import { sleep } from "../utils/bytes";

export type TransportKind = "ble" | "usb";

export interface PrinterTransport {
  readonly kind: TransportKind;
  readonly name: string;
  readonly connected: boolean;
  readonly bulkAckRequired?: boolean;
  readonly bulkAckOptional?: boolean;
  readonly separatePhysicalPages?: boolean;
  readonly printCompletionOnSubmit?: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Writes one logical protocol payload. Transport-specific chunking happens inside. */
  write(data: Uint8Array): Promise<void>;
  /** Returns up to size bytes after at least one byte is available. */
  read(size?: number, timeoutMs?: number): Promise<Uint8Array>;
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
