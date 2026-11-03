import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fmtDate, fmtDays, fmtInt } from "../lib/format";
import { compileFilter, EMPTY_FILTER, type AdvancedFilter } from "../lib/advancedFilter";
import { downloadBlob } from "../lib/csv";
import { describeTrace, runTrace, type TraceMode, type TraceSpec } from "../lib/drivingPath";
import { buildLinks } from "../lib/links";
import { buildPdf, describeFilters, estimatePages, safeFileName } from "../lib/printPdf";
import {
  ACTIVITY_FILTERS,
  buildRows,
  collapsibleIds,
  makePredicate,
  maxWbsDepth,
  toDateRange,
  type ActivityFilter,
  type ActivitySort,
  type DateMode,
  type Row,
} from "../lib/scheduleRows";
import {
  buildTicks,
  clampPx,
  fitToRange,
  makeTimeline,
  paddedRange,
  type Timeline,
} from "../lib/timeline";
import { useVirtualRows } from "../lib/useVirtualRows";
import { OPTIONAL_COLUMNS, optionalColumnValue, type OptionalColumn, type OptionalColumnKey } from "../lib/scheduleColumns";
import { usePersistedBoolean } from "../state/usePersistedBoolean";
import { usePersistedStrings } from "../state/usePersistedStrings";
import { nonWorkingRuns } from "../lib/xer/calendar";
import { isMilestone, type Activity, type Schedule as ScheduleModel, type WbsNode } from "../lib/xer/model";
import { ActivityDetails } from "./ActivityDetails";
import { ActivitySortSelect } from "./ActivitySortSelect";
import { ColumnsMenu } from "./ColumnsMenu";
import { DateRangeChip } from "./DateRangeChip";
import { FilterBuilder } from "./FilterBuilder";
import { FitViewButton } from "./FitViewButton";
import { TraceMenu } from "./TraceMenu";
import { TracePanel } from "./TracePanel";
import { WbsLevelSelect } from "./WbsLevelSelect";
import { LuChevronsDown, LuChevronsUp, LuFilter, LuMinus, LuPlus, LuPrinter, LuTarget } from "react-icons/lu";
import { STATUS_DOT, Switch, badgeClass, buttonClass, iconButtonClass, iconToggleClass, inputClass } from "./ui";

const ROW_H = 26;
const HEADER_H = 44;

const COLUMNS = [
  { key: "orig", label: "Orig", title: "Original duration, in days", w: 52 },
  { key: "rem", label: "Rem", title: "Remaining duration, in days", w: 52 },
  { key: "start", label: "Start", title: "Actual start if it has one, otherwise the early (forecast) start date", w: 82 },
  { key: "finish", label: "Finish", title: "Actual finish if it has one, otherwise the early (forecast) finish date", w: 82 },
  { key: "tf", label: "TF", title: "Total float, in days: how long this can slip before it delays the project finish", w: 50 },
] as const;
const FIXED_W = COLUMNS.reduce((n, c) => n + c.w, 0);
// The vertical line between adjacent columns, in both the header and the rows.
const colBorder = "border-l border-slate-100 dark:border-slate-800";

/** Non-working shading is only useful (and cheap enough) once days are a few pixels wide. */
const SHADING_MIN_PX_PER_DAY = 3;
/** Empty space kept at each end of the chart. */
const CHART_MARGIN_PX = 24;

const NO_GROUPS: ReadonlySet<string> = new Set();

const LINK_COLOR = {
  pred: "text-amber-500 dark:text-amber-400",
  succ: "text-violet-500 dark:text-violet-400",
  path: "text-cyan-500 dark:text-cyan-400",
} as const;

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
  const [advanced, setAdvanced] = useState<AdvancedFilter>(EMPTY_FILTER);
  const [showBuilder, setShowBuilder] = useState(false);
  // How many WBS levels get their own row; deeper levels are flattened into the deepest one shown, like P6's
  // "Group by WBS" level setting. Null (the default) shows every level, as before.
  const [wbsDepth, setWbsDepth] = useState<number | null>(null);
  // How activities and WBS groups are ordered at every level; see ActivitySort. A preference, so — unlike
  // wbsDepth — it is remembered and not reset per project, the same as Non-working or Groups.
  const [sortByDate, setSortByDate] = usePersistedBoolean("xerview-sort-date", false);
  const sortMode: ActivitySort = sortByDate ? "date" : "code";
  const [showLinks, setShowLinks] = useState(false);
  // A driving-logic trace (see lib/drivingPath.ts) and whether the schedule is narrowed to its activities.
  const [trace, setTrace] = useState<TraceSpec | null>(null);
  const [pathOnly, setPathOnly] = useState(false);
  // A preference, so it is remembered: turning it on once should not need repeating after every reload.
  const [showNonWorking, setShowNonWorking] = usePersistedBoolean("xerview-show-non-working", false);
  // A line at today's date, from this computer's clock. Read again each time the switch is turned on.
  const [showToday, setShowToday] = useState(false);
  const [today, setToday] = useState(() => Date.now());
  // Set by "Fit to dates": where the chart should scroll to once the new zoom has been drawn.
  const [fitRequest, setFitRequest] = useState<{ start: number } | null>(null);
  // Whether the search box also looks at WBS group names. A preference, so it is remembered and not reset per project.
  const [searchGroups, setSearchGroups] = usePersistedBoolean("xerview-search-groups", false);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit to width
  // While a PDF is being built: how many pages are done. Null when idle.
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  // Optional columns beyond the fixed five, switched on from the Columns menu. A preference, so it is remembered
  // and not reset per project (like the theme, not like a filter).
  const [enabledColumns, setEnabledColumns] = usePersistedStrings("xerview-columns", []);
  const activeColumns = useMemo(() => OPTIONAL_COLUMNS.filter((c) => enabledColumns.includes(c.key)), [enabledColumns]);
  // How much of the left panel the fixed and optional columns need; whatever is left goes to the activity name.
  const fixedW = FIXED_W + activeColumns.reduce((n, c) => n + c.width, 0);
  const leftMin = fixedW + 220;
  const leftDefault = fixedW + 380;
  const [leftW, setLeftW] = useState(() => Math.max(leftMin, Math.min(leftDefault, Math.round(window.innerWidth * 0.45))));

  // Turning a column on can otherwise crowd out the activity name; widen the panel to keep the same minimum room
  // for it as everywhere else (leftMin). Never shrinks it back when a column is turned off — that would undo a
  // resize the user chose on purpose.
  useEffect(() => {
    setLeftW((w) => Math.max(w, leftMin));
  }, [leftMin]);

  // A different project starts from a clean slate.
  useEffect(() => {
    setNormalCollapsed(new Set());
    setFilterCollapse({ for: null, ids: NO_GROUPS });
    setQuery("");
    setFilter("all");
    setDateFrom("");
    setDateTo("");
    setAdvanced(EMPTY_FILTER);
    setZoom(null);
    setWbsDepth(null);
    setTrace(null);
    setPathOnly(false);
  }, [schedule]);

  const traceResult = useMemo(() => (trace ? runTrace(schedule, trace) : null), [schedule, trace]);
  const traceIds = traceResult && !traceResult.problem && traceResult.ids.size > 0 ? traceResult.ids : null;

  const dateRange = useMemo(() => toDateRange(dateFrom, dateTo, dateMode), [dateFrom, dateTo, dateMode]);
  const dateRangeInvalid = dateRange === "invalid";
  const activeRange = dateRange === "invalid" ? null : dateRange; // an inverted range filters nothing
  const compiled = useMemo(() => compileFilter(schedule, advanced), [schedule, advanced]);
  // "Path only" is one more condition alongside the filter builder's.
  const extraTest = useMemo(() => {
    const built = compiled.predicate;
    if (!pathOnly || !traceIds) return built;
    return (a: Activity) => traceIds.has(a.id) && (!built || built(a));
  }, [compiled, pathOnly, traceIds]);
  const predicate = useMemo(
    () => makePredicate(filter, query, activeRange, extraTest, searchGroups ? schedule : null),
    [filter, query, activeRange, extraTest, schedule, searchGroups],
  );
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
  const rows = useMemo(
    () => buildRows(schedule.roots, collapsed, predicate, wbsDepth, sortMode),
    [schedule, collapsed, predicate, wbsDepth, sortMode],
  );
  const wbsLevels = useMemo(() => maxWbsDepth(schedule.roots), [schedule]);
  const virtual = useVirtualRows({ count: rows.length, rowHeight: ROW_H });
  const { scrollToIndex } = virtual;

  // ---- Timeline -------------------------------------------------------------
  const extent = useMemo(() => paddedRange(schedule.range), [schedule]);
  const spanDays = (extent.end - extent.start) / 86_400_000;
  const ganttViewW = Math.max(200, (virtual.viewWidth || 900) - leftW - 16);
  const fitPx = clampPx((ganttViewW - 2 * CHART_MARGIN_PX) / spanDays);
  const pxPerDay = zoom ?? fitPx;
  // A fixed margin (in pixels, so a fixed look at any zoom) either side, so bars, labels and outlines at the ends aren't clipped.
  const timeline = useMemo(() => {
    const pad = (CHART_MARGIN_PX / pxPerDay) * 86_400_000;
    return makeTimeline(extent.start - pad, extent.end + pad, pxPerDay);
  }, [extent, pxPerDay]);
  const ticks = useMemo(() => buildTicks(timeline), [timeline]);
  const totalW = leftW + timeline.width;
  const todayInView = showToday && today >= timeline.start && today <= timeline.end;
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
      setAdvanced(EMPTY_FILTER);
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

    // And sideways, to the activity's bar: left alone when it is already on screen, otherwise centred (or, for a bar
    // wider than the view, its start). The table on the left is sticky, so the chart's visible part starts after it.
    const el = virtual.ref.current;
    const task = schedule.activityById.get(target);
    if (!el || !task || task.start === null || task.finish === null) return;
    const barL = leftW + timeline.x(task.start);
    const barR = leftW + Math.max(timeline.x(task.finish), timeline.x(task.start) + 3);
    const viewL = el.scrollLeft + leftW;
    const viewR = el.scrollLeft + el.clientWidth;
    if (barL >= viewL && barR <= viewR) return;
    const room = el.clientWidth - leftW;
    const left = barR - barL < room ? (barL + barR) / 2 - leftW - room / 2 : barL - leftW - 40;
    // Smooth for a short hop; a jump across years would take seconds, so that one is immediate.
    el.scrollTo({ left: Math.max(0, left), behavior: Math.abs(left - el.scrollLeft) > 3 * room ? "auto" : "smooth" });
    // Only when there is a new target (a selection or arrow key), not whenever the timeline or widths change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, scrollToIndex, viewHeight, selectedId]);

  const selected = selectedId ? schedule.activityById.get(selectedId) : undefined;
  const detailActivity = selected && selected.projectId === schedule.project.id ? selected : undefined;

  // ---- Dependency lines for the selected activity ---------------------------------
  const linked = showLinks ? detailActivity : undefined; // the activity whose own links are drawn
  const links = useMemo(() => {
    if (!linked && !traceIds) return null;
    const rowIndex = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.kind === "task") rowIndex.set(r.task.id, i);
    });
    return buildLinks({
      predecessors: (linked && schedule.predecessors.get(linked.id)) || [],
      successors: (linked && schedule.successors.get(linked.id)) || [],
      path: traceResult && traceIds ? traceResult.links.map((l) => l.rel) : [],
      activityById: schedule.activityById,
      rowIndex,
      x: timeline.x,
      rowH: ROW_H,
    });
  }, [linked, traceResult, traceIds, rows, schedule, timeline]);

  const startTrace = (originId: string, mode: TraceMode) => {
    setPathOnly(false);
    setTrace({ mode, originId });
    // Make the starting activity the selected one (and bring it into view), as when it is picked by ID.
    onSelect(originId);
  };
  const closeTrace = () => {
    setTrace(null);
    setPathOnly(false);
  };

  // ---- Non-working time (from the project's default calendar) ----------------------
  const pattern = schedule.defaultCalendar?.pattern ?? null;
  const shadingOn = showNonWorking && pxPerDay >= SHADING_MIN_PX_PER_DAY;
  const shading = useMemo(
    () => (pattern && shadingOn ? nonWorkingRuns(pattern, timeline.start, timeline.end) : []),
    [pattern, shadingOn, timeline],
  );

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

  const fitTo = (from: number, to: number) => {
    const fit = fitToRange(from, Math.max(to, from + 86_400_000), ganttViewW);
    setZoom(fit.pxPerDay);
    setFitRequest({ start: fit.start });
  };
  const fitToDates = () => {
    if (!activeRange) return;
    // A range with one end open runs to the project's own start or finish on that side.
    fitTo(activeRange.from ?? schedule.range?.start ?? extent.start, activeRange.to ?? schedule.range?.finish ?? extent.end);
  };

  // The period the rows on screen cover, with and without the group rows (whose dates cover their whole branch, which
  // a filter may have mostly removed). Each is offered by Fit View only when it differs from the whole project's.
  const spanOf = (tasksOnly: boolean) => {
    let start = Infinity;
    let finish = -Infinity;
    for (const r of rows) {
      if (tasksOnly && r.kind !== "task") continue;
      const n = r.kind === "task" ? r.task : r.node;
      if (n.start !== null && n.start < start) start = n.start;
      if (n.finish !== null && n.finish > finish) finish = n.finish;
    }
    return start <= finish ? { start, finish } : null;
  };
  const rowsSpan = useMemo(() => spanOf(false), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const activitiesSpan = useMemo(() => spanOf(true), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const differs = (span: { start: number; finish: number } | null, other = schedule.range) =>
    span !== null && (!other || span.start > other.start + 86_400_000 || span.finish < other.finish - 86_400_000);
  const rowsDiffer = differs(rowsSpan);
  // Only worth a separate entry when there are group rows and they stretch the period beyond the activities.
  const activitiesDiffer = differs(activitiesSpan) && differs(activitiesSpan, rowsSpan);

  // Scroll once the new zoom is on screen (in the same render, so the timeline here already has it).
  useEffect(() => {
    const el = virtual.ref.current;
    if (!fitRequest || !el) return;
    el.scrollTo({ left: Math.max(0, timeline.x(fitRequest.start)) });
    // Only when a fit is requested, not on every zoom afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest]);

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
    const max = Math.max(leftMin, (virtual.viewWidth || 1200) - 160);
    setLeftW(Math.min(max, Math.max(leftMin, drag.current.w + e.clientX - drag.current.x)));
  };
  const onResizeUp = () => {
    drag.current = null;
  };

  const printToPdf = async () => {
    const filters = { status: filter, query, searchGroups, dateFrom, dateTo, dateMode, advanced, path: pathOnly && trace ? describeTrace(schedule, trace) : null };
    const pages = estimatePages(rows.length, describeFilters(filters).length ? 2 : 1);
    if (pages > 100 && !window.confirm(`This will make a PDF of about ${pages} A3 pages. Continue?`)) return;
    setPdfError(null);
    setPdfProgress({ done: 0, total: pages });
    try {
      const { blob } = await buildPdf(
        {
          schedule,
          rows,
          filters,
          matched: matchCount,
          total: schedule.stats.activities,
          today: showToday ? today : null,
          columns: enabledColumns,
          shadeNonWorking: showNonWorking && pattern !== null,
          trace:
            trace && traceResult && traceIds
              ? { label: describeTrace(schedule, trace), ids: traceIds, links: traceResult.links.map((l) => l.rel) }
              : null,
        },
        { onProgress: (done, total) => setPdfProgress({ done, total }) },
      );
      downloadBlob(safeFileName(schedule.project.name), blob);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "Couldn't make the PDF.");
    } finally {
      setPdfProgress(null);
    }
  };

  const treeW = leftW - fixedW;
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <div className="relative">
            <input
              type="search"
              aria-label="Search activities"
              placeholder={searchGroups ? "Search ID, name, group…" : "Search ID or name…"}
              title={
                searchGroups
                  ? "Searches task code, task name, and the names and codes of the WBS groups above each task"
                  : "Searches task code and task name only"
              }
              className={`${inputClass} w-72 pr-28 [&::-webkit-search-cancel-button]:appearance-none`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="absolute inset-y-0 right-2 flex items-center gap-2">
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="rounded px-1 text-xs text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              )}
              <Switch
                checked={searchGroups}
                onChange={setSearchGroups}
                label="Groups"
                title="Also search the names and codes of the WBS groups above each task (e.g. a work package). Switch off to search task code and name only."
              />
            </div>
          </div>

          <select
            aria-label="Filter activities"
            className={inputClass}
            value={filter}
            onChange={(e) => setFilter(e.target.value as ActivityFilter)}
          >
            {ACTIVITY_FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={`${iconToggleClass(showBuilder || compiled.active > 0)} relative`}
            aria-expanded={showBuilder}
            aria-label={compiled.active > 0 ? `Filters (${compiled.active} in use)` : "Filters"}
            onClick={() => setShowBuilder((v) => !v)}
            title={compiled.active > 0 ? `Filters: ${compiled.active} in use. Filter by activity code, task or WBS` : "Filters: filter by activity code, task or WBS"}
          >
            <LuFilter size={16} aria-hidden />
            {compiled.active > 0 && <span className={badgeClass}>{compiled.active}</span>}
          </button>

          <DateRangeChip
            from={dateFrom}
            to={dateTo}
            mode={dateMode}
            invalid={dateRangeInvalid}
            onFrom={setDateFrom}
            onTo={setDateTo}
            onMode={setDateMode}
            onClear={clearDates}
          />

          <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-slate-500 dark:text-slate-400" aria-live="polite">
            {predicate
              ? `${fmtInt(matchCount)} of ${fmtInt(schedule.stats.activities)} activities`
              : `${fmtInt(schedule.stats.activities)} activities`}
          </span>
          <button
            type="button"
            className={`${buttonClass} gap-1.5`}
            onClick={printToPdf}
            disabled={pdfProgress !== null || rows.length === 0}
            title={
              rows.length === 0
                ? "Nothing to print: no activities match the filters"
                : "Save what is shown (with the current filters) as a PDF on A3 paper, landscape"
            }
          >
            <LuPrinter size={14} aria-hidden />
            {pdfProgress ? `Page ${Math.min(pdfProgress.done + 1, pdfProgress.total)} of ${pdfProgress.total}…` : "PDF"}
          </button>
          {pdfError && (
            <span role="alert" className="basis-full text-right text-xs text-red-600 dark:text-red-400">
              {pdfError}
            </span>
          )}
        </div>

        {showBuilder && <FilterBuilder schedule={schedule} value={advanced} onChange={setAdvanced} />}

        {/* Row 2: how to show it */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex gap-1">
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => updateCollapsed(() => NO_GROUPS)}
              aria-label="Expand all groups"
              title="Expand all groups"
            >
              <LuChevronsDown size={18} aria-hidden />
            </button>
            <button
              type="button"
              className={iconButtonClass}
              onClick={() => updateCollapsed(() => new Set(collapsibleIds(schedule.roots)))}
              aria-label="Collapse all groups"
              title="Collapse all groups"
            >
              <LuChevronsUp size={18} aria-hidden />
            </button>
          </div>
          {wbsLevels > 0 && <WbsLevelSelect levels={wbsLevels} value={wbsDepth ?? wbsLevels} onChange={setWbsDepth} />}
          <ActivitySortSelect value={sortMode} onChange={(s) => setSortByDate(s === "date")} />
          <ColumnsMenu
            enabled={enabledColumns}
            onToggle={(key, on) => setEnabledColumns((cur) => (on ? [...cur, key] : cur.filter((k) => k !== key)))}
          />
          <TraceMenu schedule={schedule} selected={detailActivity} active={trace !== null} onTrace={startTrace} />
          <span aria-hidden className="h-5 w-px bg-slate-300 dark:bg-slate-700" />
          <div className="flex items-center gap-3">
            <Switch
              checked={showLinks}
              onChange={setShowLinks}
              label="Links"
              title="Draw the selected activity's predecessors and successors"
            />
            <Switch
              checked={showNonWorking && pattern !== null}
              onChange={setShowNonWorking}
              disabled={pattern === null}
              label="Non-working"
              title={
                pattern === null
                  ? "This file has no readable calendar data"
                  : `Shade weekends and holidays from “${schedule.defaultCalendar?.name}” (visible when zoomed in)`
              }
            />
            <Switch
              checked={showToday}
              onChange={(on) => {
                setShowToday(on);
                if (on) setToday(Date.now());
              }}
              label="Today"
              title="Draw a line at today's date (from this computer's clock)"
            />
          </div>
          {linked && links && links.hidden > 0 && (
            <span
              className="text-xs text-amber-700 dark:text-amber-400"
              title="The other activity is filtered out, inside a collapsed group, undated, or in another project."
            >
              {links.hidden} link{links.hidden === 1 ? "" : "s"} not shown
            </span>
          )}
          {links && links.pathHidden > 0 && (
            <span
              className="text-xs text-cyan-700 dark:text-cyan-400"
              title="Part of the traced path is filtered out, inside a collapsed group, undated, or in another project."
            >
              {links.pathHidden} path link{links.pathHidden === 1 ? "" : "s"} not shown
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            <Legend links={linked !== undefined} trace={traceIds !== null} shading={shading.length > 0} today={todayInView} />
            <div className="flex gap-1">
              <button type="button" className={iconButtonClass} aria-label="Zoom out" onClick={() => setZoom(clampPx(pxPerDay / 1.5))}>
                <LuMinus size={18} aria-hidden />
              </button>
              <FitViewButton
                hasRange={activeRange !== null}
                hasRows={rowsDiffer}
                hasActivities={activitiesDiffer}
                fitted={zoom === null}
                onFitProject={() => setZoom(null)}
                onFitDates={fitToDates}
                onFitRows={() => rowsSpan && fitTo(rowsSpan.start, rowsSpan.finish)}
                onFitActivities={() => activitiesSpan && fitTo(activitiesSpan.start, activitiesSpan.finish)}
              />
              <button type="button" className={iconButtonClass} aria-label="Zoom in" onClick={() => setZoom(clampPx(pxPerDay * 1.5))}>
                <LuPlus size={18} aria-hidden />
              </button>
              <button
                type="button"
                className={iconButtonClass}
                onClick={scrollToDataDate}
                disabled={dataDate === null}
                aria-label="Go to data date"
                title={dataDate === null ? "This project has no data date" : "Go to the data date"}
              >
                <LuTarget size={18} aria-hidden />
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
              <div className="min-w-0 flex-1 truncate px-3 pb-1.5" style={{ width: treeW }} title="Activity code and name">
                Activity
              </div>
              {COLUMNS.map((c) => (
                <div
                  key={c.key}
                  className={`shrink-0 px-1 pb-1.5 ${colBorder} ${c.key === "start" || c.key === "finish" ? "text-left" : "text-right"}`}
                  style={{ width: c.w }}
                  title={c.title}
                >
                  {c.label}
                </div>
              ))}
              {activeColumns.map((c) => (
                <div
                  key={c.key}
                  className={`shrink-0 px-1 pb-1.5 ${colBorder} ${c.align === "right" ? "text-right" : "text-left"}`}
                  style={{ width: c.width }}
                  title={c.title}
                >
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
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none hover:bg-accent-500/40"
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
                className="pointer-events-none absolute top-0 h-full bg-(--non-working)"
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
                className="pointer-events-none absolute top-0 z-[4] h-full border-x border-accent-500/50 bg-accent-500/[0.07]"
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

            {/* Today */}
            {todayInView && (
              <div
                className="pointer-events-none absolute top-0 z-[5] h-full w-0 border-l-2 border-dashed border-fuchsia-500"
                style={{ left: leftW + timeline.x(today) - 1 }}
                title={`Today, ${fmtDate(today)}`}
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
                  <g key={p.key} className={LINK_COLOR[p.kind]}>
                    <path d={p.d} fill="none" stroke="currentColor" strokeWidth={p.kind === "path" ? 2 : 1.5} strokeLinejoin="round" />
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
                trace={traceIds === null || row.kind !== "task" ? null : traceIds.has(row.task.id) ? "on" : "off"}
                columns={activeColumns}
                onToggle={toggle}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </div>

      {trace && traceResult && (
        <TracePanel
          schedule={schedule}
          spec={trace}
          result={traceResult}
          selectedId={selectedId}
          pathOnly={pathOnly}
          onPathOnly={setPathOnly}
          onSelect={onSelect}
          onClose={closeTrace}
        />
      )}

      {/* The trace takes the details panel's place while it is showing; closing it brings the details back. */}
      {detailActivity && !trace && (
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

function Legend({ links, trace, shading, today }: { links: boolean; trace: boolean; shading: boolean; today: boolean }) {
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
      {item("h-1.5 w-4 rounded-sm bg-teal-500", "Level of effort")}
      {item("h-2 w-4 bg-slate-700 dark:bg-slate-300", "WBS group")}
      {item("size-2.5 rotate-45 bg-slate-800 dark:bg-slate-200", "Milestone")}
      {item("h-3 w-px bg-orange-500", "Data date")}
      {today && item("h-3 w-0 border-l-2 border-dashed border-fuchsia-500", "Today")}
      {trace && item("h-3 w-4 rounded-sm outline outline-2 -outline-offset-1 outline-cyan-500", "Traced path")}
      {links && item("h-0.5 w-4 bg-amber-500", "Predecessor")}
      {links && item("h-0.5 w-4 bg-violet-500", "Successor")}
      {shading && item("h-2.5 w-4 rounded-sm border border-slate-300 bg-(--non-working) dark:border-slate-600", "Non-working")}
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
  /** Where the row sits against a traced path: on it, off it (dimmed), or null when no trace is showing. */
  trace: "on" | "off" | null;
  columns: OptionalColumn[];
  onToggle: (id: string) => void;
  onSelect: (id: string | null) => void;
}

function ScheduleRow({ row, top, leftW, treeW, totalW, timeline, dataDate, selected, trace, columns, onToggle, onSelect }: RowProps) {
  const isWbs = row.kind === "wbs";
  const onPath = trace === "on" && !selected;
  const bg = selected
    ? "bg-accent-50 dark:bg-accent-950"
    : onPath
      ? "bg-cyan-50 dark:bg-cyan-950"
      : isWbs
      ? "bg-slate-50 dark:bg-slate-900"
      : "bg-white group-hover:bg-slate-50 dark:bg-slate-950 dark:group-hover:bg-slate-900";

  const handle = () => (isWbs ? onToggle(row.node.id) : onSelect(row.task.id));

  return (
    <div
      className={`group absolute left-0 flex border-b border-slate-100 text-xs dark:border-slate-800 ${
        selected ? "bg-accent-50/60 dark:bg-accent-950/40" : onPath ? "bg-cyan-50/60 dark:bg-cyan-950/40" : isWbs ? "bg-slate-50/70 dark:bg-slate-900/60" : "hover:bg-slate-50/70 dark:hover:bg-slate-900/50"
      }`}
      style={{ top, height: ROW_H, width: totalW }}
      onClick={handle}
      aria-selected={selected || undefined}
    >
      <div className={`sticky left-0 z-10 flex shrink-0 items-center border-r border-slate-200 dark:border-slate-800 ${bg}`} style={{ width: leftW }}>
        {isWbs ? <WbsCells row={row} treeW={treeW} columns={columns} /> : <TaskCells task={row.task} depth={row.depth} treeW={treeW} columns={columns} />}
      </div>
      <div className={`relative shrink-0 overflow-hidden ${trace === "off" ? "opacity-30" : ""}`} style={{ width: timeline.width }}>
        {isWbs ? <SummaryBar node={row.node} timeline={timeline} /> : <TaskBar task={row.task} timeline={timeline} dataDate={dataDate} ring={trace === "on" ? RING : ""} />}
      </div>
    </div>
  );
}

const numCell = "shrink-0 truncate px-1 tabular-nums";

function WbsCells({ row, treeW, columns }: { row: Extract<Row, { kind: "wbs" }>; treeW: number; columns: OptionalColumn[] }) {
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
      <div className={`${numCell} ${colBorder}`} style={{ width: COLUMNS[0].w + COLUMNS[1].w }} />
      <div className={`${numCell} ${colBorder}`} style={{ width: COLUMNS[2].w }}>
        {fmtDate(node.start)}
      </div>
      <div className={`${numCell} ${colBorder}`} style={{ width: COLUMNS[3].w }}>
        {fmtDate(node.finish)}
      </div>
      <div className={`${numCell} ${colBorder}`} style={{ width: COLUMNS[4].w }} />
      {columns.map((c) => (
        <div key={c.key} className={`${numCell} ${colBorder}`} style={{ width: c.width }} />
      ))}
    </>
  );
}

function TaskCells({ task, depth, treeW, columns }: { task: Activity; depth: number; treeW: number; columns: OptionalColumn[] }) {
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
      <div className={`${numCell} ${colBorder} text-right`} style={{ width: COLUMNS[0].w }}>
        {fmtDays(task.origDurHrs, task.dayHrs)}
      </div>
      <div className={`${numCell} ${colBorder} text-right`} style={{ width: COLUMNS[1].w }}>
        {fmtDays(task.remDurHrs, task.dayHrs)}
      </div>
      <div className={`${numCell} ${colBorder}`} style={{ width: COLUMNS[2].w }}>
        {fmtDate(task.start)}
      </div>
      <div className={`${numCell} ${colBorder}`} style={{ width: COLUMNS[3].w }}>
        {fmtDate(task.finish)}
      </div>
      <div
        className={`${numCell} ${colBorder} text-right ${task.critical ? "font-medium text-red-600 dark:text-red-400" : ""}`}
        style={{ width: COLUMNS[4].w }}
      >
        {float}
      </div>
      {columns.map((c) => (
        <div key={c.key} className={`${numCell} ${colBorder} ${c.align === "right" ? "text-right" : ""}`} style={{ width: c.width }}>
          {optionalColumnValue(c.key, task)}
        </div>
      ))}
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

/** Outline for a bar on the traced path. */
const RING = "outline outline-2 outline-cyan-500";

function TaskBar({ task, timeline, dataDate, ring }: { task: Activity; timeline: Timeline; dataDate: number | null; ring: string }) {
  if (task.start === null || task.finish === null) return null;
  const title = `${task.code} ${task.name}\n${fmtDate(task.start)} → ${fmtDate(task.finish)}`;

  if (isMilestone(task)) {
    const x = timeline.x(task.type === "finish-milestone" ? task.finish : task.start);
    const color = task.critical ? "bg-red-500" : task.status === "completed" ? "bg-emerald-600" : "bg-slate-800 dark:bg-slate-200";
    return (
      <>
        <div className={`absolute size-2.5 rotate-45 ${color} ${ring}`} style={{ left: x - 5, top: (ROW_H - 10) / 2 }} title={title} />
        <BarLabel x={x + 9} flipX={x - 9} edge={timeline.width} text={task.name} />
      </>
    );
  }

  const x1 = timeline.x(task.start);
  const x2 = Math.max(timeline.x(task.finish), x1 + 3);

  if (task.type === "loe") {
    return (
      <>
        <div className={`absolute h-1.5 rounded-sm bg-teal-500 ${ring}`} style={{ left: x1, width: x2 - x1, top: (ROW_H - 6) / 2 }} title={title} />
        <BarLabel x={x2 + 6} flipX={x1 - 6} edge={timeline.width} text={task.name} />
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
      <div className={`absolute flex h-3 overflow-hidden rounded-sm ${ring}`} style={{ left: x1, width: x2 - x1, top: (ROW_H - 12) / 2 }} title={title}>
        <div className={actualColor} style={{ width: split - x1 }} />
        <div className={`${remainingColor} flex-1`} />
      </div>
      <BarLabel x={x2 + 6} flipX={x1 - 6} edge={timeline.width} text={task.name} />
    </>
  );
}

/** Rough width of a 10px label, to decide whether it fits before the chart's right edge. */
const LABEL_CHAR_W = 5.6;

/** Sits right of its bar; when that would run past the chart's edge (and clip), it moves to the left of the bar. */
function BarLabel({ x, flipX, edge, text }: { x: number; flipX: number; edge: number; text: string }) {
  const flip = x + text.length * LABEL_CHAR_W > edge && flipX - text.length * LABEL_CHAR_W >= 0;
  return (
    <span
      className="pointer-events-none absolute whitespace-nowrap text-[10px] leading-[26px] text-slate-500 dark:text-slate-400"
      style={flip ? { right: edge - flipX, top: 0 } : { left: x, top: 0 }}
    >
      {text}
    </span>
  );
}
