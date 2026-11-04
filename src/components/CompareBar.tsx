import { LuArrowRight, LuFileText } from "react-icons/lu";
import { fmtDate, fmtInt } from "../lib/format";
import type { ChipKind, CompareApi, CompareSide } from "../state/useCompare";
import { CHANGE_MARK, CHANGE_SOLID, CHANGE_WORD, CHIP_ON } from "./compareStyle";

const KINDS: ChipKind[] = ["added", "removed", "modified"];

function Side({ side, label }: { side: CompareSide; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={`${label}: ${side.name}${side.dataDate !== null ? `, data date ${fmtDate(side.dataDate)}` : ""}`}>
      <span className="truncate">{side.name.replace(/\.xer$/i, "")}</span>
      {side.dataDate !== null && <span className="shrink-0 text-slate-500 dark:text-slate-400">· {fmtDate(side.dataDate)}</span>}
    </span>
  );
}

/**
 * The strip under the toolbar while two programmes are being compared: which two they are, and a chip per kind of
 * change (with its count) that switches that kind on or off. All three on is the whole comparison, so there is no
 * separate "All" button.
 */
export function CompareBar({ compare }: { compare: CompareApi }) {
  const { baseline, current, comparison, chips, toggleChip } = compare;
  if (!baseline || !current || !comparison) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs dark:bg-slate-800/70" role="group" aria-label="Compare">
      <span className="flex min-w-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
        <LuFileText size={14} aria-hidden className="shrink-0 text-slate-500" />
        <span className="max-w-56 truncate">
          <Side side={baseline} label="Baseline (older)" />
        </span>
        <LuArrowRight size={13} aria-hidden className="shrink-0 text-slate-400" />
        <span className="max-w-56 truncate">
          <Side side={current} label="Current (newer)" />
        </span>
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-1.5">
        {KINDS.map((kind) => {
          const on = chips[kind];
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={on}
              onClick={() => toggleChip(kind)}
              title={`${on ? "Hide" : "Show"} ${CHANGE_WORD[kind].toLowerCase()} activities`}
              className={
                "inline-flex h-7 items-center gap-1.5 rounded-full border pl-1.5 pr-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
                (on
                  ? CHIP_ON[kind]
                  : "border-slate-300 text-slate-400 hover:bg-white dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-900")
              }
            >
              <span
                aria-hidden
                className={`flex size-4 items-center justify-center rounded text-[13px] font-semibold leading-none ${on ? CHANGE_SOLID[kind] : "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500"}`}
              >
                {CHANGE_MARK[kind]}
              </span>
              <span className="tabular-nums">{fmtInt(comparison.counts[kind])}</span> {CHANGE_WORD[kind].toLowerCase()}
            </button>
          );
        })}
      </span>
    </div>
  );
}
