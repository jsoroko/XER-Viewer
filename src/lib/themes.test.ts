import { describe, expect, test } from "bun:test";
import {
  applyTheme,
  DEFAULT_PALETTE,
  MODE_KEY,
  PALETTE_KEY,
  PALETTES,
  paletteById,
  readStoredTheme,
  STOPS,
  themeVars,
  writeStoredTheme,
  mix,
  type Mode,
} from "./themes";

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => 0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 1)) + 0.0722 * lin(channel(hex, 2));
/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const MODES: Mode[] = ["light", "dark"];
const cases = PALETTES.flatMap((p) => MODES.map((mode) => ({ id: p.id, mode, name: `${p.name} ${mode}` })));

describe("the palettes", () => {
  test("there are five, each with a distinct id and name", () => {
    expect(PALETTES).toHaveLength(5);
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(5);
    expect(new Set(PALETTES.map((p) => p.name)).size).toBe(5);
    expect(PALETTES.some((p) => p.id === DEFAULT_PALETTE)).toBe(true);
  });

  test("the five palettes look different from each other in both modes", () => {
    for (const mode of MODES) {
      const looks = PALETTES.map((p) => `${p[mode].bg}${p[mode].pn}${p[mode].ac}`);
      expect(new Set(looks).size).toBe(5);
    }
  });

  test("an unknown id gives the first palette instead of failing", () => {
    expect(paletteById("nope").id).toBe(PALETTES[0].id);
  });
});

describe("the variables a theme sets", () => {
  test.each(cases)("$name: every slate and accent stop is a #rrggbb colour, plus white", ({ id, mode }) => {
    const vars = themeVars(id, mode);
    for (const s of STOPS) {
      expect(vars[`--color-slate-${s}`]).toMatch(/^#[0-9a-f]{6}$/);
      expect(vars[`--color-accent-${s}`]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(vars["--color-white"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(vars)).toHaveLength(STOPS.length * 2 + 1);
  });

  test.each(cases)("$name: slate and accent steps go steadily from light to dark (or dark to light in dark mode)", ({ id, mode }) => {
    const vars = themeVars(id, mode);
    for (const ramp of ["slate", "accent"]) {
      const lum = STOPS.map((s) => luminance(vars[`--color-${ramp}-${s}`]!));
      for (let i = 1; i < lum.length; i++) {
        // 50 is the lightest stop in every ramp and 950 the darkest, in both modes
        expect(lum[i]!).toBeLessThan(lum[i - 1]!);
      }
    }
  });

  test("white is the panel colour in light mode and stays white in dark mode", () => {
    for (const p of PALETTES) {
      expect(themeVars(p.id, "light")["--color-white"]).toBe(p.light.bg);
      expect(themeVars(p.id, "dark")["--color-white"]).toBe("#ffffff");
    }
  });
});

describe("legibility", () => {
  // Pairs are written the way the app uses them: light text is slate-900 on white / slate-50, muted is slate-500 and so on.
  test.each(cases.filter((c) => c.mode === "light"))("$name: text, muted text, accent and rules are readable", ({ id }) => {
    const v = themeVars(id, "light");
    const white = v["--color-white"]!;
    const page = v["--color-slate-50"]!;
    const s = (n: number) => v[`--color-slate-${n}`]!;
    const a = (n: number) => v[`--color-accent-${n}`]!;
    for (const surface of [white, page]) {
      expect(contrast(s(900), surface)).toBeGreaterThanOrEqual(10); // body text
      expect(contrast(s(500), surface)).toBeGreaterThanOrEqual(4.5); // secondary text
    }
    expect(contrast(a(600), white)).toBeGreaterThanOrEqual(4.5); // active tab, links
    expect(contrast(a(700), a(50))).toBeGreaterThanOrEqual(4.5); // text on a selected chip
    expect(contrast(s(200), white)).toBeGreaterThanOrEqual(1.3); // borders
    expect(contrast(s(100), white)).toBeGreaterThanOrEqual(1.1); // grid lines
    expect(contrast(a(50), white)).toBeGreaterThanOrEqual(1.05); // a selected row is visibly tinted
  });

  test.each(cases.filter((c) => c.mode === "dark"))("$name: text, muted text, accent and rules are readable", ({ id }) => {
    const v = themeVars(id, "dark");
    const s = (n: number) => v[`--color-slate-${n}`]!;
    const a = (n: number) => v[`--color-accent-${n}`]!;
    for (const surface of [s(950), s(900)]) {
      expect(contrast(s(100), surface)).toBeGreaterThanOrEqual(7); // body text
      expect(contrast(s(400), surface)).toBeGreaterThanOrEqual(4.5); // secondary text
      expect(contrast(a(400), surface)).toBeGreaterThanOrEqual(4.5); // active tab, links
    }
    expect(contrast(a(300), a(950))).toBeGreaterThanOrEqual(4.5); // text on a selected chip
    expect(contrast(s(700), s(900))).toBeGreaterThanOrEqual(1.3); // borders
    // the reason dark mode was lightened: grid lines have to show against the chart
    expect(contrast(s(800), s(950))).toBeGreaterThanOrEqual(1.25);
    expect(contrast(a(950), s(950))).toBeGreaterThanOrEqual(1.2); // a selected row is visibly tinted
  });

  test("the contrast helper agrees with the known extremes", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBe(1);
  });
});

describe("applyTheme", () => {
  const fakeRoot = () => {
    const state = { dark: null as boolean | null, vars: new Map<string, string>() };
    return {
      state,
      root: {
        classList: { toggle: (_: string, force: boolean) => void (state.dark = force) },
        style: { setProperty: (n: string, v: string) => void state.vars.set(n, v) },
      },
    };
  };

  test("sets the variables and the dark class for the chosen mode", () => {
    const light = fakeRoot();
    applyTheme(light.root, "sand", "light");
    expect(light.state.dark).toBe(false);
    expect(light.state.vars.get("--color-accent-600")).toBe(paletteById("sand").light.ac);

    const dark = fakeRoot();
    applyTheme(dark.root, "sand", "dark");
    expect(dark.state.dark).toBe(true);
    expect(dark.state.vars.get("--color-slate-950")).toBe(paletteById("sand").dark.bg);
  });

  test("switching palette changes the variables that were set before", () => {
    const { root, state } = fakeRoot();
    applyTheme(root, "clean", "dark");
    const before = state.vars.get("--color-slate-900");
    applyTheme(root, "sage", "dark");
    expect(state.vars.get("--color-slate-900")).not.toBe(before);
    expect(state.vars.get("--color-slate-900")).toBe(paletteById("sage").dark.pn);
  });
});

describe("remembering the choice", () => {
  const store = (items: Record<string, string>) => ({ getItem: (k: string) => items[k] ?? null });

  test("reads both saved settings", () => {
    expect(readStoredTheme(store({ [MODE_KEY]: "dark", [PALETTE_KEY]: "sage" }), false)).toEqual({ palette: "sage", mode: "dark" });
    expect(readStoredTheme(store({ [MODE_KEY]: "light", [PALETTE_KEY]: "midnight" }), true)).toEqual({ palette: "midnight", mode: "light" });
  });

  test("with nothing saved it uses the default palette and follows the system's light / dark setting", () => {
    expect(readStoredTheme(store({}), true)).toEqual({ palette: DEFAULT_PALETTE, mode: "dark" });
    expect(readStoredTheme(store({}), false)).toEqual({ palette: DEFAULT_PALETTE, mode: "light" });
  });

  test("visitors from before there were palettes keep their saved light / dark choice", () => {
    expect(readStoredTheme(store({ [MODE_KEY]: "dark" }), false)).toEqual({ palette: DEFAULT_PALETTE, mode: "dark" });
  });

  test("garbled values are ignored one at a time", () => {
    expect(readStoredTheme(store({ [MODE_KEY]: "purple", [PALETTE_KEY]: "sage" }), true)).toEqual({ palette: "sage", mode: "dark" });
    expect(readStoredTheme(store({ [MODE_KEY]: "dark", [PALETTE_KEY]: "neon" }), false)).toEqual({ palette: DEFAULT_PALETTE, mode: "dark" });
  });

  test("blocked storage gives the defaults instead of an error", () => {
    expect(readStoredTheme(null, false)).toEqual({ palette: DEFAULT_PALETTE, mode: "light" });
    const blocked = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(readStoredTheme(blocked, true)).toEqual({ palette: DEFAULT_PALETTE, mode: "dark" });
  });

  test("what is written is what is read back", () => {
    const items: Record<string, string> = {};
    const storage = { getItem: (k: string) => items[k] ?? null, setItem: (k: string, v: string) => void (items[k] = v) };
    writeStoredTheme(storage, { palette: "sand", mode: "dark" });
    expect(readStoredTheme(storage, false)).toEqual({ palette: "sand", mode: "dark" });
  });

  test("a full or blocked store doesn't throw when saving", () => {
    const full = {
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    expect(() => writeStoredTheme(full, { palette: "clean", mode: "light" })).not.toThrow();
    expect(() => writeStoredTheme(null, { palette: "clean", mode: "light" })).not.toThrow();
  });
});

describe("mix", () => {
  test("blends two colours", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#ff0000", "#0000ff", 0.25)).toBe("#bf0040");
  });
});
