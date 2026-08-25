const { createBlank, getTemplate, listTemplates } = require("../../core/templates");
const { readNavigationMetrics } = require("../../core/navigation");
const { convertDocumentImagesToBitmaps } = require("../../services/image-import");
const storage = require("../../services/storage");
const { decodeLabelTransfer } = require("../../vendor/t50-core");

function callWx(name, options = {}) {
  return new Promise((resolve, reject) => wx[name]({ ...options, success: resolve, fail: reject }));
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    statusBarHeight: 24,
    menuRightInset: 16,
    navigationHeight: 72,
    templates: [],
    drafts: [],
    workings: [],
    showCustomSize: false,
    customWidth: "40",
    customHeight: "30",
  },

  onLoad() {
    this.setData({
      ...readNavigationMetrics(wx),
      templates: listTemplates(),
    });
  },

  onShow() {
    const drafts = storage.listDrafts().map((draft) => ({ ...draft, timeLabel: formatTime(draft.updatedAt) }));
    const workings = storage.listWorkingWorkspaces().map((item) => ({
      id: item.id,
      name: item.name,
      size: item.size,
      objectCount: item.objectCount,
      pageCount: item.pageCount,
      timeLabel: formatTime(item.updatedAt),
    }));
    this.setData({
      drafts,
      workings,
    });
  },

  openEditor(document) {
    storage.setPending(document);
    wx.navigateTo({ url: "/pages/editor/index" });
  },

  continueWorking(event) {
    const workspace = storage.getWorkingWorkspace(event.currentTarget.dataset.id);
    if (workspace) this.openEditor(workspace);
  },

  useTemplate(event) {
    const document = getTemplate(event.currentTarget.dataset.id);
    if (document) this.openEditor(document);
  },

  openDraft(event) {
    const workspace = storage.getDraftWorkspace(event.currentTarget.dataset.id);
    if (workspace) this.openEditor(workspace);
  },

  showCustomSize() {
    this.setData({ showCustomSize: true });
  },

  closeCustomSize() {
    this.setData({ showCustomSize: false });
  },

  stopPropagation() {},

  onCustomWidth(event) {
    this.setData({ customWidth: event.detail.value });
  },

  onCustomHeight(event) {
    this.setData({ customHeight: event.detail.value });
  },

  createCustom() {
    try {
      const width = Number(this.data.customWidth);
      const height = Number(this.data.customHeight);
      this.openEditor(createBlank(width, height));
      this.setData({ showCustomSize: false });
    } catch (error) {
      wx.showToast({ title: error.message || "标签尺寸无效", icon: "none" });
    }
  },

  async importClipboard() {
    wx.showLoading({ title: "导入可编辑标签", mask: true });
    try {
      const result = await callWx("getClipboardData");
      const transfer = decodeLabelTransfer(result.data);
      const document = await convertDocumentImagesToBitmaps(transfer.document);
      wx.hideLoading();
      this.openEditor(document);
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || "剪贴板中没有可编辑标签", icon: "none", duration: 2600 });
    }
  },
});
