import { useEffect, useRef, useState } from "react";
import { PALETTES, type Mode, type PaletteId } from "../lib/themes";
import { buttonClass } from "./ui";

const MODES: Array<{ id: Mode; label: string; glyph: string }> = [
  { id: "light", label: "Light", glyph: "☀" },
  { id: "dark", label: "Dark", glyph: "☾" },
];

interface Props {
  palette: PaletteId;
  mode: Mode;
  onPalette: (id: PaletteId) => void;
  onMode: (mode: Mode) => void;
}

const optionClass = (on: boolean) =>
  "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
  (on
    ? "border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300"
    : "border-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800");

/** The button in the top bar that opens the choice of colour theme and of light or dark. */
export function ThemeMenu({ palette, mode, onPalette, onMode }: Props) {
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
        className={`${buttonClass} w-8 px-0`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Appearance"
        title="Colour theme, light or dark"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-7.8-9-7.8Z" />
          <circle cx="7.5" cy="11" r=".6" fill="currentColor" />
          <circle cx="11" cy="7" r=".6" fill="currentColor" />
          <circle cx="15.5" cy="8" r=".6" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Appearance"
          className="absolute right-0 top-full z-50 mt-1 max-h-[calc(100vh-4rem)] w-72 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Mode</div>
            <div role="radiogroup" aria-label="Light or dark" className="grid grid-cols-2 gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  onClick={() => onMode(m.id)}
                  className={`${optionClass(mode === m.id)} justify-center`}
                >
                  <span aria-hidden>{m.glyph}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Theme</div>
            <div role="radiogroup" aria-label="Colour theme" className="space-y-1">
              {PALETTES.map((p) => {
                const t = p[mode];
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={palette === p.id}
                    onClick={() => onPalette(p.id)}
                    className={optionClass(palette === p.id)}
                    title={p.blurb}
                  >
                    <span aria-hidden className="flex shrink-0 overflow-hidden rounded border border-slate-300 dark:border-slate-600">
                      {[t.bg, t.pn, t.bd, t.ac].map((c, i) => (
                        <span key={i} className="h-5 w-3.5" style={{ backgroundColor: c }} />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{p.name}</span>
                      <span className="block text-xs font-normal leading-snug text-slate-500 dark:text-slate-400">{p.blurb}</span>
                    </span>
                    {palette === p.id && <span aria-hidden>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
