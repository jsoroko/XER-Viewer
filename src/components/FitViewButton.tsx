import { useEffect, useRef, useState } from "react";
import { LuMaximize } from "react-icons/lu";
import { iconButtonClass } from "./ui";
import { useDismiss } from "./useDismiss";

interface Props {
  /** A date range is selected, so there is something other than the whole project to fit to. */
  hasRange: boolean;
  /** The rows on screen cover a different period from the whole project, so that period can be fitted too. */
  hasRows: boolean;
  /** The activities on screen cover a narrower period than the rows do (the group rows above them reach further). */
  hasActivities: boolean;
  /** The chart is currently fitted to the whole project. */
  fitted: boolean;
  onFitProject: () => void;
  onFitDates: () => void;
  onFitRows: () => void;
  onFitActivities: () => void;
}

const itemClass =
  "block w-full whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
  "hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800";

/**
 * "Fit View". Normally a plain button that fits the whole project. When a date range is selected, or the rows shown
 * (after a search, filter or trace) cover less than the project, it opens a small menu of the choices: the project's
 * duration, the selected dates, or the visible rows (groups included), or just the visible activities.
 */
export function FitViewButton({ hasRange, hasRows, hasActivities, fitted, onFitProject, onFitDates, onFitRows, onFitActivities }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menu = hasRange || hasRows || hasActivities;
  const shown = open && menu; // clearing the dates or the filter closes the menu

  useDismiss(shown, box, () => setOpen(false));
  useEffect(() => {
    if (shown) box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [shown]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  if (!menu) {
    return (
      <button
        type="button"
        className={iconButtonClass}
        onClick={onFitProject}
        aria-pressed={fitted}
        aria-label="Fit view"
        title="Fit View: fit the whole project in the window"
      >
        <LuMaximize size={18} aria-hidden />
      </button>
    );
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={iconButtonClass}
        aria-label="Fit view"
        aria-haspopup="menu"
        aria-expanded={shown}
        onClick={() => setOpen((v) => !v)}
        title="Fit View: fit the chart to the whole project, the selected dates or the rows shown"
      >
        <LuMaximize size={18} aria-hidden />
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
          {hasRange && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => choose(onFitDates)}>
              Selected Dates
            </button>
          )}
          {hasRows && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => choose(onFitRows)}>
              Visible Rows
            </button>
          )}
          {hasActivities && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => choose(onFitActivities)}>
              Visible Activities
            </button>
          )}
        </div>
      )}
    </div>
  );
}
