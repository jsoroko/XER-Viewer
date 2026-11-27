/** h-72, the bottom panel's original fixed height, kept as the default so existing visitors see no change. */
export const DEFAULT_PANEL_H = 288;
export const MIN_PANEL_H = 100;
/** The share of the window the bottom panel may take. */
const MAX_SHARE = 0.7;

/** The tallest the bottom panel may be in a window this high. */
export const maxPanelHeight = (viewportH: number) => Math.max(MIN_PANEL_H, viewportH * MAX_SHARE);

/** A whole number of pixels between the smallest and the largest height the panel may have. */
export const clampPanelHeight = (h: number, viewportH: number) => Math.round(Math.min(maxPanelHeight(viewportH), Math.max(MIN_PANEL_H, h)));

/**
 * The height that makes a panel just fit its content: whatever is around the scrolling part (tabs, headings, borders)
 * plus the height of what that part holds, within the limits above. Null when there is nothing to measure.
 */
export function fitPanelHeight(panelH: number, scrollerClientH: number, contentH: number, viewportH: number): number | null {
  if (![panelH, scrollerClientH, contentH].every((n) => Number.isFinite(n) && n > 0)) return null;
  return clampPanelHeight(panelH - scrollerClientH + contentH, viewportH);
}
