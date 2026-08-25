const test = require("node:test");
const assert = require("node:assert/strict");

const {
  matchesPrinterPrefix,
  printerDeviceName,
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
