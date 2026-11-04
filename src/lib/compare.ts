import { fmtDate, fmtDays } from "./format";
import { CONSTRAINT_LABEL } from "./xer/values";
import { rollUpWbs, type Activity, type ActivityStatus, type Schedule, type WbsNode } from "./xer/model";

/**
 * Comparing two revisions of a programme.
 *
 * Activities are matched by their Activity ID (task_code), not by the database id: a revision that has been exported,
 * re-imported or copied gets new database ids, while the ID people see stays the same. The older file is the
 * *baseline*, the newer one the *current* programme. What differs is reported per activity:
 *
 * - **added**: in the current programme only
 * - **removed**: in the baseline only
 * - **modified**: in both, with a difference in one of the fields being compared
 * - **unchanged**: in both and the same in every field being compared
 *
 * Two steps, so the (costly) matching is not redone when the person only changes what counts as a difference:
 * `matchSchedules` pairs the activities up and builds the schedule to display, then `classify` labels each one.
 */

export type ChangeKind = "added" | "removed" | "modified" | "unchanged";

export type ChangeField = "dates" | "logic" | "progress" | "constraints" | "names";

/** What can be switched on or off as a difference, in display order. */
export const CHANGE_FIELDS: Array<{ key: ChangeField; label: string; help: string }> = [
  {
    key: "dates",
    label: "Dates",
    help: "Counts an activity as modified when its start or finish date is different. These are the dates the schedule shows: actual once work has started or finished, otherwise the planned ones. A change of duration moves them, so it is covered here too.",
  },
  {
    key: "logic",
    label: "Logic",
    help: "Counts an activity as modified when a predecessor has been added or removed, or when the type or lag of a relationship is different. Predecessors are matched by Activity ID.",
  },
  {
    key: "progress",
    label: "Progress",
    help: "Counts an activity as modified when its status (not started, in progress, complete) or its percent complete is different. Off by default: progress moves with every update, so it is not a change to the programme itself.",
  },
  {
    key: "constraints",
    label: "Constraints",
    help: "Counts an activity as modified when its primary or secondary constraint, or the date of one, is different. Off by default.",
  },
  { key: "names", label: "Names", help: "Counts an activity as modified when its name is different." },
];

export type CompareFields = Record<ChangeField, boolean>;

export const DEFAULT_FIELDS: CompareFields = {
  dates: true,
  logic: true,
  progress: false,
  constraints: false,
  names: true,
};

export interface ActivityChange {
  kind: ChangeKind;
  /** For a modified activity, which of the compared fields differ. */
  fields: ChangeField[];
  /** The activity as it was in the baseline; null for an added one. */
  before: Activity | null;
}

export interface Matched {
  baseline: Schedule;
  current: Schedule;
  /**
   * The current programme with the removed activities put back into it, so they can be shown, filtered and selected
   * like any other. A removed activity has a made-up id (see `isRemoved`) because its own id may belong to some other
   * activity in the current file.
   */
  schedule: Schedule;
  /** Each activity in `schedule` that is in both files, mapped to its baseline version. */
  counterpart: Map<string, Activity>;
  /** Activities only in the baseline, as they appear in `schedule`, each with the original baseline activity. */
  removed: Array<{ shown: Activity; original: Activity }>;
}

export interface Comparison {
  /** Keyed by activity id in `Matched.schedule`. */
  changes: Map<string, ActivityChange>;
  counts: Record<ChangeKind, number>;
}

const REMOVED_PREFIX = "removed:";
export const isRemovedId = (id: string) => id.startsWith(REMOVED_PREFIX);

/** The WBS groups from the top down to this one, not counting the project's own root node. */
function wbsChain(schedule: Schedule, wbsId: string): WbsNode[] {
  const chain: WbsNode[] = [];
  const seen = new Set<string>();
  for (let n = schedule.wbs.get(wbsId); n && !seen.has(n.id); n = n.parentId ? schedule.wbs.get(n.parentId) : undefined) {
    seen.add(n.id);
    if (!n.isProjectRoot) chain.unshift(n);
  }
  return chain;
}
const chainKey = (chain: WbsNode[]) => chain.map((n) => n.code || n.name).join("\u0001");

const REMOVED_GROUP_ID = "__removed__";

/** Pairs the two programmes' activities up and builds the schedule to display. */
export function matchSchedules(baseline: Schedule, current: Schedule): Matched {
  const baselineByCode = new Map<string, Activity>();
  for (const a of baseline.activities) baselineByCode.set(a.code, a);
  const currentCodes = new Set(current.activities.map((a) => a.code));

  const counterpart = new Map<string, Activity>();
  for (const a of current.activities) {
    const b = baselineByCode.get(a.code);
    if (b) counterpart.set(a.id, b);
  }
  const gone = baseline.activities.filter((b) => !currentCodes.has(b.code));

  // A copy of the WBS tree, so the one the rest of the app uses is left alone.
  const wbs = new Map<string, WbsNode>();
  for (const [id, n] of current.wbs) wbs.set(id, { ...n, children: [], activities: [...n.activities] });
  const roots: WbsNode[] = [];
  for (const n of wbs.values()) {
    const parent = n.parentId ? wbs.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }

  // A removed activity goes back into the group with the same path of WBS codes, or the nearest group above it that
  // still exists; failing that, into one "Removed activities" group.
  const groupByKey = new Map<string, string>();
  for (const n of current.wbs.values()) {
    if (!n.isProjectRoot) groupByKey.set(chainKey(wbsChain(current, n.id)), n.id);
  }
  const projectRoot = [...wbs.values()].find((n) => n.isProjectRoot);
  let fallback: WbsNode | null = null;
  const removed: Matched["removed"] = [];
  for (const original of gone) {
    const chain = wbsChain(baseline, original.wbsId);
    let wbsId: string | undefined;
    for (let len = chain.length; len > 0 && !wbsId; len--) wbsId = groupByKey.get(chainKey(chain.slice(0, len)));
    if (!wbsId) {
      if (!fallback) {
        fallback = {
          id: REMOVED_GROUP_ID,
          parentId: projectRoot?.id ?? null,
          code: "Removed",
          name: "Removed activities",
          seq: Number.MAX_SAFE_INTEGER - 1,
          isProjectRoot: false,
          children: [],
          activities: [],
          start: null,
          finish: null,
          activityCount: 0,
        };
        wbs.set(fallback.id, fallback);
        if (projectRoot) projectRoot.children.push(fallback);
        else roots.push(fallback);
      }
      wbsId = fallback.id;
    }
    const shown: Activity = {
      ...original,
      id: REMOVED_PREFIX + original.id,
      projectId: current.project.id,
      wbsId,
      critical: false,
    };
    wbs.get(wbsId)!.activities.push(shown);
    removed.push({ shown, original });
  }
  rollUpWbs(roots);

  const activities = [...current.activities, ...removed.map((r) => r.shown)];
  const activityById = new Map(current.activityById);
  for (const r of removed) activityById.set(r.shown.id, r.shown);

  // Removed activities, and where the others used to be, can lie outside the current programme's dates; the time
  // axis has to reach them or their bars would be cut off.
  let range = current.range;
  const widen = (a: Activity) => {
    if (a.start === null || a.finish === null) return;
    range = range
      ? { start: Math.min(range.start, a.start), finish: Math.max(range.finish, a.finish) }
      : { start: a.start, finish: a.finish };
  };
  for (const { shown } of removed) widen(shown);
  for (const b of counterpart.values()) widen(b);

  const schedule: Schedule = {
    ...current,
    roots,
    wbs,
    activities,
    activityById,
    range,
    stats: { ...current.stats, activities: activities.length },
  };
  return { baseline, current, schedule, counterpart, removed };
}

const hrsSame = (x: number | null, y: number | null) => x === y || (x !== null && y !== null && Math.abs(x - y) < 0.01);

/** One predecessor of an activity, in the form two files can be compared by. */
interface PredLink {
  code: string;
  type: string;
  lagHrs: number;
}

function predLinks(schedule: Schedule, a: Activity): PredLink[] {
  return (schedule.predecessors.get(a.id) ?? []).map((r) => ({
    code: schedule.activityById.get(r.predTaskId)?.code ?? r.predTaskId,
    type: r.type,
    lagHrs: r.lagHrs,
  }));
}
const linkKey = (l: PredLink) => `${l.code}|${l.type}`;

function sameLogic(bs: Schedule, b: Activity, cs: Schedule, a: Activity): boolean {
  const before = predLinks(bs, b);
  const after = predLinks(cs, a);
  if (before.length !== after.length) return false;
  const lags = new Map(before.map((l) => [linkKey(l), l.lagHrs]));
  return after.every((l) => lags.has(linkKey(l)) && hrsSame(lags.get(linkKey(l))!, l.lagHrs));
}

/** Which of the chosen fields differ between the two versions of an activity. */
function differences(bs: Schedule, b: Activity, cs: Schedule, a: Activity, on: CompareFields): ChangeField[] {
  const out: ChangeField[] = [];
  if (on.dates && (b.start !== a.start || b.finish !== a.finish)) out.push("dates");
  if (on.logic && !sameLogic(bs, b, cs, a)) out.push("logic");
  if (on.progress && (b.status !== a.status || Math.round(b.percent) !== Math.round(a.percent))) out.push("progress");
  if (
    on.constraints &&
    (b.constraintType !== a.constraintType ||
      b.constraintDate !== a.constraintDate ||
      b.constraint2Type !== a.constraint2Type ||
      b.constraint2Date !== a.constraint2Date)
  ) {
    out.push("constraints");
  }
  if (on.names && b.name !== a.name) out.push("names");
  return out;
}

export function classify(matched: Matched, fields: CompareFields): Comparison {
  const { baseline, current, counterpart, removed } = matched;
  const changes = new Map<string, ActivityChange>();
  const counts: Record<ChangeKind, number> = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  for (const a of current.activities) {
    const b = counterpart.get(a.id);
    if (!b) {
      changes.set(a.id, { kind: "added", fields: [], before: null });
      counts.added++;
      continue;
    }
    const diff = differences(baseline, b, current, a, fields);
    const kind: ChangeKind = diff.length > 0 ? "modified" : "unchanged";
    changes.set(a.id, { kind, fields: diff, before: b });
    counts[kind]++;
  }
  for (const { shown, original } of removed) {
    changes.set(shown.id, { kind: "removed", fields: [], before: original });
    counts.removed++;
  }
  return { changes, counts };
}

/** How many calendar days an activity's finish (or, if that is the same, its start) moved; 0 if neither did. */
export function shiftDays(change: ActivityChange, a: Activity): number {
  const b = change.before;
  if (!b || change.kind !== "modified") return 0;
  const days = (from: number | null, to: number | null) => (from === null || to === null ? 0 : Math.round((to - from) / 86_400_000));
  return days(b.finish, a.finish) || days(b.start, a.start);
}

export const fmtShift = (days: number) => `${days > 0 ? "+" : "−"}${Math.abs(days)}d`;

const STATUS_WORDS: Record<ActivityStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  completed: "Completed",
};

function constraintText(type: string, date: number | null): string {
  if (!type) return "none";
  return `${CONSTRAINT_LABEL[type] ?? type}${date !== null ? ` ${fmtDate(date)}` : ""}`;
}

/** Plain-language lines saying what differs, for the details panel and tooltips. */
export function describeChange(matched: Matched, a: Activity, change: ActivityChange): string[] {
  const b = change.before;
  if (change.kind === "added") return ["New in the current programme."];
  if (change.kind === "removed") {
    return [b && b.start !== null && b.finish !== null ? `Not in the current programme. It was ${fmtDate(b.start)} to ${fmtDate(b.finish)}.` : "Not in the current programme."];
  }
  if (!b || change.kind === "unchanged") return [];
  const lines: string[] = [];
  const move = (label: string, from: number | null, to: number | null) => {
    if (from === to) return;
    const d = from !== null && to !== null ? ` (${fmtShift(Math.round((to - from) / 86_400_000))})` : "";
    lines.push(`${label} ${fmtDate(from) || "none"} → ${fmtDate(to) || "none"}${d}`);
  };
  for (const f of change.fields) {
    if (f === "dates") {
      move("Start", b.start, a.start);
      move("Finish", b.finish, a.finish);
      // Not a difference of its own, but it is usually why the dates moved, so it is said alongside them.
      if (!hrsSame(b.origDurHrs, a.origDurHrs)) lines.push(`Duration ${fmtDays(b.origDurHrs, b.dayHrs) || "none"} → ${fmtDays(a.origDurHrs, a.dayHrs) || "none"}`);
    } else if (f === "logic") {
      const before = predLinks(matched.baseline, b);
      const after = predLinks(matched.current, a);
      const was = new Map(before.map((l) => [linkKey(l), l]));
      const now = new Map(after.map((l) => [linkKey(l), l]));
      for (const l of after) {
        const old = was.get(linkKey(l));
        if (!old) lines.push(`Predecessor added: ${l.code} ${l.type}`);
        else if (!hrsSame(old.lagHrs, l.lagHrs)) lines.push(`Lag on ${l.code} ${l.type}: ${fmtDays(old.lagHrs, b.dayHrs)} → ${fmtDays(l.lagHrs, a.dayHrs)}`);
      }
      for (const l of before) if (!now.has(linkKey(l))) lines.push(`Predecessor removed: ${l.code} ${l.type}`);
    } else if (f === "progress") {
      if (b.status !== a.status) lines.push(`Status ${STATUS_WORDS[b.status]} → ${STATUS_WORDS[a.status]}`);
      if (Math.round(b.percent) !== Math.round(a.percent)) lines.push(`Complete ${Math.round(b.percent)}% → ${Math.round(a.percent)}%`);
    } else if (f === "constraints") {
      lines.push(`Constraint ${constraintText(b.constraintType, b.constraintDate)} → ${constraintText(a.constraintType, a.constraintDate)}`);
      if (b.constraint2Type !== a.constraint2Type || b.constraint2Date !== a.constraint2Date) {
        lines.push(`Secondary constraint ${constraintText(b.constraint2Type, b.constraint2Date)} → ${constraintText(a.constraint2Type, a.constraint2Date)}`);
      }
    } else if (f === "names") {
      lines.push(`Renamed from “${b.name}”`);
    }
  }
  return lines;
}

/**
 * Which file is older. The data date says when a programme was last scheduled, so the earlier one is the baseline;
 * if either file has none, the order is kept as given.
 */
export function orderByDataDate<T extends { dataDate: number | null }>(a: T, b: T): [older: T, newer: T] {
  return a.dataDate !== null && b.dataDate !== null && a.dataDate > b.dataDate ? [b, a] : [a, b];
}
