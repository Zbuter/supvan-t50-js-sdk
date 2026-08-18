const THERMAL_THRESHOLD = 190;

/** Convert RGBA pixels to the black/white raster expected by a thermal head. */
export function toThermalPixels(data: Uint8ClampedArray, threshold = THERMAL_THRESHOLD): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data);
  for (let index = 0; index < output.length; index += 4) {
    const alpha = (data[index + 3] ?? 255) / 255;
    const luminance =
      (data[index] ?? 0) * 0.299 +
      (data[index + 1] ?? 0) * 0.587 +
      (data[index + 2] ?? 0) * 0.114;
    const composite = luminance * alpha + 255 * (1 - alpha);
    const value = composite < threshold ? 0 : 255;
    output[index] = value;
    output[index + 1] = value;
    output[index + 2] = value;
    output[index + 3] = 255;
  }
  return output;
}

export function createThermalCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建图片处理画布");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  image.data.set(toThermalPixels(image.data));
  context.putImageData(image, 0, 0);
  return canvas;
}
