/**
 * What the legend explains, which depends on what is on the chart: the lines and shading only when they are drawn, the
 * trace only while one is showing, and bars coloured by kind of change instead of progress while two programmes are
 * compared. Grouped so a long list stays readable. The look of each entry (its swatch) is the component's business.
 */
export type LegendKey =
  | "complete"
  | "actual"
  | "remaining"
  | "critical"
  | "new"
  | "modified"
  | "removed"
  | "unchanged"
  | "baseline"
  | "loe"
  | "wbs"
  | "milestone"
  | "dataDate"
  | "today"
  | "nonWorking"
  | "predecessor"
  | "successor"
  | "tracedPath"
  | "droppedPath"
  | "markNew"
  | "markRemoved"
  | "markModified";

export interface LegendEntry {
  key: LegendKey;
  label: string;
}
export interface LegendGroup {
  title: string;
  entries: LegendEntry[];
}

export interface LegendState {
  /** The line for today is on screen. */
  today: boolean;
  /** Non-working time is shaded on screen. */
  nonWorking: boolean;
  /** Links is on, so predecessors and successors are drawn for the selected activity. */
  links: boolean;
  /** A driving-logic trace is showing. */
  trace: boolean;
  /** A compared trace has steps that dropped off the baseline's path, and they are shown. */
  droppedPath: boolean;
  /** Two programmes are being compared; `baseline` is whether the baseline bars are drawn. */
  compare: { baseline: boolean } | null;
}

export function buildLegend(s: LegendState): LegendGroup[] {
  const groups: LegendGroup[] = [];
  if (s.compare) {
    const bars: LegendEntry[] = [
      { key: "new", label: "New" },
      { key: "modified", label: "Modified" },
      { key: "removed", label: "Removed" },
      { key: "unchanged", label: "Unchanged" },
    ];
    if (s.compare.baseline) bars.push({ key: "baseline", label: "Baseline" });
    groups.push({ title: "Compared with the baseline", entries: bars });
    groups.push({
      title: "Row markers",
      entries: [
        { key: "markNew", label: "New activity" },
        { key: "markRemoved", label: "Removed activity" },
        { key: "markModified", label: "Modified activity" },
      ],
    });
  } else {
    groups.push({
      title: "Progress",
      entries: [
        { key: "complete", label: "Complete" },
        { key: "actual", label: "Actual" },
        { key: "remaining", label: "Remaining" },
        { key: "critical", label: "Critical" },
      ],
    });
  }
  groups.push({
    title: "Other bars",
    entries: [
      { key: "loe", label: "Level of effort" },
      { key: "wbs", label: "WBS group" },
      { key: "milestone", label: "Milestone" },
    ],
  });
  const lines: LegendEntry[] = [{ key: "dataDate", label: "Data date" }];
  if (s.today) lines.push({ key: "today", label: "Today" });
  if (s.nonWorking) lines.push({ key: "nonWorking", label: "Non-working" });
  if (s.links) lines.push({ key: "predecessor", label: "Predecessor" }, { key: "successor", label: "Successor" });
  groups.push({ title: "Lines and shading", entries: lines });
  if (s.trace || s.droppedPath) {
    const trace: LegendEntry[] = [];
    if (s.trace) trace.push({ key: "tracedPath", label: "Traced path" });
    if (s.droppedPath) trace.push({ key: "droppedPath", label: "Dropped off the path" });
    groups.push({ title: "Trace", entries: trace });
  }
  return groups;
}
