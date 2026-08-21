import { deserializeLabelDocument, type LabelDocument, type LabelObject, type LabelResources } from "shuofang-t50-sdk";

export function parseSvgToLabelDocument(source: string): LabelDocument {
  if (/<\s*(script|foreignObject|iframe)\b/i.test(source) || /<!\s*(doctype|entity)\b/i.test(source)) throw new Error("SVG 包含不允许的动态内容");
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (parsed.querySelector("parsererror")) throw new Error("SVG 无法解析");
  const root = parsed.documentElement;
  if (root.tagName.toLowerCase() !== "svg") throw new Error("文件不是 SVG");
  const embedded = root.querySelector("metadata[data-supvan-label-document]")?.getAttribute("data-supvan-label-document");
  if (embedded) {
    try {
      return deserializeLabelDocument(decodeURIComponent(embedded));
    } catch {
      throw new Error("SVG 内嵌标签数据无效");
    }
  }
  const viewBox = parseViewBox(root.getAttribute("viewBox"));
  const width = parseLength(root.getAttribute("width")) ?? viewBox?.[2];
  const height = parseLength(root.getAttribute("height")) ?? viewBox?.[3];
  if (!width || !height) throw new Error("SVG 缺少可识别的标签尺寸");
  const resources: LabelResources = { images: {} };
  let sequence = 0;
  const objects: LabelObject[] = [];
  root.childNodes.forEach((node) => {
    const object = parseNode(node, resources, () => `svg-${++sequence}`, 0, 0, viewBox);
    if (object) objects.push(object);
  });
  return deserializeLabelDocument({ version: 1, width, height, objects, resources: Object.keys(resources.images ?? {}).length ? resources : undefined });
}

function parseNode(node: Node, resources: LabelResources, nextId: () => string, parentX: number, parentY: number, viewBox?: [number, number, number, number]): LabelObject | undefined {
  if (!(node instanceof Element)) return undefined;
  const type = node.tagName.toLowerCase();
  if (["defs", "title", "desc", "style"].includes(type)) return undefined;
  for (const attribute of Array.from(node.attributes)) {
    if (/^on/i.test(attribute.name)) throw new Error("SVG 不允许事件处理器");
    if (attribute.name === "style" && /url\s*\(/i.test(attribute.value)) throw new Error("SVG 不允许外部样式资源");
    if (/^(?:href|xlink:href|src)$/i.test(attribute.name) && /^(?:https?:|file:|javascript:)/i.test(attribute.value.trim())) throw new Error("SVG 不允许外部或脚本资源");
  }
  const transform = parseTransform(node.getAttribute("transform"));
  const objectId = node.getAttribute("data-object-id") || nextId();
  const x = parentX + numberAttribute(node, "x") + transform.x;
  const y = parentY + numberAttribute(node, "y") + transform.y;
  const width = numberAttribute(node, "width");
  const height = numberAttribute(node, "height");
  const rotation = transform.rotation;
  if (type === "text") {
    const text = node.textContent?.trim() ?? "";
    const fontSize = numberAttribute(node, "font-size", 3);
    const anchor = node.getAttribute("text-anchor");
    const align = anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";
    const textWidth = width || Math.max(fontSize, text.length * fontSize);
    const objectX = align === "center" ? x - textWidth / 2 : align === "right" ? x - textWidth : x;
    return { id: objectId, type: "text", x: objectX, y, width: textWidth, height: height || fontSize * 1.4, text, fontSize, fontFamily: node.getAttribute("font-family") ?? undefined, fontWeight: node.getAttribute("font-weight") === "bold" ? "bold" : "normal", align, rotation };
  }
  if (type === "rect") return { id: objectId, type: "rectangle", x, y, width: width || 1, height: height || 1, fill: node.getAttribute("fill") ?? "transparent", stroke: node.getAttribute("stroke") ?? "#000000", strokeWidth: numberAttribute(node, "stroke-width", 0.35), rotation };
  if (type === "line") {
    const x1 = parentX + numberAttribute(node, "x1") + transform.x;
    const y1 = parentY + numberAttribute(node, "y1") + transform.y;
    const x2 = parentX + numberAttribute(node, "x2") + transform.x;
    const y2 = parentY + numberAttribute(node, "y2") + transform.y;
    return { id: objectId, type: "line", x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.max(1, Math.abs(x2 - x1)), height: Math.max(0.1, Math.abs(y2 - y1) || numberAttribute(node, "stroke-width", 0.35)), stroke: node.getAttribute("stroke") ?? "#000000", strokeWidth: numberAttribute(node, "stroke-width", 0.35), rotation };
  }
  if (type === "image") {
    const href = node.getAttribute("href") ?? node.getAttribute("xlink:href") ?? "";
    if (!href.startsWith("data:")) throw new Error("SVG 图片必须使用内嵌 data URI");
    const match = href.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/);
    if (!match) throw new Error("SVG 图片 data URI 无效");
    if (!/^image\/(?:png|jpe?g|gif|webp|bmp)$/i.test(match[1]!)) throw new Error("SVG 只允许内嵌位图图片");
    const resourceId = nextId();
    resources.images ??= {};
    resources.images[resourceId] = { mime: match[1]!, data: match[2]! };
    return { id: objectId, type: "image", resourceId, x, y, width: width || 1, height: height || 1, rotation, fit: "fill" };
  }
  if (type === "path") {
    return { id: objectId, type: "path", x, y, width: width || viewBox?.[2] || 1, height: height || viewBox?.[3] || 1, rotation, viewBox: viewBox ?? [0, 0, width || 1, height || 1], paths: [{ d: node.getAttribute("d") ?? "", fill: node.getAttribute("fill") ?? "black", stroke: node.getAttribute("stroke") ?? "none", strokeWidth: numberAttribute(node, "stroke-width", 0) }] };
  }
  if (type === "g" || type === "svg") {
    const declaredType = node.getAttribute("data-object-type");
    if (declaredType === "qr") return { id: objectId, type: "qr", x, y, width: width || 1, height: height || 1, rotation, content: node.getAttribute("data-object-content") ?? "" };
    if (declaredType === "barcode") return { id: objectId, type: "barcode", format: "CODE_128", x, y, width: width || 1, height: height || 1, rotation, content: node.getAttribute("data-object-content") ?? "" };
    const children: LabelObject[] = [];
    node.childNodes.forEach((child) => {
      const object = parseNode(child, resources, nextId, 0, 0, parseViewBox(node.getAttribute("viewBox")) ?? viewBox);
      if (object) children.push(object);
    });
    if (!children.length) return undefined;
    return {
      id: objectId,
      type: "group",
      x,
      y,
      width: width || numberAttribute(node, "data-group-width", viewBox?.[2] || 1),
      height: height || numberAttribute(node, "data-group-height", viewBox?.[3] || 1),
      rotation,
      children,
    };
  }
  return undefined;
}

function parseViewBox(value: string | null): [number, number, number, number] | undefined {
  if (!value) return undefined;
  const values = value.trim().split(/[\s,]+/).map(Number);
  return values.length === 4 && values.every(Number.isFinite) ? [values[0]!, values[1]!, values[2]!, values[3]!] : undefined;
}

function parseLength(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^([\d.+-]+)\s*(mm|cm|in|px)?$/i);
  if (!match) return undefined;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return undefined;
  const unit = (match[2] ?? "mm").toLowerCase();
  if (unit === "cm") return number * 10;
  if (unit === "in") return number * 25.4;
  if (unit === "px") return number / 8;
  return number;
}

function numberAttribute(element: Element, name: string, fallback = 0): number {
  const value = element.getAttribute(name);
  const parsed = value === null ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTransform(value: string | null): { x: number; y: number; rotation: number } {
  const translate = value?.match(/translate\(\s*([\d.+-]+)(?:[\s,]+([\d.+-]+))?/i);
  const rotate = value?.match(/rotate\(\s*([\d.+-]+)/i);
  const x = translate ? Number(translate[1]) : 0;
  const y = translate?.[2] ? Number(translate[2]) : 0;
  const rotation = rotate ? Number(rotate[1]) : 0;
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0, rotation: Number.isFinite(rotation) ? rotation : 0 };
}
