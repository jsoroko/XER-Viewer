/**
 * What the person chooses when printing to PDF, apart from what is printed: the paper, how long activity text is handled,
 * and what the bars on the chart are labelled with. Plain data, so it can be saved and tested without a page.
 */

export type PaperSize = "a4" | "a3" | "a2";

/** Landscape sizes in points (1 pt = 1/72 inch). */
export const PAPERS: Record<PaperSize, { label: string; w: number; h: number }> = {
  a4: { label: "A4", w: 841.89, h: 595.28 },
  a3: { label: "A3", w: 1190.55, h: 841.89 },
  a2: { label: "A2", w: 1683.78, h: 1190.55 },
};
export const PAPER_SIZES: readonly PaperSize[] = ["a4", "a3", "a2"];

/** "wrap": the Activity column widens to fit the names (up to a share of the page) and a longer name wraps; "one-line": a fixed column, long names cut with "...". */
export type ActivityText = "wrap" | "one-line";

/**
 * What goes beside each bar: "smart" is the whole name if it fits, else the activity ID; "name" is the name, cut with
 * "..." if there is no room; "id" is the ID; "none" is nothing.
 */
export type BarLabels = "smart" | "name" | "id" | "none";

export interface PrintLayout {
  paper: PaperSize;
  text: ActivityText;
  labels: BarLabels;
}

export const DEFAULT_LAYOUT: PrintLayout = { paper: "a3", text: "wrap", labels: "smart" };

const TEXTS: readonly ActivityText[] = ["wrap", "one-line"];
const LABELS: readonly BarLabels[] = ["smart", "name", "id", "none"];

/** Reads a saved layout of any shape: whatever is missing or wrong gets its default. */
export function parseLayout(raw: unknown): PrintLayout {
  const d = DEFAULT_LAYOUT;
  if (typeof raw !== "object" || raw === null) return { ...d };
  const o = raw as Record<string, unknown>;
  return {
    paper: PAPER_SIZES.find((p) => p === o.paper) ?? d.paper,
    text: TEXTS.find((t) => t === o.text) ?? d.text,
    labels: LABELS.find((l) => l === o.labels) ?? d.labels,
  };
}
