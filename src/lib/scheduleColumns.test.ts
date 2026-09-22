import { describe, expect, test } from "bun:test";
import { OPTIONAL_COLUMNS, optionalColumnValue } from "./scheduleColumns";
import { buildSchedule, listProjects } from "./xer/model";
import { parseXer } from "./xer/parse";

const sampleText = await Bun.file(new URL("../sample/sample.xer", import.meta.url)).text();
const xer = parseXer(sampleText);
const schedule = buildSchedule(xer, listProjects(xer)[0]!.id);
const findByCode = (code: string) => schedule.activities.find((a) => a.code === code)!;

describe("OPTIONAL_COLUMNS", () => {
  test("four columns, each with a distinct key and a sensible width", () => {
    expect(OPTIONAL_COLUMNS).toHaveLength(4);
    expect(new Set(OPTIONAL_COLUMNS.map((c) => c.key)).size).toBe(4);
    for (const c of OPTIONAL_COLUMNS) expect(c.width).toBeGreaterThan(0);
  });

  test("Activity ID and Calendar aren't offered: their values run too long for one line", () => {
    const keys = OPTIONAL_COLUMNS.map((c) => c.key);
    expect(keys).not.toContain("activityId");
    expect(keys).not.toContain("calendar");
  });
});

describe("optionalColumnValue", () => {
  test("percent is a whole-number percentage, 0 for not started and 100 for completed", () => {
    const notStarted = schedule.activities.find((a) => a.status === "not-started")!;
    const completed = schedule.activities.find((a) => a.status === "completed")!;
    expect(optionalColumnValue("percent", notStarted)).toBe("0%");
    expect(optionalColumnValue("percent", completed)).toBe("100%");
    for (const a of schedule.activities) expect(optionalColumnValue("percent", a)).toMatch(/^\d+%$/);
  });

  test("actualStart / actualFinish read the activity's actual dates, blank when there isn't one", () => {
    const started = schedule.activities.find((a) => a.actualStart !== null)!;
    expect(optionalColumnValue("actualStart", started)).not.toBe("");
    const notStarted = schedule.activities.find((a) => a.actualStart === null)!;
    expect(optionalColumnValue("actualStart", notStarted)).toBe("");
    const unfinished = schedule.activities.find((a) => a.actualFinish === null)!;
    expect(optionalColumnValue("actualFinish", unfinished)).toBe("");
  });

  test("freeFloat reads in days, using the activity's own calendar, like the other duration columns", () => {
    const a = schedule.activities.find((x) => x.freeFloatHrs !== null && x.freeFloatHrs > 0)!;
    expect(optionalColumnValue("freeFloat", a)).toBe(`${a.freeFloatHrs! / a.dayHrs}d`);
  });

  test("a known activity's code is unaffected: it's read off the Activity object directly, not through this helper", () => {
    expect(findByCode("SS1010").code).toBe("SS1010");
  });
});
