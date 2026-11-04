import { describe, expect, test } from "bun:test";
import { matchSchedules } from "./compare";
import { compareTrace, comparedSteps } from "./compareTrace";
import { traceDriving } from "./drivingPath";
import { schedule } from "./xerFixture";

/**
 * A, then B or C, then D. A relationship drives when the successor starts exactly when the predecessor finishes, so the
 * longer of B and C is the driving one.
 */
const A = { id: "1", code: "A", start: "2026-01-05 08:00", end: "2026-01-09 08:00" };
const B = { id: "2", code: "B", start: "2026-01-09 08:00", end: "2026-01-23 08:00" };
const C = { id: "3", code: "C", start: "2026-01-09 08:00", end: "2026-01-16 08:00" };
const D = { id: "4", code: "D", start: "2026-01-23 08:00", end: "2026-01-23 08:00" };
const links = [
  { task: "2", pred: "1" },
  { task: "3", pred: "1" },
  { task: "4", pred: "2" },
  { task: "4", pred: "3" },
];

// In the baseline B drives D. Then C gets longer and takes over, and B has float.
const baseline = schedule([A, B, C, D], links);
const current = schedule(
  [A, B, { ...C, end: "2026-01-30 08:00" }, { ...D, start: "2026-01-30 08:00", end: "2026-01-30 08:00" }],
  links,
);

const run = (b = baseline, c = current, origin = "4", mode: "backward" | "forward" | "combined" = "backward") => {
  const matched = matchSchedules(b, c);
  const spec = { mode, originId: origin };
  const now = traceDriving(matched.schedule, origin, mode);
  return { matched, now, compared: compareTrace(matched, spec, now) };
};

describe("comparing a backward trace", () => {
  const { compared } = run();

  test("marks what stayed on the path, what joined it and what dropped off", () => {
    expect(Object.fromEntries(compared.status)).toEqual({ "1": "both", "4": "both", "3": "joined", "2": "dropped" });
    expect(compared.counts).toEqual({ both: 2, joined: 1, dropped: 1 });
    expect([...compared.droppedIds]).toEqual(["2"]);
  });

  test("lists the links that were driving and no longer are, between the ids being shown", () => {
    expect(compared.droppedLinks.map((l) => `${l.predTaskId}>${l.taskId}`).sort()).toEqual(["1>2", "2>4"]);
  });

  test("says how far the path moved", () => {
    expect(compared.span.baseline!.finish).toBe(new Date(2026, 0, 23, 8).getTime());
    expect(compared.span.current!.finish).toBe(new Date(2026, 0, 30, 8).getTime());
    expect(compared.note).toBeNull();
  });
});

describe("other situations", () => {
  test("an unchanged programme has nothing joined or dropped", () => {
    const { compared } = run(baseline, schedule([A, B, C, D], links));
    expect(compared.counts).toEqual({ both: 3, joined: 0, dropped: 0 });
    expect(compared.droppedLinks).toEqual([]);
  });

  test("traced forward, an activity is still on the path while the link into it still drives", () => {
    // B still follows A with no float, so it stays; what changed is that B no longer drives D.
    const { compared } = run(baseline, current, "1", "forward");
    expect(compared.status.get("2")).toBe("both");
    expect(compared.droppedLinks.map((l) => `${l.predTaskId}>${l.taskId}`)).toEqual(["2>4"]);
  });

  test("traced both ways from the end of the chain it is the same as backward", () => {
    expect(run(baseline, current, "4", "combined").compared.counts).toEqual({ both: 2, joined: 1, dropped: 1 });
  });

  test("an activity that is new has no baseline path to compare with", () => {
    const extra = { id: "5", code: "E", start: "2026-02-02 08:00", end: "2026-02-06 08:00" };
    const { compared } = run(baseline, schedule([A, B, C, D, extra], links), "5");
    expect(compared.status.size).toBe(0);
    expect(compared.note).toMatch(/new/);
  });

  test("tracing a removed activity shows its old path as dropped, and none now", () => {
    const matched = matchSchedules(baseline, schedule([A, B, C], links.slice(0, 2)));
    const removed = matched.removed.find((r) => r.original.code === "D")!;
    const now = traceDriving(matched.schedule, removed.shown.id, "backward");
    const compared = compareTrace(matched, { mode: "backward", originId: removed.shown.id }, now);
    expect(compared.counts.dropped).toBeGreaterThanOrEqual(1);
    expect(compared.status.get(removed.shown.id)).not.toBe("both");
  });

  test("a baseline activity that was removed is a dropped step, with its old link", () => {
    const { matched, now, compared } = run(baseline, schedule([A, C, { ...D, start: "2026-01-16 08:00", end: "2026-01-16 08:00" }], [{ task: "3", pred: "1" }, { task: "4", pred: "3" }]));
    const steps = comparedSteps(matched.schedule, now, compared);
    const gone = steps.find((s) => s.status === "dropped")!;
    expect(gone.activity.code).toBe("B");
    expect(gone.via?.rel.predTaskId).toBe(matched.schedule.activities.find((a) => a.code === "A")!.id);
  });
});

describe("comparedSteps", () => {
  test("puts the dropped steps among the current ones in date order, each with its status", () => {
    const { matched, now, compared } = run();
    const steps = comparedSteps(matched.schedule, now, compared);
    expect(steps.map((s) => `${s.activity.code}:${s.status}`)).toEqual(["A:both", "B:dropped", "C:joined", "D:both"]);
  });

  test("without a comparison it is just the current path", () => {
    const { matched, now } = run();
    expect(comparedSteps(matched.schedule, now, null).map((s) => s.status)).toEqual([null, null, null]);
  });
});
