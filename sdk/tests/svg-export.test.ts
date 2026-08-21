import { describe, expect, it } from "vitest";
import { createLabelDocument, labelDocumentToSvgString } from "../src/index";

describe("LabelDocument SVG export", () => {
  it("exports physical dimensions and core objects", () => {
    const svg = labelDocumentToSvgString(createLabelDocument(40, 30, [
      { id: "title", type: "text", x: 2, y: 2, width: 20, height: 5, text: "牛奶 & 酸奶", fontSize: 4 },
      { id: "box", type: "rectangle", x: 1, y: 1, width: 38, height: 28, stroke: "#000000", strokeWidth: 0.4 },
      { id: "qr", type: "qr", x: 30, y: 5, width: 8, height: 8, content: "https://example.com" },
    ]));
    expect(svg).toContain('width="40mm"');
    expect(svg).toContain('height="30mm"');
    expect(svg).toContain('viewBox="0 0 40 30"');
    expect(svg).toContain("牛奶 &amp; 酸奶");
    expect(svg).toContain("data-supvan-format=\"2\"");
    expect(svg).toContain('data-object-id="title"');
    expect(svg).toContain("<rect");
  });

  it("anchors centered and right-aligned text inside its object box", () => {
    const svg = labelDocumentToSvgString(createLabelDocument(40, 30, [
      { id: "center", type: "text", x: 8, y: 10, width: 24, height: 5, text: "收纳盒", fontSize: 4, align: "center" },
      { id: "right", type: "text", x: 8, y: 16, width: 24, height: 4, text: "日期", fontSize: 2.5, align: "right" },
    ]));
    expect(svg).toContain('data-object-id="center"');
    expect(svg).toContain('x="20"');
    expect(svg).toContain('data-object-id="right"');
    expect(svg).toContain('x="32"');
  });

  it("keeps inverted code backgrounds valid", () => {
    const svg = labelDocumentToSvgString(createLabelDocument(20, 20, [
      { id: "qr-inverted", type: "qr", x: 1, y: 1, width: 10, height: 10, content: "A", inverted: true },
      { id: "barcode-inverted", type: "barcode", format: "CODE_128", x: 1, y: 12, width: 18, height: 5, content: "123", inverted: true },
    ]));
    expect(svg).toContain('data-object-id="qr-inverted"');
    expect(svg).toContain('data-object-id="barcode-inverted"');
    expect(svg).not.toContain('white/>');
  });

  it("exports packed bitmap resources as black runs", () => {
    const svg = labelDocumentToSvgString({
      version: 1,
      width: 10,
      height: 10,
      objects: [{ id: "logo", type: "image", resourceId: "logo", x: 0, y: 0, width: 10, height: 10 }],
      resources: {
        bitmaps: { logo: { encoding: "bitset-v1", widthDots: 2, heightDots: 1, data: "cA==" } },
      },
    });
    expect(svg).toContain("data-supvan-bitmap=\"logo\"");
    expect(svg).toContain("<rect");
  });
});
