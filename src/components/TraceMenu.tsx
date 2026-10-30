import { useEffect, useRef, useState } from "react";
import { LuChevronDown, LuRoute } from "react-icons/lu";
import { buttonClass, toggleClass } from "./ui";

export type TraceChoice = "backward" | "forward" | "combined" | "between";

interface Props {
  /** No activity is selected, so there is nothing to trace from. */
  disabled: boolean;
  /** A trace is showing; the button stays highlighted. */
  active: boolean;
  onPick: (choice: TraceChoice) => void;
}

const OPTIONS: Array<{ id: TraceChoice; label: string; hint: string }> = [
  { id: "backward", label: "Backward", hint: "What drives the selected activity: its driving predecessors, and theirs, back to where the chain starts" },
  { id: "forward", label: "Forward", hint: "What the selected activity drives: its driving successors, and theirs, out to where the chain ends" },
  { id: "combined", label: "Combined", hint: "Both: the whole driving chain through the selected activity" },
  { id: "between", label: "Between two…", hint: "Pick a second activity: shows the driving chain between them, or the closest route if neither drives the other" },
];

const optionClass =
  "block w-full whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:text-slate-100 dark:hover:bg-slate-800";

/**
 * Starts a driving-logic trace from the selected activity (see lib/drivingPath.ts). Opens as a menu below the
 * button, like the other toolbar menus, so it always opens downward.
 */
export function TraceMenu({ disabled, active, onPick }: Props) {
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
        className={`${active ? toggleClass(true) : buttonClass} gap-1.5`}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={disabled ? "Select an activity first, then trace the logic that drives it" : "Trace the driving logic around the selected activity"}
      >
        <LuRoute size={14} aria-hidden />
        Trace
        <LuChevronDown size={14} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Trace driving logic"
          className="absolute left-0 top-full z-50 mt-1 w-40 space-y-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitem"
              className={optionClass}
              title={o.hint}
              onClick={() => {
                onPick(o.id);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
