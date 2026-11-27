import { useEffect, useRef, type RefObject } from "react";

/**
 * Calls `handler` for every key pressed anywhere in the page, unless something else has already dealt with the key
 * (`defaultPrevented`) or `root` is not on screen. Every view stays mounted while another is showing, so a hidden view
 * (display: none, which leaves it with no offsetParent) must not answer keys meant for the one in front.
 * The latest `handler` is always the one called, without re-subscribing on every render.
 */
export function useWindowKeys(root: RefObject<HTMLElement | null> | null, handler: (e: KeyboardEvent) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (root && (!root.current || root.current.offsetParent === null)) return;
      latest.current(e);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [root]);
}
