import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { fmtDateTime, fmtDays, fmtMoney, fmtNumber } from "../lib/format";
import { holidayCount, summarizeWeek, workingDaysBetween } from "../lib/xer/calendar";
import { isMilestone, wbsPath, type Activity, type Relationship, type Schedule } from "../lib/xer/model";
import {
  CONSTRAINT_LABEL,
  DURATION_TYPE_LABEL,
  PCT_TYPE_LABEL,
  RESOURCE_TYPE_LABEL,
  TASK_TYPE_LABEL,
} from "../lib/xer/values";
import { StatusBadge } from "./ui";
import { usePersistedNumber } from "../state/usePersistedNumber";

interface Props {
  schedule: Schedule;
  activity: Activity;
  onSelect: (id: string) => void;
  onClose: () => void;
}

type DetailTab = "general" | "relationships" | "resources" | "codes";

/** h-72, the panel's original fixed height, kept as the default so existing visitors see no change. */
const DEFAULT_DETAIL_H = 288;
const MIN_DETAIL_H = 160;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="truncate text-sm tabular-nums">{children || "—"}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</dl>
    </section>
  );
}

const th = "px-3 py-1.5 text-left text-[11px] font-medium text-slate-500 dark:text-slate-400";
const td = "px-3 py-1.5 text-sm";

function fmtLag(rel: Relationship, dayHrs: number) {
  const d = rel.lagHrs / (dayHrs || 8);
  return d === 0 ? "0d" : `${d > 0 ? "+" : ""}${fmtNumber(d)}d`;
}

function General({ schedule, a }: { schedule: Schedule; a: Activity }) {
  const cal = schedule.calendars.get(a.calendarId);
  const rsrc = schedule.resources.get(a.primaryResourceId);
  const constraint = (type: string, date: number | null) =>
    type ? `${CONSTRAINT_LABEL[type] ?? type}${date !== null ? ` · ${fmtDateTime(date)}` : ""}` : "";
  const dur = (h: number | null) => fmtDays(h, a.dayHrs);
  // Milestones have no span to count; without readable calendar data there's nothing to count against.
  const workingDays =
    cal?.pattern && a.start !== null && a.finish !== null && !isMilestone(a)
      ? String(workingDaysBetween(cal.pattern, a.start, a.finish))
      : "";

  return (
    <div className="grid gap-6 p-4 md:grid-cols-2 xl:grid-cols-4">
      <Group title="Activity">
        <Field label="Activity ID">
          <span className="font-mono">{a.code}</span>
        </Field>
        <Field label="Status">
          <StatusBadge status={a.status} />
        </Field>
        <div className="col-span-2 min-w-0">
          <dt className="text-[11px] text-slate-500 dark:text-slate-400">WBS</dt>
          <dd className="text-sm">{wbsPath(schedule, a.wbsId).join(" › ")}</dd>
        </div>
        <Field label="Type">{TASK_TYPE_LABEL[a.typeRaw] ?? a.typeRaw}</Field>
        <Field label="Calendar">{cal?.name}</Field>
        <Field label="Primary resource">{rsrc?.name}</Field>
        <Field label="Critical">{a.critical ? "Yes" : "No"}</Field>
      </Group>

      <Group title="Duration">
        <Field label="Original">{dur(a.origDurHrs)}</Field>
        <Field label="Remaining">{dur(a.remDurHrs)}</Field>
        <Field label="Total float">{dur(a.totalFloatHrs)}</Field>
        <Field label="Free float">{dur(a.freeFloatHrs)}</Field>
        <Field label="Duration type">{DURATION_TYPE_LABEL[a.durationType] ?? a.durationType}</Field>
        <Field label="% complete type">{PCT_TYPE_LABEL[a.pctType] ?? a.pctType}</Field>
        <Field label="% complete">{`${a.percent.toFixed(0)}%`}</Field>
        <div title="Working days between this activity's start and finish on its calendar, holidays excluded">
          <Field label="Working days (start–finish)">{workingDays}</Field>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-[11px] text-slate-500 dark:text-slate-400">
            Work week{cal ? ` · ${cal.name}` : ""}
          </dt>
          <dd className="text-sm">
            {cal?.pattern ? summarizeWeek(cal.pattern) : "—"}
            {cal?.pattern && holidayCount(cal.pattern) > 0 && (
              <span className="text-slate-500 dark:text-slate-400"> · {holidayCount(cal.pattern)} holidays</span>
            )}
          </dd>
        </div>
      </Group>

      <Group title="Dates">
        <Field label="Actual start">{fmtDateTime(a.actualStart)}</Field>
        <Field label="Actual finish">{fmtDateTime(a.actualFinish)}</Field>
        <Field label="Early start">{fmtDateTime(a.earlyStart)}</Field>
        <Field label="Early finish">{fmtDateTime(a.earlyFinish)}</Field>
        <Field label="Late start">{fmtDateTime(a.lateStart)}</Field>
        <Field label="Late finish">{fmtDateTime(a.lateFinish)}</Field>
        <Field label="Baseline start">{fmtDateTime(a.targetStart)}</Field>
        <Field label="Baseline finish">{fmtDateTime(a.targetFinish)}</Field>
      </Group>

      <Group title="Constraints">
        <div className="col-span-2 min-w-0">
          <dt className="text-[11px] text-slate-500 dark:text-slate-400">Primary</dt>
          <dd className="text-sm">{constraint(a.constraintType, a.constraintDate) || "—"}</dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-[11px] text-slate-500 dark:text-slate-400">Secondary</dt>
          <dd className="text-sm">{constraint(a.constraint2Type, a.constraint2Date) || "—"}</dd>
        </div>
      </Group>
    </div>
  );
}

function RelationshipTable({
  title,
  schedule,
  rels,
  pick,
  dayHrs,
  onSelect,
}: {
  title: string;
  schedule: Schedule;
  rels: Relationship[];
  pick: (r: Relationship) => string;
  dayHrs: number;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="min-w-0">
      <h3 className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title} ({rels.length})
      </h3>
      {rels.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-slate-500 dark:text-slate-400">None</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>ID</th>
              <th className={th}>Activity name</th>
              <th className={th}>Type</th>
              <th className={`${th} text-right`}>Lag</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rels.map((r) => {
              const other = schedule.activityById.get(pick(r));
              return (
                <tr
                  key={r.id}
                  onClick={() => other && other.projectId === schedule.project.id && onSelect(other.id)}
                  className={`border-t border-slate-100 dark:border-slate-800 ${
                    other && other.projectId === schedule.project.id ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60" : ""
                  }`}
                >
                  <td className={`${td} font-mono text-xs`}>{other?.code ?? `#${pick(r)}`}</td>
                  <td className={`${td} max-w-64 truncate`}>{other?.name ?? "(activity in another project)"}</td>
                  <td className={td}>{r.type}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmtLag(r, dayHrs)}</td>
                  <td className={td}>{other && <StatusBadge status={other.status} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function ActivityDetails({ schedule, activity: a, onSelect, onClose }: Props) {
  const [tab, setTab] = useState<DetailTab>("general");
  // Remembered across visits and across activities, like the table's own width.
  const [height, setHeight] = usePersistedNumber("xerview-detail-height", DEFAULT_DETAIL_H);
  const drag = useRef<{ y: number; h: number } | null>(null);

  const onResizeDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: height };
  };
  const onResizeMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const max = Math.max(MIN_DETAIL_H, window.innerHeight * 0.7);
    // Dragging the top edge up should grow the panel, so the delta is start Y minus current Y, not the other way round.
    setHeight(Math.min(max, Math.max(MIN_DETAIL_H, drag.current.h + (drag.current.y - e.clientY))));
  };
  const onResizeUp = () => {
    drag.current = null;
  };
  const preds = schedule.predecessors.get(a.id) ?? [];
  const succs = schedule.successors.get(a.id) ?? [];
  const assigns = schedule.assignments.get(a.id) ?? [];
  const codes = schedule.codes.get(a.id) ?? [];

  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: "general", label: "General" },
    { id: "relationships", label: `Relationships (${preds.length} / ${succs.length})` },
    { id: "resources", label: `Resources (${assigns.length})` },
    { id: "codes", label: `Codes (${codes.length})` },
  ];

  const sum = (pick: (x: (typeof assigns)[number]) => number | null) =>
    assigns.reduce((n, x) => n + (pick(x) ?? 0), 0);

  return (
    <div className="relative flex shrink-0 flex-col border-t border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900" style={{ height }}>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize activity details"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        className="absolute inset-x-0 top-0 h-1.5 -translate-y-1/2 cursor-row-resize touch-none hover:bg-accent-500/40"
      />
      <div className="flex items-center gap-1 border-b border-slate-200 px-3 dark:border-slate-800">
        <div className="mr-3 flex min-w-0 items-baseline gap-2 py-2">
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{a.code}</span>
          <span className="truncate text-sm font-medium">{a.name}</span>
        </div>
        <div role="tablist" className="ml-auto flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40 ${
                tab === t.id
                  ? "border-b-2 border-accent-600 text-accent-600 dark:border-accent-400 dark:text-accent-400"
                  : "border-b-2 border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="ml-2 rounded px-2 py-1 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:hover:bg-slate-800"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "general" && <General schedule={schedule} a={a} />}

        {tab === "relationships" && (
          <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-slate-200 dark:lg:divide-slate-800">
            <RelationshipTable title="Predecessors" schedule={schedule} rels={preds} pick={(r) => r.predTaskId} dayHrs={a.dayHrs} onSelect={onSelect} />
            <RelationshipTable title="Successors" schedule={schedule} rels={succs} pick={(r) => r.taskId} dayHrs={a.dayHrs} onSelect={onSelect} />
          </div>
        )}

        {tab === "resources" &&
          (assigns.length === 0 ? (
            <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No resources assigned.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Resource</th>
                  <th className={th}>Type</th>
                  <th className={`${th} text-right`}>Budgeted units</th>
                  <th className={`${th} text-right`}>Actual units</th>
                  <th className={`${th} text-right`}>Remaining units</th>
                  <th className={`${th} text-right`}>Budgeted cost</th>
                  <th className={`${th} text-right`}>Actual cost</th>
                  <th className={`${th} text-right`}>Remaining cost</th>
                </tr>
              </thead>
              <tbody>
                {assigns.map((x) => (
                  <tr key={x.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className={td}>{x.resourceName}</td>
                    <td className={td}>{RESOURCE_TYPE_LABEL[x.resourceType] ?? x.resourceType}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtNumber(x.budgetedQty)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtNumber(x.actualQty)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtNumber(x.remainingQty)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtMoney(x.budgetedCost)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtMoney(x.actualCost)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtMoney(x.remainingCost)}</td>
                  </tr>
                ))}
              </tbody>
              {assigns.length > 1 && (
                <tfoot>
                  <tr className="border-t border-slate-300 font-medium dark:border-slate-700">
                    <td className={td} colSpan={2}>
                      Total
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{fmtNumber(sum((x) => x.budgetedQty))}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtNumber(sum((x) => x.actualQty))}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtNumber(sum((x) => x.remainingQty))}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtMoney(sum((x) => x.budgetedCost))}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtMoney(sum((x) => x.actualCost))}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtMoney(sum((x) => x.remainingCost))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          ))}

        {tab === "codes" &&
          (codes.length === 0 ? (
            <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No activity codes assigned.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Code type</th>
                  <th className={th}>Code</th>
                  <th className={th}>Description</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className={td}>{c.typeName}</td>
                    <td className={`${td} font-mono text-xs`}>{c.code}</td>
                    <td className={td}>{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
    </div>
  );
}
