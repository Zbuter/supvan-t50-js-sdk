import { BLE_UUIDS } from "../constants";
import { CapabilityError, CommunicationError } from "../errors";
import { sleep } from "../utils/bytes";
import { AsyncByteQueue, type PrinterTransport } from "./transport";

interface BluetoothCharacteristicLike extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BluetoothCharacteristicLike>;
  writeValueWithoutResponse?(value: BufferSource): Promise<void>;
  writeValue(value: BufferSource): Promise<void>;
}

interface BluetoothServiceLike {
  getCharacteristic(uuid: string): Promise<BluetoothCharacteristicLike>;
}

interface BluetoothServerLike {
  readonly connected: boolean;
  connect(): Promise<BluetoothServerLike>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothServiceLike>;
}

interface BluetoothDeviceLike extends EventTarget {
  readonly name?: string;
  readonly gatt?: BluetoothServerLike;
}

interface BluetoothApiLike {
  requestDevice(options: {
    filters: Array<{ namePrefix: string }>;
    optionalServices: string[];
  }): Promise<BluetoothDeviceLike>;
}

function bluetoothApi(): BluetoothApiLike {
  const api = (navigator as Navigator & { bluetooth?: BluetoothApiLike }).bluetooth;
  if (!api || !globalThis.isSecureContext) {
    throw new CapabilityError("Web Bluetooth 需要 Chromium 内核浏览器和 HTTPS/localhost");
  }
  return api;
}

export interface WebBluetoothOptions {
  chunkSize?: number;
  chunkDelayMs?: number;
}

export class WebBluetoothTransport implements PrinterTransport {
  readonly kind = "ble" as const;
  readonly capabilities = {
    bulkAck: "none",
    pageSubmission: "separate",
    completion: "device-confirmed",
  } as const;
  /** @deprecated Use capabilities.bulkAck. */
  readonly bulkAckRequired = false;
  /** @deprecated Use capabilities.pageSubmission. */
  readonly separatePhysicalPages = true;
  private readonly queue = new AsyncByteQueue();
  private readonly chunkSize: number;
  private readonly chunkDelayMs: number;
  private server?: BluetoothServerLike;
  private control?: BluetoothCharacteristicLike;
  private bulk?: BluetoothCharacteristicLike;
  private notify?: BluetoothCharacteristicLike;
  private bulkNotify?: BluetoothCharacteristicLike;

  constructor(
    private readonly device: BluetoothDeviceLike,
    options: WebBluetoothOptions = {},
  ) {
    this.chunkSize = options.chunkSize ?? 20;
    this.chunkDelayMs = options.chunkDelayMs ?? 10;
  }

  static async request(
    namePrefix = "T0",
    options: WebBluetoothOptions = {},
  ): Promise<WebBluetoothTransport> {
    const device = await bluetoothApi().requestDevice({
      filters: [{ namePrefix }],
      optionalServices: [BLE_UUIDS.service],
    });
    return new WebBluetoothTransport(device, options);
  }

  get name(): string {
    return this.device.name || "硕方 BLE 打印机";
  }

  get connected(): boolean {
    return Boolean(this.server?.connected);
  }

  private readonly onNotification = (event: Event): void => {
    const characteristic = event.target as BluetoothCharacteristicLike;
    // FFEA carries optional per-packet bulk acknowledgements. This transport
    // does not wait for them, so keep them out of the control response queue.
    if (this.bulkNotify && characteristic === this.bulkNotify && characteristic !== this.notify) return;
    if (!characteristic.value) return;
    const view = characteristic.value;
    this.queue.push(new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice());
  };

  async connect(): Promise<void> {
    if (this.connected) return;
    if (!this.device.gatt) throw new CommunicationError("BLE 设备没有 GATT 服务");
    try {
      this.server = await this.device.gatt.connect();
      const service = await this.server.getPrimaryService(BLE_UUIDS.service);
      this.control = await service.getCharacteristic(BLE_UUIDS.write);
      this.notify = await service.getCharacteristic(BLE_UUIDS.notify);
      this.bulk = this.notify;
      await this.notify.startNotifications();
      this.notify.addEventListener("characteristicvaluechanged", this.onNotification);
      try {
        this.bulkNotify = await service.getCharacteristic(BLE_UUIDS.bulkNotify);
        await this.bulkNotify.startNotifications();
        this.bulkNotify.addEventListener("characteristicvaluechanged", this.onNotification);
      } catch {
        this.bulkNotify = undefined;
      }
    } catch (error) {
      await this.disconnect();
      throw new CommunicationError(`BLE 连接失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async disconnect(): Promise<void> {
    this.notify?.removeEventListener("characteristicvaluechanged", this.onNotification);
    this.bulkNotify?.removeEventListener("characteristicvaluechanged", this.onNotification);
    this.server?.disconnect();
    this.server = this.control = this.bulk = this.notify = this.bulkNotify = undefined;
    this.queue.clear();
  }

  async write(data: Uint8Array): Promise<void> {
    const target = data.length === 512 ? this.bulk : this.control;
    if (!target || !this.connected) throw new CommunicationError("BLE 尚未连接");
    for (let offset = 0; offset < data.length; offset += this.chunkSize) {
      const chunk = data.slice(offset, offset + this.chunkSize);
      if (target.writeValueWithoutResponse) await target.writeValueWithoutResponse(chunk);
      else await target.writeValue(chunk);
      if (offset + this.chunkSize < data.length && this.chunkDelayMs > 0) {
        await sleep(this.chunkDelayMs);
      }
    }
  }

  async read(size = 512, timeoutMs = 2000): Promise<Uint8Array> {
    if (!this.connected) throw new CommunicationError("BLE 尚未连接");
    return this.queue.read(size, timeoutMs);
  }
}
