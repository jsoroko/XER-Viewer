import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fmtDate, fmtDays, fmtInt } from "../lib/format";
import { buildLinks } from "../lib/links";
import {
  buildRows,
  collapsibleIds,
  makePredicate,
  toDateRange,
  type ActivityFilter,
  type DateMode,
  type Row,
} from "../lib/scheduleRows";
import {
  buildTicks,
  clampPx,
  makeTimeline,
  paddedRange,
  type Timeline,
} from "../lib/timeline";
import { useVirtualRows } from "../lib/useVirtualRows";
import { nonWorkingRuns } from "../lib/xer/calendar";
import { isMilestone, type Activity, type Schedule as ScheduleModel, type WbsNode } from "../lib/xer/model";
import { ActivityDetails } from "./ActivityDetails";
import { STATUS_DOT, buttonClass, inputClass, toggleClass } from "./ui";

const ROW_H = 26;
const HEADER_H = 44;

const COLUMNS = [
  { key: "orig", label: "Orig", w: 52 },
  { key: "rem", label: "Rem", w: 52 },
  { key: "start", label: "Start", w: 82 },
  { key: "finish", label: "Finish", w: 82 },
  { key: "tf", label: "TF", w: 50 },
] as const;
const FIXED_W = COLUMNS.reduce((n, c) => n + c.w, 0);

// The activity-name column gets whatever the fixed columns leave over, so keep it usable.
const LEFT_MIN = FIXED_W + 220;
const LEFT_DEFAULT = FIXED_W + 380;

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: "all", label: "All activities" },
  { id: "critical", label: "Critical" },
  { id: "not-started", label: "Not started" },
  { id: "in-progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "milestones", label: "Milestones" },
];

const DATE_MODES: Array<{ id: DateMode; label: string }> = [
  { id: "active", label: "Active in range" },
  { id: "starts", label: "Starting in range" },
  { id: "finishes", label: "Finishing in range" },
];

/** Non-working shading is only useful (and cheap enough) once days are a few pixels wide. */
const SHADING_MIN_PX_PER_DAY = 3;

const NO_GROUPS: ReadonlySet<string> = new Set();

interface Props {
  schedule: ScheduleModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function Schedule({ schedule, selectedId, onSelect }: Props) {
  const [normalCollapsed, setNormalCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  // Groups collapsed while a filter is active, tagged with the filter they belong to (see below).
  const [filterCollapse, setFilterCollapse] = useState<{ for: unknown; ids: ReadonlySet<string> }>({
    for: null,
    ids: NO_GROUPS,
  });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dateMode, setDateMode] = useState<DateMode>("active");
  const [showLinks, setShowLinks] = useState(true);
  const [showNonWorking, setShowNonWorking] = useState(true);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit to width
  const [leftW, setLeftW] = useState(() =>
    Math.max(LEFT_MIN, Math.min(LEFT_DEFAULT, Math.round(window.innerWidth * 0.45))),
  );

  // A different project starts from a clean slate.
  useEffect(() => {
    setNormalCollapsed(new Set());
    setFilterCollapse({ for: null, ids: NO_GROUPS });
    setQuery("");
    setFilter("all");
    setDateFrom("");
    setDateTo("");
    setZoom(null);
  }, [schedule]);

  const dateRange = useMemo(() => toDateRange(dateFrom, dateTo, dateMode), [dateFrom, dateTo, dateMode]);
  const dateRangeInvalid = dateRange === "invalid";
  const activeRange = dateRange === "invalid" ? null : dateRange; // an inverted range filters nothing
  const predicate = useMemo(() => makePredicate(filter, query, activeRange), [filter, query, activeRange]);
  // Which groups are closed. While a filter is active it has its own state, which starts fully open for each
  // new filter, so results are never hidden inside a group you collapsed under a different view. Your normal
  // layout is kept separately and comes back when the filter is cleared.
  const collapsed = predicate ? (filterCollapse.for === predicate ? filterCollapse.ids : NO_GROUPS) : normalCollapsed;
  const updateCollapsed = useCallback(
    (change: (prev: ReadonlySet<string>) => ReadonlySet<string>) => {
      if (predicate) {
        setFilterCollapse((cur) => ({ for: predicate, ids: change(cur.for === predicate ? cur.ids : NO_GROUPS) }));
      } else {
        setNormalCollapsed(change);
      }
    },
    [predicate],
  );
  const rows = useMemo(() => buildRows(schedule.roots, collapsed, predicate), [schedule, collapsed, predicate]);
  const virtual = useVirtualRows({ count: rows.length, rowHeight: ROW_H });
  const { scrollToIndex } = virtual;

  // ---- Timeline -------------------------------------------------------------
  const extent = useMemo(() => paddedRange(schedule.range), [schedule]);
  const spanDays = (extent.end - extent.start) / 86_400_000;
  const ganttViewW = Math.max(200, (virtual.viewWidth || 900) - leftW - 16);
  const fitPx = clampPx(ganttViewW / spanDays);
  const pxPerDay = zoom ?? fitPx;
  const timeline = useMemo(() => makeTimeline(extent.start, extent.end, pxPerDay), [extent, pxPerDay]);
  const ticks = useMemo(() => buildTicks(timeline), [timeline]);
  const totalW = leftW + timeline.width;
  const dataDate = schedule.project.dataDate;

  // ---- Selection: reveal, then scroll into view -------------------------------
  const scrollTarget = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    const a = schedule.activityById.get(selectedId);
    if (!a || a.projectId !== schedule.project.id) return;
    scrollTarget.current = selectedId;
    const openAncestors = (prev: ReadonlySet<string>) => {
      let next: Set<string> | null = null;
      for (let n = schedule.wbs.get(a.wbsId); n; n = n.parentId ? schedule.wbs.get(n.parentId) : undefined) {
        if (prev.has(n.id)) (next ??= new Set(prev)).delete(n.id);
      }
      return next ?? prev;
    };
    setNormalCollapsed(openAncestors);
    setFilterCollapse((cur) => {
      const ids = openAncestors(cur.ids);
      return ids === cur.ids ? cur : { for: cur.for, ids };
    });
    if (predicate && !predicate(a)) {
      setFilter("all");
      setQuery("");
      setDateFrom("");
      setDateTo("");
    }
    // Only re-run when the selection itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, schedule]);

  // The view stays mounted while another tab is showing; scrolling a hidden (0px) container is a
  // no-op, so hold the target until the container has a height again.
  const viewHeight = virtual.viewHeight;
  useEffect(() => {
    const target = scrollTarget.current;
    if (!target || viewHeight === 0) return;
    const i = rows.findIndex((r) => r.kind === "task" && r.task.id === target);
    if (i < 0) return;
    scrollTarget.current = null;
    scrollToIndex(i, HEADER_H);
  }, [rows, scrollToIndex, viewHeight]);

  const selected = selectedId ? schedule.activityById.get(selectedId) : undefined;
  const detailActivity = selected && selected.projectId === schedule.project.id ? selected : undefined;

  // ---- Dependency lines for the selected activity ---------------------------------
  const links = useMemo(() => {
    if (!showLinks || !detailActivity) return null;
    const rowIndex = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.kind === "task") rowIndex.set(r.task.id, i);
    });
    return buildLinks({
      predecessors: schedule.predecessors.get(detailActivity.id) ?? [],
      successors: schedule.successors.get(detailActivity.id) ?? [],
      activityById: schedule.activityById,
      rowIndex,
      x: timeline.x,
      rowH: ROW_H,
    });
  }, [showLinks, detailActivity, rows, schedule, timeline]);

  // ---- Non-working time (from the project's default calendar) ----------------------
  const pattern = schedule.defaultCalendar?.pattern ?? null;
  const nonWorking = useMemo(
    () => (pattern ? nonWorkingRuns(pattern, extent.start, extent.end) : []),
    [pattern, extent],
  );
  const shading = showNonWorking && pxPerDay >= SHADING_MIN_PX_PER_DAY ? nonWorking : [];

  const toggle = useCallback(
    (id: string) => {
      updateCollapsed((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    },
    [updateCollapsed],
  );

  const scrollToDataDate = () => {
    const el = virtual.ref.current;
    if (!el || dataDate === null) return;
    el.scrollTo({ left: Math.max(0, leftW + timeline.x(dataDate) - (el.clientWidth + leftW) / 2), behavior: "smooth" });
  };

  // Bring a newly chosen date range into view (skipping the initial mount).
  const rangeMounted = useRef(false);
  useEffect(() => {
    if (!rangeMounted.current) {
      rangeMounted.current = true;
      return;
    }
    const el = virtual.ref.current;
    const anchor = activeRange?.from ?? activeRange?.to;
    if (!el || anchor === null || anchor === undefined) return;
    el.scrollTo({ left: Math.max(0, timeline.x(anchor) - 16), behavior: "smooth" });
    // Re-centre only when the range changes, not on every zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRange]);

  const clearDates = () => {
    setDateFrom("");
    setDateTo("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      onSelect(null);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const step = e.key === "ArrowDown" ? 1 : -1;
    let i = rows.findIndex((r) => r.kind === "task" && r.task.id === selectedId);
    if (i < 0) i = step > 0 ? -1 : rows.length;
    for (i += step; i >= 0 && i < rows.length; i += step) {
      const r = rows[i]!;
      if (r.kind === "task") {
        scrollTarget.current = r.task.id;
        onSelect(r.task.id);
        return;
      }
    }
  };

  // ---- Left-pane resize -----------------------------------------------------
  const drag = useRef<{ x: number; w: number } | null>(null);
  const onResizeDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: leftW };
  };
  const onResizeMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const max = Math.max(LEFT_MIN, (virtual.viewWidth || 1200) - 160);
    setLeftW(Math.min(max, Math.max(LEFT_MIN, drag.current.w + e.clientX - drag.current.x)));
  };
  const onResizeUp = () => {
    drag.current = null;
  };

  const treeW = leftW - FIXED_W;
  const visible = rows.slice(virtual.start, virtual.end);
  // Counted from the data, not the rows, so collapsing a group doesn't change how many activities match.
  const matchCount = useMemo(
    () => (predicate ? schedule.activities.reduce((n, a) => n + (predicate(a) ? 1 : 0), 0) : schedule.stats.activities),
    [predicate, schedule],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        {/* Row 1: what to show */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <input
            type="search"
            aria-label="Search activities"
            placeholder="Search ID or name…"
            className={`${inputClass} w-52`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Filter activities"
            className={inputClass}
            value={filter}
            onChange={(e) => setFilter(e.target.value as ActivityFilter)}
          >
            {FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>

          <fieldset className="flex items-center gap-1.5">
            <legend className="sr-only">Date range</legend>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              From
              <input
                type="date"
                className={`${inputClass} w-[9.5rem] ${dateRangeInvalid ? "border-red-500 focus:border-red-500 focus:ring-red-500/30" : ""}`}
                value={dateFrom}
                max={dateTo || undefined}
                aria-invalid={dateRangeInvalid || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              To
              <input
                type="date"
                className={`${inputClass} w-[9.5rem] ${dateRangeInvalid ? "border-red-500 focus:border-red-500 focus:ring-red-500/30" : ""}`}
                value={dateTo}
                min={dateFrom || undefined}
                aria-invalid={dateRangeInvalid || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>
            <select
              aria-label="Date filter mode"
              className={inputClass}
              value={dateMode}
              disabled={!dateFrom && !dateTo}
              onChange={(e) => setDateMode(e.target.value as DateMode)}
            >
              {DATE_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            {(dateFrom || dateTo) && (
              <button type="button" className={buttonClass} onClick={clearDates}>
                Clear dates
              </button>
            )}
          </fieldset>

          <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400" aria-live="polite">
            {predicate
              ? `${fmtInt(matchCount)} of ${fmtInt(schedule.stats.activities)} activities`
              : `${fmtInt(schedule.stats.activities)} activities`}
          </span>
          {dateRangeInvalid && (
            <span role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              “From” is after “To” — date filter ignored
            </span>
          )}
        </div>

        {/* Row 2: how to show it */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex gap-1">
            <button type="button" className={buttonClass} onClick={() => updateCollapsed(() => NO_GROUPS)}>
              Expand all
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => updateCollapsed(() => new Set(collapsibleIds(schedule.roots)))}
            >
              Collapse all
            </button>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              className={toggleClass(showLinks)}
              aria-pressed={showLinks}
              onClick={() => setShowLinks((v) => !v)}
              title="Draw the selected activity's predecessors and successors"
            >
              Links
            </button>
            <button
              type="button"
              className={toggleClass(showNonWorking && pattern !== null)}
              aria-pressed={showNonWorking && pattern !== null}
              disabled={pattern === null}
              onClick={() => setShowNonWorking((v) => !v)}
              title={
                pattern === null
                  ? "This file has no readable calendar data"
                  : `Shade weekends and holidays from “${schedule.defaultCalendar?.name}” (visible when zoomed in)`
              }
            >
              Non-working
            </button>
          </div>
          {links && links.hidden > 0 && (
            <span
              className="text-xs text-amber-700 dark:text-amber-400"
              title="The other activity is filtered out, inside a collapsed group, undated, or in another project."
            >
              {links.hidden} link{links.hidden === 1 ? "" : "s"} not shown
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            <Legend links={links !== null} shading={shading.length > 0} />
            <div className="flex gap-1">
              <button type="button" className={`${buttonClass} w-8 px-0`} aria-label="Zoom out" onClick={() => setZoom(clampPx(pxPerDay / 1.5))}>
                −
              </button>
              <button type="button" className={buttonClass} onClick={() => setZoom(null)} aria-pressed={zoom === null}>
                Fit
              </button>
              <button type="button" className={`${buttonClass} w-8 px-0`} aria-label="Zoom in" onClick={() => setZoom(clampPx(pxPerDay * 1.5))}>
                +
              </button>
              <button type="button" className={buttonClass} onClick={scrollToDataDate} disabled={dataDate === null}>
                Data date
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table + Gantt share one scroll container so rows stay aligned */}
      <div
        ref={virtual.ref}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label="Schedule"
        className="relative min-h-0 flex-1 overflow-auto bg-white focus:outline-none dark:bg-slate-950"
      >
        <div style={{ width: totalW, minWidth: "100%" }}>
          {/* Sticky header */}
          <div className="sticky top-0 z-20 flex border-b border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-900" style={{ height: HEADER_H, width: totalW }}>
            <div
              className="sticky left-0 z-30 flex shrink-0 items-end border-r border-slate-300 bg-slate-100 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
              style={{ width: leftW }}
            >
              <div className="min-w-0 flex-1 truncate px-3 pb-1.5" style={{ width: treeW }}>
                Activity
              </div>
              {COLUMNS.map((c) => (
                <div key={c.key} className={`shrink-0 px-1 pb-1.5 ${c.key === "start" || c.key === "finish" ? "text-left" : "text-right"}`} style={{ width: c.w }}>
                  {c.label}
                </div>
              ))}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize table"
                onPointerDown={onResizeDown}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeUp}
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-blue-500/40"
              />
            </div>
            <TimeScale ticks={ticks} width={timeline.width} />
          </div>

          {/* Body */}
          <div className="relative" style={{ height: virtual.totalHeight, width: totalW }}>
            {rows.length === 0 && (
              <div className="sticky left-0 p-6 text-sm text-slate-500 dark:text-slate-400" style={{ width: virtual.viewWidth || undefined }}>
                {predicate ? "No activities match the current filter." : "This project has no activities."}
              </div>
            )}

            {/* Non-working days (weekends, holidays) */}
            {shading.map(([from, to], i) => (
              <div
                key={i}
                className="pointer-events-none absolute top-0 h-full bg-slate-200/50 dark:bg-slate-800/50"
                style={{ left: leftW + timeline.x(from), width: timeline.x(to) - timeline.x(from) }}
              />
            ))}

            {/* Vertical grid lines */}
            {ticks.bottom.length < 3000 &&
              ticks.bottom.map((t, i) => (
                <div key={i} className="absolute top-0 h-full w-px bg-slate-100 dark:bg-slate-700/60" style={{ left: leftW + t.x }} />
              ))}

            {/* Selected date range */}
            {activeRange && (
              <div
                className="pointer-events-none absolute top-0 z-[4] h-full border-x border-blue-500/50 bg-blue-500/[0.07]"
                style={{
                  left: leftW + (activeRange.from === null ? 0 : timeline.x(activeRange.from)),
                  width:
                    (activeRange.to === null ? timeline.width : timeline.x(activeRange.to)) -
                    (activeRange.from === null ? 0 : timeline.x(activeRange.from)),
                }}
                title="Date filter range"
              />
            )}

            {/* Data date */}
            {dataDate !== null && (
              <div
                className="pointer-events-none absolute top-0 z-[5] h-full w-px bg-orange-500"
                style={{ left: leftW + timeline.x(dataDate) }}
                title="Data date"
              />
            )}

            {/* Predecessor / successor lines for the selected activity */}
            {links && links.paths.length > 0 && (
              <svg
                aria-hidden
                className="pointer-events-none absolute z-[6]"
                style={{ left: leftW, top: links.top, width: timeline.width, height: links.height }}
                viewBox={`0 ${links.top} ${timeline.width} ${links.height}`}
              >
                {links.paths.map((p) => (
                  <g key={p.key} className={p.kind === "pred" ? "text-amber-500 dark:text-amber-400" : "text-violet-500 dark:text-violet-400"}>
                    <path d={p.d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <polygon points={p.arrow} fill="currentColor" />
                  </g>
                ))}
              </svg>
            )}

            {visible.map((row, k) => (
              <ScheduleRow
                key={row.key}
                row={row}
                top={(virtual.start + k) * ROW_H}
                leftW={leftW}
                treeW={treeW}
                totalW={totalW}
                timeline={timeline}
                dataDate={dataDate}
                selected={row.kind === "task" && row.task.id === selectedId}
                onToggle={toggle}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </div>

      {detailActivity && (
        <ActivityDetails
          key={detailActivity.id}
          schedule={schedule}
          activity={detailActivity}
          onSelect={onSelect}
          onClose={() => onSelect(null)}
        />
      )}
    </div>
  );
}

function Legend({ links, shading }: { links: boolean; shading: boolean }) {
  const item = (swatch: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={swatch} />
      {label}
    </span>
  );
  return (
    <div className="hidden items-center gap-3 text-[11px] text-slate-600 xl:flex dark:text-slate-400" aria-hidden>
      {item("h-2.5 w-4 rounded-sm bg-emerald-600", "Complete")}
      {item("h-2.5 w-4 rounded-sm bg-blue-700", "Actual")}
      {item("h-2.5 w-4 rounded-sm bg-blue-400", "Remaining")}
      {item("h-2.5 w-4 rounded-sm bg-red-500", "Critical")}
      {item("size-2.5 rotate-45 bg-slate-800 dark:bg-slate-200", "Milestone")}
      {item("h-3 w-px bg-orange-500", "Data date")}
      {links && item("h-0.5 w-4 bg-amber-500", "Predecessor")}
      {links && item("h-0.5 w-4 bg-violet-500", "Successor")}
      {shading && item("h-2.5 w-4 rounded-sm border border-slate-300 bg-slate-200/70 dark:border-slate-700 dark:bg-slate-800", "Non-working")}
    </div>
  );
}

function TimeScale({ ticks, width }: { ticks: ReturnType<typeof buildTicks>; width: number }) {
  const tier = (list: typeof ticks.top, top: number) =>
    list.map((t, i) => (
      <div
        key={i}
        className="absolute h-[22px] overflow-hidden whitespace-nowrap border-l border-slate-300 px-1 text-[10px] leading-[22px] text-slate-600 dark:border-slate-700 dark:text-slate-400"
        style={{ left: t.x, width: t.w, top }}
      >
        {t.label}
      </div>
    ));
  return (
    <div className="relative shrink-0" style={{ width }}>
      {tier(ticks.top, 0)}
      <div className="absolute inset-x-0 top-[22px] border-t border-slate-300 dark:border-slate-700" />
      {tier(ticks.bottom, 22)}
    </div>
  );
}

interface RowProps {
  row: Row;
  top: number;
  leftW: number;
  treeW: number;
  totalW: number;
  timeline: Timeline;
  dataDate: number | null;
  selected: boolean;
  onToggle: (id: string) => void;
  onSelect: (id: string | null) => void;
}

function ScheduleRow({ row, top, leftW, treeW, totalW, timeline, dataDate, selected, onToggle, onSelect }: RowProps) {
  const isWbs = row.kind === "wbs";
  const bg = selected
    ? "bg-blue-50 dark:bg-blue-950"
    : isWbs
      ? "bg-slate-50 dark:bg-slate-900"
      : "bg-white group-hover:bg-slate-50 dark:bg-slate-950 dark:group-hover:bg-slate-900";

  const handle = () => (isWbs ? onToggle(row.node.id) : onSelect(row.task.id));

  return (
    <div
      className={`group absolute left-0 flex border-b border-slate-100 text-xs dark:border-slate-800 ${
        selected ? "bg-blue-50/60 dark:bg-blue-950/40" : isWbs ? "bg-slate-50/70 dark:bg-slate-900/60" : "hover:bg-slate-50/70 dark:hover:bg-slate-900/50"
      }`}
      style={{ top, height: ROW_H, width: totalW }}
      onClick={handle}
      aria-selected={selected || undefined}
    >
      <div className={`sticky left-0 z-10 flex shrink-0 items-center border-r border-slate-200 dark:border-slate-800 ${bg}`} style={{ width: leftW }}>
        {isWbs ? <WbsCells row={row} treeW={treeW} /> : <TaskCells task={row.task} depth={row.depth} treeW={treeW} />}
      </div>
      <div className="relative shrink-0 overflow-hidden" style={{ width: timeline.width }}>
        {isWbs ? <SummaryBar node={row.node} timeline={timeline} /> : <TaskBar task={row.task} timeline={timeline} dataDate={dataDate} />}
      </div>
    </div>
  );
}

const numCell = "shrink-0 px-1 tabular-nums";

function WbsCells({ row, treeW }: { row: Extract<Row, { kind: "wbs" }>; treeW: number }) {
  const { node } = row;
  return (
    <>
      <div className="flex min-w-0 items-center gap-1.5 pr-2 font-semibold" style={{ width: treeW, paddingLeft: 8 + row.depth * 14 }}>
        <span className="w-3 shrink-0 text-center text-[10px] text-slate-500" aria-hidden>
          {row.expanded ? "▼" : "▶"}
        </span>
        <span className="truncate">{node.name}</span>
        <span
          className="shrink-0 font-normal text-slate-400"
          title={row.matches === undefined ? undefined : `${row.matches} matching of ${node.activityCount}`}
        >
          {fmtInt(row.matches ?? node.activityCount)}
        </span>
      </div>
      <div className={numCell} style={{ width: COLUMNS[0].w + COLUMNS[1].w }} />
      <div className={numCell} style={{ width: COLUMNS[2].w }}>
        {fmtDate(node.start)}
      </div>
      <div className={numCell} style={{ width: COLUMNS[3].w }}>
        {fmtDate(node.finish)}
      </div>
      <div className={numCell} style={{ width: COLUMNS[4].w }} />
    </>
  );
}

function TaskCells({ task, depth, treeW }: { task: Activity; depth: number; treeW: number }) {
  const float = task.status === "completed" ? "" : fmtDays(task.totalFloatHrs, task.dayHrs);
  return (
    <>
      <div className="flex min-w-0 items-center gap-1.5 pr-2" style={{ width: treeW, paddingLeft: 8 + depth * 14 }}>
        <span className={`size-2 shrink-0 ${isMilestone(task) ? "rotate-45" : "rounded-full"} ${STATUS_DOT[task.status]}`} aria-hidden />
        <span className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-slate-400">{task.code}</span>
        <span className="truncate" title={task.name}>
          {task.name}
        </span>
      </div>
      <div className={`${numCell} text-right`} style={{ width: COLUMNS[0].w }}>
        {fmtDays(task.origDurHrs, task.dayHrs)}
      </div>
      <div className={`${numCell} text-right`} style={{ width: COLUMNS[1].w }}>
        {fmtDays(task.remDurHrs, task.dayHrs)}
      </div>
      <div className={numCell} style={{ width: COLUMNS[2].w }}>
        {fmtDate(task.start)}
      </div>
      <div className={numCell} style={{ width: COLUMNS[3].w }}>
        {fmtDate(task.finish)}
      </div>
      <div
        className={`${numCell} text-right ${task.critical ? "font-medium text-red-600 dark:text-red-400" : ""}`}
        style={{ width: COLUMNS[4].w }}
      >
        {float}
      </div>
    </>
  );
}

function SummaryBar({ node, timeline }: { node: WbsNode; timeline: Timeline }) {
  if (node.start === null || node.finish === null) return null;
  const x1 = timeline.x(node.start);
  const x2 = Math.max(timeline.x(node.finish), x1 + 4);
  return (
    <div
      className="absolute bg-slate-700 dark:bg-slate-300"
      style={{
        left: x1,
        width: x2 - x1,
        top: (ROW_H - 9) / 2,
        height: 9,
        clipPath: "polygon(0 0, 100% 0, 100% 100%, calc(100% - 4px) 55%, 4px 55%, 0 100%)",
      }}
      title={`${node.name}: ${fmtDate(node.start)} → ${fmtDate(node.finish)}`}
    />
  );
}

function TaskBar({ task, timeline, dataDate }: { task: Activity; timeline: Timeline; dataDate: number | null }) {
  if (task.start === null || task.finish === null) return null;
  const title = `${task.code} ${task.name}\n${fmtDate(task.start)} → ${fmtDate(task.finish)}`;

  if (isMilestone(task)) {
    const x = timeline.x(task.type === "finish-milestone" ? task.finish : task.start);
    const color = task.critical ? "bg-red-500" : task.status === "completed" ? "bg-emerald-600" : "bg-slate-800 dark:bg-slate-200";
    return (
      <>
        <div className={`absolute size-2.5 rotate-45 ${color}`} style={{ left: x - 5, top: (ROW_H - 10) / 2 }} title={title} />
        <BarLabel x={x + 9} text={task.name} />
      </>
    );
  }

  const x1 = timeline.x(task.start);
  const x2 = Math.max(timeline.x(task.finish), x1 + 3);

  if (task.type === "loe") {
    return (
      <>
        <div className="absolute h-1.5 rounded-sm bg-teal-500" style={{ left: x1, width: x2 - x1, top: (ROW_H - 6) / 2 }} title={title} />
        <BarLabel x={x2 + 6} text={task.name} />
      </>
    );
  }

  // Actual portion runs to the data date for in-progress work; completed work is all actual.
  const split =
    task.status === "completed"
      ? x2
      : task.status === "in-progress" && dataDate !== null
        ? Math.min(x2, Math.max(x1, timeline.x(dataDate)))
        : x1;
  const actualColor = task.status === "completed" ? "bg-emerald-600" : task.critical ? "bg-red-700" : "bg-blue-700";
  const remainingColor = task.critical ? "bg-red-400" : "bg-blue-400";

  return (
    <>
      <div className="absolute flex h-3 overflow-hidden rounded-sm" style={{ left: x1, width: x2 - x1, top: (ROW_H - 12) / 2 }} title={title}>
        <div className={actualColor} style={{ width: split - x1 }} />
        <div className={`${remainingColor} flex-1`} />
      </div>
      <BarLabel x={x2 + 6} text={task.name} />
    </>
  );
}

function BarLabel({ x, text }: { x: number; text: string }) {
  return (
    <span className="pointer-events-none absolute whitespace-nowrap text-[10px] leading-[26px] text-slate-500 dark:text-slate-400" style={{ left: x, top: 0 }}>
      {text}
    </span>
  );
}
