import { fmtDate, fmtDays } from "./format";
import type { Activity } from "./xer/model";

export type OptionalColumnKey = "percent" | "actualStart" | "actualFinish" | "freeFloat";

export interface OptionalColumn {
  key: OptionalColumnKey;
  label: string;
  /** Shown as a tooltip on the column header, since the label alone is often an abbreviation. */
  title: string;
  width: number;
  align: "left" | "right";
}

/**
 * Columns beyond the fixed five (Orig, Rem, Start, Finish, TF), switched on from the Columns menu. Shown in this
 * order regardless of the order they were turned on in. Some P6 columns (variance against a prior period, for
 * example) need baseline or Financial Periods data that plain XER exports don't carry, so they aren't offered here.
 * Activity ID and Calendar aren't offered either: their values run too long for a column to hold on one line.
 */
export const OPTIONAL_COLUMNS: OptionalColumn[] = [
  { key: "percent", label: "% Complete", title: "Percent complete", width: 64, align: "right" },
  { key: "actualStart", label: "Act. Start", title: "Actual start date, blank if it hasn't started", width: 82, align: "left" },
  { key: "actualFinish", label: "Act. Finish", title: "Actual finish date, blank if it hasn't finished", width: 82, align: "left" },
  { key: "freeFloat", label: "Free Float", title: "Free float, in days: how long this can slip before it delays its successors", width: 64, align: "right" },
];

/** What an optional column shows for one activity. WBS group rows never call this: they render the column blank. */
export function optionalColumnValue(key: OptionalColumnKey, task: Activity): string {
  switch (key) {
    case "percent":
      return `${Math.round(task.percent)}%`;
    case "actualStart":
      return fmtDate(task.actualStart);
    case "actualFinish":
      return fmtDate(task.actualFinish);
    case "freeFloat":
      return fmtDays(task.freeFloatHrs, task.dayHrs);
  }
}
