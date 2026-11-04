import { useEffect, useRef, useState, type DragEvent } from "react";
import { LuArrowLeftRight, LuFileText, LuGitCompare, LuReplace, LuUpload, LuX } from "react-icons/lu";
import { CHANGE_FIELDS } from "../lib/compare";
import { fmtBytes, fmtDate, fmtInt } from "../lib/format";
import type { RecentFile } from "../state/fileStore";
import type { CompareApi, CompareSide } from "../state/useCompare";
import { Switch, badgeClass, buttonClass, iconToggleClass } from "./ui";

/** Panel width, so it can open towards the left when the button is too close to the window's right edge. */
const PANEL_WIDTH = 360;

const caption = "mb-1.5 text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400";

const linkButton =
  "rounded text-xs text-accent-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:text-accent-400";

/** The drop area, the file chooser, and the files opened lately. */
function AddFile({ compare, label }: { compare: CompareApi; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { loading, error, recent, openFile, openRecent } = compare;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) openFile(file);
  };

  return (
    <div>
      <p className={caption}>{label}</p>
      <input
        ref={input}
        type="file"
        accept=".xer,text/plain"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // the same file can then be chosen again
          if (file) openFile(file);
        }}
      />
      <button
        type="button"
        data-compare-drop
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        disabled={loading !== null}
        className={
          "flex w-full flex-col items-center gap-0.5 rounded-lg border-2 border-dashed px-3 py-4 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
          (over
            ? "border-accent-500 bg-accent-50 dark:bg-accent-950"
            : "border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800")
        }
      >
        <LuUpload size={20} aria-hidden className="text-slate-500 dark:text-slate-400" />
        {loading !== null ? (
          <>
            <span className="text-sm font-medium">Reading…</span>
            {/* A file name is often one long word with no spaces, so it is cut short rather than left to run out of the box. */}
            <span className="w-full truncate text-xs text-slate-500 dark:text-slate-400" title={loading}>
              {loading}
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium">Drop an .xer file here</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              or <span className="text-accent-700 dark:text-accent-400">choose a file</span>
            </span>
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {recent.length > 0 && (
        <>
          <p className={`${caption} mt-3`}>Recently opened in this browser</p>
          <ul className="flex flex-col gap-1">
            {recent.map((r) => (
              <li key={r.key}>
                <RecentRow file={r} onOpen={openRecent} busy={loading !== null} />
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-2.5 text-[11px] text-slate-400 dark:text-slate-500">Files stay in your browser. Nothing is uploaded.</p>
    </div>
  );
}

function RecentRow({ file, onOpen, busy }: { file: RecentFile; onOpen: (f: RecentFile) => void; busy: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onOpen(file)}
      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      <LuFileText size={16} aria-hidden className="shrink-0 text-slate-500 dark:text-slate-400" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{file.name}</span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
          {file.dataDate !== null ? `Data date ${fmtDate(file.dataDate)} · ` : ""}
          {fmtBytes(file.size)}
        </span>
      </span>
    </button>
  );
}

/** One of the two files: which period it is (Baseline or Current), its name and data date, and where it came from. */
function SideRow({ label, side, tag }: { label: string; side: CompareSide; tag: "Open in viewer" | "Added file" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium" title={side.name}>
          {side.name}
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          {side.dataDate !== null ? `Data date ${fmtDate(side.dataDate)}` : "No data date"}
        </div>
      </div>
      <span
        className="shrink-0 whitespace-nowrap rounded-full border border-slate-300 bg-white px-2 py-px text-[11px] text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
        title={tag === "Open in viewer" ? "The file open in the viewer. Change it with Open… at the top of the page." : "The file added for comparison. Replace it below."}
      >
        {tag}
      </span>
    </div>
  );
}

/**
 * Everything about comparing two programmes, behind one toolbar button: adding the second file (dropped, chosen, or
 * one opened lately), which is older, what counts as a difference, and leaving the comparison. The kind-of-change chips
 * are not in here; they are in the strip under the toolbar, where they are one click away.
 *
 * Exit compare is in the header and Done in the footer, both outside the part that scrolls, so neither is ever out of reach.
 */
export function CompareMenu({ compare }: { compare: CompareApi }) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { active, baseline, current, comparison, file, addedSide } = compare;

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

  // A file that has just been added closes the "replace" area.
  useEffect(() => setReplacing(false), [file]);

  const toggle = () => {
    if (!open) {
      const left = box.current?.getBoundingClientRect().left ?? 0;
      setAlignRight(left + PANEL_WIDTH + 8 > window.innerWidth);
      setReplacing(false);
    }
    setOpen((v) => !v);
  };

  const changed = comparison ? comparison.counts.added + comparison.counts.removed + comparison.counts.modified : 0;
  const showing = active && baseline && current;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className={`${iconToggleClass(active || open)} relative`}
        aria-label={active ? `Compare tools (${changed} changes)` : "Compare tools"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        title={active ? `Compare tools: ${fmtInt(changed)} changes` : "Compare this programme with another file"}
      >
        <LuGitCompare size={16} aria-hidden />
        {active && <span className={badgeClass}>{changed > 99 ? "99+" : changed}</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Compare tools"
          className={`absolute top-full z-50 mt-1 flex max-h-[80vh] w-[360px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 ${alignRight ? "right-0" : "left-0"}`}
        >
          <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
            <LuGitCompare size={16} aria-hidden className="text-accent-600 dark:text-accent-400" />
            <h2 className="text-sm font-medium">Compare tools</h2>
            {showing && (
              <button
                type="button"
                className={`${buttonClass} ml-auto h-7! text-red-700 dark:text-red-400`}
                onClick={() => {
                  compare.exit();
                  setOpen(false);
                }}
                title="Leave compare mode and go back to the schedule on its own"
              >
                <LuX size={14} aria-hidden />
                Exit compare
              </button>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-3 pb-3">
            {!active && <AddFile compare={compare} label="Compare this programme with" />}

            {showing && (
              <>
                <div>
                  <p className={caption}>Comparing</p>
                  <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                    <SideRow label="Baseline" side={baseline} tag={addedSide === "baseline" ? "Added file" : "Open in viewer"} />
                    <SideRow label="Current" side={current} tag={addedSide === "current" ? "Added file" : "Open in viewer"} />
                    <div className="flex items-center gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
                      <button type="button" className={`${linkButton} inline-flex items-center gap-1`} onClick={compare.swap}>
                        <LuArrowLeftRight size={13} aria-hidden />
                        Swap order
                      </button>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">The earlier data date is the baseline</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${buttonClass} mt-2 w-full`}
                    aria-expanded={replacing}
                    onClick={() => setReplacing((v) => !v)}
                    title="Choose a different file to compare with. The file open in the viewer stays as it is."
                  >
                    <LuReplace size={14} aria-hidden />
                    {replacing ? "Cancel" : "Replace added file…"}
                  </button>
                  {file && file.projects.length > 1 && (
                    <label className="mt-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400" title={`Project in ${file.name}`}>
                      <span className="shrink-0">Project</span>
                      <select
                        className="h-7 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        value={compare.projectId}
                        onChange={(e) => compare.onProject(e.target.value)}
                      >
                        {file.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {compare.differentProject && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                      These look like different projects. Activities are matched by ID, so few will match.
                    </p>
                  )}
                </div>

                {replacing && <AddFile compare={compare} label="Replace with" />}

                <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                  <p className={caption}>Compare by</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {CHANGE_FIELDS.map((f) => (
                      <Switch key={f.key} checked={compare.fields[f.key]} onChange={() => compare.toggleField(f.key)} label={f.label} title={f.title} />
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 border-t border-slate-200 pt-3 dark:border-slate-800">
                  <Switch checked={compare.showBaseline} onChange={compare.setShowBaseline} label="Show baseline bars" />
                  <Switch checked={compare.showUnchanged} onChange={compare.setShowUnchanged} label="Show unchanged activities" />
                </div>
              </>
            )}
          </div>

          {showing && (
            <div className="flex shrink-0 items-center justify-end border-t border-slate-200 px-3 py-2 dark:border-slate-800">
              <button
                type="button"
                className="h-8 rounded-md bg-accent-600 px-4 text-sm font-medium text-white hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
