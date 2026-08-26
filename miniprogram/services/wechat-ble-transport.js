const SERVICE_UUID = "0000e0ff-3c17-d293-8e48-14fe2e4da212";
const CONTROL_UUID = "0000ffe9-0000-1000-8000-00805f9b34fb";
const DATA_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";
const BULK_NOTIFY_UUID = "0000ffea-0000-1000-8000-00805f9b34fb";

let adapterOpen = false;

function normalizeUuid(value) {
  return String(value || "").toLowerCase();
}

function callWx(name, options = {}) {
  return new Promise((resolve, reject) => {
    wx[name]({ ...options, success: resolve, fail: reject });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error, fallback) {
  if (!error) return fallback;
  const code = error.errCode === undefined ? "" : `（${error.errCode}）`;
  return `${error.errMsg || fallback}${code}`;
}

async function ensureBluetoothAdapter() {
  if (adapterOpen) return;
  try {
    await callWx("openBluetoothAdapter", { mode: "central" });
    adapterOpen = true;
  } catch (error) {
    if (error && error.errCode === 10001) throw new Error("请先打开手机蓝牙");
    throw new Error(errorMessage(error, "无法初始化蓝牙"));
  }
}

function printerDeviceName(device = {}) {
  return [device.name, device.localName]
    .map((value) => String(value || "").trim())
    .find((value) => /^T0/i.test(value)) || "";
}

function matchesPrinterPrefix(device) {
  return Boolean(printerDeviceName(device));
}

function isBulkTransfer(data) {
  return data.length === 512
    && data[0] === 0x7e
    && data[1] === 0x5a
    && data[2] === 0xfc
    && data[3] === 0x01
    && data[4] === 0x10
    && data[5] === 0x02;
}

class ByteQueue {
  constructor() {
    this.buffer = new Uint8Array();
    this.waiters = [];
  }

  push(value) {
    const incoming = value instanceof Uint8Array ? value : new Uint8Array(value);
    const next = new Uint8Array(this.buffer.length + incoming.length);
    next.set(this.buffer);
    next.set(incoming, this.buffer.length);
    this.buffer = next;
    this.waiters.splice(0).forEach((resolve) => resolve());
  }

  clear() {
    this.buffer = new Uint8Array();
  }

  async read(size = 512, timeoutMs = 2000) {
    if (!this.buffer.length) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = this.waiters.indexOf(onData);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error("等待打印机响应超时"));
        }, timeoutMs);
        const onData = () => {
          clearTimeout(timer);
          resolve();
        };
        this.waiters.push(onData);
      });
    }
    const length = Math.min(Math.max(1, size), this.buffer.length);
    const result = this.buffer.slice(0, length);
    this.buffer = this.buffer.slice(length);
    return result;
  }
}

async function startDeviceDiscovery(onDevices) {
  await ensureBluetoothAdapter();
  try { await callWx("stopBluetoothDevicesDiscovery"); } catch (_error) {}
  const devices = new Map();
  const emit = () => {
    const values = Array.from(devices.values())
      .filter(matchesPrinterPrefix)
      .sort((left, right) => (right.RSSI || -999) - (left.RSSI || -999))
      .map((device) => ({
        deviceId: device.deviceId,
        name: printerDeviceName(device),
        RSSI: device.RSSI,
      }));
    onDevices(values);
  };
  const listener = (result) => {
    (result.devices || []).forEach((device) => devices.set(device.deviceId, device));
    emit();
  };
  wx.onBluetoothDeviceFound(listener);
  const existing = await callWx("getBluetoothDevices").catch(() => ({ devices: [] }));
  (existing.devices || []).forEach((device) => devices.set(device.deviceId, device));
  emit();
  await callWx("startBluetoothDevicesDiscovery", { allowDuplicatesKey: false, interval: 0 });
  let stopped = false;
  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      if (wx.offBluetoothDeviceFound) wx.offBluetoothDeviceFound(listener);
      try { await callWx("stopBluetoothDevicesDiscovery"); } catch (_error) {}
    },
  };
}

class WechatBleTransport {
  constructor(device) {
    this.kind = "ble";
    this.name = device.name || "硕方 T50";
    this.deviceId = device.deviceId;
    this.connected = false;
    this.capabilities = {
      bulkAck: "optional",
      pageSubmission: "separate",
      completion: "device-confirmed",
    };
    this.queue = new ByteQueue();
    this.chunkSize = 20;
    this.serviceId = "";
    this.control = null;
    this.data = null;
    this.bulkNotify = null;
    this.valueListener = null;
    this.connectionListener = null;
  }

  async connect() {
    if (this.connected) return;
    await ensureBluetoothAdapter();
    try {
      await callWx("createBLEConnection", { deviceId: this.deviceId, timeout: 10000 });
      if (wx.setBLEMTU) {
        try {
          await callWx("setBLEMTU", { deviceId: this.deviceId, mtu: 247 });
          this.chunkSize = 180;
        } catch (_error) {
          this.chunkSize = 20;
        }
      }
      const serviceResult = await callWx("getBLEDeviceServices", { deviceId: this.deviceId });
      const service = (serviceResult.services || []).find((item) => normalizeUuid(item.uuid) === SERVICE_UUID);
      if (!service) throw new Error("设备没有提供 T50 打印服务");
      this.serviceId = service.uuid;
      const characteristicResult = await callWx("getBLEDeviceCharacteristics", {
        deviceId: this.deviceId,
        serviceId: this.serviceId,
      });
      const characteristics = characteristicResult.characteristics || [];
      this.control = characteristics.find((item) => normalizeUuid(item.uuid) === CONTROL_UUID);
      this.data = characteristics.find((item) => normalizeUuid(item.uuid) === DATA_UUID);
      this.bulkNotify = characteristics.find((item) => normalizeUuid(item.uuid) === BULK_NOTIFY_UUID) || null;
      if (!this.control || !this.data) throw new Error("设备打印特征不完整");

      this.valueListener = (event) => {
        if (event.deviceId !== this.deviceId) return;
        if (event.serviceId && normalizeUuid(event.serviceId) !== normalizeUuid(this.serviceId)) return;
        const uuid = normalizeUuid(event.characteristicId);
        // Optional FFEA bulk acknowledgements are intentionally kept out of
        // the command-response queue; the protocol treats them as advisory.
        if (uuid === DATA_UUID) this.queue.push(new Uint8Array(event.value));
      };
      wx.onBLECharacteristicValueChange(this.valueListener);
      await callWx("notifyBLECharacteristicValueChange", {
        state: true,
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.data.uuid,
      });
      if (this.bulkNotify) {
        try {
          await callWx("notifyBLECharacteristicValueChange", {
            state: true,
            deviceId: this.deviceId,
            serviceId: this.serviceId,
            characteristicId: this.bulkNotify.uuid,
          });
        } catch (_error) {}
      }
      this.connectionListener = (event) => {
        if (event.deviceId === this.deviceId && !event.connected) this.connected = false;
      };
      wx.onBLEConnectionStateChange(this.connectionListener);
      this.connected = true;
    } catch (error) {
      try { await callWx("closeBLEConnection", { deviceId: this.deviceId }); } catch (_closeError) {}
      throw error instanceof Error ? error : new Error(errorMessage(error, "连接打印机失败"));
    }
  }

  async disconnect() {
    this.connected = false;
    this.queue.clear();
    if (this.valueListener && wx.offBLECharacteristicValueChange) wx.offBLECharacteristicValueChange(this.valueListener);
    if (this.connectionListener && wx.offBLEConnectionStateChange) wx.offBLEConnectionStateChange(this.connectionListener);
    this.valueListener = null;
    this.connectionListener = null;
    try { await callWx("closeBLEConnection", { deviceId: this.deviceId }); } catch (_error) {}
  }

  async writeChunk(characteristic, chunk) {
    const canWriteWithoutResponse = characteristic.properties && characteristic.properties.writeNoResponse;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await callWx("writeBLECharacteristicValue", {
          deviceId: this.deviceId,
          serviceId: this.serviceId,
          characteristicId: characteristic.uuid,
          value: chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength),
          ...(canWriteWithoutResponse ? { writeType: "writeNoResponse" } : {}),
        });
        return;
      } catch (error) {
        lastError = error;
        await delay(12 * (attempt + 1));
      }
    }
    throw new Error(errorMessage(lastError, "蓝牙写入失败"));
  }

  async write(value) {
    if (!this.connected) throw new Error("打印机尚未连接");
    const data = value instanceof Uint8Array ? value : new Uint8Array(value);
    // The SDK hands transports the fixed 512-byte outer frame (7E 5A ...).
    // AA BB is the nested packet at byte 6, so checking data[0..1] routes
    // every print payload to the control characteristic and the printer
    // never receives its raster data.
    const bulk = isBulkTransfer(data);
    const characteristic = bulk ? this.data : this.control;
    for (let offset = 0; offset < data.length; offset += this.chunkSize) {
      await this.writeChunk(characteristic, data.slice(offset, offset + this.chunkSize));
      if (bulk && offset + this.chunkSize < data.length) await delay(3);
    }
  }

  read(size, timeoutMs) {
    return this.queue.read(size, timeoutMs);
  }
}

module.exports = {
  BULK_NOTIFY_UUID,
  CONTROL_UUID,
  DATA_UUID,
  isBulkTransfer,
  matchesPrinterPrefix,
  printerDeviceName,
  SERVICE_UUID,
  WechatBleTransport,
  ensureBluetoothAdapter,
  startDeviceDiscovery,
};
