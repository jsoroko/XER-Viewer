import { useEffect, useRef, useState } from "react";
import { DATE_MODE_LABEL, describeDateRange, type DateMode } from "../lib/scheduleRows";
import { buttonClass, inputClass, toggleClass } from "./ui";

/** Matches the panel's w-72 (18rem). */
const PANEL_WIDTH = 288;

const MODES = Object.entries(DATE_MODE_LABEL).map(([id, label]) => ({ id: id as DateMode, label }));
interface Props {
  from: string;
  to: string;
  mode: DateMode;
  /** From is after To, so the range is being ignored. */
  invalid: boolean;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onMode: (m: DateMode) => void;
  onClear: () => void;
}

const icon = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

/** A button that shows the current date range and opens a small panel to change it. */
export function DateRangeChip({ from, to, mode, invalid, onFrom, onTo, onMode, onClear }: Props) {
  const [open, setOpen] = useState(false);
  // Open the panel towards the left when the chip is too close to the window's right edge for it to fit.
  const [alignRight, setAlignRight] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const isSet = Boolean(from || to);

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

  const fieldClass = `${inputClass} w-full ${invalid ? "border-red-500 focus:border-red-500 focus:ring-red-500/30" : ""}`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          const left = box.current?.getBoundingClientRect().left ?? 0;
          setAlignRight(left + PANEL_WIDTH + 8 > window.innerWidth);
          setOpen((v) => !v);
        }}
        title="Show only activities in a date range"
        className={`${toggleClass(open || isSet)} max-w-64 gap-1.5 ${invalid ? "!border-red-500 !text-red-700 dark:!text-red-300" : ""}`}
      >
        <svg {...icon}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
        <span className="truncate">{invalid ? "From is after To" : describeDateRange(from, to)}</span>
        <svg {...icon}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Date range"
          className={`absolute top-full z-50 mt-1 w-72 space-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${alignRight ? "right-0" : "left-0"}`}
        >
          <label className="block text-xs text-slate-600 dark:text-slate-400">
            From
            <input
              type="date"
              className={`${fieldClass} mt-1`}
              value={from}
              max={to || undefined}
              aria-invalid={invalid || undefined}
              onChange={(e) => onFrom(e.target.value)}
            />
          </label>
          <label className="block text-xs text-slate-600 dark:text-slate-400">
            To
            <input
              type="date"
              className={`${fieldClass} mt-1`}
              value={to}
              min={from || undefined}
              aria-invalid={invalid || undefined}
              onChange={(e) => onTo(e.target.value)}
            />
          </label>
          <label className="block text-xs text-slate-600 dark:text-slate-400">
            Show activities that are
            <select
              aria-label="Date filter mode"
              className={`${inputClass} mt-1 w-full`}
              value={mode}
              disabled={!isSet}
              onChange={(e) => onMode(e.target.value as DateMode)}
            >
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {invalid && (
            <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
              “From” is after “To”, so the date filter is being ignored.
            </p>
          )}
          <div className="flex justify-between gap-2">
            <button type="button" className={buttonClass} onClick={onClear} disabled={!isSet}>
              Clear dates
            </button>
            <button type="button" className={buttonClass} onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
