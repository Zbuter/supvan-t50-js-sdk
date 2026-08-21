import { describe, expect, it } from "vitest";

import { PrinterState, UsbPrinter } from "../src";
import { WebHidTransport } from "../src/transports/web-hid";

function inputReport(data: Uint8Array): Event {
  const event = new Event("inputreport");
  Object.defineProperty(event, "data", { value: new DataView(data.buffer, data.byteOffset, data.byteLength) });
  return event;
}

class MockHidDevice extends EventTarget {
  opened = false;
  readonly productName = "T50";
  private statusIndex = 0;

  constructor(private readonly statuses: Uint8Array[]) {
    super();
  }

  async open(): Promise<void> {
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
  }

  async sendReport(_reportId: number, data: BufferSource): Promise<void> {
    const request = new Uint8Array(data as ArrayBuffer);
    if (request[4] !== 0x11) return;
    const report = new Uint8Array(64);
    report[0] = 0xaa;
    report.set(this.statuses[this.statusIndex++] ?? new Uint8Array(8), 1);
    this.dispatchEvent(inputReport(report));
  }
}

function usbStatus(fixed0: number): Uint8Array {
  return Uint8Array.from([0, 0, fixed0, 0, 0, 0, 0, 0]);
}

describe("WebHidTransport status reports", () => {
  it("keeps the first status byte and consumes report padding", async () => {
    const device = new MockHidDevice([usbStatus(0x08), usbStatus(0), usbStatus(0x08)]);
    const transport = new WebHidTransport(device as never);
    const printer = new UsbPrinter(transport, { ioTimeoutMs: 20 });
    await printer.connect();

    await expect(printer.getStatus()).resolves.toMatchObject({
      state: PrinterState.CoverOpen,
      flags: { coverOpen: true },
      coverOpen: true,
      ready: false,
    });
    await expect(printer.getStatus()).resolves.toMatchObject({
      state: PrinterState.Ready,
      flags: { coverOpen: false },
      metrics: { printedPages: 0, totalPages: 0 },
      coverOpen: false,
      ready: true,
    });
    await expect(printer.getStatus()).resolves.toMatchObject({
      state: PrinterState.CoverOpen,
      coverOpen: true,
      ready: false,
    });

    await printer.disconnect();
  });
});
