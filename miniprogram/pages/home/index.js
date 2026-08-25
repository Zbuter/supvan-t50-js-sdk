const { createBlank, getTemplate, listTemplates } = require("../../core/templates");
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
    templates: [],
    drafts: [],
    working: null,
    showCustomSize: false,
    customWidth: "40",
    customHeight: "30",
  },

  onLoad() {
    try {
      this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight || 24 });
    } catch (_error) {}
    this.setData({ templates: listTemplates() });
  },

  onShow() {
    const drafts = storage.listDrafts().map((draft) => ({ ...draft, timeLabel: formatTime(draft.updatedAt) }));
    const working = storage.loadWorking();
    this.setData({
      drafts,
      working: working ? {
        name: working.name || "未命名标签",
        size: `${working.width} × ${working.height} mm`,
        objectCount: working.objects.length,
      } : null,
    });
  },

  openEditor(document) {
    storage.setPending(document);
    wx.navigateTo({ url: "/pages/editor/index" });
  },

  continueWorking() {
    const document = storage.loadWorking();
    if (document) this.openEditor(document);
  },

  useTemplate(event) {
    const document = getTemplate(event.currentTarget.dataset.id);
    if (document) this.openEditor(document);
  },

  openDraft(event) {
    const document = storage.getDraft(event.currentTarget.dataset.id);
    if (document) this.openEditor(document);
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
