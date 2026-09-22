import { useEffect, useRef, useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import { buttonClass } from "./ui";

interface Props {
  /** How many levels this file's WBS actually has; the caller only renders this when it's more than 1. */
  levels: number;
  /** The level currently shown as its own rows. The deepest level shows the whole tree, the same as no limit. */
  value: number;
  onChange: (level: number) => void;
}

const optionClass = (on: boolean) =>
  "block w-full whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
  (on
    ? "bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300"
    : "text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800");

/**
 * Chooses how many WBS levels get their own row, like P6's "Group by WBS" level setting (Schedule.tsx flattens
 * everything below the chosen level into it). A menu rather than a native <select>, so it always opens downward
 * from the button — a native select lets the browser flip it upward near the bottom of the window, which this
 * doesn't.
 */
export function WbsLevelSelect({ levels, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={buttonClass}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Show WBS groups down to this level; everything below is listed directly under the deepest group shown, like P6's 'Group by WBS' level setting"
      >
        WBS level {value}
        <LuChevronDown size={14} aria-hidden />
      </button>

      {open && (
        <div
          role="radiogroup"
          aria-label="WBS grouping depth"
          className="absolute left-0 top-full z-50 mt-1 max-h-72 w-36 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {Array.from({ length: levels }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              className={optionClass(value === n)}
              onClick={() => {
                onChange(n);
                setOpen(false);
              }}
            >
              WBS level {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
