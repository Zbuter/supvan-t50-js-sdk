import { describe, expect, it } from "vitest";

import {
  LZMA_DICTIONARY_SIZE,
  assertSupvanLzmaHeader,
  inspectLzmaHeader,
  lzmaCompress,
} from "../src";
import { toHex } from "../src/utils/bytes";

describe("SUPVAN LZMA-Alone compatibility", () => {
  it("matches the Python SDK byte-for-byte for the reference frame", () => {
    const source = new Uint8Array(4096);
    source[0] = 1;

    const compressed = lzmaCompress(source);

    expect(toHex(compressed)).toBe(
      "5d0020000000100000000000000000804148018c2ebc50a133874bd40214b5f191e6226b47af576051ffea068000",
    );
  });

  it("uses the exact 0x5d property and 8192-byte dictionary header", () => {
    const compressed = lzmaCompress(new Uint8Array([1, 2, 3, 4]));
    assertSupvanLzmaHeader(compressed);
    expect(inspectLzmaHeader(compressed)).toEqual({
      properties: 0x5d,
      dictionarySize: LZMA_DICTIONARY_SIZE,
      uncompressedSize: 4,
    });
  });
});
