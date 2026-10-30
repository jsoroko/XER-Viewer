import { useMemo } from "react";
import { LuDownload, LuX } from "react-icons/lu";
import { downloadText } from "../lib/csv";
import { describeTrace, summarizeTrace, traceSteps, type TraceResult, type TraceSpec, type TraceStep } from "../lib/drivingPath";
import { fmtDate, fmtDays, fmtNumber } from "../lib/format";
import { relLabel, traceCsv } from "../lib/traceCsv";
import type { Schedule } from "../lib/xer/model";
import { Switch, buttonClass, iconButtonClass } from "./ui";

interface Props {
  schedule: Schedule;
  spec: TraceSpec;
  /** Null while a "between" trace waits for its second activity. */
  result: TraceResult | null;
  selectedId: string | null;
  pathOnly: boolean;
  onPathOnly: (on: boolean) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Rows drawn before the list is cut off (the CSV always has every step). */
const MAX_LISTED = 1000;

const code = (schedule: Schedule, id: string | null) => (id ? (schedule.activityById.get(id)?.code ?? id) : "");

const th = "px-2 py-1 text-left text-[11px] font-medium text-slate-500 dark:text-slate-400";
const td = "px-2 py-1 text-xs";

/**
 * The traced path as a list in date order, with the switch that narrows the schedule to it. The Gantt itself
 * shows the path (cyan outlines, links drawn between the steps, everything else dimmed); this is the readable record.
 */
export function TracePanel({ schedule, spec, result, selectedId, pathOnly, onPathOnly, onSelect, onClose }: Props) {
  const steps = useMemo(() => (result ? traceSteps(schedule, result) : []), [schedule, result]);
  const summary = useMemo(() => summarizeTrace(steps), [steps]);
  const waiting = spec.kind === "between" && spec.toId === null;
  const origin = schedule.activityById.get(spec.kind === "driving" ? spec.originId : spec.fromId);
  const dayHrs = origin?.dayHrs ?? 8;
  const found = result !== null && result.problem === null && steps.length > 0;

  return (
    <section
      aria-label="Driving logic trace"
      className="flex max-h-72 min-h-0 shrink-0 flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 px-3 py-1.5 dark:border-slate-800">
        <h3 className="text-sm font-semibold">{describeTrace(schedule, spec, result)}</h3>
        {found && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {summary.count} {summary.count === 1 ? "activity" : "activities"}
            {summary.start !== null && summary.finish !== null && ` · ${fmtDate(summary.start)} → ${fmtDate(summary.finish)}`}
            {summary.spanDays !== null && ` · ${fmtNumber(summary.spanDays)} calendar days`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <Switch
            checked={pathOnly}
            onChange={onPathOnly}
            disabled={!found}
            label="Path only"
            title="Show only the activities on this path (with their WBS groups) instead of dimming the rest"
          />
          <button
            type="button"
            className={buttonClass}
            disabled={!found}
            onClick={() => downloadText(`driving-path-${origin?.code ?? "trace"}.csv`, traceCsv(schedule, steps))}
            title="Download the steps as a CSV file"
          >
            <LuDownload size={14} aria-hidden />
            CSV
          </button>
          <button type="button" className={iconButtonClass} onClick={onClose} aria-label="Close trace" title="Close the trace">
            <LuX size={18} aria-hidden />
          </button>
        </div>
      </div>

      {waiting && (
        <p className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300">
          Now select the second activity in the schedule. The path between {code(schedule, spec.fromId)} and it is worked out as soon as you do.
        </p>
      )}
      {result?.problem && <p className="px-3 py-3 text-sm text-amber-700 dark:text-amber-400">{result.problem}</p>}
      {result && !result.problem && !result.driving && (
        <p className="border-b border-slate-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-slate-800 dark:bg-amber-950/40 dark:text-amber-300">
          Neither activity drives the other. This is the closest route through the logic, with {fmtDays(result.floatHrs, dayHrs) || "0d"} of float along
          it.
        </p>
      )}
      {result && result.approximate && (
        <p className="border-b border-slate-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-slate-800 dark:bg-amber-950/40 dark:text-amber-300">
          A calendar in this file couldn't be read, so elapsed time was used for some relationships; weekends may appear as float.
        </p>
      )}
      {result && !result.problem && steps.length === 1 && (
        <p className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300">
          Nothing drives or is driven by {steps[0]!.activity.code} in this direction: every relationship on it has float.
        </p>
      )}

      {found && steps.length > 1 && (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className={th}>Activity</th>
                <th className={`${th} text-right`}>Dur</th>
                <th className={th}>Start</th>
                <th className={th}>Finish</th>
                <th className={th}>Driven by</th>
                <th className={`${th} text-right`}>Float</th>
              </tr>
            </thead>
            <tbody>
              {steps.slice(0, MAX_LISTED).map(({ activity: a, via }) => (
                <tr
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 ${
                    a.id === selectedId ? "bg-accent-50 dark:bg-accent-950" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <td className={`${td} max-w-0 w-[40%] truncate`} title={`${a.code} ${a.name}`}>
                    <span className="mr-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{a.code}</span>
                    {a.name}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{fmtDays(a.origDurHrs, a.dayHrs)}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDate(a.start)}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDate(a.finish)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {via ? (
                      <>
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{code(schedule, via.rel.predTaskId)}</span>{" "}
                        {relLabel(via.rel, a.dayHrs)}
                      </>
                    ) : (
                      <span className="text-slate-400">start of chain</span>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{via ? fmtDays(via.floatHrs, a.dayHrs) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {steps.length > MAX_LISTED && (
            <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              Showing the first {MAX_LISTED} of {steps.length} activities. The CSV has them all.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
