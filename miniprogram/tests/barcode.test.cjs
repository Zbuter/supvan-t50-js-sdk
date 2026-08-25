const test = require("node:test");
const assert = require("node:assert/strict");

const { barcodeBits, normalizeEan } = require("../core/barcode");

test("encodes CODE 128 into alternating monochrome modules", () => {
  const bits = barcodeBits("CODE_128", "T50-2026");
  assert.ok(bits.length > 100);
  assert.equal(bits.some(Boolean), true);
  assert.equal(bits.some((value) => !value), true);
});

test("normalizes EAN-13 and computes its check digit", () => {
  assert.equal(normalizeEan("690123456789"), "6901234567892");
  assert.equal(barcodeBits("EAN_13", "690123456789").length, 95);
});
