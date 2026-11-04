import { describe, expect, test } from "bun:test";
import { classify, DEFAULT_FIELDS, describeChange, fmtShift, isRemovedId, matchSchedules, orderByDataDate, shiftDays } from "./compare";
import { schedule } from "./xerFixture";

const A = { id: "101", code: "A1010", start: "2026-01-05 08:00", end: "2026-01-16 17:00" };
const B = { id: "102", code: "A1020", start: "2026-01-19 08:00", end: "2026-02-13 17:00" };
const C = { id: "103", code: "A1030", start: "2026-02-16 08:00", end: "2026-03-13 17:00" };

describe("matching and classifying", () => {
  test("matches by Activity ID, not by database id", () => {
    const baseline = schedule([A, B]);
    // The same activities, exported again with different database ids.
    const current = schedule([{ ...A, id: "9001" }, { ...B, id: "9002" }]);
    const result = classify(matchSchedules(baseline, current), DEFAULT_FIELDS);
    expect(result.counts).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 2 });
  });

  test("finds added, removed, modified and unchanged activities", () => {
    const baseline = schedule([A, B, C]);
    const current = schedule([A, { ...B, end: "2026-03-06 17:00" }, { id: "104", code: "A1040", start: "2026-03-16 08:00", end: "2026-03-27 17:00" }]);
    const matched = matchSchedules(baseline, current);
    const { changes, counts } = classify(matched, DEFAULT_FIELDS);
    expect(counts).toEqual({ added: 1, removed: 1, modified: 1, unchanged: 1 });
    expect(changes.get("101")!.kind).toBe("unchanged");
    expect(changes.get("102")).toMatchObject({ kind: "modified", fields: ["dates"] });
    expect(changes.get("104")!.kind).toBe("added");
  });

  test("a removed activity is put back with a made-up id and its baseline dates", () => {
    const baseline = schedule([A, B]);
    const current = schedule([A]);
    const matched = matchSchedules(baseline, current);
    const [gone] = matched.removed;
    expect(isRemovedId(gone!.shown.id)).toBe(true);
    expect(gone!.shown.code).toBe("A1020");
    expect(gone!.shown.start).toBe(B_START);
    expect(matched.schedule.activities).toHaveLength(2);
    expect(matched.schedule.activityById.get(gone!.shown.id)).toBe(gone!.shown);
    // The current schedule itself is untouched.
    expect(current.activities).toHaveLength(1);
    expect(current.roots[0]!.activityCount).toBe(1);
  });

  test("a removed activity returns to the group with the same WBS code, and the group's totals include it", () => {
    const baseline = schedule([A, { ...B, wbs: "30" }]);
    const current = schedule([A]);
    const { schedule: merged, removed } = matchSchedules(baseline, current);
    const group = merged.wbs.get(removed[0]!.shown.wbsId)!;
    expect(group.code).toBe("B");
    expect(group.activities.map((a) => a.code)).toEqual(["A1020"]);
    expect(merged.roots[0]!.activityCount).toBe(2);
  });

  test("a removed activity whose group no longer exists goes under 'Removed activities'", () => {
    const baseline = schedule([A, { ...B, wbs: "30" }]);
    const current = schedule([A], [], [{ id: "20", parent: "10", code: "A" }]);
    const { schedule: merged, removed } = matchSchedules(baseline, current);
    const group = merged.wbs.get(removed[0]!.shown.wbsId)!;
    expect(group.name).toBe("Removed activities");
    expect(group.parentId).toBe("10");
    expect(merged.roots[0]!.children.map((c) => c.code)).toEqual(["A", "Removed"]);
  });

  test("the time axis is widened to reach a removed activity", () => {
    const baseline = schedule([A, { ...B, start: "2025-06-02 08:00", end: "2025-06-13 17:00" }]);
    const current = schedule([A]);
    const { schedule: merged } = matchSchedules(baseline, current);
    expect(merged.range!.start).toBe(new Date(2025, 5, 2, 8).getTime());
  });

  test("and to reach where an activity used to be, if it has moved a long way", () => {
    const baseline = schedule([A, { ...B, start: "2025-06-02 08:00", end: "2025-06-13 17:00" }]);
    const current = schedule([A, B]);
    const { schedule: merged } = matchSchedules(baseline, current);
    expect(merged.range!.start).toBe(new Date(2025, 5, 2, 8).getTime());
  });
});

const B_START = new Date(2026, 0, 19, 8).getTime();

describe("what counts as a difference", () => {
  const base = schedule([A, B], [{ task: "102", pred: "101" }]);
  const run = (current: ReturnType<typeof schedule>, fields = DEFAULT_FIELDS) => classify(matchSchedules(base, current), fields).changes;

  test("duration", () => {
    const changes = run(schedule([A, { ...B, dur: 120 }], [{ task: "102", pred: "101" }]));
    expect(changes.get("102")).toMatchObject({ kind: "modified", fields: ["duration"] });
  });

  test("progress", () => {
    const changes = run(schedule([A, { ...B, status: "TK_Complete" }], [{ task: "102", pred: "101" }]));
    expect(changes.get("102")!.fields).toContain("progress");
  });

  test("a changed relationship type, a changed lag, an added link and a removed link are all logic changes", () => {
    const logic = (preds: Parameters<typeof schedule>[1]) => run(schedule([A, B], preds)).get("102")!;
    expect(logic([{ task: "102", pred: "101", type: "PR_SS" }])).toMatchObject({ kind: "modified", fields: ["logic"] });
    expect(logic([{ task: "102", pred: "101", lag: 16 }])).toMatchObject({ kind: "modified", fields: ["logic"] });
    expect(logic([{ task: "102", pred: "101" }, { task: "102", pred: "101", type: "PR_FF" }]).fields).toEqual(["logic"]);
    expect(logic([])).toMatchObject({ kind: "modified", fields: ["logic"] });
  });

  test("logic is compared by the predecessors' Activity IDs", () => {
    const current = schedule([{ ...A, id: "7" }, { ...B, id: "8" }], [{ task: "8", pred: "7" }]);
    expect(run(current).get("8")!.kind).toBe("unchanged");
  });

  test("constraints and names count only when switched on, and the others can be switched off", () => {
    const current = schedule([A, { ...B, cstr: "CS_MSO", name: "Renamed" }], [{ task: "102", pred: "101" }]);
    expect(run(current).get("102")).toMatchObject({ kind: "modified", fields: ["names"] });
    expect(run(current, { ...DEFAULT_FIELDS, constraints: true }).get("102")!.fields).toEqual(["constraints", "names"]);
    expect(run(current, { ...DEFAULT_FIELDS, names: false }).get("102")!.kind).toBe("unchanged");
  });

  test("a date moved to a different minute is still a change", () => {
    const changes = run(schedule([A, { ...B, start: "2026-01-19 09:00" }], [{ task: "102", pred: "101" }]));
    expect(changes.get("102")!.fields).toEqual(["dates"]);
  });
});

describe("describing a change", () => {
  const baseline = schedule([A, B], [{ task: "102", pred: "101" }]);
  const current = schedule([A, { ...B, end: "2026-03-06 17:00", dur: 120 }, C], [{ task: "102", pred: "101", lag: 8 }, { task: "103", pred: "102" }]);
  const matched = matchSchedules(baseline, current);
  const { changes } = classify(matched, DEFAULT_FIELDS);

  test("says what moved, by how much, and what else differs", () => {
    const a = current.activityById.get("102")!;
    const lines = describeChange(matched, a, changes.get("102")!);
    expect(lines).toContain("Finish 13-Feb-26 → 06-Mar-26 (+21d)");
    expect(lines).toContain("Duration 10d → 15d");
    expect(lines).toContain("Lag on A1010 FS: 0d → 1d");
  });

  test("added and removed activities are described too", () => {
    expect(describeChange(matched, current.activityById.get("103")!, changes.get("103")!)).toEqual(["New in the current programme."]);
    const gone = classify(matchSchedules(schedule([A, B, C]), schedule([A])), DEFAULT_FIELDS);
    const m = matchSchedules(schedule([A, B, C]), schedule([A]));
    const first = m.removed[0]!;
    expect(describeChange(m, first.shown, gone.changes.get(first.shown.id)!)[0]).toStartWith("Not in the current programme. It was ");
  });

  test("shiftDays follows the finish, then the start", () => {
    expect(shiftDays(changes.get("102")!, current.activityById.get("102")!)).toBe(21);
    expect(fmtShift(21)).toBe("+21d");
    expect(fmtShift(-3)).toBe("−3d");
    expect(shiftDays(changes.get("101")!, current.activityById.get("101")!)).toBe(0);
  });
});

describe("orderByDataDate", () => {
  test("puts the earlier data date first and keeps the order when a date is missing", () => {
    type D = { dataDate: number | null; n: string };
    const early: D = { dataDate: 1, n: "early" };
    const late: D = { dataDate: 2, n: "late" };
    const none: D = { dataDate: null, n: "x" };
    expect(orderByDataDate(late, early)).toEqual([early, late]);
    expect(orderByDataDate(early, late)).toEqual([early, late]);
    expect(orderByDataDate(none, early)[0].n).toBe("x");
  });
});
