import { describe, expect, it } from "vitest";

import { expandPrintPages, type RasterPage } from "../src";

function page(value: number): RasterPage {
  return { width: 1, height: 1, data: Uint8Array.of(value) };
}

describe("multi-page print jobs", () => {
  it("prints the full document once per copy by default", () => {
    const pages = expandPrintPages({ pages: [page(1), page(2)], settings: { copies: 2 } });
    expect(pages.map((item) => item.data[0])).toEqual([1, 2, 1, 2]);
  });

  it("groups copies by page when oneByOne is disabled", () => {
    const pages = expandPrintPages({
      pages: [page(1), page(2)],
      settings: { copies: 2, oneByOne: false },
    });
    expect(pages.map((item) => item.data[0])).toEqual([1, 1, 2, 2]);
  });

  it("combines per-page repeat with document copies", () => {
    const pages = expandPrintPages({
      pages: [{ ...page(1), repeat: 2 }, page(2)],
      settings: { copies: 2 },
    });
    expect(pages.map((item) => item.data[0])).toEqual([1, 1, 2, 1, 1, 2]);
  });
});
