function rotatePoint(point, center, radians) {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: center.x + x * cosine - y * sine,
    y: center.y + x * sine + y * cosine,
  };
}

function objectCenter(object) {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

function localPoint(object, point) {
  const center = objectCenter(object);
  return rotatePoint(point, center, -(Number(object.rotation || 0) * Math.PI) / 180);
}

function pointInObject(object, point, paddingMm = 0) {
  if (object.hidden) return false;
  const local = localPoint(object, point);
  return local.x >= object.x - paddingMm &&
    local.x <= object.x + object.width + paddingMm &&
    local.y >= object.y - paddingMm &&
    local.y <= object.y + object.height + paddingMm;
}

function hitTest(objects, point, paddingMm = 0.45) {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    if (!object.locked && pointInObject(object, point, paddingMm)) return object;
  }
  return null;
}

function objectCorners(object) {
  const center = objectCenter(object);
  const radians = (Number(object.rotation || 0) * Math.PI) / 180;
  return [
    { x: object.x, y: object.y },
    { x: object.x + object.width, y: object.y },
    { x: object.x + object.width, y: object.y + object.height },
    { x: object.x, y: object.y + object.height },
  ].map((point) => rotatePoint(point, center, radians));
}

function resizeHandle(object) {
  return objectCorners(object)[2];
}

function nearPoint(a, b, radiusMm) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= radiusMm;
}

function computeViewport(canvasWidth, canvasHeight, document, options = {}) {
  const padding = options.padding || 24;
  const availableWidth = Math.max(1, canvasWidth - padding * 2);
  const availableHeight = Math.max(1, canvasHeight - padding * 2);
  const fitScale = Math.min(availableWidth / document.width, availableHeight / document.height);
  const scale = Math.max(1, fitScale * (options.zoom || 1));
  const width = document.width * scale;
  const height = document.height * scale;
  return {
    left: (canvasWidth - width) / 2 + (options.panX || 0),
    top: (canvasHeight - height) / 2 + (options.panY || 0),
    width,
    height,
    scale,
  };
}

function screenToDocument(viewport, point) {
  return {
    x: (point.x - viewport.left) / viewport.scale,
    y: (point.y - viewport.top) / viewport.scale,
  };
}

function documentToScreen(viewport, point) {
  return {
    x: viewport.left + point.x * viewport.scale,
    y: viewport.top + point.y * viewport.scale,
  };
}

function snapMove(document, object, proposedX, proposedY, threshold = 0.65) {
  const xTargets = [0, (document.width - object.width) / 2, document.width - object.width];
  const yTargets = [0, (document.height - object.height) / 2, document.height - object.height];
  let x = proposedX;
  let y = proposedY;
  let guideX = null;
  let guideY = null;
  for (const target of xTargets) {
    if (Math.abs(proposedX - target) <= threshold) {
      x = target;
      guideX = target === 0 ? 0 : target === document.width - object.width ? document.width : document.width / 2;
      break;
    }
  }
  for (const target of yTargets) {
    if (Math.abs(proposedY - target) <= threshold) {
      y = target;
      guideY = target === 0 ? 0 : target === document.height - object.height ? document.height : document.height / 2;
      break;
    }
  }
  x = Math.max(0, Math.min(x, document.width - object.width));
  y = Math.max(0, Math.min(y, document.height - object.height));
  return { x, y, guideX, guideY };
}

module.exports = {
  computeViewport,
  documentToScreen,
  hitTest,
  localPoint,
  nearPoint,
  objectCenter,
  objectCorners,
  pointInObject,
  resizeHandle,
  rotatePoint,
  screenToDocument,
  snapMove,
};
