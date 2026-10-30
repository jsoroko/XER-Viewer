import { describe, expect, test } from "bun:test";
import { describeTrace, runTrace, summarizeTrace, traceBetween, traceDriving, traceSteps } from "./drivingPath";
import type { WorkPattern } from "./xer/calendar";
import type { Activity, Relationship, RelationshipType, Schedule } from "./xer/model";

// Mon–Fri 08:00–17:00, no lunch break, so a day is 9 working hours.
const day = [{ start: 480, end: 1020 }];
const monFri: WorkPattern = { weekly: [[], day, day, day, day, day, []], exceptions: new Map() };

// January 2026: the 5th is a Monday.
const at = (d: number, h = 8) => new Date(2026, 0, d, h).getTime();

interface A {
  code: string;
  start: number | null;
  finish: number | null;
  type?: Activity["type"];
  calendarId?: string;
}
type R = [pred: string, succ: string, type?: RelationshipType, lagHrs?: number];

function network(acts: A[], rels: R[], pattern: WorkPattern | null = monFri, others: Record<string, WorkPattern> = {}): Schedule {
  const activityById = new Map<string, Activity>();
  for (const a of acts) {
    activityById.set(a.code, { id: a.code, name: `Activity ${a.code}`, type: a.type ?? "task", calendarId: a.calendarId ?? "cal", dayHrs: 9, ...a } as unknown as Activity);
  }
  const predecessors = new Map<string, Relationship[]>();
  const successors = new Map<string, Relationship[]>();
  rels.forEach(([pred, succ, type = "FS", lagHrs = 0], i) => {
    const rel: Relationship = { id: `r${i}`, taskId: succ, predTaskId: pred, type, lagHrs };
    predecessors.set(succ, [...(predecessors.get(succ) ?? []), rel]);
    successors.set(pred, [...(successors.get(pred) ?? []), rel]);
  });
  return {
    activityById,
    predecessors,
    successors,
    calendars: new Map([["cal", { id: "cal", pattern }], ...Object.entries(others).map(([id, p]) => [id, { id, pattern: p }] as const)]),
    defaultCalendar: undefined,
  } as unknown as Schedule;
}

/**
 *   A (Mon–Tue) ─FS→ B (Wed) ─FS→ D (Thu–Fri) ─FS→ E (next Mon) ─SS+1d→ F (Tue)
 *   C (Mon, a day long) ─FS→ D: C finishes Mon 17:00 but D can't start until Thu, so C has 18h of slack
 */
const schedule = () =>
  network(
    [
      { code: "A", start: at(5), finish: at(6, 17) },
      { code: "B", start: at(7), finish: at(7, 17) },
      { code: "C", start: at(5), finish: at(5, 17) },
      { code: "D", start: at(8), finish: at(9, 17) },
      { code: "E", start: at(12), finish: at(12, 17) },
      { code: "F", start: at(13), finish: at(13, 17) },
    ],
    [
      ["A", "B"],
      ["A", "D"], // would need D to start on Wed, so this one has 9h of slack
      ["B", "D"],
      ["C", "D"],
      ["D", "E"], // Friday evening to Monday morning: the weekend is not slack
      ["E", "F", "SS", 9],
    ],
  );

const codes = (ids: ReadonlySet<string>) => [...ids].sort();

describe("traceDriving", () => {
  test("backward follows only the relationships that set the date", () => {
    const r = traceDriving(schedule(), "E", "backward");
    expect(codes(r.ids)).toEqual(["A", "B", "D", "E"]); // not C (18h slack); A→D is skipped as a link but A still drives B
    expect(r.links.map((l) => `${l.rel.predTaskId}>${l.rel.taskId}`).sort()).toEqual(["A>B", "B>D", "D>E"]);
    expect(r.links.every((l) => l.floatHrs === 0)).toBe(true);
    expect(r.problem).toBeNull();
  });

  test("forward follows what the activity drives", () => {
    expect(codes(traceDriving(schedule(), "A", "forward").ids)).toEqual(["A", "B", "D", "E", "F"]);
    expect(codes(traceDriving(schedule(), "D", "forward").ids)).toEqual(["D", "E", "F"]);
  });

  test("combined is both directions from the same activity", () => {
    expect(codes(traceDriving(schedule(), "D", "combined").ids)).toEqual(["A", "B", "D", "E", "F"]);
  });

  test("a weekend between Friday and Monday is not slack, but a lag is counted", () => {
    const r = traceDriving(schedule(), "F", "backward");
    expect(codes(r.ids)).toContain("E"); // SS +9h: Monday 08:00 + 9 working hours = Tuesday 08:00
    // The same link with a 2h lag instead leaves 7h of slack, so F is no longer driven by E.
    const loose = network(
      [
        { code: "E", start: at(12), finish: at(12, 17) },
        { code: "F", start: at(13), finish: at(13, 17) },
      ],
      [["E", "F", "SS", 2]],
    );
    expect(codes(traceDriving(loose, "F", "backward").ids)).toEqual(["F"]);
  });

  test("each relationship type reads the right pair of dates", () => {
    const s = network(
      [
        { code: "P", start: at(5), finish: at(5, 17) },
        { code: "FS", start: at(6), finish: at(6, 17) }, // starts when P finishes
        { code: "SS", start: at(5), finish: at(7, 17) }, // starts when P starts
        { code: "FF", start: at(2), finish: at(5, 17) }, // finishes when P finishes
        { code: "SF", start: at(1), finish: at(5) }, // finishes when P starts
      ],
      [
        ["P", "FS", "FS"],
        ["P", "SS", "SS"],
        ["P", "FF", "FF"],
        ["P", "SF", "SF"],
      ],
    );
    expect(codes(traceDriving(s, "P", "forward").ids)).toEqual(["FF", "FS", "P", "SF", "SS"]);
  });

  test("negative lag is subtracted, a relationship that is merely late is not driving", () => {
    const lead = network(
      [
        { code: "P", start: at(5), finish: at(5, 17) },
        { code: "S", start: at(5, 8), finish: at(6, 17) }, // starts 9h before P finishes
      ],
      [["P", "S", "FS", -9]],
    );
    expect(codes(traceDriving(lead, "S", "backward").ids)).toEqual(["P", "S"]);
    const late = network(
      [
        { code: "P", start: at(5), finish: at(5, 17) },
        { code: "S", start: at(7), finish: at(7, 17) },
      ],
      [["P", "S"]],
    );
    expect(codes(traceDriving(late, "S", "backward").ids)).toEqual(["S"]);
  });

  test("even an hour of slack means the relationship is not driving", () => {
    const s = network(
      [
        { code: "P", start: at(5), finish: at(5, 17) },
        { code: "S", start: at(6, 9), finish: at(6, 17) },
      ],
      [["P", "S"]],
    );
    expect(codes(traceDriving(s, "S", "backward").ids)).toEqual(["S"]);
  });

  test("lag is measured on the predecessor's calendar, not the successor's", () => {
    // P works seven days a week and finishes Friday evening; S is a Mon–Fri activity starting Monday morning.
    const allWeek: WorkPattern = { weekly: Array.from({ length: 7 }, () => [{ start: 0, end: 1440 }]), exceptions: new Map() };
    const s = network(
      [
        { code: "P", start: at(9, 8), finish: at(9, 17), calendarId: "7day" },
        { code: "S", start: at(12), finish: at(12, 17) },
      ],
      [["P", "S"]],
      monFri,
      { "7day": allWeek },
    );
    expect(codes(traceDriving(s, "S", "backward").ids)).toEqual(["S"]); // 63 elapsed working hours of slack over the weekend
  });

  test("level-of-effort and WBS summary activities neither drive nor get traced", () => {
    const s = network(
      [
        { code: "A", start: at(5), finish: at(5, 17) },
        { code: "L", start: at(6), finish: at(6, 17), type: "loe" },
        { code: "B", start: at(7), finish: at(7, 17) },
      ],
      [
        ["A", "L"],
        ["L", "B"],
      ],
    );
    expect(codes(traceDriving(s, "B", "backward").ids)).toEqual(["B"]);
    expect(traceDriving(s, "L", "combined").problem).toMatch(/Level-of-effort/);
  });

  test("an undated activity breaks the chain instead of failing", () => {
    const s = network(
      [
        { code: "A", start: null, finish: null },
        { code: "B", start: at(5), finish: at(5, 17) },
      ],
      [["A", "B"]],
    );
    expect(codes(traceDriving(s, "B", "backward").ids)).toEqual(["B"]);
  });

  test("a loop in the logic terminates", () => {
    const s = network(
      [
        { code: "M1", start: at(5), finish: at(5) },
        { code: "M2", start: at(5), finish: at(5) },
      ],
      [
        ["M1", "M2", "SS"],
        ["M2", "M1", "SS"],
      ],
    );
    expect(codes(traceDriving(s, "M1", "combined").ids)).toEqual(["M1", "M2"]);
  });

  test("tied chains are all kept", () => {
    const s = network(
      [
        { code: "A", start: at(5), finish: at(5, 17) },
        { code: "B", start: at(6), finish: at(6, 17) },
        { code: "C", start: at(6), finish: at(6, 17) },
        { code: "D", start: at(7), finish: at(7, 17) },
      ],
      [
        ["A", "B"],
        ["A", "C"],
        ["B", "D"],
        ["C", "D"],
      ],
    );
    const r = traceDriving(s, "D", "backward");
    expect(codes(r.ids)).toEqual(["A", "B", "C", "D"]);
    expect(r.links).toHaveLength(4);
  });

  test("with no readable calendar it falls back to elapsed time and says so", () => {
    const s = network(
      [
        { code: "A", start: at(5), finish: at(5, 17) },
        { code: "B", start: at(5, 17), finish: at(6, 17) },
      ],
      [["A", "B"]],
      null,
    );
    const r = traceDriving(s, "B", "backward");
    expect(codes(r.ids)).toEqual(["A", "B"]);
    expect(r.approximate).toBe(true);
    expect(traceDriving(schedule(), "B", "backward").approximate).toBe(false);
  });

  test("an unknown activity is reported, not thrown", () => {
    expect(traceDriving(schedule(), "nope", "backward").problem).toMatch(/isn't in this file/);
  });
});

describe("traceBetween", () => {
  test("the driving chain between two activities, in whichever order they are given", () => {
    for (const [a, b] of [
      ["A", "E"],
      ["E", "A"],
    ] as const) {
      const r = traceBetween(schedule(), a, b);
      expect(r.driving).toBe(true);
      expect(codes(r.ids)).toEqual(["A", "B", "D", "E"]);
      expect(r.from).toBe("A");
      expect(r.to).toBe("E");
    }
  });

  test("leaves out activities that drive the end but are not driven by the start", () => {
    // B drives D and so does C's slack-free twin below, but only B sits between B and E.
    const r = traceBetween(schedule(), "B", "E");
    expect(codes(r.ids)).toEqual(["B", "D", "E"]);
  });

  test("when neither drives the other, the route with the least float is returned with its total", () => {
    const r = traceBetween(schedule(), "C", "E");
    expect(r.driving).toBe(false);
    expect(r.floatHrs).toBe(18);
    expect(codes(r.ids)).toEqual(["C", "D", "E"]);
    expect(r.from).toBe("C");
    expect(r.to).toBe("E");
  });

  test("picks the lower-float of several routes", () => {
    // Both routes end at T on Friday, but X is the longer piece of work, so going through it leaves less slack.
    const s = network(
      [
        { code: "S", start: at(5), finish: at(5, 17) },
        { code: "X", start: at(6), finish: at(7, 17) }, // starts as S finishes
        { code: "Y", start: at(8), finish: at(8, 17) }, // 18h after S
        { code: "T", start: at(9), finish: at(9, 17) },
      ],
      [
        ["S", "X"],
        ["S", "Y"],
        ["X", "T"], // Wednesday evening to Friday morning: 9h
        ["Y", "T"], // 0h
      ],
    );
    const r = traceBetween(s, "S", "T");
    expect(r.driving).toBe(false);
    expect(r.links.map((l) => l.rel.predTaskId + l.rel.taskId)).toEqual(["SX", "XT"]);
    expect(r.floatHrs).toBe(9);
  });

  test("a link that is already late counts as no float when comparing routes", () => {
    // X starts before S finishes (out of sequence). Without clamping, that -9h would hide the 9h still owed after X.
    const s = network(
      [
        { code: "S", start: at(5), finish: at(5, 17) },
        { code: "X", start: at(5), finish: at(6, 17) },
        { code: "Y", start: at(6, 13), finish: at(7, 17) },
        { code: "T", start: at(8), finish: at(8, 17) },
      ],
      [
        ["S", "X"], // -9h
        ["X", "T"], // 9h
        ["S", "Y"], // 5h
        ["Y", "T"], // 0h
      ],
    );
    const r = traceBetween(s, "S", "T");
    expect(r.driving).toBe(false);
    expect(r.links.map((l) => l.rel.predTaskId + l.rel.taskId)).toEqual(["SY", "YT"]);
    expect(r.floatHrs).toBe(5);
  });

  test("where the logic loops, the route with less float wins whichever way it runs", () => {
    const s = network(
      [
        { code: "S", start: at(5), finish: at(5, 17) },
        { code: "T", start: at(8), finish: at(8, 17) },
      ],
      [
        ["S", "T", "SS", 0], // 27h
        ["T", "S", "SS", -45], // 18h
      ],
    );
    const r = traceBetween(s, "S", "T");
    expect(r.driving).toBe(false);
    expect(r.floatHrs).toBe(18);
    expect(r.from).toBe("T");
    expect(r.to).toBe("S");
  });

  test("activities the logic does not connect", () => {
    const r = traceBetween(schedule(), "C", "A");
    expect(r.links).toEqual([]);
    expect(r.problem).toMatch(/doesn't connect C and A/);
  });

  test("the same activity twice, or an unknown one", () => {
    expect(traceBetween(schedule(), "A", "A").problem).toMatch(/two different/);
    expect(traceBetween(schedule(), "A", "zzz").problem).toMatch(/isn't in this file/);
  });
});

describe("runTrace", () => {
  test("dispatches on the spec, and waits while the second activity is unchosen", () => {
    const s = schedule();
    expect(codes(runTrace(s, { kind: "driving", mode: "forward", originId: "D" })!.ids)).toEqual(["D", "E", "F"]);
    expect(runTrace(s, { kind: "between", fromId: "A", toId: null })).toBeNull();
    expect(runTrace(s, { kind: "between", fromId: "A", toId: "E" })!.driving).toBe(true);
  });
});

describe("traceSteps and summarizeTrace", () => {
  test("lists the path in date order, each step with the link that feeds it", () => {
    const s = schedule();
    const steps = traceSteps(s, traceDriving(s, "E", "backward"));
    expect(steps.map((x) => x.activity.code)).toEqual(["A", "B", "D", "E"]);
    expect(steps.map((x) => x.via && x.via.rel.predTaskId)).toEqual([null, "A", "B", "D"]);
  });

  test("summarises count, extent and span", () => {
    const s = schedule();
    const sum = summarizeTrace(traceSteps(s, traceDriving(s, "E", "backward")));
    expect(sum.count).toBe(4);
    expect(sum.start).toBe(at(5));
    expect(sum.finish).toBe(at(12, 17));
    expect(sum.spanDays).toBe(7);
  });

  test("an empty path has no extent", () => {
    expect(summarizeTrace([])).toEqual({ count: 0, start: null, finish: null, spanDays: null });
  });
});

describe("describeTrace", () => {
  test("names each kind of trace, and the order once a between trace has worked out which way it runs", () => {
    const s = schedule();
    expect(describeTrace(s, { kind: "driving", mode: "backward", originId: "E" })).toBe("Backward trace from E");
    expect(describeTrace(s, { kind: "driving", mode: "combined", originId: "D" })).toBe("Combined trace from D");
    expect(describeTrace(s, { kind: "between", fromId: "A", toId: null })).toBe("Trace from A to…");
    const spec = { kind: "between" as const, fromId: "E", toId: "A" };
    expect(describeTrace(s, spec)).toBe("E and A");
    expect(describeTrace(s, spec, runTrace(s, spec))).toBe("A → E");
  });
});
