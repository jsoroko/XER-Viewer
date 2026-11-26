import { useEffect, useRef, useState, type ReactNode } from "react";
import { LuChevronLeft, LuChevronRight, LuDownload, LuX } from "react-icons/lu";
import { PAPERS, PAPER_SIZES, type ActivityText, type BarLabels, type PaperSize, type PrintLayout } from "../lib/printLayout";
import { buildPdf, type PrintInput } from "../lib/printPdf";
import { usePrintLayout, resetPrintLayout } from "../state/usePrintLayout";
import { buttonClass, iconButtonClass, Segmented } from "./ui";

interface Props {
  /** Everything about what is printed except the layout, which this dialog chooses. Called afresh for each preview. */
  makeInput: () => PrintInput;
  /** Whether the level guides will print, which is decided in Settings: said here so it is not a surprise. */
  guidesNote: string;
  /** While the PDF is being made for download: pages done of total. */
  busy: { done: number; total: number } | null;
  error: string | null;
  onDownload: (layout: PrintLayout) => void;
  onClose: () => void;
}

const PAPER_OPTIONS = PAPER_SIZES.map((id) => ({ id, label: PAPERS[id].label }));

const TEXT_OPTIONS: Array<{ id: ActivityText; label: string; hint: string }> = [
  { id: "wrap", label: "Wrap long names", hint: "The Activity column widens to fit, up to about a third of the page, and a longer name wraps onto more lines. Nothing is cut." },
  { id: "one-line", label: "One line each", hint: "A fixed column, and a long name is cut with “...”. Fits the most rows on a page." },
];

const LABEL_OPTIONS: Array<{ id: BarLabels; label: string; hint: string }> = [
  { id: "smart", label: "Name, or ID if it won't fit", hint: "The whole name beside the bar when there is room, otherwise the activity ID. Never half a name." },
  { id: "name", label: "Name", hint: "Cut with “...” when there isn't room." },
  { id: "id", label: "Activity ID", hint: "Short, so never cut." },
  { id: "none", label: "None", hint: "Bars only; the table names every row." },
];

/** A vertical list of choices, each with a line saying what it does. */
function RadioList<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ id: T; label: string; hint: string }>; onChange: (v: T) => void }) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</legend>
      <div className="space-y-1.5">
        {options.map((o) => (
          <label
            key={o.id}
            className={`flex cursor-pointer gap-2 rounded-md border px-2.5 py-1.5 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500/40 ${
              value === o.id
                ? "border-accent-500 bg-accent-50 dark:border-accent-500 dark:bg-accent-950/60"
                : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            }`}
          >
            <input type="radio" name={label} className="mt-0.5 accent-accent-600 focus:outline-none" checked={value === o.id} onChange={() => onChange(o.id)} />
            <span className="min-w-0">
              <span className="block font-medium text-slate-800 dark:text-slate-100">{o.label}</span>
              {value === o.id && <span className="mt-0.5 block text-slate-500 dark:text-slate-400">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Print to PDF: the paper, how long activity text and the bar labels are handled, with a preview of one page drawn by
 * the same code that makes the download, so it is exactly what will be saved. The choices are remembered between visits.
 */
export function PrintDialog({ makeInput, guidesNote, busy, error, onDownload, onClose }: Props) {
  const [layout, setLayout] = usePrintLayout();
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<{ url: string; pages: number } | null>(null);
  const [updating, setUpdating] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const latest = useRef(makeInput);
  latest.current = makeInput;
  const shown = useRef<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // The preview: only the page being looked at is drawn, after a short pause so a run of clicks makes one.
  useEffect(() => {
    let stale = false;
    setUpdating(true);
    const timer = setTimeout(
      async () => {
        try {
          const { blob, pages } = await buildPdf({ ...latest.current(), layout }, { onlyPage: page });
          if (stale) return;
          if (page >= pages) {
            setPage(pages - 1); // the choices made the print shorter than the page being looked at
            return;
          }
          const url = URL.createObjectURL(blob);
          const old = shown.current;
          shown.current = url;
          setPreview({ url, pages });
          setPreviewError(null);
          setUpdating(false);
          if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
        } catch (e) {
          if (stale) return;
          setPreviewError(e instanceof Error ? e.message : "Couldn't draw the preview.");
          setUpdating(false);
        }
      },
      shown.current ? 250 : 20,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [layout, page]);
  useEffect(
    () => () => {
      if (shown.current) URL.revokeObjectURL(shown.current);
    },
    [],
  );

  // Focus moves into the dialog once, when it opens; Escape closes it unless a PDF is being made.
  useEffect(() => box.current?.focus(), []);
  const closeNow = useRef(() => {});
  closeNow.current = () => {
    if (!busy) onClose();
  };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === "Escape" && closeNow.current();
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);

  const set = (patch: Partial<PrintLayout>) => {
    setLayout({ ...layout, ...patch });
  };
  const pages = preview?.pages ?? 1;
  const paper = PAPERS[layout.paper].label;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 dark:bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-title"
        tabIndex={-1}
        className="flex h-[min(800px,92vh)] w-[min(1140px,96vw)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <h2 id="print-title" className="text-sm font-semibold">
            Print to PDF
          </h2>
          <button type="button" className={`${iconButtonClass} ml-auto`} aria-label="Close" title="Close" onClick={onClose} disabled={busy !== null}>
            <LuX size={16} aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="max-h-[40%] shrink-0 overflow-y-auto border-b border-slate-200 p-4 md:max-h-none md:w-64 md:border-b-0 md:border-r dark:border-slate-800">
            <Segmented<PaperSize> stacked label="Paper (landscape)" value={layout.paper} options={PAPER_OPTIONS} onChange={(paper) => set({ paper })} />
            <RadioList label="Activity text" value={layout.text} options={TEXT_OPTIONS} onChange={(text) => set({ text })} />
            <RadioList label="Bar labels" value={layout.labels} options={LABEL_OPTIONS} onChange={(labels) => set({ labels })} />
            <p className="mt-4 text-[11px] leading-snug text-slate-500 dark:text-slate-400">Your choices are remembered for next time. {guidesNote}</p>
            <button type="button" className="mt-2 text-xs text-accent-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:text-accent-400" onClick={resetPrintLayout}>
              Reset to defaults
            </button>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-100 dark:bg-slate-950/60">
            <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-slate-600 dark:text-slate-300">
              <button type="button" className={iconButtonClass} aria-label="Previous page" title="Previous page" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <LuChevronLeft size={16} aria-hidden />
              </button>
              <span className="min-w-24 text-center tabular-nums" aria-live="polite">
                Page {Math.min(page + 1, pages)} of {pages}
              </span>
              <button type="button" className={iconButtonClass} aria-label="Next page" title="Next page" disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}>
                <LuChevronRight size={16} aria-hidden />
              </button>
              <span className="w-20 text-slate-400 dark:text-slate-500">{updating ? "Updating…" : ""}</span>
            </div>
            <div className="relative min-h-0 flex-1 px-3 pb-3">
              {previewError ? (
                <Notice>The preview couldn't be drawn ({previewError}). You can still download the PDF.</Notice>
              ) : preview ? (
                <iframe
                  key={preview.url}
                  title={`Preview of page ${page + 1}`}
                  src={`${preview.url}#toolbar=0&navpanes=0&view=Fit`}
                  className={`h-full w-full rounded border border-slate-300 bg-white transition-opacity dark:border-slate-700 ${updating ? "opacity-60" : ""}`}
                />
              ) : (
                <Notice>Drawing the preview…</Notice>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {paper} landscape, <span className="tabular-nums">{pages}</span> {pages === 1 ? "page" : "pages"}
          </span>
          {error && (
            <span role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </span>
          )}
          <button type="button" className={`${buttonClass} ml-auto`} onClick={onClose} disabled={busy !== null}>
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-600 px-4 text-sm font-medium text-white hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:opacity-60"
            onClick={() => onDownload(layout)}
            disabled={busy !== null}
          >
            <LuDownload size={14} aria-hidden />
            {busy ? `Page ${Math.min(busy.done + 1, busy.total)} of ${busy.total}…` : "Download PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">{children}</div>;
}
