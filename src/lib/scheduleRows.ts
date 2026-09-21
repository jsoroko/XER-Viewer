import { isMilestone, type Activity, type ActivityStatus, type WbsNode } from "./xer/model";
import { parseDate } from "./xer/values";

export type ActivityFilter = "all" | "critical" | ActivityStatus | "milestones";

export interface WbsRow {
  kind: "wbs";
  key: string;
  node: WbsNode;
  depth: number;
  expanded: boolean;
}
export interface TaskRow {
  kind: "task";
  key: string;
  task: Activity;
  depth: number;
}
export type Row = WbsRow | TaskRow;

/**
 * How an activity's dates are compared with the range:
 * - `active`: it is underway at some point in the range (its bar overlaps it)
 * - `starts` / `finishes`: that date falls inside the range
 */
export type DateMode = "active" | "starts" | "finishes";

/** Inclusive range in epoch ms; a null bound is open-ended. */
export interface DateRange {
  from: number | null;
  to: number | null;
  mode: DateMode;
}

export const endOfDay = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
};

/**
 * Turns the two `<input type="date">` values (YYYY-MM-DD or empty) into a range covering whole days.
 * Returns `null` when neither is set, and `"invalid"` when From falls after To.
 */
export function toDateRange(from: string, to: string, mode: DateMode): DateRange | "invalid" | null {
  const f = from ? parseDate(from) : null;
  const t = to ? parseDate(to) : null;
  if (f === null && t === null) return null;
  const range: DateRange = { from: f, to: t === null ? null : endOfDay(t), mode };
  return range.from !== null && range.to !== null && range.from > range.to ? "invalid" : range;
}

export function matchesDateRange(a: Activity, r: DateRange): boolean {
  const { start, finish } = a;
  if (start === null || finish === null) return false; // undated activities can't be placed in a range
  const from = r.from ?? -Infinity;
  const to = r.to ?? Infinity;
  if (r.mode === "starts") return start >= from && start <= to;
  if (r.mode === "finishes") return finish >= from && finish <= to;
  return start <= to && finish >= from;
}

export function makePredicate(
  filter: ActivityFilter,
  query: string,
  range: DateRange | null = null,
): ((a: Activity) => boolean) | null {
  const q = query.trim().toLowerCase();
  if (filter === "all" && !q && !range) return null;
  return (a) => {
    if (filter === "critical" && !a.critical) return false;
    if (filter === "milestones" && !isMilestone(a)) return false;
    if ((filter === "not-started" || filter === "in-progress" || filter === "completed") && a.status !== filter) {
      return false;
    }
    if (range && !matchesDateRange(a, range)) return false;
    return !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
  };
}

/**
 * Flattens the WBS tree into display rows. While a predicate is active every
 * WBS node with a match is forced open and empty branches are dropped.
 */
export function buildRows(
  roots: WbsNode[],
  collapsed: ReadonlySet<string>,
  predicate: ((a: Activity) => boolean) | null,
): Row[] {
  const out: Row[] = [];
  const visit = (node: WbsNode, depth: number) => {
    const mark = out.length;
    const expanded = predicate !== null || !collapsed.has(node.id);
    out.push({ kind: "wbs", key: `w${node.id}`, node, depth, expanded });
    if (expanded) {
      for (const child of node.children) visit(child, depth + 1);
      for (const task of node.activities) {
        if (!predicate || predicate(task)) out.push({ kind: "task", key: `t${task.id}`, task, depth: depth + 1 });
      }
    }
    if (predicate !== null && out.length === mark + 1) out.length = mark;
  };
  roots.forEach((r) => visit(r, 0));
  return out;
}

/** Ids of every WBS node that has something to expand. */
export function collapsibleIds(roots: WbsNode[]): string[] {
  const ids: string[] = [];
  const visit = (n: WbsNode) => {
    if (n.children.length || n.activities.length) ids.push(n.id);
    n.children.forEach(visit);
  };
  roots.forEach(visit);
  return ids;
}
