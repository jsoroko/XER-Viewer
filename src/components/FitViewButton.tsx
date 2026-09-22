import { useEffect, useRef, useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import { buttonClass } from "./ui";

interface Props {
  /** A date range is selected, so there is something other than the whole project to fit to. */
  hasRange: boolean;
  /** The chart is currently fitted to the whole project. */
  fitted: boolean;
  onFitProject: () => void;
  onFitDates: () => void;
}

const itemClass =
  "block w-full whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
  "hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800";

/**
 * "Fit View". With no date range selected it is a plain button that fits the whole project. Once a range is selected
 * it opens a small menu with the two choices: the project's duration, or the selected dates.
 */
export function FitViewButton({ hasRange, fitted, onFitProject, onFitDates }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const shown = open && hasRange; // clearing the dates closes the menu

  useEffect(() => {
    if (!shown) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [shown]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  if (!hasRange) {
    return (
      <button type="button" className={buttonClass} onClick={onFitProject} aria-pressed={fitted} title="Fit the whole project in the window">
        Fit View
      </button>
    );
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={buttonClass}
        aria-haspopup="menu"
        aria-expanded={shown}
        onClick={() => setOpen((v) => !v)}
        title="Fit the chart to the whole project or to the selected dates"
      >
        Fit View
        <LuChevronDown size={14} aria-hidden />
      </button>

      {shown && (
        <div
          role="menu"
          aria-label="Fit view"
          className="absolute right-0 top-full z-50 mt-1 min-w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <button type="button" role="menuitem" className={itemClass} onClick={() => choose(onFitProject)}>
            Project Duration
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => choose(onFitDates)}>
            Selected Dates
          </button>
        </div>
      )}
    </div>
  );
}
