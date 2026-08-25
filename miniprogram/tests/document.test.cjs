const test = require("node:test");
const assert = require("node:assert/strict");

const {
  addObject,
  createDocument,
  createObject,
  duplicateObject,
  isUntitledName,
  parseDocument,
  serializeDocument,
} = require("../core/document");
const { getTemplate } = require("../core/templates");

test("creates and round-trips a millimetre label document", () => {
  const document = createDocument(40, 30);
  addObject(document, createObject("text", document, { text: "测试" }));
  const restored = parseDocument(serializeDocument(document));
  assert.equal(restored.width, 40);
  assert.equal(restored.height, 30);
  assert.equal(restored.objects[0].text, "测试");
});

test("duplicates objects with a unique id and clamps them to the page", () => {
  const document = createDocument(10, 10);
  const source = createObject("rectangle", document, { width: 9, height: 9, x: 1, y: 1 });
  addObject(document, source);
  const copy = duplicateObject(document, source.id);
  assert.notEqual(copy.id, source.id);
  assert.ok(copy.x + copy.width <= document.width);
  assert.ok(copy.y + copy.height <= document.height);
});

test("all built-in templates are independent editable documents", () => {
  const first = getTemplate("coffee-40x30");
  const second = getTemplate("coffee-40x30");
  first.objects[0].text = "已修改";
  assert.notEqual(first.objects[0].text, second.objects[0].text);
});

test("recognizes default untitled names but keeps user names", () => {
  assert.equal(isUntitledName("未命名"), true);
  assert.equal(isUntitledName("未命名标签"), true);
  assert.equal(isUntitledName("空白标签"), true);
  assert.equal(isUntitledName("空白 40×30"), true);
  assert.equal(isUntitledName("仓库货架"), false);
});
