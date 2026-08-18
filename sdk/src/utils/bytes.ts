import { ValidationError } from "../errors";

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function sum16(data: Uint8Array, start = 0, end = data.length): number {
  let result = 0;
  for (let index = start; index < end; index += 1) result += data[index] ?? 0;
  return result & 0xffff;
}

export function assertUInt(value: number, bits: 8 | 16 | 32, name: string): void {
  const max = bits === 32 ? 0xffffffff : 2 ** bits - 1;
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new ValidationError(`${name} 必须符合 uint${bits}`);
  }
}

export function readU16LE(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
}

export function readI16LE(data: Uint8Array, offset: number): number {
  const value = readU16LE(data, offset);
  return value & 0x8000 ? value - 0x10000 : value;
}

export function readU32LE(data: Uint8Array, offset: number): number {
  return (
    (data[offset] ?? 0) +
    (data[offset + 1] ?? 0) * 0x100 +
    (data[offset + 2] ?? 0) * 0x10000 +
    (data[offset + 3] ?? 0) * 0x1000000
  );
}

export function writeU16LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >>> 8) & 0xff;
}

export function writeU64LE(data: Uint8Array, offset: number, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError("64 位长度必须是非负安全整数");
  }
  let remaining = value;
  for (let index = 0; index < 8; index += 1) {
    data[offset + index] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }
}

export function toHex(data: Uint8Array): string {
  return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
