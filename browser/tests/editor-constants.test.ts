import { describe, expect, it } from "vitest";

import { DEFAULT_LABEL_SIZE, LABEL_SIZES, MAX_AUTO_FIT_ZOOM } from "../src/editor/constants";

describe("editor label defaults", () => {
  it("provides the common landscape and portrait media sizes in order", () => {
    expect(LABEL_SIZES.map(({ width, height }) => [width, height])).toEqual([
      [30, 20],
      [40, 30],
      [50, 30],
      [50, 40],
      [40, 60],
      [50, 70],
      [50, 80],
    ]);
    expect(LABEL_SIZES.slice(0, 4).every(({ width, height }) => width > height)).toBe(true);
    expect(LABEL_SIZES.slice(4).every(({ width, height }) => width < height)).toBe(true);
  });

  it("defaults to 40 x 30 mm without auto-enlarging above 100 percent", () => {
    expect(DEFAULT_LABEL_SIZE).toMatchObject({ width: 40, height: 30 });
    expect(MAX_AUTO_FIT_ZOOM).toBe(1);
  });
});
