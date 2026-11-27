import { describe, expect, test } from "bun:test";
import type { Row } from "./scheduleRows";
import { navigateRows } from "./treeNav";

const group = (id: string, depth: number, expanded: boolean, content = true) =>
  ({ kind: "wbs", key: `w${id}`, depth, expanded, node: { id, children: [], activities: content ? [{}] : [] } }) as unknown as Row;
const task = (id: string, depth: number) => ({ kind: "task", key: `t${id}`, depth, task: { id } }) as unknown as Row;

// A (open)
//   A1 (task)
//   B (open)
//     B1 (task)
//   C (closed)
// D (empty group)
const rows: Row[] = [group("A", 0, true), task("A1", 1), group("B", 1, true), task("B1", 2), group("C", 1, false), group("D", 0, true, false)];

describe("navigateRows: up, down, home and end", () => {
  test("steps through every row, groups included", () => {
    expect(navigateRows(rows, 0, "ArrowDown")).toEqual({ select: 1 });
    expect(navigateRows(rows, 1, "ArrowDown")).toEqual({ select: 2 });
    expect(navigateRows(rows, 3, "ArrowUp")).toEqual({ select: 2 });
  });

  test("stops at either end", () => {
    expect(navigateRows(rows, 5, "ArrowDown")).toBeNull();
    expect(navigateRows(rows, 0, "ArrowUp")).toBeNull();
  });

  test("with nothing selected, Down starts at the top and Up at the bottom", () => {
    expect(navigateRows(rows, -1, "ArrowDown")).toEqual({ select: 0 });
    expect(navigateRows(rows, -1, "ArrowUp")).toEqual({ select: 5 });
  });

  test("Home and End go to the first and last row", () => {
    expect(navigateRows(rows, 3, "Home")).toEqual({ select: 0 });
    expect(navigateRows(rows, 3, "End")).toEqual({ select: 5 });
    expect(navigateRows(rows, 0, "Home")).toBeNull();
  });

  test("does nothing with no rows", () => {
    expect(navigateRows([], -1, "ArrowDown")).toBeNull();
  });
});

describe("navigateRows: left and right", () => {
  test("Left closes an open group", () => {
    expect(navigateRows(rows, 0, "ArrowLeft")).toEqual({ close: "A" });
    expect(navigateRows(rows, 2, "ArrowLeft")).toEqual({ close: "B" });
  });

  test("Left on an activity or a closed group goes to the group above", () => {
    expect(navigateRows(rows, 1, "ArrowLeft")).toEqual({ select: 0 });
    expect(navigateRows(rows, 3, "ArrowLeft")).toEqual({ select: 2 });
    expect(navigateRows(rows, 4, "ArrowLeft")).toEqual({ select: 0 });
  });

  test("Left on a top-level group that is closed or empty has nowhere to go", () => {
    expect(navigateRows(rows, 5, "ArrowLeft")).toBeNull();
    expect(navigateRows([group("Z", 0, false)], 0, "ArrowLeft")).toBeNull();
  });

  test("Right opens a closed group, then goes into it", () => {
    expect(navigateRows(rows, 4, "ArrowRight")).toEqual({ open: "C" });
    expect(navigateRows(rows, 0, "ArrowRight")).toEqual({ select: 1 });
    expect(navigateRows(rows, 2, "ArrowRight")).toEqual({ select: 3 });
  });

  test("Right does nothing on an activity, an empty group, or an open group with nothing showing under it", () => {
    expect(navigateRows(rows, 1, "ArrowRight")).toBeNull();
    expect(navigateRows(rows, 5, "ArrowRight")).toBeNull();
    expect(navigateRows([group("E", 0, true), group("F", 0, true)], 0, "ArrowRight")).toBeNull();
  });

  test("does nothing when no row is selected", () => {
    expect(navigateRows(rows, -1, "ArrowLeft")).toBeNull();
    expect(navigateRows(rows, -1, "ArrowRight")).toBeNull();
  });
});
