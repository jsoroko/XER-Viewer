import { useRef, useState, type ReactNode } from "react";
import { LuChevronDown, LuListTree, LuPalette, LuSettings } from "react-icons/lu";
import { paletteById, type Mode, type PaletteId } from "../lib/themes";
import { useLevelGuides } from "../state/useLevelGuides";
import { AppearanceSettings } from "./AppearanceSettings";
import { LevelGuidesSettings } from "./LevelGuidesSettings";
import { iconToggleClass } from "./ui";
import { useDismiss } from "./useDismiss";

interface Props {
  palette: PaletteId;
  mode: Mode;
  onPalette: (id: PaletteId) => void;
  onMode: (mode: Mode) => void;
}

type SectionId = "appearance" | "guides";

/** One part of the panel: a heading with a one-line summary of what is set, which opens to show the choices. */
function Section({ id, title, summary, icon, open, onToggle, children }: { id: SectionId; title: string; summary: string; icon: ReactNode; open: boolean; onToggle: (id: SectionId) => void; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 first:border-t-0 dark:border-slate-700">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`settings-${id}`}
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-2 text-left text-sm font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <span aria-hidden className="text-slate-500 dark:text-slate-400">
          {icon}
        </span>
        {title}
        <span className="min-w-0 truncate text-xs font-normal text-slate-500 dark:text-slate-400">{summary}</span>
        <LuChevronDown size={14} aria-hidden className={`ml-auto shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div id={`settings-${id}`} className="px-1.5 pb-3 pt-1">
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * The cog in the top bar. It opens the Settings panel: Appearance (the colour theme, and light or dark) and Level guides
 * (the lines that show which WBS group a row is under). One part is open at a time, and each says on its heading what is
 * set, so the other can stay closed.
 */
export function SettingsMenu({ palette, mode, onPalette, onMode }: Props) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionId | null>("appearance");
  const box = useRef<HTMLDivElement>(null);
  const [guides] = useLevelGuides();

  useDismiss(open, box, () => setOpen(false));

  const toggle = (id: SectionId) => setSection((s) => (s === id ? null : id));

  return (
    <div ref={box} className="relative" data-help="settings">
      <button
        type="button"
        className={iconToggleClass(open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Settings"
        title="Settings: appearance and level guides"
        onClick={() => setOpen((v) => !v)}
      >
        <LuSettings size={18} aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Settings"
          className="absolute right-0 top-full z-50 mt-1 max-h-[calc(100vh-4rem)] w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <Section id="appearance" title="Appearance" summary={`${paletteById(palette).name}, ${mode === "dark" ? "Dark" : "Light"}`} icon={<LuPalette size={15} />} open={section === "appearance"} onToggle={toggle}>
            <AppearanceSettings palette={palette} mode={mode} onPalette={onPalette} onMode={onMode} />
          </Section>
          <Section id="guides" title="Level guides" summary={guides.show ? `On, ${guides.colours.length} colours` : "Off"} icon={<LuListTree size={15} />} open={section === "guides"} onToggle={toggle}>
            <LevelGuidesSettings />
          </Section>
        </div>
      )}
    </div>
  );
}
