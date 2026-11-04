import { fmtDate, fmtDays } from "./format";
import type { Activity } from "./xer/model";

export type FixedColumnKey = "orig" | "rem" | "start" | "finish" | "tf";

export interface FixedColumn {
  key: FixedColumnKey;
  /** Heading in the table. */
  label: string;
  /** What the Columns menu calls it, since the heading is an abbreviation. */
  menuLabel: string;
  title: string;
  /** Pixels on screen. */
  width: number;
  align: "left" | "right";
  /** Points in the PDF. */
  pdfWidth: number;
}

/**
 * The columns that are on until switched off from the Columns menu, in table order. Only the activity itself is always
 * there. A visitor's choice is stored as the keys turned *off* (see the schedule), so a visitor from before these could be
 * hidden still sees all of them.
 */
export const FIXED_COLUMNS: FixedColumn[] = [
  { key: "orig", label: "Orig", menuLabel: "Original duration", title: "Original duration, in days", width: 52, align: "right", pdfWidth: 34 },
  { key: "rem", label: "Rem", menuLabel: "Remaining duration", title: "Remaining duration, in days", width: 52, align: "right", pdfWidth: 34 },
  { key: "start", label: "Start", menuLabel: "Start", title: "Actual start if it has one, otherwise the early (forecast) start date", width: 82, align: "left", pdfWidth: 52 },
  { key: "finish", label: "Finish", menuLabel: "Finish", title: "Actual finish if it has one, otherwise the early (forecast) finish date", width: 82, align: "left", pdfWidth: 52 },
  { key: "tf", label: "TF", menuLabel: "Total float", title: "Total float, in days: how long this can slip before it delays the project finish", width: 50, align: "right", pdfWidth: 34 },
];

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
 * Columns beyond the five that are on by default (Orig, Rem, Start, Finish, TF), switched on from the Columns menu. Shown in this
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

/** The narrowest the Activity column is allowed to be, before its content has to be cut off. */
export const MIN_TREE_W = 220;
/** Width of one character of the activity code (a 11px monospace font), in pixels. */
const CODE_CHAR_W = 6.7;
/** Room for the status dot, a change marker, the indent of a deep group and a little of the name, beside the code. */
const TREE_EXTRAS_W = 170;

/**
 * The narrowest the Activity column should be so the longest activity code is not cut off, with the name still getting a
 * little room. Codes come in very different lengths, and a long one (24 characters is not unusual) would otherwise run
 * into the next column. Capped, so one absurd code doesn't take the whole table.
 */
export function minTreeWidth(longestCode: number): number {
  return Math.max(MIN_TREE_W, Math.round(TREE_EXTRAS_W + Math.min(longestCode, 32) * CODE_CHAR_W));
}
