import { useEffect, useRef, useState } from "react";
import { COMPARE_COLUMNS, type CompareColumnKey } from "../lib/compareColumns";
import { OPTIONAL_COLUMNS, type OptionalColumnKey } from "../lib/scheduleColumns";
import { LuColumns3 } from "react-icons/lu";
import { Switch, iconButtonClass, iconToggleClass } from "./ui";

interface Props {
  enabled: readonly string[];
  onToggle: (key: OptionalColumnKey, on: boolean) => void;
  /** While two programmes are compared: the baseline and change columns, as a second group in the menu. */
  compare?: { enabled: readonly string[]; onToggle: (key: CompareColumnKey, on: boolean) => void } | null;
}

/**
 * Turns optional table columns on and off — % Complete, actual dates, free float — beyond the fixed Orig / Rem /
 * Start / Finish / TF. An icon button, highlighted while any are on; opens as a panel below it, so it never flips
 * upward. While two programmes are compared it also offers their baseline and change columns.
 */
export function ColumnsMenu({ enabled, onToggle, compare = null }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const count = enabled.length + (compare?.enabled.length ?? 0);

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
        className={count > 0 ? iconToggleClass(true) : iconButtonClass}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        aria-label="Extra columns"
        title={
          count > 0
            ? `Extra columns (${count} shown): % Complete, actual dates, free float${compare ? ", baseline and change" : ""}`
            : `Show extra columns: % Complete, actual dates, free float${compare ? ", baseline and change" : ""}`
        }
      >
        <LuColumns3 size={18} aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Extra columns"
          className={`absolute left-0 top-full z-50 mt-1 space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${compare ? "w-48" : "w-36"}`}
        >
          {OPTIONAL_COLUMNS.map((c) => (
            <Switch key={c.key} checked={enabled.includes(c.key)} onChange={(on) => onToggle(c.key, on)} label={c.label} />
          ))}
          {compare && (
            <>
              <p className="border-t border-slate-200 pt-2 text-[11px] font-medium tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                COMPARE
              </p>
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
        </div>
      )}
    </div>
  );
}
