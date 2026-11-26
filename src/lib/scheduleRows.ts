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
 * How WBS groups are ordered, at every level of the tree:
 * - `sequence`: the order already baked into the file (the sequence the project's groups were built in). This is the
 *   default, and what P6 shows.
 * - `date`: each group by its own earliest rolled-up start instead. Applied at every level, so within a date-sorted
 *   level-1 group its level-2 sub-groups are themselves in date order, and so on all the way down. Groups that start on
 *   the same day go earliest finish first, then by code.
 * Undated groups (nothing dated in them) sort after everything dated. This never moves activities: they are ordered by
 * `ActivitySort`.
 */
export type WbsSort = "sequence" | "date";

/** The date columns the activities can be sorted by. */
export type DateField = "start" | "finish" | "actualStart" | "actualFinish";

/**
 * How the activities inside each group are ordered. `null` (the default) is by Activity ID. Otherwise they go by one of the
 * date columns, earliest first (`asc`) or latest first (`desc`), and the groups stay where `WbsSort` puts them. With no
 * WBS groups shown, or when levels are flattened into one, the whole flattened list is ordered together. Activities
 * with no such date go last in either direction.
 */
export interface ActivitySort {
  field: DateField;
  dir: "asc" | "desc";
}

/** Whether a table column's key is one of the date columns the activities can be sorted by. */
export const isDateField = (key: string): key is DateField => key === "start" || key === "finish" || key === "actualStart" || key === "actualFinish";

export const DATE_FIELD_LABELS: Record<DateField, string> = {
  start: "Start",
  finish: "Finish",
  actualStart: "Actual start",
  actualFinish: "Actual finish",
};

/** "Start, earliest first": for tooltips and the PDF header. */
export const describeActivitySort = (sort: ActivitySort) =>
  `${DATE_FIELD_LABELS[sort.field]}, ${sort.dir === "asc" ? "earliest" : "latest"} first`;

/**
 * What a click on a date column's heading does: first earliest-first, then latest-first, then back to Activity ID order.
 * Clicking a different column starts that one earliest-first.
 */
export function nextActivitySort(current: ActivitySort | null, field: DateField): ActivitySort | null {
  if (current?.field !== field) return { field, dir: "asc" };
  return current.dir === "asc" ? { field, dir: "desc" } : null;
}

/** Midnight at the start of the (local) day, which is what the date columns show; undated is last. */
const dayOf = (t: number | null) => {
  if (t === null) return Infinity;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const cmp = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);

/**
 * Orders WBS groups by start *day*, then finish, then code, with the undated last:
 * - the day, not the exact time, because the table shows only the date: two items that show the same start date are
 *   tied, whatever hour their calendars start work at;
 * - then the earlier finish first, so a group of one-day activities comes before a long one that starts the same
 *   day (as when sorting by Start then Finish in P6 or MS Project);
 * - then the code, so the order is always the same.
 * The keys are worked out once per item, not on every comparison, since this runs on the whole schedule.
 */
function sortGroupsByDate(groups: readonly WbsNode[]): WbsNode[] {
  const keyed = groups.map((item) => ({ item, day: dayOf(item.start), finish: item.finish ?? Infinity }));
  keyed.sort((a, b) => a.day - b.day || cmp(a.finish, b.finish) || naturalCompare(a.item.code, b.item.code));
  return keyed.map((k) => k.item);
}

const DATE_OF: Record<DateField, (a: Activity) => number | null> = {
  start: (a) => a.start,
  finish: (a) => a.finish,
  actualStart: (a) => a.actualStart,
  actualFinish: (a) => a.actualFinish,
};
/** What breaks a tie on the day: the other end of the bar, so a milestone comes before a long activity that starts with it. */
const TIE_OF: Record<DateField, (a: Activity) => number | null> = {
  start: (a) => a.finish,
  finish: (a) => a.start,
  actualStart: (a) => a.start,
  actualFinish: (a) => a.finish,
};

/**
 * Orders activities by one date column's *day*, in the direction asked for, then by the other end of the bar (always
 * earliest first), then by code. Those with no such date are last, in either direction.
 */
function sortActivitiesByDate(activities: readonly Activity[], sort: ActivitySort): Activity[] {
  const date = DATE_OF[sort.field];
  const tie = TIE_OF[sort.field];
  const sign = sort.dir === "asc" ? 1 : -1;
  const keyed = activities.map((item) => ({ item, day: dayOf(date(item)), tie: tie(item) ?? Infinity }));
  keyed.sort((a, b) => {
    if (a.day !== b.day) {
      if (a.day === Infinity) return 1;
      if (b.day === Infinity) return -1;
      return sign * cmp(a.day, b.day);
    }
    return cmp(a.tie, b.tie) || naturalCompare(a.item.code, b.item.code);
  });
  return keyed.map((k) => k.item);
}

function sortedChildren(children: WbsNode[], sort: WbsSort): WbsNode[] {
  return sort === "date" ? sortGroupsByDate(children) : children; // "sequence" is already how the model built the tree
}
function sortedActivities(activities: Activity[], sort: ActivitySort | null): Activity[] {
  return sort ? sortActivitiesByDate(activities, sort) : activities; // otherwise already in Activity ID order
}

/**
 * Every activity under this node, in the order the full tree shows them: each sub-group in turn (in the WBS order
 * chosen), then this node's own activities. When the activities are sorted by a date there is no tree order to preserve
 * across sub-groups, so the whole list is sorted together instead.
 */
function flattenActivities(node: WbsNode, wbsSort: WbsSort, sort: ActivitySort | null): Activity[] {
  const out: Activity[] = [];
  for (const child of sortedChildren(node.children, wbsSort)) out.push(...flattenActivities(child, wbsSort, null));
  out.push(...node.activities);
  return sort ? sortActivitiesByDate(out, sort) : out;
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
 * (by default that is each branch in turn; with an activity sort the whole list is sorted together).
 *
 * `wbsSort` chooses the order of the WBS groups at every level, and `activitySort` the order of the activities inside
 * them; see `WbsSort` and `ActivitySort`. The defaults are the file's own sequence, and Activity ID.
 */
export function buildRows(
  roots: WbsNode[],
  collapsed: ReadonlySet<string>,
  predicate: ((a: Activity) => boolean) | null,
  wbsDepth: number | null = null,
  wbsSort: WbsSort = "sequence",
  activitySort: ActivitySort | null = null,
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
    const all = sortedChildren(roots, wbsSort).flatMap((r) => flattenActivities(r, wbsSort, null));
    for (const task of activitySort ? sortActivitiesByDate(all, activitySort) : all) {
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
      for (const task of flattenActivities(node, wbsSort, activitySort)) {
        if (!predicate || predicate(task)) out.push({ kind: "task", key: `t${task.id}`, task, depth: depth + 1 });
      }
      return;
    }
    for (const child of sortedChildren(node.children, wbsSort)) visit(child, depth + 1);
    for (const task of sortedActivities(node.activities, activitySort)) {
      if (!predicate || predicate(task)) out.push({ kind: "task", key: `t${task.id}`, task, depth: depth + 1 });
    }
  };
  sortedChildren(roots, wbsSort).forEach((r) => visit(r, 0));
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
