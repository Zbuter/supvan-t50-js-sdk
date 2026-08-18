import type { DrawObject } from "./types";

/** Small Canvas 2D surface shared by browser and mini-program contexts. */
export type DrawCanvasContext = Pick<CanvasRenderingContext2D,
  | "save" | "restore" | "translate" | "rotate" | "clearRect" | "fillRect" | "strokeRect"
  | "beginPath" | "moveTo" | "lineTo" | "stroke" | "fillText" | "measureText" | "drawImage"
> & {
  fillStyle: CanvasRenderingContext2D["fillStyle"];
  strokeStyle: CanvasRenderingContext2D["strokeStyle"];
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
};

export interface DrawRenderTarget {
  context: DrawCanvasContext;
  width: number;
  height: number;
}

export interface DrawRenderOptions {
  imageResolver?: (object: DrawObject) => CanvasImageSource | undefined;
}
