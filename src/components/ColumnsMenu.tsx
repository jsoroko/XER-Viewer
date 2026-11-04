import { useEffect, useRef, useState } from "react";
import { COMPARE_COLUMNS, type CompareColumnKey } from "../lib/compareColumns";
import { FIXED_COLUMNS, OPTIONAL_COLUMNS, type FixedColumnKey, type OptionalColumnKey } from "../lib/scheduleColumns";
import { LuColumns3 } from "react-icons/lu";
import { Switch, iconButtonClass, iconToggleClass } from "./ui";

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

const heading = "border-t border-slate-200 pt-2 text-[11px] font-medium tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400";

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
          className="absolute left-0 top-full z-50 mt-1 max-h-[75vh] w-52 space-y-1.5 overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="text-[11px] text-slate-500 dark:text-slate-400">The activity column is always shown.</p>
          {FIXED_COLUMNS.map((c) => (
            <Switch
              key={c.key}
              checked={!hiddenFixed.includes(c.key)}
              onChange={(on) => onFixedToggle(c.key, on)}
              label={c.menuLabel}
              title={c.title}
            />
          ))}
          <div className={heading}>MORE</div>
          {OPTIONAL_COLUMNS.map((c) => (
            <Switch key={c.key} checked={enabled.includes(c.key)} onChange={(on) => onToggle(c.key, on)} label={c.label} title={c.title} />
          ))}
          {compare && (
            <>
              <div className={heading}>COMPARE</div>
              {COMPARE_COLUMNS.map((c) => (
                <Switch
                  key={c.key}
                  checked={compare.enabled.includes(c.key)}
                  onChange={(on) => compare.onToggle(c.key, on)}
                  label={c.label.replace("Base ", "Baseline ")}
                  title={c.title}
                />
              ))}
            </>
          )}
          <button
            type="button"
            onClick={onReset}
            className="mt-1 w-full border-t border-slate-200 pt-2 text-left text-xs text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:border-slate-700 dark:text-accent-400"
          >
            Reset to default columns
          </button>
        </div>
      )}
    </div>
  );
}
