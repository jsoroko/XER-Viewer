import { useEffect, useRef, useState } from "react";
import type { ActivitySort } from "../lib/scheduleRows";
import type { IconType } from "react-icons";
import { LuArrowDownAZ, LuCalendarArrowDown } from "react-icons/lu";
import { iconToggleClass } from "./ui";

interface Props {
  value: ActivitySort;
  onChange: (sort: ActivitySort) => void;
}

const OPTIONS: Array<{ id: ActivitySort; label: string; hint: string; Icon: IconType }> = [
  { id: "code", label: "By code", Icon: LuArrowDownAZ, hint: "The file's own order: WBS groups as arranged in the project, activities by activity code" },
  { id: "date", label: "By date", Icon: LuCalendarArrowDown, hint: "Every level reordered by its own start date instead — WBS groups and activities alike, all the way down" },
];

const optionClass = (on: boolean) =>
  "flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
  (on
    ? "bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300"
    : "text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800");

/**
 * Chooses how siblings are ordered at every level of the WBS tree — the file's own order, or every level
 * reordered by its own start date (see `ActivitySort` in scheduleRows.ts). An icon button, like the others in the
 * toolbar: the icon shows the order in use (A to Z for code, a calendar for date), and the button is highlighted
 * while it is not the file's own order. Opens as a menu below it, so it always opens downward.
 */
export function ActivitySortSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = OPTIONS.find((o) => o.id === value)!;

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
        className={iconToggleClass(value !== "code" || open)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Sort order: ${current.label}`}
        onClick={() => setOpen((v) => !v)}
        title={`Sort order: ${current.label}. ${current.hint}`}
      >
        <current.Icon size={18} aria-hidden />
      </button>

      {open && (
        <div
          role="radiogroup"
          aria-label="Sort order"
          className="absolute left-0 top-full z-50 mt-1 w-56 space-y-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
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
