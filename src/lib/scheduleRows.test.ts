import { describe, expect, test } from "bun:test";
import { buildRows, describeDateRange, endOfDay, makePredicate, matchesDateRange, maxWbsDepth, toDateRange } from "./scheduleRows";
import { buildSchedule, listProjects, type Activity, type WbsNode } from "./xer/model";
import { parseXer } from "./xer/parse";

const sampleText = await Bun.file(new URL("../sample/sample.xer", import.meta.url)).text();

const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h).getTime();
const act = (start: number | null, finish: number | null) => ({ start, finish }) as Activity;
/** A bare-bones WBS node for testing tree-shape helpers in isolation, without a whole schedule. */
const wbsNode = (children: WbsNode[] = [], activities: Activity[] = []) => ({ children, activities }) as WbsNode;

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

describe("collapsing groups while a filter is active", () => {
  const xer = parseXer(sampleText);
  const schedule = buildSchedule(xer, listProjects(xer)[0]!.id);
  // "curtain" matches PR1020 (Permits & Procurement) plus EN1010 and EN1020 (Building Envelope).
  const predicate = makePredicate("all", "curtain")!;
  const node = (name: string) => [...schedule.wbs.values()].find((n) => n.name === name)!;
  const codes = (rows: ReturnType<typeof buildRows>) => rows.filter((r) => r.kind === "task").map((r) => (r as { task: { code: string } }).task.code);
  const envelope = node("Building Envelope");

  test("with nothing collapsed, every match is shown", () => {
    expect(codes(buildRows(schedule.roots, new Set(), predicate)).sort()).toEqual(["EN1010", "EN1020", "PR1020"]);
  });

  test("a collapsed group hides its matches but still shows its own row, marked closed", () => {
    const rows = buildRows(schedule.roots, new Set([envelope.id]), predicate);
    expect(codes(rows)).toEqual(["PR1020"]);
    const row = rows.find((r) => r.kind === "wbs" && r.node.id === envelope.id);
    expect(row).toMatchObject({ expanded: false, matches: 2 });
  });

  test("collapsing the project root leaves just that one row", () => {
    const rows = buildRows(schedule.roots, new Set([schedule.roots[0]!.id]), predicate);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "wbs", expanded: false, matches: 3 });
  });

  test("groups with no matches are dropped whether or not they are collapsed", () => {
    const siteWorks = node("Site Works");
    const open = buildRows(schedule.roots, new Set(), predicate);
    const closed = buildRows(schedule.roots, new Set([siteWorks.id]), predicate);
    for (const rows of [open, closed]) {
      expect(rows.some((r) => r.kind === "wbs" && r.node.id === siteWorks.id)).toBe(false);
    }
    expect(closed).toEqual(open);
  });

  test("each group reports how many of its activities match; nothing is reported without a filter", () => {
    const rows = buildRows(schedule.roots, new Set(), predicate);
    const matchesOf = (name: string) => rows.find((r) => r.kind === "wbs" && r.node.name === name);
    expect(matchesOf("Building Envelope")).toMatchObject({ matches: 2 });
    expect(matchesOf("Permits & Procurement")).toMatchObject({ matches: 1 });
    expect(matchesOf("Riverside Office Building")).toMatchObject({ matches: 3 });
    for (const r of buildRows(schedule.roots, new Set(), null)) if (r.kind === "wbs") expect(r.matches).toBeUndefined();
  });

  test("without a filter the collapsed set works exactly as before", () => {
    const rows = buildRows(schedule.roots, new Set([envelope.id]), null);
    expect(rows.some((r) => r.kind === "task" && r.task.wbsId === envelope.id)).toBe(false);
    expect(rows.some((r) => r.kind === "wbs" && r.node.id === envelope.id && !r.expanded)).toBe(true);
  });
});

describe("the search box and WBS group names", () => {
  const xer = parseXer(sampleText);
  const schedule = buildSchedule(xer, listProjects(xer)[0]!.id);
  const count = (query: string, withSchedule = true) => {
    const p = makePredicate("all", query, null, null, withSchedule ? schedule : null);
    return p ? schedule.activities.filter(p).length : schedule.activities.length;
  };
  const node = (name: string) => [...schedule.wbs.values()].find((n) => n.name === name)!;

  test("finds everything inside a group whose name matches, however deep", () => {
    expect(count("Building Envelope")).toBe(5);
    expect(count("Foundations")).toBe(6);
    // Structure has no activities of its own: they sit in its sub-groups Foundations and Superstructure
    expect(count("Structure")).toBe(node("Structure").activityCount);
    expect(count("Superstructure")).toBe(node("Superstructure").activityCount);
  });

  test("also matches a group's code, ignoring case", () => {
    expect(count("riv.3.1")).toBe(6);
    expect(count("RIV.3.2")).toBe(node("Superstructure").activityCount);
  });

  test("still matches task code and task name as before", () => {
    expect(count("SS1010")).toBe(1);
    expect(count("roof slab")).toBe(1);
    expect(count("")).toBe(schedule.activities.length);
  });

  test("the project's own top row is not searched, or 'Riverside' would match everything", () => {
    expect(schedule.roots[0]!.name).toBe("Riverside Office Building");
    expect(count("Riverside")).toBe(0);
  });

  test("without a schedule the search behaves as it always did (task code and name only)", () => {
    expect(count("Building Envelope", false)).toBe(0);
    expect(count("SS1010", false)).toBe(1);
  });

  test("the rows show the matching groups with their match counts", () => {
    const rows = buildRows(schedule.roots, new Set(), makePredicate("all", "Foundations", null, null, schedule));
    const group = rows.find((r) => r.kind === "wbs" && r.node.name === "Foundations");
    expect(group).toMatchObject({ matches: 6, expanded: true });
    expect(rows.filter((r) => r.kind === "task")).toHaveLength(6);
    expect(rows.some((r) => r.kind === "wbs" && r.node.name === "Site Works")).toBe(false);
  });
});

describe("maxWbsDepth", () => {
  test("a single node with no children is one level", () => {
    expect(maxWbsDepth([wbsNode()])).toBe(1);
  });

  test("counts the deepest branch, not the shallowest", () => {
    const deep = wbsNode([wbsNode([wbsNode()])]); // three levels down this branch
    const shallow = wbsNode();
    expect(maxWbsDepth([deep, shallow])).toBe(3);
  });

  test("an empty tree has no levels", () => {
    expect(maxWbsDepth([])).toBe(0);
  });

  test("the sample project's WBS is three levels deep, e.g. Riverside > Structure > Foundations", () => {
    const xer = parseXer(sampleText);
    const schedule = buildSchedule(xer, listProjects(xer)[0]!.id);
    expect(maxWbsDepth(schedule.roots)).toBe(3);
  });
});

describe("buildRows with a WBS depth limit", () => {
  const xer = parseXer(sampleText);
  const schedule = buildSchedule(xer, listProjects(xer)[0]!.id);
  const node = (name: string) => [...schedule.wbs.values()].find((n) => n.name === name)!;
  const kinds = (rows: ReturnType<typeof buildRows>) => rows.map((r) => (r.kind === "wbs" ? `w:${r.node.name}` : `t:${r.task.code}`));
  const taskCodes = (rows: ReturnType<typeof buildRows>) => rows.filter((r) => r.kind === "task").map((r) => (r as { task: { code: string } }).task.code);

  test("null (the default) is unchanged: every WBS level gets its own row", () => {
    expect(buildRows(schedule.roots, new Set(), null)).toEqual(buildRows(schedule.roots, new Set(), null, null));
  });

  test("level 1: only the project's own row, every activity listed straight under it", () => {
    const rows = buildRows(schedule.roots, new Set(), null, 1);
    expect(rows.filter((r) => r.kind === "wbs")).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "wbs", node: { name: "Riverside Office Building" }, depth: 0 });
    expect(rows.slice(1).every((r) => r.kind === "task" && r.depth === 1)).toBe(true);
    expect(taskCodes(rows)).toHaveLength(schedule.activities.length);
  });

  test("level 2: the top-level groups get rows; everything under each is flattened into it", () => {
    const rows = buildRows(schedule.roots, new Set(), null, 2);
    const wbsRows = rows.filter((r) => r.kind === "wbs");
    expect(wbsRows).toHaveLength(1 + schedule.roots[0]!.children.length);
    expect(wbsRows.some((r) => r.kind === "wbs" && r.node.name === "Foundations")).toBe(false); // level 3, folded away
    expect(wbsRows.some((r) => r.kind === "wbs" && r.node.name === "Structure")).toBe(true);
    // Foundations' and Superstructure's activities now sit directly under Structure, not under a sub-row
    const structureAt = rows.findIndex((r) => r.kind === "wbs" && r.node.name === "Structure");
    const nextGroup = rows.findIndex((r, i) => i > structureAt && r.kind === "wbs");
    const under = rows.slice(structureAt + 1, nextGroup === -1 ? undefined : nextGroup);
    expect(under.every((r) => r.kind === "task")).toBe(true);
    expect(under).toHaveLength(node("Structure").activityCount);
  });

  test("flattening never drops, duplicates or reorders an activity: same task order as unlimited depth", () => {
    const full = taskCodes(buildRows(schedule.roots, new Set(), null));
    expect(taskCodes(buildRows(schedule.roots, new Set(), null, 1))).toEqual(full);
    expect(taskCodes(buildRows(schedule.roots, new Set(), null, 2))).toEqual(full);
  });

  test("at the project's true maximum depth, it matches unlimited exactly", () => {
    const depth = maxWbsDepth(schedule.roots);
    expect(buildRows(schedule.roots, new Set(), null, depth)).toEqual(buildRows(schedule.roots, new Set(), null));
  });

  test("combines with a filter: the flattened row lists only the matches, and reports the right count", () => {
    const predicate = makePredicate("all", "curtain")!; // PR1020, EN1010, EN1020
    const rows = buildRows(schedule.roots, new Set(), predicate, 1);
    expect(rows[0]).toMatchObject({ kind: "wbs", matches: 3 });
    expect(taskCodes(rows).sort()).toEqual(["EN1010", "EN1020", "PR1020"]);
  });

  test("collapsing the deepest visible group still hides everything flattened into it", () => {
    const structure = node("Structure");
    const rows = buildRows(schedule.roots, new Set([structure.id]), null, 2);
    const row = rows.find((r) => r.kind === "wbs" && r.node.id === structure.id);
    expect(row).toMatchObject({ expanded: false });
    expect(rows.some((r) => r.kind === "task" && r.task.wbsId === structure.id)).toBe(false);
  });

  test("kinds read naturally: group row, then its flattened activities, then the next group", () => {
    const rows = buildRows(schedule.roots, new Set(), null, 1);
    expect(kinds(rows)[0]).toBe("w:Riverside Office Building");
    expect(kinds(rows).slice(1).every((k) => k.startsWith("t:"))).toBe(true);
  });
});

describe("buildRows sorted by date", () => {
  const xer = parseXer(sampleText);
  const schedule = buildSchedule(xer, listProjects(xer)[0]!.id);
  const node = (name: string) => [...schedule.wbs.values()].find((n) => n.name === name)!;
  const wbsRows = (rows: ReturnType<typeof buildRows>) => rows.filter((r) => r.kind === "wbs");
  const taskRows = (rows: ReturnType<typeof buildRows>) => rows.filter((r) => r.kind === "task");
  /** True if a list of dated things (nulls last) is in non-decreasing start-date order. */
  const isDateOrdered = (items: Array<{ start: number | null }>) => {
    const keys = items.map((x) => x.start ?? Infinity);
    return keys.every((k, i) => i === 0 || keys[i - 1]! <= k);
  };

  test("with no sort argument, or \"code\", behaviour is exactly as before (the file's own order)", () => {
    const noArg = buildRows(schedule.roots, new Set(), null);
    expect(buildRows(schedule.roots, new Set(), null, null, "code")).toEqual(noArg);
    // Structure's own children are seq-ordered, not date-ordered: Superstructure starts after Foundations but
    // Foundations (the earlier one) is seq'd first either way, so this alone wouldn't catch a broken default —
    // the equality check above, against the pre-existing (already extensively tested) unsorted behaviour, does.
  });

  test("level 2: the project's WBS groups are reordered by their own rolled-up start date", () => {
    const rows = buildRows(schedule.roots, new Set(), null, null, "date");
    const level2 = wbsRows(rows).filter((r) => r.depth === 1);
    expect(level2.length).toBeGreaterThan(3); // Pre-Construction, Site Works, Structure, Building Envelope, ...
    expect(isDateOrdered(level2.map((r) => r.node))).toBe(true);
    // Not already in that order in the file, so this is actually testing something.
    const fileOrder = wbsRows(buildRows(schedule.roots, new Set(), null)).filter((r) => r.depth === 1);
    expect(level2.map((r) => r.node.id)).not.toEqual(fileOrder.map((r) => r.node.id));
  });

  test("level 3: a group's own sub-groups are also reordered by date — the same rule applied one level deeper", () => {
    const rows = buildRows(schedule.roots, new Set(), null, null, "date");
    const structureAt = rows.findIndex((r) => r.kind === "wbs" && r.node.id === node("Structure").id);
    const nextAtOrAbove = rows.findIndex((r, i) => i > structureAt && r.kind === "wbs" && r.depth <= rows[structureAt]!.depth);
    const withinStructure = rows.slice(structureAt + 1, nextAtOrAbove === -1 ? undefined : nextAtOrAbove);
    const level3 = withinStructure.filter((r) => r.kind === "wbs" && r.depth === rows[structureAt]!.depth + 1);
    expect(level3).toHaveLength(2); // Foundations, Superstructure
    expect(isDateOrdered(level3.map((r) => (r as { node: { start: number | null } }).node))).toBe(true);
    expect(level3[0]).toMatchObject({ node: { name: "Foundations" } }); // Foundations starts first in the sample
  });

  test("activities within a group are reordered by their own start date, not by activity code", () => {
    const rows = buildRows(schedule.roots, new Set(), null, null, "date");
    const procurement = node("Permits & Procurement");
    const at = rows.findIndex((r) => r.kind === "wbs" && r.node.id === procurement.id);
    const tasks = taskRows(rows.slice(at + 1)).filter((r) => r.task.wbsId === procurement.id);
    expect(tasks.length).toBeGreaterThan(1);
    expect(isDateOrdered(tasks.map((r) => r.task))).toBe(true);
    // PR1020 depends on the earliest-finishing design activity, so by date it comes before PR1010 despite its code.
    expect(tasks.map((r) => r.task.code)).toEqual(["PR1000", "PR1020", "PR1010", "PR1030", "M0020"]);
    const byCodeOrder = taskRows(buildRows(schedule.roots, new Set(), null)).filter((r) => r.task.wbsId === procurement.id);
    expect(tasks.map((r) => r.task.code)).not.toEqual(byCodeOrder.map((r) => r.task.code)); // actually reordered
  });

  test("combined with a WBS depth limit, the flattened activities are sorted as one list, not per sub-group then concatenated", () => {
    const rows = buildRows(schedule.roots, new Set(), null, 2, "date");
    const structureAt = rows.findIndex((r) => r.kind === "wbs" && r.node.id === node("Structure").id);
    const nextGroup = rows.findIndex((r, i) => i > structureAt && r.kind === "wbs");
    const flattened = taskRows(rows.slice(structureAt + 1, nextGroup === -1 ? undefined : nextGroup));
    expect(flattened.length).toBe(node("Structure").activityCount);
    expect(isDateOrdered(flattened.map((r) => r.task))).toBe(true);
  });

  test("the roots themselves are reordered by date too (not just their children), and an undated one sorts last", () => {
    // Deliberately the opposite of both file order and code order, so nothing here can pass by coincidence.
    const late = { id: "late", code: "A", children: [], activities: [], start: d(2026, 6, 1) } as unknown as WbsNode;
    const early = { id: "early", code: "B", children: [], activities: [], start: d(2026, 1, 1) } as unknown as WbsNode;
    const undated = { id: "undated", code: "C", children: [], activities: [], start: null } as unknown as WbsNode;
    const rows = buildRows([late, undated, early], new Set(), null, null, "date");
    expect(rows.map((r) => (r as { node: { id: string } }).node.id)).toEqual(["early", "late", "undated"]);
  });

  test("filtering and date sorting combine: only matches are shown, still in date order, with correct counts", () => {
    const predicate = makePredicate("all", "curtain")!; // PR1020, EN1010, EN1020
    const rows = buildRows(schedule.roots, new Set(), predicate, null, "date");
    const tasks = taskRows(rows);
    expect(tasks.map((r) => r.task.code).sort()).toEqual(["EN1010", "EN1020", "PR1020"]);
    expect(isDateOrdered(tasks.map((r) => r.task))).toBe(true);
  });
});

describe("describeDateRange (the Dates chip label)", () => {
  test("says 'Any dates' when nothing is set, or when the values aren't real dates", () => {
    expect(describeDateRange("", "")).toBe("Any dates");
    expect(describeDateRange("not a date", "")).toBe("Any dates");
  });

  test("shows both ends, or says which end is open", () => {
    expect(describeDateRange("2026-10-01", "2026-10-31")).toBe("01-Oct-26 – 31-Oct-26");
    expect(describeDateRange("2026-10-01", "")).toBe("From 01-Oct-26");
    expect(describeDateRange("", "2026-10-31")).toBe("Until 31-Oct-26");
  });
});
