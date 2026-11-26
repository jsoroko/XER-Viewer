/**
 * The level guides: a tree down the left of the table that shows which WBS group each row sits under. Each group is a
 * coloured circle holding its expand arrow; a line in the circle's colour runs down from it and each row inside the group
 * branches off it with an elbow. The colour of a level is chosen in Settings; once the levels run past the colours there
 * are, they start again from the first. Everything here is plain data and arithmetic, so it can be tested without a page.
 */

export type GuideThickness = "thin" | "medium" | "thick";
export type GuideIndent = "tight" | "normal";

export interface LevelGuides {
  /** Draw the lines (and use the chosen indent). Off gives the table as it was before guides. */
  show: boolean;
  /** One colour per level, as `#RRGGBB`. The levels below the last one use them again from the top. */
  colours: string[];
  thickness: GuideThickness;
  indent: GuideIndent;
  /** Also tint each group row in its level's colour, like a P6 grouping band. */
  tint: boolean;
  /** Also draw the guides (and the tint) in the PDF. */
  print: boolean;
}

export const MIN_COLOURS = 2;
export const MAX_COLOURS = 8;

/** Pixels each level moves a row to the right on screen, and the width of a group's circle. */
export const INDENT_STEP: Record<GuideIndent, number> = { tight: 14, normal: 22 };
export const CIRCLE_SIZE: Record<GuideIndent, number> = { tight: 12, normal: 16 };
/** The step when the guides are off: how the table was indented before there were guides. */
export const PLAIN_INDENT_STEP = 14;
/** Pixels wide on screen. */
export const LINE_WIDTH: Record<GuideThickness, number> = { thin: 1, medium: 2, thick: 3 };
/** The same, in the PDF: points each level moves a row, the width of a circle, and points wide a line is. */
export const PDF_INDENT_STEP: Record<GuideIndent, number> = { tight: 8, normal: 10 };
export const PDF_CIRCLE_SIZE: Record<GuideIndent, number> = { tight: 6, normal: 7 };
export const PDF_PLAIN_INDENT_STEP = 7;
export const PDF_LINE_WIDTH: Record<GuideThickness, number> = { thin: 0.3, medium: 0.6, thick: 0.9 };

export interface GuidePreset {
  id: string;
  name: string;
  colours: readonly string[];
}

/** Green, amber and red are left out of the default, since they mark new, modified and removed activities. */
export const GUIDE_PRESETS: readonly GuidePreset[] = [
  { id: "vivid", name: "Vivid", colours: ["#3B82F6", "#D946EF", "#06B6D4", "#8B5CF6", "#EC4899", "#64748B"] },
  { id: "muted", name: "Muted", colours: ["#64748B", "#8B7FB8", "#B98AA6", "#6AA3B8", "#9A8F7A", "#7D8AA6"] },
  { id: "pastel", name: "Pastel", colours: ["#93C5FD", "#F0ABFC", "#67E8F9", "#C4B5FD", "#F9A8D4", "#CBD5E1"] },
  { id: "greys", name: "Greys", colours: ["#1F2937", "#4B5563", "#6B7280", "#9CA3AF", "#374151", "#94A3B8"] },
];

/** What the picker offers, besides typing a code: three rows of eight. */
export const SWATCHES: readonly string[] = [
  "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F472B6", "#06B6D4",
  "#0EA5E9", "#38BDF8", "#64748B", "#475569", "#94A3B8", "#0F766E", "#14B8A6", "#84CC16",
  "#22C55E", "#16A34A", "#EAB308", "#F59E0B", "#F97316", "#EF4444", "#B91C1C", "#1F2937",
];

export const DEFAULT_GUIDES: LevelGuides = {
  show: true,
  colours: [...GUIDE_PRESETS[0]!.colours],
  thickness: "thin",
  indent: "tight",
  tint: false,
  print: true,
};

/** `#RRGGBB` in capitals from `#RGB`, `RGB`, `#RRGGBB` or `RRGGBB` in either case; null if it is not a colour code. */
export function normaliseHex(text: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text.trim());
  if (!m) return null;
  const digits = m[1]!.length === 3 ? [...m[1]!].map((d) => d + d).join("") : m[1]!;
  return `#${digits.toUpperCase()}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** White or near-black, whichever reads better as text on this colour. */
export function inkFor(hex: string): "#FFFFFF" | "#111827" {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#111827" : "#FFFFFF";
}

/** The colour of a level (0 is the first), going round again once the levels outnumber the colours. */
export const colourAt = (colours: readonly string[], level: number) => colours[level % colours.length]!;

/** `colours` made `count` long: shortened, or lengthened with colours from the default set that are not in use yet. */
export function withColourCount(colours: readonly string[], count: number): string[] {
  const n = Math.min(MAX_COLOURS, Math.max(MIN_COLOURS, count));
  if (n <= colours.length) return colours.slice(0, n);
  const spare = [...GUIDE_PRESETS[0]!.colours, "#0EA5E9", "#6366F1"].filter((c) => !colours.includes(c));
  return [...colours, ...spare].slice(0, n);
}

/** The preset these colours are exactly, if any. */
export const presetOf = (colours: readonly string[]) =>
  GUIDE_PRESETS.find((p) => p.colours.length === colours.length && p.colours.every((c, i) => c === colours[i])) ?? null;

const THICKNESSES: readonly GuideThickness[] = ["thin", "medium", "thick"];
const INDENTS: readonly GuideIndent[] = ["tight", "normal"];

/** Reads saved settings of any shape: whatever is missing or wrong gets its default. */
export function parseGuides(raw: unknown): LevelGuides {
  const d = DEFAULT_GUIDES;
  if (typeof raw !== "object" || raw === null) return { ...d, colours: [...d.colours] };
  const o = raw as Record<string, unknown>;
  const colours = Array.isArray(o.colours)
    ? o.colours.map((c) => (typeof c === "string" ? normaliseHex(c) : null)).filter((c): c is string => c !== null).slice(0, MAX_COLOURS)
    : [];
  return {
    show: typeof o.show === "boolean" ? o.show : d.show,
    colours: colours.length >= MIN_COLOURS ? colours : [...d.colours],
    thickness: THICKNESSES.find((t) => t === o.thickness) ?? d.thickness,
    indent: INDENTS.find((i) => i === o.indent) ?? d.indent,
    tint: typeof o.tint === "boolean" ? o.tint : d.tint,
    print: typeof o.print === "boolean" ? o.print : d.print,
  };
}

/** The guides as the table and the PDF use them, or null while they are off. */
export interface GuideStyle {
  colours: readonly string[];
  step: number;
  /** Pixels across a group's circle. */
  circle: number;
  width: number;
  tint: boolean;
}

export function guideStyle(g: LevelGuides): GuideStyle | null {
  return g.show ? { colours: g.colours, step: INDENT_STEP[g.indent], circle: CIRCLE_SIZE[g.indent], width: LINE_WIDTH[g.thickness], tint: g.tint } : null;
}

/** The same, for the sheet: null while they are off, or not to be printed. */
export interface PdfGuides {
  colours: readonly string[];
  /** Points each level moves a row right. */
  step: number;
  /** Points across a group's circle. */
  circle: number;
  /** Points wide. */
  width: number;
  tint: boolean;
}

export function pdfGuides(g: LevelGuides): PdfGuides | null {
  return g.show && g.print ? { colours: g.colours, step: PDF_INDENT_STEP[g.indent], circle: PDF_CIRCLE_SIZE[g.indent], width: PDF_LINE_WIDTH[g.thickness], tint: g.tint } : null;
}

/** The levels that can have a line: bit `c` of a mask is the line of level `c`, and there are 31 bits. */
export const MAX_GUIDE_LEVELS = 31;

/**
 * For each row of the table (given by its depth, in order), which lines run through it. Bit `c` is set when the group at
 * level `c` has another row at level `c + 1` still to come, so the line of level `c` carries on down past this row; when it
 * is clear (and the row is at level `c + 1`) the row is the last in that group and its line ends at the row's elbow.
 * For a group row, bit `depth` says whether it has rows inside it, and so a line to draw below its circle.
 */
export function guideMasks(depths: ArrayLike<number>): Int32Array {
  const masks = new Int32Array(depths.length);
  // more[k]: looking down from here, the first row at depth k or less is at depth k exactly.
  const more: boolean[] = [];
  for (let i = depths.length - 1; i >= 0; i--) {
    const d = depths[i]!;
    let m = 0;
    for (let c = 0; c <= d && c < MAX_GUIDE_LEVELS; c++) if (more[c + 1]) m |= 1 << c;
    masks[i] = m;
    more[d] = true;
    for (let k = d + 1; k < more.length; k++) more[k] = false;
  }
  return masks;
}
