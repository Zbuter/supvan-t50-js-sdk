import { describe, expect, it } from "vitest";

import { buildRulerScale, RULER_SIZE } from "../src/editor/services/ruler";

describe("editor ruler scale", () => {
  it("uses millimeter spacing and labels major ticks", () => {
    const scale = buildRulerScale(40, 320);

    expect(RULER_SIZE).toBe(28);
    expect(scale.minorStep).toBe(1);
    expect(scale.majorStep).toBe(5);
    expect(scale.ticks.filter(({ major }) => major).map(({ value }) => value)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40]);
  });

  it("widens the interval when the preview is very small", () => {
    const scale = buildRulerScale(50, 40);

    expect(scale.minorStep).toBe(10);
    expect(scale.majorStep).toBe(50);
    expect(scale.ticks.map(({ value }) => value)).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it("keeps the physical endpoint available for custom sizes", () => {
    const scale = buildRulerScale(37.5, 300);
    const endpoint = scale.ticks.at(-1);

    expect(endpoint).toMatchObject({ value: 37.5, position: 300 });
  });
});
