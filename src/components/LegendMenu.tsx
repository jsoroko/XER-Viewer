import { useRef, useState } from "react";
import { LuInfo } from "react-icons/lu";
import { buildLegend, type LegendKey, type LegendState } from "../lib/legend";
import { CHANGE_BAR, CHANGE_SOLID } from "./compareStyle";
import { iconToggleClass } from "./ui";
import { useDismiss } from "./useDismiss";

/** How each entry looks, as the classes of a small swatch drawn like the thing on the chart. */
const SWATCH: Record<LegendKey, string> = {
  complete: "h-2.5 w-4 rounded-sm bg-emerald-600",
  actual: "h-2.5 w-4 rounded-sm bg-blue-700",
  remaining: "h-2.5 w-4 rounded-sm bg-blue-400",
  critical: "h-2.5 w-4 rounded-sm bg-red-500",
  new: `h-2.5 w-4 rounded-sm ${CHANGE_BAR.added}`,
  modified: `h-2.5 w-4 rounded-sm ${CHANGE_BAR.modified}`,
  removed: "h-2.5 w-4 rounded-sm border-2 border-dashed border-red-500",
  unchanged: `h-2.5 w-4 rounded-sm ${CHANGE_BAR.unchanged}`,
  baseline: "h-[3px] w-4 rounded-sm bg-slate-500 dark:bg-slate-400",
  loe: "h-1.5 w-4 rounded-sm bg-teal-500",
  wbs: "h-2 w-4 bg-slate-700 dark:bg-slate-300",
  milestone: "size-2.5 rotate-45 bg-slate-800 dark:bg-slate-200",
  dataDate: "h-3 w-px bg-orange-500",
  today: "h-3 w-0 border-l-2 border-dashed border-fuchsia-500",
  nonWorking: "h-2.5 w-4 rounded-sm border border-slate-300 bg-(--non-working) dark:border-slate-600",
  predecessor: "h-0.5 w-4 bg-amber-500",
  successor: "h-0.5 w-4 bg-violet-500",
  tracedPath: "h-3 w-4 rounded-sm outline outline-2 -outline-offset-1 outline-cyan-500",
  droppedPath: "h-3 w-4 rounded-sm outline outline-2 outline-dashed -outline-offset-1 outline-slate-400",
  markNew: "",
  markRemoved: "",
  markModified: "",
};

/** The three row markers are small squares with a sign in them, like on the rows. */
const MARKER: Partial<Record<LegendKey, { sign: string; classes: string }>> = {
  markNew: { sign: "+", classes: CHANGE_SOLID.added },
  markRemoved: { sign: "−", classes: CHANGE_SOLID.removed },
  markModified: { sign: "~", classes: CHANGE_SOLID.modified },
};

function Swatch({ k }: { k: LegendKey }) {
  const marker = MARKER[k];
  return (
    <span className="flex w-5 shrink-0 items-center justify-center" aria-hidden>
      {marker ? (
        <span className={`flex size-4 items-center justify-center rounded text-[13px] font-semibold leading-none ${marker.classes}`}>{marker.sign}</span>
      ) : (
        <span className={SWATCH[k]} />
      )}
    </span>
  );
}

/**
 * The key to the chart: an icon button, like the others in the toolbar, that opens a panel of what the colours and lines
 * mean (see lib/legend.ts). It lists only what is on the chart at the moment, in groups, and sizes itself to its content.
 */
export function LegendMenu({ state }: { state: LegendState }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useDismiss(open, box, () => setOpen(false));

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={iconToggleClass(open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Legend"
        title="Legend: what the colours and lines on the chart mean"
        onClick={() => setOpen((v) => !v)}
      >
        <LuInfo size={18} aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Legend"
          className="absolute right-0 top-full z-50 mt-1 flex max-h-[75vh] w-max max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {buildLegend(state).map((g) => (
            <section key={g.title}>
              <h3 className="mb-1 text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400">{g.title}</h3>
              <ul className="space-y-1">
                {g.entries.map((e) => (
                  <li key={e.key} className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-700 dark:text-slate-200">
                    <Swatch k={e.key} />
                    {e.label}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
