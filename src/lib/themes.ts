/**
 * The app's colour themes. Every screen is styled with Tailwind's `slate-*` neutrals, `white` and the app's own
 * `accent-*` colour, so a theme is just a different set of values for those CSS variables, set on <html> at run time.
 * Status colours (green, red, the blue bars) are the same in every theme so they always mean the same thing.
 */

export type Mode = "light" | "dark";

/** The eight colours a theme is written in; everything else is worked out from them. */
export interface Tokens {
  /** Main surfaces: panels, toolbars, inputs (light), or the page and chart (dark). */
  bg: string;
  /** Second surface: the page behind the panels (light), or panels and group rows (dark). */
  pn: string;
  /** Borders and rules that need to stand out. */
  bd: string;
  /** Grid lines and hover fills; quieter than `bd`. */
  gr: string;
  /** Body text. */
  tx: string;
  /** Secondary text. */
  mu: string;
  /** The accent: selected tab, focus rings, toggles that are on. */
  ac: string;
  /** A light (or, in dark mode, deep) wash of the accent, for selected rows. */
  sel: string;
}

export interface Palette {
  id: string;
  name: string;
  blurb: string;
  light: Tokens;
  dark: Tokens;
}

export const PALETTES = [
  {
    id: "clean",
    name: "Clean",
    blurb: "Crisp white with a clear blue. Dark is a softer grey.",
    light: { bg: "#ffffff", pn: "#f6f8fa", bd: "#d0d7de", gr: "#eaeef2", tx: "#1f2328", mu: "#59636e", ac: "#0969da", sel: "#ddf4ff" },
    dark: { bg: "#22272e", pn: "#2d333b", bd: "#444c56", gr: "#373e47", tx: "#cdd9e5", mu: "#95a2af", ac: "#5ca1f7", sel: "#2a3f5c" },
  },
  {
    id: "graphite",
    name: "Graphite",
    blurb: "Neutral greys with a teal accent. The bars are the only colour.",
    light: { bg: "#fcfcfc", pn: "#f2f2f3", bd: "#dcdcdf", gr: "#ebebed", tx: "#1c1c1e", mu: "#68686e", ac: "#0f766e", sel: "#d9f0ec" },
    dark: { bg: "#2a2a2e", pn: "#343439", bd: "#4c4c53", gr: "#3d3d43", tx: "#e4e4e7", mu: "#a4a4ac", ac: "#2dd4bf", sel: "#24463f" },
  },
  {
    id: "midnight",
    name: "Midnight",
    blurb: "Cool, blue-tinted light. Dark is a deep navy.",
    light: { bg: "#f7f9fd", pn: "#e9eff8", bd: "#c9d6ea", gr: "#dfe8f5", tx: "#14233d", mu: "#5a6b87", ac: "#2563eb", sel: "#d6e4ff" },
    dark: { bg: "#15233a", pn: "#1d2f4d", bd: "#345078", gr: "#26395a", tx: "#dbe6f7", mu: "#8fa4c4", ac: "#60a5fa", sel: "#28426b" },
  },
  {
    id: "sand",
    name: "Sand",
    blurb: "Warm paper tones with a terracotta accent. Dark is espresso.",
    light: { bg: "#fdfbf7", pn: "#f3ede2", bd: "#dfd4c0", gr: "#ece4d4", tx: "#2b2520", mu: "#74675a", ac: "#b4532a", sel: "#f7e1d3" },
    dark: { bg: "#2b2622", pn: "#362f2a", bd: "#514639", gr: "#40372f", tx: "#eee6da", mu: "#a89a88", ac: "#e8925f", sel: "#4a372b" },
  },
  {
    id: "sage",
    name: "Sage",
    blurb: "Soft green-grey, calm on long sessions. Dark is forest slate.",
    light: { bg: "#f8faf8", pn: "#e9efe9", bd: "#cdd9cd", gr: "#e0e8e0", tx: "#1d2b24", mu: "#566a5f", ac: "#3f7a63", sel: "#d8eadf" },
    dark: { bg: "#222b28", pn: "#2c3733", bd: "#43554e", gr: "#34423d", tx: "#dfeae4", mu: "#93a99f", ac: "#7fc4a4", sel: "#2f4a3f" },
  },
] as const satisfies readonly Palette[];

export type PaletteId = (typeof PALETTES)[number]["id"];
export const DEFAULT_PALETTE: PaletteId = "clean";

export const paletteById = (id: string): Palette => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

export const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Mixes two #rrggbb colours; t = 0 is `a`, t = 1 is `b`. */
export function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  let out = "#";
  for (let i = 0; i < 3; i++) out += Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, "0");
  return out;
}

/** The CSS variables that make up one theme in one mode. */
export function themeVars(id: string, mode: Mode): Record<string, string> {
  const t = paletteById(id)[mode];
  const white = "#ffffff";
  const black = "#000000";
  const vars: Record<string, string> = {};
  const set = (name: string, values: Record<number, string>) => {
    for (const s of STOPS) vars[`--color-${name}-${s}`] = values[s]!;
  };

  if (mode === "light") {
    // Panels are the lightest surface and the page sits slightly behind them; text runs from muted to full strength.
    vars["--color-white"] = t.bg;
    set("slate", {
      50: t.pn, 100: t.gr, 200: t.bd, 300: mix(t.bd, t.mu, 0.3), 400: mix(t.bd, t.mu, 0.65), 500: t.mu,
      600: mix(t.mu, t.tx, 0.35), 700: mix(t.mu, t.tx, 0.65), 800: mix(t.mu, t.tx, 0.85), 900: t.tx, 950: mix(t.tx, black, 0.35),
    });
    // Non-working time is a flat tint, a clear step darker than the grid lines (slate-100) so it doesn't blend into them.
    vars["--non-working"] = mix(t.gr, t.bd, 0.6);
    set("accent", {
      50: t.sel, 100: mix(t.sel, t.ac, 0.15), 200: mix(t.ac, white, 0.7), 300: mix(t.ac, white, 0.5), 400: mix(t.ac, white, 0.3),
      500: mix(t.ac, white, 0.12), 600: t.ac, 700: mix(t.ac, black, 0.15), 800: mix(t.ac, black, 0.3), 900: mix(t.ac, black, 0.45),
      950: mix(t.ac, black, 0.6),
    });
  } else {
    // Dark surfaces climb from the page (950) through panels (900) to grid lines (800) and borders (700).
    vars["--color-white"] = white;
    set("slate", {
      50: mix(t.tx, white, 0.6), 100: t.tx, 200: mix(t.mu, t.tx, 0.8), 300: mix(t.mu, t.tx, 0.5), 400: t.mu, 500: mix(t.bd, t.mu, 0.85),
      600: mix(t.bd, t.mu, 0.5), 700: t.bd, 800: t.gr, 900: t.pn, 950: t.bg,
    });
    // ...and in dark mode a step up from the page towards the grid lines (slate-800).
    vars["--non-working"] = mix(t.bg, t.gr, 0.9);
    set("accent", {
      50: mix(t.ac, white, 0.88), 100: mix(t.ac, white, 0.75), 200: mix(t.ac, white, 0.55), 300: mix(t.ac, white, 0.3), 400: t.ac,
      500: mix(t.sel, t.ac, 0.92), 600: mix(t.sel, t.ac, 0.8), 700: mix(t.sel, t.ac, 0.6), 800: mix(t.sel, t.ac, 0.4),
      900: mix(t.sel, t.ac, 0.2), 950: t.sel,
    });
  }
  return vars;
}

/** The parts of <html> a theme touches, so it can be applied (and tested) without a browser. */
export interface ThemeRoot {
  classList: { toggle(name: string, force: boolean): unknown };
  style: { setProperty(name: string, value: string): unknown };
}

export function applyTheme(root: ThemeRoot, id: string, mode: Mode) {
  root.classList.toggle("dark", mode === "dark");
  for (const [name, value] of Object.entries(themeVars(id, mode))) root.style.setProperty(name, value);
}

export interface ThemeChoice {
  palette: PaletteId;
  mode: Mode;
}

/** Kept as it was before there were several themes, so existing visitors keep their light / dark choice. */
export const MODE_KEY = "xerview-theme";
export const PALETTE_KEY = "xerview-palette";

/** Reads the saved theme; anything missing or unrecognised falls back to the default palette and the system's mode. */
export function readStoredTheme(storage: Pick<Storage, "getItem"> | null, prefersDark: boolean): ThemeChoice {
  let mode: Mode = prefersDark ? "dark" : "light";
  let palette: PaletteId = DEFAULT_PALETTE;
  try {
    const m = storage?.getItem(MODE_KEY);
    if (m === "light" || m === "dark") mode = m;
    const p = storage?.getItem(PALETTE_KEY);
    const found = PALETTES.find((x) => x.id === p);
    if (found) palette = found.id;
  } catch {
    // storage blocked: use the defaults
  }
  return { palette, mode };
}

export function writeStoredTheme(storage: Pick<Storage, "setItem"> | null, choice: ThemeChoice) {
  try {
    storage?.setItem(MODE_KEY, choice.mode);
    storage?.setItem(PALETTE_KEY, choice.palette);
  } catch {
    // storage full or blocked: the theme still applies for this visit
  }
}

const browserStorage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

export function loadTheme(): ThemeChoice {
  return readStoredTheme(browserStorage(), window.matchMedia("(prefers-color-scheme: dark)").matches);
}

/** Applies the saved theme straight away, before React renders, so there is no flash of the wrong colours. */
export function applyStoredTheme() {
  const { palette, mode } = loadTheme();
  applyTheme(document.documentElement, palette, mode);
}

export const saveTheme = (choice: ThemeChoice) => writeStoredTheme(browserStorage(), choice);
