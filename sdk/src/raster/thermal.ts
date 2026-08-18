export const THERMAL_THRESHOLD = 190;

/** Convert RGBA pixels to opaque black/white pixels for thermal output. */
export function toThermalPixels(
  data: Uint8Array | Uint8ClampedArray,
  threshold = THERMAL_THRESHOLD,
): Uint8Array | Uint8ClampedArray {
  const output = data instanceof Uint8ClampedArray ? new Uint8ClampedArray(data) : new Uint8Array(data);
  if (output.length % 4 !== 0) throw new RangeError("RGBA 数据长度必须是 4 的倍数");
  for (let index = 0; index < output.length; index += 4) {
    const alpha = output[index + 3] ?? 255;
    const luminance = (output[index] ?? 0) * 0.299 + (output[index + 1] ?? 0) * 0.587 + (output[index + 2] ?? 0) * 0.114;
    const value = alpha < 16 || luminance >= threshold ? 255 : 0;
    output[index] = value;
    output[index + 1] = value;
    output[index + 2] = value;
    output[index + 3] = 255;
  }
  return output;
}
