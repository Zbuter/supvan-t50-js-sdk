const { clone, createId } = require("../core/document");
const { packRgbaToBitset } = require("../core/monochrome");

function callWx(name, options = {}) {
  return new Promise((resolve, reject) => {
    wx[name]({ ...options, success: resolve, fail: reject });
  });
}

async function chooseImage() {
  const result = await callWx("chooseMedia", {
    count: 1,
    mediaType: ["image"],
    sourceType: ["album", "camera"],
    sizeType: ["compressed"],
  });
  const file = result.tempFiles && result.tempFiles[0];
  if (!file || !file.tempFilePath) throw new Error("没有选择图片");
  return file.tempFilePath;
}

function loadCanvasImage(canvas, source) {
  const image = canvas.createImage();
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片解码失败"));
    image.src = source;
  });
}

async function imageDimensions(source) {
  try {
    const info = await callWx("getImageInfo", { src: source });
    return { width: info.width, height: info.height };
  } catch (_error) {
    const probe = wx.createOffscreenCanvas({ type: "2d", width: 1, height: 1 });
    const image = await loadCanvasImage(probe, source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error("无法读取图片尺寸");
    return { width, height };
  }
}

async function loadImageResource(source, threshold = 190) {
  const info = await imageDimensions(source);
  // T50 is 8 dots/mm and supports labels up to 50 × 120 mm. Keeping at
  // most 400 × 960 dots avoids storing pixels the printer can never use.
  const scale = Math.min(1, 400 / info.width, 960 / info.height);
  const width = Math.max(1, Math.round(info.width * scale));
  const height = Math.max(1, Math.round(info.height * scale));
  const canvas = wx.createOffscreenCanvas({ type: "2d", width, height });
  const ctx = canvas.getContext("2d");
  const image = await loadCanvasImage(canvas, source);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  return {
    id: createId("bitmap"),
    resource: packRgbaToBitset(width, height, rgba, threshold),
  };
}

function embeddedImageSource(resource) {
  if (!resource || typeof resource.data !== "string" || !resource.data) throw new Error("图片资源为空");
  if (resource.data.startsWith("data:")) return resource.data;
  const mime = /^image\//.test(resource.mime || "") ? resource.mime : "image/png";
  return `data:${mime};base64,${resource.data}`;
}

async function convertDocumentImagesToBitmaps(document, threshold = 190) {
  const converted = clone(document);
  const images = converted.resources && converted.resources.images;
  if (!images || !Object.keys(images).length) return converted;
  converted.resources.bitmaps = converted.resources.bitmaps || {};
  for (const [resourceId, resource] of Object.entries(images)) {
    if (converted.resources.bitmaps[resourceId]) continue;
    const result = await loadImageResource(embeddedImageSource(resource), threshold);
    converted.resources.bitmaps[resourceId] = result.resource;
  }
  // The editable document keeps only the printer-ready monochrome points.
  delete converted.resources.images;
  return converted;
}

async function chooseAndConvertImage(threshold = 190) {
  const path = await chooseImage();
  return loadImageResource(path, threshold);
}

module.exports = { chooseAndConvertImage, convertDocumentImagesToBitmaps, loadImageResource };
