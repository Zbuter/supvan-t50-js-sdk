function bytesToBase64(bytes) {
  if (typeof wx !== "undefined" && wx.arrayBufferToBase64) return wx.arrayBufferToBase64(bytes.buffer);
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value) {
  if (typeof wx !== "undefined" && wx.base64ToArrayBuffer) return new Uint8Array(wx.base64ToArrayBuffer(value));
  return new Uint8Array(Buffer.from(value, "base64"));
}

function luminance(r, g, b, alpha = 255) {
  const opacity = alpha / 255;
  return (r * 0.299 + g * 0.587 + b * 0.114) * opacity + 255 * (1 - opacity);
}

function packRgbaToBitset(width, height, rgba, threshold = 190) {
  if (rgba.length !== width * height * 4) throw new Error("图片像素长度不匹配");
  const bytes = new Uint8Array(Math.ceil((width * height) / 8));
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    if (luminance(rgba[offset], rgba[offset + 1], rgba[offset + 2], rgba[offset + 3]) < threshold) {
      bytes[Math.floor(index / 8)] |= 1 << (7 - (index % 8));
    }
  }
  return { encoding: "bitset-v1", widthDots: width, heightDots: height, data: bytesToBase64(bytes) };
}

function unpackBitset(resource) {
  if (!resource || resource.encoding !== "bitset-v1") throw new Error("图片点位格式无效");
  const bytes = base64ToBytes(resource.data);
  const pixels = new Uint8Array(resource.widthDots * resource.heightDots);
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = (bytes[Math.floor(index / 8)] & (1 << (7 - (index % 8)))) ? 1 : 0;
  }
  return pixels;
}

module.exports = { base64ToBytes, bytesToBase64, luminance, packRgbaToBitset, unpackBitset };
