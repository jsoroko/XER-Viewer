import { useMemo } from "react";
import { fmtDate, fmtDateLong, fmtDays, fmtInt } from "../lib/format";
import { holidayCount, summarizeWeek } from "../lib/xer/calendar";
import type { Schedule, ActivityStatus } from "../lib/xer/model";
import type { XerFile } from "../lib/xer/parse";
import { CALENDAR_TYPE_LABEL } from "../lib/xer/values";
import { Card, Empty, STATUS_DOT, STATUS_LABEL } from "./ui";

interface Props {
  xer: XerFile;
  schedule: Schedule;
  parseMs: number;
  onOpenActivity: (id: string) => void;
  onOpenTable: (name: string) => void;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="truncate text-right tabular-nums" title={value}>
        {value || "—"}
      </dd>
    </div>
  );
}

export function Overview({ xer, schedule, parseMs, onOpenActivity, onOpenTable }: Props) {
  const { project, stats } = schedule;
  const { header } = xer;

  const upcomingCritical = useMemo(
    () =>
      schedule.activities
        .filter((a) => a.critical)
        .sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity))
        .slice(0, 8),
    [schedule],
  );

  // Global P6 databases carry dozens of calendars; only show the ones this project touches.
  const usedCalendars = useMemo(
    () =>
      [...schedule.calendars.values()]
        .filter((c) => (schedule.calendarUsage.get(c.id) ?? 0) > 0 || c.id === schedule.defaultCalendar?.id)
        .sort((a, b) => (schedule.calendarUsage.get(b.id) ?? 0) - (schedule.calendarUsage.get(a.id) ?? 0)),
    [schedule],
  );

  const tables = useMemo(
    () => [...xer.tables.values()].sort((a, b) => b.rows.length - a.rows.length),
    [xer],
  );

  const statuses: ActivityStatus[] = ["completed", "in-progress", "not-started"];
  const total = Math.max(1, stats.activities);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-5 p-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {project.shortName && <span className="font-mono">{project.shortName}</span>}
            {project.shortName && " · "}
            {fmtDateLong(project.plannedStart)} → {fmtDateLong(project.scheduledFinish)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Metric label="Activities" value={fmtInt(stats.activities)} hint={`${fmtInt(stats.milestones)} milestones`} />
          <Metric label="Complete" value={`${stats.overallPercent.toFixed(0)}%`} hint="duration-weighted" />
          <Metric label="Critical" value={fmtInt(stats.critical)} hint={project.criticalByDrivingPath ? "driving path" : `float ≤ ${project.criticalFloatHrs}h`} />
          <Metric label="Relationships" value={fmtInt(stats.relationships)} />
          <Metric label="Resources" value={fmtInt(stats.resources)} hint={`${fmtInt(stats.assignments)} assignments`} />
          <Metric label="WBS nodes" value={fmtInt(stats.wbsNodes)} />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Progress" className="lg:col-span-2">
            <div className="space-y-4 p-4">
              <div
                className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                role="img"
                aria-label={statuses.map((s) => `${STATUS_LABEL[s]} ${stats.byStatus[s]}`).join(", ")}
              >
                {statuses.map((s) => (
                  <div key={s} className={STATUS_DOT[s]} style={{ width: `${(stats.byStatus[s] / total) * 100}%` }} />
                ))}
              </div>
              <ul className="grid gap-2 sm:grid-cols-3">
                {statuses.map((s) => (
                  <li key={s} className="flex items-center gap-2 text-sm">
                    <span className={`size-2.5 rounded-full ${STATUS_DOT[s]}`} />
                    <span className="text-slate-600 dark:text-slate-300">{STATUS_LABEL[s]}</span>
                    <span className="font-medium tabular-nums">{fmtInt(stats.byStatus[s])}</span>
                  </li>
                ))}
              </ul>
            </div>
            <dl className="grid divide-y divide-slate-200 border-t border-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-slate-800 dark:border-slate-800">
              <div className="px-4 py-3">
                <dt className="text-xs text-slate-500 dark:text-slate-400">Planned start</dt>
                <dd className="text-sm font-medium">{fmtDateLong(project.plannedStart)}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs text-slate-500 dark:text-slate-400">Data date</dt>
                <dd className="text-sm font-medium">{fmtDateLong(project.dataDate)}</dd>
              </div>
              <div className="px-4 py-3">
                <dt className="text-xs text-slate-500 dark:text-slate-400">Scheduled finish</dt>
                <dd className="text-sm font-medium">{fmtDateLong(project.scheduledFinish)}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Schedule health">
            <dl className="divide-y divide-slate-200 dark:divide-slate-800">
              <Row label="Missing predecessors" value={fmtInt(stats.missingPredecessors)} />
              <Row label="Missing successors" value={fmtInt(stats.missingSuccessors)} />
              <Row label="Finish-to-start" value={fmtInt(stats.byRelationshipType.FS)} />
              <Row label="Start-to-start" value={fmtInt(stats.byRelationshipType.SS)} />
              <Row label="Finish-to-finish" value={fmtInt(stats.byRelationshipType.FF)} />
              <Row label="Start-to-finish" value={fmtInt(stats.byRelationshipType.SF)} />
              <Row label="Level of effort" value={fmtInt(stats.levelOfEffort)} />
            </dl>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="Next critical activities" className="lg:col-span-2">
            {upcomingCritical.length === 0 ? (
              <Empty>No open critical activities.</Empty>
            ) : (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {upcomingCritical.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onOpenActivity(a.id)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60"
                    >
                      <span className="w-20 shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">{a.code}</span>
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <span className="hidden shrink-0 text-xs tabular-nums text-slate-500 sm:inline dark:text-slate-400">
                        {fmtDate(a.start)} → {fmtDate(a.finish)}
                      </span>
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                        {fmtDays(a.origDurHrs, a.dayHrs)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="File">
            <dl className="divide-y divide-slate-200 dark:divide-slate-800">
              <Row label="P6 version" value={header.version} />
              <Row label="Exported" value={header.exportDate} />
              <Row label="Exported by" value={header.user} />
              <Row label="Database" value={header.database} />
              <Row label="Currency" value={header.currency} />
              <Row label="Tables" value={fmtInt(xer.tables.size)} />
              <Row label="Parsed in" value={`${parseMs.toFixed(0)} ms`} />
            </dl>
            {xer.warnings.length > 0 && (
              <details className="border-t border-slate-200 px-4 py-2 text-xs text-amber-700 dark:border-slate-800 dark:text-amber-400">
                <summary className="cursor-pointer">{xer.warnings.length} parse warning(s)</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {xer.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </div>

        <Card title="Calendars in use">
          {usedCalendars.length === 0 ? (
            <Empty>No calendars are assigned to this project's activities.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2">Calendar</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2">Work week</th>
                    <th className="px-2 py-2 text-right">Hrs/day</th>
                    <th className="px-2 py-2 text-right">Holidays</th>
                    <th className="px-4 py-2 text-right">Activities</th>
                  </tr>
                </thead>
                <tbody>
                  {usedCalendars.map((c) => (
                    <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2">
                        {c.name}
                        {c.id === schedule.defaultCalendar?.id && (
                          <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            default
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-slate-600 dark:text-slate-400">{CALENDAR_TYPE_LABEL[c.type] ?? c.type}</td>
                      <td className="px-2 py-2 text-xs">{c.pattern ? summarizeWeek(c.pattern) : <span className="text-slate-400">unreadable</span>}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.dayHrs}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.pattern ? holidayCount(c.pattern) : "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtInt(schedule.calendarUsage.get(c.id) ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Tables in this file">
          <ul className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4 dark:bg-slate-800">
            {tables.map((t) => (
              <li key={t.name} className="bg-white dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => onOpenTable(t.name)}
                  className="flex w-full items-baseline justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60"
                >
                  <span className="truncate font-mono text-xs">{t.name}</span>
                  <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{fmtInt(t.rows.length)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
