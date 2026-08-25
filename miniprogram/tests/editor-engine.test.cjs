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

test("preserves arbitrary imported angles while quarter-turning from that angle", () => {
  const document = createDocument(40, 30, [
    { id: "angled", type: "text", x: 8, y: 8, width: 12, height: 5, rotation: 27.5, text: "角度", fontSize: 3 },
  ]);
  const engine = new EditorEngine(document);
  engine.select("angled");
  engine.nudgeSelected(0.1, 0);
  assert.equal(engine.selectedObject.rotation, 27.5);
  engine.rotateSelected();
  assert.equal(engine.selectedObject.rotation, 117.5);
});

test("aligns, scales and changes the selected object layer", () => {
  const document = createDocument(40, 30, [
    { id: "first", type: "rectangle", x: 4, y: 4, width: 8, height: 6, rotation: 0 },
    { id: "second", type: "rectangle", x: 20, y: 12, width: 8, height: 6, rotation: 0 },
  ]);
  const engine = new EditorEngine(document);
  engine.select("first");
  engine.alignSelected("center-horizontal");
  assert.equal(engine.selectedObject.x, 16);
  engine.scaleSelected(1.25);
  assert.equal(engine.selectedObject.width, 10);
  engine.changeLayer("front");
  assert.equal(engine.document.objects.at(-1).id, "first");
});
