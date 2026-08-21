import { ValidationError } from "../errors";
import { deserializeLabelDocument } from "./document";
import type { LabelDocument } from "./types";

export const LABEL_TRANSFER_MAGIC = "SUPVAN_LABEL" as const;
export const LABEL_TRANSFER_VERSION = 1 as const;
export const LABEL_TRANSFER_PREFIX = "SUPVAN1:";
export const MAX_LABEL_TRANSFER_LENGTH = 8 * 1024 * 1024;

export interface LabelTransferPackage {
  magic: typeof LABEL_TRANSFER_MAGIC;
  version: typeof LABEL_TRANSFER_VERSION;
  document: LabelDocument;
  source?: {
    app?: string;
    timestamp?: number;
  };
}

export function encodeLabelTransfer(input: LabelTransferPackage): string {
  const normalized = normalizePackage(input);
  const json = JSON.stringify(normalized);
  const encoded = `${LABEL_TRANSFER_PREFIX}${encodeBase64Url(new TextEncoder().encode(json))}`;
  if (encoded.length > MAX_LABEL_TRANSFER_LENGTH) throw new ValidationError("标签传输数据过大");
  return encoded;
}

export function decodeLabelTransfer(value: string): LabelTransferPackage {
  if (typeof value !== "string" || !value.startsWith(LABEL_TRANSFER_PREFIX)) {
    throw new ValidationError("不是受支持的硕方标签数据");
  }
  if (value.length > MAX_LABEL_TRANSFER_LENGTH) throw new ValidationError("标签传输数据过大");
  const encoded = value.slice(LABEL_TRANSFER_PREFIX.length);
  try {
    const bytes = decodeBase64Url(encoded);
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return normalizePackage(parsed);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("标签传输数据无法解析");
  }
}

function normalizePackage(value: unknown): LabelTransferPackage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("标签传输包格式无效");
  const source = value as Record<string, unknown>;
  if (source.magic !== LABEL_TRANSFER_MAGIC) throw new ValidationError("标签传输包标识无效");
  if (source.version !== LABEL_TRANSFER_VERSION) throw new ValidationError("不支持的标签传输版本");
  const document = deserializeLabelDocument(source.document);
  const rawSource = source.source;
  const packageSource = rawSource && typeof rawSource === "object" && !Array.isArray(rawSource)
    ? rawSource as Record<string, unknown>
    : undefined;
  return {
    magic: LABEL_TRANSFER_MAGIC,
    version: LABEL_TRANSFER_VERSION,
    document,
    source: packageSource
      ? {
        app: typeof packageSource.app === "string" ? packageSource.app : undefined,
        timestamp: typeof packageSource.timestamp === "number" && Number.isFinite(packageSource.timestamp) ? packageSource.timestamp : undefined,
      }
      : undefined,
  };
}

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeBase64Url(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += BASE64URL_ALPHABET[first >> 2];
    result += BASE64URL_ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) result += BASE64URL_ALPHABET[((second & 15) << 2) | ((third ?? 0) >> 6)];
    if (third !== undefined) result += BASE64URL_ALPHABET[third & 63];
  }
  return result;
}

function decodeBase64Url(value: string): Uint8Array {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new ValidationError("标签传输编码无效");
  const output = new Uint8Array(Math.floor(value.length * 6 / 8));
  let accumulator = 0;
  let bits = 0;
  let offset = 0;
  for (const character of value) {
    const digit = BASE64URL_ALPHABET.indexOf(character);
    accumulator = (accumulator << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[offset] = (accumulator >> bits) & 255;
      offset += 1;
    }
  }
  return output;
}
