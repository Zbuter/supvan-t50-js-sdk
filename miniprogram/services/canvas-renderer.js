const qrcode = require("../domain/qrcode-generator");

const DEFAULT_DOTS_PER_MM = 8;

function renderDocument(canvas, context, document, options = {}) {
  const dotsPerMm = Number(options.dotsPerMm || DEFAULT_DOTS_PER_MM);
  const width = Math.max(1, Math.round(document.width * dotsPerMm));
  const height = Math.max(1, Math.round(document.height * dotsPerMm));
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  const resolved = resolveVariables(document);
  const runtime = { ...options, canvas, onImageLoaded: options.onImageLoaded };
  resolved.objects.forEach((object) => drawObject(context, object, resolved, dotsPerMm, 0, 0, runtime));
  if (options.selectedObjectId) {
    const selected = findObject(resolved.objects, options.selectedObjectId);
    if (selected) drawSelectionOutline(context, selected.object, selected.parentX, selected.parentY, dotsPerMm);
  }
}

function resolveVariables(document) {
  const copy = clone(document);
  const variables = copy.variables || {};
  walkObjects(copy.objects, (object) => {
    (object.bindings || []).forEach((binding) => {
      const value = variables[binding.variable] && variables[binding.variable].value;
      if (value === undefined) return;
      if (object.type === "text" && binding.field === "text") object.text = String(value);
      if ((object.type === "qr" || object.type === "barcode") && binding.field === "content") object.content = String(value);
    });
  });
  return copy;
}

function walkObjects(objects, visitor) {
  (objects || []).forEach((object) => {
    visitor(object);
    if (object.type === "group") walkObjects(object.children, visitor);
  });
}

function drawObject(context, object, document, dotsPerMm, parentX = 0, parentY = 0, runtime = {}) {
  if (!object || object.hidden) return;
  if (object.type === "group") {
    object.children.forEach((child) => drawObject(context, child, document, dotsPerMm, parentX + object.x, parentY + object.y, runtime));
    return;
  }
  const x = Math.round((parentX + Number(object.x || 0)) * dotsPerMm);
  const y = Math.round((parentY + Number(object.y || 0)) * dotsPerMm);
  const width = Math.max(1, Math.round(Number(object.width || 1) * dotsPerMm));
  const height = Math.max(1, Math.round(Number(object.height || 1) * dotsPerMm));
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate((normalizeAngle(object.rotation || 0) * Math.PI) / 180);
  context.translate(-width / 2, -height / 2);
  if (object.opacity !== undefined) context.globalAlpha = Math.max(0, Math.min(1, Number(object.opacity)));
  if (object.type === "text") drawText(context, object, width, height, dotsPerMm);
  else if (object.type === "qr") drawQr(context, object, width, height);
  else if (object.type === "barcode") drawBarcode(context, object, width, height);
  else if (object.type === "rectangle") drawRectangle(context, object, width, height, dotsPerMm);
  else if (object.type === "line") drawLine(context, object, width, height, dotsPerMm);
  else if (object.type === "image") drawImage(context, object, document, width, height, runtime);
  else if (object.type === "symbol") drawSymbol(context, object, document, width, height);
  else if (object.type === "path") drawPathPlaceholder(context, object, width, height);
  context.restore();
}

function findObject(objects, id, parentX = 0, parentY = 0) {
  for (const object of objects || []) {
    if (object.id === id) return { object, parentX, parentY };
    if (object.type === "group") {
      const nested = findObject(object.children, id, parentX + object.x, parentY + object.y);
      if (nested) return nested;
    }
  }
  return undefined;
}

function drawSelectionOutline(context, object, parentX, parentY, dotsPerMm) {
  const x = (parentX + Number(object.x || 0)) * dotsPerMm;
  const y = (parentY + Number(object.y || 0)) * dotsPerMm;
  const width = Math.max(1, Number(object.width || 1) * dotsPerMm);
  const height = Math.max(1, Number(object.height || 1) * dotsPerMm);
  context.save();
  context.translate(x + width / 2, y + height / 2);
  context.rotate((normalizeAngle(object.rotation || 0) * Math.PI) / 180);
  context.translate(-width / 2, -height / 2);
  context.strokeStyle = "#13795b";
  context.lineWidth = Math.max(1, Math.round(dotsPerMm / 4));
  if (typeof context.setLineDash === "function") context.setLineDash([Math.max(2, Math.round(dotsPerMm / 2)), Math.max(2, Math.round(dotsPerMm / 2))]);
  context.strokeRect(0, 0, width, height);
  if (typeof context.setLineDash === "function") context.setLineDash([]);
  context.restore();
}

function drawText(context, object, width, height, dotsPerMm) {
  const fontSize = Math.max(1, Math.round(Number(object.fontSize || 3) * dotsPerMm));
  const lineHeight = Math.max(1, Math.round(fontSize * Math.max(0.5, Number(object.lineHeight || 1.25))));
  const align = object.align === "center" || object.align === "right" ? object.align : "left";
  const lines = object.autoReturn ? wrapText(context, String(object.text || ""), width) : String(object.text || "").split("\n");
  context.font = `${object.fontWeight === "bold" ? "bold" : "normal"} ${fontSize}px ${object.fontFamily || "sans-serif"}`;
  context.textBaseline = "top";
  context.textAlign = align;
  const totalHeight = lines.length * lineHeight;
  let y = Math.max(0, Math.floor((height - totalHeight) / 2));
  const fill = object.inverted ? "#ffffff" : "#000000";
  if (object.inverted) {
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
  }
  for (let index = 0; index < lines.length && y < height; index += 1) {
    const line = lines[index];
    const x = align === "left" ? 0 : align === "center" ? width / 2 : width;
    context.fillStyle = fill;
    context.fillText(line, x, y);
    if (object.underline || object.strikeout) {
      const measured = context.measureText(line).width;
      const lineX = align === "left" ? 0 : align === "center" ? (width - measured) / 2 : width - measured;
      context.strokeStyle = fill;
      context.lineWidth = Math.max(1, Math.round(dotsPerMm / 8));
      context.beginPath();
      if (object.underline) {
        context.moveTo(lineX, y + lineHeight - 1);
        context.lineTo(lineX + measured, y + lineHeight - 1);
      } else {
        context.moveTo(lineX, y + Math.floor(lineHeight / 2));
        context.lineTo(lineX + measured, y + Math.floor(lineHeight / 2));
      }
      context.stroke();
    }
    y += lineHeight;
  }
}

function wrapText(context, text, width) {
  const lines = [];
  text.split("\n").forEach((paragraph) => {
    let line = "";
    Array.from(paragraph).forEach((character) => {
      const next = line + character;
      if (line && context.measureText(next).width > width) {
        lines.push(line);
        line = character;
      } else line = next;
    });
    lines.push(line);
  });
  return lines.length ? lines : [""];
}

function drawQr(context, object, width, height) {
  const content = String(object.content || "");
  context.fillStyle = object.inverted ? "#000000" : "#ffffff";
  context.fillRect(0, 0, width, height);
  if (!content) return;

  let code;
  try {
    code = qrcode(0, object.errorCorrection || "M");
    code.addData(content);
    code.make();
  } catch {
    // Keep an invalid/empty editable QR from breaking the whole preview.
    return;
  }

  const size = code.getModuleCount();
  const cellWidth = width / size;
  const cellHeight = height / size;
  context.fillStyle = object.inverted ? "#ffffff" : "#000000";
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!code.isDark(row, column)) continue;
      const left = Math.round(column * cellWidth);
      const top = Math.round(row * cellHeight);
      const right = Math.round((column + 1) * cellWidth);
      const bottom = Math.round((row + 1) * cellHeight);
      context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
    }
  }
}

function drawBarcode(context, object, width, height) {
  const content = String(object.content || "");
  const modules = [];
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) hash = (hash * 31 + content.charCodeAt(index)) >>> 0;
  const count = Math.max(35, Math.min(180, content.length * 11 + 24));
  for (let index = 0; index < count; index += 1) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    modules.push(index < 3 || index >= count - 3 || ((hash >>> 28) & 1) === 1);
  }
  const quiet = Math.max(4, Math.round(count * 0.08));
  const scale = Math.max(0.5, (width - quiet * 2) / count);
  context.fillStyle = object.inverted ? "#000000" : "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = object.inverted ? "#ffffff" : "#000000";
  modules.forEach((bar, index) => { if (bar) context.fillRect(quiet + index * scale, 0, Math.max(1, scale), height); });
}

function drawRectangle(context, object, width, height, dotsPerMm) {
  if (object.fill && object.fill !== "transparent") {
    context.fillStyle = thermalColor(object.fill);
    context.fillRect(0, 0, width, height);
  }
  context.strokeStyle = thermalColor(object.stroke || "#000000");
  context.lineWidth = Math.max(1, Math.round(Number(object.strokeWidth || 0.35) * dotsPerMm));
  context.strokeRect(0, 0, width, height);
}

function drawLine(context, object, width, height, dotsPerMm) {
  context.strokeStyle = thermalColor(object.stroke || "#000000");
  context.lineWidth = Math.max(1, Math.round(Number(object.strokeWidth || 0.35) * dotsPerMm));
  context.beginPath();
  context.moveTo(0, height / 2);
  context.lineTo(width, height / 2);
  context.stroke();
}

function drawImage(context, object, document, width, height, runtime) {
  const resource = document.resources && document.resources.bitmaps && document.resources.bitmaps[object.resourceId];
  if (resource) {
    drawBitmap(context, resource, width, height);
    return;
  }
  const imageResource = document.resources && document.resources.images && document.resources.images[object.resourceId];
  if (imageResource && runtime.canvas && typeof runtime.canvas.createImage === "function") {
    const cache = runtime.imageCache || (runtime.imageCache = {});
    const cached = cache[object.resourceId];
    if (cached && cached.status === "loaded") {
      context.drawImage(cached.image, 0, 0, width, height);
      return;
    }
    if (!cached) {
      const image = runtime.canvas.createImage();
      cache[object.resourceId] = { image, status: "loading" };
      image.onload = () => {
        cache[object.resourceId] = { image, status: "loaded" };
        if (runtime.onImageLoaded) runtime.onImageLoaded();
      };
      image.onerror = () => { cache[object.resourceId] = { image, status: "error" }; };
      image.src = imageResource.data && imageResource.data.startsWith("data:")
        ? imageResource.data
        : `data:${imageResource.mime || "image/png"};base64,${imageResource.data || ""}`;
    }
  }
  context.strokeStyle = "#777777";
  context.strokeRect(0, 0, width, height);
  context.font = "12px sans-serif";
  context.fillStyle = "#777777";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("图片", width / 2, height / 2);
}

function drawSymbol(context, object, document, width, height) {
  const symbol = document.resources && document.resources.symbols && document.resources.symbols[object.symbolId];
  if (symbol && symbol.paths) {
    context.strokeStyle = "#000000";
    context.fillStyle = "#000000";
    symbol.paths.forEach((path) => {
      if (!path.d) return;
      context.strokeRect(0, 0, width, height);
    });
    return;
  }
  context.strokeStyle = "#000000";
  context.strokeRect(0, 0, width, height);
}

function drawPathPlaceholder(context, object, width, height) {
  context.strokeStyle = "#000000";
  context.strokeRect(0, 0, width, height);
}

function drawBitmap(context, resource, width, height) {
  const pixels = decodeBitmap(resource);
  const scaleX = width / resource.widthDots;
  const scaleY = height / resource.heightDots;
  context.fillStyle = "#000000";
  for (let row = 0; row < resource.heightDots; row += 1) {
    let start = -1;
    for (let column = 0; column <= resource.widthDots; column += 1) {
      const black = column < resource.widthDots && pixels[row * resource.widthDots + column] === 0;
      if (black && start < 0) start = column;
      if (!black && start >= 0) {
        context.fillRect(start * scaleX, row * scaleY, (column - start) * scaleX, Math.max(1, scaleY));
        start = -1;
      }
    }
  }
}

function decodeBitmap(resource) {
  const bytes = decodeBase64(resource.data || "");
  const pixels = new Uint8Array(resource.widthDots * resource.heightDots);
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = bytes[index >> 3] & (1 << (7 - (index & 7))) ? 0 : 255;
  return pixels;
}

function decodeBase64(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = [];
  let accumulator = 0;
  let bits = 0;
  for (let index = 0; index < value.length; index += 1) {
    const digit = alphabet.indexOf(value[index]);
    if (digit < 0) continue;
    accumulator = (accumulator << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 255);
    }
  }
  return bytes;
}

function thermalColor(value) {
  return String(value).toLowerCase() === "#ffffff" || String(value).toLowerCase() === "white" ? "#ffffff" : "#000000";
}

function normalizeAngle(value) {
  const angle = Number(value) || 0;
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  renderDocument,
};
