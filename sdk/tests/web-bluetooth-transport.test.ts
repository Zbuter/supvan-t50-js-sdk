import { describe, expect, it } from "vitest";

import { BLE_UUIDS } from "../src/protocol";
import { WebBluetoothTransport } from "../src/transports/web-bluetooth";

class MockCharacteristic extends EventTarget {
  value?: DataView;

  async startNotifications(): Promise<MockCharacteristic> {
    return this;
  }

  async writeValue(): Promise<void> {}
}

describe("WebBluetoothTransport", () => {
  it("keeps optional FFEA bulk acknowledgements out of the control queue", async () => {
    const control = new MockCharacteristic();
    const notify = new MockCharacteristic();
    const bulkNotify = new MockCharacteristic();
    const characteristics = new Map<string, MockCharacteristic>([
      [BLE_UUIDS.write, control],
      [BLE_UUIDS.notify, notify],
      [BLE_UUIDS.bulkNotify, bulkNotify],
    ]);
    const server = {
      connected: true,
      async connect() {
        return this;
      },
      disconnect() {
        this.connected = false;
      },
      async getPrimaryService() {
        return {
          async getCharacteristic(uuid: string) {
            const characteristic = characteristics.get(uuid);
            if (!characteristic) throw new Error(`missing characteristic ${uuid}`);
            return characteristic;
          },
        };
      },
    };
    const transport = new WebBluetoothTransport({ name: "T50", gatt: server } as never);
    await transport.connect();

    bulkNotify.value = new DataView(Uint8Array.from([0xaa, 0xbb]).buffer);
    bulkNotify.dispatchEvent(new Event("characteristicvaluechanged"));
    notify.value = new DataView(Uint8Array.from([0x7e, 0x5a, 0x01]).buffer);
    notify.dispatchEvent(new Event("characteristicvaluechanged"));

    await expect(transport.read(8, 20)).resolves.toEqual(new Uint8Array([0x7e, 0x5a, 0x01]));
    await transport.disconnect();
  });
});
