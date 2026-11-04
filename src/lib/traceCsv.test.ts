import { describe, expect, test } from "bun:test";
import type { TraceStep } from "./drivingPath";
import { relLabel, traceCsv } from "./traceCsv";
import type { Activity, Relationship, Schedule } from "./xer/model";

const rel = (type: Relationship["type"], lagHrs: number): Relationship => ({ id: "r", taskId: "b", predTaskId: "a", type, lagHrs });

describe("relLabel", () => {
  test("a plain relationship is just its type", () => {
    expect(relLabel(rel("FS", 0), 8)).toBe("FS");
  });
  test("lag is shown in days of the activity's own day length, with a real minus sign", () => {
    expect(relLabel(rel("SS", 16), 8)).toBe("SS +2d");
    expect(relLabel(rel("FF", -5), 10)).toBe("FF −0.5d");
    expect(relLabel(rel("FS", 20), 10)).toBe("FS +2d");
  });
  test("a missing day length falls back to eight hours", () => {
    expect(relLabel(rel("FS", 8), 0)).toBe("FS +1d");
  });
});

describe("traceCsv", () => {
  const act = (code: string, name: string): Activity =>
    ({ id: code.toLowerCase(), code, name, dayHrs: 8, origDurHrs: 16, start: new Date(2026, 0, 5).getTime(), finish: new Date(2026, 0, 6).getTime() }) as Activity;
  const schedule = { activityById: new Map([["a", act("A100", "Dig")], ["b", act("B200", 'Pour, "wet"')]]) } as unknown as Schedule;
  const steps: TraceStep[] = [
    { activity: act("A100", "Dig"), via: null },
    { activity: act("B200", 'Pour, "wet"'), via: { rel: rel("SS", 8), floatHrs: 0 } },
  ];

  test("a header, then one line per step, quoting names that need it", () => {
    expect(traceCsv(schedule, steps).split("\r\n")).toEqual([
      "Activity ID,Activity name,Duration,Start,Finish,Driven by,Relationship,Relationship float",
      "A100,Dig,2d,05-Jan-26,06-Jan-26,,,",
      'B200,"Pour, ""wet""",2d,05-Jan-26,06-Jan-26,A100,SS +1d,0d',
    ]);
  });

  test("when two programmes are compared each step says how it relates to the baseline's path", () => {
    const lines = traceCsv(schedule, [
      { ...steps[0]!, status: "both" },
      { ...steps[1]!, status: "dropped" },
    ]).split("\r\n");
    expect(lines[0]).toEndWith(",Path status");
    expect(lines[1]).toEndWith(",On both paths");
    expect(lines[2]).toEndWith(",Dropped off the path");
  });

  test("an empty path is just the header", () => {
    expect(traceCsv(schedule, []).split("\r\n")).toHaveLength(1);
  });
});
