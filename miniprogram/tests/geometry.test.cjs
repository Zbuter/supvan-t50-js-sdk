const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeViewport,
  hitTest,
  pointInObject,
  screenToDocument,
  snapMove,
} = require("../core/geometry");

test("fits the physical label ratio into the mobile canvas", () => {
  const viewport = computeViewport(360, 400, { width: 40, height: 30 }, { padding: 20 });
  assert.equal(viewport.width / viewport.height, 4 / 3);
  const center = screenToDocument(viewport, { x: 180, y: 200 });
  assert.ok(Math.abs(center.x - 20) < 0.001);
  assert.ok(Math.abs(center.y - 15) < 0.001);
});

test("hit testing honours object rotation and z order", () => {
  const bottom = { id: "bottom", type: "rectangle", x: 2, y: 2, width: 10, height: 4, rotation: 0 };
  const top = { id: "top", type: "rectangle", x: 2, y: 2, width: 10, height: 4, rotation: 90 };
  assert.equal(pointInObject(top, { x: 7, y: 4 }), true);
  assert.equal(hitTest([bottom, top], { x: 7, y: 4 }).id, "top");
});

test("dragging snaps object centres and edges", () => {
  const result = snapMove({ width: 40, height: 30 }, { width: 10, height: 4 }, 14.7, 0.4, 0.7);
  assert.equal(result.x, 15);
  assert.equal(result.y, 0);
  assert.equal(result.guideX, 20);
  assert.equal(result.guideY, 0);
});
