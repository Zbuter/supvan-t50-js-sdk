const { barcodeBits } = require("./barcode");
const { computeViewport, documentToScreen, objectCorners } = require("./geometry");
const { unpackBitset } = require("./monochrome");
const { createQrMatrix } = require("../vendor/t50-core");

const qrCache = new Map();
const bitmapCache = new Map();

function withObjectTransform(ctx, object, viewport, draw) {
  const scale = viewport.scale;
  const center = documentToScreen(viewport, {
    x: object.x + object.width / 2,
    y: object.y + object.height / 2,
  });
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate((Number(object.rotation || 0) * Math.PI) / 180);
  ctx.globalAlpha = object.opacity === undefined ? 1 : object.opacity;
  draw(object.width * scale, object.height * scale, scale);
  ctx.restore();
}

function wrapText(ctx, value, maxWidth, autoReturn) {
  const lines = [];
  const paragraphs = String(value || "").split("\n");
  for (const paragraph of paragraphs) {
    if (!autoReturn || !paragraph) {
      lines.push(paragraph);
      continue;
    }
    let line = "";
    for (const character of paragraph) {
      const candidate = line + character;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawText(ctx, object, width, height, scale) {
  const fontSize = Math.max(1, object.fontSize * scale);
  const lineHeight = Math.max(fontSize, (object.lineHeight || object.fontSize * 1.22) * scale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-width / 2, -height / 2, width, height);
  ctx.clip();
  if (object.inverted) {
    ctx.fillStyle = "#000";
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.fillStyle = "#fff";
  } else {
    ctx.fillStyle = "#000";
  }
  const fontFamily = String(object.fontFamily || "sans-serif").replace(/["']/g, "");
  const fontStack = /^(?:sans-serif|serif|monospace)$/.test(fontFamily) ? fontFamily : `"${fontFamily}", sans-serif`;
  ctx.font = `${object.fontWeight === "bold" ? "700" : "400"} ${fontSize}px ${fontStack}`;
  ctx.textBaseline = "top";
  ctx.textAlign = object.align || "left";
  const x = object.align === "center" ? 0 : object.align === "right" ? width / 2 : -width / 2;
  const lines = wrapText(ctx, object.text, width, object.autoReturn !== false);
  lines.slice(0, Math.max(1, Math.floor(height / lineHeight))).forEach((line, index) => {
    const y = -height / 2 + index * lineHeight;
    ctx.fillText(line, x, y);
    const measured = ctx.measureText(line).width;
    const left = object.align === "center" ? -measured / 2 : object.align === "right" ? width / 2 - measured : -width / 2;
    if (object.underline) ctx.fillRect(left, y + fontSize + Math.max(1, scale * 0.08), measured, Math.max(1, scale * 0.12));
    if (object.strikeout) ctx.fillRect(left, y + fontSize * 0.56, measured, Math.max(1, scale * 0.12));
  });
  ctx.restore();
}

function qrData(object) {
  const key = `${object.errorCorrection || "M"}\u0000${object.content}`;
  if (!qrCache.has(key)) qrCache.set(key, createQrMatrix(object.content || " ", object.errorCorrection || "M"));
  return qrCache.get(key);
}

function drawQr(ctx, object, width, height) {
  const matrix = qrData(object);
  const margin = 4;
  const fullSize = matrix.size + margin * 2;
  const side = Math.min(width, height);
  const moduleSize = side / fullSize;
  const left = -side / 2;
  const top = -side / 2;
  ctx.fillStyle = object.inverted ? "#000" : "#fff";
  ctx.fillRect(left, top, side, side);
  ctx.fillStyle = object.inverted ? "#fff" : "#000";
  for (let row = 0; row < matrix.size; row += 1) {
    let runStart = -1;
    for (let column = 0; column <= matrix.size; column += 1) {
      const black = column < matrix.size && matrix.modules[row * matrix.size + column];
      if (black && runStart < 0) runStart = column;
      if (!black && runStart >= 0) {
        ctx.fillRect(
          left + (margin + runStart) * moduleSize,
          top + (margin + row) * moduleSize,
          (column - runStart) * moduleSize + 0.3,
          moduleSize + 0.3,
        );
        runStart = -1;
      }
    }
  }
}

function drawBarcode(ctx, object, width, height) {
  const bits = barcodeBits(object.format, object.content);
  const marginModules = object.format === "EAN_13" ? 11 : 10;
  const moduleWidth = width / (bits.length + marginModules * 2);
  const left = -width / 2 + marginModules * moduleWidth;
  ctx.fillStyle = object.inverted ? "#000" : "#fff";
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.fillStyle = object.inverted ? "#fff" : "#000";
  let start = -1;
  for (let index = 0; index <= bits.length; index += 1) {
    if (bits[index] && start < 0) start = index;
    if (!bits[index] && start >= 0) {
      ctx.fillRect(left + start * moduleWidth, -height / 2, (index - start) * moduleWidth + 0.25, height);
      start = -1;
    }
  }
}

function bitmapPixels(resource) {
  const key = `${resource.widthDots}x${resource.heightDots}:${resource.data}`;
  if (!bitmapCache.has(key)) bitmapCache.set(key, unpackBitset(resource));
  return bitmapCache.get(key);
}

function drawBitmap(ctx, object, resource, width, height) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(-width / 2, -height / 2, width, height);
  ctx.clip();
  const pixels = bitmapPixels(resource);
  const sourceRatio = resource.widthDots / resource.heightDots;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  if (object.fit !== "fill") {
    const contain = object.fit !== "cover";
    if ((sourceRatio > targetRatio) === contain) drawHeight = width / sourceRatio;
    else drawWidth = height * sourceRatio;
  }
  const pixelWidth = drawWidth / resource.widthDots;
  const pixelHeight = drawHeight / resource.heightDots;
  const left = -drawWidth / 2;
  const top = -drawHeight / 2;
  ctx.fillStyle = "#000";
  for (let y = 0; y < resource.heightDots; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= resource.widthDots; x += 1) {
      const black = x < resource.widthDots && pixels[y * resource.widthDots + x];
      if (black && runStart < 0) runStart = x;
      if (!black && runStart >= 0) {
        ctx.fillRect(left + runStart * pixelWidth, top + y * pixelHeight, (x - runStart) * pixelWidth + 0.2, pixelHeight + 0.2);
        runStart = -1;
      }
    }
  }
  ctx.restore();
}

function tracePath(ctx, d) {
  const tokens = String(d).match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  let index = 0;
  let command = "";
  let x = 0;
  let y = 0;
  const number = () => Number(tokens[index++]);
  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();
    if (upper === "Z") {
      ctx.closePath();
      command = "";
    } else if (upper === "M" || upper === "L") {
      let nextX = number();
      let nextY = number();
      if (relative) { nextX += x; nextY += y; }
      x = nextX; y = nextY;
      if (upper === "M") ctx.moveTo(x, y); else ctx.lineTo(x, y);
      if (upper === "M") command = relative ? "l" : "L";
    } else if (upper === "H") {
      let nextX = number();
      if (relative) nextX += x;
      x = nextX;
      ctx.lineTo(x, y);
    } else if (upper === "V") {
      let nextY = number();
      if (relative) nextY += y;
      y = nextY;
      ctx.lineTo(x, y);
    } else if (upper === "C") {
      let x1 = number(); let y1 = number(); let x2 = number(); let y2 = number(); let nextX = number(); let nextY = number();
      if (relative) { x1 += x; y1 += y; x2 += x; y2 += y; nextX += x; nextY += y; }
      ctx.bezierCurveTo(x1, y1, x2, y2, nextX, nextY);
      x = nextX; y = nextY;
    } else if (upper === "Q") {
      let x1 = number(); let y1 = number(); let nextX = number(); let nextY = number();
      if (relative) { x1 += x; y1 += y; nextX += x; nextY += y; }
      ctx.quadraticCurveTo(x1, y1, nextX, nextY);
      x = nextX; y = nextY;
    } else {
      break;
    }
  }
}

function drawPathObject(ctx, object, width, height) {
  const viewBox = object.viewBox || [0, 0, width, height];
  ctx.save();
  ctx.translate(-width / 2, -height / 2);
  ctx.scale(width / viewBox[2], height / viewBox[3]);
  ctx.translate(-viewBox[0], -viewBox[1]);
  for (const path of object.paths || []) {
    ctx.beginPath();
    tracePath(ctx, path.d);
    if (path.fill && path.fill !== "none") {
      ctx.fillStyle = path.fill;
      ctx.fill();
    }
    if (path.stroke && path.stroke !== "none") {
      ctx.strokeStyle = path.stroke;
      ctx.lineWidth = path.strokeWidth || 0.3;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawObject(ctx, document, object, viewport, parentX = 0, parentY = 0) {
  if (object.hidden) return;
  if (object.type === "group") {
    object.children.forEach((child) => drawObject(ctx, document, child, viewport, parentX + object.x, parentY + object.y));
    return;
  }
  const positioned = parentX || parentY
    ? { ...object, x: object.x + parentX, y: object.y + parentY }
    : object;
  withObjectTransform(ctx, positioned, viewport, (width, height, scale) => {
    switch (object.type) {
      case "text":
        drawText(ctx, object, width, height, scale);
        break;
      case "qr":
        drawQr(ctx, object, width, height);
        break;
      case "barcode":
        drawBarcode(ctx, object, width, height);
        break;
      case "rectangle":
        if (object.fill && object.fill !== "transparent") {
          ctx.fillStyle = object.fill;
          ctx.fillRect(-width / 2, -height / 2, width, height);
        }
        ctx.strokeStyle = object.stroke || "#000";
        ctx.lineWidth = Math.max(1, (object.strokeWidth || 0.3) * scale);
        ctx.strokeRect(-width / 2, -height / 2, width, height);
        break;
      case "line":
        ctx.beginPath();
        ctx.moveTo(-width / 2, 0);
        ctx.lineTo(width / 2, 0);
        ctx.strokeStyle = object.stroke || "#000";
        ctx.lineWidth = Math.max(1, (object.strokeWidth || 0.3) * scale);
        ctx.stroke();
        break;
      case "image": {
        const resource = document.resources && document.resources.bitmaps && document.resources.bitmaps[object.resourceId];
        if (resource) drawBitmap(ctx, object, resource, width, height);
        else {
          ctx.strokeStyle = "#9ca29e";
          ctx.strokeRect(-width / 2, -height / 2, width, height);
          ctx.beginPath();
          ctx.moveTo(-width / 2, -height / 2);
          ctx.lineTo(width / 2, height / 2);
          ctx.moveTo(width / 2, -height / 2);
          ctx.lineTo(-width / 2, height / 2);
          ctx.stroke();
        }
        break;
      }
      case "path":
        drawPathObject(ctx, object, width, height);
        break;
      case "symbol": {
        const symbol = document.resources && document.resources.symbols && document.resources.symbols[object.symbolId];
        if (symbol) drawPathObject(ctx, symbol, width, height);
        break;
      }
      default:
        ctx.strokeStyle = "#a4aaa6";
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(-width / 2, -height / 2, width, height);
        ctx.setLineDash([]);
    }
  });
}

function drawDocument(ctx, document, viewport) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewport.left, viewport.top, viewport.width, viewport.height);
  ctx.clip();
  ctx.fillStyle = "#fff";
  ctx.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
  document.objects.forEach((object) => drawObject(ctx, document, object, viewport));
  ctx.restore();
}

function drawSelection(ctx, object, viewport) {
  const corners = objectCorners(object).map((point) => documentToScreen(viewport, point));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  corners.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.strokeStyle = "#168557";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  corners.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, index === 2 ? 7 : 4, 0, Math.PI * 2);
    ctx.fillStyle = index === 2 ? "#168557" : "#fff";
    ctx.fill();
    ctx.strokeStyle = "#168557";
    ctx.stroke();
  });
  ctx.restore();
}

function drawGuides(ctx, guides, viewport) {
  if (guides.guideX !== null && guides.guideX !== undefined) {
    const point = documentToScreen(viewport, { x: guides.guideX, y: 0 });
    ctx.beginPath();
    ctx.moveTo(point.x, viewport.top);
    ctx.lineTo(point.x, viewport.top + viewport.height);
    ctx.strokeStyle = "#ef5f55";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (guides.guideY !== null && guides.guideY !== undefined) {
    const point = documentToScreen(viewport, { x: 0, y: guides.guideY });
    ctx.beginPath();
    ctx.moveTo(viewport.left, point.y);
    ctx.lineTo(viewport.left + viewport.width, point.y);
    ctx.strokeStyle = "#ef5f55";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

class CanvasRenderer {
  constructor(canvas, width, height, pixelRatio) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.ctx = canvas.getContext("2d");
    this.viewport = null;
  }

  render(document, options = {}) {
    const ctx = this.ctx;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = "#edf0ed";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = "rgba(104, 115, 108, 0.10)";
    ctx.lineWidth = 1;
    for (let x = 0; x < this.width; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke();
    }
    for (let y = 0; y < this.height; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke();
    }
    const viewport = computeViewport(this.width, this.height, document, {
      padding: 26,
      zoom: options.zoom || 1,
      panX: options.panX || 0,
      panY: options.panY || 0,
    });
    this.viewport = viewport;
    ctx.save();
    ctx.shadowColor = "rgba(22, 28, 24, 0.16)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = "#fff";
    ctx.fillRect(viewport.left, viewport.top, viewport.width, viewport.height);
    ctx.restore();
    drawDocument(ctx, document, viewport);
    ctx.strokeStyle = "#cbd0cc";
    ctx.lineWidth = 1;
    ctx.strokeRect(viewport.left, viewport.top, viewport.width, viewport.height);
    drawGuides(ctx, options.guides || {}, viewport);
    const selected = options.selectedId && document.objects.find((object) => object.id === options.selectedId);
    if (selected) drawSelection(ctx, selected, viewport);
    return viewport;
  }
}

function rasterizeDocument(document, dotsPerMm = 8, threshold = 190) {
  const width = Math.max(1, Math.round(document.width * dotsPerMm));
  const height = Math.max(1, Math.round(document.height * dotsPerMm));
  const canvas = wx.createOffscreenCanvas({ type: "2d", width, height });
  const ctx = canvas.getContext("2d");
  drawDocument(ctx, document, { left: 0, top: 0, width, height, scale: dotsPerMm });
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index += 1) {
    const offset = index * 4;
    const alpha = (rgba[offset + 3] || 0) / 255;
    const gray = ((rgba[offset] || 0) * 0.299 + (rgba[offset + 1] || 0) * 0.587 + (rgba[offset + 2] || 0) * 0.114) * alpha + 255 * (1 - alpha);
    data[index] = gray < threshold ? 0 : 255;
  }
  return { width, height, data };
}

module.exports = { CanvasRenderer, drawDocument, rasterizeDocument };
