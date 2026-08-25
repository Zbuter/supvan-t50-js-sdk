const test = require("node:test");
const assert = require("node:assert/strict");

const { computeNavigationMetrics, isDevtoolsEnvironment } = require("../core/navigation");

test("reserves the WeChat menu capsule area in a custom navigation bar", () => {
  assert.deepEqual(
    computeNavigationMetrics(
      { statusBarHeight: 47, windowWidth: 390 },
      { left: 296, top: 51, height: 32 },
    ),
    { statusBarHeight: 47, menuRightInset: 102, navigationHeight: 91 },
  );
});

test("uses safe navigation fallbacks when the capsule API is unavailable", () => {
  assert.deepEqual(
    computeNavigationMetrics({ statusBarHeight: 24, windowWidth: 375 }),
    { statusBarHeight: 24, menuRightInset: 16, navigationHeight: 72 },
  );
});

test("detects the DevTools platform through both current and legacy APIs", () => {
  assert.equal(isDevtoolsEnvironment({
    getDeviceInfo: () => ({ platform: "devtools" }),
  }), true);
  assert.equal(isDevtoolsEnvironment({
    getDeviceInfo: () => ({ platform: "windows" }),
    getSystemInfoSync: () => ({ platform: "devtools" }),
  }), true);
  assert.equal(isDevtoolsEnvironment({
    getDeviceInfo: () => ({ platform: "ios" }),
    getSystemInfoSync: () => ({ platform: "ios" }),
  }), false);
});
