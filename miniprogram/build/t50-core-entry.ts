import qrcode from "qrcode-generator";
import {
  decodeLabelTransfer as decodeSdkLabelTransfer,
  encodeLabelTransfer as encodeSdkLabelTransfer,
  type LabelTransferPackage,
} from "../../sdk/src/label/clipboard";

export { BlePrinter } from "../../sdk/src/printer/ble-printer";
export { PaperType, PrinterState } from "../../sdk/src/types";

class MiniProgramTextEncoder {
  encode(value = ""): Uint8Array {
    const bytes: number[] = [];
    for (const character of String(value)) {
      const code = character.codePointAt(0) ?? 0;
      if (code <= 0x7f) bytes.push(code);
      else if (code <= 0x7ff) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      else if (code <= 0xffff) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
    return new Uint8Array(bytes);
  }
}

class MiniProgramTextDecoder {
  decode(input: ArrayBuffer | ArrayBufferView = new Uint8Array()): string {
    const bytes = input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    let result = "";
    for (let index = 0; index < bytes.length;) {
      const first = bytes[index++] ?? 0;
      let code = first;
      if ((first & 0xe0) === 0xc0) code = ((first & 0x1f) << 6) | ((bytes[index++] ?? 0) & 0x3f);
      else if ((first & 0xf0) === 0xe0) code = ((first & 0x0f) << 12) | (((bytes[index++] ?? 0) & 0x3f) << 6) | ((bytes[index++] ?? 0) & 0x3f);
      else if ((first & 0xf8) === 0xf0) code = ((first & 0x07) << 18) | (((bytes[index++] ?? 0) & 0x3f) << 12) | (((bytes[index++] ?? 0) & 0x3f) << 6) | ((bytes[index++] ?? 0) & 0x3f);
      result += String.fromCodePoint(code);
    }
    return result;
  }
}

const runtime = globalThis as typeof globalThis & {
  TextEncoder?: typeof TextEncoder;
  TextDecoder?: typeof TextDecoder;
};
if (!runtime.TextEncoder) runtime.TextEncoder = MiniProgramTextEncoder as unknown as typeof TextEncoder;
if (!runtime.TextDecoder) runtime.TextDecoder = MiniProgramTextDecoder as unknown as typeof TextDecoder;

export function encodeLabelTransfer(input: LabelTransferPackage): string {
  return encodeSdkLabelTransfer(input);
}

export function decodeLabelTransfer(value: string): LabelTransferPackage {
  return decodeSdkLabelTransfer(value);
}

export interface QrMatrix {
  size: number;
  modules: boolean[];
}

export function createQrMatrix(content: string, level: "L" | "M" | "Q" | "H" = "M"): QrMatrix {
  const code = qrcode(0, level);
  code.addData(content || " ", "Byte");
  code.make();
  const size = code.getModuleCount();
  const modules: boolean[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) modules.push(code.isDark(row, column));
  }
  return { size, modules };
}
