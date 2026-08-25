const test = require("node:test");
const assert = require("node:assert/strict");

const { createDocument } = require("../core/document");
const { EditorEngine } = require("../core/editor-engine");

test("records drag as one undoable gesture", () => {
  const engine = new EditorEngine(createDocument(40, 30));
  const object = engine.add("text", { x: 2, y: 3 });
  engine.beginGesture();
  engine.previewMove(10, 11, false);
  engine.previewMove(12, 13, false);
  engine.endGesture();
  assert.equal(engine.selectedObject.x, 12);
  engine.undo();
  assert.equal(engine.selectedObject.x, 2);
  assert.equal(engine.selectedObject.y, 3);
  assert.equal(engine.selectedObject.id, object.id);
});

test("supports 0.1mm nudging and quarter-turn rotation", () => {
  const engine = new EditorEngine(createDocument(40, 30));
  engine.add("rectangle", { x: 5, y: 5 });
  engine.nudgeSelected(0.1, -0.1);
  engine.rotateSelected();
  assert.equal(engine.selectedObject.x, 5.1);
  assert.equal(engine.selectedObject.y, 4.9);
  assert.equal(engine.selectedObject.rotation, 90);
});
