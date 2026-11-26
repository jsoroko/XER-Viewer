import type { CSSProperties, HTMLAttributes } from "react";
import { LuGripHorizontal, LuGripVertical, LuX } from "react-icons/lu";

/** The pointer handlers a drag needs; the caller owns what they do. */
type DragHandlers = Pick<HTMLAttributes<HTMLDivElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel">;

interface Props extends DragHandlers {
  /** "vertical" is a divider between side-by-side panes (dragged left and right); "horizontal" is the top edge of a panel. */
  orientation: "vertical" | "horizontal";
  /** What is being resized, said to screen readers. */
  label: string;
  /**
   * Vertical only: where the divider is. The strip is absolutely positioned inside a zero-size, sticky parent, and the
   * caller gives its `left` and its `height`, so it can run the whole height of what is on screen.
   */
  style?: CSSProperties;
  /** Vertical only: how far down the grip tab sits, so it can be centred on a header. */
  tabTop?: number;
  /** A one-time pointer to the handle: pulses the tab and shows this text until `onDismissTip` is called. */
  tip?: string;
  onDismissTip?: () => void;
}

/**
 * A resize handle that can be found without hovering: a small outlined tab with a grip sits on the divider all the time,
 * the grab zone around it is wide, and the zone is tinted grey, like a button hover, while the pointer is on it. While
 * `tip` is given the tab also pulses and a short note beside it says what to do, so a first-time visitor is told once.
 */
export function ResizeGrip({ orientation, label, style, tabTop = 6, tip, onDismissTip, ...drag }: Props) {
  const vertical = orientation === "vertical";
  const separator = (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      {...drag}
      style={vertical ? { paddingTop: tabTop } : undefined}
      className={`group flex touch-none justify-center hover:bg-slate-900/5 dark:hover:bg-white/10 ${
        vertical ? "h-full w-full cursor-col-resize items-start" : "absolute inset-x-0 top-0 z-10 h-3 -translate-y-1/2 cursor-row-resize items-center"
      }`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute bg-transparent group-hover:bg-slate-400 dark:group-hover:bg-slate-500 ${vertical ? "inset-y-0 left-1/2 w-px -translate-x-1/2" : "inset-x-0 top-1/2 h-px -translate-y-1/2"}`}
      />
      {tip && <span aria-hidden className={`pointer-events-none absolute animate-ping rounded bg-accent-500/50 motion-reduce:animate-none ${vertical ? "h-[22px] w-[11px]" : "h-[11px] w-[28px]"}`} />}
      <span
        aria-hidden
        className={`pointer-events-none relative flex shrink-0 items-center justify-center rounded border border-slate-400 bg-white text-slate-500 group-hover:border-slate-500 group-hover:text-slate-700 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:border-slate-300 dark:group-hover:text-slate-100 ${vertical ? "h-[22px] w-[11px]" : "h-[11px] w-[28px]"}`}
      >
        {vertical ? <LuGripVertical size={11} strokeWidth={2} /> : <LuGripHorizontal size={11} strokeWidth={2} />}
      </span>
    </div>
  );
  if (!vertical) return separator;
  return (
    <div className="absolute top-0 w-3" style={style}>
      {separator}
      {tip && (
        <div
          role="note"
          className="absolute left-full top-[52px] ml-3 flex w-52 items-start gap-2 rounded-lg bg-accent-600 px-3 py-2 text-xs leading-snug text-white shadow-lg before:absolute before:-top-1 before:left-2 before:size-2 before:rotate-45 before:bg-accent-600"
        >
          <span className="flex-1">{tip}</span>
          <button
            type="button"
            onClick={onDismissTip}
            aria-label="Dismiss tip"
            className="-mr-1 rounded p-0.5 text-white/80 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <LuX size={12} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
