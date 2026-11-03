import { SIDES } from "./links";
import { workingHoursBetween, type WorkPattern } from "./xer/calendar";
import type { Activity, Relationship, Schedule } from "./xer/model";

/**
 * Driving-logic tracing, like P6's "Trace Logic" and Multiple Float Paths but worked out on demand for any activity.
 *
 * A relationship *drives* when it has no relationship float: the successor's date is exactly what the predecessor's
 * date plus the lag asks for, so nothing else is holding it up. Relationship float is measured in working time on the
 * predecessor's calendar (P6's default calendar for lag), from the dates already in the file. Nothing is
 * rescheduled, so constraints, progress and calendars are all respected simply because they are already in the dates.
 */

export type TraceMode = "backward" | "forward" | "combined";

export interface TraceSpec {
  mode: TraceMode;
  originId: string;
}

export interface PathLink {
  rel: Relationship;
  /** Working hours of slack on this relationship; zero or less means it drives. */
  floatHrs: number;
}

export interface TraceResult {
  /** Every activity on the path, including the one(s) the trace started from. */
  ids: ReadonlySet<string>;
  links: PathLink[];
  /** True when a calendar couldn't be read and plain elapsed time was used for some relationship. */
  approximate: boolean;
  /** Why there's nothing to show, when there isn't. */
  problem: string | null;
}

/** Slack at or below this many working hours counts as none. Dates are exported to the minute. */
const TOLERANCE_HRS = 0.01;
const HOUR_MS = 3_600_000;

/** Level-of-effort and WBS summary dates are derived from other activities, so they can't drive anything. */
const canDrive = (a: Activity) => a.type !== "loe" && a.type !== "wbs-summary";

interface FloatInfo {
  hrs: number;
  approximate: boolean;
}

function makeEvaluator(schedule: Schedule) {
  const cache = new Map<string, FloatInfo | null>();
  const patternOf = (a: Activity): WorkPattern | null => schedule.calendars.get(a.calendarId)?.pattern ?? null;

  const floatOf = (rel: Relationship): FloatInfo | null => {
    const hit = cache.get(rel.id);
    if (hit !== undefined) return hit;
    const pred = schedule.activityById.get(rel.predTaskId);
    const succ = schedule.activityById.get(rel.taskId);
    let info: FloatInfo | null = null;
    if (pred && succ) {
      const [predSide, succSide] = SIDES[rel.type];
      const from = pred[predSide];
      const to = succ[succSide];
      if (from !== null && to !== null) {
        const pattern = patternOf(pred) ?? patternOf(succ) ?? schedule.defaultCalendar?.pattern ?? null;
        const gap = pattern ? workingHoursBetween(pattern, from, to) : (to - from) / HOUR_MS;
        info = { hrs: gap - rel.lagHrs, approximate: pattern === null };
      }
    }
    cache.set(rel.id, info);
    return info;
  };
  return floatOf;
}

const empty = (problem: string): TraceResult => ({ ids: new Set(), links: [], approximate: false, problem });

/** Walks every driving relationship away from `originId`, towards predecessors or towards successors. */
function walkDriving(
  schedule: Schedule,
  floatOf: ReturnType<typeof makeEvaluator>,
  originId: string,
  direction: "backward" | "forward",
  ids: Set<string>,
  links: Map<string, PathLink>,
) {
  const visited = new Set([originId]);
  const stack = [originId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const rels = (direction === "backward" ? schedule.predecessors : schedule.successors).get(id) ?? [];
    for (const rel of rels) {
      const otherId = direction === "backward" ? rel.predTaskId : rel.taskId;
      const other = schedule.activityById.get(otherId);
      if (!other || !canDrive(other)) continue;
      const f = floatOf(rel);
      if (!f || f.hrs > TOLERANCE_HRS) continue;
      links.set(rel.id, { rel, floatHrs: f.hrs });
      ids.add(otherId);
      if (!visited.has(otherId)) {
        visited.add(otherId);
        stack.push(otherId);
      }
    }
  }
}

/**
 * The driving logic around one activity: **backward** follows what drives it (its driving predecessors, and theirs, back
 * to where the chain starts), **forward** follows what it drives, **combined** is both. Where two chains tie, both are kept.
 */
export function traceDriving(schedule: Schedule, originId: string, mode: TraceMode): TraceResult {
  const origin = schedule.activityById.get(originId);
  if (!origin) return empty("That activity isn't in this file.");
  if (!canDrive(origin)) {
    return empty("Level-of-effort and WBS summary activities take their dates from other activities, so they have no driving logic.");
  }
  const floatOf = makeEvaluator(schedule);
  const ids = new Set([originId]);
  const links = new Map<string, PathLink>();
  if (mode !== "forward") walkDriving(schedule, floatOf, originId, "backward", ids, links);
  if (mode !== "backward") walkDriving(schedule, floatOf, originId, "forward", ids, links);
  const list = [...links.values()];
  return {
    ids,
    links: list,
    approximate: list.some((l) => floatOf(l.rel)?.approximate),
    problem: null,
  };
}

export function runTrace(schedule: Schedule, spec: TraceSpec): TraceResult {
  return traceDriving(schedule, spec.originId, spec.mode);
}

export interface TraceStep {
  activity: Activity;
  /** One of the path links feeding this activity (any, if several tie), or null for where the chain begins. */
  via: PathLink | null;
}

const byDate = (a: Activity, b: Activity) =>
  (a.start ?? Infinity) - (b.start ?? Infinity) ||
  (a.finish ?? Infinity) - (b.finish ?? Infinity) ||
  a.code.localeCompare(b.code, undefined, { numeric: true });

/** The path's activities in date order, each with the link that feeds it. */
export function traceSteps(schedule: Schedule, result: TraceResult): TraceStep[] {
  const feed = new Map<string, PathLink>();
  for (const l of result.links) {
    feed.set(l.rel.taskId, l);
  }
  const steps: TraceStep[] = [];
  for (const id of result.ids) {
    const activity = schedule.activityById.get(id);
    if (activity) steps.push({ activity, via: feed.get(id) ?? null });
  }
  return steps.sort((x, y) => byDate(x.activity, y.activity));
}

export interface TraceSummary {
  count: number;
  start: number | null;
  finish: number | null;
  /** Calendar days from the path's first start to its last finish. */
  spanDays: number | null;
}

export function summarizeTrace(steps: TraceStep[]): TraceSummary {
  let start: number | null = null;
  let finish: number | null = null;
  for (const { activity: a } of steps) {
    if (a.start !== null && (start === null || a.start < start)) start = a.start;
    if (a.finish !== null && (finish === null || a.finish > finish)) finish = a.finish;
  }
  return {
    count: steps.length,
    start,
    finish,
    spanDays: start !== null && finish !== null ? Math.round((finish - start) / 86_400_000) : null,
  };
}

const MODE_LABEL: Record<TraceMode, string> = { backward: "Backward", forward: "Forward", combined: "Combined" };

/** A short name for a trace, e.g. "Backward trace from FD1050". */
export function describeTrace(schedule: Schedule, spec: TraceSpec): string {
  return `${MODE_LABEL[spec.mode]} trace from ${schedule.activityById.get(spec.originId)?.code ?? spec.originId}`;
}
