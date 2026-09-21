import { useCallback, useLayoutEffect, useRef, useState } from "react";

interface Options {
  count: number;
  rowHeight: number;
  overscan?: number;
}

/**
 * Fixed-row-height windowing for a scroll container. Attach `ref` to the
 * scrolling element; render rows `start` to `end` at `top = index * rowHeight`
 * inside a box that is `totalHeight` tall.
 */
export function useVirtualRows({ count, rowHeight, overscan = 6 }: Options) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ firstRow: 0, height: 0, width: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const firstRow = Math.floor(el.scrollTop / rowHeight);
      setView((v) =>
        v.firstRow === firstRow && v.height === el.clientHeight && v.width === el.clientWidth
          ? v
          : { firstRow, height: el.clientHeight, width: el.clientWidth },
      );
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [rowHeight]);

  const visibleRows = Math.ceil(view.height / rowHeight) + 1;
  const start = Math.max(0, Math.min(count, view.firstRow) - overscan);
  const end = Math.min(count, view.firstRow + visibleRows + overscan);

  const scrollToIndex = useCallback(
    (index: number, headerHeight = 0) => {
      const el = ref.current;
      if (!el) return;
      const top = index * rowHeight;
      const viewTop = el.scrollTop;
      const viewBottom = viewTop + el.clientHeight - headerHeight;
      if (top < viewTop || top + rowHeight > viewBottom) {
        el.scrollTo({ top: Math.max(0, top - (el.clientHeight - headerHeight) / 2) });
      }
    },
    [rowHeight],
  );

  return {
    ref,
    start,
    end,
    totalHeight: count * rowHeight,
    viewWidth: view.width,
    viewHeight: view.height,
    scrollToIndex,
  };
}
