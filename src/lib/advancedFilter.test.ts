import { describe, expect, test } from "bun:test";
import {
  compileFilter,
  FIELDS,
  fieldGroups,
  newCondition,
  OPERATORS,
  suggestValues,
  type AdvancedFilter,
  type Operator,
} from "./advancedFilter";
import { makePredicate } from "./scheduleRows";
import { buildSchedule, listProjects, type Activity } from "./xer/model";
import { parseXer } from "./xer/parse";

const sampleText = await Bun.file(new URL("../sample/sample.xer", import.meta.url)).text();
const xer = parseXer(sampleText);
const schedule = buildSchedule(xer, listProjects(xer)[0]!.id);
const all = schedule.activities;

const cond = (field: string, op: Operator, value = "") => newCondition(field, op, value);
const filter = (mode: "all" | "any", ...conditions: ReturnType<typeof cond>[]): AdvancedFilter => ({ mode, conditions });
const run = (f: AdvancedFilter): Activity[] => {
  const { predicate } = compileFilter(schedule, f);
  return predicate ? all.filter(predicate) : all;
};
const codesOf = (a: Activity) => (schedule.codes.get(a.id) ?? []).map((c) => c.code);
const byCode = (codes: string[]) => all.filter((a) => codes.includes(a.code)).map((a) => a.code).sort();

describe("the field list", () => {
  test("is exactly these eleven fields, in this order, worded like this", () => {
    expect(FIELDS.map((f) => f.label)).toEqual([
      "Activity ID",
      "Activity Code",
      "Activity Name",
      "Activity Type ID",
      "Activity Type Name",
      "Task ID",
      "Task Code",
      "Task Name",
      "WBS ID",
      "WBS Code",
      "WBS Name",
    ]);
  });

  test("labels carry no explanatory text in brackets, and no column names", () => {
    expect(FIELDS.filter((f) => /[()]/.test(f.label) || /actv_|task_|wbs_|wsb_|short_name/.test(f.label))).toEqual([]);
  });

  test("fields are grouped Activity codes / Task / WBS, and ids are unique", () => {
    expect(fieldGroups().map((g) => [g.group, g.fields.length])).toEqual([
      ["Activity codes", 5],
      ["Task", 3],
      ["WBS", 3],
    ]);
    expect(new Set(FIELDS.map((f) => f.id)).size).toBe(FIELDS.length);
  });

  test("none of the removed fields are offered any more", () => {
    const ids = FIELDS.map((f) => f.id);
    for (const gone of ["status", "type", "critical", "calendar", "constraint", "resource", "origDur", "totalFloat", "percent", "start", "finish", "wbsPath", "codeAny", "code", "name", "wbs"]) {
      expect(ids).not.toContain(gone);
    }
    expect(ids.some((id) => id.startsWith("codeType:"))).toBe(false);
  });

  test("operators are the text ones", () => {
    expect(OPERATORS.map((o) => o.label)).toEqual([
      "equals",
      "does not equal",
      "contains",
      "does not contain",
      "starts with",
      "ends with",
      "is empty",
      "is not empty",
    ]);
  });
});

describe("Task and WBS fields", () => {
  test("are case-insensitive and ignore surrounding spaces", () => {
    expect(run(filter("all", cond("taskCode", "equals", " ss1010 ")))).toHaveLength(1);
    expect(run(filter("all", cond("taskName", "contains", "ROOF SLAB"))).map((a) => a.code)).toEqual(["SS1040"]);
  });

  test("equals is exact, while contains / starts with / ends with are partial", () => {
    expect(run(filter("all", cond("taskName", "equals", "Roof")))).toHaveLength(0);
    expect(run(filter("all", cond("taskCode", "startsWith", "SS10"))).length).toBe(all.filter((a) => a.code.startsWith("SS10")).length);
    expect(run(filter("all", cond("taskName", "endsWith", "Slab"))).every((a) => a.name.toLowerCase().endsWith("slab"))).toBe(true);
  });

  test("negative operators exclude what the positive ones match", () => {
    const yes = run(filter("all", cond("taskName", "contains", "slab")));
    const no = run(filter("all", cond("taskName", "notContains", "slab")));
    expect(yes.length + no.length).toBe(all.length);
    expect(no.some((a) => /slab/i.test(a.name))).toBe(false);
  });

  test("Task ID, Task Code and Task Name each pick out one activity", () => {
    const one = all.find((a) => a.code === "SS1010")!;
    expect(run(filter("all", cond("taskId", "equals", one.id))).map((a) => a.code)).toEqual(["SS1010"]);
    expect(run(filter("all", cond("taskCode", "equals", "SS1010"))).map((a) => a.id)).toEqual([one.id]);
    expect(run(filter("all", cond("taskName", "equals", one.name))).map((a) => a.id)).toEqual([one.id]);
    expect(run(filter("all", cond("taskId", "equals", "99999999")))).toHaveLength(0);
  });

  test("WBS ID, WBS Code and WBS Name pick out the same group of activities", () => {
    const foundations = all.filter((a) => a.code.startsWith("FD")).map((a) => a.code).sort();
    expect(foundations).toHaveLength(6);
    for (const f of [cond("wbsId", "equals", "4007"), cond("wbsCode", "equals", "RIV.3.1"), cond("wbsName", "equals", "Foundations")]) {
      expect(run(filter("all", f)).map((a) => a.code).sort()).toEqual(foundations);
    }
    expect(run(filter("all", cond("wbsCode", "startsWith", "RIV.3."))).length).toBeGreaterThan(foundations.length);
    expect(run(filter("all", cond("wbsName", "equals", "Building Envelope"))).map((a) => a.code).sort()).toEqual(
      byCode(["EN1000", "EN1010", "EN1020", "EN1030", "EN1040"]),
    );
  });
});

describe("WBS fields match the activity's group and every group above it", () => {
  const structure = all.filter((a) => a.code.startsWith("FD") || a.code.startsWith("SS") || a.code === "M0030");
  const n = (field: string, op: Operator, value: string) => run(filter("all", cond(field, op, value)));

  test("a parent group finds everything inside it, in all three WBS fields", () => {
    expect(structure).toHaveLength(13); // Foundations (6) + Superstructure (7) sit under Structure
    for (const f of [cond("wbsName", "equals", "Structure"), cond("wbsCode", "equals", "RIV.3"), cond("wbsId", "equals", "4006")]) {
      expect(run(filter("all", f)).map((a) => a.id).sort()).toEqual(structure.map((a) => a.id).sort());
    }
  });

  test("a leaf group still finds only its own activities", () => {
    expect(n("wbsName", "equals", "Foundations")).toHaveLength(6);
    expect(n("wbsName", "equals", "Superstructure")).toHaveLength(7);
  });

  test("partial matching works on the whole branch", () => {
    expect(n("wbsName", "contains", "structure")).toHaveLength(13);
    expect(n("wbsCode", "startsWith", "RIV.3")).toHaveLength(13);
  });

  test("the project's top row is skipped, so its name matches nothing", () => {
    expect(n("wbsName", "equals", "Riverside Office Building")).toHaveLength(0);
    expect(n("wbsCode", "equals", "RIV")).toHaveLength(0);
    expect(n("wbsName", "contains", "riverside")).toHaveLength(0);
  });

  test("'does not equal' means no group in the branch equals it", () => {
    expect(n("wbsName", "notEquals", "Structure")).toHaveLength(all.length - 13);
    // Foundations is inside Structure, so excluding Structure excludes it too
    expect(n("wbsName", "notEquals", "Structure").some((a) => a.code.startsWith("FD"))).toBe(false);
  });

  test("each condition is checked on its own, so a group and its parent can both be required", () => {
    const both = run(filter("all", cond("wbsName", "equals", "Structure"), cond("wbsName", "equals", "Foundations")));
    expect(both).toHaveLength(6);
  });

  test("suggestions include parent groups but not the project's top row", () => {
    const names = suggestValues(schedule, "wbsName");
    expect(names).toContain("Structure");
    expect(names).toContain("Foundations");
    expect(names).not.toContain("Riverside Office Building");
  });
});

describe("Activity code fields (several values per activity)", () => {
  test("Activity Code is the short code, Activity Name its description; they are different fields", () => {
    const byShort = run(filter("all", cond("actvCode", "equals", "STRU")));
    const byDescription = run(filter("all", cond("actvName", "equals", "structure")));
    expect(byShort.length).toBeGreaterThan(0);
    expect(byShort.every((a) => codesOf(a).includes("STRU"))).toBe(true);
    expect(byDescription.map((a) => a.id)).toEqual(byShort.map((a) => a.id));
    expect(run(filter("all", cond("actvCode", "equals", "Structure")))).toHaveLength(0);
    expect(run(filter("all", cond("actvName", "equals", "STRU")))).toHaveLength(0);
  });

  test("Activity ID and Activity Type ID / Name are the code's own ids and its type from the file", () => {
    const stru = run(filter("all", cond("actvCode", "equals", "STRU")));
    expect(run(filter("all", cond("actvId", "equals", "9105"))).map((a) => a.id)).toEqual(stru.map((a) => a.id));
    // every coded activity in the sample uses the one code type, id 9001 = "Discipline"
    const coded = run(filter("all", cond("actvCode", "notEmpty")));
    expect(coded.length).toBeGreaterThan(stru.length);
    expect(run(filter("all", cond("actvTypeId", "equals", "9001"))).map((a) => a.id)).toEqual(coded.map((a) => a.id));
    expect(run(filter("all", cond("actvTypeName", "equals", "discipline"))).map((a) => a.id)).toEqual(coded.map((a) => a.id));
    expect(run(filter("all", cond("actvTypeName", "equals", "Phase")))).toHaveLength(0);
  });

  test("a code equals one thing AND another field contains something else", () => {
    const hits = run(filter("all", cond("actvCode", "equals", "STRU"), cond("taskName", "contains", "slab")));
    expect(hits.map((a) => a.code).sort()).toEqual(byCode(["SS1000", "SS1010", "SS1020", "SS1030", "SS1040"]));
    // two conditions on the code fields: an activity's codes can satisfy both
    const twice = run(filter("all", cond("actvCode", "equals", "STRU"), cond("actvName", "contains", "truc")));
    expect(twice.map((a) => a.id)).toEqual(run(filter("all", cond("actvCode", "equals", "STRU"))).map((a) => a.id));
  });

  test("'does not equal' means NO code equals it, so activities without codes are included", () => {
    const notStru = run(filter("all", cond("actvCode", "notEquals", "STRU")));
    expect(notStru.some((a) => codesOf(a).includes("STRU"))).toBe(false);
    expect(notStru.some((a) => (schedule.codes.get(a.id) ?? []).length === 0)).toBe(true);
    expect(notStru.length + run(filter("all", cond("actvCode", "equals", "STRU"))).length).toBe(all.length);
  });

  test("is empty / is not empty", () => {
    const empty = run(filter("all", cond("actvCode", "isEmpty")));
    const filled = run(filter("all", cond("actvCode", "notEmpty")));
    expect(empty.length + filled.length).toBe(all.length);
    expect(empty.length).toBeGreaterThan(0);
    expect(filled.every((a) => (schedule.codes.get(a.id) ?? []).length > 0)).toBe(true);
  });

  test("suggestions list the values found, sorted and without blanks; ids and free text aren't listed", () => {
    const codes = suggestValues(schedule, "actvCode");
    expect(codes).toContain("STRU");
    expect(codes).not.toContain("Structure");
    expect(suggestValues(schedule, "actvName")).toContain("Structure");
    expect(suggestValues(schedule, "actvTypeName")).toEqual(["Discipline"]);
    expect(suggestValues(schedule, "wbsCode")).toContain("RIV.3.1");
    expect(codes.every((v) => v.trim() !== "")).toBe(true);
    for (const id of ["taskName", "taskId", "wbsId", "actvId", "actvTypeId", "nope"]) expect(suggestValues(schedule, id)).toEqual([]);
  });
});

describe("combining and incomplete conditions", () => {
  const a = cond("taskName", "contains", "slab");
  const b = cond("taskCode", "startsWith", "FD");

  test("ALL is the intersection, ANY is the union", () => {
    const setA = new Set(run(filter("all", a)).map((x) => x.id));
    const setB = new Set(run(filter("all", b)).map((x) => x.id));
    expect(run(filter("all", a, b))).toHaveLength(0); // no foundation activity has "slab" in its name
    expect(new Set(run(filter("any", a, b)).map((x) => x.id))).toEqual(new Set([...setA, ...setB]));
  });

  test("conditions that aren't finished yet are ignored, not treated as 'match nothing'", () => {
    expect(compileFilter(schedule, filter("all", cond("taskName", "contains", ""))).predicate).toBeNull();
    expect(compileFilter(schedule, filter("all", cond("taskName", "equals", "   "))).active).toBe(0);
    expect(compileFilter(schedule, filter("all", cond("nope", "equals", "x"))).active).toBe(0);
    const partial = compileFilter(schedule, filter("all", cond("taskName", "contains", ""), cond("taskCode", "startsWith", "FD")));
    expect(partial.active).toBe(1);
    expect(all.filter(partial.predicate!)).toHaveLength(6);
    // "is empty" needs no value, so it counts as complete straight away
    expect(compileFilter(schedule, filter("all", cond("actvCode", "isEmpty"))).active).toBe(1);
  });

  test("an unknown operator is ignored", () => {
    expect(compileFilter(schedule, filter("all", cond("taskName", "gt" as unknown as Operator, "5"))).active).toBe(0);
  });

  test("no conditions means no filter", () => {
    expect(compileFilter(schedule, filter("all")).predicate).toBeNull();
  });

  test("plugs into makePredicate alongside the search box and status filter", () => {
    const { predicate: extra } = compileFilter(schedule, filter("all", cond("actvCode", "equals", "STRU")));
    const combined = makePredicate("all", "slab", null, extra)!;
    expect(all.filter(combined).map((x) => x.code).sort()).toEqual(byCode(["SS1000", "SS1010", "SS1020", "SS1030", "SS1040"]));
    const withStatus = makePredicate("completed", "", null, extra)!;
    expect(all.filter(withStatus).every((x) => x.status === "completed" && codesOf(x).includes("STRU"))).toBe(true);
    expect(makePredicate("all", "", null, null)).toBeNull();
  });
});
