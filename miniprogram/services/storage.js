const { clone, validateDocument } = require("../core/document");

const WORKING_KEY = "supvan.editor.working.v2";
const PENDING_KEY = "supvan.editor.pending.v2";
const DRAFTS_KEY = "supvan.editor.drafts.v2";

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

function saveWorking(document) {
  validateDocument(document);
  write(WORKING_KEY, clone(document));
}

function loadWorking() {
  const value = read(WORKING_KEY, null);
  if (!value) return null;
  try {
    return clone(validateDocument(value));
  } catch (_error) {
    return null;
  }
}

function setPending(document) {
  validateDocument(document);
  write(PENDING_KEY, clone(document));
}

function takePending() {
  const value = read(PENDING_KEY, null);
  if (!value) return null;
  try {
    wx.removeStorageSync(PENDING_KEY);
    return clone(validateDocument(value));
  } catch (_error) {
    return null;
  }
}

function listDrafts() {
  const value = read(DRAFTS_KEY, []);
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && item.document).slice(0, 12);
}

function saveDraft(document) {
  validateDocument(document);
  const drafts = listDrafts();
  const now = Date.now();
  const id = document.id || `draft-${now.toString(36)}`;
  const item = {
    id,
    name: document.name || "未命名标签",
    size: `${document.width} × ${document.height} mm`,
    updatedAt: now,
    document: clone({ ...document, id }),
  };
  const next = [item, ...drafts.filter((draft) => draft.id !== id)].slice(0, 12);
  write(DRAFTS_KEY, next);
  return item;
}

function getDraft(id) {
  const item = listDrafts().find((draft) => draft.id === id);
  return item ? clone(item.document) : null;
}

module.exports = {
  getDraft,
  listDrafts,
  loadWorking,
  saveDraft,
  saveWorking,
  setPending,
  takePending,
};
