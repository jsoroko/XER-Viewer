import type { RefObject } from "react";
import { SHORTCUTS, matches, modalOpen } from "../lib/shortcuts";
import { useWindowKeys } from "./useWindowKeys";

/**
 * Makes ⌘F (Mac) or Ctrl+F (Windows, Linux) put the cursor in a search box instead of opening the browser's own find bar,
 * which can only see the few rows that are drawn on screen. The first box in `inputs` that is on screen is used, and its text
 * is selected so typing replaces the last search. Every view stays mounted when it is not shown, so a view that is hidden
 * must not take the key, and neither must anything behind an open modal dialog.
 */
export function useFindShortcut(...inputs: RefObject<HTMLInputElement | null>[]) {
  useWindowKeys(null, (e) => {
    if (!matches(e, SHORTCUTS.find) || modalOpen()) return;
    // A hidden view (display: none) has no offsetParent; one that is not drawn at all has no ref.
    const target = inputs.map((r) => r.current).find((el) => el && el.offsetParent !== null);
    if (!target) return; // nothing to search here: leave the browser's find alone
    e.preventDefault();
    target.focus();
    target.select();
  });
}
