import { useEffect, useRef, type PointerEvent } from "react";
import { lockTextSelection } from "../lib/dragSelect";
import { usePersistedNumber } from "../state/usePersistedNumber";

/** h-72, the bottom panel's original fixed height, kept as the default so existing visitors see no change. */
export const DEFAULT_PANEL_H = 288;
const MIN_PANEL_H = 160;

/**
 * The height of a panel along the bottom of the Schedule, and the pointer handlers for the thin strip on its top edge that
 * resizes it. The height is remembered across visits (and shared by the activity details and the trace, which take turns).
 */
export function useHeightResize() {
  const [height, setHeight] = usePersistedNumber("xerview-detail-height", DEFAULT_PANEL_H);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const unlockSelection = useRef<(() => void) | null>(null);
  // If the panel goes away in the middle of a drag, text selection must not stay switched off.
  useEffect(() => () => unlockSelection.current?.(), []);

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
      const max = Math.max(MIN_PANEL_H, window.innerHeight * 0.7);
      // Dragging the top edge up should grow the panel, so the delta is start Y minus current Y, not the other way round.
      setHeight(Math.round(Math.min(max, Math.max(MIN_PANEL_H, drag.current.h + (drag.current.y - e.clientY)))));
    },
    onPointerUp: () => {
      drag.current = null;
      unlockSelection.current?.();
      unlockSelection.current = null;
    },
  };
  return { height, separator: { ...separator, onPointerCancel: separator.onPointerUp } };
}
