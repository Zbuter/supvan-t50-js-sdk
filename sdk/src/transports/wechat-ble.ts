import { BLE_UUIDS } from "../constants";
import { CapabilityError, CommunicationError } from "../errors";
import { sleep } from "../utils/bytes";
import { AsyncByteQueue, type PrinterTransport } from "./transport";

interface WxFailure {
  errMsg?: string;
}

interface WxCallbacks<T = Record<string, never>> {
  success?: (result: T) => void;
  fail?: (error: WxFailure) => void;
}

export interface WxBleDevice {
  deviceId: string;
  name?: string;
  localName?: string;
  RSSI?: number;
}

interface WxService {
  uuid: string;
  isPrimary?: boolean;
}

interface WxCharacteristic {
  uuid: string;
  properties?: { notify?: boolean; indicate?: boolean; write?: boolean; writeNoResponse?: boolean };
}

interface WxDeviceFoundEvent {
  devices: WxBleDevice[];
}

interface WxValueChangedEvent {
  deviceId: string;
  serviceId: string;
  characteristicId: string;
  value: ArrayBuffer;
}

export interface WxBleApi {
  openBluetoothAdapter(options: WxCallbacks): void;
  closeBluetoothAdapter?(options: WxCallbacks): void;
  startBluetoothDevicesDiscovery(options: WxCallbacks & { allowDuplicatesKey?: boolean }): void;
  stopBluetoothDevicesDiscovery(options: WxCallbacks): void;
  getBluetoothDevices(options: WxCallbacks<{ devices: WxBleDevice[] }>): void;
  onBluetoothDeviceFound(listener: (event: WxDeviceFoundEvent) => void): void;
  offBluetoothDeviceFound?(listener: (event: WxDeviceFoundEvent) => void): void;
  createBLEConnection(options: WxCallbacks & { deviceId: string; timeout?: number }): void;
  closeBLEConnection(options: WxCallbacks & { deviceId: string }): void;
  getBLEDeviceServices(options: WxCallbacks<{ services: WxService[] }> & { deviceId: string }): void;
  getBLEDeviceCharacteristics(
    options: WxCallbacks<{ characteristics: WxCharacteristic[] }> & { deviceId: string; serviceId: string },
  ): void;
  notifyBLECharacteristicValueChange(
    options: WxCallbacks & { state: boolean; deviceId: string; serviceId: string; characteristicId: string },
  ): void;
  onBLECharacteristicValueChange(listener: (event: WxValueChangedEvent) => void): void;
  offBLECharacteristicValueChange?(listener: (event: WxValueChangedEvent) => void): void;
  writeBLECharacteristicValue(
    options: WxCallbacks & {
      deviceId: string;
      serviceId: string;
      characteristicId: string;
      value: ArrayBuffer;
      writeType?: "write" | "writeNoResponse";
    },
  ): void;
}

declare const wx: WxBleApi | undefined;

function defaultWxApi(): WxBleApi {
  const api = typeof wx === "undefined" ? undefined : wx;
  if (!api) throw new CapabilityError("当前运行时没有微信小程序 wx 蓝牙 API");
  return api;
}

function wxCall<T>(invoke: (callbacks: WxCallbacks<T>) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    invoke({
      success: resolve,
      fail: (error) => reject(new CommunicationError(error.errMsg || "微信 BLE 调用失败")),
    });
  });
}

function normalizedUuid(uuid: string): string {
  return uuid.toLowerCase().replace(/-/g, "");
}

function matchesUuid(actual: string, expected: string): boolean {
  const left = normalizedUuid(actual);
  const right = normalizedUuid(expected);
  return left === right || left.includes(right.slice(4, 8));
}

export interface WechatBleOptions {
  chunkSize?: number;
  chunkDelayMs?: number;
  timeoutMs?: number;
}

export class WechatBleTransport implements PrinterTransport {
  readonly kind = "ble" as const;
  readonly bulkAckRequired = false;
  readonly separatePhysicalPages = true;
  private readonly queue = new AsyncByteQueue();
  private readonly chunkSize: number;
  private readonly chunkDelayMs: number;
  private readonly timeoutMs: number;
  private serviceId: string = BLE_UUIDS.service;
  private writeId: string = BLE_UUIDS.write;
  private notifyId: string = BLE_UUIDS.notify;
  private bulkNotifyId?: string;
  private isConnected = false;

  constructor(
    readonly device: WxBleDevice,
    private readonly api: WxBleApi = defaultWxApi(),
    options: WechatBleOptions = {},
  ) {
    this.chunkSize = options.chunkSize ?? 20;
    this.chunkDelayMs = options.chunkDelayMs ?? 10;
    this.timeoutMs = options.timeoutMs ?? 10000;
  }

  static async discover(
    namePrefix = "T0",
    scanMs = 5000,
    api: WxBleApi = defaultWxApi(),
  ): Promise<WxBleDevice[]> {
    await wxCall((callbacks) => api.openBluetoothAdapter(callbacks));
    const found = new Map<string, WxBleDevice>();
    const listener = ({ devices }: WxDeviceFoundEvent): void => {
      for (const device of devices) {
        const name = device.name || device.localName || "";
        if (name.toUpperCase().startsWith(namePrefix.toUpperCase())) found.set(device.deviceId, device);
      }
    };
    api.onBluetoothDeviceFound(listener);
    await wxCall((callbacks) =>
      api.startBluetoothDevicesDiscovery({ ...callbacks, allowDuplicatesKey: false }),
    );
    await sleep(scanMs);
    await wxCall((callbacks) => api.stopBluetoothDevicesDiscovery(callbacks));
    const current = await wxCall<{ devices: WxBleDevice[] }>((callbacks) =>
      api.getBluetoothDevices(callbacks),
    );
    listener(current);
    api.offBluetoothDeviceFound?.(listener);
    return Array.from(found.values()).sort((left, right) => (right.RSSI ?? -999) - (left.RSSI ?? -999));
  }

  static async request(
    namePrefix = "T0",
    options: WechatBleOptions = {},
    api: WxBleApi = defaultWxApi(),
  ): Promise<WechatBleTransport> {
    const devices = await WechatBleTransport.discover(namePrefix, options.timeoutMs ?? 5000, api);
    const device = devices[0];
    if (!device) throw new CapabilityError(`未发现名称以 ${namePrefix} 开头的 BLE 打印机`);
    return new WechatBleTransport(device, api, options);
  }

  get name(): string {
    return this.device.name || this.device.localName || "硕方小程序 BLE 打印机";
  }

  get connected(): boolean {
    return this.isConnected;
  }

  private readonly onValueChanged = (event: WxValueChangedEvent): void => {
    if (event.deviceId !== this.device.deviceId || !event.value) return;
    if (this.bulkNotifyId && matchesUuid(event.characteristicId, this.bulkNotifyId)) return;
    this.queue.push(new Uint8Array(event.value).slice());
  };

  async connect(): Promise<void> {
    if (this.isConnected) return;
    await wxCall((callbacks) => this.api.openBluetoothAdapter(callbacks));
    await wxCall((callbacks) =>
      this.api.createBLEConnection({ ...callbacks, deviceId: this.device.deviceId, timeout: this.timeoutMs }),
    );
    try {
      const { services } = await wxCall<{ services: WxService[] }>((callbacks) =>
        this.api.getBLEDeviceServices({ ...callbacks, deviceId: this.device.deviceId }),
      );
      const service = services.find((candidate) => matchesUuid(candidate.uuid, BLE_UUIDS.service));
      if (!service) throw new CommunicationError("设备未提供硕方 E0FF BLE 服务");
      this.serviceId = service.uuid;
      const { characteristics } = await wxCall<{ characteristics: WxCharacteristic[] }>((callbacks) =>
        this.api.getBLEDeviceCharacteristics({
          ...callbacks,
          deviceId: this.device.deviceId,
          serviceId: this.serviceId,
        }),
      );
      this.writeId = characteristics.find((item) => matchesUuid(item.uuid, BLE_UUIDS.write))?.uuid ?? BLE_UUIDS.write;
      this.notifyId = characteristics.find((item) => matchesUuid(item.uuid, BLE_UUIDS.notify))?.uuid ?? BLE_UUIDS.notify;
      this.bulkNotifyId = characteristics.find((item) => matchesUuid(item.uuid, BLE_UUIDS.bulkNotify))?.uuid;
      this.api.onBLECharacteristicValueChange(this.onValueChanged);
      await this.setNotify(this.notifyId, true);
      if (this.bulkNotifyId) {
        try {
          await this.setNotify(this.bulkNotifyId, true);
        } catch {
          this.bulkNotifyId = undefined;
        }
      }
      this.isConnected = true;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  private async setNotify(characteristicId: string, state: boolean): Promise<void> {
    await wxCall((callbacks) =>
      this.api.notifyBLECharacteristicValueChange({
        ...callbacks,
        state,
        deviceId: this.device.deviceId,
        serviceId: this.serviceId,
        characteristicId,
      }),
    );
  }

  async disconnect(): Promise<void> {
    this.api.offBLECharacteristicValueChange?.(this.onValueChanged);
    this.queue.clear();
    if (this.isConnected) {
      try {
        await wxCall((callbacks) =>
          this.api.closeBLEConnection({ ...callbacks, deviceId: this.device.deviceId }),
        );
      } catch {
        // A dropped radio connection is already disconnected from our perspective.
      }
    }
    this.isConnected = false;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.isConnected) throw new CommunicationError("微信 BLE 尚未连接");
    const characteristicId = data.length === 512 ? this.notifyId : this.writeId;
    for (let offset = 0; offset < data.length; offset += this.chunkSize) {
      const chunk = data.slice(offset, offset + this.chunkSize);
      await wxCall((callbacks) =>
        this.api.writeBLECharacteristicValue({
          ...callbacks,
          deviceId: this.device.deviceId,
          serviceId: this.serviceId,
          characteristicId,
          value: chunk.buffer,
          writeType: "writeNoResponse",
        }),
      );
      if (offset + this.chunkSize < data.length && this.chunkDelayMs > 0) {
        await sleep(this.chunkDelayMs);
      }
    }
  }

  async read(size = 512, timeoutMs = 2000): Promise<Uint8Array> {
    if (!this.isConnected) throw new CommunicationError("微信 BLE 尚未连接");
    return this.queue.read(size, timeoutMs);
  }
}
