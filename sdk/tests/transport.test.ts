import { describe, expect, it } from "vitest";

import { TimeoutError } from "../src";
import { AsyncByteQueue, getTransportCapabilities } from "../src/transports/transport";

describe("AsyncByteQueue", () => {
  it("preserves fragments and read sizes", async () => {
    const queue = new AsyncByteQueue();
    queue.push(new Uint8Array([1, 2, 3]));
    queue.push(new Uint8Array([4, 5]));
    await expect(queue.read(2)).resolves.toEqual(new Uint8Array([1, 2]));
    await expect(queue.read(4)).resolves.toEqual(new Uint8Array([3, 4, 5]));
  });

  it("uses a typed timeout error", async () => {
    const queue = new AsyncByteQueue();
    await expect(queue.read(2, 5)).rejects.toBeInstanceOf(TimeoutError);
  });
});

describe("transport capabilities", () => {
  const base = {
    kind: "ble" as const,
    name: "test",
    connected: false,
    async connect() {},
    async disconnect() {},
    async write() {},
    async read() { return new Uint8Array(); },
  };

  it("derives the structured model for legacy transports", () => {
    expect(getTransportCapabilities({ ...base, separatePhysicalPages: true })).toEqual({
      bulkAck: "none",
      pageSubmission: "separate",
      completion: "device-confirmed",
    });
  });

  it("rejects contradictory legacy acknowledgement flags", () => {
    expect(() => getTransportCapabilities({ ...base, bulkAckRequired: true, bulkAckOptional: true })).toThrow();
  });
});
