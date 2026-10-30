import type { Relationship, Schedule } from "./xer/model";
import type { TraceStep } from "./drivingPath";
import { toCsv } from "./csv";
import { fmtDate, fmtDays, fmtNumber } from "./format";

/** "FS", "SS +2d", "FF −1d": the relationship type, then the lag in days when there is one. */
export function relLabel(rel: Relationship, dayHrs: number): string {
  const d = rel.lagHrs / (dayHrs || 8);
  if (d === 0) return rel.type;
  return `${rel.type} ${d > 0 ? "+" : "−"}${fmtNumber(Math.abs(d))}d`;
}

/** The traced path as CSV, one activity per line in the order given, with the link that feeds each. */
export function traceCsv(schedule: Schedule, steps: TraceStep[]): string {
  const code = (id: string) => schedule.activityById.get(id)?.code ?? id;
  const head = ["Activity ID", "Activity name", "Duration", "Start", "Finish", "Driven by", "Relationship", "Relationship float"];
  return toCsv(
    head,
    steps.map(({ activity: a, via }) => [
      a.code,
      a.name,
      fmtDays(a.origDurHrs, a.dayHrs),
      fmtDate(a.start),
      fmtDate(a.finish),
      via ? code(via.rel.predTaskId) : "",
      via ? relLabel(via.rel, a.dayHrs) : "",
      via ? fmtDays(via.floatHrs, a.dayHrs) : "",
    ]),
  );
}
