import { useRef, useState } from "react";
import type { IconType } from "react-icons";
import { LuCalendarArrowDown, LuListOrdered } from "react-icons/lu";
import type { WbsSort } from "../lib/scheduleRows";
import { iconToggleClass } from "./ui";
import { useDismiss } from "./useDismiss";

interface Props {
  value: WbsSort;
  onChange: (sort: WbsSort) => void;
}

const OPTIONS: Array<{ id: WbsSort; label: string; hint: string; Icon: IconType }> = [
  { id: "sequence", label: "By sequence", Icon: LuListOrdered, hint: "The project's own order, as in P6: WBS groups in the sequence they were built in" },
  { id: "date", label: "By date", Icon: LuCalendarArrowDown, hint: "WBS groups reordered by their own start date, at every level" },
];

const optionClass = (on: boolean) =>
  "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
  (on
    ? "bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300"
    : "text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800");

/**
 * Chooses how the WBS groups are ordered at every level of the tree: the project's own sequence, or by start date (see
 * `WbsSort` in scheduleRows.ts). Only the groups: the activities inside them are ordered by clicking a date column's
 * heading. An icon button, like the others in the toolbar: the icon shows the order in use, and the button is highlighted
 * while it is not the project's own sequence. Opens as a menu below it, so it always opens downward.
 */
export function WbsSortSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((o) => o.id === value)!;

  useDismiss(open, box, () => setOpen(false));

  return (
    <div ref={box} className="relative" data-help="wbs-order">
      <button
        type="button"
        className={iconToggleClass(value !== "sequence" || open)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`WBS order: ${current.label}`}
        onClick={() => setOpen((v) => !v)}
        title={`WBS order: ${current.label}. ${current.hint}. Click a date column's heading to order the activities`}
      >
        <current.Icon size={18} aria-hidden />
      </button>

      {open && (
        <div
          role="radiogroup"
          aria-label="WBS order"
          className="absolute left-0 top-full z-50 mt-1 w-max min-w-full space-y-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="px-2.5 pb-1 pt-0.5 text-[11px] text-slate-500 dark:text-slate-400">WBS groups</p>
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={value === o.id}
              className={optionClass(value === o.id)}
              title={o.hint}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              <o.Icon size={16} aria-hidden />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
