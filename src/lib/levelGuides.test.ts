import { describe, expect, test } from "bun:test";
import {
  colourAt,
  DEFAULT_GUIDES,
  GUIDE_PRESETS,
  guideMasks,
  guideStyle,
  inkFor,
  MAX_COLOURS,
  MIN_COLOURS,
  normaliseHex,
  parseGuides,
  pdfGuides,
  presetOf,
  SWATCHES,
  withColourCount,
} from "./levelGuides";
import { readStoredGuides } from "../state/useLevelGuides";

describe("normaliseHex", () => {
  test("accepts six or three digits, with or without the #, in either case", () => {
    expect(normaliseHex("#3b82f6")).toBe("#3B82F6");
    expect(normaliseHex("3B82F6")).toBe("#3B82F6");
    expect(normaliseHex("  #abc ")).toBe("#AABBCC");
    expect(normaliseHex("f0f")).toBe("#FF00FF");
  });

  test("refuses anything else", () => {
    for (const bad of ["", "#", "#12", "#1234", "#12345", "#1234567", "#ggg", "blue", "rgb(1,2,3)"]) expect(normaliseHex(bad)).toBeNull();
  });
});

describe("colours by level", () => {
  const six = ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"];

  test("the colours start again from the first once the levels run past them", () => {
    expect([0, 5, 6, 7, 11, 12].map((l) => colourAt(six, l))).toEqual(["#111111", "#666666", "#111111", "#222222", "#666666", "#111111"]);
  });

  test("the number of colours can go down, or up with colours not yet used", () => {
    expect(withColourCount(six, 3)).toEqual(six.slice(0, 3));
    const more = withColourCount(DEFAULT_GUIDES.colours, 8);
    expect(more).toHaveLength(8);
    expect(more.slice(0, 6)).toEqual(DEFAULT_GUIDES.colours);
    expect(new Set(more).size).toBe(8);
  });

  test("the number of colours stays within its limits", () => {
    expect(withColourCount(six, 0)).toHaveLength(MIN_COLOURS);
    expect(withColourCount(six, 99)).toHaveLength(MAX_COLOURS);
  });

  test("the text on a colour is white on dark ones and near-black on light ones", () => {
    expect(inkFor("#3B82F6")).toBe("#FFFFFF");
    expect(inkFor("#1F2937")).toBe("#FFFFFF");
    expect(inkFor("#F0ABFC")).toBe("#111827");
    expect(inkFor("#FFFFFF")).toBe("#111827");
  });

  test("the presets and the picker offer only real colours, and the default is the first preset", () => {
    for (const c of [...SWATCHES, ...GUIDE_PRESETS.flatMap((p) => p.colours)]) expect(normaliseHex(c)).toBe(c);
    expect(SWATCHES).toHaveLength(24);
    expect(presetOf(DEFAULT_GUIDES.colours)?.id).toBe("vivid");
    expect(presetOf(["#111111", "#222222"])).toBeNull();
  });
});

describe("reading saved settings", () => {
  test("anything missing or wrong gets its default, and what is right is kept", () => {
    expect(parseGuides(null)).toEqual(DEFAULT_GUIDES);
    expect(parseGuides("nonsense")).toEqual(DEFAULT_GUIDES);
    expect(parseGuides({ show: "yes", thickness: "huge", indent: 3, tint: 1, print: null })).toEqual(DEFAULT_GUIDES);
    expect(parseGuides({ show: false, thickness: "thick", indent: "normal", tint: true, print: false })).toEqual({
      ...DEFAULT_GUIDES,
      show: false,
      thickness: "thick",
      indent: "normal",
      tint: true,
      print: false,
    });
  });

  test("colours are tidied, bad ones dropped, extras cut, and too few means the defaults", () => {
    expect(parseGuides({ colours: ["#abc", "3b82f6", "nope", 5] }).colours).toEqual(["#AABBCC", "#3B82F6"]);
    expect(parseGuides({ colours: ["#abc", "#abcdef", "#123456", "#654321", "#111111", "#222222", "#333333", "#444444", "#555555", "#666666"] }).colours).toHaveLength(MAX_COLOURS);
    expect(parseGuides({ colours: ["#abc"] }).colours).toEqual(DEFAULT_GUIDES.colours);
    expect(parseGuides({ colours: "red" }).colours).toEqual(DEFAULT_GUIDES.colours);
  });

  test("a saved copy is read back, and an unreadable or missing one gives the defaults", () => {
    const stored = { show: false, colours: ["#111111", "#222222", "#333333"], thickness: "medium", indent: "normal", tint: true, print: false } as const;
    expect(readStoredGuides({ getItem: () => JSON.stringify(stored) })).toEqual({ ...stored, colours: [...stored.colours] });
    expect(readStoredGuides({ getItem: () => "{not json" })).toEqual(DEFAULT_GUIDES);
    expect(readStoredGuides({ getItem: () => null })).toEqual(DEFAULT_GUIDES);
    expect(readStoredGuides(null)).toEqual(DEFAULT_GUIDES);
    expect(readStoredGuides({ getItem: () => { throw new Error("blocked"); } })).toEqual(DEFAULT_GUIDES);
  });
});

describe("how the table and the sheet use them", () => {
  test("off gives nothing; on gives the step and width of the chosen look", () => {
    expect(guideStyle({ ...DEFAULT_GUIDES, show: false })).toBeNull();
    expect(guideStyle(DEFAULT_GUIDES)).toEqual({ colours: DEFAULT_GUIDES.colours, step: 14, circle: 12, width: 1, tint: false });
    expect(guideStyle({ ...DEFAULT_GUIDES, indent: "normal", thickness: "thick", tint: true })).toMatchObject({ step: 22, circle: 16, width: 3, tint: true });
  });

  test("the sheet has them only while they are on and to be printed", () => {
    expect(pdfGuides(DEFAULT_GUIDES)).toMatchObject({ step: 8, circle: 6, width: 0.3 });
    expect(pdfGuides({ ...DEFAULT_GUIDES, print: false })).toBeNull();
    expect(pdfGuides({ ...DEFAULT_GUIDES, show: false })).toBeNull();
  });

  test("the defaults are tight, thin and vivid, with the group tint off", () => {
    expect(DEFAULT_GUIDES).toMatchObject({ show: true, indent: "tight", thickness: "thin", tint: false, print: true });
    expect(DEFAULT_GUIDES.colours).toHaveLength(6);
  });
});

describe("guideMasks", () => {
  /** The lines 0 to `upTo` as a string of 1 (runs) and 0 (does not), level 0 first. */
  const bits = (m: number, upTo: number) => Array.from({ length: upTo + 1 }, (_, c) => (m >> c) & 1).join("");

  test("a group's line runs while it has rows to come, and ends at its last row", () => {
    // group, group, activity, activity, group, activity
    const m = guideMasks([0, 1, 2, 2, 1, 2]);
    expect(bits(m[0]!, 0)).toBe("1"); // the top group has rows inside
    expect(bits(m[1]!, 1)).toBe("11"); // line 0 goes on (another group follows); this group has rows inside
    expect(bits(m[2]!, 1)).toBe("11"); // line 1 goes on to the second activity
    expect(bits(m[3]!, 1)).toBe("10"); // the last activity of its group: line 1 ends here, line 0 goes on
    expect(bits(m[4]!, 1)).toBe("01"); // the last group of the top group: line 0 ends at its elbow
    expect(bits(m[5]!, 1)).toBe("00"); // the very last row ends everything
  });

  test("a group with nothing after it has no line leaving it", () => {
    const m = guideMasks([0, 1, 1]);
    expect(bits(m[0]!, 0)).toBe("1");
    expect(bits(m[1]!, 1)).toBe("10"); // line 0 goes on to the next row; this group is closed, so no line below it
    expect(bits(m[2]!, 1)).toBe("00");
  });

  test("a line stays through the rows deeper than its elbow", () => {
    const m = guideMasks([0, 1, 2, 3, 1]);
    expect(bits(m[3]!, 2)).toBe("100"); // line 0 goes on to the last group; lines 1 and 2 have no more rows
    expect(bits(m[2]!, 2)).toBe("101"); // the group at 2 has a row inside it
  });

  test("levels beyond the 31 bits of a mask get no line instead of a wrong one", () => {
    const depths = Array.from({ length: 40 }, (_, i) => i);
    const m = guideMasks(depths);
    expect(m).toHaveLength(40);
    expect(m[39]! >>> 0).toBeLessThan(2 ** 31);
  });
});
