const assert = require("node:assert/strict");
const test = require("node:test");

const { createDocument } = require("../core/document");
const { activeDocument, createWorkspace, validateWorkspace } = require("../core/workspace");

test("wraps legacy single documents as one-page workspaces", () => {
  const document = createDocument(40, 30, [], { name: "单页" });
  const workspace = validateWorkspace(document);
  assert.equal(workspace.pages.length, 1);
  assert.match(workspace.workspaceId, /^workspace-/);
  assert.equal(activeDocument(workspace).name, "单页");
});

test("keeps an active page and rejects mixed page sizes", () => {
  const first = createDocument(40, 30, [], { name: "第一页" });
  const second = createDocument(40, 30, [], { name: "第二页" });
  const workspace = createWorkspace(first);
  const workspaceId = workspace.workspaceId;
  workspace.pages.push(second);
  workspace.activePageIndex = 1;
  assert.equal(activeDocument(workspace).name, "第二页");
  assert.equal(validateWorkspace(workspace).workspaceId, workspaceId);
  workspace.pages.push(createDocument(50, 30));
  assert.throws(() => validateWorkspace(workspace), /尺寸必须一致/);
});
