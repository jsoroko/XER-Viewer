import { isMilestone, wbsBranch, type Activity, type ActivityStatus, type Schedule, type WbsNode } from "./xer/model";
import { fmtDate } from "./format";
import { parseDate } from "./xer/values";

export type ActivityFilter = "all" | "critical" | ActivityStatus | "milestones";

/** The choices in the "All activities" dropdown, in order. */
export const ACTIVITY_FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "All activities" },
  { id: "critical", label: "Critical" },
  { id: "not-started", label: "Not started" },
  { id: "in-progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "milestones", label: "Milestones" },
];

export const ACTIVITY_FILTER_LABEL = Object.fromEntries(ACTIVITY_FILTERS.map((f) => [f.id, f.label])) as Record<ActivityFilter, string>;

export interface WbsRow {
  kind: "wbs";
  key: string;
  node: WbsNode;
  depth: number;
  expanded: boolean;
  /** Activities in this branch that pass the filter; undefined when nothing is being filtered. */
  matches?: number;
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

export const DATE_MODE_LABEL: Record<DateMode, string> = {
  active: "Active in range",
  starts: "Starting in range",
  finishes: "Finishing in range",
};

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

/** Short wording for a date range, for the button that opens the date filter. */
export function describeDateRange(from: string, to: string): string {
  const f = from ? parseDate(from) : null;
  const t = to ? parseDate(to) : null;
  if (f !== null && t !== null) return `${fmtDate(f)} – ${fmtDate(t)}`;
  if (f !== null) return `From ${fmtDate(f)}`;
  if (t !== null) return `Until ${fmtDate(t)}`;
  return "Any dates";
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
  /** An extra test that must also pass, e.g. the user-built conditions. */
  extra: ((a: Activity) => boolean) | null = null,
  /**
   * When given, the search text also matches the names and codes of the WBS groups an activity sits under (its
   * own group and every parent group, not the project's root), so "WP23" finds everything inside a WP23 group.
   */
  schedule: Schedule | null = null,
): ((a: Activity) => boolean) | null {
  const q = query.trim().toLowerCase();
  if (filter === "all" && !q && !range && !extra) return null;
  const branchText = new Map<string, string>();
  const inBranch = (a: Activity) => {
    if (!schedule) return false;
    let text = branchText.get(a.wbsId);
    if (text === undefined) {
      text = wbsBranch(schedule, a.wbsId)
        .map((n) => `${n.name}\n${n.code}`)
        .join("\n")
        .toLowerCase();
      branchText.set(a.wbsId, text);
    }
    return text.includes(q);
  };
  return (a) => {
    if (extra && !extra(a)) return false;
    if (filter === "critical" && !a.critical) return false;
    if (filter === "milestones" && !isMilestone(a)) return false;
    if ((filter === "not-started" || filter === "in-progress" || filter === "completed") && a.status !== filter) {
      return false;
    }
    if (range && !matchesDateRange(a, range)) return false;
    return !q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || inBranch(a);
  };
}

/**
 * Flattens the WBS tree into display rows. `collapsed` is honoured whether or not a filter is active.
 * While filtering, branches with no matching activity are dropped (open or not), and each remaining
 * group reports how many activities in it match.
 */
export function buildRows(
  roots: WbsNode[],
  collapsed: ReadonlySet<string>,
  predicate: ((a: Activity) => boolean) | null,
): Row[] {
  const matches = new Map<string, number>();
  if (predicate) {
    const count = (node: WbsNode): number => {
      let n = 0;
      for (const child of node.children) n += count(child);
      for (const task of node.activities) if (predicate(task)) n++;
      matches.set(node.id, n);
      return n;
    };
    roots.forEach(count);
  }

  const out: Row[] = [];
  const visit = (node: WbsNode, depth: number) => {
    const found = predicate ? (matches.get(node.id) ?? 0) : undefined;
    if (found === 0) return;
    const expanded = !collapsed.has(node.id);
    out.push({ kind: "wbs", key: `w${node.id}`, node, depth, expanded, matches: found });
    if (!expanded) return;
    for (const child of node.children) visit(child, depth + 1);
    for (const task of node.activities) {
      if (!predicate || predicate(task)) out.push({ kind: "task", key: `t${task.id}`, task, depth: depth + 1 });
    }
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
