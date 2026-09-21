export const DAY = 86_400_000;

export type Unit = "day" | "week" | "month" | "quarter" | "year";

export interface Tick {
  x: number;
  w: number;
  label: string;
}

export interface Timeline {
  start: number;
  end: number;
  pxPerDay: number;
  width: number;
  x: (t: number) => number;
}

export const MIN_PX_PER_DAY = 0.2;
export const MAX_PX_PER_DAY = 40;

export const clampPx = (px: number) => Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, px));

export function makeTimeline(start: number, end: number, pxPerDay: number): Timeline {
  return {
    start,
    end,
    pxPerDay,
    width: Math.ceil(((end - start) / DAY) * pxPerDay),
    x: (t) => ((t - start) / DAY) * pxPerDay,
  };
}

/** Pads a schedule's extent out to whole months so the chart starts and ends on a boundary. */
export function paddedRange(range: { start: number; finish: number } | null) {
  const now = new Date();
  const from = new Date(range?.start ?? now.getTime());
  const to = new Date(range?.finish ?? now.getTime() + 90 * DAY);
  return {
    start: new Date(from.getFullYear(), from.getMonth(), 1).getTime(),
    end: new Date(to.getFullYear(), to.getMonth() + 2, 1).getTime(),
  };
}

function floorTo(t: number, unit: Unit): Date {
  const d = new Date(t);
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (unit) {
    case "day":
      return new Date(y, m, d.getDate());
    case "week":
      return new Date(y, m, d.getDate() - ((d.getDay() + 6) % 7));
    case "month":
      return new Date(y, m, 1);
    case "quarter":
      return new Date(y, Math.floor(m / 3) * 3, 1);
    case "year":
      return new Date(y, 0, 1);
  }
}

function next(d: Date, unit: Unit): Date {
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (unit) {
    case "day":
      return new Date(y, m, d.getDate() + 1);
    case "week":
      return new Date(y, m, d.getDate() + 7);
    case "month":
      return new Date(y, m + 1, 1);
    case "quarter":
      return new Date(y, m + 3, 1);
    case "year":
      return new Date(y + 1, 0, 1);
  }
}

const monthShort = new Intl.DateTimeFormat("en-GB", { month: "short" });
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });

const labelers: Record<Unit, (d: Date) => string> = {
  day: (d) => String(d.getDate()),
  week: (d) => String(d.getDate()),
  month: (d) => monthShort.format(d),
  quarter: (d) => `Q${Math.floor(d.getMonth() / 3) + 1}`,
  year: (d) => String(d.getFullYear()),
};
const topLabelers: Partial<Record<Unit, (d: Date) => string>> = {
  month: (d) => monthYear.format(d),
};

/** Picks the two header tiers that fit the current zoom. */
export function scaleFor(pxPerDay: number): { top: Unit; bottom: Unit } {
  if (pxPerDay >= 14) return { top: "month", bottom: "day" };
  if (pxPerDay >= 3.5) return { top: "month", bottom: "week" };
  if (pxPerDay >= 1.6) return { top: "year", bottom: "month" };
  return { top: "year", bottom: "quarter" };
}

function ticks(tl: Timeline, unit: Unit, top: boolean): Tick[] {
  const out: Tick[] = [];
  const label = (top ? topLabelers[unit] : undefined) ?? labelers[unit];
  for (let d = floorTo(tl.start, unit); d.getTime() < tl.end; ) {
    const n = next(d, unit);
    const x0 = Math.max(0, tl.x(d.getTime()));
    const x1 = Math.min(tl.width, tl.x(n.getTime()));
    if (x1 > x0) out.push({ x: x0, w: x1 - x0, label: label(d) });
    d = n;
  }
  return out;
}

export function buildTicks(tl: Timeline) {
  const { top, bottom } = scaleFor(tl.pxPerDay);
  return { top: ticks(tl, top, true), bottom: ticks(tl, bottom, false) };
}

// ---- Fit the chart to a period ---------------------------------------------------------------------------------

/** How much of the chart to show either side of a period: about one tick of the timescale the chart ends up in. */
export const FIT_MARGIN_DAYS = { day: 3, week: 7, month: 30, quarter: 91 } as const;
type FitUnit = keyof typeof FIT_MARGIN_DAYS;
const FIT_UNITS: readonly FitUnit[] = ["day", "week", "month", "quarter"];

export interface FitResult {
  /** The zoom that makes the window fill the view. */
  pxPerDay: number;
  /** The window to show, margins included (widened around the period when zoom is capped). */
  start: number;
  end: number;
  /** The bottom row of the timescale at that zoom, which the margin is measured in. */
  unit: FitUnit;
}

/**
 * Works out the zoom and window that show `from`..`to` (ms) in a chart `viewWidth` pixels wide, with one tick of margin
 * on each side. The margin depends on the timescale the chart shows and the timescale depends on the zoom, which
 * depends on the margin, so the finest timescale is tried first and the first one that stays true to its own margin
 * is kept. Coarser timescales have bigger margins and so lower zoom, which means one always fits.
 */
export function fitToRange(from: number, to: number, viewWidth: number): FitResult {
  const width = Math.max(1, viewWidth);
  const result = (unit: FitUnit): FitResult => {
    const margin = FIT_MARGIN_DAYS[unit] * DAY;
    let start = from - margin;
    let end = to + margin;
    const pxPerDay = clampPx(width / ((end - start) / DAY));
    // At the zoom limits the window may not fill the view: centre it rather than leaving it against one edge.
    const visible = (width / pxPerDay) * DAY;
    if (visible > end - start) {
      const mid = (start + end) / 2;
      start = mid - visible / 2;
      end = mid + visible / 2;
    }
    return { pxPerDay, start, end, unit };
  };
  for (const unit of FIT_UNITS) {
    const candidate = result(unit);
    if (scaleFor(candidate.pxPerDay).bottom === unit) return candidate;
  }
  return result("quarter");
}
