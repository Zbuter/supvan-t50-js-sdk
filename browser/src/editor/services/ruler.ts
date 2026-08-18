export const RULER_SIZE = 28;

const STEP_OPTIONS = [1, 2, 5, 10, 20, 50] as const;

export interface RulerTick {
  value: number;
  position: number;
  major: boolean;
  label: string;
}

export interface RulerScale {
  ticks: RulerTick[];
  minorStep: number;
  majorStep: number;
}

function chooseStep(pixelsPerMillimeter: number, minimumPixels: number): number {
  return STEP_OPTIONS.find((step) => step * pixelsPerMillimeter >= minimumPixels) ?? STEP_OPTIONS.at(-1)!;
}

function roundValue(value: number): number {
  return Math.round(value * 10) / 10;
}

function isMultiple(value: number, step: number): boolean {
  return Math.abs(value / step - Math.round(value / step)) < 0.0001;
}

export function buildRulerScale(lengthMillimeters: number, lengthPixels: number): RulerScale {
  const safeLength = Math.max(0, lengthMillimeters);
  const pixelsPerMillimeter = safeLength > 0 ? Math.max(0, lengthPixels) / safeLength : 0;
  const minorStep = chooseStep(pixelsPerMillimeter, 8);
  const majorStep = chooseStep(pixelsPerMillimeter, 40);
  const ticks: RulerTick[] = [];

  for (let index = 0; ; index += 1) {
    const value = roundValue(index * minorStep);
    if (value > safeLength + 0.0001) break;
    const position = safeLength > 0 ? Math.min(lengthPixels, (value / safeLength) * lengthPixels) : 0;
    ticks.push({ value, position, major: isMultiple(value, majorStep), label: `${value}` });
  }

  const lastTick = ticks.at(-1);
  if (safeLength > 0 && (!lastTick || Math.abs(lastTick.value - safeLength) > 0.0001)) {
    ticks.push({
      value: safeLength,
      position: Math.max(0, lengthPixels),
      major: false,
      label: `${roundValue(safeLength)}`,
    });
  }

  return { ticks, minorStep, majorStep };
}
