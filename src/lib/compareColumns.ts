import { fmtShift, type ActivityChange } from "./compare";
import { fmtDate, fmtDays } from "./format";
import type { Activity } from "./xer/model";

/**
 * Table columns that exist only while two programmes are compared: the baseline's dates and duration, and how far each
 * has moved. Switched on from the Extra columns menu, like the other optional columns.
 *
 * The change in a date is in calendar days, the same unit as the `+14d` on the bars. The change in duration is in the
 * activity's own working days, the same unit as the Orig column it relates to.
 */
export type CompareColumnKey = "baseStart" | "baseFinish" | "baseDur" | "dStart" | "dFinish" | "dDur";

export interface CompareColumn {
  key: CompareColumnKey;
  label: string;
  /** Tooltip on the column header. */
  title: string;
  /** Pixels on screen. */
  width: number;
  /** The shorter label and width in points used in the PDF, where there is no tooltip. */
  pdf: { label: string; w: number };
}

export const COMPARE_COLUMNS: CompareColumn[] = [
  { key: "baseStart", label: "Base Start", title: "Start date in the baseline (the older programme)", width: 82, pdf: { label: "Base Start", w: 52 } },
  { key: "baseFinish", label: "Base Finish", title: "Finish date in the baseline (the older programme)", width: 82, pdf: { label: "Base Finish", w: 52 } },
  { key: "baseDur", label: "Base Dur", title: "Original duration in the baseline, in days", width: 62, pdf: { label: "Base Dur", w: 38 } },
  { key: "dStart", label: "Δ Start", title: "How many calendar days the start moved since the baseline", width: 66, pdf: { label: "Chg Start", w: 40 } },
  { key: "dFinish", label: "Δ Finish", title: "How many calendar days the finish moved since the baseline", width: 70, pdf: { label: "Chg Finish", w: 42 } },
  { key: "dDur", label: "Δ Dur", title: "Change in original duration since the baseline, in days", width: 62, pdf: { label: "Chg Dur", w: 38 } },
];

/** What is on the first time a comparison is shown. */
export const DEFAULT_COMPARE_COLUMNS: CompareColumnKey[] = ["baseStart", "baseFinish", "dFinish"];

export interface CompareCell {
  text: string;
  /** For colouring: a later date or longer duration, an earlier or shorter one, or a new or removed activity. */
  tone: "later" | "earlier" | "new" | "removed" | null;
}

const BLANK: CompareCell = { text: "", tone: null };
const NONE: CompareCell = { text: "–", tone: null };

const DAY = 86_400_000;

function moved(days: number): CompareCell {
  return days === 0 ? NONE : { text: fmtShift(days), tone: days > 0 ? "later" : "earlier" };
}

/** What a compare column shows for one activity; blank for anything without a baseline to compare with. */
export function compareColumnCell(key: CompareColumnKey, task: Activity, change: ActivityChange | null): CompareCell {
  if (!change) return BLANK;
  const before = change.before;
  switch (key) {
    case "baseStart":
      return before ? { text: fmtDate(before.start), tone: null } : BLANK;
    case "baseFinish":
      return before ? { text: fmtDate(before.finish), tone: null } : BLANK;
    case "baseDur":
      return before ? { text: fmtDays(before.origDurHrs, before.dayHrs), tone: null } : BLANK;
    case "dStart":
    case "dFinish": {
      if (change.kind === "added") return { text: "new", tone: "new" };
      if (change.kind === "removed") return { text: "removed", tone: "removed" };
      const was = key === "dStart" ? before?.start : before?.finish;
      const now = key === "dStart" ? task.start : task.finish;
      if (was === null || was === undefined || now === null) return BLANK;
      return moved(Math.round((now - was) / DAY));
    }
    case "dDur": {
      if (!before || change.kind === "added" || change.kind === "removed" || before.origDurHrs === null || task.origDurHrs === null) return BLANK;
      const d = Math.round((task.origDurHrs / (task.dayHrs || 8) - before.origDurHrs / (before.dayHrs || 8)) * 10) / 10;
      return d === 0 ? NONE : { text: `${d > 0 ? "+" : "−"}${Math.abs(d)}d`, tone: d > 0 ? "later" : "earlier" };
    }
  }
}
