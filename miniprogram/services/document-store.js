const KEY = "supvan-new-label-documents-v1";
const PENDING_KEY = "supvan-new-label-pending-v1";
const MAX_RECENT = 20;

function readRecent() {
  try {
    const value = wx.getStorageSync(KEY);
    return Array.isArray(value) ? value : [];
  } catch (error) {
    return [];
  }
}

function saveDocument(document) {
  const now = Date.now();
  const item = {
    id: document.id || `label-${now}`,
    name: document.name || `${document.width} × ${document.height} mm`,
    document,
    updatedAt: now,
  };
  const next = [item].concat(readRecent().filter((entry) => entry.id !== item.id)).slice(0, MAX_RECENT);
  wx.setStorageSync(KEY, next);
  return item;
}

function setPending(document) {
  wx.setStorageSync(PENDING_KEY, document);
}

function consumePending() {
  const value = wx.getStorageSync(PENDING_KEY);
  wx.removeStorageSync(PENDING_KEY);
  return value;
}

module.exports = {
  consumePending,
  readRecent,
  saveDocument,
  setPending,
};
