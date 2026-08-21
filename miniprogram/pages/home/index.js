const { createBlankDocument } = require("../../domain/document");
const { decodeLabelTransfer } = require("../../domain/transfer");
const { readRecent, saveDocument, setPending } = require("../../services/document-store");

Page({
  data: {
    recent: [],
    status: "",
  },

  onShow() {
    this.setData({ recent: readRecent(), status: "" });
  },

  importClipboard() {
    wx.getClipboardData({
      success: (result) => {
        try {
          const transfer = decodeLabelTransfer(result.data || "");
          const saved = saveDocument(transfer.document);
          setPending(saved.document);
          wx.navigateTo({ url: "/pages/editor/index" });
        } catch (error) {
          this.setData({ status: error.message || "剪贴板内容不是可编辑标签" });
        }
      },
      fail: () => this.setData({ status: "无法读取剪贴板，请重试" }),
    });
  },

  createBlank() {
    const document = createBlankDocument();
    saveDocument(document);
    setPending(document);
    wx.navigateTo({ url: "/pages/editor/index" });
  },

  openRecent(event) {
    const index = Number(event.currentTarget.dataset.index);
    const item = this.data.recent[index];
    if (!item) return;
    setPending(item.document);
    wx.navigateTo({ url: "/pages/editor/index" });
  },
});
