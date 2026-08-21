import { ValidationError } from "./errors";

export interface PageJobSettings {
  copies?: number;
  oneByOne?: boolean;
}

export interface PageJob<TPage, TSettings extends PageJobSettings = PageJobSettings> {
  pages: TPage[];
  settings?: TSettings;
}

export interface RepeatablePage {
  repeat?: number;
}

export interface ExpandPageJobOptions<TPage> {
  taskName?: string;
  validatePage?: (page: TPage) => void;
}

/**
 * Expands logical pages into physical page order shared by print and preview.
 */
export function expandPageJob<
  TPage extends RepeatablePage,
  TSettings extends PageJobSettings = PageJobSettings,
>(job: PageJob<TPage, TSettings>, options: ExpandPageJobOptions<TPage> = {}): TPage[] {
  const taskName = options.taskName ?? "任务";
  if (job.pages.length === 0) throw new ValidationError(`${taskName}至少需要一页`);

  const copies = job.settings?.copies ?? 1;
  if (!Number.isInteger(copies) || copies < 1 || copies > 99) {
    throw new ValidationError(`${taskName} copies 必须是 1-99 的整数`);
  }

  const repeated = job.pages.map((page) => {
    const repeat = page.repeat ?? 1;
    if (!Number.isInteger(repeat) || repeat < 1) {
      throw new ValidationError(`${taskName}页面 repeat 必须是正整数`);
    }
    options.validatePage?.(page);
    return { page, repeat };
  });

  const result: TPage[] = [];
  if (job.settings?.oneByOne ?? true) {
    for (let copy = 0; copy < copies; copy += 1) {
      for (const item of repeated) {
        for (let index = 0; index < item.repeat; index += 1) result.push(item.page);
      }
    }
  } else {
    for (const item of repeated) {
      for (let index = 0; index < item.repeat * copies; index += 1) result.push(item.page);
    }
  }
  return result;
}
