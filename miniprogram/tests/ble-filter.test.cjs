const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isBulkTransfer,
  matchesPrinterPrefix,
  printerDeviceName,
  WechatBleTransport,
} = require("../services/wechat-ble-transport");

test("only accepts Bluetooth names beginning with the T0 prefix", () => {
  assert.equal(matchesPrinterPrefix({ name: "T012345" }), true);
  assert.equal(matchesPrinterPrefix({ name: "t0-a1b2" }), true);
  assert.equal(matchesPrinterPrefix({ name: "T50" }), false);
  assert.equal(matchesPrinterPrefix({ name: "SUPVAN T0123" }), false);
  assert.equal(matchesPrinterPrefix({ localName: "Other" }), false);
});

test("uses a matching localName when the primary name has another prefix", () => {
  const device = { name: "Bluetooth Device", localName: "T0-5566" };
  assert.equal(matchesPrinterPrefix(device), true);
  assert.equal(printerDeviceName(device), "T0-5566");
});

test("recognizes the SDK 512-byte outer print frame instead of its nested AA BB packet", () => {
  const outer = new Uint8Array(512);
  outer.set([0x7e, 0x5a, 0xfc, 0x01, 0x10, 0x02, 0xaa, 0xbb]);
  assert.equal(isBulkTransfer(outer), true);
  assert.equal(isBulkTransfer(Uint8Array.from([0xaa, 0xbb])), false);
  assert.equal(isBulkTransfer(Uint8Array.from([0x7e, 0x5a, 0x0c, 0, 0x10, 1])), false);
});

test("routes control commands to FFE9 and SDK print frames to FFE1", async () => {
  const transport = new WechatBleTransport({ deviceId: "printer-1", name: "T0123" });
  const control = { uuid: "ffe9" };
  const data = { uuid: "ffe1" };
  const writes = [];
  transport.connected = true;
  transport.control = control;
  transport.data = data;
  transport.chunkSize = 512;
  transport.writeChunk = async (characteristic, chunk) => {
    writes.push({ characteristic, chunk });
  };

  const command = Uint8Array.from([0x7e, 0x5a, 0x0c, 0, 0x10, 1, 0xaa, 0x11]);
  const printFrame = new Uint8Array(512);
  printFrame.set([0x7e, 0x5a, 0xfc, 0x01, 0x10, 0x02, 0xaa, 0xbb]);
  await transport.write(command);
  await transport.write(printFrame);

  assert.equal(writes.length, 2);
  assert.equal(writes[0].characteristic, control);
  assert.equal(writes[1].characteristic, data);
});
