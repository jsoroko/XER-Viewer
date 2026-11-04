import { isRemovedId, type Matched } from "./compare";
import { traceDriving, traceSteps, byStartDate, type TraceResult, type TraceSpec, type TraceStep } from "./drivingPath";
import type { Relationship, Schedule } from "./xer/model";

/**
 * A driving-logic trace run on both programmes being compared (see drivingPath.ts and compare.ts): the same activity,
 * found by its Activity ID, is traced in the baseline and in the current programme, and each activity on either path is
 * marked:
 *
 * - **both**: on the path in the baseline and still on it
 * - **joined**: on the path now, but not in the baseline
 * - **dropped**: on the baseline's path, but no longer driving: its logic or dates changed so it has float now, or it was
 *   removed
 */
export type PathStatus = "both" | "joined" | "dropped";

export interface ComparedTrace {
  /** What each activity on either path is, keyed by its id in the schedule being shown. Empty when there is nothing to compare. */
  status: ReadonlyMap<string, PathStatus>;
  /** Activities that dropped off the path, as ids in the schedule being shown. */
  droppedIds: ReadonlySet<string>;
  /** Links on the baseline path that are not on the current one, as relationships between ids in the schedule being shown. */
  droppedLinks: Relationship[];
  counts: Record<PathStatus, number>;
  /** The dates each path spans, or null when that path has no dated activity. */
  span: { baseline: { start: number; finish: number } | null; current: { start: number; finish: number } | null };
  /** Why there is no comparison to show, when there isn't. */
  note: string | null;
}

const NOTHING: Omit<ComparedTrace, "note"> = {
  status: new Map(),
  droppedIds: new Set(),
  droppedLinks: [],
  counts: { both: 0, joined: 0, dropped: 0 },
  span: { baseline: null, current: null },
};

/** Baseline activity id → the id the same activity has in the schedule being shown. */
const idMaps = new WeakMap<Matched, Map<string, string>>();
function toShown(matched: Matched): Map<string, string> {
  let map = idMaps.get(matched);
  if (!map) {
    map = new Map();
    for (const [shownId, b] of matched.counterpart) map.set(b.id, shownId);
    for (const r of matched.removed) map.set(r.original.id, r.shown.id);
    idMaps.set(matched, map);
  }
  return map;
}

const extent = (activities: Array<{ start: number | null; finish: number | null } | undefined>) => {
  let start = Infinity;
  let finish = -Infinity;
  for (const a of activities) {
    if (!a) continue;
    if (a.start !== null && a.start < start) start = a.start;
    if (a.finish !== null && a.finish > finish) finish = a.finish;
  }
  return start <= finish ? { start, finish } : null;
};

/**
 * `current` is the trace already run on the schedule being shown (it is the same trace the schedule draws), so it is
 * not worked out twice.
 */
export function compareTrace(matched: Matched, spec: TraceSpec, current: TraceResult): ComparedTrace {
  const original = isRemovedId(spec.originId)
    ? matched.removed.find((r) => r.shown.id === spec.originId)?.original
    : matched.counterpart.get(spec.originId);
  if (!original) {
    return { ...NOTHING, note: "This activity is new, so there was no path in the baseline to compare with." };
  }
  const baseline = traceDriving(matched.baseline, original.id, spec.mode);
  if (baseline.problem) return { ...NOTHING, note: baseline.problem };

  const shown = toShown(matched);
  const baselineIds = new Set<string>();
  for (const id of baseline.ids) {
    const s = shown.get(id);
    if (s) baselineIds.add(s);
  }

  // A removed activity has no links in the programme being shown, so there is no current path at all.
  const now = isRemovedId(spec.originId) ? { ids: new Set<string>(), links: [] as TraceResult["links"] } : current;
  const status = new Map<string, PathStatus>();
  const counts: Record<PathStatus, number> = { both: 0, joined: 0, dropped: 0 };
  const set = (id: string, s: PathStatus) => {
    status.set(id, s);
    counts[s]++;
  };
  for (const id of now.ids) set(id, baselineIds.has(id) ? "both" : "joined");
  const droppedIds = new Set<string>();
  for (const id of baselineIds) {
    if (!now.ids.has(id)) {
      droppedIds.add(id);
      set(id, "dropped");
    }
  }

  const key = (pred: string, succ: string) => `${pred}>${succ}`;
  const nowLinked = new Set(now.links.map((l) => key(l.rel.predTaskId, l.rel.taskId)));
  const droppedLinks: Relationship[] = [];
  for (const { rel } of baseline.links) {
    const pred = shown.get(rel.predTaskId);
    const succ = shown.get(rel.taskId);
    if (pred && succ && !nowLinked.has(key(pred, succ))) {
      droppedLinks.push({ id: `dropped:${rel.id}`, taskId: succ, predTaskId: pred, type: rel.type, lagHrs: rel.lagHrs });
    }
  }

  return {
    status,
    droppedIds,
    droppedLinks,
    counts,
    span: {
      baseline: extent([...baseline.ids].map((id) => matched.baseline.activityById.get(id))),
      current: extent([...now.ids].map((id) => matched.schedule.activityById.get(id))),
    },
    note: null,
  };
}

export interface ComparedStep extends TraceStep {
  status: PathStatus | null;
}

/**
 * The current path's steps plus the activities that dropped off it, in date order. A dropped step is fed by the link it
 * had in the baseline, if there was one.
 */
export function comparedSteps(schedule: Schedule, current: TraceResult, compared: ComparedTrace | null): ComparedStep[] {
  const steps: ComparedStep[] = traceSteps(schedule, current).map((s) => ({ ...s, status: compared?.status.get(s.activity.id) ?? null }));
  if (compared) {
    const listed = new Set(steps.map((s) => s.activity.id));
    for (const id of compared.droppedIds) {
      if (listed.has(id)) continue;
      const activity = schedule.activityById.get(id);
      const rel = compared.droppedLinks.find((l) => l.taskId === id);
      if (activity) steps.push({ activity, via: rel ? { rel, floatHrs: 0 } : null, status: "dropped" });
    }
    steps.sort((x, y) => byStartDate(x.activity, y.activity));
  }
  return steps;
}
