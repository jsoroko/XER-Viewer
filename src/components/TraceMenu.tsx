import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LuRoute, LuSearch } from "react-icons/lu";
import { activityByCode, findActivities } from "../lib/activityLookup";
import type { TraceMode } from "../lib/drivingPath";
import type { Activity, Schedule } from "../lib/xer/model";
import { usePersistedStrings } from "../state/usePersistedStrings";
import { iconToggleClass, inputClass } from "./ui";

interface Props {
  schedule: Schedule;
  /** The activity selected in the schedule, if any. */
  selected: Activity | undefined;
  /** A trace is showing; the button stays highlighted. */
  active: boolean;
  onTrace: (originId: string, mode: TraceMode) => void;
}

/** Panel width, so it can open towards the left when the button is too close to the window's right edge. */
const PANEL_WIDTH = 340;

type Source = "selected" | "id";

const MODES: Array<{ id: TraceMode; label: string; hint: string; start: number }> = [
  { id: "backward", label: "Backward", hint: "what drives it", start: 2 },
  { id: "forward", label: "Forward", hint: "what it drives", start: 0 },
  { id: "combined", label: "Combined", hint: "the whole chain", start: 1 },
];

const isMode = (v: string | undefined): v is TraceMode => MODES.some((m) => m.id === v);

/**
 * A chain of three activities with the starting one drawn as a ring: at the end for backward, the start for forward,
 * the middle for combined.
 */
function ChainIcon({ start }: { start: number }) {
  const xs = [8, 31, 54];
  return (
    <svg width="62" height="22" viewBox="0 0 62 22" aria-hidden className="mx-auto mb-1 block">
      <path d="M12 11h15M35 11h15" stroke="currentColor" strokeWidth="1.5" />
      {xs.map((x, i) =>
        i === start ? (
          <circle key={x} cx={x} cy="11" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
        ) : (
          <circle key={x} cx={x} cy="11" r="4" fill="currentColor" />
        ),
      )}
    </svg>
  );
}

const segClass = (on: boolean) =>
  "h-7 flex-1 rounded-md text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
  (on
    ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600"
    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100");

const caption = "mb-1.5 text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400";

/**
 * Starts a driving-logic trace (see lib/drivingPath.ts) from the selected activity or from any activity whose ID is typed
 * in, backward, forward or both. Always available; opens as a panel below the icon button, like the other toolbar menus.
 */
export function TraceMenu({ schedule, selected, active, onTrace }: Props) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [source, setSource] = useState<Source>("selected");
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState(false);
  const [saved, setSaved] = usePersistedStrings("xerview-trace-mode", ["backward"]);
  const mode: TraceMode = isMode(saved[0]) ? saved[0] : "backward";
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const inProject = useMemo(() => schedule.activities.filter((a) => a.projectId === schedule.project.id), [schedule]);
  const matches = useMemo(() => findActivities(inProject, text), [inProject, text]);
  const usingId = source === "id" || !selected;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (open && usingId) input.current?.focus();
  }, [open, usingId]);

  const run = (origin: Activity | undefined) => {
    if (!origin) {
      setError(true);
      return;
    }
    setOpen(false);
    onTrace(origin.id, mode);
  };

  const submit = () => {
    if (!usingId) return run(selected);
    run(matches[cursor] ?? activityByCode(inProject, text));
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (matches.length > 0) setCursor((c) => (c + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const toggle = () => {
    if (!open) {
      const left = box.current?.getBoundingClientRect().left ?? 0;
      setAlignRight(left + PANEL_WIDTH + 8 > window.innerWidth);
      setSource(selected ? "selected" : "id");
      setText("");
      setCursor(0);
      setError(false);
    }
    setOpen((v) => !v);
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={iconToggleClass(active || open)}
        aria-label="Trace driving logic"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        title="Trace the driving logic around an activity"
      >
        <LuRoute size={16} aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Trace driving logic"
          className={`absolute top-full z-50 mt-1 w-[340px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900 ${alignRight ? "right-0" : "left-0"}`}
        >
          <p className={caption}>TRACE FROM</p>
          <div className="flex gap-0.5 rounded-lg bg-slate-100 p-[3px] dark:bg-slate-800" role="radiogroup" aria-label="Trace from">
            <button
              type="button"
              role="radio"
              aria-checked={!usingId}
              disabled={!selected}
              className={`${segClass(!usingId)} disabled:opacity-40`}
              onClick={() => setSource("selected")}
              title={selected ? undefined : "Nothing is selected in the schedule"}
            >
              Selected
            </button>
            <button type="button" role="radio" aria-checked={usingId} className={segClass(usingId)} onClick={() => setSource("id")}>
              By ID
            </button>
          </div>

          {!usingId && selected && (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-700">
              <span className="size-2 shrink-0 rotate-45 bg-accent-600" aria-hidden />
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{selected.code}</div>
                <div className="truncate text-sm">{selected.name}</div>
              </div>
            </div>
          )}

          {usingId && (
            <div className="mt-2">
              <div className="relative">
                <LuSearch size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={input}
                  type="text"
                  className={`${inputClass} w-full pl-8 ${error ? "border-red-500" : ""}`}
                  placeholder="Activity ID or name"
                  aria-label="Activity ID"
                  aria-invalid={error || undefined}
                  autoComplete="off"
                  spellCheck={false}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setCursor(0);
                    setError(false);
                  }}
                  onKeyDown={onInputKey}
                />
              </div>
              {matches.length > 0 && (
                <ul className="mt-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="listbox" aria-label="Matching activities">
                  {matches.map((a, i) => (
                    <li key={a.id} role="option" aria-selected={i === cursor}>
                      <button
                        type="button"
                        className={`flex w-full flex-col gap-px rounded-md px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${i === cursor ? "bg-slate-100 dark:bg-slate-800" : ""}`}
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => run(a)}
                      >
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{a.code}</span>
                        <span className="truncate text-[13px]">{a.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {error && (
                <p role="alert" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                  {text.trim() ? "No activity in this project has that ID." : "Enter an activity ID."}
                </p>
              )}
              {!selected && !error && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Nothing is selected in the schedule.</p>}
            </div>
          )}

          <p className={`${caption} mt-3.5`}>DIRECTION</p>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Direction">
            {MODES.map((m) => {
              const on = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSaved([m.id])}
                  className={
                    "rounded-lg border px-1 pb-1.5 pt-2.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
                    (on
                      ? "border-accent-500 bg-accent-50 text-accent-700 dark:border-accent-500 dark:bg-accent-950 dark:text-accent-300"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800")
                  }
                >
                  <ChainIcon start={m.start} />
                  <span className={`block text-xs ${on ? "" : "text-slate-800 dark:text-slate-100"}`}>{m.label}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">{m.hint}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="mt-3 h-8 w-full rounded-md bg-accent-600 text-sm font-medium text-white hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
            onClick={submit}
          >
            Trace
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-500">Esc to close</p>
        </div>
      )}
    </div>
  );
}
