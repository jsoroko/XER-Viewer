import type { Relationship, Schedule } from "./xer/model";
import type { TraceStep } from "./drivingPath";
import type { PathStatus } from "./compareTrace";
import { toCsv } from "./csv";
import { fmtDate, fmtDays, fmtNumber } from "./format";

/** "FS", "SS +2d", "FF −1d": the relationship type, then the lag in days when there is one. */
export function relLabel(rel: Relationship, dayHrs: number): string {
  const d = rel.lagHrs / (dayHrs || 8);
  if (d === 0) return rel.type;
  return `${rel.type} ${d > 0 ? "+" : "−"}${fmtNumber(Math.abs(d))}d`;
}

export const PATH_STATUS_LABEL: Record<PathStatus, string> = {
  both: "On both paths",
  joined: "Joined the path",
  dropped: "Dropped off the path",
};

/**
 * The traced path as CSV, one activity per line in the order given, with the link that feeds each. When two programmes
 * are compared the steps carry a status, and the file gets a column for it.
 */
export function traceCsv(schedule: Schedule, steps: Array<TraceStep & { status?: PathStatus | null }>): string {
  const code = (id: string) => schedule.activityById.get(id)?.code ?? id;
  const compared = steps.some((s) => s.status);
  const head = ["Activity ID", "Activity name", "Duration", "Start", "Finish", "Driven by", "Relationship", "Relationship float", ...(compared ? ["Path status"] : [])];
  return toCsv(
    head,
    steps.map(({ activity: a, via, status }) => [
      a.code,
      a.name,
      fmtDays(a.origDurHrs, a.dayHrs),
      fmtDate(a.start),
      fmtDate(a.finish),
      via ? code(via.rel.predTaskId) : "",
      via ? relLabel(via.rel, a.dayHrs) : "",
      via ? fmtDays(via.floatHrs, a.dayHrs) : "",
      ...(compared ? [status ? PATH_STATUS_LABEL[status] : ""] : []),
    ]),
  );
}
