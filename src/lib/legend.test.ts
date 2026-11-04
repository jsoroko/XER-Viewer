import { describe, expect, test } from "bun:test";
import { buildLegend, type LegendState } from "./legend";

const off: LegendState = { today: false, nonWorking: false, links: false, trace: false, droppedPath: false, compare: null };
const keys = (s: LegendState) => buildLegend(s).flatMap((g) => g.entries.map((e) => e.key));
const titles = (s: LegendState) => buildLegend(s).map((g) => g.title);

describe("buildLegend", () => {
  test("by default: progress colours, the other bars and the data date, nothing else", () => {
    expect(titles(off)).toEqual(["Progress", "Other bars", "Lines and shading"]);
    expect(keys(off)).toEqual(["complete", "actual", "remaining", "critical", "loe", "wbs", "milestone", "dataDate"]);
  });

  test("lines and shading are listed only while they are on the chart", () => {
    expect(keys({ ...off, today: true })).toContain("today");
    expect(keys({ ...off, nonWorking: true })).toContain("nonWorking");
    expect(keys({ ...off, links: true })).toEqual(expect.arrayContaining(["predecessor", "successor"]));
    for (const k of ["today", "nonWorking", "predecessor", "successor"] as const) expect(keys(off)).not.toContain(k);
  });

  test("a trace adds its own group, and dropped steps are listed only when there are some", () => {
    expect(titles({ ...off, trace: true })).toContain("Trace");
    expect(keys({ ...off, trace: true })).toContain("tracedPath");
    expect(keys({ ...off, trace: true })).not.toContain("droppedPath");
    expect(keys({ ...off, trace: true, droppedPath: true })).toContain("droppedPath");
    expect(titles(off)).not.toContain("Trace");
  });

  test("while comparing, kind of change replaces progress, and the row markers are explained", () => {
    const k = keys({ ...off, compare: { baseline: true } });
    expect(k).toEqual(expect.arrayContaining(["new", "modified", "removed", "unchanged", "baseline", "markNew", "markRemoved", "markModified"]));
    for (const gone of ["complete", "actual", "remaining", "critical"] as const) expect(k).not.toContain(gone);
    expect(titles({ ...off, compare: { baseline: true } })[0]).toBe("Compared with the baseline");
  });

  test("the baseline bar is listed only when baseline bars are drawn", () => {
    expect(keys({ ...off, compare: { baseline: false } })).not.toContain("baseline");
  });

  test("no group is ever empty, and no entry is listed twice", () => {
    const all = buildLegend({ today: true, nonWorking: true, links: true, trace: true, droppedPath: true, compare: { baseline: true } });
    for (const g of all) expect(g.entries.length).toBeGreaterThan(0);
    const k = all.flatMap((g) => g.entries.map((e) => e.key));
    expect(new Set(k).size).toBe(k.length);
  });
});
