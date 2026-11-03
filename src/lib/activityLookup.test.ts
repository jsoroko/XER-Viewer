import { describe, expect, test } from "bun:test";
import { activityByCode, findActivities } from "./activityLookup";
import type { Activity } from "./xer/model";

const act = (code: string, name: string) => ({ id: code, code, name }) as unknown as Activity;
const all = [
  act("A100", "Pour footings"),
  act("A1000", "Install lift"),
  act("B200", "Review A100 drawings"),
  act("X1A100", "Snag list"),
  act("C300", "Footings inspection"),
];

describe("findActivities", () => {
  test("ranks exact ID, then ID prefix, then ID contains, then name", () => {
    expect(findActivities(all, "a100").map((a) => a.code)).toEqual(["A100", "A1000", "X1A100", "B200"]);
  });

  test("matches names when no ID does, ignoring case", () => {
    expect(findActivities(all, "FOOTINGS").map((a) => a.code)).toEqual(["A100", "C300"]);
  });

  test("blank text, or no match, gives nothing", () => {
    expect(findActivities(all, "  ")).toEqual([]);
    expect(findActivities(all, "zzz")).toEqual([]);
  });

  test("is capped at the limit", () => {
    expect(findActivities(all, "a", 2)).toHaveLength(2);
  });
});

describe("activityByCode", () => {
  test("needs the whole ID, but not the case or surrounding spaces", () => {
    expect(activityByCode(all, " b200 ")?.code).toBe("B200");
    expect(activityByCode(all, "B20")).toBeUndefined();
    expect(activityByCode(all, "")).toBeUndefined();
  });
});
