import { useEffect, useRef, useState } from "react";
import { LuListTree } from "react-icons/lu";
import { iconToggleClass } from "./ui";

interface Props {
  /** How many levels this file's WBS actually has; the caller only renders this when it's more than 1. */
  levels: number;
  /** The level currently shown as its own rows (0 = no groups, just activities). The deepest level shows the whole tree, the same as no limit. */
  value: number;
  onChange: (level: number) => void;
}

const optionClass = (on: boolean) =>
  "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
  (on
    ? "bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300"
    : "text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800");

/** A row of small bars, as many filled as levels shown: a picture of how deep that choice goes. */
function Depth({ shown, of }: { shown: number; of: number }) {
  return (
    <span className="flex shrink-0 gap-0.5" aria-hidden>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={`h-2 w-1 rounded-[1px] bg-current ${i < shown ? "" : "opacity-25"}`} />
      ))}
    </span>
  );
}

const describe = (value: number, levels: number) => (value === 0 ? "No groups" : `WBS level ${value}${value >= levels ? " (all levels)" : ""}`);

/**
 * Chooses how many WBS levels get their own row, like P6's "Group by WBS" level setting (Schedule.tsx flattens
 * everything below the chosen level into it). An icon button, like the others in the toolbar: the level is on a badge in
 * its corner, and the button is highlighted while it is not the deepest level (the default, the whole tree). A menu
 * rather than a native <select>, so it always opens downward from the button — a native select lets the browser flip it
 * upward near the bottom of the window, which this doesn't. The menu is as wide as its longest entry.
 */
export function WbsLevelSelect({ levels, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const custom = value < levels;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const choose = (n: number) => {
    onChange(n);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={`${iconToggleClass(custom || open)} relative`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={describe(value, levels)}
        onClick={() => setOpen((v) => !v)}
        title={`${describe(value, levels)}. Show WBS groups down to this level; everything below is listed directly under the deepest group shown, like P6's 'Group by WBS' level setting`}
      >
        <LuListTree size={18} aria-hidden />
        <span
          className={
            "pointer-events-none absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-4 " +
            (custom
              ? "bg-accent-600 text-white"
              : "border border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300")
          }
          aria-hidden
        >
          {value}
        </span>
      </button>

      {open && (
        <div
          role="radiogroup"
          aria-label="WBS grouping depth"
          className="absolute left-0 top-full z-50 mt-1 max-h-72 w-max overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="px-2 pb-1 pt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Show WBS groups down to</p>
          {Array.from({ length: levels }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} className={optionClass(value === n)} onClick={() => choose(n)}>
              <Depth shown={n} of={levels} />
              Level {n}
              {n === levels ? " (all)" : ""}
            </button>
          ))}
          <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
          <button type="button" role="radio" aria-checked={value === 0} className={optionClass(value === 0)} onClick={() => choose(0)}>
            <Depth shown={0} of={levels} />
            No groups
          </button>
        </div>
      )}
    </div>
  );
}
