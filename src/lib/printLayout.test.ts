import { describe, expect, test } from "bun:test";
import { DEFAULT_LAYOUT, PAPER_SIZES, PAPERS, parseLayout } from "./printLayout";

describe("the papers", () => {
  test("are landscape, and each is the next one up in size", () => {
    for (const p of PAPER_SIZES) expect(PAPERS[p].w).toBeGreaterThan(PAPERS[p].h);
    expect(PAPERS.a3.w).toBeCloseTo(PAPERS.a4.h * 2, 0);
    expect(PAPERS.a2.w).toBeCloseTo(PAPERS.a3.h * 2, 0);
  });
  test("A3 is the default, as it always was", () => {
    expect(DEFAULT_LAYOUT).toEqual({ paper: "a3", text: "wrap", labels: "smart" });
  });
});

describe("parseLayout", () => {
  test("gives the defaults for anything that is not a layout", () => {
    for (const raw of [null, undefined, 3, "a2", [], {}]) expect(parseLayout(raw)).toEqual(DEFAULT_LAYOUT);
  });
  test("keeps what is right and fixes only what is wrong", () => {
    expect(parseLayout({ paper: "a2", text: "one-line", labels: "id" })).toEqual({ paper: "a2", text: "one-line", labels: "id" });
    expect(parseLayout({ paper: "a1", text: "one-line", labels: 7 })).toEqual({ paper: "a3", text: "one-line", labels: "smart" });
  });
  test("returns a copy, so changing it does not change the defaults", () => {
    const l = parseLayout(null);
    l.paper = "a2";
    expect(DEFAULT_LAYOUT.paper).toBe("a3");
  });
});
