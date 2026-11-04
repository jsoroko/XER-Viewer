import type { ChangeKind } from "../lib/compare";

/** The three kinds of change that get a colour; unchanged activities are left as they are. */
export type MarkedKind = Exclude<ChangeKind, "unchanged">;

export const CHANGE_WORD: Record<MarkedKind, string> = { added: "New", removed: "Removed", modified: "Modified" };
export const CHANGE_MARK: Record<MarkedKind, string> = { added: "+", removed: "−", modified: "~" };

/** Row background, behind the table and the chart. */
export const CHANGE_TINT: Record<MarkedKind, string> = {
  added: "bg-green-50 dark:bg-green-950/40",
  removed: "bg-red-50 dark:bg-red-950/40",
  modified: "bg-amber-50 dark:bg-amber-950/40",
};

/** The solid square at the start of the row, and the same colour for a legend swatch. */
export const CHANGE_SOLID: Record<MarkedKind, string> = {
  added: "bg-green-600 text-white",
  removed: "bg-red-600 text-white",
  modified: "bg-amber-500 text-slate-900",
};

/** Text colour for a value that changed. */
export const CHANGE_TEXT: Record<MarkedKind, string> = {
  added: "text-green-700 dark:text-green-400",
  removed: "text-red-700 dark:text-red-400",
  modified: "text-amber-700 dark:text-amber-400",
};

/** A bar's fill by kind of change. A removed activity has no fill: it is drawn as a dashed outline. */
export const CHANGE_BAR: Record<ChangeKind, string> = {
  added: "bg-green-500",
  modified: "bg-amber-500",
  unchanged: "bg-slate-400 dark:bg-slate-500",
  removed: "",
};

/** A change chip in the strip under the toolbar, switched on or off. */
export const CHIP_ON: Record<MarkedKind, string> = {
  added: "border-green-600/60 bg-green-100 text-green-800 dark:border-green-500/60 dark:bg-green-950 dark:text-green-300",
  removed: "border-red-600/60 bg-red-100 text-red-800 dark:border-red-500/60 dark:bg-red-950 dark:text-red-300",
  modified: "border-amber-600/60 bg-amber-100 text-amber-900 dark:border-amber-500/60 dark:bg-amber-950 dark:text-amber-300",
};
