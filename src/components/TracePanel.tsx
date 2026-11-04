import { useMemo, useState } from "react";
import { LuDownload, LuX } from "react-icons/lu";
import type { Matched } from "../lib/compare";
import { comparedSteps, type ComparedStep, type ComparedTrace, type PathStatus } from "../lib/compareTrace";
import { downloadText } from "../lib/csv";
import { describeTrace, summarizeTrace, type TraceResult, type TraceSpec } from "../lib/drivingPath";
import { fmtDate, fmtDays, fmtNumber } from "../lib/format";
import { relLabel, traceCsv } from "../lib/traceCsv";
import type { Schedule } from "../lib/xer/model";
import { Switch, buttonClass, iconButtonClass } from "./ui";

interface Props {
  schedule: Schedule;
  /** The two programmes being compared, if they are; then `compared` says how each step relates to the baseline's path. */
  matched: Matched | null;
  compared: ComparedTrace | null;
  showBaselinePath: boolean;
  onShowBaselinePath: (on: boolean) => void;
  spec: TraceSpec;
  result: TraceResult;
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

const DAY = 86_400_000;

const STATUS_PILL: Record<PathStatus, string> = {
  both: "bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300",
  joined: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  dropped: "border border-dashed border-slate-400 text-slate-600 dark:border-slate-500 dark:text-slate-400",
};
const STATUS_WORD: Record<PathStatus, string> = { both: "On both", joined: "Joined the path", dropped: "Dropped off" };

type StatusFilter = "all" | PathStatus;

/**
 * The traced path as a list in date order, with the switch that narrows the schedule to it. The Gantt itself
 * shows the path (cyan outlines, links drawn between the steps, everything else dimmed); this is the readable record.
 *
 * While two programmes are compared, the path is traced in both: the list also holds the steps that dropped off the
 * baseline's path, each step says whether it is on both paths, joined, or dropped, and the header says how far the path's
 * finish moved.
 */
export function TracePanel({
  schedule,
  matched,
  compared,
  showBaselinePath,
  onShowBaselinePath,
  spec,
  result,
  selectedId,
  pathOnly,
  onPathOnly,
  onSelect,
  onClose,
}: Props) {
  const [picked, setFilter] = useState<StatusFilter>("all");
  const compare = matched && compared && !compared.note ? compared : null;
  const all = useMemo<ComparedStep[]>(() => comparedSteps(schedule, result, compare), [schedule, result, compare]);
  // Steps on the baseline's path that dropped off are listed only while that path is being shown.
  const filter = !showBaselinePath && picked === "dropped" ? "all" : picked;
  const steps = useMemo(
    () => all.filter((s) => (compare && s.status === "dropped" ? showBaselinePath : true) && (filter === "all" || s.status === filter)),
    [all, compare, showBaselinePath, filter],
  );
  const current = useMemo(() => all.filter((s) => s.status !== "dropped"), [all]);
  const summary = useMemo(() => summarizeTrace(current), [current]);
  const origin = schedule.activityById.get(spec.originId);
  const found = result.problem === null && all.length > 0;
  const moved =
    compare && compare.span.baseline && compare.span.current
      ? Math.round((compare.span.current.finish - compare.span.baseline.finish) / DAY)
      : null;
  const chips = (["all", "joined", "dropped", "both"] as const).filter((f) => f !== "dropped" || showBaselinePath);
  const wasCount = compare ? compare.counts.both + compare.counts.dropped : 0;

  return (
    <section
      aria-label="Driving logic trace"
      className="flex max-h-72 min-h-0 shrink-0 flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 px-3 py-1.5 dark:border-slate-800">
        <h3 className="text-sm font-semibold">{describeTrace(schedule, spec)}</h3>
        {found && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {summary.count} {summary.count === 1 ? "activity" : "activities"}
            {compare && ` (was ${wasCount})`}
            {summary.start !== null && summary.finish !== null && ` · ${fmtDate(summary.start)} → ${fmtDate(summary.finish)}`}
            {moved !== null && moved !== 0 && (
              <span className="ml-1 font-semibold text-amber-700 dark:text-amber-400">{`${moved > 0 ? "+" : "−"}${Math.abs(moved)}d`}</span>
            )}
            {summary.spanDays !== null && ` · ${fmtNumber(summary.spanDays)} calendar days`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {compare && (
            <Switch
              checked={showBaselinePath}
              onChange={onShowBaselinePath}
              disabled={compare.counts.dropped === 0}
              label="Baseline path"
              title={
                compare.counts.dropped === 0
                  ? "Nothing dropped off the path since the baseline"
                  : "Also show what drove in the baseline and no longer does (dashed grey)"
              }
            />
          )}
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
            onClick={() => downloadText(`driving-path-${origin?.code ?? "trace"}.csv`, traceCsv(schedule, all))}
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

      {compare && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 px-3 py-1.5 text-xs dark:border-slate-800">
          {chips.map((f) => {
            const n = f === "all" ? all.filter((s) => showBaselinePath || s.status !== "dropped").length : compare.counts[f];
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f)}
                className={
                  "h-6 rounded-full border px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
                  (on
                    ? "border-accent-500 bg-accent-50 text-accent-700 dark:border-accent-500 dark:bg-accent-950 dark:text-accent-300"
                    : "border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800")
                }
              >
                {f === "all" ? "All steps" : f === "dropped" ? "Dropped off" : f === "joined" ? "Joined" : "On both"} {n}
              </button>
            );
          })}
        </div>
      )}
      {compared?.note && (
        <p className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
          {compared.note}
        </p>
      )}
      {result.problem && <p className="px-3 py-3 text-sm text-amber-700 dark:text-amber-400">{result.problem}</p>}
      {result.approximate && (
        <p className="border-b border-slate-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-slate-800 dark:bg-amber-950/40 dark:text-amber-300">
          A calendar in this file couldn't be read, so elapsed time was used for some relationships; weekends may appear as float.
        </p>
      )}
      {!result.problem && all.length === 1 && !compare?.counts.dropped && (
        <p className="px-3 py-3 text-sm text-slate-600 dark:text-slate-300">
          Nothing drives or is driven by {all[0]!.activity.code} in this direction: every relationship on it has float.
        </p>
      )}

      {found && all.length > 1 && (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className={th}>Activity</th>
                {compare && <th className={th}>On path</th>}
                <th className={`${th} text-right`}>Dur</th>
                <th className={th}>Start</th>
                <th className={th}>Finish</th>
                <th className={th}>Driven by</th>
                <th className={`${th} text-right`}>Float</th>
              </tr>
            </thead>
            <tbody>
              {steps.slice(0, MAX_LISTED).map(({ activity: a, via, status }) => (
                <tr
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 ${
                    a.id === selectedId ? "bg-accent-50 dark:bg-accent-950" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  } ${status === "dropped" ? "text-slate-500 dark:text-slate-400" : ""}`}
                >
                  <td className={`${td} max-w-0 w-[40%] truncate`} title={`${a.code} ${a.name}`}>
                    <span className="mr-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{a.code}</span>
                    {a.name}
                  </td>
                  {compare && (
                    <td className={`${td} whitespace-nowrap`}>
                      {status && <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_PILL[status]}`}>{STATUS_WORD[status]}</span>}
                    </td>
                  )}
                  <td className={`${td} text-right tabular-nums`}>{fmtDays(a.origDurHrs, a.dayHrs)}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDate(a.start)}</td>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDate(a.finish)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {via ? (
                      <>
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{code(schedule, via.rel.predTaskId)}</span>{" "}
                        {relLabel(via.rel, a.dayHrs)}
                        {status === "dropped" && <span className="ml-1 text-[11px] text-slate-400">in the baseline</span>}
                      </>
                    ) : (
                      <span className="text-slate-400">{status === "dropped" ? "" : "start of chain"}</span>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{via && status !== "dropped" ? fmtDays(via.floatHrs, a.dayHrs) : ""}</td>
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

