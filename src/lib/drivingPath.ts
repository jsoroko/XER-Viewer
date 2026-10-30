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

export type TraceSpec =
  | { kind: "driving"; mode: TraceMode; originId: string }
  /** `toId` is null while the second activity has yet to be chosen. */
  | { kind: "between"; fromId: string; toId: string | null };

export interface PathLink {
  rel: Relationship;
  /** Working hours of slack on this relationship; zero or less means it drives. */
  floatHrs: number;
}

export interface TraceResult {
  /** Every activity on the path, including the one(s) the trace started from. */
  ids: ReadonlySet<string>;
  links: PathLink[];
  /**
   * False only for a "between" trace where neither activity drives the other: the links are then the route with the
   * least total float, and `floatHrs` says how much.
   */
  driving: boolean;
  floatHrs: number | null;
  /** For a "between" trace, the activity the path starts at and the one it ends at. Null otherwise. */
  from: string | null;
  to: string | null;
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

const empty = (problem: string | null, extra: Partial<TraceResult> = {}): TraceResult => ({
  ids: new Set(),
  links: [],
  driving: true,
  floatHrs: null,
  from: null,
  to: null,
  approximate: false,
  problem,
  ...extra,
});

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
    driving: true,
    floatHrs: null,
    from: null,
    to: null,
    approximate: list.some((l) => floatOf(l.rel)?.approximate),
    problem: null,
  };
}

/** Binary min-heap on a numeric key; just enough for Dijkstra below. */
class MinHeap {
  private items: Array<[number, string]> = [];
  get size() {
    return this.items.length;
  }
  push(key: number, id: string) {
    const a = this.items;
    a.push([key, id]);
    for (let i = a.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (a[parent]![0] <= a[i]![0]) break;
      [a[parent], a[i]] = [a[i]!, a[parent]!];
      i = parent;
    }
  }
  pop(): [number, string] {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

/** The route from one activity to another through the logic with the least total relationship float, or null if none. */
function leastFloatRoute(
  schedule: Schedule,
  floatOf: ReturnType<typeof makeEvaluator>,
  fromId: string,
  toId: string,
): { links: PathLink[]; floatHrs: number } | null {
  const dist = new Map([[fromId, 0]]);
  const via = new Map<string, PathLink>();
  const heap = new MinHeap();
  heap.push(0, fromId);
  while (heap.size > 0) {
    const [d, id] = heap.pop();
    if (d > (dist.get(id) ?? Infinity)) continue;
    if (id === toId) break;
    for (const rel of schedule.successors.get(id) ?? []) {
      const next = schedule.activityById.get(rel.taskId);
      if (!next || !canDrive(next)) continue;
      const f = floatOf(rel);
      if (!f) continue;
      const nd = d + Math.max(0, f.hrs);
      if (nd < (dist.get(next.id) ?? Infinity)) {
        dist.set(next.id, nd);
        via.set(next.id, { rel, floatHrs: f.hrs });
        heap.push(nd, next.id);
      }
    }
  }
  if (!via.has(toId)) return null;
  const links: PathLink[] = [];
  for (let id = toId; id !== fromId; ) {
    const link = via.get(id)!;
    links.unshift(link);
    id = link.rel.predTaskId;
  }
  return { links, floatHrs: dist.get(toId)! };
}

/**
 * The path between two activities, whichever comes first. If one drives the other, it is the driving chain between
 * them (every tied chain, if there are several). If not, it is the route with the least total float, so you can see how
 * close to driving it is. Null links and `problem` say so when the logic doesn't connect them at all.
 */
export function traceBetween(schedule: Schedule, aId: string, bId: string): TraceResult {
  const a = schedule.activityById.get(aId);
  const b = schedule.activityById.get(bId);
  if (!a || !b) return empty("That activity isn't in this file.");
  if (aId === bId) return empty("Pick two different activities.");
  if (!canDrive(a) || !canDrive(b)) {
    return empty("Level-of-effort and WBS summary activities take their dates from other activities, so they have no driving logic.");
  }
  const floatOf = makeEvaluator(schedule);

  // Everything that drives `end`, narrowed to the part that is also driven by `start`.
  const drivingBetween = (startId: string, endId: string): TraceResult | null => {
    const ids = new Set([endId]);
    const links = new Map<string, PathLink>();
    walkDriving(schedule, floatOf, endId, "backward", ids, links);
    if (!ids.has(startId)) return null;
    const out = new Map<string, PathLink[]>();
    for (const l of links.values()) {
      const list = out.get(l.rel.predTaskId);
      if (list) list.push(l);
      else out.set(l.rel.predTaskId, [l]);
    }
    const reach = new Set([startId]);
    const kept: PathLink[] = [];
    const stack = [startId];
    while (stack.length > 0) {
      for (const l of out.get(stack.pop()!) ?? []) {
        kept.push(l);
        if (!reach.has(l.rel.taskId)) {
          reach.add(l.rel.taskId);
          stack.push(l.rel.taskId);
        }
      }
    }
    return {
      ids: reach,
      links: kept,
      driving: true,
      floatHrs: null,
      from: startId,
      to: endId,
      approximate: kept.some((l) => floatOf(l.rel)?.approximate),
      problem: null,
    };
  };

  const driving = drivingBetween(aId, bId) ?? drivingBetween(bId, aId);
  if (driving) return driving;

  const ab = leastFloatRoute(schedule, floatOf, aId, bId);
  const ba = leastFloatRoute(schedule, floatOf, bId, aId);
  const best = ab && ba ? (ab.floatHrs <= ba.floatHrs ? ab : ba) : (ab ?? ba);
  if (!best) return empty(`The logic doesn't connect ${a.code} and ${b.code} in either direction.`, { from: aId, to: bId });
  const forwards = best === ab;
  return {
    ids: new Set([aId, bId, ...best.links.flatMap((l) => [l.rel.predTaskId, l.rel.taskId])]),
    links: best.links,
    driving: false,
    floatHrs: best.floatHrs,
    from: forwards ? aId : bId,
    to: forwards ? bId : aId,
    approximate: best.links.some((l) => floatOf(l.rel)?.approximate),
    problem: null,
  };
}

export function runTrace(schedule: Schedule, spec: TraceSpec): TraceResult | null {
  if (spec.kind === "driving") return traceDriving(schedule, spec.originId, spec.mode);
  return spec.toId === null ? null : traceBetween(schedule, spec.fromId, spec.toId);
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

/** A short name for a trace, e.g. "Backward trace from FD1050" or "FD1020 → SS1010" once both ends are known. */
export function describeTrace(schedule: Schedule, spec: TraceSpec, result: TraceResult | null = null): string {
  const code = (id: string) => schedule.activityById.get(id)?.code ?? id;
  if (spec.kind === "driving") return `${MODE_LABEL[spec.mode]} trace from ${code(spec.originId)}`;
  if (spec.toId === null) return `Trace from ${code(spec.fromId)} to…`;
  if (result?.from && result.to) return `${code(result.from)} → ${code(result.to)}`;
  return `${code(spec.fromId)} and ${code(spec.toId)}`;
}
