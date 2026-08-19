import { describe, expect, it } from "vitest";

import { BlePrinter } from "../src/printer/ble-printer";
import { DeviceError } from "../src/errors";
import type { PrinterTransport } from "../src/transports/transport";
import { sum16, writeU16LE } from "../src/utils/bytes";

function response(command: number, payload = new Uint8Array()): Uint8Array {
  const frame = new Uint8Array(payload.length + 12);
  frame.set([0x7e, 0x5a, (payload.length + 8) & 0xff, (payload.length + 8) >>> 8, 0x10, 1, 0xaa, command]);
  frame.set(payload, 12);
  writeU16LE(frame, 8, sum16(frame, 10));
  return frame;
}

function statusResponse(coverOpen: boolean): Uint8Array {
  const payload = new Uint8Array(14);
  if (coverOpen) payload[4] = 0x08;
  return response(0x11, payload);
}

class FakeBleTransport implements PrinterTransport {
  readonly kind = "ble" as const;
  readonly name = "test printer";
  readonly connected = true;
  readonly writes: Uint8Array[] = [];
  private readonly pending: Uint8Array[] = [];
  private statusIndex = 0;

  constructor(private readonly statuses: boolean[]) {}

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async write(data: Uint8Array): Promise<void> {
    this.writes.push(data.slice());
    const command = data[7];
    if (command === 0x11) {
      this.pending.push(statusResponse(this.statuses[this.statusIndex++] ?? false));
    } else if (command === 0x13) {
      this.pending.push(response(0x13));
    }
  }

  async read(): Promise<Uint8Array> {
    const frame = this.pending.shift();
    if (!frame) throw new Error("unexpected read");
    return frame;
  }
}

const job = {
  pages: [{ width: 8, height: 8, data: new Uint8Array(64) }],
  settings: { materialWidth: 1, materialHeight: 1, gap: 3 },
};

describe("BlePrinter device-state guards", () => {
  it("stops before starting a job when the cover is already open", async () => {
    const transport = new FakeBleTransport([true]);
    const printer = new BlePrinter(transport, { commandTimeoutMs: 20 });

    await expect(printer.print(job)).rejects.toMatchObject({
      name: "DeviceError",
      message: "上盖未关好",
    });
    expect(transport.writes.map((write) => write[7])).toEqual([0x11]);
  });

  it("checks the device again after the BLE start command", async () => {
    const transport = new FakeBleTransport([false, true]);
    const printer = new BlePrinter(transport, { commandTimeoutMs: 20 });

    await expect(printer.print(job)).rejects.toBeInstanceOf(DeviceError);
    expect(transport.writes.map((write) => write[7])).toEqual([0x11, 0x13, 0x11]);
  });
});
