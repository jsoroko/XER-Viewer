import { useRef, useState } from "react";
import { COMPARE_COLUMNS, type CompareColumnKey } from "../lib/compareColumns";
import { FIXED_COLUMNS, OPTIONAL_COLUMNS, type FixedColumnKey, type OptionalColumnKey } from "../lib/scheduleColumns";
import { LuColumns3 } from "react-icons/lu";
import { Switch, iconButtonClass, iconToggleClass } from "./ui";
import { useDismiss } from "./useDismiss";

interface Props {
  /** Orig, Rem, Start, Finish and TF are on unless listed here. */
  hiddenFixed: readonly string[];
  onFixedToggle: (key: FixedColumnKey, on: boolean) => void;
  /** The optional columns that are on (the others are off). */
  enabled: readonly string[];
  onToggle: (key: OptionalColumnKey, on: boolean) => void;
  /** While two programmes are compared: the baseline and change columns, as a group of their own. */
  compare?: { enabled: readonly string[]; onToggle: (key: CompareColumnKey, on: boolean) => void } | null;
  /** Back to the columns that are on to begin with. */
  onReset: () => void;
}

const heading = "mb-1 text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400";

/**
 * Chooses which table columns are shown. Everything except the activity itself can be switched off: Orig, Rem, Start,
 * Finish and TF are on to begin with, % Complete, actual dates and free float are off, and while two programmes are
 * compared there is a group of baseline and change columns. An icon button, highlighted while the choice is not the
 * default; opens as a panel below it, so it never flips upward.
 */
export function ColumnsMenu({ hiddenFixed, onFixedToggle, enabled, onToggle, compare = null, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const changed = hiddenFixed.length + enabled.length + (compare?.enabled.length ?? 0);
  const customised = hiddenFixed.length > 0 || enabled.length > 0;

  useDismiss(open, box, () => setOpen(false));

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={customised ? iconToggleClass(true) : iconButtonClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        aria-label="Columns"
        title={customised ? `Columns: ${changed} changed from the default` : "Choose the columns shown"}
      >
        <LuColumns3 size={18} aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Columns"
          className="absolute left-0 top-full z-50 mt-1 flex max-h-[75vh] w-max max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {/* w-0 min-w-full: the note wraps to the menu's width instead of making the menu as wide as the sentence */}
          <p className="w-0 min-w-full text-[11px] text-slate-500 dark:text-slate-400">The activity column is always shown.</p>
          {/* Sections 12px apart, rows 4px apart: the same rhythm as the Legend panel. */}
          <div className="space-y-1">
            {FIXED_COLUMNS.map((c) => (
              <Switch
                key={c.key}
                checked={!hiddenFixed.includes(c.key)}
                onChange={(on) => onFixedToggle(c.key, on)}
                label={c.menuLabel}
                title={c.title}
              />
            ))}
          </div>
          <section>
            <h3 className={heading}>MORE</h3>
            <div className="space-y-1">
              {OPTIONAL_COLUMNS.map((c) => (
                <Switch key={c.key} checked={enabled.includes(c.key)} onChange={(on) => onToggle(c.key, on)} label={c.label} title={c.title} />
              ))}
            </div>
          </section>
          {compare && (
            <section>
              <h3 className={heading}>COMPARE</h3>
              <div className="space-y-1">
                {COMPARE_COLUMNS.map((c) => (
                  <Switch
                    key={c.key}
                    checked={compare.enabled.includes(c.key)}
                    onChange={(on) => compare.onToggle(c.key, on)}
                    label={c.label.replace("Base ", "Baseline ")}
                    title={c.title}
                  />
                ))}
              </div>
            </section>
          )}
          <button
            type="button"
            onClick={onReset}
            className="w-full border-t border-slate-200 pt-3 text-left text-xs text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:border-slate-700 dark:text-accent-400"
          >
            Reset to default columns
          </button>
        </div>
      )}
    </div>
  );
}
