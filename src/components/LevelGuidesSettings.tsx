import { useState, type ReactNode } from "react";
import { LuMinus, LuPlus } from "react-icons/lu";
import {
  GUIDE_PRESETS,
  inkFor,
  MAX_COLOURS,
  MIN_COLOURS,
  normaliseHex,
  presetOf,
  SWATCHES,
  withColourCount,
  type GuideIndent,
  type GuideThickness,
} from "../lib/levelGuides";
import { resetLevelGuides, useLevelGuides } from "../state/useLevelGuides";
import { Segmented, Switch } from "./ui";

const smallButton =
  "inline-flex h-6 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

const Heading = ({ children }: { children: ReactNode }) => <div className="mb-1 mt-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">{children}</div>;

/** The colour picker for one level: the swatches, and a box for any colour code. */
function Picker({ current, onPick }: { current: string; onPick: (hex: string) => void }) {
  const [draft, setDraft] = useState(current);
  const [bad, setBad] = useState(false);
  const apply = () => {
    const hex = normaliseHex(draft);
    setBad(hex === null);
    if (hex) onPick(hex);
  };
  return (
    <div className="my-1 ml-14 rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
      <div className="grid grid-cols-8 gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            title={c}
            onClick={() => {
              setDraft(c);
              setBad(false);
              onPick(c);
            }}
            className={`aspect-square rounded border border-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 dark:border-white/10 ${current === c ? "outline outline-2 outline-offset-1 outline-slate-900 dark:outline-slate-100" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="text"
          aria-label="Colour code"
          aria-invalid={bad || undefined}
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          className="h-6 w-24 rounded-md border border-slate-300 bg-white px-2 font-mono text-xs text-slate-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <button type="button" className={smallButton} onClick={apply}>
          Apply
        </button>
      </div>
      {bad && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">Enter a colour like #3B82F6.</p>}
      <p className="mt-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">Green, amber and red mark new, modified and removed activities.</p>
    </div>
  );
}

const THICKNESS: Array<{ id: GuideThickness; label: string }> = [
  { id: "thin", label: "Thin" },
  { id: "medium", label: "Medium" },
  { id: "thick", label: "Thick" },
];
const INDENT: Array<{ id: GuideIndent; label: string }> = [
  { id: "tight", label: "Compact" },
  { id: "normal", label: "Normal" },
];

/**
 * The "Level guides" part of the Settings panel: whether the lines are drawn, the colour of each level (shown as the
 * colour code on that colour), how many colours there are before they start again, presets, the look of the lines, whether
 * group rows are tinted, and whether it all goes in the PDF.
 */
export function LevelGuidesSettings() {
  const [guides, set] = useLevelGuides();
  const [editing, setEditing] = useState<number | null>(null);
  const preset = presetOf(guides.colours);
  const setColour = (i: number, hex: string) => set({ ...guides, colours: guides.colours.map((c, k) => (k === i ? hex : c)) });
  const setCount = (n: number) => {
    set({ ...guides, colours: withColourCount(guides.colours, n) });
    setEditing(null);
  };

  return (
    <div>
      <Switch checked={guides.show} onChange={(show) => set({ ...guides, show })} label="Show guides in the table" title="Show the groups as coloured circles with a line down each, and branch the rows off it" />

      <Heading>Colour for each level</Heading>
      <div>
        {guides.colours.map((c, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 py-0.5">
              <span className="w-12 text-xs text-slate-600 dark:text-slate-400">Level {i + 1}</span>
              <button
                type="button"
                aria-expanded={editing === i}
                aria-label={`Level ${i + 1} colour ${c}. Change it`}
                title="Change this colour"
                onClick={() => setEditing(editing === i ? null : i)}
                className={`h-6 min-w-24 rounded-md border border-black/10 px-2 font-mono text-[11px] font-medium tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 dark:border-white/10 ${editing === i ? "outline outline-2 outline-offset-1 outline-slate-900 dark:outline-slate-100" : ""}`}
                style={{ backgroundColor: c, color: inkFor(c) }}
              >
                {c}
              </button>
            </div>
            {editing === i && <Picker key={c} current={c} onPick={(hex) => setColour(i, hex)} />}
          </div>
        ))}
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 py-0.5 text-xs text-slate-600 dark:text-slate-400">
        <span>Number of colours</span>
        <span className="inline-flex items-center gap-2">
          <button type="button" className={`${smallButton} w-6 px-0`} aria-label="Fewer colours" onClick={() => setCount(guides.colours.length - 1)}>
            <LuMinus size={12} aria-hidden />
          </button>
          <b className="w-3 text-center font-medium text-slate-900 dark:text-slate-100">{guides.colours.length}</b>
          <button type="button" className={`${smallButton} w-6 px-0`} aria-label="More colours" onClick={() => setCount(guides.colours.length + 1)}>
            <LuPlus size={12} aria-hidden />
          </button>
        </span>
      </div>
      <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
        {guides.colours.length >= MAX_COLOURS ? "The most there can be. " : guides.colours.length <= MIN_COLOURS ? "The fewest there can be. " : ""}Level {guides.colours.length + 1} uses level 1's colour again, and so on.
      </p>

      <Heading>Presets</Heading>
      <div className="flex flex-wrap gap-1.5">
        {GUIDE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={preset?.id === p.id}
            onClick={() => {
              set({ ...guides, colours: [...p.colours] });
              setEditing(null);
            }}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 " +
              (preset?.id === p.id
                ? "border-transparent bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-300"
                : "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800")
            }
          >
            <span aria-hidden className="flex gap-0.5">
              {p.colours.slice(0, 4).map((c) => (
                <span key={c} className="size-2 rounded-sm" style={{ backgroundColor: c }} />
              ))}
            </span>
            {p.name}
          </button>
        ))}
      </div>

      <Heading>Circles and lines</Heading>
      <Segmented label="Thickness" value={guides.thickness} options={THICKNESS} onChange={(thickness) => set({ ...guides, thickness })} />
      <Segmented label="Size" value={guides.indent} options={INDENT} onChange={(indent) => set({ ...guides, indent })} />
      <div className="mt-1.5 space-y-1.5">
        <Switch checked={guides.tint} onChange={(tint) => set({ ...guides, tint })} label="Tint group rows" title="Shade each group row in its level's colour, like a grouping band in P6" />
        <Switch checked={guides.print} onChange={(print) => set({ ...guides, print })} label="Print in the PDF" title="Draw the guides (and the tint) on the PDF too" />
      </div>

      <button type="button" className="mt-3 text-xs text-accent-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:text-accent-400" onClick={() => {
        resetLevelGuides();
        setEditing(null);
      }}>
        Reset to defaults
      </button>
    </div>
  );
}
