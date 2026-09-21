import { describe, expect, test } from "bun:test";
import { buildRows, endOfDay, makePredicate, matchesDateRange, toDateRange } from "./scheduleRows";
import { buildSchedule, listProjects, type Activity } from "./xer/model";
import { parseXer } from "./xer/parse";

const sampleText = await Bun.file(new URL("../sample/sample.xer", import.meta.url)).text();

const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h).getTime();
const act = (start: number | null, finish: number | null) => ({ start, finish }) as Activity;

describe("toDateRange", () => {
  test("is null with no dates, whole-day inclusive otherwise", () => {
    expect(toDateRange("", "", "active")).toBeNull();
    const r = toDateRange("2026-04-01", "2026-04-30", "active");
    expect(r).toEqual({ from: d(2026, 4, 1), to: endOfDay(d(2026, 4, 30)), mode: "active" });
    expect((r as { to: number }).to).toBe(d(2026, 5, 1) - 1);
  });

  test("supports open-ended ranges", () => {
    expect(toDateRange("2026-04-01", "", "starts")).toEqual({ from: d(2026, 4, 1), to: null, mode: "starts" });
    expect(toDateRange("", "2026-04-01", "starts")).toEqual({ from: null, to: endOfDay(d(2026, 4, 1)), mode: "starts" });
  });

  test("flags From after To, but accepts a single-day range", () => {
    expect(toDateRange("2026-05-01", "2026-04-01", "active")).toBe("invalid");
    expect(toDateRange("2026-04-01", "2026-04-01", "active")).not.toBe("invalid");
  });
});

describe("matchesDateRange", () => {
  const range = toDateRange("2026-04-10", "2026-04-20", "active") as Exclude<ReturnType<typeof toDateRange>, "invalid" | null>;
  const mode = (m: "active" | "starts" | "finishes") => ({ ...range, mode: m });

  test("active: any overlap counts, including bars that span the whole range", () => {
    expect(matchesDateRange(act(d(2026, 4, 1), d(2026, 4, 12)), range)).toBe(true); // starts before, ends inside
    expect(matchesDateRange(act(d(2026, 4, 15), d(2026, 4, 30)), range)).toBe(true); // starts inside, ends after
    expect(matchesDateRange(act(d(2026, 3, 1), d(2026, 6, 1)), range)).toBe(true); // spans it
    expect(matchesDateRange(act(d(2026, 4, 1), d(2026, 4, 9, 17)), range)).toBe(false); // ends the day before
    expect(matchesDateRange(act(d(2026, 4, 21), d(2026, 4, 25)), range)).toBe(false); // starts the day after
  });

  test("the last day of the range includes activities that start late that day", () => {
    expect(matchesDateRange(act(d(2026, 4, 20, 16), d(2026, 4, 22)), range)).toBe(true);
  });

  test("starts / finishes look at one date only", () => {
    const span = act(d(2026, 4, 1), d(2026, 4, 30));
    expect(matchesDateRange(span, mode("active"))).toBe(true);
    expect(matchesDateRange(span, mode("starts"))).toBe(false);
    expect(matchesDateRange(span, mode("finishes"))).toBe(false);
    expect(matchesDateRange(act(d(2026, 4, 12), d(2026, 4, 30)), mode("starts"))).toBe(true);
    expect(matchesDateRange(act(d(2026, 4, 1), d(2026, 4, 12)), mode("finishes"))).toBe(true);
  });

  test("open-ended bounds and undated activities", () => {
    const after = { from: d(2026, 4, 10), to: null, mode: "active" as const };
    expect(matchesDateRange(act(d(2030, 1, 1), d(2030, 2, 1)), after)).toBe(true);
    expect(matchesDateRange(act(d(2026, 1, 1), d(2026, 4, 9)), after)).toBe(false);
    expect(matchesDateRange(act(null, null), after)).toBe(false);
  });
});

describe("makePredicate with a date range", () => {
  const xer = parseXer(sampleText);
  const schedule = buildSchedule(xer, listProjects(xer)[0]!.id);
  const range = toDateRange("2026-04-13", "2026-04-17", "active") as Exclude<ReturnType<typeof toDateRange>, "invalid" | null>;

  test("a range alone creates a filter; none creates no filter", () => {
    expect(makePredicate("all", "", null)).toBeNull();
    expect(makePredicate("all", "", range)).not.toBeNull();
  });

  test("selects exactly the activities whose bars overlap the range", () => {
    const pred = makePredicate("all", "", range)!;
    const expected = schedule.activities.filter((a) => a.start !== null && a.finish !== null && a.start <= range.to! && a.finish >= range.from!);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(schedule.activities.length);
    expect(schedule.activities.filter(pred).map((a) => a.id)).toEqual(expected.map((a) => a.id));
  });

  test("combines with the other filters and the search box", () => {
    const inRange = schedule.activities.filter(makePredicate("all", "", range)!);
    const critical = schedule.activities.filter(makePredicate("critical", "", range)!);
    expect(critical.every((a) => a.critical)).toBe(true);
    expect(critical.length).toBeLessThanOrEqual(inRange.length);
    const named = schedule.activities.filter(makePredicate("all", "slab", range)!);
    expect(named.every((a) => /slab/i.test(a.name))).toBe(true);
  });

  test("rows keep only the WBS branches that contain matches", () => {
    const rows = buildRows(schedule.roots, new Set(), makePredicate("all", "", range));
    const tasks = rows.filter((r) => r.kind === "task");
    expect(tasks.length).toBe(schedule.activities.filter(makePredicate("all", "", range)!).length);
    expect(rows.filter((r) => r.kind === "wbs").length).toBeLessThan(schedule.stats.wbsNodes);
  });
});
