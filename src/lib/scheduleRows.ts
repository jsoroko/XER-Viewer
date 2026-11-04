import { isMilestone, wbsBranch, type Activity, type ActivityStatus, type Schedule, type WbsNode } from "./xer/model";
import { fmtDate } from "./format";
import { naturalCompare, parseDate } from "./xer/values";

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

/** The number of WBS levels in the deepest branch (the roots are level 1). An empty tree has none. */
export function maxWbsDepth(roots: WbsNode[]): number {
  const depth = (node: WbsNode): number => (node.children.length === 0 ? 1 : 1 + Math.max(...node.children.map(depth)));
  return roots.length === 0 ? 0 : Math.max(...roots.map(depth));
}

/**
 * How siblings are ordered at every level of the WBS tree — both WBS sub-groups among themselves, and the
 * activities inside each group:
 * - `code`: the order already baked into the file (WBS groups in the sequence the project was built in, activities
 *   by activity code). This is the default, and matches what the app has always shown.
 * - `date`: everything reordered by its own start date instead — a WBS group by its earliest rolled-up start, an
 *   activity by its own start. Applied at every level, so within a date-sorted level-1 group its level-2 sub-groups
 *   are themselves in date order, and so on all the way down. Items that start on the same day go earliest finish
 *   first, then by code.
 * Undated groups or activities (no dated descendants, or no start of their own) sort after everything dated.
 */
export type ActivitySort = "code" | "date";

/** Midnight at the start of the (local) day, which is what the Start column shows; undated is last. */
const dayOf = (t: number | null) => {
  if (t === null) return Infinity;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/**
 * Orders by start *day*, then finish, then code, with the undated last:
 * - the day, not the exact time, because the table shows only the date: two items that show the same start date are
 *   tied, whatever hour their calendars start work at;
 * - then the earlier finish first, so a milestone or a one-day activity comes before a long one that starts the same
 *   day (as when sorting by Start then Finish in P6 or MS Project);
 * - then the code, so the order is always the same.
 * The keys are worked out once per item, not on every comparison, since this runs on the whole schedule.
 */
function sortByDate<T extends { start: number | null; finish?: number | null; code: string }>(items: readonly T[]): T[] {
  const keyed = items.map((item) => ({ item, day: dayOf(item.start), finish: item.finish ?? Infinity }));
  keyed.sort((a, b) => a.day - b.day || a.finish - b.finish || naturalCompare(a.item.code, b.item.code));
  return keyed.map((k) => k.item);
}

function sortedChildren(children: WbsNode[], sort: ActivitySort): WbsNode[] {
  return sort === "date" ? sortByDate(children) : children; // "code" order is already how the model built the tree
}
function sortedActivities(activities: Activity[], sort: ActivitySort): Activity[] {
  return sort === "date" ? sortByDate(activities) : activities; // ditto
}

/**
 * Every activity under this node. In "code" order this is the same left-to-right order the full tree shows them
 * (each sub-group in turn, then this node's own activities) — there's no file-defined "date order" spanning
 * sub-groups to preserve, so in "date" order the whole flattened list is sorted together instead.
 */
function flattenActivities(node: WbsNode, sort: ActivitySort): Activity[] {
  const out: Activity[] = [];
  for (const child of node.children) out.push(...flattenActivities(child, sort));
  out.push(...node.activities);
  return sort === "date" ? sortByDate(out) : out;
}

/**
 * Flattens the WBS tree into display rows. `collapsed` is honoured whether or not a filter is active.
 * While filtering, branches with no matching activity are dropped (open or not), and each remaining
 * group reports how many activities in it match.
 *
 * `wbsDepth` limits how many levels of WBS group get their own row, like P6's "Group by WBS" level
 * setting (the roots are level 1). Once that many levels have been shown, every activity still below
 * is listed directly under the deepest group shown, with no further group rows in between. Group
 * dates, activity counts and match counts are unaffected: they still cover the whole branch. Null
 * (the default) shows every level, as before. 0 shows no group rows at all: just the activities, in one flat list
 * (in "code" order that is each branch in turn; in "date" order the whole list is sorted together).
 *
 * `sort` chooses the order of siblings at every level; see `ActivitySort`. Defaults to "code", today's behaviour.
 */
export function buildRows(
  roots: WbsNode[],
  collapsed: ReadonlySet<string>,
  predicate: ((a: Activity) => boolean) | null,
  wbsDepth: number | null = null,
  sort: ActivitySort = "code",
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
  if (wbsDepth === 0) {
    const all = sortedChildren(roots, sort).flatMap((r) => flattenActivities(r, sort));
    for (const task of sort === "date" ? sortByDate(all) : all) {
      if (!predicate || predicate(task)) out.push({ kind: "task", key: `t${task.id}`, task, depth: 0 });
    }
    return out;
  }
  const visit = (node: WbsNode, depth: number) => {
    const found = predicate ? (matches.get(node.id) ?? 0) : undefined;
    if (found === 0) return;
    const expanded = !collapsed.has(node.id);
    out.push({ kind: "wbs", key: `w${node.id}`, node, depth, expanded, matches: found });
    if (!expanded) return;
    if (wbsDepth !== null && depth + 1 >= wbsDepth) {
      for (const task of flattenActivities(node, sort)) {
        if (!predicate || predicate(task)) out.push({ kind: "task", key: `t${task.id}`, task, depth: depth + 1 });
      }
      return;
    }
    for (const child of sortedChildren(node.children, sort)) visit(child, depth + 1);
    for (const task of sortedActivities(node.activities, sort)) {
      if (!predicate || predicate(task)) out.push({ kind: "task", key: `t${task.id}`, task, depth: depth + 1 });
    }
  };
  sortedChildren(roots, sort).forEach((r) => visit(r, 0));
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

// ---- Opening and closing everything inside one group ---------------------------------------------------------------
/** Every WBS group below this one, at any depth. */
export function groupsBelow(node: WbsNode): WbsNode[] {
  const out: WbsNode[] = [];
  const visit = (n: WbsNode) => {
    for (const c of n.children) {
      out.push(c);
      visit(c);
    }
  };
  visit(node);
  return out;
}

/** A group with nothing in it has nothing to open or close. */
const hasContent = (n: WbsNode) => n.children.length > 0 || n.activities.length > 0;

/**
 * `collapsed` with the group and every group below it opened, so all its activities show. Nothing outside the group
 * changes. Returns the same set when it was already fully open.
 */
export function expandWithin(collapsed: ReadonlySet<string>, node: WbsNode): ReadonlySet<string> {
  const ids = [node, ...groupsBelow(node)].map((n) => n.id);
  if (!ids.some((id) => collapsed.has(id))) return collapsed;
  const next = new Set(collapsed);
  for (const id of ids) next.delete(id);
  return next;
}

/**
 * `collapsed` with the group and every group below it closed. Opening the group again later then shows its own groups
 * closed, as expanding it fully and collapsing it again would. Nothing outside the group changes. Returns the same set
 * when there was nothing to close.
 */
export function collapseWithin(collapsed: ReadonlySet<string>, node: WbsNode): ReadonlySet<string> {
  const ids = [node, ...groupsBelow(node)].filter(hasContent).map((n) => n.id);
  if (ids.every((id) => collapsed.has(id))) return collapsed;
  const next = new Set(collapsed);
  for (const id of ids) next.add(id);
  return next;
}

/** Whether "expand everything inside" would open something: the group, or a group below it, is closed. */
export const canExpandWithin = (collapsed: ReadonlySet<string>, node: WbsNode) =>
  (hasContent(node) && collapsed.has(node.id)) || groupsBelow(node).some((n) => hasContent(n) && collapsed.has(n.id));

/** Whether "collapse" would close something: the group, or a group below it, is open. */
export const canCollapseWithin = (collapsed: ReadonlySet<string>, node: WbsNode) =>
  [node, ...groupsBelow(node)].some((n) => hasContent(n) && !collapsed.has(n.id));
