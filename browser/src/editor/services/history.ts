import type { Canvas, FabricObject } from "fabric";

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

type CanvasObjectEvent = {
  target: FabricObject;
};

export class EditorHistory {
  private snapshots: string[] = [];
  private index = -1;
  private muted = 0;
  private scheduled = false;
  private readonly disposers: VoidFunction[];

  constructor(
    private readonly canvas: Canvas,
    private readonly onChange: (state: HistoryState) => void,
    private readonly limit = 60,
    private readonly shouldTrack: (event: CanvasObjectEvent) => boolean = () => true,
  ) {
    const schedule = (event: CanvasObjectEvent): void => {
      if (this.shouldTrack(event)) this.scheduleCapture();
    };
    this.disposers = [
      canvas.on("object:added", schedule),
      canvas.on("object:removed", schedule),
      canvas.on("object:modified", schedule),
    ];
  }

  dispose(): void {
    this.disposers.forEach((dispose) => dispose());
  }

  capture(): void {
    if (this.muted > 0) return;
    const snapshot = JSON.stringify(this.canvas.toObject(["data"]));
    if (snapshot === this.snapshots[this.index]) return;
    this.snapshots.splice(this.index + 1);
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.limit) this.snapshots.shift();
    this.index = this.snapshots.length - 1;
    this.emit();
  }

  scheduleCapture(): void {
    if (this.muted > 0 || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.capture();
    });
  }

  async undo(): Promise<void> {
    if (this.index <= 0) return;
    await this.restore(this.index - 1);
  }

  async redo(): Promise<void> {
    if (this.index >= this.snapshots.length - 1) return;
    await this.restore(this.index + 1);
  }

  async transaction<T>(action: () => T | Promise<T>): Promise<T> {
    this.muted += 1;
    try {
      return await action();
    } finally {
      this.muted -= 1;
      if (this.muted === 0) this.capture();
    }
  }

  private async restore(index: number): Promise<void> {
    const snapshot = this.snapshots[index];
    if (!snapshot) return;
    this.muted += 1;
    try {
      this.canvas.discardActiveObject();
      await this.canvas.loadFromJSON(snapshot);
      this.canvas.requestRenderAll();
      this.index = index;
    } finally {
      this.muted -= 1;
      this.emit();
    }
  }

  private emit(): void {
    this.onChange({
      canUndo: this.index > 0,
      canRedo: this.index >= 0 && this.index < this.snapshots.length - 1,
    });
  }
}
