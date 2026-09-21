import { describe, expect, test } from "bun:test";
import { buildLinks, routeLink, STUB } from "./links";
import type { Activity, Relationship } from "./xer/model";

const ROW = 26;
const pt = (x: number, y: number) => ({ x, y });

describe("routeLink", () => {
  test("FS with room: one shared vertical just after the predecessor", () => {
    const { points, arrowDir } = routeLink(pt(100, 13), "finish", pt(200, 39), "start", ROW);
    expect(points).toEqual([pt(100, 13), pt(100 + STUB, 13), pt(100 + STUB, 39), pt(200, 39)]);
    expect(arrowDir).toBe(1);
  });

  test("FS when the successor starts too soon: detours through the gap between rows", () => {
    const { points } = routeLink(pt(200, 13), "finish", pt(190, 39), "start", ROW);
    expect(points).toEqual([
      pt(200, 13),
      pt(200 + STUB, 13),
      pt(200 + STUB, 26), // row boundary
      pt(190 - STUB, 26),
      pt(190 - STUB, 39),
      pt(190, 39),
    ]);
  });

  test("detour goes upward when the successor is above", () => {
    const { points } = routeLink(pt(200, 65), "finish", pt(190, 39), "start", ROW);
    expect(points[2]!.y).toBe(52);
  });

  test("SS: vertical sits left of whichever bar starts first", () => {
    const { points } = routeLink(pt(150, 13), "start", pt(120, 39), "start", ROW);
    expect(points[1]).toEqual(pt(120 - STUB, 13));
    expect(points[2]).toEqual(pt(120 - STUB, 39));
    expect(points).toHaveLength(4);
  });

  test("FF: vertical sits right of whichever bar finishes last, arrow points left", () => {
    const { points, arrowDir } = routeLink(pt(150, 13), "finish", pt(180, 39), "finish", ROW);
    expect(points[1]).toEqual(pt(180 + STUB, 13));
    expect(points).toHaveLength(4);
    expect(arrowDir).toBe(-1);
  });

  test("SF: shared vertical when the predecessor starts well right of the successor's finish, else detour", () => {
    expect(routeLink(pt(300, 13), "start", pt(100, 39), "finish", ROW).points).toHaveLength(4);
    expect(routeLink(pt(100, 13), "start", pt(300, 39), "finish", ROW).points).toHaveLength(6);
  });

  test("every segment is horizontal or vertical and ends exactly on the target", () => {
    const sides = ["start", "finish"] as const;
    for (const fs of sides)
      for (const ts of sides)
        for (const [fx, tx] of [[100, 300], [300, 100], [200, 205]] as const)
          for (const ty of [39, -13]) {
            const { points } = routeLink(pt(fx, 13), fs, pt(tx, ty), ts, ROW);
            expect(points[0]).toEqual(pt(fx, 13));
            expect(points[points.length - 1]).toEqual(pt(tx, ty));
            for (let i = 1; i < points.length; i++) {
              const [p, q] = [points[i - 1]!, points[i]!];
              expect(p.x === q.x || p.y === q.y).toBe(true);
            }
          }
  });
});

describe("buildLinks", () => {
  const act = (id: string, start: number | null, finish: number | null, type: Activity["type"] = "task") =>
    ({ id, start, finish, type }) as Activity;
  const rel = (id: string, pred: string, task: string, type: Relationship["type"] = "FS"): Relationship => ({
    id,
    predTaskId: pred,
    taskId: task,
    type,
    lagHrs: 0,
  });

  const byId = new Map([
    ["a", act("a", 0, 100)],
    ["sel", act("sel", 200, 300)],
    ["c", act("c", 400, 500)],
    ["ms", act("ms", 600, 600, "finish-milestone")],
    ["undated", act("undated", null, null)],
  ]);
  const x = (t: number) => t;

  test("draws predecessors and successors between visible rows", () => {
    const rowIndex = new Map([["a", 0], ["sel", 1], ["c", 2]]);
    const layer = buildLinks({
      predecessors: [rel("1", "a", "sel")],
      successors: [rel("2", "sel", "c")],
      activityById: byId,
      rowIndex,
      x,
      rowH: ROW,
    });
    expect(layer.paths.map((p) => p.kind)).toEqual(["pred", "succ"]);
    expect(layer.hidden).toBe(0);
    // predecessor finish (100) → selected start (200), rows 0 → 1
    expect(layer.paths[0]!.d).toBe("M100 13 L108 13 L108 39 L200 39");
    expect(layer.paths[0]!.arrow).toBe("200,39 195,36 195,42");
    // SVG bounds cover both rows with a margin
    expect(layer.top).toBeLessThanOrEqual(13 - 4);
    expect(layer.top + layer.height).toBeGreaterThanOrEqual(65);
  });

  test("counts links whose other end is not on screen or has no dates", () => {
    const layer = buildLinks({
      predecessors: [rel("1", "a", "sel"), rel("2", "undated", "sel"), rel("3", "gone", "sel")],
      successors: [rel("4", "sel", "c")],
      activityById: byId,
      rowIndex: new Map([["sel", 1], ["undated", 2]]), // a and c are collapsed away
      x,
      rowH: ROW,
    });
    expect(layer.paths).toHaveLength(0);
    expect(layer.hidden).toBe(4);
    expect(layer.height).toBe(0);
  });

  test("attaches to the diamond's edge for milestones", () => {
    const layer = buildLinks({
      predecessors: [],
      successors: [rel("1", "sel", "ms")],
      activityById: byId,
      rowIndex: new Map([["sel", 0], ["ms", 1]]),
      x,
      rowH: ROW,
    });
    // arrives at the milestone's left edge (600 − 7)
    expect(layer.paths[0]!.d.endsWith("L593 39")).toBe(true);
  });
});
