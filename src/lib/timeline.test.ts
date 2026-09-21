import { describe, expect, test } from "bun:test";
import { clampPx, DAY, FIT_MARGIN_DAYS, fitToRange, MAX_PX_PER_DAY, MIN_PX_PER_DAY, scaleFor } from "./timeline";

const T0 = new Date(2026, 0, 1).getTime();
const range = (days: number, from = T0) => ({ from, to: from + days * DAY });

describe("fitToRange: the timescale and its margin", () => {
  test.each([
    ["six weeks", 40, "day", 3],
    ["six months", 180, "week", 7],
    ["nine months", 270, "month", 30],
    ["eighteen months", 540, "quarter", 91],
  ] as const)("%s: shown in %ss, with a margin of %i days each side", (_name, days, unit, margin) => {
    const { from, to } = range(days);
    const fit = fitToRange(from, to, 900);
    expect(fit.unit).toBe(unit);
    expect(scaleFor(fit.pxPerDay).bottom).toBe(unit);
    expect(fit.start).toBe(from - margin * DAY);
    expect(fit.end).toBe(to + margin * DAY);
    expect(fit.pxPerDay).toBeCloseTo(900 / (days + 2 * margin), 10);
  });

  test("the window fills the chart exactly: the zoom times the window's length is the view width", () => {
    const { from, to } = range(200);
    const fit = fitToRange(from, to, 1234);
    expect(fit.pxPerDay * ((fit.end - fit.start) / DAY)).toBeCloseTo(1234, 6);
  });

  test("the day / week boundary: 14 px per day is still days, a hair less is weeks", () => {
    // 1400 px view: days need a window of at most 100 days, i.e. a period of 94 days plus 3 either side
    const inside = range(94);
    expect(fitToRange(inside.from, inside.to, 1400).unit).toBe("day");
    expect(fitToRange(inside.from, inside.to, 1400).pxPerDay).toBeCloseTo(14, 10);
    const outside = range(95);
    const fit = fitToRange(outside.from, outside.to, 1400);
    expect(fit.unit).toBe("week");
    expect(fit.start).toBe(outside.from - 7 * DAY); // and it is the week margin, not the day one
  });

  test("the week / month boundary: 3.5 px per day", () => {
    // 700 px view: weeks need a window of at most 200 days: a 186-day period plus 7 either side
    const w = range(186);
    expect(fitToRange(w.from, w.to, 700).unit).toBe("week");
    const m = range(187);
    expect(fitToRange(m.from, m.to, 700).unit).toBe("month");
  });

  test("the month / quarter boundary: 1.6 px per day", () => {
    // 800 px view: months need a window of at most 500 days: a 440-day period plus 30 either side
    const m = range(440);
    expect(fitToRange(m.from, m.to, 800).unit).toBe("month");
    const q = range(441);
    const fit = fitToRange(q.from, q.to, 800);
    expect(fit.unit).toBe("quarter");
    expect(fit.start).toBe(q.from - 91 * DAY);
  });

  test("whatever the period and the window, the timescale it lands in is the one whose margin it used", () => {
    for (const width of [300, 640, 900, 1400, 2400]) {
      for (let days = 1; days <= 4000; days += 7) {
        const { from, to } = range(days);
        const fit = fitToRange(from, to, width);
        expect(scaleFor(fit.pxPerDay).bottom).toBe(fit.unit);
        expect(fit.start).toBeLessThanOrEqual(from - FIT_MARGIN_DAYS[fit.unit] * DAY);
        expect(fit.end).toBeGreaterThanOrEqual(to + FIT_MARGIN_DAYS[fit.unit] * DAY);
        expect(fit.pxPerDay).toBe(clampPx(fit.pxPerDay));
      }
    }
  });
});

describe("fitToRange: the limits", () => {
  test("a one-day period stops at the maximum zoom and is centred with room either side", () => {
    const { from, to } = range(1);
    const fit = fitToRange(from, to, 900);
    expect(fit.pxPerDay).toBe(MAX_PX_PER_DAY);
    expect(fit.unit).toBe("day");
    expect(fit.start).toBeLessThan(from - 3 * DAY);
    expect(fit.end).toBeGreaterThan(to + 3 * DAY);
    expect((fit.start + fit.end) / 2).toBeCloseTo((from + to) / 2, 0);
    expect(((fit.end - fit.start) / DAY) * fit.pxPerDay).toBeCloseTo(900, 6);
  });

  test("a period too long for the minimum zoom is shown at the minimum, from its start", () => {
    const { from, to } = range(365 * 30);
    const fit = fitToRange(from, to, 900);
    expect(fit.pxPerDay).toBe(MIN_PX_PER_DAY);
    expect(fit.unit).toBe("quarter");
    expect(fit.start).toBe(from - 91 * DAY);
  });

  test("a tiny or zero-width view doesn't produce NaN or Infinity", () => {
    const { from, to } = range(30);
    for (const w of [0, -5, 1]) {
      const fit = fitToRange(from, to, w);
      expect(Number.isFinite(fit.pxPerDay)).toBe(true);
      expect(Number.isFinite(fit.start)).toBe(true);
      expect(Number.isFinite(fit.end)).toBe(true);
    }
  });
});
