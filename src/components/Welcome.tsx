import { useRef } from "react";
import logo from "../favicon.svg";
import { buttonClass } from "./ui";

interface Props {
  /** `restoring` = reopening the remembered file; `parsing` = a file the user just chose. */
  loading: "restoring" | "parsing" | null;
  error: { name: string; message: string } | null;
  onFile: (file: File) => void;
  onSample: () => void;
}

export function Welcome({ loading, error, onFile, onSample }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const busy = loading !== null;

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <div className="mb-8 text-center">
            <h1 className="flex items-center justify-center gap-3 text-3xl font-semibold tracking-tight">
              <img src={logo} alt="" className="size-9 shrink-0" />
              XER Viewer
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Open a Primavera P6 export to browse the schedule, Gantt chart, logic and raw tables.
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="group flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-14 text-center transition-colors hover:border-accent-500 hover:bg-accent-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:cursor-progress dark:border-slate-700 dark:bg-slate-900 dark:hover:border-accent-500 dark:hover:bg-accent-950/20"
          >
            {busy ? (
              <>
                <span className="size-8 animate-spin rounded-full border-2 border-slate-300 border-t-accent-500" />
                <span className="font-medium">{loading === "restoring" ? "Reopening your last file…" : "Parsing file…"}</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="size-9 text-slate-400 group-hover:text-accent-500" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4m0 0-4 4m4-4 4 4" />
                  <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                </svg>
                <span className="text-base font-medium">Drop an .xer file here, or click to browse</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  Files are read and parsed in your browser and never uploaded.
                </span>
              </>
            )}
          </button>
          <input
            ref={input}
            type="file"
            accept=".xer,.txt,text/plain"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
              e.target.value = "";
            }}
          />

          {error && (
            <div role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <p className="font-medium">Couldn't open {error.name}</p>
              <p className="mt-0.5">{error.message}</p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <span>No file handy?</span>
            <button type="button" className={buttonClass} disabled={busy} onClick={onSample}>
              Try a sample project
            </button>
          </div>

          <section
            aria-labelledby="privacy-heading"
            className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-center dark:border-slate-800 dark:bg-slate-900"
          >
            <h2 id="privacy-heading" className="text-sm font-medium">
              🔒 Your data stays on your computer
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              This app doesn't collect, upload or share any data. Your file is opened and processed entirely in your
              browser. The last file you open is remembered in this browser only, so it's here next time;{" "}
              <strong className="font-medium">Close</strong> forgets it.
            </p>
          </section>
        </div>
      </div>

      <footer className="shrink-0 px-6 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
        Designed by Jacek Soroko
      </footer>
    </div>
  );
}
