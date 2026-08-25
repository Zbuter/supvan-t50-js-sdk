const {
  addObject,
  clampObject,
  clone,
  createObject,
  duplicateObject,
  findObject,
  removeObject,
  roundMm,
  updateObject,
  validateDocument,
} = require("./document");
const { objectBounds, snapMove } = require("./geometry");

class EditorEngine {
  constructor(document) {
    this.document = clone(validateDocument(document));
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];
    this.gestureSnapshot = null;
  }

  get selectedObject() {
    return this.selectedId ? findObject(this.document, this.selectedId) || null : null;
  }

  select(id) {
    this.selectedId = id && findObject(this.document, id) ? id : null;
    return this.selectedObject;
  }

  snapshot() {
    return JSON.stringify(this.document);
  }

  restore(serialized) {
    this.document = validateDocument(JSON.parse(serialized));
    if (this.selectedId && !findObject(this.document, this.selectedId)) this.selectedId = null;
  }

  commit(action) {
    const before = this.snapshot();
    const result = action();
    const after = this.snapshot();
    if (before !== after) {
      this.undoStack.push(before);
      if (this.undoStack.length > 60) this.undoStack.shift();
      this.redoStack = [];
    }
    return result;
  }

  replaceDocument(document) {
    return this.commit(() => {
      this.document = clone(validateDocument(document));
      this.selectedId = null;
      return this.document;
    });
  }

  add(type, overrides = {}) {
    return this.commit(() => {
      const object = createObject(type, this.document, overrides);
      addObject(this.document, object);
      this.selectedId = object.id;
      return object;
    });
  }

  duplicateSelected() {
    if (!this.selectedId) return null;
    return this.commit(() => {
      const copy = duplicateObject(this.document, this.selectedId);
      this.selectedId = copy.id;
      return copy;
    });
  }

  removeSelected() {
    if (!this.selectedId) return false;
    return this.commit(() => {
      const removed = removeObject(this.document, this.selectedId);
      if (removed) this.selectedId = null;
      return removed;
    });
  }

  patchSelected(patch) {
    if (!this.selectedId) return null;
    return this.commit(() => updateObject(this.document, this.selectedId, patch));
  }

  nudgeSelected(dx, dy) {
    const object = this.selectedObject;
    if (!object) return null;
    return this.commit(() => updateObject(this.document, object.id, {
      x: roundMm(object.x + dx),
      y: roundMm(object.y + dy),
    }));
  }

  rotateSelected() {
    const object = this.selectedObject;
    if (!object || object.locked) return null;
    return this.commit(() => updateObject(this.document, object.id, {
      rotation: ((object.rotation || 0) + 90) % 360,
    }));
  }

  scaleSelected(factor) {
    const object = this.selectedObject;
    if (!object || object.locked || !Number.isFinite(factor) || factor <= 0) return null;
    return this.commit(() => {
      const centerX = object.x + object.width / 2;
      const centerY = object.y + object.height / 2;
      object.width *= factor;
      object.height *= factor;
      object.x = centerX - object.width / 2;
      object.y = centerY - object.height / 2;
      if (object.type === "text") object.fontSize = roundMm(Math.max(0.8, object.fontSize * factor));
      clampObject(this.document, object);
      return object;
    });
  }

  alignSelected(action) {
    const object = this.selectedObject;
    if (!object || object.locked) return null;
    return this.commit(() => {
      const bounds = objectBounds(object);
      let dx = 0;
      let dy = 0;
      if (action === "left") dx = -bounds.left;
      else if (action === "center-horizontal") dx = this.document.width / 2 - bounds.centerX;
      else if (action === "right") dx = this.document.width - bounds.right;
      else if (action === "top") dy = -bounds.top;
      else if (action === "center-vertical") dy = this.document.height / 2 - bounds.centerY;
      else if (action === "bottom") dy = this.document.height - bounds.bottom;
      else return object;
      object.x = roundMm(object.x + dx);
      object.y = roundMm(object.y + dy);
      clampObject(this.document, object);
      return object;
    });
  }

  changeLayer(action) {
    const object = this.selectedObject;
    if (!object) return false;
    return this.commit(() => {
      const objects = this.document.objects;
      const index = objects.findIndex((item) => item.id === object.id);
      if (index < 0) return false;
      let target = index;
      if (action === "front") target = objects.length - 1;
      else if (action === "forward") target = Math.min(objects.length - 1, index + 1);
      else if (action === "backward") target = Math.max(0, index - 1);
      else if (action === "back") target = 0;
      if (target === index) return false;
      objects.splice(index, 1);
      objects.splice(target, 0, object);
      return true;
    });
  }

  beginGesture() {
    this.gestureSnapshot = this.snapshot();
  }

  previewMove(x, y, shouldSnap = true) {
    const object = this.selectedObject;
    if (!object || object.locked) return { guideX: null, guideY: null };
    const snapped = shouldSnap ? snapMove(this.document, object, x, y) : { x, y, guideX: null, guideY: null };
    object.x = roundMm(snapped.x);
    object.y = roundMm(snapped.y);
    clampObject(this.document, object);
    return snapped;
  }

  previewResize(width, height) {
    const object = this.selectedObject;
    if (!object || object.locked) return null;
    const centerX = object.x + object.width / 2;
    const centerY = object.y + object.height / 2;
    object.width = Math.max(1, width);
    object.height = Math.max(1, height);
    object.x = centerX - object.width / 2;
    object.y = centerY - object.height / 2;
    clampObject(this.document, object);
    return object;
  }

  endGesture() {
    if (!this.gestureSnapshot) return false;
    const before = this.gestureSnapshot;
    this.gestureSnapshot = null;
    if (before === this.snapshot()) return false;
    this.undoStack.push(before);
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
    return true;
  }

  cancelGesture() {
    if (!this.gestureSnapshot) return;
    const selectedId = this.selectedId;
    this.restore(this.gestureSnapshot);
    this.selectedId = selectedId;
    this.gestureSnapshot = null;
  }

  undo() {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(this.snapshot());
    this.restore(previous);
    return true;
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    return true;
  }
}

module.exports = { EditorEngine };
