const { clone } = require("../core/document");
const { activeDocument, validateWorkspace } = require("../core/workspace");

const WORKING_KEY = "supvan.editor.working.v3";
const WORKING_LIST_KEY = "supvan.editor.working-list.v4";
const PENDING_KEY = "supvan.editor.pending.v3";
const DRAFTS_KEY = "supvan.editor.drafts.v3";
const LEGACY_WORKING_KEY = "supvan.editor.working.v2";
const LEGACY_PENDING_KEY = "supvan.editor.pending.v2";
const LEGACY_DRAFTS_KEY = "supvan.editor.drafts.v2";
const MAX_WORKING_ITEMS = 1;

function read(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === "" || value === undefined || value === null ? fallback : value;
  } catch (_error) {
    return fallback;
  }
}

function write(key, value) {
  wx.setStorageSync(key, value);
}

function workingItem(value, updatedAt = Date.now()) {
  const workspace = validateWorkspace(value);
  const document = activeDocument(workspace);
  return {
    id: workspace.workspaceId,
    name: document.name || "未命名标签",
    size: `${document.width} × ${document.height} mm`,
    pageCount: workspace.pages.length,
    objectCount: workspace.pages.reduce((total, page) => total + page.objects.length, 0),
    updatedAt,
    workspace: clone(workspace),
  };
}

function normalizeWorkingItem(item) {
  if (!item) return null;
  try {
    const source = item.workspace || item.document || item;
    const normalized = workingItem(source, Number(item.updatedAt) || Date.now());
    if ((!source.workspaceId || typeof source.workspaceId !== "string") && typeof item.id === "string" && item.id) {
      normalized.id = item.id;
      normalized.workspace.workspaceId = item.id;
    }
    return normalized;
  } catch (_error) {
    return null;
  }
}

function listWorkingWorkspaces() {
  const current = read(WORKING_LIST_KEY, null);
  if (Array.isArray(current)) {
    const normalized = current.map(normalizeWorkingItem).filter(Boolean).slice(0, MAX_WORKING_ITEMS);
    if (current.length !== normalized.length) write(WORKING_LIST_KEY, normalized);
    return normalized;
  }
  const legacy = read(WORKING_KEY, null) || read(LEGACY_WORKING_KEY, null);
  const migrated = normalizeWorkingItem(legacy);
  if (!migrated) return [];
  write(WORKING_LIST_KEY, [migrated]);
  return [migrated];
}

function saveWorkingWorkspace(value) {
  const item = workingItem(value);
  const next = [
    item,
    ...listWorkingWorkspaces().filter((current) => current.id !== item.id),
  ].slice(0, MAX_WORKING_ITEMS);
  write(WORKING_LIST_KEY, next);
  // Keep the previous single-slot key as a pointer for older published builds.
  write(WORKING_KEY, item.workspace);
  return item;
}

function saveWorking(document) {
  return saveWorkingWorkspace(document);
}

function loadWorkingWorkspace() {
  const item = listWorkingWorkspaces()[0];
  return item ? clone(item.workspace) : null;
}

function loadWorking() {
  const workspace = loadWorkingWorkspace();
  return workspace ? activeDocument(workspace) : null;
}

function setPending(value) {
  write(PENDING_KEY, validateWorkspace(value));
}

function takePendingWorkspace() {
  const current = read(PENDING_KEY, null);
  const value = current || read(LEGACY_PENDING_KEY, null);
  if (!value) return null;
  try {
    wx.removeStorageSync(PENDING_KEY);
    if (!current) wx.removeStorageSync(LEGACY_PENDING_KEY);
    return validateWorkspace(value);
  } catch (_error) {
    return null;
  }
}

function takePending() {
  const workspace = takePendingWorkspace();
  return workspace ? activeDocument(workspace) : null;
}

function listDrafts() {
  const current = read(DRAFTS_KEY, null);
  const value = current || read(LEGACY_DRAFTS_KEY, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && (item.workspace || item.document)).slice(0, 12);
}

function saveDraft(value) {
  const workspace = validateWorkspace(value);
  const document = activeDocument(workspace);
  const drafts = listDrafts();
  const now = Date.now();
  const id = workspace.workspaceId || `draft-${now.toString(36)}`;
  const item = {
    id,
    name: document.name || "未命名标签",
    size: `${document.width} × ${document.height} mm`,
    pageCount: workspace.pages.length,
    updatedAt: now,
    workspace: clone(workspace),
    document: clone(document),
  };
  const next = [item, ...drafts.filter((draft) => draft.id !== id)].slice(0, 12);
  write(DRAFTS_KEY, next);
  return item;
}

function getDraft(id) {
  const item = listDrafts().find((draft) => draft.id === id);
  if (!item) return null;
  try {
    return activeDocument(item.workspace || item.document);
  } catch (_error) {
    return null;
  }
}

function getDraftWorkspace(id) {
  const item = listDrafts().find((draft) => draft.id === id);
  if (!item) return null;
  try {
    const source = item.workspace || item.document;
    const workspace = validateWorkspace(source);
    if ((!source.workspaceId || typeof source.workspaceId !== "string") && typeof item.id === "string" && item.id) {
      workspace.workspaceId = item.id;
    }
    return workspace;
  } catch (_error) {
    return null;
  }
}

module.exports = {
  getDraft,
  getDraftWorkspace,
  listDrafts,
  listWorkingWorkspaces,
  loadWorking,
  loadWorkingWorkspace,
  saveDraft,
  saveWorking,
  saveWorkingWorkspace,
  setPending,
  takePending,
  takePendingWorkspace,
};
