const PREFIX = "SUPVAN1:";
const MAGIC = "SUPVAN_LABEL";
const VERSION = 1;
const MAX_TRANSFER_LENGTH = 8 * 1024 * 1024;
const MAX_OBJECT_COUNT = 1000;
const MAX_TEXT_LENGTH = 10000;
const MAX_QR_LENGTH = 10000;
const MAX_BARCODE_LENGTH = 10000;
const MAX_BITMAP_PIXELS = 16 * 1024 * 1024;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function fail(message) {
  throw new Error(message);
}

function decodeBase64Url(value) {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) fail("标签数据编码无效");
  const bytes = [];
  let accumulator = 0;
  let bits = 0;
  for (let index = 0; index < value.length; index += 1) {
    const digit = ALPHABET.indexOf(value[index]);
    accumulator = (accumulator << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 255);
    }
  }
  return bytes;
}

function decodeUtf8(bytes) {
  let result = "";
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index];
    if (first < 0x80) {
      result += String.fromCodePoint(first);
      index += 1;
    } else if ((first & 0xe0) === 0xc0 && index + 1 < bytes.length) {
      result += String.fromCodePoint(((first & 0x1f) << 6) | (bytes[index + 1] & 0x3f));
      index += 2;
    } else if ((first & 0xf0) === 0xe0 && index + 2 < bytes.length) {
      result += String.fromCodePoint(((first & 0x0f) << 12) | ((bytes[index + 1] & 0x3f) << 6) | (bytes[index + 2] & 0x3f));
      index += 3;
    } else if ((first & 0xf8) === 0xf0 && index + 3 < bytes.length) {
      const codePoint = ((first & 0x07) << 18) | ((bytes[index + 1] & 0x3f) << 12) | ((bytes[index + 2] & 0x3f) << 6) | (bytes[index + 3] & 0x3f);
      result += String.fromCodePoint(codePoint);
      index += 4;
    } else {
      fail("标签数据 UTF-8 编码无效");
    }
  }
  return result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDocument(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("标签文档格式无效");
  const document = clone(input);
  if (document.page && (!document.width || !document.height)) {
    document.width = document.page.width;
    document.height = document.page.height;
  }
  if (document.version !== VERSION) fail("不支持的标签文档版本");
  if (!Number.isFinite(document.width) || document.width <= 0 || !Number.isFinite(document.height) || document.height <= 0) fail("标签尺寸无效");
  if (!Array.isArray(document.objects) || document.objects.length > MAX_OBJECT_COUNT) fail("标签对象数量无效");
  if (document.resources !== undefined) validateResources(document.resources);
  document.objects.forEach(validateObject);
  return document;
}

function validateResources(resources) {
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) fail("标签资源格式无效");
  Object.entries(resources.bitmaps || {}).forEach(([id, bitmap]) => {
    if (!id || !bitmap || bitmap.encoding !== "bitset-v1" || !Number.isInteger(bitmap.widthDots) || bitmap.widthDots <= 0 || !Number.isInteger(bitmap.heightDots) || bitmap.heightDots <= 0 || bitmap.widthDots * bitmap.heightDots > MAX_BITMAP_PIXELS || typeof bitmap.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(bitmap.data)) fail("黑白图片资源无效");
  });
  Object.entries(resources.images || {}).forEach(([id, image]) => {
    if (!id || !image || typeof image.mime !== "string" || typeof image.data !== "string") fail("图片资源无效");
  });
  if (resources.symbols !== undefined && (!resources.symbols || typeof resources.symbols !== "object" || Array.isArray(resources.symbols))) fail("符号资源无效");
}

function validateObject(object) {
  if (!object || typeof object !== "object" || typeof object.id !== "string" || typeof object.type !== "string") fail("标签对象格式无效");
  ["x", "y", "width", "height"].forEach((key) => {
    if (!Number.isFinite(object[key]) || (key === "width" || key === "height" ? object[key] <= 0 : object[key] < 0)) fail("标签对象尺寸无效");
  });
  if (object.type === "text") {
    if (typeof object.text !== "string" || object.text.length > MAX_TEXT_LENGTH) fail("文字内容过长或无效");
    if (!Number.isFinite(object.fontSize) || object.fontSize <= 0) fail("文字字号无效");
  } else if (object.type === "qr") {
    if (typeof object.content !== "string" || object.content.length > MAX_QR_LENGTH) fail("二维码内容过长或无效");
  } else if (object.type === "barcode") {
    if (typeof object.content !== "string" || object.content.length > MAX_BARCODE_LENGTH) fail("条码内容过长或无效");
    if (object.format !== "CODE_128" && object.format !== "EAN_13") fail("条码制式无效");
  } else if (object.type === "group") {
    if (!Array.isArray(object.children) || object.children.length > MAX_OBJECT_COUNT) fail("组合对象无效");
    object.children.forEach(validateObject);
  }
}

function decodeLabelTransfer(text) {
  if (typeof text !== "string" || !text.startsWith(PREFIX)) fail("剪贴板中没有硕方标签数据");
  if (text.length > MAX_TRANSFER_LENGTH) fail("剪贴板标签数据过大");
  let packageData;
  try {
    const bytes = decodeBase64Url(text.slice(PREFIX.length));
    packageData = JSON.parse(decodeUtf8(bytes));
  } catch (error) {
    if (error && error.message) throw error;
    fail("剪贴板标签数据无法解析");
  }
  if (!packageData || packageData.magic !== MAGIC || packageData.version !== VERSION) fail("剪贴板标签协议版本不支持");
  return {
    magic: MAGIC,
    version: VERSION,
    document: normalizeDocument(packageData.document),
    source: packageData.source && typeof packageData.source === "object" ? packageData.source : undefined,
  };
}

module.exports = {
  MAX_BARCODE_LENGTH,
  MAX_BITMAP_PIXELS,
  MAX_OBJECT_COUNT,
  MAX_QR_LENGTH,
  MAX_TEXT_LENGTH,
  MAX_TRANSFER_LENGTH,
  PREFIX,
  decodeLabelTransfer,
  normalizeDocument,
};
