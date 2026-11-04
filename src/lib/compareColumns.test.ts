import { describe, expect, test } from "bun:test";
import { classify, DEFAULT_FIELDS, matchSchedules } from "./compare";
import { COMPARE_COLUMNS, compareColumnCell, DEFAULT_COMPARE_COLUMNS } from "./compareColumns";
import { schedule } from "./xerFixture";

const A = { id: "1", code: "A", start: "2026-01-05 08:00", end: "2026-01-16 17:00" };
const B = { id: "2", code: "B", start: "2026-01-19 08:00", end: "2026-02-13 17:00", dur: 160 };
const C = { id: "3", code: "C", start: "2026-02-16 08:00", end: "2026-03-13 17:00" };
const NEW = { id: "4", code: "N", start: "2026-03-16 08:00", end: "2026-03-20 17:00" };

const baseline = schedule([A, B, C]);
// B finishes three weeks later and is longer (20 working days, was 20; now 25), C is gone, N is new, A is untouched.
const current = schedule([A, { ...B, end: "2026-03-06 17:00", dur: 200 }, NEW]);
const matched = matchSchedules(baseline, current);
const { changes } = classify(matched, DEFAULT_FIELDS);
const cell = (key: Parameters<typeof compareColumnCell>[0], code: string) => {
  const a = matched.schedule.activities.find((x) => x.code === code)!;
  return compareColumnCell(key, a, changes.get(a.id) ?? null);
};

describe("compare columns", () => {
  test("six columns with distinct keys, and the defaults are among them", () => {
    expect(new Set(COMPARE_COLUMNS.map((c) => c.key)).size).toBe(6);
    for (const k of DEFAULT_COMPARE_COLUMNS) expect(COMPARE_COLUMNS.map((c) => c.key)).toContain(k);
  });

  test("baseline columns show the baseline's dates and duration", () => {
    expect(cell("baseStart", "B").text).toBe("19-Jan-26");
    expect(cell("baseFinish", "B").text).toBe("13-Feb-26");
    expect(cell("baseDur", "B").text).toBe("20d");
  });

  test("a change in a date is in calendar days, later or earlier", () => {
    expect(cell("dFinish", "B")).toEqual({ text: "+21d", tone: "later" });
    expect(cell("dStart", "B")).toEqual({ text: "–", tone: null });
  });

  test("an earlier date is negative", () => {
    const early = schedule([A, { ...B, start: "2026-01-12 08:00" }]);
    const m = matchSchedules(schedule([A, B]), early);
    const b = m.schedule.activities.find((x) => x.code === "B")!;
    expect(compareColumnCell("dStart", b, classify(m, DEFAULT_FIELDS).changes.get(b.id)!)).toEqual({ text: "−7d", tone: "earlier" });
  });

  test("a change in duration is in the activity's own working days", () => {
    expect(cell("dDur", "B")).toEqual({ text: "+5d", tone: "later" });
    expect(cell("dDur", "A")).toEqual({ text: "–", tone: null });
  });

  test("an unchanged activity has a baseline and no change", () => {
    expect(cell("baseFinish", "A").text).toBe("16-Jan-26");
    expect(cell("dFinish", "A")).toEqual({ text: "–", tone: null });
  });

  test("a new activity has no baseline and says it is new; a removed one says so and keeps its old dates", () => {
    expect(cell("baseStart", "N").text).toBe("");
    expect(cell("dFinish", "N")).toEqual({ text: "new", tone: "new" });
    expect(cell("dDur", "N").text).toBe("");
    expect(cell("baseFinish", "C").text).toBe("13-Mar-26");
    expect(cell("dFinish", "C")).toEqual({ text: "removed", tone: "removed" });
  });

  test("nothing to show when the activity has no comparison", () => {
    const a = matched.schedule.activities[0]!;
    expect(compareColumnCell("baseStart", a, null)).toEqual({ text: "", tone: null });
  });
});
