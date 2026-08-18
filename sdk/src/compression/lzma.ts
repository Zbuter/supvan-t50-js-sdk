import lzma from "lzma-purejs";

import { LZMA_ALONE_HEADER, LZMA_DICTIONARY_SIZE } from "../constants";
import { ValidationError } from "../errors";
import { concatBytes, readU32LE } from "../utils/bytes";

export const SUPVAN_LZMA_OPTIONS = Object.freeze({
  a: 2 as const,
  d: 13,
  fb: 128,
  mf: "bt4" as const,
  lc: 3,
  lp: 0,
  pb: 2,
  // Python/liblzma emits the end marker even though LZMA-Alone carries a size.
  eos: true,
});

export function lzmaCompress(source: Uint8Array): Uint8Array {
  const bytes: number[] = [];
  const output = {
    writeByte(value: number): void {
      bytes.push(value & 0xff);
    },
  };
  lzma.compressFile(source, output, SUPVAN_LZMA_OPTIONS);
  const result = Uint8Array.from(bytes);
  if (
    result.length < 13 ||
    LZMA_ALONE_HEADER.some((value, index) => result[index] !== value) ||
    readU32LE(result, 5) !== source.length ||
    readU32LE(result, 9) !== 0
  ) {
    throw new ValidationError("LZMA-Alone 输出头与硕方协议不兼容");
  }
  return result;
}

export function lzmaCompressFrames(frames: readonly Uint8Array[]): Uint8Array {
  return lzmaCompress(concatBytes(frames));
}

export function inspectLzmaHeader(data: Uint8Array): {
  properties: number;
  dictionarySize: number;
  uncompressedSize: number;
} {
  if (data.length < 13) throw new ValidationError("LZMA-Alone 数据头不足 13 字节");
  return {
    properties: data[0] ?? 0,
    dictionarySize: readU32LE(data, 1),
    uncompressedSize: readU32LE(data, 5) + readU32LE(data, 9) * 0x100000000,
  };
}

export function assertSupvanLzmaHeader(data: Uint8Array): void {
  const header = inspectLzmaHeader(data);
  if (header.properties !== 0x5d || header.dictionarySize !== LZMA_DICTIONARY_SIZE) {
    throw new ValidationError("LZMA 属性必须为 0x5D，字典必须为 8192 字节");
  }
}
