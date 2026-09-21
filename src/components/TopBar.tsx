import { useRef } from "react";
import { fmtBytes } from "../lib/format";
import type { Project } from "../lib/xer/model";
import type { Mode, PaletteId } from "../lib/themes";
import logo from "../favicon.svg";
import { ThemeMenu } from "./ThemeMenu";
import { buttonClass, inputClass } from "./ui";

export type Tab = "overview" | "schedule" | "tables";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "schedule", label: "Schedule" },
  { id: "tables", label: "Tables" },
];

interface Props {
  fileName: string;
  fileSize: number;
  projects: Project[];
  projectId: string;
  onProject: (id: string) => void;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onOpen: (file: File) => void;
  onClose: () => void;
  /** Set when the file couldn't be remembered for the next visit. */
  storageNotice: string | null;
  palette: PaletteId;
  mode: Mode;
  onPalette: (id: PaletteId) => void;
  onMode: (mode: Mode) => void;
}

export function TopBar(p: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold tracking-tight">
        <img src={logo} alt="" className="size-6 shrink-0" />
        XER Viewer
      </div>

      <nav className="flex h-full items-stretch gap-1" aria-label="Views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => p.onTab(t.id)}
            aria-current={p.tab === t.id ? "page" : undefined}
            className={`relative px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40 ${
              p.tab === t.id
                ? "text-accent-600 dark:text-accent-400 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-accent-600 dark:after:bg-accent-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-3">
        {p.projects.length > 1 && (
          <select
            aria-label="Project"
            className={`${inputClass} max-w-64`}
            value={p.projectId}
            onChange={(e) => p.onProject(e.target.value)}
          >
            {p.projects.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.shortName ? `${pr.shortName} — ${pr.name}` : pr.name}
              </option>
            ))}
          </select>
        )}
        <span className="hidden truncate text-sm text-slate-500 sm:inline dark:text-slate-400" title={p.fileName}>
          {p.fileName} · {fmtBytes(p.fileSize)}
        </span>
        <button type="button" className={buttonClass} onClick={() => input.current?.click()}>
          Open…
        </button>
        {p.storageNotice && (
          <span
            role="status"
            className="shrink-0 whitespace-nowrap text-xs text-amber-700 dark:text-amber-400"
            title={`${p.storageNotice} It won't reopen automatically next time.`}
          >
            <span aria-hidden>⚠ </span>
            Not saved<span className="hidden xl:inline">: {p.storageNotice}</span>
          </span>
        )}
        <button type="button" className={buttonClass} onClick={p.onClose} title="Close this file and forget it in this browser">
          Close
        </button>
        <ThemeMenu palette={p.palette} mode={p.mode} onPalette={p.onPalette} onMode={p.onMode} />
        <input
          ref={input}
          type="file"
          accept=".xer,.txt,text/plain"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) p.onOpen(file);
            e.target.value = "";
          }}
        />
      </div>
    </header>
  );
}
