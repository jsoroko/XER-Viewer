import { useEffect, type RefObject } from "react";

/**
 * Closes a menu or popover while `open`: on a press anywhere outside `box`, or on Escape. Every dropdown in the toolbar
 * works this way, so they share this instead of each carrying its own copy.
 */
export function useDismiss(open: boolean, box: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
    // `close` is a setState call in every caller; it is deliberately not a dependency so a new arrow each render doesn't re-subscribe.
  }, [open, box]);
}
