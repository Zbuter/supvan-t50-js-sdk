import { describe, expect, it } from "vitest";

import { toThermalPixels } from "../src/editor/services/monochrome";

describe("thermal image conversion", () => {
  it("converts colored and translucent pixels to black or white", () => {
    const source = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 0, 0, 128,
      255, 255, 255, 255,
    ]);

    expect(Array.from(toThermalPixels(source))).toEqual([
      0, 0, 0, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]);
  });
});
