import { describe, expect, it } from "vitest";
import {
  createLabelDocument,
  createLabelTemplate,
  deserializeLabelDocument,
  packMonochromeBitmap,
  resizeLabelDocument,
  resolveDocumentVariables,
  serializeLabelDocument,
  unpackMonochromeBitmap,
  validateLabelDocument,
} from "../src/index";

describe("LabelDocument", () => {
  it("round-trips a document and resolves variables", () => {
    const document = createLabelDocument(40, 30, [
      {
        id: "name",
        type: "text",
        x: 2,
        y: 2,
        width: 20,
        height: 6,
        text: "占位",
        fontSize: 4,
        bindings: [{ field: "text", variable: "product" }],
      },
    ], {
      variables: { product: { label: "商品", type: "text", value: "牛奶" } },
    });
    const restored = deserializeLabelDocument(serializeLabelDocument(document));
    expect(resolveDocumentVariables(restored).objects[0]).toMatchObject({ text: "牛奶" });
    expect(restored.width).toBe(40);
    expect(restored.height).toBe(30);
  });

  it("scales objects in millimetres", () => {
    const document = createLabelDocument(40, 30, [{ id: "text", type: "text", x: 4, y: 3, width: 10, height: 5, text: "A", fontSize: 2 }]);
    const resized = resizeLabelDocument(document, 80, 60, { mode: "scale-objects" });
    expect(resized.objects[0]).toMatchObject({ x: 8, y: 6, width: 20, height: 10, fontSize: 4 });
  });

  it("packs monochrome dots into a compact bitset", () => {
    const resource = packMonochromeBitmap(8, 2, Uint8Array.from([
      0, 255, 255, 0, 255, 255, 255, 255,
      255, 0, 0, 255, 255, 255, 255, 0,
    ]));
    expect(resource.encoding).toBe("bitset-v1");
    expect(resource.data).toMatch(/^(kGE=|9061)$/);
    expect(Array.from(unpackMonochromeBitmap(resource))).toEqual([
      0, 255, 255, 0, 255, 255, 255, 255,
      255, 0, 0, 255, 255, 255, 255, 0,
    ]);
  });

  it("rejects duplicate object ids", () => {
    expect(() => validateLabelDocument({
      version: 1,
      width: 40,
      height: 30,
      objects: [
        { id: "same", type: "line", x: 0, y: 0, width: 1, height: 1 },
        { id: "same", type: "line", x: 0, y: 1, width: 1, height: 1 },
      ],
    })).toThrow("ID 必须唯一");
  });

  it("clones templates before editing", () => {
    const template = createLabelTemplate("demo", "演示", createLabelDocument(40, 30, [
      { id: "text", type: "text", x: 1, y: 1, width: 10, height: 4, text: "模板", fontSize: 3 },
    ]));
    const object = template.document.objects[0];
    if (!object || object.type !== "text") throw new Error("模板对象类型错误");
    object.text = "已修改";
    expect(object).toMatchObject({ text: "已修改" });
  });
});
