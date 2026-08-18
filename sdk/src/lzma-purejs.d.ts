declare module "lzma-purejs" {
  export interface LzmaOptions {
    a: 0 | 1 | 2;
    d: number;
    fb: number;
    mf: "bt2" | "bt4";
    lc: number;
    lp: number;
    pb: number;
    eos: boolean;
  }

  export interface ByteOutputStream {
    writeByte(value: number): void;
  }

  export interface LzmaApi {
    compressFile(
      input: Uint8Array,
      output?: ByteOutputStream,
      properties?: Partial<LzmaOptions>,
      progress?: (inputSize: number, outputSize: number) => void,
    ): Uint8Array | true;
  }

  const lzma: LzmaApi;
  export default lzma;
}
