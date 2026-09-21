import { describe, expect, test } from "bun:test";
import { buildSchedule, listProjects } from "./model";
import { decodeXer, parseXer, reader, XerParseError } from "./parse";
import { parseDate } from "./values";

const sampleText = await Bun.file(new URL("../../sample/sample.xer", import.meta.url)).text();

const mini = (body: string) => ["ERMHDR\t8.4\t2024-01-15\tProject\tadmin\tdb\tProject Management\tUSD", body, "%E"].join("\r\n");

describe("parseXer", () => {
  test("reads header, tables, fields and rows", () => {
    const xer = parseXer(mini("%T\tFOO\r\n%F\ta\tb\tc\r\n%R\t1\t2\t3\r\n%R\t4\t\t6"));
    expect(xer.header).toMatchObject({ version: "8.4", exportDate: "2024-01-15", user: "admin", currency: "USD" });
    const foo = xer.tables.get("FOO")!;
    expect(foo.fields).toEqual(["a", "b", "c"]);
    expect(foo.rows).toEqual([
      ["1", "2", "3"],
      ["4", "", "6"],
    ]);
  });

  test("pads short rows and tolerates LF-only line endings and a BOM", () => {
    const xer = parseXer("﻿" + mini("%T\tFOO\n%F\ta\tb\tc\n%R\t1").replace(/\r\n/g, "\n"));
    expect(xer.tables.get("FOO")!.rows[0]).toEqual(["1", "", ""]);
  });

  test("rejects files that are not XER", () => {
    expect(() => parseXer("hello\nworld")).toThrow(XerParseError);
    expect(() => parseXer("")).toThrow(XerParseError);
  });

  test("collects warnings instead of failing on stray lines", () => {
    const xer = parseXer(mini("garbage\r\n%R\tx\r\n%T\tFOO\r\n%F\ta\r\n%R\t1"));
    expect(xer.warnings.length).toBe(2);
    expect(xer.tables.get("FOO")!.rows).toHaveLength(1);
  });

  test("reader looks fields up by name and returns '' for unknown ones", () => {
    const xer = parseXer(mini("%T\tFOO\r\n%F\ta\tb\r\n%R\t1\t2"));
    const r = reader(xer.tables.get("FOO"));
    expect(r.get(r.rows[0]!, "b")).toBe("2");
    expect(r.get(r.rows[0]!, "nope")).toBe("");
  });

  test("decodeXer falls back to Windows-1252 for non-UTF-8 bytes", () => {
    const bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in cp1252
    expect(decodeXer(bytes.buffer)).toBe("café");
    expect(decodeXer(new TextEncoder().encode("café").buffer as ArrayBuffer)).toBe("café");
  });
});

describe("parseDate", () => {
  test("parses P6 dates with and without time", () => {
    expect(parseDate("2026-04-06 08:00")).toBe(new Date(2026, 3, 6, 8, 0).getTime());
    expect(parseDate("2026-04-06")).toBe(new Date(2026, 3, 6).getTime());
    expect(parseDate("")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});

describe("sample file", () => {
  const xer = parseXer(sampleText);
  const [project] = listProjects(xer);

  test("has one project with a name from its root WBS", () => {
    expect(listProjects(xer)).toHaveLength(1);
    expect(project!.name).toBe("Riverside Office Building");
    expect(project!.dataDate).toBe(new Date(2026, 3, 6, 8, 0).getTime());
  });

  const schedule = buildSchedule(xer, project!.id);

  test("builds the WBS tree with every activity attached to a node", () => {
    expect(schedule.roots).toHaveLength(1);
    expect(schedule.roots[0]!.activityCount).toBe(schedule.activities.length);
    expect(schedule.roots[0]!.children.map((c) => c.code)).toEqual(["RIV.1", "RIV.2", "RIV.3", "RIV.4", "RIV.5", "RIV.6", "RIV.7"]);
  });

  test("statuses partition the activities and progress is sensible", () => {
    const { byStatus, activities, overallPercent } = schedule.stats;
    expect(byStatus["not-started"] + byStatus["in-progress"] + byStatus.completed).toBe(activities);
    expect(byStatus.completed).toBeGreaterThan(0);
    expect(byStatus["not-started"]).toBeGreaterThan(0);
    expect(overallPercent).toBeGreaterThan(0);
    expect(overallPercent).toBeLessThan(100);
  });

  test("relationships are indexed both ways", () => {
    const total = [...schedule.predecessors.values()].reduce((n, l) => n + l.length, 0);
    const totalSucc = [...schedule.successors.values()].reduce((n, l) => n + l.length, 0);
    expect(total).toBe(schedule.stats.relationships);
    expect(totalSucc).toBe(total);
  });

  test("critical activities have no float and are not complete", () => {
    const critical = schedule.activities.filter((a) => a.critical);
    expect(critical.length).toBeGreaterThan(0);
    for (const a of critical) {
      expect(a.status).not.toBe("completed");
      expect(a.totalFloatHrs).toBeLessThanOrEqual(0);
    }
  });

  test("level-of-effort activities are never critical, even with zero float", () => {
    const loe = schedule.activities.filter((a) => a.type === "loe");
    expect(loe.length).toBeGreaterThan(0);
    for (const a of loe) {
      expect(a.totalFloatHrs).toBe(0);
      expect(a.critical).toBe(false);
    }
  });

  test("resources, assignments and codes are joined to activities", () => {
    expect(schedule.assignments.size).toBeGreaterThan(0);
    const [first] = [...schedule.assignments.values()][0]!;
    expect(first!.resourceName).not.toMatch(/^Resource /);
    expect(schedule.codes.size).toBeGreaterThan(0);
  });

  test("WBS roll-up dates cover their children", () => {
    for (const node of schedule.wbs.values()) {
      for (const a of node.activities) {
        expect(node.start!).toBeLessThanOrEqual(a.start!);
        expect(node.finish!).toBeGreaterThanOrEqual(a.finish!);
      }
    }
  });
});

describe("multi-project files", () => {
  const two = parseXer(
    mini(
      [
        "%T\tPROJECT\r\n%F\tproj_id\tproj_short_name\r\n%R\t1\tA\r\n%R\t2\tB",
        "%T\tPROJWBS\r\n%F\twbs_id\tproj_id\tproj_node_flag\twbs_name\tparent_wbs_id\tseq_num\r\n%R\t10\t1\tY\tAlpha\t\t0\r\n%R\t20\t2\tY\tBeta\t\t0",
        "%T\tTASK\r\n%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\r\n%R\t100\t1\t10\tA1\tOne\r\n%R\t200\t2\t20\tB1\tTwo\r\n%R\t201\t2\t99\tB2\tNo WBS",
        "%T\tTASKPRED\r\n%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt\r\n%R\t1\t200\t100\tPR_FS\t0",
      ].join("\r\n"),
    ),
  );

  test("lists projects and scopes the schedule to one", () => {
    expect(listProjects(two).map((p) => p.name)).toEqual(["Alpha", "Beta"]);
    const b = buildSchedule(two, "2");
    expect(b.activities.map((a) => a.code)).toEqual(["B1", "B2"]);
  });

  test("keeps cross-project predecessors resolvable and buckets orphaned activities", () => {
    const b = buildSchedule(two, "2");
    expect(b.predecessors.get("200")![0]!.predTaskId).toBe("100");
    expect(b.activityById.get("100")!.code).toBe("A1");
    expect(b.wbs.get("__orphans__")!.activities.map((a) => a.code)).toEqual(["B2"]);
  });
});
