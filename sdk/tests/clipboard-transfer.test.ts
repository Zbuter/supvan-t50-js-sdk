import { describe, expect, it } from "vitest";
import { createLabelDocument, decodeLabelTransfer, encodeLabelTransfer, type LabelTransferPackage } from "../src/index";

describe("Label clipboard transfer", () => {
  it("round-trips a LabelDocument through the SUPVAN1 format", () => {
    const pkg: LabelTransferPackage = {
      magic: "SUPVAN_LABEL",
      version: 1,
      document: createLabelDocument(40, 30, [
        { id: "title", type: "text", x: 2, y: 3, width: 20, height: 5, text: "咖啡豆", fontSize: 4 },
      ]),
      source: { app: "browser", timestamp: 123 },
    };
    const encoded = encodeLabelTransfer(pkg);
    expect(encoded.startsWith("SUPVAN1:")).toBe(true);
    expect(decodeLabelTransfer(encoded)).toEqual(pkg);
  });

  it("rejects non-transfer clipboard text", () => {
    expect(() => decodeLabelTransfer("普通文本")).toThrow("不是受支持的硕方标签数据");
  });
});
