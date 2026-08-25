const test = require("node:test");
const assert = require("node:assert/strict");

const values = new Map();
global.wx = {
  getStorageSync(key) { return values.has(key) ? values.get(key) : ""; },
  setStorageSync(key, value) { values.set(key, value); },
  removeStorageSync(key) { values.delete(key); },
};

const { createDocument } = require("../core/document");
const { createWorkspace } = require("../core/workspace");
const storage = require("../services/storage");

test("keeps only the most recent automatic working workspace", () => {
  values.clear();
  const first = createWorkspace(createDocument(40, 30, [], { name: "第一份" }));
  const second = createWorkspace(createDocument(50, 30, [], { name: "第二份" }));
  storage.saveWorkingWorkspace(first);
  storage.saveWorkingWorkspace(second);

  let items = storage.listWorkingWorkspaces();
  assert.deepEqual(items.map((item) => item.name), ["第二份"]);
  assert.equal(storage.loadWorkingWorkspace().workspaceId, second.workspaceId);

  first.pages[0].name = "第一份（已更新）";
  storage.saveWorkingWorkspace(first);
  items = storage.listWorkingWorkspaces();
  assert.deepEqual(items.map((item) => item.name), ["第一份（已更新）"]);
  assert.equal(items.length, 1);
});

test("migrates the previous single working workspace into the recent list", () => {
  values.clear();
  const legacy = {
    workspaceVersion: 1,
    activePageIndex: 0,
    pages: [createDocument(40, 30, [], { name: "旧版最近编辑" })],
  };
  values.set("supvan.editor.working.v3", legacy);
  const items = storage.listWorkingWorkspaces();
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "旧版最近编辑");
  assert.match(items[0].id, /^workspace-/);
});
