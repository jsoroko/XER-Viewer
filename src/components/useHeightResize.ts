import { useEffect, useRef, type PointerEvent } from "react";
import { lockTextSelection } from "../lib/dragSelect";
import { clampPanelHeight, fitPanelHeight } from "../lib/panelHeight";
import { useDetailsHeight } from "../state/useDetailsPanel";

export { DEFAULT_PANEL_H } from "../lib/panelHeight";

/**
 * The height of a panel along the bottom of the Schedule, the pointer handlers for the thin strip on its top edge that
 * resizes it, and `fit`, which makes the panel just as tall as the content it is showing. The height is one value for the
 * whole Schedule, remembered across visits: the same for every activity and shared by the details and the trace.
 */
export function useHeightResize() {
  const [height, setHeight] = useDetailsHeight();
  const drag = useRef<{ y: number; h: number } | null>(null);
  const unlockSelection = useRef<(() => void) | null>(null);
  // If the panel goes away in the middle of a drag, text selection must not stay switched off.
  useEffect(() => () => unlockSelection.current?.(), []);

  /**
   * Sets the height to what the shown content needs: the panel's own height less the height of the scrolling part, plus
   * the height of what that part holds (its children and padding, not its scrollHeight, which is never less than the part's
   * own height and so could not make a panel smaller). The height stays that way as other activities are selected.
   */
  const fit = (panel: HTMLElement | null) => {
    const scroller = panel?.querySelector<HTMLElement>("[role=tabpanel]:not([hidden]) .overflow-auto") ?? panel?.querySelector<HTMLElement>(":scope > .overflow-auto");
    if (!panel || !scroller) return;
    const style = getComputedStyle(scroller);
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const content = Array.from(scroller.children).reduce((n, c) => n + c.getBoundingClientRect().height, padding);
    const next = fitPanelHeight(panel.offsetHeight, scroller.clientHeight, content, window.innerHeight);
    if (next !== null) setHeight(next);
  };

  const separator = {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault(); // otherwise the press starts a text selection that the drag then extends
      e.currentTarget.setPointerCapture(e.pointerId);
      // From the height the panel really has (a panel that is only as tall as its content is shorter than the stored height),
      // so the edge follows the pointer from the first pixel.
      const actual = e.currentTarget.parentElement?.getBoundingClientRect().height ?? height;
      drag.current = { y: e.clientY, h: actual };
      unlockSelection.current ??= lockTextSelection();
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      // Dragging the top edge up should grow the panel, so the delta is start Y minus current Y, not the other way round.
      setHeight(clampPanelHeight(drag.current.h + (drag.current.y - e.clientY), window.innerHeight));
    },
    onPointerUp: () => {
      drag.current = null;
      unlockSelection.current?.();
      unlockSelection.current = null;
    },
  };
  return { height, fit, separator: { ...separator, onPointerCancel: separator.onPointerUp } };
}
