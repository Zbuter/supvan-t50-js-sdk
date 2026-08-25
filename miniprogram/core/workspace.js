const { clone, createId, validateDocument } = require("./document");

const WORKSPACE_VERSION = 1;
const MAX_PAGES = 50;

function createWorkspace(document) {
  return {
    workspaceVersion: WORKSPACE_VERSION,
    workspaceId: createId("workspace"),
    activePageIndex: 0,
    pages: [clone(validateDocument(document))],
  };
}

function validateWorkspace(value) {
  if (value && value.workspaceVersion === WORKSPACE_VERSION && Array.isArray(value.pages)) {
    if (!value.pages.length || value.pages.length > MAX_PAGES) throw new Error(`标签页数需为 1–${MAX_PAGES}`);
    const pages = value.pages.map((document) => clone(validateDocument(document)));
    const first = pages[0];
    if (pages.some((page) => page.width !== first.width || page.height !== first.height)) {
      throw new Error("同一打印任务中的标签页面尺寸必须一致");
    }
    return {
      workspaceVersion: WORKSPACE_VERSION,
      workspaceId: typeof value.workspaceId === "string" && value.workspaceId
        ? value.workspaceId
        : createId("workspace"),
      activePageIndex: Math.max(0, Math.min(pages.length - 1, Math.trunc(Number(value.activePageIndex) || 0))),
      pages,
    };
  }
  return createWorkspace(value);
}

function activeDocument(workspace) {
  const normalized = validateWorkspace(workspace);
  return clone(normalized.pages[normalized.activePageIndex]);
}

module.exports = {
  MAX_PAGES,
  WORKSPACE_VERSION,
  activeDocument,
  createWorkspace,
  validateWorkspace,
};
