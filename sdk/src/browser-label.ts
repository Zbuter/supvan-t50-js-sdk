import type { PrinterProfile } from "./protocol/profile";
import { SUPVAN_T50_PROFILE } from "./protocol/profile";
import { labelDocumentToDrawPage, type LabelDrawAdapterOptions } from "./draw/label-renderer";
import { previewDrawPage, type BrowserPreviewOptions } from "./browser-preview";
import { unpackMonochromeBitmap } from "./label/bitmap";
import type { LabelDocument } from "./label/types";

export interface BrowserLabelPreviewOptions extends BrowserPreviewOptions, LabelDrawAdapterOptions {
  profile?: PrinterProfile;
}

export function previewLabelDocument(document: LabelDocument, options: BrowserLabelPreviewOptions = {}): HTMLCanvasElement {
  const page = labelDocumentToDrawPage(document, {
    ...options,
    resolveImage: options.resolveImage ?? defaultBitmapResolver,
  });
  return previewDrawPage(page, { ...options, profile: options.profile ?? SUPVAN_T50_PROFILE });
}

function defaultBitmapResolver(resourceId: string, label: LabelDocument): CanvasImageSource | undefined {
  const resource = label.resources?.bitmaps?.[resourceId];
  if (!resource) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = resource.widthDots;
  canvas.height = resource.heightDots;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  const pixels = unpackMonochromeBitmap(resource);
  const image = context.createImageData(resource.widthDots, resource.heightDots);
  for (let index = 0; index < pixels.length; index += 1) {
    const value = pixels[index]!;
    image.data[index * 4] = value;
    image.data[index * 4 + 1] = value;
    image.data[index * 4 + 2] = value;
    image.data[index * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}
